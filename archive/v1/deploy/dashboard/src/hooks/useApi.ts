import { useCallback } from 'react';
import { usePolling } from './usePolling';
import { api } from '../api/client';
import type { Agent, Mission, Command, Event, FileItem, Session } from '../types';

// Hooks for Phoung API

/**
 * Hook to poll system health status
 */
export function useSystemHealth() {
  const fetchFn = useCallback(() => api.health(), []);
  const { data: health, error } = usePolling(fetchFn, 15000);

  const isOnline = !error && health?.status === 'ok';
  return { isOnline, health, error };
}

/**
 * Hook to fetch and poll agents
 */
export function useAgents() {
  const fetchFn = useCallback(() => api.agents.list(), []);
  const { data: agents, loading, error, refetch } = usePolling<Agent[]>(fetchFn, 10000);

  return { agents: agents || [], loading, error, refetch };
}

/**
 * Hook to fetch and poll missions
 */
export function useMissions(status?: string) {
  const fetchFn = useCallback(() => api.missions.list(status), [status]);
  const { data: missions, loading, error, refetch } = usePolling<Mission[]>(fetchFn, 10000);

  return { missions: missions || [], loading, error, refetch };
}

/**
 * Hook to fetch and poll commands
 */
export function useCommands(filters?: { status?: string; agent_id?: string; mission_id?: string }) {
  const fetchFn = useCallback(() => api.commands.list(filters), [filters]);
  const { data: commands, loading, error, refetch } = usePolling<Command[]>(fetchFn, 10000);

  return { commands: commands || [], loading, error, refetch };
}

/**
 * Hook to fetch and poll events
 */
export function useEvents(filters?: { type?: string; agent_id?: string; mission_id?: string; limit?: number }) {
  const fetchFn = useCallback(() => api.events.list(filters), [filters]);
  const { data: events, loading, error, refetch } = usePolling<Event[]>(fetchFn, 5000);

  return { events: events || [], loading, error, refetch };
}

/**
 * Hook to fetch and poll workspace files
 */
export function useFiles() {
  const fetchFn = useCallback(() => api.files.list(), []);
  const { data: files, loading, error, refetch } = usePolling<string[]>(fetchFn, 10000);

  return { files: files || [], loading, error, refetch };
}

/**
 * Hook to fetch a single file's content
 */
export function useFileContent(filepath: string | null) {
  const fetchFn = useCallback(() => {
    if (!filepath) return Promise.resolve(null);
    return api.files.get(filepath);
  }, [filepath]);
  
  const { data: fileContent, loading, error, refetch } = usePolling<FileItem | null>(fetchFn, 0);

  const saveFile = useCallback(async (content: string) => {
    if (!filepath) throw new Error('No file selected');
    return api.files.update(filepath, content);
  }, [filepath]);

  return { fileContent, loading, error, refetch, saveFile };
}

/**
 * Hook to fetch and poll sessions
 */
export function useSessions() {
  const fetchFn = useCallback(() => api.sessions.list(), []);
  const { data: sessions, loading, error, refetch } = usePolling<Session[]>(fetchFn, 15000);

  return { sessions: sessions || [], loading, error, refetch };
}

/**
 * Hook to fetch a session details
 */
export function useSession(sessionId: string | null) {
  const fetchFn = useCallback(() => {
    if (!sessionId) return Promise.resolve(null);
    return api.sessions.get(sessionId);
  }, [sessionId]);
  
  const { data: session, loading, error, refetch } = usePolling<Session | null>(fetchFn, 0);

  return { session, loading, error, refetch };
}
