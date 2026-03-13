import type { Task, TaskActivity, Conversation, ChatResponse, ProjectInfo, PrInfo, StreamEvent, Dispatch, RunningAgent } from './types';

const API_URL = import.meta.env.VITE_API_URL || '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

function chatStream(
  message: string,
  onEvent: (event: StreamEvent) => void,
  conversationId?: string,
  model?: string,
  project?: string,
) {
  const abortController = new AbortController();

  const promise = (async () => {
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversation_id: conversationId, model, project }),
      signal: abortController.signal,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            onEvent(JSON.parse(line.slice(6)) as StreamEvent);
          } catch { /* skip malformed */ }
        }
      }
    }
  })();

  return { promise, abort: () => abortController.abort() };
}

export const api = {
  health: () => request<{ status: string; version: string }>('/health'),

  agents: {
    running: () => request<RunningAgent[]>('/agents/running'),
  },

  tasks: {
    list: () => request<Task[]>('/tasks'),
    get: (taskId: string) => request<Task>(`/tasks/${taskId}`),
    merge: (taskId: string) => request<{ status: string }>(`/tasks/${taskId}/merge`, { method: 'POST' }),
    reject: (taskId: string) => request<{ status: string }>(`/tasks/${taskId}/reject`, { method: 'POST' }),
    stop: (taskId: string) => request<{ status: string }>(`/tasks/${taskId}/stop`, { method: 'POST' }),
    retry: (taskId: string) => request<{ status: string }>(`/tasks/${taskId}/retry`, { method: 'POST' }),
    activity: (taskId: string) => request<TaskActivity[]>(`/tasks/${taskId}/activity`),
    agentLog: (taskId: string, run: number) =>
      request<{ task_id: string; run: number; log: string }>(`/tasks/${taskId}/runs/${run}/log`),
    prInfo: (taskId: string) => request<PrInfo>(`/tasks/${taskId}/pr-info`),
    dispatches: (taskId: string) => request<Dispatch[]>(`/tasks/${taskId}/dispatches`),
    reply: (taskId: string, message: string, onEvent: (event: StreamEvent) => void) => {
      const abortController = new AbortController();
      const promise = (async () => {
        const response = await fetch(`${API_URL}/tasks/${taskId}/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
          signal: abortController.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!response.body) throw new Error('No response body');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try { onEvent(JSON.parse(line.slice(6)) as StreamEvent); } catch {}
            }
          }
        }
      })();
      return { promise, abort: () => abortController.abort() };
    },
  },

  chat: {
    stream: chatStream,
    send: (message: string, conversationId?: string, model?: string) =>
      request<ChatResponse>('/chat', {
        method: 'POST',
        body: JSON.stringify({ message, conversation_id: conversationId, model }),
      }),
    newConversation: () => request<{ conversation_id: string }>('/conversations/new', { method: 'POST' }),
    models: () => request<{ id: string; label: string; default: boolean }[]>('/models'),
  },

  chatActive: (conversationId: string) =>
    request<{ active: boolean; turn: { conversationId: string; message: string; startedAt: number } | null }>(
      `/chat/active?conversation_id=${encodeURIComponent(conversationId)}`
    ),

  session: {
    thinking: (conversationId: string) =>
      request<{ current: string; available: string[]; supported: boolean }>(
        `/session/thinking?conversation_id=${encodeURIComponent(conversationId)}`
      ),
    setThinking: (conversationId: string, level: string) =>
      request<{ current: string; supported: boolean }>('/session/thinking', {
        method: 'POST',
        body: JSON.stringify({ conversation_id: conversationId, level }),
      }),
    compact: (conversationId: string) =>
      request<{ tokensBefore: number; summary: string }>('/session/compact', {
        method: 'POST',
        body: JSON.stringify({ conversation_id: conversationId }),
      }),
    stats: (conversationId: string) =>
      request<{
        userMessages: number;
        assistantMessages: number;
        toolCalls: number;
        totalMessages: number;
        tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
        cost: number;
        context: { tokens: number | null; contextWindow: number; percent: number | null } | null;
      } | null>(`/session/stats?conversation_id=${encodeURIComponent(conversationId)}`),
  },

  conversations: {
    list: () => request<Conversation[]>('/conversations'),
    get: (convId: string) => request<{ id: string; content: string }>(`/conversations/${convId}`),
  },

  projects: {
    list: () => request<ProjectInfo[]>('/projects'),
  },

  logs: {
    get: (service: string, lines = 200) =>
      request<{ service: string; container: string; logs: string }>(`/logs/${service}?lines=${lines}`),
  },
};
