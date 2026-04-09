// SpanVault API - Metrics Routes

import { Router, Request, Response } from 'express';
import { query } from '../../db';

const router = Router();

// GET /api/metrics/interface?interface_id=X&from=ISO&to=ISO&resolution=raw|hourly
router.get('/interface', async (req: Request, res: Response) => {
  const { interface_id, from, to, resolution } = req.query;
  if (!interface_id) return res.status(400).json({ error: 'interface_id required' });

  const fromTime = from || new Date(Date.now() - 3600000).toISOString(); // default 1 hour
  const toTime   = to   || new Date().toISOString();

  try {
    let rows;
    if (resolution === 'hourly') {
      rows = await query(
        `SELECT bucket AS time, avg_in_bps, avg_out_bps, max_in_bps, max_out_bps, avg_util_in, avg_util_out
         FROM interface_metrics_hourly
         WHERE interface_id = $1 AND bucket BETWEEN $2 AND $3
         ORDER BY bucket ASC`,
        [interface_id, fromTime, toTime]
      );
    } else {
      rows = await query(
        `SELECT time, in_bps, out_bps, util_in_pct, util_out_pct, in_errors, out_errors
         FROM interface_metrics
         WHERE interface_id = $1 AND time BETWEEN $2 AND $3
         ORDER BY time ASC`,
        [interface_id, fromTime, toTime]
      );
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/metrics/icmp?target_id=X&from=ISO&to=ISO
router.get('/icmp', async (req: Request, res: Response) => {
  const { target_id, from, to, resolution } = req.query;
  if (!target_id) return res.status(400).json({ error: 'target_id required' });

  const fromTime = from || new Date(Date.now() - 3600000).toISOString();
  const toTime   = to   || new Date().toISOString();

  try {
    let rows;
    if (resolution === 'hourly') {
      rows = await query(
        `SELECT bucket AS time, avg_latency_ms, max_latency_ms, avg_packet_loss
         FROM icmp_metrics_hourly
         WHERE target_id = $1 AND bucket BETWEEN $2 AND $3
         ORDER BY bucket ASC`,
        [target_id, fromTime, toTime]
      );
    } else {
      rows = await query(
        `SELECT time, latency_ms, packet_loss, status
         FROM icmp_metrics
         WHERE target_id = $1 AND time BETWEEN $2 AND $3
         ORDER BY time ASC`,
        [target_id, fromTime, toTime]
      );
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/metrics/summary - Dashboard summary cards
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const [devices, alerts, icmp] = await Promise.all([
      query(`SELECT
               COUNT(*) FILTER (WHERE status = 'up')   AS up,
               COUNT(*) FILTER (WHERE status = 'down') AS down,
               COUNT(*) AS total
             FROM devices`),
      query(`SELECT
               COUNT(*) FILTER (WHERE severity = 'critical' AND resolved = FALSE) AS critical,
               COUNT(*) FILTER (WHERE severity = 'warning'  AND resolved = FALSE) AS warning
             FROM alerts`),
      query(`SELECT
               ROUND(AVG(latency_ms)::numeric, 1) AS avg_latency,
               ROUND(AVG(packet_loss)::numeric, 2) AS avg_loss
             FROM icmp_metrics
             WHERE time > NOW() - INTERVAL '5 minutes'`),
    ]);

    res.json({
      devices: devices[0],
      alerts:  alerts[0],
      icmp:    icmp[0],
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

// GET /api/metrics/devices-icmp - Latest ICMP stats for all devices
router.get('/devices-icmp', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT
         d.id AS device_id,
         ROUND(AVG(im.latency_ms)::numeric, 1)   AS avg_latency_ms,
         ROUND(AVG(im.packet_loss)::numeric, 1)   AS avg_packet_loss,
         MAX(im.status)                            AS last_status
       FROM devices d
       LEFT JOIN icmp_targets t ON t.device_id = d.id
       LEFT JOIN icmp_metrics im ON im.target_id = t.id
         AND im.time > NOW() - INTERVAL '15 minutes'
       GROUP BY d.id`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
