-- Phoung v4 - Projects and Tasks
-- Phase 1: Add projects and tasks tables; evolve events; keep old tables intact

CREATE TABLE IF NOT EXISTS projects (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  repo_url       TEXT NOT NULL,
  repo_path      TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  -- pending → spawned → coding → pr_open → ci_pending → review → merged → failed
  agent_type     TEXT NOT NULL DEFAULT 'claude',
  model          TEXT,
  branch         TEXT,
  worktree_path  TEXT,
  tmux_session   TEXT,
  pr_number      INTEGER,
  pr_url         TEXT,
  ci_status      TEXT,
  spawn_retries  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ
);

-- Add project_id and task_id to events for v4 scoping
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_id    UUID REFERENCES tasks(id)    ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_events_project_id ON events(project_id);
CREATE INDEX IF NOT EXISTS idx_events_task_id    ON events(task_id);
