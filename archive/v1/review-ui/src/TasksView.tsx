import { useState, useEffect, useCallback } from 'react';
import {
  GitBranch, ExternalLink, Clock, AlertCircle,
  CheckCircle, XCircle, Loader, ChevronDown, ChevronUp,
  Bot, MessageSquare, ArrowRight, Copy, Check,
} from 'lucide-react';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { api } from './api';
import type { Task, TaskStatus, TaskActivity } from './types';

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
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
    return (
      <div className="text-xs text-tertiary py-2">No sub-agent activity yet.</div>
    );
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
                    Sub-agent #{ev.run} spawned
                    {ev.agent_type ? ` (${ev.agent_type})` : ''}
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

interface TasksViewProps {
  tasks: Task[];
  onRefresh: () => void;
}

function TaskCard({ task, onRefresh }: { task: Task; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [merging, setMerging] = useState(false);
  const [rejecting, setRejecting] = useState(false);

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

  const status = task.meta.status as TaskStatus;
  const statusIcon = {
    pending: <Clock size={14} className="text-waiting" />,
    queued: <Clock size={14} className="text-waiting" />,
    coding: <Loader size={14} className="text-working animate-spin" />,
    pr_open: <ExternalLink size={14} className="text-review" />,
    ready_to_merge: <CheckCircle size={14} className="text-done" />,
    needs_human: <AlertCircle size={14} className="text-warning" />,
    completed: <CheckCircle size={14} className="text-done" />,
    failed: <XCircle size={14} className="text-danger" />,
    rejected: <XCircle size={14} className="text-danger" />,
  }[status];

  return (
    <div className="bg-card border border-border rounded-xl shadow-card hover:shadow-card-hover transition-shadow">
      <div
        className="flex items-start justify-between gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="mt-0.5">{statusIcon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm text-primary">{task.meta.id}</span>
              <Badge variant={status}>{STATUS_LABELS[status] || status}</Badge>
              {task.meta.project && (
                <span className="text-xs text-tertiary">{task.meta.project}</span>
              )}
            </div>
            <p className="text-xs text-secondary mt-1 line-clamp-2">
              {task.body.split('\n').find(l => l.trim() && !l.startsWith('#'))?.trim() || task.filename}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {task.meta.created && (
            <span className="text-xs text-tertiary flex items-center gap-1">
              <Clock size={10} /> {timeAgo(task.meta.created)}
            </span>
          )}
          {expanded ? <ChevronUp size={14} className="text-tertiary" /> : <ChevronDown size={14} className="text-tertiary" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <div className="space-y-2">
            {task.meta.branch && (
              <div className="flex items-center gap-2 text-xs text-secondary">
                <GitBranch size={12} />
                <code className="font-mono bg-subtle px-1.5 py-0.5 rounded">{task.meta.branch}</code>
              </div>
            )}
            {task.meta.pr && (
              <div className="flex items-center gap-2 text-xs">
                <ExternalLink size={12} className="text-secondary" />
                <span className="text-secondary">PR #{task.meta.pr}</span>
              </div>
            )}
          </div>

          {task.meta.question && status === 'needs_human' && (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
              <p className="text-sm font-medium text-warning mb-1">Phoung needs your input</p>
              <p className="text-sm text-primary">{task.meta.question}</p>
            </div>
          )}

          <div className="bg-subtle rounded-lg p-3">
            <p className="text-xs font-medium text-secondary mb-1">Task Details</p>
            <pre className="text-xs text-primary whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto">
              {task.body}
            </pre>
          </div>

          <ActivityTimeline taskId={task.meta.id} />

          {(status === 'ready_to_merge' || status === 'pr_open') && (
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleMerge}
                disabled={merging || !task.meta.pr}
                className="bg-done hover:bg-done/90 text-white"
              >
                {merging ? 'Merging...' : 'Merge PR'}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleReject}
                disabled={rejecting}
              >
                {rejecting ? 'Rejecting...' : 'Reject'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TasksView({ tasks, onRefresh }: TasksViewProps) {
  const active = tasks.filter(t => !['completed', 'failed', 'rejected'].includes(t.meta.status));
  const done = tasks.filter(t => ['completed', 'failed', 'rejected'].includes(t.meta.status));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold text-primary">Tasks</h1>
          <p className="text-sm text-secondary mt-0.5">
            {active.length} active · {tasks.length} total
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-16 text-secondary">
          <div className="mx-auto w-12 h-12 rounded-full bg-subtle flex items-center justify-center mb-3">
            <Clock size={20} className="text-tertiary" />
          </div>
          <p className="text-sm">No tasks yet</p>
          <p className="text-xs text-tertiary mt-1">Chat with Phoung to create tasks</p>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Active ({active.length})
              </h2>
              <div className="space-y-2">
                {active.map(t => (
                  <TaskCard key={t.meta.id || t.filename} task={t} onRefresh={onRefresh} />
                ))}
              </div>
            </section>
          )}
          {done.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Completed ({done.length})
              </h2>
              <div className="space-y-2 opacity-70">
                {done.map(t => (
                  <TaskCard key={t.meta.id || t.filename} task={t} onRefresh={onRefresh} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
