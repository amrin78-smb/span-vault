// SpanVault - Aggregator Worker
// Runs every minute to detect congestion, score site health,
// and resolve stale alerts

process.env.SPANVAULT_SERVICE = 'aggregator';

import { loadConfig } from '../../config/loader';
import { query, testConnection } from '../../db';
import { logger } from '../../utils/logger';

const config = loadConfig();

// Congestion detection:
// If utilization > threshold AND latency has increased significantly vs the last 5 minutes
async function detectCongestion(): Promise<void> {
  try {
    // Find interfaces with high utilization in the last 2 minutes
    const highUtil = await query<{
      interface_id: number;
      device_id:    number;
      hostname:     string;
      if_name:      string;
      avg_util:     number;
      avg_in_bps:   number;
      avg_out_bps:  number;
    }>(
      `SELECT
         m.interface_id,
         d.id    AS device_id,
         d.hostname,
         i.name  AS if_name,
         AVG(GREATEST(m.util_in_pct, m.util_out_pct)) AS avg_util,
         AVG(m.in_bps)  AS avg_in_bps,
         AVG(m.out_bps) AS avg_out_bps
       FROM interface_metrics m
       JOIN interfaces i ON i.id = m.interface_id
       JOIN devices    d ON d.id = i.device_id
       WHERE m.time > NOW() - INTERVAL '2 minutes'
       GROUP BY m.interface_id, d.id, d.hostname, i.name
       HAVING AVG(GREATEST(m.util_in_pct, m.util_out_pct)) >= $1`,
      [config.thresholds.utilizationCriticalPercent]
    );

    for (const iface of highUtil) {
      // Check if ICMP latency for the same device has increased
      const latencyData = await query<{ recent_avg: number; prev_avg: number }>(
        `SELECT
           AVG(latency_ms) FILTER (WHERE time > NOW() - INTERVAL '2 minutes') AS recent_avg,
           AVG(latency_ms) FILTER (WHERE time BETWEEN NOW() - INTERVAL '7 minutes' AND NOW() - INTERVAL '2 minutes') AS prev_avg
         FROM icmp_metrics im
         JOIN icmp_targets it ON it.id = im.target_id
         WHERE it.device_id = $1`,
        [iface.device_id]
      );

      const recentLatency = latencyData[0]?.recent_avg ?? 0;
      const prevLatency   = latencyData[0]?.prev_avg   ?? 0;

      // Congestion: utilization critical AND latency increased by > 20%
      if (recentLatency > 0 && prevLatency > 0 && recentLatency > prevLatency * 1.2) {
        const msg = `Congestion detected on ${iface.hostname} ${iface.if_name}: ` +
          `util=${iface.avg_util.toFixed(1)}%, latency ${prevLatency.toFixed(0)}ms -> ${recentLatency.toFixed(0)}ms`;

        await query(
          `INSERT INTO alerts (device_id, alert_type, severity, message)
           SELECT $1, 'congestion', 'critical', $2
           WHERE NOT EXISTS (
             SELECT 1 FROM alerts
             WHERE device_id = $1 AND alert_type = 'congestion' AND resolved = FALSE
           )`,
          [iface.device_id, msg]
        );

        logger.warn('Congestion detected', {
          device: iface.hostname, interface: iface.if_name,
          utilization: iface.avg_util.toFixed(1),
          latencyNow: recentLatency.toFixed(0),
          latencyBefore: prevLatency.toFixed(0),
        });
      }
    }
  } catch (err) {
    logger.error('Congestion detection error', { error: (err as Error).message });
  }
}

// Auto-resolve alerts where the condition has cleared
async function resolveStaleAlerts(): Promise<void> {
  try {
    // Resolve 'down' alerts where device is now up
    await query(
      `UPDATE alerts SET resolved = TRUE, resolved_at = NOW()
       WHERE alert_type = 'down' AND resolved = FALSE
         AND device_id IN (
           SELECT id FROM devices WHERE status = 'up'
         )`
    );

    // Resolve high_utilization alerts where utilization has dropped below warning threshold
    const highUtilAlerts = await query<{ id: number; device_id: number }>(
      `SELECT id, device_id FROM alerts
       WHERE alert_type = 'high_utilization' AND resolved = FALSE`
    );

    for (const alert of highUtilAlerts) {
      const recent = await query<{ avg_util: number }>(
        `SELECT AVG(GREATEST(m.util_in_pct, m.util_out_pct)) AS avg_util
         FROM interface_metrics m
         JOIN interfaces i ON i.id = m.interface_id
         WHERE i.device_id = $1 AND m.time > NOW() - INTERVAL '3 minutes'`,
        [alert.device_id]
      );

      if ((recent[0]?.avg_util ?? 100) < config.thresholds.utilizationWarningPercent) {
        await query(
          `UPDATE alerts SET resolved = TRUE, resolved_at = NOW() WHERE id = $1`,
          [alert.id]
        );
      }
    }
  } catch (err) {
    logger.error('Alert resolution error', { error: (err as Error).message });
  }
}

// Score site health: combines ICMP and SNMP data into a 0-100 score per site
async function scoreSiteHealth(): Promise<void> {
  try {
    const sites = await query<{ id: number; name: string }>(
      `SELECT id, name FROM sites`
    );

    for (const site of sites) {
      // ICMP score: average availability of all targets in this site
      const icmpData = await query<{ up_pct: number }>(
        `SELECT
           100.0 * COUNT(*) FILTER (WHERE im.status = 'up') / NULLIF(COUNT(*), 0) AS up_pct
         FROM icmp_metrics im
         JOIN icmp_targets it ON it.id = im.target_id
         JOIN devices d ON d.id = it.device_id
         WHERE d.site_id = $1 AND im.time > NOW() - INTERVAL '5 minutes'`,
        [site.id]
      );

      // Utilization score: 100 - avg_utilization (penalty for high util)
      const utilData = await query<{ avg_util: number }>(
        `SELECT AVG(GREATEST(m.util_in_pct, m.util_out_pct)) AS avg_util
         FROM interface_metrics m
         JOIN interfaces i ON i.id = m.interface_id
         JOIN devices d ON d.id = i.device_id
         WHERE d.site_id = $1 AND m.time > NOW() - INTERVAL '5 minutes'`,
        [site.id]
      );

      const icmpScore = Number(icmpData[0]?.up_pct ?? 100);
      const utilScore = Number(100 - Math.min(Number(utilData[0]?.avg_util ?? 0), 100));
      const health    = Math.round((icmpScore * 0.6) + (utilScore * 0.4));

      logger.debug('Site health score', {
        site: site.name, health, icmpScore: icmpScore.toFixed(1), utilScore: utilScore.toFixed(1),
      });
    }
  } catch (err) {
    logger.error('Site health scoring error', { error: (err as Error).message });
  }
}

async function runAggregator(): Promise<void> {
  await testConnection();
  logger.info('Aggregator Worker started');

  const run = async () => {
    await Promise.allSettled([
      detectCongestion(),
      resolveStaleAlerts(),
      scoreSiteHealth(),
    ]);
  };

  await run();
  setInterval(run, 60 * 1000);
}

runAggregator().catch((err) => {
  logger.error('Aggregator Worker crashed', { error: err.message });
  process.exit(1);
});
