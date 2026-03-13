import { useState, useEffect, useCallback, useRef } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sessionKey?: string;
}

export interface ChatSession {
  key: string;
  preview: string;
  timestamp: number;
  messageCount: number;
}

interface ChatState {
  messages: Message[];
  streamingContent: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isWaitingForReply: boolean;
  error: string | null;
}

// --- localStorage persistence ---

const SESSIONS_INDEX_KEY = 'openclaw-chat-sessions';
const CURRENT_SESSION_KEY = 'openclaw-chat-active-session';
const msgStorageKey = (key: string) => `openclaw-chat-msg-${key}`;
const STREAMING_KEY = 'openclaw-chat-streaming';

export function loadSessionsIndex(): ChatSession[] {
  try { return JSON.parse(localStorage.getItem(SESSIONS_INDEX_KEY) || '[]'); }
  catch { return []; }
}

function saveSessionsIndex(sessions: ChatSession[]) {
  try { localStorage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(sessions)); }
  catch { /* storage full */ }
}

function loadMessagesFromStorage(sessionKey: string): Message[] {
  try { return JSON.parse(localStorage.getItem(msgStorageKey(sessionKey)) || '[]'); }
  catch { return []; }
}

function saveMessagesToStorage(sessionKey: string, messages: Message[]) {
  try { localStorage.setItem(msgStorageKey(sessionKey), JSON.stringify(messages)); }
  catch { /* storage full */ }
}

