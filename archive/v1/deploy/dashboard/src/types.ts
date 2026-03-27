export interface Project {
  id: string;
  name: string;
  repo_url: string;
  repo_path: string;
  default_branch: string;
  created_at: string;
  updated_at: string;
  total_tasks?: number;
  active_tasks?: number;
}

export type TaskStatus =
  | 'pending'
  | 'spawned'
  | 'coding'
  | 'pr_open'
  | 'ci_pending'
  | 'review'
  | 'merged'
  | 'failed';

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  agent_type: 'claude' | 'codex' | 'kimi' | 'glm';
  task_type: 'feature' | 'bugfix' | 'refactor' | 'test' | 'docs';
  model: string | null;
  branch: string | null;
  worktree_path: string | null;
  tmux_session: string | null;
  pr_number: number | null;
  pr_url: string | null;
  ci_status: 'pending' | 'passing' | 'failing' | null;
  spawn_retries: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  last_heartbeat?: string;
  health: Record<string, any>;
  status: 'online' | 'stale' | 'offline';
  ip_address?: string;
  openclaw_version?: string;
  created_at: string;
  updated_at: string;
}

export interface Mission {
  id: string;
  name: string;
  description?: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  updated_at: string;
  total_commands?: number;
  completed_commands?: number;
  failed_commands?: number;
}

export interface Command {
  id: string;
  mission_id?: string;
  agent_id?: string;
  type: string;
  payload: Record<string, any>;
  status: 'pending' | 'assigned' | 'running' | 'completed' | 'failed';
  priority: number;
  result?: Record<string, any>;
  assigned_at?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  agent_name?: string;
  mission_name?: string;
}

export interface Event {
  id: string;
  type: string;
  agent_id?: string;
  mission_id?: string;
  command_id?: string;
  data: Record<string, any>;
  created_at: string;
  agent_name?: string;
  mission_name?: string;
}

export interface HealthStatus {
  status: 'ok' | 'error';
  db: string;
  timestamp: string;
}

export interface FileItem {
  path: string;
  content?: string;
  size?: number;
  modified?: string;
}

export interface Session {
  id: string;
  created: string;
  size: number;
  content?: any;
}
