// SpanVault API - Devices Routes

import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../db';

const router = Router();

// GET /api/devices - List all devices with site info
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

// GET /api/devices/:id - Single device with interfaces
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

// POST /api/devices - Add a new device
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
      [hostname, ip_address, site_id, vendor, model, device_type || 'router', priority || 'normal', community || 'public']
    );

    // Also add as ICMP target automatically
    await query(
      `INSERT INTO icmp_targets (device_id, ip_address, label, priority)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [rows[0].id, ip_address, hostname, priority || 'normal']
    );

    res.status(201).json({ id: rows[0].id, message: 'Device added' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/devices/:id - Update device
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
    res.json({ message: 'Device updated' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/devices/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await query(`DELETE FROM devices WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Device deleted' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
