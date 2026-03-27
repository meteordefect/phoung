import { Router, Request, Response } from 'express';
import { query } from '../db/client';

const router = Router();

const REPOS_BASE_PATH = process.env.REPOS_BASE_PATH || '/opt/repos';

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

interface Project {
  id: string;
  name: string;
  repo_url: string;
  repo_path: string;
  default_branch: string;
  created_at: Date;
  updated_at: Date;
}

router.get('/projects', async (_req: Request, res: Response) => {
  try {
    const projects = await query<Project>(
      `SELECT p.*,
              COUNT(t.id) AS total_tasks,
              COUNT(CASE WHEN t.status NOT IN ('merged','failed') THEN 1 END) AS active_tasks
       FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC`
    );
    res.json(projects);
  } catch (err) {
    console.error('Error fetching projects:', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

router.post('/projects', async (req: Request, res: Response) => {
  const { name, repo_url, default_branch = 'main' } = req.body;

  if (!name || !repo_url) {
    res.status(400).json({ error: 'name and repo_url are required' });
    return;
  }

  const repo_path = `${REPOS_BASE_PATH}/${toSlug(name)}`;

  try {
    const result = await query<Project>(
      `INSERT INTO projects (name, repo_url, repo_path, default_branch)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, repo_url, repo_path, default_branch]
    );

    await query(
      `INSERT INTO events (type, project_id, data) VALUES ($1, $2, $3)`,
      ['project_created', result[0].id, { name, repo_url }]
    );

    res.status(201).json(result[0]);
  } catch (err) {
    console.error('Error creating project:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.get('/projects/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const projects = await query<Project>(
      `SELECT * FROM projects WHERE id = $1`,
      [id]
    );

    if (projects.length === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(projects[0]);
  } catch (err) {
    console.error('Error fetching project:', err);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

router.put('/projects/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, repo_url, repo_path, default_branch } = req.body;

  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (name !== undefined)           { updates.push(`name = $${idx++}`);           params.push(name); }
  if (repo_url !== undefined)       { updates.push(`repo_url = $${idx++}`);       params.push(repo_url); }
  if (repo_path !== undefined)      { updates.push(`repo_path = $${idx++}`);      params.push(repo_path); }
  if (default_branch !== undefined) { updates.push(`default_branch = $${idx++}`); params.push(default_branch); }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  updates.push(`updated_at = now()`);
  params.push(id);

  try {
    const result = await query<Project>(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (result.length === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(result[0]);
  } catch (err) {
    console.error('Error updating project:', err);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

router.delete('/projects/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await query<Project>(
      `DELETE FROM projects WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.length === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.status(204).send();
  } catch (err) {
    console.error('Error deleting project:', err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
