// SpanVault API - Flow Routes

import { Router, Request, Response } from 'express';
import { query } from '../../db';

const router = Router();

// GET /api/flows/top-talkers?from=ISO&to=ISO&limit=10
router.get('/top-talkers', async (req: Request, res: Response) => {
  const from  = req.query.from  || new Date(Date.now() - 3600000).toISOString();
  const to    = req.query.to    || new Date().toISOString();
  const limit = Number(req.query.limit) || 10;

  try {
    const rows = await query(
      `SELECT
         src_ip::text,
         dst_ip::text,
         SUM(bytes)   AS total_bytes,
         SUM(packets) AS total_packets
       FROM flow_summary
       WHERE time_bucket BETWEEN $1 AND $2
       GROUP BY src_ip, dst_ip
       ORDER BY total_bytes DESC
       LIMIT $3`,
      [from, to, limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/flows/site-matrix - Traffic between sites
router.get('/site-matrix', async (req: Request, res: Response) => {
  const from = req.query.from || new Date(Date.now() - 3600000).toISOString();
  const to   = req.query.to   || new Date().toISOString();

  try {
    const rows = await query(
      `SELECT
         sd.name AS src_site,
         dd.name AS dst_site,
         SUM(f.bytes)   AS total_bytes,
         SUM(f.packets) AS total_packets
       FROM flow_summary f
       JOIN devices src_d ON src_d.ip_address = f.src_ip
       JOIN devices dst_d ON dst_d.ip_address = f.dst_ip
       JOIN sites sd ON sd.id = src_d.site_id
       JOIN sites dd ON dd.id = dst_d.site_id
       WHERE f.time_bucket BETWEEN $1 AND $2
         AND sd.id != dd.id
       GROUP BY sd.name, dd.name
       ORDER BY total_bytes DESC`,
      [from, to]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/flows/timeline?from=ISO&to=ISO
router.get('/timeline', async (req: Request, res: Response) => {
  const from = req.query.from || new Date(Date.now() - 3600000).toISOString();
  const to   = req.query.to   || new Date().toISOString();

  try {
    const rows = await query(
      `SELECT
         date_trunc('minute', time_bucket) -
           (EXTRACT(minute FROM time_bucket)::int % 5) * INTERVAL '1 minute' AS bucket,
         SUM(bytes)   AS total_bytes,
         SUM(packets) AS total_packets
       FROM flow_summary
       WHERE time_bucket BETWEEN $1 AND $2
       GROUP BY 1
       ORDER BY 1 ASC`,
      [from, to]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
