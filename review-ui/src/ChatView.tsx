import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { Send, Bot, ChevronDown, Square, Brain, Minimize2, BarChart3 } from 'lucide-react';
import { api } from './api';
import { StreamMessageCard } from './MessageCard';
import type { StreamMessage, MessageBlock, StreamEvent } from './types';

interface ModelOption { id: string; label: string; default?: boolean; }

interface ThinkingInfo { current: string; available: string[]; supported: boolean; }

interface SessionStats {
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  totalMessages: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost: number;
  context: { tokens: number | null; contextWindow: number; percent: number | null } | null;
}

interface ChatViewProps {
  initialConversationId: string | null;
  onConversationCreated: (convId: string) => void;
  project?: string;
}

let blockCounter = 0;
function nextBlockId() { return `blk-${++blockCounter}`; }

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function ChatView({ initialConversationId, onConversationCreated, project }: ChatViewProps) {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [activeModel, setActiveModel] = useState<string>('');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [thinking, setThinking] = useState<ThinkingInfo>({ current: 'off', available: [], supported: false });
  const [showThinkingPicker, setShowThinkingPicker] = useState(false);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [compacting, setCompacting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const blocksRef = useRef<MessageBlock[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    api.chat.models().then(m => {
      setModels(m);
      if (m.length > 0 && !activeModel) {
        const def = m.find(x => x.default) ?? m[0];
        setActiveModel(def.id);
      }
    }).catch(() => {});
  }, []);

  const refreshSessionInfo = useCallback((convId: string) => {
    api.session.thinking(convId).then(setThinking).catch(() => {});
    api.session.stats(convId).then(s => { if (s) setStats(s); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (initialConversationId) {
      loadConversation(initialConversationId);
      checkPendingTurn(initialConversationId);
    }
  }, []);

  const checkPendingTurn = async (convId: string) => {
    try {
      const saved = localStorage.getItem(`pending-turn-${convId}`);
      if (!saved) return;
      const pending = JSON.parse(saved);
      const { active } = await api.chatActive(convId);
      if (!active) {
        localStorage.removeItem(`pending-turn-${convId}`);
        return;
      }
      setMessages(prev => [
        ...prev,
        {
          id: `recovered-user-${Date.now()}`,
          role: 'user' as const,
          blocks: [{ id: nextBlockId(), kind: 'text' as const, content: pending.message }],
          timestamp: pending.timestamp,
        },
        {
          id: `recovered-assistant-${Date.now()}`,
          role: 'assistant' as const,
          blocks: [{ id: nextBlockId(), kind: 'status' as const, content: 'Turn in progress (reconnected after page reload)', isComplete: true }],
          timestamp: Date.now(),
          isStreaming: false,
        },
      ]);
    } catch {}
  };

  const savePendingTurn = (convId: string, message: string) => {
    localStorage.setItem(`pending-turn-${convId}`, JSON.stringify({ message, timestamp: Date.now() }));
  };

  const clearPendingTurn = (convId: string) => {
    localStorage.removeItem(`pending-turn-${convId}`);
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wasNearBottom = useRef(true);

  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (wasNearBottom.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const parseConversationMessages = (raw: string): StreamMessage[] => {
    const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    const body = bodyMatch ? bodyMatch[1] : raw;
    const parsed: StreamMessage[] = [];
    const regex = /\*\*(Marten|Phoung)\s*\((\d{2}:\d{2})\):\*\*\s*([\s\S]*?)(?=\*\*(?:Marten|Phoung)\s*\(\d{2}:\d{2}\):\*\*|$)/g;
    let match;
    while ((match = regex.exec(body)) !== null) {
      const [, speaker, , content] = match;
      const trimmed = content.trim();
      if (!trimmed) continue;
      parsed.push({
        id: `hist-${parsed.length}`,
        role: speaker === 'Marten' ? 'user' as const : 'assistant' as const,
        blocks: [{ id: `hist-blk-${parsed.length}`, kind: 'text', content: trimmed }],
        timestamp: Date.now() - ((1000 - parsed.length) * 60000),
      });
    }
    return parsed;
  };

  const loadConversation = async (convId: string) => {
    try {
      const data = await api.conversations.get(convId);
      setConversationId(convId);
      setMessages(parseConversationMessages(data.content));
    } catch { /* ignore */ }
  };

  const scheduleFlush = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.isStreaming) {
          updated[updated.length - 1] = { ...last, blocks: [...blocksRef.current] };
        }
        return updated;
      });
    });
  }, []);

  const findOrCreateBlock = (kind: MessageBlock['kind'], predicate?: (b: MessageBlock) => boolean): MessageBlock => {
    if (predicate) {
      const existing = blocksRef.current.find(predicate);
      if (existing) return existing;
    }
    const block: MessageBlock = { id: nextBlockId(), kind, content: '' };
    blocksRef.current.push(block);
    return block;
  };

  const getActiveTextBlock = (): MessageBlock => {
    const last = blocksRef.current[blocksRef.current.length - 1];
    if (last?.kind === 'text') return last;
    return findOrCreateBlock('text');
  };

  const handleStreamEvent = useCallback((event: StreamEvent) => {
    switch (event.type) {
      case 'text_delta': {
        const block = getActiveTextBlock();
        block.content += event.content;
        break;
      }
      case 'thinking_start': {
        const block: MessageBlock = { id: nextBlockId(), kind: 'thinking', content: '', isComplete: false };
        blocksRef.current.push(block);
        break;
      }
      case 'thinking_delta': {
        const block = blocksRef.current.findLast(b => b.kind === 'thinking' && !b.isComplete);
        if (block) block.content += event.content;
        break;
      }
      case 'thinking_end': {
        const block = blocksRef.current.findLast(b => b.kind === 'thinking' && !b.isComplete);
        if (block) block.isComplete = true;
        break;
      }
      case 'tool_start': {
        const block: MessageBlock = {
          id: nextBlockId(),
          kind: 'tool',
          content: '',
          toolName: event.name,
          toolArgs: event.args,
          isComplete: false,
        };
        blocksRef.current.push(block);
        break;
      }
      case 'tool_update': {
        const block = blocksRef.current.findLast(
          b => b.kind === 'tool' && !b.isComplete && b.toolName === event.name
        );
        if (block) block.toolResult = (block.toolResult || '') + event.partialResult;
        break;
      }
      case 'tool_end': {
        const block = blocksRef.current.findLast(
          b => b.kind === 'tool' && !b.isComplete && b.toolName === event.name
        );
        if (block) {
          block.toolResult = event.result;
          block.isError = event.isError;
          block.isComplete = true;
        }
        break;
      }
      case 'status': {
        blocksRef.current.push({ id: nextBlockId(), kind: 'status', content: event.message, isComplete: true });
        break;
      }
      case 'error': {
        blocksRef.current.push({ id: nextBlockId(), kind: 'error', content: event.message, isComplete: true });
        break;
      }
      case 'done': {
        const convId = event.conversation_id as string | undefined;
        if (convId) {
          clearPendingTurn(convId);
          setConversationId(convId);
          onConversationCreated(convId);
          refreshSessionInfo(convId);
        }
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.isStreaming) {
            updated[updated.length - 1] = { ...last, blocks: [...blocksRef.current], isStreaming: false };
          }
          return updated;
        });
        setStreaming(false);
        abortRef.current = null;
        return;
      }
    }
    scheduleFlush();
  }, [scheduleFlush, onConversationCreated]);

  const handleSend = async () => {
    if (!input.trim() || streaming) return;

    const userMsg: StreamMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      blocks: [{ id: nextBlockId(), kind: 'text', content: input.trim() }],
      timestamp: Date.now(),
    };

    const assistantMsg: StreamMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      blocks: [],
      timestamp: Date.now(),
      isStreaming: true,
    };

    blocksRef.current = [];
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    const text = input.trim();
    setInput('');
    setStreaming(true);

    if (conversationId) savePendingTurn(conversationId, text);

    try {
      const { promise, abort } = api.chat.stream(
        text,
        handleStreamEvent,
        conversationId || undefined,
        activeModel || undefined,
        project,
      );
      abortRef.current = abort;
      await promise;
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        blocksRef.current.push({
          id: nextBlockId(), kind: 'error',
          content: err.message || 'Connection failed', isComplete: true,
        });
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.isStreaming) {
            updated[updated.length - 1] = { ...last, blocks: [...blocksRef.current], isStreaming: false };
          }
          return updated;
        });
      }
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleAbort = () => {
    abortRef.current?.();
    setStreaming(false);
    abortRef.current = null;
    setMessages(prev => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.isStreaming) {
        updated[updated.length - 1] = { ...last, blocks: [...blocksRef.current], isStreaming: false };
      }
      return updated;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleThinkingChange = async (level: string) => {
    if (!conversationId) return;
    setShowThinkingPicker(false);
    const result = await api.session.setThinking(conversationId, level).catch(() => null);
    if (result) setThinking(prev => ({ ...prev, current: result.current, supported: result.supported }));
  };

  const handleCompact = async () => {
    if (!conversationId || compacting) return;
    setCompacting(true);
    try {
      await api.session.compact(conversationId);
      refreshSessionInfo(conversationId);
    } catch { /* ignore */ }
    setCompacting(false);
  };

  const thinkingLabel = thinking.current === 'off' ? 'Off' : thinking.current.charAt(0).toUpperCase() + thinking.current.slice(1);
  const contextPercent = stats?.context?.percent;

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      {stats && (
        <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-subtle text-[10px] text-tertiary flex-shrink-0">
          <div className="flex items-center gap-1">
            <BarChart3 size={10} />
            <span>{stats.totalMessages} msgs</span>
          </div>
          <span>·</span>
          <span>{formatTokens(stats.tokens.total)} tokens</span>
          {stats.cost > 0 && (
            <>
              <span>·</span>
              <span>${stats.cost.toFixed(4)}</span>
            </>
          )}
          {contextPercent != null && (
            <>
              <span>·</span>
              <div className="flex items-center gap-1.5">
                <span>ctx {contextPercent}%</span>
                <div className="w-16 h-1 bg-border rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      contextPercent > 80 ? 'bg-red-400' : contextPercent > 60 ? 'bg-amber-400' : 'bg-green-400'
                    }`}
                    style={{ width: `${Math.min(contextPercent, 100)}%` }}
                  />
                </div>
              </div>
            </>
          )}
          {contextPercent != null && contextPercent > 60 && (
            <button
              onClick={handleCompact}
              disabled={compacting || streaming}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-amber-400 hover:bg-amber-400/10 disabled:opacity-40 transition-colors"
              title="Compact context to free up token space"
            >
              <Minimize2 size={9} />
              {compacting ? 'Compacting...' : 'Compact'}
            </button>
          )}
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
        onScroll={() => {
          const el = scrollContainerRef.current;
          if (el) {
            wasNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          }
        }}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot size={40} className="text-tertiary opacity-20 mb-3" />
            <p className="text-sm text-secondary">
              {project ? `Chat with Phoung about ${project}` : 'Start a conversation with Phoung'}
            </p>
            <p className="text-xs text-tertiary mt-1.5">Assign tasks, spawn agents, or check status</p>
          </div>
        )}

        {messages.map(msg => (
          <StreamMessageCard key={msg.id} message={msg} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-border p-3 flex-shrink-0 bg-card">
        <div className="flex gap-2 items-end">
          {/* Model picker */}
          {models.length > 0 && (
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowModelPicker(p => !p)}
                className="flex items-center gap-1.5 px-2.5 py-2.5 text-[11px] font-medium text-tertiary hover:text-secondary bg-subtle border border-border rounded-lg transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block flex-shrink-0" />
                {models.find(m => m.id === activeModel)?.label || 'Model'}
                <ChevronDown size={10} />
              </button>
              {showModelPicker && (
                <div className="absolute left-0 bottom-full mb-1 w-44 bg-card border border-border rounded-xl shadow-card z-50 overflow-hidden max-h-60 overflow-y-auto">
                  {models.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setActiveModel(m.id); setShowModelPicker(false); }}
                      className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                        m.id === activeModel
                          ? 'bg-accent/15 text-accent-light'
                          : 'text-secondary hover:bg-subtle hover:text-primary'
                      }`}
                    >
                      {m.label}
                      {m.id === activeModel && <span className="float-right text-accent-light">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Thinking level picker */}
          {thinking.supported && (
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowThinkingPicker(p => !p)}
                className="flex items-center gap-1.5 px-2.5 py-2.5 text-[11px] font-medium text-tertiary hover:text-secondary bg-subtle border border-border rounded-lg transition-colors"
                title="Thinking level"
              >
                <Brain size={11} className={thinking.current !== 'off' ? 'text-violet-400' : ''} />
                <span>{thinkingLabel}</span>
                <ChevronDown size={10} />
              </button>
              {showThinkingPicker && (
                <div className="absolute left-0 bottom-full mb-1 w-32 bg-card border border-border rounded-xl shadow-card z-50 overflow-hidden">
                  {thinking.available.map(level => (
                    <button
                      key={level}
                      onClick={() => handleThinkingChange(level)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        level === thinking.current
                          ? 'bg-violet-400/15 text-violet-300'
                          : 'text-secondary hover:bg-subtle hover:text-primary'
                      }`}
                    >
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                      {level === thinking.current && <span className="float-right text-violet-300">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Phoung..."
            disabled={streaming}
            rows={1}
            className="flex-1 px-3.5 py-2.5 bg-subtle border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none disabled:opacity-50 text-sm leading-relaxed text-primary placeholder:text-tertiary"
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
          {streaming ? (
            <button
              onClick={handleAbort}
              className="px-3.5 py-2.5 bg-red-500/80 text-white rounded-lg hover:bg-red-500 transition-colors flex items-center shadow-sm flex-shrink-0"
              title="Stop generation"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="px-3.5 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-dark disabled:opacity-50 transition-colors flex items-center shadow-sm flex-shrink-0"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
