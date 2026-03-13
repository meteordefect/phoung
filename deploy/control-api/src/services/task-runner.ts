import { execFile } from 'child_process';
import * as path from 'path';
import { query } from '../db/client';
import { UPLOAD_BASE } from '../routes/uploads';

const SCRIPTS_DIR = path.resolve(__dirname, '../../../../scripts');

interface SpawnOptions {
  taskId: string;
  projectId: string;
  title: string;
  description: string;
  agentType: string;
  taskType: string;
  model: string | null;
  repoPath: string;
  repoUrl: string;
  defaultBranch: string;
  uploadId?: string | null;
}

export async function spawnAgent(opts: SpawnOptions): Promise<void> {
  const { taskId, projectId, description, agentType, taskType, model, repoPath, repoUrl, uploadId } = opts;
  const shortId = taskId.slice(0, 8);
  const branch = `feat/task-${shortId}`;
  const worktreePath = path.join(repoPath, '..', 'worktrees', `${projectId.slice(0, 8)}-${shortId}`);
  const tmuxSession = `claw-${shortId}`;

  await query(
    `UPDATE tasks
     SET branch = $1, worktree_path = $2, tmux_session = $3, status = 'spawned', started_at = now()
     WHERE id = $4`,
    [branch, worktreePath, tmuxSession, taskId]
  );

  await query(
    `INSERT INTO events (type, project_id, task_id, data)
     VALUES ('agent_spawned', $1, $2, $3)`,
    [projectId, taskId, { branch, tmuxSession, agentType }]
  );

  const scriptPath = path.join(SCRIPTS_DIR, 'spawn-agent.sh');

  const attachDir = uploadId ? path.join(UPLOAD_BASE, uploadId) : '';

  execFile(
    scriptPath,
    [projectId, taskId, description, agentType, model || '', repoPath, repoUrl || '', taskType || 'feature', attachDir],
    { timeout: 30000 },
    (err) => {
      if (err) {
        console.error(`spawn-agent.sh failed for task ${taskId}:`, err.message);
        query(
          `UPDATE tasks SET status = 'failed', completed_at = now() WHERE id = $1`,
          [taskId]
        ).catch(console.error);
        query(
          `INSERT INTO events (type, project_id, task_id, data) VALUES ('agent_exited', $1, $2, $3)`,
          [projectId, taskId, { error: err.message }]
        ).catch(console.error);
      }
    }
  );
}

export function startAgentCheckCron(intervalMs = 5 * 60 * 1000): NodeJS.Timeout {
  const scriptPath = path.join(SCRIPTS_DIR, 'check-agents.sh');

  const run = () => {
    execFile(scriptPath, [], { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) console.error('check-agents.sh error:', err.message);
      if (stdout) console.log('check-agents:', stdout.trim());
      if (stderr) console.error('check-agents stderr:', stderr.trim());
    });
  };

  run();
  return setInterval(run, intervalMs);
}
