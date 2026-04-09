// SpanVault API - Devices Routes

import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../db';
import { nvQuery } from '../../db/netvault';

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

// GET /api/devices/netvault-import - List NetVault devices not yet in SpanVault
router.get('/netvault-import', async (_req: Request, res: Response) => {
  try {
    // Get existing SpanVault IPs first (strip /32 suffix from inet type)
    const existing = await query<{ ip: string }>(`SELECT split_part(ip_address::text, '/', 1) AS ip FROM devices`);
    const existingIPs = existing.map(r => r.ip);

    // Query NetVault for all active devices with IPs
    const rows = await nvQuery(
      `SELECT
         d.ip_address,
         d.name       AS hostname,
         d.model,
         d.site_id,
         b.name       AS vendor,
         dt.name      AS device_type,
         s.name       AS site_name,
         s.code       AS site_code
       FROM devices d
       LEFT JOIN brands       b  ON b.id  = d.brand_id
       LEFT JOIN device_types dt ON dt.id = d.device_type_id
       LEFT JOIN sites        s  ON s.id  = d.site_id
       WHERE d.device_status = 'Active'
         AND d.ip_address IS NOT NULL
         AND d.ip_address != ''
       ORDER BY s.name, d.name`
    );

    // Filter out IPs already in SpanVault
    const filtered = rows.filter(r => !existingIPs.includes(r.ip_address));
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/devices/lookup/:ip - Look up device in NetVault by IP
router.get('/lookup/:ip', async (req: Request, res: Response) => {
  try {
    const rows = await nvQuery(
      `SELECT
         d.name       AS hostname,
         d.model,
         d.site_id,
         b.name       AS vendor,
         dt.name      AS device_type,
         s.name       AS site_name
       FROM devices d
       LEFT JOIN brands       b  ON b.id  = d.brand_id
       LEFT JOIN device_types dt ON dt.id = d.device_type_id
       LEFT JOIN sites        s  ON s.id  = d.site_id
       WHERE d.ip_address = $1
         AND d.device_status = 'Active'
       LIMIT 1`,
      [req.params.ip]
    );
    if (!rows.length) return res.json({ found: false });
    const d = rows[0];
    res.json({
      found:       true,
      hostname:    d.hostname,
      model:       d.model,
      vendor:      d.vendor,
      device_type: d.device_type,
      site_id:     d.site_id,
      site_name:   d.site_name,
    });
  } catch (err) {
    res.json({ found: false });
  }
});

// GET /api/devices/:id - Single device
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

// PUT /api/devices/:id - Update device
router.put('/:id', async (req: Request, res: Response) => {
  const { hostname, ip_address, site_id, vendor, model, device_type, priority, community, snmp_enabled, icmp_enabled } = req.body;
  try {
    await query(
      `UPDATE devices SET
         hostname     = COALESCE($1, hostname),
         ip_address   = COALESCE($2, ip_address),
         site_id      = $3,
         vendor       = COALESCE($4, vendor),
         model        = COALESCE($5, model),
         device_type  = COALESCE($6, device_type),
         priority     = COALESCE($7, priority),
         community    = COALESCE($8, community),
         snmp_enabled = COALESCE($9, snmp_enabled),
         icmp_enabled = COALESCE($10, icmp_enabled)
       WHERE id = $11`,
      [hostname, ip_address, site_id || null, vendor, model, device_type, priority, community, snmp_enabled, icmp_enabled, req.params.id]
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
