// SpanVault API - Devices Routes

import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../db';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const devices = await query(
      `SELECT d.*, s.name AS site_name
       FROM devices d
       LEFT JOIN sites s ON s.id = d.site_id
       ORDER BY s.name, d.hostname`
    );
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const device = await queryOne(
      `SELECT d.*, s.name AS site_name
       FROM devices d
       LEFT JOIN sites s ON s.id = d.site_id
       WHERE d.id = $1`,
      [req.params.id]
    );
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json(device);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { hostname, ip_address, site_id, vendor, model, device_type, priority, community } = req.body;
  if (!hostname || !ip_address) {
    return res.status(400).json({ error: 'hostname and ip_address are required' });
  }
  try {
    const rows = await query<{ id: number }>(
      `INSERT INTO devices (hostname, ip_address, site_id, vendor, model, device_type, priority, community)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [hostname, ip_address, site_id || null, vendor, model, device_type || 'router', priority || 'normal', community || 'public']
    );
    const deviceId = rows[0].id;

    await query(
      `INSERT INTO icmp_targets (device_id, ip_address, label, priority)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [deviceId, ip_address, hostname, priority || 'normal']
    );

    const nodeCount = await query<{ count: string }>(`SELECT COUNT(*) as count FROM topology_nodes`);
    const n = parseInt(nodeCount[0].count);
    const x = 150 + (n % 4) * 220;
    const y = 120 + Math.floor(n / 4) * 160;

    await query(
      `INSERT INTO topology_nodes (device_id, label, node_type, x, y, site_id)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [deviceId, hostname, device_type || 'router', x, y, site_id || null]
    );

    res.status(201).json({ id: deviceId, message: 'Device added' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { hostname, ip_address, site_id, vendor, model, device_type, priority, community, snmp_enabled, icmp_enabled } = req.body;
  try {
    await query(
      `UPDATE devices SET
         hostname     = COALESCE($1, hostname),
         ip_address   = COALESCE($2, ip_address),
         site_id      = COALESCE($3, site_id),
         vendor       = COALESCE($4, vendor),
         model        = COALESCE($5, model),
         device_type  = COALESCE($6, device_type),
         priority     = COALESCE($7, priority),
         community    = COALESCE($8, community),
         snmp_enabled = COALESCE($9, snmp_enabled),
         icmp_enabled = COALESCE($10, icmp_enabled)
       WHERE id = $11`,
      [hostname, ip_address, site_id, vendor, model, device_type, priority, community, snmp_enabled, icmp_enabled, req.params.id]
    );
    if (hostname || device_type) {
      await query(
        `UPDATE topology_nodes SET label = COALESCE($1, label), node_type = COALESCE($2, node_type) WHERE device_id = $3`,
        [hostname, device_type, req.params.id]
      );
    }
    if (ip_address) {
      await query(`UPDATE icmp_targets SET ip_address = $1 WHERE device_id = $2`, [ip_address, req.params.id]);
    }
    res.json({ message: 'Device updated' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await query(`DELETE FROM devices WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Device deleted' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
