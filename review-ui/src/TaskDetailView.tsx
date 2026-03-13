import { useState, useEffect, useCallback } from 'react';
import {
  GitBranch, ExternalLink, Clock, AlertCircle,
  CheckCircle, XCircle, Loader, ChevronDown, ChevronUp,
  Bot, MessageSquare, ArrowRight, Copy, Check, Send,
} from 'lucide-react';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { api } from './api';
import { eventBus } from './lib/eventBus';
import type { Task, TaskStatus, TaskActivity, Dispatch } from './types';

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pending',
  queued: 'Queued',
  coding: 'Coding',
  pr_open: 'PR Open',
  ready_to_merge: 'Ready to Merge',
  needs_human: 'Needs Input',
  completed: 'Completed',
  failed: 'Failed',
  rejected: 'Rejected',
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatTs(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

function CollapsibleText({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
      >
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        {label}
      </button>
      {open && (
        <div className="relative mt-1">
          <button
            onClick={handleCopy}
            className="absolute top-1 right-1 p-1 rounded bg-white/5 hover:bg-white/10 text-tertiary"
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
          </button>
          <pre className="text-xs text-slate-300 font-mono bg-[#0d1117] rounded-lg p-3 pr-8 max-h-80 overflow-auto whitespace-pre-wrap leading-relaxed">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}

function AgentLogViewer({ taskId, run }: { taskId: string; run: number }) {
  const [log, setLog] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchLog = useCallback(async () => {
    if (log !== null) return;
    setLoading(true);
    try {
      const data = await api.tasks.agentLog(taskId, run);
      setLog(data.log);
    } catch {
      setLog('(failed to load log)');
    } finally {
      setLoading(false);
    }
  }, [taskId, run, log]);

  const handleToggle = () => {
    if (!open && log === null) fetchLog();
    setOpen(!open);
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (log) {
      await navigator.clipboard.writeText(log);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="mt-1">
      <button
        onClick={handleToggle}
        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
      >
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        View agent output
      </button>
      {open && (
        <div className="relative mt-1">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-tertiary p-3">
              <Loader size={12} className="animate-spin" /> Loading...
            </div>
          ) : (
            <>
              <button
                onClick={handleCopy}
                className="absolute top-1 right-1 p-1 rounded bg-white/5 hover:bg-white/10 text-tertiary"
              >
                {copied ? <Check size={10} /> : <Copy size={10} />}
              </button>
              <pre className="text-xs text-slate-300 font-mono bg-[#0d1117] rounded-lg p-3 pr-8 max-h-80 overflow-auto whitespace-pre-wrap leading-relaxed">
                {log || '(empty)'}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ActivityTimeline({ taskId }: { taskId: string }) {
  const [events, setEvents] = useState<TaskActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.tasks.activity(taskId)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-tertiary py-2">
        <Loader size={12} className="animate-spin" /> Loading timeline...
      </div>
    );
  }

  if (events.length === 0) {
    return <div className="text-xs text-tertiary py-2">No sub-agent activity yet.</div>;
  }

  return (
    <div className="space-y-0">
      <p className="text-xs font-medium text-secondary mb-2">Activity Timeline</p>
      <div className="relative pl-4 border-l border-border space-y-3">
        {events.map((ev, i) => (
          <div key={i} className="relative">
            <div className="absolute -left-[21px] top-0.5 w-3 h-3 rounded-full border-2 border-card bg-border flex items-center justify-center">
              {ev.type === 'agent_spawned' && <Bot size={6} className="text-blue-400" />}
              {ev.type === 'agent_completed' && (
                ev.exit_code === 0
                  ? <CheckCircle size={6} className="text-green-400" />
                  : <XCircle size={6} className="text-red-400" />
              )}
              {ev.type === 'phoung_note' && <MessageSquare size={6} className="text-amber-400" />}
              {ev.type === 'status_change' && <ArrowRight size={6} className="text-slate-400" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-tertiary">{formatTs(ev.ts)}</span>
                {ev.type === 'agent_spawned' && (
                  <span className="text-blue-400 font-medium">
                    Sub-agent #{ev.run} spawned{ev.agent_type ? ` (${ev.agent_type})` : ''}
                  </span>
                )}
                {ev.type === 'agent_completed' && (
                  <span className={ev.exit_code === 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                    Agent #{ev.run} {ev.exit_code === 0 ? 'completed' : `failed (exit ${ev.exit_code})`}
                  </span>
                )}
                {ev.type === 'phoung_note' && (
                  <span className="text-amber-400 font-medium">Phoung</span>
                )}
                {ev.type === 'status_change' && (
                  <span className="text-slate-400">
                    Status: {ev.from} <ArrowRight size={10} className="inline" /> {ev.to}
                  </span>
                )}
              </div>
              {ev.type === 'phoung_note' && ev.message && (
                <p className="text-xs text-secondary mt-0.5">{ev.message}</p>
              )}
              {ev.type === 'agent_spawned' && ev.prompt && (
                <CollapsibleText label="View prompt" text={ev.prompt} />
              )}
              {ev.type === 'agent_completed' && ev.run != null && (
                <AgentLogViewer taskId={taskId} run={ev.run} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DispatchTimeline({ taskId }: { taskId: string }) {
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);

  useEffect(() => {
    api.tasks.dispatches(taskId).then(setDispatches).catch(() => {});
  }, [taskId]);

  if (dispatches.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-secondary">Dispatches</p>
      {dispatches.map((d, i) => (
        <div key={i} className={`rounded-lg border p-3 ${
          d.mode === 'handoff' && !d.reply
            ? 'bg-warning/10 border-warning/30'
            : 'bg-subtle border-border'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={d.mode === 'handoff' ? 'needs_human' : 'pending'} className="text-[9px]">
              {d.mode}
            </Badge>
            <span className="text-[10px] text-tertiary">{formatTs(d.ts)}</span>
          </div>
          <p className="text-sm text-primary">{d.question}</p>
          {d.reply && (
            <div className="mt-2 pl-3 border-l-2 border-accent/40">
              <p className="text-sm text-secondary">{d.reply}</p>
              <span className="text-[10px] text-tertiary">{d.replyTs ? formatTs(d.replyTs) : ''}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ReplyForm({ taskId, onReplied }: { taskId: string; onReplied: () => void }) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [responseText, setResponseText] = useState('');

  const handleSubmit = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);
    setResponseText('');
    try {
      const { promise } = api.tasks.reply(taskId, reply.trim(), (event) => {
        if (event.type === 'text_delta') {
          setResponseText(prev => prev + (event as any).content);
        }
        if (event.type === 'done') {
          eventBus.emit('task:updated');
          onReplied();
        }
      });
      await promise;
    } catch {
      setResponseText('Failed to send reply.');
    }
    setSending(false);
    setReply('');
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-end">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Type your reply..."
          disabled={sending}
          rows={2}
          className="flex-1 px-3 py-2 bg-subtle border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none disabled:opacity-50 text-sm text-primary placeholder:text-tertiary"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
        />
        <button
          onClick={handleSubmit}
          disabled={!reply.trim() || sending}
          className="px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent-dark disabled:opacity-50 transition-colors flex items-center flex-shrink-0"
        >
          {sending ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
      {responseText && (
        <div className="bg-subtle border border-border rounded-lg p-3">
          <p className="text-xs font-medium text-secondary mb-1">Phoung's response</p>
          <p className="text-sm text-primary whitespace-pre-wrap">{responseText}</p>
        </div>
      )}
    </div>
  );
}

interface TaskDetailViewProps {
  task: Task;
  onRefresh: () => void;
}

export function TaskDetailView({ task, onRefresh }: TaskDetailViewProps) {
  const [merging, setMerging] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const status = task.meta.status as TaskStatus;

  const statusIcon = {
    pending: <Clock size={18} className="text-waiting" />,
    queued: <Clock size={18} className="text-waiting" />,
    coding: <Loader size={18} className="text-working animate-spin" />,
    pr_open: <ExternalLink size={18} className="text-review" />,
    ready_to_merge: <CheckCircle size={18} className="text-done" />,
    needs_human: <AlertCircle size={18} className="text-warning" />,
    completed: <CheckCircle size={18} className="text-done" />,
    failed: <XCircle size={18} className="text-danger" />,
    rejected: <XCircle size={18} className="text-danger" />,
  }[status];

  const handleMerge = async () => {
    setMerging(true);
    try {
      await api.tasks.merge(task.meta.id);
      onRefresh();
    } catch (err: any) {
      alert(`Merge failed: ${err.message}`);
    } finally {
      setMerging(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    try {
      await api.tasks.reject(task.meta.id);
      onRefresh();
    } catch (err: any) {
      alert(`Reject failed: ${err.message}`);
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border flex-shrink-0 bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex-shrink-0">{statusIcon}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-serif font-bold text-primary">{task.meta.id}</h1>
              <Badge variant={status}>{STATUS_LABELS[status]}</Badge>
              {task.meta.project && (
                <span className="text-xs text-tertiary">{task.meta.project}</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {task.meta.branch && (
                <span className="flex items-center gap-1 text-xs text-secondary">
                  <GitBranch size={10} />
                  <code className="font-mono text-[11px] bg-subtle px-1 py-0.5 rounded">{task.meta.branch}</code>
                </span>
              )}
              {task.meta.pr && (
                <span className="flex items-center gap-1 text-xs text-secondary">
                  <ExternalLink size={10} />
                  PR #{task.meta.pr}
                </span>
              )}
              {task.meta.created && (
                <span className="flex items-center gap-1 text-xs text-tertiary">
                  <Clock size={10} />
                  {timeAgo(task.meta.created)}
                </span>
              )}
            </div>
          </div>
        </div>

        {(status === 'ready_to_merge' || status === 'pr_open') && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              onClick={handleMerge}
              disabled={merging || !task.meta.pr}
              className="bg-done hover:bg-done/90 text-white"
            >
              {merging ? 'Merging...' : 'Merge PR'}
            </Button>
            <Button size="sm" variant="destructive" onClick={handleReject} disabled={rejecting}>
              {rejecting ? 'Rejecting...' : 'Reject'}
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {task.meta.question && status === 'needs_human' && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
            <p className="text-sm font-medium text-warning mb-1">Phoung needs your input</p>
            <p className="text-sm text-primary mb-3">{task.meta.question}</p>
            <ReplyForm taskId={task.meta.id} onReplied={onRefresh} />
          </div>
        )}

        <DispatchTimeline taskId={task.meta.id} />

        {task.meta.config && Object.keys(task.meta.config).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {task.meta.config.model && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-400/10 border border-blue-400/20 rounded text-[11px] text-blue-400 font-mono">
                model: {String(task.meta.config.model)}
              </span>
            )}
            {task.meta.config.agent_type && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-400/10 border border-emerald-400/20 rounded text-[11px] text-emerald-400 font-mono">
                agent: {String(task.meta.config.agent_type)}
              </span>
            )}
            {task.meta.config.reasoning_level && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-violet-400/10 border border-violet-400/20 rounded text-[11px] text-violet-400 font-mono">
                reasoning: {String(task.meta.config.reasoning_level)}
              </span>
            )}
            {Array.isArray(task.meta.config.context_files) && task.meta.config.context_files.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-400/10 border border-amber-400/20 rounded text-[11px] text-amber-400 font-mono">
                +{task.meta.config.context_files.length} context files
              </span>
            )}
          </div>
        )}

        <div className="bg-subtle rounded-lg p-4">
          <p className="text-xs font-medium text-secondary mb-2">Task Details</p>
          <pre className="text-sm text-primary whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto">
            {task.body}
          </pre>
        </div>

        <ActivityTimeline taskId={task.meta.id} />
      </div>
    </div>
  );
}
