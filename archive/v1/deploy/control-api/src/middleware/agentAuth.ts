import { Request, Response, NextFunction } from 'express';
import { query } from '../db/client';

interface Agent {
  id: string;
  name: string;
  status: string;
}

export interface AuthenticatedRequest extends Request {
  agent?: Agent;
}

export async function agentAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }
  
  const token = authHeader.substring(7);
  
  try {
    const agents = await query<Agent>(
      'SELECT id, name, status FROM agents WHERE token = $1',
      [token]
    );
    
    if (agents.length === 0) {
      res.status(401).json({ error: 'Invalid agent token' });
      return;
    }
    
    req.agent = agents[0];
    next();
  } catch (err) {
    console.error('Agent auth error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
