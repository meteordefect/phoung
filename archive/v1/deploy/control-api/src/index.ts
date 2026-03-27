import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { runMigrations } from './db/migrate';
import { startAgentStatusMonitor } from './lib/agentStatus';
import { startAgentCheckCron } from './services/task-runner';

import healthRouter from './routes/health';
import agentsRouter from './routes/agents';
import commandsRouter from './routes/commands';
import missionsRouter from './routes/missions';
import eventsRouter from './routes/events';
import filesRouter from './routes/files';
import sessionsRouter from './routes/sessions';
import projectsRouter from './routes/projects';
import tasksRouter from './routes/tasks';
import sshKeysRouter from './routes/ssh-keys';
import uploadsRouter from './routes/uploads';
import streamRouter from './routes/stream';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.use('/api', healthRouter);
app.use('/api', agentsRouter);
app.use('/api', commandsRouter);
app.use('/api', missionsRouter);
app.use('/api', eventsRouter);
app.use('/api', filesRouter);
app.use('/api', sessionsRouter);
app.use('/api', projectsRouter);
app.use('/api', tasksRouter);
app.use('/api', sshKeysRouter);
app.use('/api', uploadsRouter);
app.use('/api', streamRouter);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function startServer() {
  try {
    console.log('Phoung Control API v4.0');
    console.log('Running database migrations...');
    await runMigrations();
    
    console.log('Starting agent status monitor...');
    startAgentStatusMonitor(30000);

    console.log('Starting agent check cron (every 5 min)...');
    startAgentCheckCron(5 * 60 * 1000);
    
    app.listen(PORT, () => {
      console.log(`✓ Control API listening on port ${PORT}`);
      console.log(`  Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
