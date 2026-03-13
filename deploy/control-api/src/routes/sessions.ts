import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

const OPENCLAW_DATA_PATH = process.env.OPENCLAW_DATA_PATH || path.join(process.env.HOME || '/root', '.openclaw');
const SESSIONS_PATH = path.join(OPENCLAW_DATA_PATH, 'sessions');

interface SessionSummary {
  id: string;
  created: Date;
  size: number;
}

interface SessionTranscript {
  id: string;
  created: Date;
  content: string;
  size: number;
}

router.get('/sessions', (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(SESSIONS_PATH)) {
      res.json([]);
      return;
    }
    
    const sessions: SessionSummary[] = [];
    const entries = fs.readdirSync(SESSIONS_PATH, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        const fullPath = path.join(SESSIONS_PATH, entry.name);
        const stats = fs.statSync(fullPath);
        const sessionId = entry.name.replace('.json', '');
        
        sessions.push({
          id: sessionId,
          created: stats.birthtime,
          size: stats.size,
        });
      }
    }
    
    sessions.sort((a, b) => b.created.getTime() - a.created.getTime());
    res.json(sessions);
  } catch (err) {
    console.error('Error listing sessions:', err);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

router.get('/sessions/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  
  const sanitizedId = id.replace(/[^a-zA-Z0-9-_]/g, '');
  if (sanitizedId !== id) {
    res.status(400).json({ error: 'Invalid session ID' });
    return;
  }
  
  const sessionFile = path.join(SESSIONS_PATH, `${sanitizedId}.json`);
  
  try {
    if (!fs.existsSync(sessionFile)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    const content = fs.readFileSync(sessionFile, 'utf-8');
    const stats = fs.statSync(sessionFile);
    
    res.json({
      id: sanitizedId,
      created: stats.birthtime,
      content: JSON.parse(content),
      size: stats.size,
    });
  } catch (err) {
    console.error('Error reading session:', err);
    res.status(500).json({ error: 'Failed to read session' });
  }
});

export default router;