function loadStreamingFromStorage(): { sessionKey: string; content: string; timestamp: number } | null {
  try {
    const raw = localStorage.getItem(STREAMING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > 120_000) {
      localStorage.removeItem(STREAMING_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

function saveStreamingToStorage(sessionKey: string, content: string) {
  try {
    localStorage.setItem(STREAMING_KEY, JSON.stringify({
      sessionKey,
      content,
      timestamp: Date.now(),
    }));
  } catch { /* storage full */ }
}

function clearStreamingFromStorage() {
  try { localStorage.removeItem(STREAMING_KEY); }
  catch { /* storage full */ }
}

/** Build the main session key — scoped per project if provided */
const mainSessionKey = (projectId?: string) =>
  projectId ? `project-${projectId}` : 'main';

function isLegacyRandomKey(key: string): boolean {
  return /^dashboard-[a-z0-9]+-\d+$/.test(key) || /^webchat-/.test(key);
}

function getOrCreateCurrentSessionKey(defaultKey: string): string {
  const stored = localStorage.getItem(CURRENT_SESSION_KEY);
  if (stored && !isLegacyRandomKey(stored)) return stored;
  localStorage.setItem(CURRENT_SESSION_KEY, defaultKey);
  return defaultKey;
}

function updateSessionsIndex(sessionKey: string, messages: Message[]): ChatSession[] {
  const sessions = loadSessionsIndex();
  const lastMsg = messages[messages.length - 1];
  const firstUserMsg = messages.find(m => m.role === 'user');
  const preview = firstUserMsg
    ? firstUserMsg.content.substring(0, 80)
    : (lastMsg?.content.substring(0, 80) || '');

  const idx = sessions.findIndex(s => s.key === sessionKey);
  const entry: ChatSession = {
    key: sessionKey,
    preview,
    timestamp: lastMsg?.timestamp || Date.now(),
    messageCount: messages.length,
  };

  if (idx >= 0) sessions[idx] = entry;
  else sessions.unshift(entry);

  sessions.sort((a, b) => b.timestamp - a.timestamp);
  const trimmed = sessions.slice(0, 50);
  saveSessionsIndex(trimmed);
  return trimmed;
}

// --- Gateway history sync ---

function parseGatewayMessages(messages: any[], sessionKey: string): Message[] {
  return messages
    .filter((m: any) => m.role === 'user' || m.role === 'assistant')
    .map((m: any) => {
      const text = typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
          : '';
      return {
        id: m.id || `${m.role}-${m.timestamp}`,
        role: m.role as 'user' | 'assistant',
        content: text || '',
        timestamp: m.timestamp || Date.now(),
        sessionKey,
      };
    })
    .filter((m: Message) => m.content.trim() !== '');
}

function extractTextFromMessage(message: any): string {
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) {
    return message.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  }
  if (message?.content) return extractTextFromMessage(message.content);
  if (message?.text) return message.text;
  return '';
}

async function syncSessionsFromGateway(
  sendRpc: (method: string, params?: any) => Promise<any>,
  sessionKeyRef: React.MutableRefObject<string>,
  setState: React.Dispatch<React.SetStateAction<ChatState>>,
  setSavedSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>,
) {
  try {
    const listRes = await sendRpc('sessions.list', { includeLastMessage: true }).catch(() => null);
    const serverSessions: Array<{ key: string; updatedAt: number | null }> = [];
    if (listRes?.ok && listRes.result?.sessions) {
      for (const s of listRes.result.sessions) {
        if (s.key && s.updatedAt) serverSessions.push({ key: s.key, updatedAt: s.updatedAt });
      }
      serverSessions.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    }

    const targetKey = serverSessions.length > 0 ? serverSessions[0].key : sessionKeyRef.current;

    const res = await sendRpc('chat.history', { sessionKey: targetKey });
    if (!res.ok || !res.result?.messages) return;

    const historyMessages = parseGatewayMessages(res.result.messages, res.result.sessionKey ?? targetKey);
    if (historyMessages.length > 0) {
      const effectiveKey = res.result.sessionKey ?? targetKey;
      sessionKeyRef.current = effectiveKey;
      localStorage.setItem(CURRENT_SESSION_KEY, effectiveKey);

      setState(prev => ({ ...prev, messages: historyMessages }));
      saveMessagesToStorage(effectiveKey, historyMessages);
      setSavedSessions(updateSessionsIndex(effectiveKey, historyMessages));
    }
  } catch (err) {
    console.error('[OpenClaw] Failed to sync sessions:', err);
  }
}

// --- Hook ---

/**
 * Hook to connect to OpenClaw Gateway via WebSocket
 * Uses OpenClaw's native protocol for chat with localStorage persistence
 */
export function useOpenClawChat(gatewayUrl: string, gatewayToken: string, projectId?: string) {
  const MAIN_SESSION_KEY = mainSessionKey(projectId);
  const initialSessionKey = getOrCreateCurrentSessionKey(MAIN_SESSION_KEY);

  const [activeSessionKey, setActiveSessionKey] = useState<string>(initialSessionKey);
  const [savedSessions, setSavedSessions] = useState<ChatSession[]>(loadSessionsIndex);
  const streamingContentRef = useRef<string>('');

  const savedStreaming = loadStreamingFromStorage();
  const restoredStreaming = savedStreaming?.sessionKey === initialSessionKey ? savedStreaming.content : null;

  const [state, setState] = useState<ChatState>(() => ({
    messages: loadMessagesFromStorage(initialSessionKey),
    streamingContent: restoredStreaming,
    isConnected: false,
    isConnecting: false,
    isWaitingForReply: !!restoredStreaming,
    error: null,
  }));

  const wsRef = useRef<WebSocket | null>(null);
  const sessionKeyRef = useRef<string>(initialSessionKey);
  const clientIdRef = useRef<string>('webchat-ui');
  const pendingRpcsRef = useRef<Map<string, { resolve: (r: any) => void; reject: (e: Error) => void }>>(new Map());
  const rpcIdCounter = useRef(0);

  useEffect(() => {
    sessionKeyRef.current = activeSessionKey;
  }, [activeSessionKey]);

  useEffect(() => {
    const key = sessionKeyRef.current;
    saveMessagesToStorage(key, state.messages);
    if (state.messages.length > 0) {
      const updated = updateSessionsIndex(key, state.messages);
      setSavedSessions(updated);
    }
  }, [state.messages]);

  const sendRpc = useCallback((method: string, params: any = {}): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to gateway'));
        return;
      }

      const id = `rpc-${++rpcIdCounter.current}`;
      const frame = {
        type: 'req',
        id,
        method,
        params,
      };

      pendingRpcsRef.current.set(id, { resolve, reject });
      wsRef.current.send(JSON.stringify(frame));

      setTimeout(() => {
        if (pendingRpcsRef.current.has(id)) {
          pendingRpcsRef.current.delete(id);
          reject(new Error('RPC timeout'));
        }
      }, 30000);
    });
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    try {
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      streamingContentRef.current = '';
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, userMessage],
        streamingContent: null,
        isWaitingForReply: true,
      }));

      await sendRpc('chat.send', {
        sessionKey: sessionKeyRef.current,
        message: content,
        idempotencyKey: userMessage.id,
        timeoutMs: 0,
      });
    } catch (err) {
      setState(prev => ({
        ...prev,
        isWaitingForReply: false,
        error: err instanceof Error ? err.message : 'Failed to send message',
      }));
    }
  }, [sendRpc]);

  const startNewSession = useCallback(async () => {
    localStorage.setItem(CURRENT_SESSION_KEY, MAIN_SESSION_KEY);
    sessionKeyRef.current = MAIN_SESSION_KEY;
    setActiveSessionKey(MAIN_SESSION_KEY);
    streamingContentRef.current = '';
    clearStreamingFromStorage();
    localStorage.removeItem(msgStorageKey(MAIN_SESSION_KEY));
    setState(prev => ({ ...prev, messages: [], streamingContent: null }));
    try { await sendRpc('chat.send', { message: '/new', sessionKey: MAIN_SESSION_KEY }); } catch { /* best effort */ }
  }, [sendRpc]);

  const loadSession = useCallback((key: string) => {
    const messages = loadMessagesFromStorage(key);
    localStorage.setItem(CURRENT_SESSION_KEY, key);
    sessionKeyRef.current = key;
    setActiveSessionKey(key);
    streamingContentRef.current = '';

    const savedStreamingData = loadStreamingFromStorage();
    const restoredStreamingContent = savedStreamingData?.sessionKey === key ? savedStreamingData.content : null;

    setState(prev => ({
      ...prev,
      messages,
      streamingContent: restoredStreamingContent || null,
      isWaitingForReply: !!restoredStreamingContent,
    }));
  }, []);

  const deleteSession = useCallback((key: string) => {
    localStorage.removeItem(msgStorageKey(key));
    const sessions = loadSessionsIndex().filter(s => s.key !== key);
    saveSessionsIndex(sessions);
    setSavedSessions(sessions);
    if (key === sessionKeyRef.current) {
      localStorage.setItem(CURRENT_SESSION_KEY, MAIN_SESSION_KEY);
      sessionKeyRef.current = MAIN_SESSION_KEY;
      setActiveSessionKey(MAIN_SESSION_KEY);
      const msgs = loadMessagesFromStorage(MAIN_SESSION_KEY);
      setState(prev => ({ ...prev, messages: msgs }));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;

    const scheduleReconnect = () => {
      if (cancelled) return;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      reconnectAttempts++;
      reconnectTimeout = setTimeout(() => {
        if (!cancelled) connect();
      }, delay);
    };

    const connect = () => {
      if (cancelled) return;
      setState(prev => ({ ...prev, isConnecting: true }));

      const ws = new WebSocket(gatewayUrl);
      wsRef.current = ws;

      let connectSent = false;

      ws.onopen = () => {
        console.log('[OpenClaw] WebSocket connected');
        reconnectAttempts = 0;

        setTimeout(() => {
          if (!connectSent && ws.readyState === WebSocket.OPEN) {
            connectSent = true;
            const connectId = `connect-${Date.now()}`;

            pendingRpcsRef.current.set(connectId, {
              resolve: (result) => {
                if (result.ok) {
                  console.log('[OpenClaw] Connected successfully');
                  setState(prev => ({
                    ...prev,
                    isConnected: true,
                    isConnecting: false,
                    error: null,
                  }));
                  syncSessionsFromGateway(sendRpc, sessionKeyRef, setState, setSavedSessions);
                } else {
                  console.error('[OpenClaw] Connect failed:', result.error);
                  setState(prev => ({
                    ...prev,
                    error: `Connection failed: ${result.error}`,
                    isConnecting: false,
                  }));
                }
              },
              reject: (err) => {
                console.error('[OpenClaw] Connect error:', err);
                setState(prev => ({
                  ...prev,
                  error: err.message,
                  isConnecting: false,
                }));
              },
            });

            ws.send(JSON.stringify({
              type: 'req',
              id: connectId,
              method: 'connect',
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                role: 'operator',
                scopes: ['operator.read', 'operator.write'],
                client: {
                  id: clientIdRef.current,
                  displayName: 'Phoung Dashboard',
                  version: '1.0.0',
                  platform: 'web',
                  mode: 'webchat',
                  instanceId: sessionKeyRef.current,
                },
                caps: [],
                auth: {
                  token: gatewayToken,
                  password: gatewayToken,
                },
              },
            }));
          }
        }, 100);
      };

      ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'res' && msg.id && pendingRpcsRef.current.has(msg.id)) {
          const pending = pendingRpcsRef.current.get(msg.id)!;
          pendingRpcsRef.current.delete(msg.id);

          if (msg.ok) {
            pending.resolve({ ok: true, result: msg.payload });
          } else {
            const errorMsg = msg.error?.message || 'Unknown error';
            pending.resolve({ ok: false, error: errorMsg });
          }
          return;
        }

        if (msg.type === 'event' && msg.event === 'chat') {
          const payload = msg.payload;

          if (payload.state === 'delta' && payload.message) {
            const text = extractTextFromMessage(payload.message);
            if (text) {
              streamingContentRef.current = text;
              saveStreamingToStorage(sessionKeyRef.current, text);
              setState(prev => ({
                ...prev,
                streamingContent: text,
              }));
            }
          } else if (payload.state === 'final') {
            const content = payload.message
              ? extractTextFromMessage(payload.message)
              : streamingContentRef.current;
            const assistantMessage: Message = {
              id: `assistant-${Date.now()}-${payload.seq ?? 0}`,
              role: 'assistant',
              content: content || 'Thinking…',
              timestamp: payload.message?.timestamp || Date.now(),
              sessionKey: payload.sessionKey,
            };
            streamingContentRef.current = '';
            clearStreamingFromStorage();
            setState(prev => ({
              ...prev,
              messages: [...prev.messages, assistantMessage],
              streamingContent: null,
              isWaitingForReply: false,
            }));
          } else if (payload.state === 'aborted' || payload.state === 'error') {
            const content = streamingContentRef.current;
            if (content && payload.state === 'aborted') {
              streamingContentRef.current = '';
              clearStreamingFromStorage();
              const assistantMessage: Message = {
                id: `assistant-${Date.now()}-aborted`,
                role: 'assistant',
                content,
                timestamp: Date.now(),
                sessionKey: payload.sessionKey,
              };
              setState(prev => ({
                ...prev,
                messages: [...prev.messages, assistantMessage],
                streamingContent: null,
                isWaitingForReply: false,
              }));
            } else {
              const errorMsg = payload.state === 'error' ? (payload.errorMessage ?? 'Chat error') : '';
              streamingContentRef.current = '';
              clearStreamingFromStorage();
              const errorMessage: Message | null =
                errorMsg
                  ? {
                      id: `assistant-${Date.now()}-error`,
                      role: 'assistant' as const,
                      content: `Error: ${errorMsg}`,
                      timestamp: Date.now(),
                      sessionKey: payload.sessionKey,
                    }
                  : null;
              setState(prev => ({
                ...prev,
                messages: errorMessage ? [...prev.messages, errorMessage] : prev.messages,
                streamingContent: null,
                isWaitingForReply: false,
                error: errorMsg || prev.error,
              }));
            }
          }
        }
      } catch (err) {
        console.error('[OpenClaw] Failed to parse message:', err);
      }
    };

      ws.onerror = (event) => {
        console.error('[OpenClaw] WebSocket error:', event);

        const errorMessage = `Unable to connect to OpenClaw Gateway at ${gatewayUrl}. ` +
          `Make sure the gateway is running on port 18789 and accessible.`;

        setState(prev => ({
          ...prev,
          error: errorMessage,
          isConnecting: false,
        }));
      };

      ws.onclose = (event) => {
        console.log('[OpenClaw] WebSocket closed:', event.code, event.reason);
        wsRef.current = null;
        setState(prev => ({
          ...prev,
          isConnected: false,
          isConnecting: false,
          ...(event.code !== 1000 && {
            error: `Connection closed (${event.code}${event.reason ? `: ${event.reason}` : ''}). ` +
              `The OpenClaw Gateway may not be running.`
          }),
        }));

        pendingRpcsRef.current.forEach((pending) => {
          pending.reject(new Error('Connection closed'));
        });
        pendingRpcsRef.current.clear();

        if (!cancelled && event.code !== 1000) {
          scheduleReconnect();
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, 'Component unmount');
      }
      wsRef.current = null;
    };
  }, [gatewayUrl, gatewayToken]);

  return {
    ...state,
    activeSessionKey,
    savedSessions,
    sendMessage,
    startNewSession,
    loadSession,
    deleteSession,
  };
}
