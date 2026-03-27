import { Router, Request, Response } from 'express';
import { query } from '../db/client';

const router = Router();

interface Event {
  id: string;
  type: string;
  agent_id: string | null;
  mission_id: string | null;
  command_id: string | null;
  data: any;
  created_at: Date;
}

router.get('/events', async (req: Request, res: Response) => {
  const { type, agent_id, mission_id, limit = '100' } = req.query;
  
  try {
    let sql = `
      SELECT e.*,
             a.name as agent_name,
             m.name as mission_name
      FROM events e
      LEFT JOIN agents a ON e.agent_id = a.id
      LEFT JOIN missions m ON e.mission_id = m.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;
    
    if (type) {
      sql += ` AND e.type = $${paramIndex++}`;
      params.push(type);
    }
    
    if (agent_id) {
      sql += ` AND e.agent_id = $${paramIndex++}`;
      params.push(agent_id);
    }
    
    if (mission_id) {
      sql += ` AND e.mission_id = $${paramIndex++}`;
      params.push(mission_id);
    }
    
    sql += ` ORDER BY e.created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit as string, 10));
    
    const events = await query<Event>(sql, params);
    res.json(events);
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

export default router;
