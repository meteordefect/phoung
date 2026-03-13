export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'coding'
  | 'pr_open'
  | 'ready_to_merge'
  | 'needs_human'
  | 'completed'
  | 'failed'
  | 'rejected';

export interface TaskMeta {
  id: string;
  project: string;
  status: TaskStatus;
  agent_type?: string;
  container_id?: string;
  branch?: string;
  pr?: string;
  created?: string;
  retries?: number;
  question?: string;
  [key: string]: any;
}

export interface Task {
  filename: string;
  meta: TaskMeta;
  body: string;
  path?: string;
}

export interface Conversation {
  id: string;
  project: string | null;
  started: string | null;
  summary: string | null;
  filename: string;
}

export interface ChatResponse {
  response: string;
  conversation_id: string;
}

// --- SSE stream event types ---

export type StreamEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; content: string }
  | { type: 'thinking_end' }
  | { type: 'tool_start'; toolCallId: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_update'; toolCallId: string; name: string; partialResult: string }
  | { type: 'tool_end'; toolCallId: string; name: string; result: string; isError: boolean }
  | { type: 'turn_start' }
  | { type: 'turn_end' }
  | { type: 'status'; message: string }
  | { type: 'error'; message: string }
  | { type: 'done'; conversation_id: string };

export interface MessageBlock {
  id: string;
  kind: 'text' | 'thinking' | 'tool' | 'status' | 'error';
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  isError?: boolean;
  isComplete?: boolean;
}

export interface StreamMessage {
  id: string;
  role: 'user' | 'assistant';
  blocks: MessageBlock[];
  timestamp: number;
  isStreaming?: boolean;
}

export interface ProjectInfo {
  name: string;
  context_preview: string;
}

export interface PrFileChange {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface PrCheck {
  name: string;
  status: string;
  conclusion: string | null;
}

export interface PrInfo {
  title: string;
  url: string;
  branch: string;
  files: PrFileChange[];
  checks: PrCheck[];
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface Dispatch {
  mode: 'handoff' | 'notify';
  question: string;
  ts: string;
  reply?: string;
  replyTs?: string;
}

export interface RunningAgent {
  taskId: string;
  containerId: string;
  run: number;
  project: string;
  agentType: string;
  startedAt: string;
}

export type ActivityType =
  | 'agent_spawned'
  | 'agent_completed'
  | 'phoung_note'
  | 'status_change';

export interface TaskActivity {
  ts: string;
  type: ActivityType;
  run?: number;
  container_id?: string;
  agent_type?: string;
  prompt?: string;
  exit_code?: number;
  log_file?: string;
  message?: string;
  from?: string;
  to?: string;
}
