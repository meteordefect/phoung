import { Router, Request, Response } from 'express';
import { query } from '../db/client';

const router = Router();

interface Mission {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

router.post('/missions', async (req: Request, res: Response) => {
  const { name, description } = req.body;
  
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'Mission name is required' });
    return;
  }
  
  try {
    const result = await query<Mission>(
      `INSERT INTO missions (name, description, status)
       VALUES ($1, $2, 'pending')
       RETURNING id, name, description, status, created_at, updated_at`,
      [name, description || null]
    );
    
    await query(
      `INSERT INTO events (type, mission_id, data)
       VALUES ($1, $2, $3)`,
      ['mission.created', result[0].id, { name, description }]
    );
    
    res.status(201).json(result[0]);
  } catch (err) {
    console.error('Error creating mission:', err);
    res.status(500).json({ error: 'Failed to create mission' });
  }
});

router.get('/missions', async (req: Request, res: Response) => {
  const { status, limit = '50' } = req.query;
  
  try {
    let sql = `
      SELECT m.*,
             COUNT(c.id) as total_commands,
             COUNT(CASE WHEN c.status = 'completed' THEN 1 END) as completed_commands,
             COUNT(CASE WHEN c.status = 'failed' THEN 1 END) as failed_commands
      FROM missions m
      LEFT JOIN commands c ON m.id = c.mission_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;
    
    if (status) {
      sql += ` AND m.status = $${paramIndex++}`;
      params.push(status);
    }
    
    sql += `
      GROUP BY m.id
      ORDER BY m.created_at DESC
      LIMIT $${paramIndex}
    `;
    params.push(parseInt(limit as string, 10));
    
    const missions = await query(sql, params);
    res.json(missions);
  } catch (err) {
    console.error('Error fetching missions:', err);
    res.status(500).json({ error: 'Failed to fetch missions' });
  }
});

router.get('/missions/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    const missions = await query<Mission>(
      `SELECT * FROM missions WHERE id = $1`,
      [id]
    );
    
    if (missions.length === 0) {
      res.status(404).json({ error: 'Mission not found' });
      return;
    }
    
    const commands = await query(
      `SELECT c.*, a.name as agent_name
       FROM commands c
       LEFT JOIN agents a ON c.agent_id = a.id
       WHERE c.mission_id = $1
       ORDER BY c.created_at ASC`,
      [id]
    );
    
    res.json({
      ...missions[0],
      commands,
    });
  } catch (err) {
    console.error('Error fetching mission:', err);
    res.status(500).json({ error: 'Failed to fetch mission' });
  }
});

router.post('/missions/:id/commands', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { type, payload, agent_id, priority = 0 } = req.body;
  
  if (!type || typeof type !== 'string') {
    res.status(400).json({ error: 'Command type is required' });
    return;
  }
  
  try {
    const missions = await query<Mission>(
      `SELECT id FROM missions WHERE id = $1`,
      [id]
    );
    
    if (missions.length === 0) {
      res.status(404).json({ error: 'Mission not found' });
      return;
    }
    
    const result = await query(
      `INSERT INTO commands (mission_id, agent_id, type, payload, priority, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id, mission_id, agent_id, type, payload, priority, status, created_at`,
      [id, agent_id || null, type, JSON.stringify(payload || {}), priority]
    );
    
    await query(
      `INSERT INTO events (type, mission_id, command_id, data)
       VALUES ($1, $2, $3, $4)`,
      ['command.created', id, result[0].id, { type, agent_id }]
    );
    
    await query(
      `UPDATE missions SET status = 'active', updated_at = now() WHERE id = $1 AND status = 'pending'`,
      [id]
    );
    
    res.status(201).json(result[0]);
  } catch (err) {
    console.error('Error creating command:', err);
    res.status(500).json({ error: 'Failed to create command' });
  }
});

router.patch('/missions/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, description } = req.body;
  
  try {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    if (status) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(description);
    }
    
    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    
    updates.push(`updated_at = now()`);
    params.push(id);
    
    const result = await query<Mission>(
      `UPDATE missions SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );
    
    if (result.length === 0) {
      res.status(404).json({ error: 'Mission not found' });
      return;
    }
    
    res.json(result[0]);
  } catch (err) {
    console.error('Error updating mission:', err);
    res.status(500).json({ error: 'Failed to update mission' });
  }
});

export default router;
