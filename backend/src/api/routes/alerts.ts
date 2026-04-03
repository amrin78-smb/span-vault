// SpanVault API - Alerts Routes

import { Router, Request, Response } from 'express';
import { query } from '../../db';

const router = Router();

// GET /api/alerts - Active alerts (unresolved by default)
router.get('/', async (req: Request, res: Response) => {
  const resolved = req.query.resolved === 'true';
  try {
    const rows = await query(
      `SELECT
         a.*,
         d.hostname,
         d.ip_address
       FROM alerts a
       LEFT JOIN devices d ON d.id = a.device_id
       WHERE a.resolved = $1
       ORDER BY a.created_at DESC
       LIMIT 200`,
      [resolved]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/alerts/:id/acknowledge
router.put('/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    await query(
      `UPDATE alerts SET acknowledged = TRUE WHERE id = $1`,
      [req.params.id]
    );
    res.json({ message: 'Alert acknowledged' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/alerts/:id/resolve
router.put('/:id/resolve', async (req: Request, res: Response) => {
  try {
    await query(
      `UPDATE alerts SET resolved = TRUE, resolved_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ message: 'Alert resolved' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
