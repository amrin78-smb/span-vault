// SpanVault API - Sites Routes

import { Router, Request, Response } from 'express';
import { query } from '../../db';

const router = Router();

// GET /api/sites - All sites with device counts and health
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT
         s.*,
         COUNT(d.id)                                       AS device_count,
         COUNT(d.id) FILTER (WHERE d.status = 'up')       AS devices_up,
         COUNT(d.id) FILTER (WHERE d.status = 'down')     AS devices_down
       FROM sites s
       LEFT JOIN devices d ON d.site_id = s.id
       GROUP BY s.id
       ORDER BY s.name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/sites
router.post('/', async (req: Request, res: Response) => {
  const { name, location, timezone } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const rows = await query<{ id: number }>(
      `INSERT INTO sites (name, location, timezone) VALUES ($1, $2, $3) RETURNING id`,
      [name, location, timezone || 'Asia/Bangkok']
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
