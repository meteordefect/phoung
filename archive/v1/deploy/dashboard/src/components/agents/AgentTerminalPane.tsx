import { useRef, useEffect, useState, useCallback } from 'react';
import {
  Bot, GitBranch, ExternalLink, Clock, Send,
  Activity, AlertCircle, CheckCircle2, Loader2,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { api } from '../../api/client';
import { usePolling } from '../../hooks/usePolling';
import type { Task, Event } from '../../types';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  spawned: 'Spawning',
  coding: 'Coding',
  pr_open: 'PR Open',
  ci_pending: 'CI Running',
  review: 'Ready to Merge',
  merged: 'Merged',
  failed: 'Failed',
};

const EVENT_ICONS: Record<string, typeof Activity> = {
  agent_spawned: Loader2,
  agent_exited: AlertCircle,
  task_created: Activity,
  pr_merged: CheckCircle2,
  review_requested: ExternalLink,
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatTimestamp(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface AgentTerminalPaneProps {
  task: Task;
  onNewEvents?: (count: number) => void;
}

export function AgentTerminalPane({ task, onNewEvents }: AgentTerminalPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const prevCountRef = useRef(0);

  const fetchActivity = useCallback(async () => {
    return api.tasks.taskActivity(task.id, 100);
  }, [task.id]);

  const { data: events } = usePolling<Event[]>(fetchActivity, 5000, true, {
    busEvents: ['task:updated'],
  });

  const sortedEvents = events ? [...events].reverse() : [];

  useEffect(() => {
    if (sortedEvents.length > prevCountRef.current && prevCountRef.current > 0) {
      onNewEvents?.(sortedEvents.length - prevCountRef.current);
    }
    prevCountRef.current = sortedEvents.length;
  }, [sortedEvents.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [sortedEvents.length]);

  const handleSendReply = async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);
    try {
      await api.tasks.requestChanges(task.id, replyText.trim());
      setReplyText('');
    } catch (err) {
      console.error('Failed to send reply:', err);
    } finally {
      setSending(false);
    }
  };

  const isActive = ['pending', 'spawned', 'coding', 'ci_pending'].includes(task.status);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Task header */}
      <div className="px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-primary truncate">{task.title}</h3>
            <p className="text-xs text-tertiary mt-0.5 line-clamp-1">{task.description}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={task.status as any}>{STATUS_LABELS[task.status] ?? task.status}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-tertiary">
          <span className="flex items-center gap-1">
            <Bot size={11} /> {task.agent_type}{task.model ? ` / ${task.model}` : ''}
          </span>
          {task.branch && (
            <span className="flex items-center gap-1">
              <GitBranch size={11} />
              <code className="font-mono text-[10px]">{task.branch}</code>
            </span>
          )}
          {task.pr_url && (
            <a
              href={task.pr_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 hover:text-primary transition-colors"
            >
              <ExternalLink size={11} /> PR #{task.pr_number}
            </a>
          )}
          <span className="flex items-center gap-1">
            <Clock size={11} /> {timeAgo(task.created_at)}
          </span>
        </div>
      </div>

      {/* Terminal output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 font-mono text-xs bg-[hsl(220,15%,8%)] min-h-0"
      >
        {sortedEvents.length === 0 ? (
          <div className="flex items-center gap-2 text-tertiary py-8 justify-center">
            {isActive ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Waiting for agent output...</span>
              </>
            ) : (
              <span>No activity recorded for this task.</span>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {sortedEvents.map((event) => {
              const Icon = EVENT_ICONS[event.type] || Activity;
              const data = event.data || {};
              const message = data.reason || data.error || data.feedback || data.title || event.type;

              return (
                <div key={event.id} className="flex items-start gap-2 py-0.5 group">
                  <span className="text-tertiary shrink-0 tabular-nums w-[70px]">
                    {formatTimestamp(event.created_at)}
                  </span>
                  <Icon size={12} className="text-tertiary shrink-0 mt-0.5" />
                  <span className="text-[rgb(var(--color-working))]">[{event.type}]</span>
                  <span className="text-secondary break-all">
                    {typeof message === 'string' ? message : JSON.stringify(message)}
                  </span>
                </div>
              );
            })}
            {isActive && (
              <div className="flex items-center gap-2 text-tertiary pt-2">
                <span className="w-2 h-2 rounded-full bg-[rgb(var(--color-working))] animate-pulse" />
                <span>Agent running...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-border bg-card shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendReply();
              }
            }}
            placeholder={isActive ? 'Send feedback to this agent...' : 'Agent is not active'}
            disabled={!isActive || sending}
            className="flex-1 px-3 py-2 bg-subtle border border-border rounded-lg text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSendReply}
            disabled={!replyText.trim() || !isActive || sending}
            className="px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
