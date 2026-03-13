import { Router, Request, Response } from 'express';
import { query } from '../db/client';
import { spawnAgent } from '../services/task-runner';
import { broadcastSSE } from './stream';
import { execFile } from 'child_process';
import * as path from 'path';

const router = Router();
const SCRIPTS_DIR = path.resolve(__dirname, '../../../../scripts');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(s: string): boolean {
  return UUID_RE.test(s);
}

interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  agent_type: string;
  model: string | null;
  branch: string | null;
  worktree_path: string | null;
  tmux_session: string | null;
  pr_number: number | null;
  pr_url: string | null;
  ci_status: string | null;
  spawn_retries: number;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

interface Project {
  id: string;
  repo_path: string;
  repo_url: string;
  default_branch: string;
}

router.get('/projects/:projectId/tasks', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { status } = req.query;

  if (!isValidUuid(projectId)) {
    res.json([]);
    return;
  }

  try {
    let sql = `SELECT * FROM tasks WHERE project_id = $1`;
    const params: unknown[] = [projectId];

    if (status) {
      sql += ` AND status = $2`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC`;

    const tasks = await query<Task>(sql, params);
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

router.post('/projects/:projectId/tasks', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { title, description, agent_type = 'claude', task_type = 'feature', model, upload_id } = req.body;

  if (!isValidUuid(projectId)) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  if (!title || !description) {
    res.status(400).json({ error: 'title and description are required' });
    return;
  }

  try {
    const projects = await query<Project>(
      `SELECT id, repo_path, repo_url, default_branch FROM projects WHERE id = $1`,
      [projectId]
    );

    if (projects.length === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const project = projects[0];

    const result = await query<Task>(
      `INSERT INTO tasks (project_id, title, description, agent_type, task_type, model)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [projectId, title, description, agent_type, task_type, model || null]
    );

    const task = result[0];

    await query(
      `INSERT INTO events (type, project_id, task_id, data) VALUES ('task_created', $1, $2, $3)`,
      [projectId, task.id, { title, agent_type }]
    );

    spawnAgent({
      taskId: task.id,
      projectId,
      title,
      description,
      agentType: agent_type,
      taskType: task_type,
      model: model || null,
      repoPath: project.repo_path,
      repoUrl: project.repo_url,
      defaultBranch: project.default_branch,
      uploadId: upload_id || null,
    }).catch((err: Error) => console.error('spawnAgent error:', err));

    broadcastSSE('task_updated', { taskId: task.id, projectId, status: 'pending' });
    res.status(201).json(task);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

router.get('/tasks/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const tasks = await query<Task>(`SELECT * FROM tasks WHERE id = $1`, [id]);

    if (tasks.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json(tasks[0]);
  } catch (err) {
    console.error('Error fetching task:', err);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

router.post('/tasks/:id/cancel', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const tasks = await query<Task>(`SELECT * FROM tasks WHERE id = $1`, [id]);

    if (tasks.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = tasks[0];

    await query(
      `UPDATE tasks SET status = 'failed', completed_at = now() WHERE id = $1`,
      [id]
    );

    if (task.tmux_session) {
      execFile('tmux', ['kill-session', '-t', task.tmux_session], () => {});
    }

    await query(
      `INSERT INTO events (type, project_id, task_id, data) VALUES ('agent_exited', $1, $2, $3)`,
      [task.project_id, id, { reason: 'cancelled' }]
    );

    broadcastSSE('task_updated', { taskId: id, projectId: task.project_id, status: 'failed' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error cancelling task:', err);
    res.status(500).json({ error: 'Failed to cancel task' });
  }
});

router.post('/tasks/:id/retry', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const tasks = await query<Task>(
      `SELECT t.*, p.repo_path, p.repo_url, p.default_branch
       FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE t.id = $1`,
      [id]
    );

    if (tasks.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = tasks[0] as Task & { repo_path: string; repo_url: string; default_branch: string };

    await query(
      `UPDATE tasks SET status = 'pending', spawn_retries = spawn_retries + 1,
       branch = NULL, worktree_path = NULL, tmux_session = NULL,
       pr_number = NULL, pr_url = NULL, ci_status = NULL, started_at = NULL, completed_at = NULL
       WHERE id = $1`,
      [id]
    );

    spawnAgent({
      taskId: task.id,
      projectId: task.project_id,
      title: task.title,
      description: task.description,
      agentType: task.agent_type,
      taskType: (task as any).task_type || 'feature',
      model: task.model,
      repoPath: task.repo_path,
      repoUrl: task.repo_url,
      defaultBranch: task.default_branch,
    }).catch((err: Error) => console.error('spawnAgent retry error:', err));

    res.json({ ok: true });
  } catch (err) {
    console.error('Error retrying task:', err);
    res.status(500).json({ error: 'Failed to retry task' });
  }
});

router.get('/projects/:projectId/merge-queue', async (req: Request, res: Response) => {
  const { projectId } = req.params;

  try {
    const tasks = await query<Task>(
      `SELECT * FROM tasks
       WHERE project_id = $1
         AND status IN ('pr_open', 'ci_pending', 'review')
       ORDER BY created_at DESC`,
      [projectId]
    );

    res.json(tasks);
  } catch (err) {
    console.error('Error fetching merge queue:', err);
    res.status(500).json({ error: 'Failed to fetch merge queue' });
  }
});

router.post('/tasks/:id/merge', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const tasks = await query<Task>(
      `SELECT t.*, p.repo_url FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1`,
      [id]
    );

    if (tasks.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = tasks[0] as Task & { repo_url: string };

    if (!task.pr_number) {
      res.status(400).json({ error: 'No PR associated with this task' });
      return;
    }

    const scriptPath = path.join(SCRIPTS_DIR, 'merge-pr.sh');

    execFile(
      scriptPath,
      [String(task.pr_number), task.repo_url, id, task.project_id],
      { timeout: 60000 },
      async (err) => {
        if (err) {
          console.error('merge-pr.sh failed:', err.message);
        }
      }
    );

    broadcastSSE('pr_merged', { taskId: id, projectId: task.project_id, prNumber: task.pr_number });
    res.json({ ok: true, message: 'Merge initiated' });
  } catch (err) {
    console.error('Error merging task:', err);
    res.status(500).json({ error: 'Failed to merge task' });
  }
});

router.post('/tasks/:id/request-changes', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { feedback } = req.body;

  if (!feedback) {
    res.status(400).json({ error: 'feedback is required' });
    return;
  }

  try {
    const tasks = await query<Task>(`SELECT * FROM tasks WHERE id = $1`, [id]);

    if (tasks.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = tasks[0];

    await query(
      `INSERT INTO events (type, project_id, task_id, data) VALUES ('review_requested', $1, $2, $3)`,
      [task.project_id, id, { feedback }]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Error requesting changes:', err);
    res.status(500).json({ error: 'Failed to request changes' });
  }
});

router.get('/projects/:projectId/activity', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { limit = '100' } = req.query;

  try {
    const events = await query(
      `SELECT * FROM events
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [projectId, parseInt(limit as string, 10)]
    );

    res.json(events);
  } catch (err) {
    console.error('Error fetching activity:', err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

router.get('/projects/:projectId/counts', async (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (!isValidUuid(projectId)) {
    res.json({ tasks_pending: 0, merge_ready: 0 });
    return;
  }

  try {
    const result = await query<{ tasks_pending: string; merge_ready: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('pending','spawned','coding')) AS tasks_pending,
         COUNT(*) FILTER (WHERE status IN ('pr_open','ci_pending','review')) AS merge_ready
       FROM tasks WHERE project_id = $1`,
      [projectId]
    );
    const row = result[0] || { tasks_pending: '0', merge_ready: '0' };
    res.json({
      tasks_pending: parseInt(row.tasks_pending, 10),
      merge_ready: parseInt(row.merge_ready, 10),
    });
  } catch (err) {
    console.error('Error fetching counts:', err);
    res.status(500).json({ error: 'Failed to fetch counts' });
  }
});

export default router;
