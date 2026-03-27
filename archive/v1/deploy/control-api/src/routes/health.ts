import { Router, Request, Response } from 'express';
import { healthCheck } from '../db/client';

const router = Router();

router.get('/health', async (req: Request, res: Response) => {
  try {
    const dbHealthy = await healthCheck();
    
    if (dbHealthy) {
      res.json({
        status: 'ok',
        db: 'connected',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'error',
        db: 'disconnected',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    res.status(503).json({
      status: 'error',
      db: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
