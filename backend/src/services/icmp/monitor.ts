// SpanVault - ICMP Monitor Service
// Uses 'ping' npm package (pure JS, no native compilation required)
// Supports separate intervals for critical vs normal priority targets

process.env.SPANVAULT_SERVICE = 'icmp-monitor';

import * as ping from 'ping';
import { loadConfig } from '../../config/loader';
import { query, testConnection } from '../../db';
import { logger } from '../../utils/logger';

const config = loadConfig();

interface IcmpTarget {
  id:         number;
  ip_address: string;
  label:      string;
  priority:   string;
  device_id:  number | null;
}

async function pingHost(ipAddress: string, count: number): Promise<number[]> {
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const res = await ping.promise.probe(ipAddress, {
        timeout: Math.ceil(config.icmp.timeoutMs / 1000),
        extra:   ['-n', '1'],
      });
      results.push((res.alive && res.time !== 'unknown') ? Number(res.time) : -1);
    } catch { results.push(-1); }
    if (i < count - 1) await new Promise((r) => setTimeout(r, 200));
  }
  return results;
}

async function checkTarget(target: IcmpTarget): Promise<void> {
  try {
    const rtts       = await pingHost(target.ip_address, config.icmp.probesPerCycle);
    const failed     = rtts.filter((r) => r < 0).length;
    const successes  = rtts.filter((r) => r >= 0);
    const packetLoss = (failed / rtts.length) * 100;
    const avgLatency = successes.length > 0 ? successes.reduce((a, b) => a + b, 0) / successes.length : null;
    const status     = packetLoss === 100 ? 'down' : 'up';

    await query(
      `INSERT INTO icmp_metrics (time, target_id, latency_ms, packet_loss, status) VALUES (NOW(), $1, $2, $3, $4)`,
      [target.id, avgLatency, packetLoss.toFixed(2), status]
    );

    if (target.device_id) {
      await query(
        `UPDATE devices SET status = $1, last_seen = CASE WHEN $1 = 'up' THEN NOW() ELSE last_seen END WHERE id = $2`,
        [status, target.device_id]
      );
    }

    if (status === 'down') await raiseAlert(target, 'down', 'critical', `${target.label} (${target.ip_address}) is DOWN`);
    if (avgLatency && avgLatency >= config.thresholds.latencyCriticalMs) await raiseAlert(target, 'high_latency', 'critical', `${target.label} latency at ${avgLatency.toFixed(0)}ms`);
    else if (avgLatency && avgLatency >= config.thresholds.latencyWarningMs) await raiseAlert(target, 'high_latency', 'warning', `${target.label} latency at ${avgLatency.toFixed(0)}ms`);

    logger.debug('ICMP check complete', { target: target.label, latency: avgLatency?.toFixed(1), packetLoss: packetLoss.toFixed(1), status });
  } catch (err) {
    logger.error('ICMP check failed', { target: target.label, error: (err as Error).message });
  }
}

async function raiseAlert(target: IcmpTarget, alertType: string, severity: string, message: string): Promise<void> {
  try {
    await query(
      `INSERT INTO alerts (device_id, target_id, alert_type, severity, message) SELECT $1, $2, $3, $4, $5 WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE target_id = $2 AND alert_type = $3 AND resolved = FALSE)`,
      [target.device_id, target.id, alertType, severity, message]
    );
  } catch {}
}

async function runMonitor(): Promise<void> {
  await testConnection();
  logger.info('ICMP Monitor service started');

  const pollCritical = async () => {
    const targets = await query<IcmpTarget>(`SELECT id, ip_address, label, priority, device_id FROM icmp_targets WHERE enabled = TRUE AND priority = 'critical'`);
    if (targets.length > 0) await Promise.allSettled(targets.map((t) => checkTarget(t)));
  };

  const pollNormal = async () => {
    const targets = await query<IcmpTarget>(`SELECT id, ip_address, label, priority, device_id FROM icmp_targets WHERE enabled = TRUE AND priority = 'normal'`);
    if (targets.length > 0) await Promise.allSettled(targets.map((t) => checkTarget(t)));
  };

  await Promise.all([pollCritical(), pollNormal()]);
  setInterval(pollCritical, config.icmp.criticalIntervalSeconds * 1000);
  setInterval(pollNormal,   config.icmp.normalIntervalSeconds   * 1000);
}

runMonitor().catch((err) => { logger.error('ICMP Monitor crashed', { error: err.message }); process.exit(1); });
