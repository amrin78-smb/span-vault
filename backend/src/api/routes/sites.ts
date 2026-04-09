// SpanVault API - Sites Routes
// Reads sites from NetVault database (shared source of truth)
// Falls back to SpanVault local sites if NetVault is unavailable

import { Router, Request, Response } from 'express';
import { query } from '../../db';
import { nvQuery } from '../../db/netvault';

const router = Router();

// GET /api/sites - List all sites from NetVault (with fallback to local)
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Try NetVault first
    const sites = await nvQuery(
      `SELECT
         s.id,
         s.name,
         s.code,
         s.city,
         s.address,
         s.site_type,
         s.site_status,
         s.coordinates,
         s.contact_name,
         s.contact_email,
         s.phone,
         c.name AS country
       FROM sites s
       LEFT JOIN countries c ON c.id = s.country_id
       WHERE s.site_status = 'Active'
       ORDER BY s.name`
    );

    // Enrich with SpanVault device counts
    const counts = await query(
      `SELECT site_id, COUNT(*) as device_count,
         COUNT(*) FILTER (WHERE status = 'up')   as devices_up,
         COUNT(*) FILTER (WHERE status = 'down') as devices_down
       FROM devices GROUP BY site_id`
    );
    const countMap = new Map(counts.map(c => [c.site_id, c]));

    const enriched = sites.map(s => ({
      ...s,
      device_count:  Number(countMap.get(s.id)?.device_count  ?? 0),
      devices_up:    Number(countMap.get(s.id)?.devices_up    ?? 0),
      devices_down:  Number(countMap.get(s.id)?.devices_down  ?? 0),
    }));

    res.json(enriched);
  } catch (err) {
    // Fallback to local SpanVault sites
    try {
      const sites = await query(
        `SELECT s.*, 0 as device_count, 0 as devices_up, 0 as devices_down
         FROM sites s ORDER BY s.name`
      );
      res.json(sites);
    } catch (fallbackErr) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
});

// GET /api/sites/:id - Single site
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const sites = await nvQuery(
      `SELECT s.*, c.name AS country
       FROM sites s
       LEFT JOIN countries c ON c.id = s.country_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (!sites.length) return res.status(404).json({ error: 'Site not found' });
    res.json(sites[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
