// SpanVault API - Topology Routes

import { Router, Request, Response } from 'express';
import { query } from '../../db';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    await query(`
      INSERT INTO topology_nodes (device_id, label, node_type, x, y, site_id)
      SELECT d.id, d.hostname, d.device_type,
        150 + ((ROW_NUMBER() OVER (ORDER BY d.id) - 1) % 4) * 220,
        120 + (((ROW_NUMBER() OVER (ORDER BY d.id) - 1) / 4) * 160),
        d.site_id
      FROM devices d
      WHERE NOT EXISTS (SELECT 1 FROM topology_nodes tn WHERE tn.device_id = d.id)
    `);

    const [nodes, links] = await Promise.all([
      query(
        `SELECT n.id, n.label, n.node_type,
           n.x::integer AS x, n.y::integer AS y,
           d.id AS device_id, d.hostname, d.ip_address, d.status, d.vendor,
           s.name AS site_name
         FROM topology_nodes n
         LEFT JOIN devices d ON d.id = n.device_id
         LEFT JOIN sites   s ON s.id = n.site_id
         ORDER BY n.id`
      ),
      query(
        `SELECT l.id, l.label, l.link_speed_bps,
           l.source_node_id, l.target_node_id,
           COALESCE((
             SELECT GREATEST(m.util_in_pct, m.util_out_pct)
             FROM interface_metrics m
             WHERE m.interface_id = l.interface_id
             ORDER BY m.time DESC LIMIT 1
           ), 0) AS util_pct
         FROM topology_links l ORDER BY l.id`
      ),
    ]);

    res.json({ nodes, links });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/nodes/:id/position', async (req: Request, res: Response) => {
  const { x, y } = req.body;
  try {
    await query(
      `UPDATE topology_nodes SET x = $1, y = $2 WHERE id = $3`,
      [Math.round(Number(x)), Math.round(Number(y)), req.params.id]
    );
    res.json({ message: 'Position saved' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/nodes', async (req: Request, res: Response) => {
  const { device_id, label, node_type, x, y, site_id } = req.body;
  try {
    const rows = await query<{ id: number }>(
      `INSERT INTO topology_nodes (device_id, label, node_type, x, y, site_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [device_id, label, node_type || 'router', Math.round(Number(x)||200), Math.round(Number(y)||200), site_id]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/links', async (req: Request, res: Response) => {
  const { source_node_id, target_node_id, label, link_speed_bps } = req.body;
  try {
    const rows = await query<{ id: number }>(
      `INSERT INTO topology_links (source_node_id, target_node_id, label, link_speed_bps)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [source_node_id, target_node_id, label, link_speed_bps || 0]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/links/:id', async (req: Request, res: Response) => {
  try {
    await query(`DELETE FROM topology_links WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Link deleted' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
