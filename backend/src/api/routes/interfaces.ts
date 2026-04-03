// SpanVault API - Interfaces Routes
import { Router, Request, Response } from 'express';
import { query } from '../../db';

const router = Router();

// GET /api/interfaces?device_id=X
router.get('/', async (req: Request, res: Response) => {
  try {
    const { device_id } = req.query;
    const where = device_id ? 'WHERE i.device_id = $1' : '';
    const params = device_id ? [device_id] : [];

    const interfaces = await query(
      `SELECT i.*, d.hostname
       FROM interfaces i
       JOIN devices d ON d.id = i.device_id
       ${where}
       ORDER BY i.device_id, i.if_index`,
      params
    );
    res.json(interfaces);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
