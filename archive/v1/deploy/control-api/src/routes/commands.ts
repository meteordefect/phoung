import { Router, Request, Response } from 'express';
import { query } from '../db/client';
import { agentAuth, AuthenticatedRequest } from '../middleware/agentAuth';

const router = Router();

interface Command {
  id: string;
  mission_id: string | null;
  agent_id: string | null;
  type: string;
  payload: any;
  status: string;
  priority: number;
  result: any;
  assigned_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

router.get('/commands/pending', agentAuth, async (req: AuthenticatedRequest, res: Response) => {
  const agent = req.agent!;
  
  try {
    const commands = await query<Command>(
      `SELECT id, mission_id, agent_id, type, payload, status, priority, created_at
       FROM commands
       WHERE (agent_id = $1 OR agent_id IS NULL)
         AND status = 'pending'
       ORDER BY priority DESC, created_at ASC
       LIMIT 10`,
      [agent.id]
    );
    
    res.json(commands);
  } catch (err) {
    console.error('Error fetching pending commands:', err);
    res.status(500).json({ error: 'Failed to fetch pending commands' });
  }
});

router.post('/commands/:id/accept', agentAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const agent = req.agent!;
  
  try {
    const result = await query<Command>(
      `UPDATE commands
       SET status = 'running',
           agent_id = $1,
           assigned_at = now(),
           started_at = now()
       WHERE id = $2 
         AND status = 'pending'
       RETURNING id, mission_id, type, payload, status, started_at`,
      [agent.id, id]
    );
    
    if (result.length === 0) {
      res.status(404).json({ error: 'Command not found or already accepted' });
      return;
    }
    
    await query(
      `INSERT INTO events (type, agent_id, command_id, data)
       VALUES ($1, $2, $3, $4)`,
      ['command.accepted', agent.id, id, { command_type: result[0].type }]
    );
    
    res.json(result[0]);
  } catch (err) {
    console.error('Error accepting command:', err);
    res.status(500).json({ error: 'Failed to accept command' });
  }
});

router.post('/commands/:id/result', agentAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status, result: commandResult } = req.body;
  const agent = req.agent!;
  
  if (!status || !['completed', 'failed'].includes(status)) {
    res.status(400).json({ error: 'Invalid status. Must be "completed" or "failed"' });
    return;
  }
  
  try {
    const result = await query<Command>(
      `UPDATE commands
       SET status = $1,
           result = $2,
           completed_at = now()
       WHERE id = $3 
         AND agent_id = $4
         AND status = 'running'
       RETURNING id, mission_id, type, status, completed_at`,
      [status, JSON.stringify(commandResult || {}), id, agent.id]
    );
    
    if (result.length === 0) {
      res.status(404).json({ error: 'Command not found or not assigned to this agent' });
      return;
    }
    
    await query(
      `INSERT INTO events (type, agent_id, command_id, mission_id, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [`command.${status}`, agent.id, id, result[0].mission_id, { result: commandResult }]
    );
    
    if (result[0].mission_id) {
      const pendingCommands = await query(
        `SELECT COUNT(*) as count
         FROM commands
         WHERE mission_id = $1 
           AND status IN ('pending', 'running')`,
        [result[0].mission_id]
      );
      
      if (pendingCommands[0].count === 0) {
        await query(
          `UPDATE missions
           SET status = 'completed', updated_at = now()
           WHERE id = $1 AND status != 'completed'`,
          [result[0].mission_id]
        );
        
        await query(
          `INSERT INTO events (type, mission_id, data)
           VALUES ($1, $2, $3)`,
          ['mission.completed', result[0].mission_id, {}]
        );
      }
    }
    
    res.json(result[0]);
  } catch (err) {
    console.error('Error submitting command result:', err);
    res.status(500).json({ error: 'Failed to submit command result' });
  }
});

router.get('/commands', async (req: Request, res: Response) => {
  const { status, agent_id, mission_id, limit = '50' } = req.query;
  
  try {
    let sql = `
      SELECT c.*, 
             a.name as agent_name,
             m.name as mission_name
      FROM commands c
      LEFT JOIN agents a ON c.agent_id = a.id
      LEFT JOIN missions m ON c.mission_id = m.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;
    
    if (status) {
      sql += ` AND c.status = $${paramIndex++}`;
      params.push(status);
    }
    
    if (agent_id) {
      sql += ` AND c.agent_id = $${paramIndex++}`;
      params.push(agent_id);
    }
    
    if (mission_id) {
      sql += ` AND c.mission_id = $${paramIndex++}`;
      params.push(mission_id);
    }
    
    sql += ` ORDER BY c.created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit as string, 10));
    
    const commands = await query(sql, params);
    res.json(commands);
  } catch (err) {
    console.error('Error fetching commands:', err);
    res.status(500).json({ error: 'Failed to fetch commands' });
  }
});

export default router;
