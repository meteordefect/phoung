import type { Agent, Mission, Command, Event, HealthStatus, FileItem, Session, Project, Task } from '../types';
import { eventBus } from '../lib/eventBus';

const API_URL = import.meta.env.VITE_API_URL || '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  health: () => request<HealthStatus>('/health'),
  
  agents: {
    list: () => request<Agent[]>('/agents'),
    get: (id: string) => request<Agent>(`/agents/${id}`),
    update: (id: string, data: { name?: string; description?: string }) =>
      request<Agent>(`/agents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },
  
  missions: {
    list: (status?: string) => 
      request<Mission[]>(`/missions${status ? `?status=${status}` : ''}`),
    get: (id: string) => request<Mission & { commands: Command[] }>(`/missions/${id}`),
    create: (data: { name: string; description?: string }) =>
      request<Mission>('/missions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { status?: string; description?: string }) =>
      request<Mission>(`/missions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    queueCommand: (id: string, data: {
      type: string;
      payload?: Record<string, any>;
      agent_id?: string;
      priority?: number;
    }) =>
      request<Command>(`/missions/${id}/commands`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  
  commands: {
    list: (filters?: { status?: string; agent_id?: string; mission_id?: string }) => {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.agent_id) params.set('agent_id', filters.agent_id);
      if (filters?.mission_id) params.set('mission_id', filters.mission_id);
      return request<Command[]>(`/commands?${params}`);
    },
  },
  
  events: {
    list: (filters?: { type?: string; agent_id?: string; mission_id?: string; limit?: number }) => {
      const params = new URLSearchParams();
      if (filters?.type) params.set('type', filters.type);
      if (filters?.agent_id) params.set('agent_id', filters.agent_id);
      if (filters?.mission_id) params.set('mission_id', filters.mission_id);
      if (filters?.limit) params.set('limit', filters.limit.toString());
      return request<Event[]>(`/events?${params}`);
    },
  },
  
  files: {
    list: () => request<string[]>('/files'),
    get: (path: string) => request<FileItem>(`/files/${path}`),
    update: (path: string, content: string) =>
      request<FileItem>(`/files/${path}`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),
  },
  
  sessions: {
    list: () => request<Session[]>('/sessions'),
    get: (id: string) => request<Session>(`/sessions/${id}`),
  },

  projects: {
    list: () => request<Project[]>('/projects'),
    get: (id: string) => request<Project>(`/projects/${id}`),
    create: (data: { name: string; repo_url: string; default_branch?: string }) =>
      request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Omit<Project, 'id' | 'created_at' | 'updated_at'>>) =>
      request<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/projects/${id}`, { method: 'DELETE' }),
  },

  sshKey: {
    get: () => request<{ exists: boolean; public_key: string | null }>('/ssh-key'),
    generate: () => request<{ created: boolean; public_key: string; message?: string }>('/ssh-key/generate', { method: 'POST' }),
  },

  uploads: {
    create: async (files: File[]): Promise<{ upload_id: string; files: { name: string; size: number }[] }> => {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      const response = await fetch(`${API_URL}/uploads`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
      return response.json();
    },
  },

  tasks: {
    list: (projectId: string, status?: string) =>
      request<Task[]>(`/projects/${projectId}/tasks${status ? `?status=${status}` : ''}`),
    get: (taskId: string) => request<Task>(`/tasks/${taskId}`),
    create: (projectId: string, data: { title: string; description: string; agent_type?: string; task_type?: string; model?: string; upload_id?: string }) =>
      request<Task>(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
    cancel: (taskId: string) =>
      request<{ ok: boolean }>(`/tasks/${taskId}/cancel`, { method: 'POST' }),
    retry: (taskId: string) =>
      request<{ ok: boolean }>(`/tasks/${taskId}/retry`, { method: 'POST' }),
    mergeQueue: (projectId: string) =>
      request<Task[]>(`/projects/${projectId}/merge-queue`),
    merge: (taskId: string) =>
      request<{ ok: boolean }>(`/tasks/${taskId}/merge`, { method: 'POST' }),
    requestChanges: (taskId: string, feedback: string) =>
      request<{ ok: boolean }>(`/tasks/${taskId}/request-changes`, {
        method: 'POST',
        body: JSON.stringify({ feedback }),
      }),
    activity: (projectId: string, limit?: number) =>
      request<Event[]>(`/projects/${projectId}/activity${limit ? `?limit=${limit}` : ''}`),
    counts: (projectId: string) =>
      request<{ tasks_pending: number; merge_ready: number }>(`/projects/${projectId}/counts`),
  },
};

const SSE_EVENT_MAP: Record<string, string> = {
  task_updated: 'task:updated',
  pr_merged: 'pr:merged',
  agent_status: 'agent:status',
};

let sseSource: EventSource | null = null;

export function connectSSE() {
  if (sseSource) return;

  const url = `${API_URL}/events/stream`;
  sseSource = new EventSource(url);

  for (const [sseEvent, busEvent] of Object.entries(SSE_EVENT_MAP)) {
    sseSource.addEventListener(sseEvent, (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        eventBus.emit(busEvent, data);
      } catch { /* malformed */ }
    });
  }

  sseSource.onerror = () => {
    sseSource?.close();
    sseSource = null;
    setTimeout(connectSSE, 5000);
  };
}

export function disconnectSSE() {
  sseSource?.close();
  sseSource = null;
}
