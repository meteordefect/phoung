import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bot, Square, RefreshCw, Loader, Clock,
  RotateCcw, XCircle, Cpu,
} from 'lucide-react';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { api } from './api';
import { eventBus } from './lib/eventBus';
import type { Task, TaskStatus, RunningAgent } from './types';

function ElapsedTime({ since }: { since: string }) {
  const [text, setText] = useState('');

  useEffect(() => {
    const update = () => {
      const ms = Date.now() - new Date(since).getTime();
      if (ms < 0) { setText('--'); return; }
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      if (h > 0) setText(`${h}h ${m % 60}m`);
      else if (m > 0) setText(`${m}m ${s % 60}s`);
      else setText(`${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [since]);

  return <>{text}</>;
}

export { ElapsedTime };

function DiffStats({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono">
      <span className="text-green-400">+{additions}</span>
      <span className="text-red-400">-{deletions}</span>
    </span>
  );
}

export { DiffStats };

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pending',
  queued: 'Queued',
  coding: 'Coding',
  pr_open: 'PR Open',
  ready_to_merge: 'Ready',
  needs_human: 'Input',
  completed: 'Done',
  failed: 'Failed',
  rejected: 'Rejected',
};

function AgentCard({
  task, agent, onSelect, onStop, stopping,
}: {
  task: Task;
  agent: RunningAgent;
  onSelect: () => void;
  onStop: () => void;
  stopping: boolean;
}) {
  const title = task.body.split('\n').find(l => l.trim() && !l.startsWith('#'))?.trim() || task.meta.id;

  return (
    <div
      className="bg-card border border-border rounded-xl p-4 hover:shadow-card-hover transition-shadow cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
          <span className="font-medium text-sm text-primary truncate">{task.meta.id}</span>
        </div>
        <Badge variant="coding" className="text-[9px] flex-shrink-0">Run #{agent.run}</Badge>
      </div>

      <p className="text-xs text-secondary line-clamp-2 mb-3">{title}</p>

      <div className="flex items-center gap-2 text-xs text-tertiary mb-3 flex-wrap">
        {task.meta.project && <span className="text-secondary">{task.meta.project}</span>}
        <span>·</span>
        <span className="inline-flex items-center gap-1 text-blue-400">
          <Cpu size={9} />
          {agent.agentType}
        </span>
        <span>·</span>
        <code className="text-[10px] font-mono">{agent.containerId}</code>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs text-amber-400 font-medium">
            <Clock size={10} />
            <ElapsedTime since={agent.startedAt} />
          </span>
          {task.meta.additions != null && (
            <DiffStats additions={task.meta.additions as number} deletions={task.meta.deletions as number ?? 0} />
          )}
        </div>
        <Button
          size="sm"
          variant="destructive"
          onClick={(e) => { e.stopPropagation(); onStop(); }}
          disabled={stopping}
          className="h-6 text-[10px] px-2"
        >
          {stopping ? <Loader size={10} className="animate-spin" /> : <Square size={10} className="mr-1" />}
          {stopping ? 'Stopping' : 'Stop'}
        </Button>
      </div>
    </div>
  );
}

function QueuedCard({ task, onSelect }: { task: Task; onSelect: () => void }) {
  const status = task.meta.status as TaskStatus;
  return (
    <div
      className="bg-card border border-border rounded-xl p-4 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Clock size={12} className="text-waiting flex-shrink-0" />
          <span className="font-medium text-sm text-primary truncate">{task.meta.id}</span>
        </div>
        <Badge variant={status} className="text-[9px] flex-shrink-0">{STATUS_LABELS[status]}</Badge>
      </div>
      <p className="text-xs text-tertiary">
        {task.meta.project && <>{task.meta.project} · </>}
        Waiting for agent slot
      </p>
      {task.meta.created && (
        <p className="text-[10px] text-tertiary mt-2 flex items-center gap-1">
          <Clock size={9} />
          Created <ElapsedTime since={task.meta.created} /> ago
        </p>
      )}
    </div>
  );
}

function FailedCard({
  task, onSelect, onRetry, retrying,
}: {
  task: Task;
  onSelect: () => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const note = task.meta.note as string | undefined;
  return (
    <div
      className="bg-card border border-red-500/20 rounded-xl p-4 cursor-pointer hover:shadow-card-hover transition-shadow"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <XCircle size={12} className="text-danger flex-shrink-0" />
          <span className="font-medium text-sm text-primary truncate">{task.meta.id}</span>
        </div>
        <Badge variant="failed" className="text-[9px] flex-shrink-0">Failed</Badge>
      </div>
      {note && <p className="text-xs text-red-400/80 mb-3 line-clamp-2">{note}</p>}
      <div className="flex items-center justify-between">
        <span className="text-xs text-tertiary">{task.meta.project}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => { e.stopPropagation(); onRetry(); }}
          disabled={retrying}
          className="h-6 text-[10px] px-2"
        >
          {retrying ? <Loader size={10} className="animate-spin" /> : <RotateCcw size={10} className="mr-1" />}
          {retrying ? 'Retrying' : 'Retry'}
        </Button>
      </div>
    </div>
  );
}

interface MonitorViewProps {
  tasks: Task[];
  onSelectTask: (taskId: string) => void;
  onRefresh: () => void;
}

export function MonitorView({ tasks, onSelectTask, onRefresh }: MonitorViewProps) {
  const [agents, setAgents] = useState<RunningAgent[]>([]);
  const [stopping, setStopping] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const sigRef = useRef('');

  const fetchAgents = useCallback(async () => {
    try {
      const data = await api.agents.running();
      const sig = data.map(a => `${a.taskId}:${a.containerId}`).join(',');
      if (sig === sigRef.current) return;
      sigRef.current = sig;
      setAgents(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAgents();
    const id = setInterval(fetchAgents, 10000);
    const unsub = eventBus.on('task:updated', fetchAgents);
    return () => { clearInterval(id); unsub(); };
  }, [fetchAgents]);

  const agentMap = new Map(agents.map(a => [a.taskId, a]));
  const runningTasks = tasks.filter(t => agentMap.has(t.meta.id));
  const queuedTasks = tasks.filter(t => !agentMap.has(t.meta.id) && ['queued', 'pending'].includes(t.meta.status));
  const failedTasks = tasks.filter(t => t.meta.status === 'failed');

  const handleStop = async (taskId: string) => {
    setStopping(prev => new Set(prev).add(taskId));
    try {
      await api.tasks.stop(taskId);
      eventBus.emit('task:updated');
      onRefresh();
    } catch (err: any) {
      alert(`Stop failed: ${err.message}`);
    }
    setStopping(prev => { const s = new Set(prev); s.delete(taskId); return s; });
  };

  const handleRetry = async (taskId: string) => {
    setRetrying(prev => new Set(prev).add(taskId));
    try {
      await api.tasks.retry(taskId);
      eventBus.emit('task:updated');
      onRefresh();
    } catch (err: any) {
      alert(`Retry failed: ${err.message}`);
    }
    setRetrying(prev => { const s = new Set(prev); s.delete(taskId); return s; });
  };

  const isEmpty = runningTasks.length === 0 && queuedTasks.length === 0 && failedTasks.length === 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border flex-shrink-0 bg-card">
        <div>
          <h1 className="text-base font-serif font-bold text-primary">Agent Monitor</h1>
          <p className="text-xs text-secondary mt-0.5">
            {agents.length} running · {queuedTasks.length} queued · {failedTasks.length} failed
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { fetchAgents(); onRefresh(); }}>
          <RefreshCw size={12} className="mr-1" /> Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isEmpty ? (
          <div className="text-center py-16 text-secondary">
            <div className="mx-auto w-12 h-12 rounded-full bg-subtle flex items-center justify-center mb-3">
              <Bot size={20} className="text-tertiary" />
            </div>
            <p className="text-sm">No active agents</p>
            <p className="text-xs text-tertiary mt-1">Agents will appear here when tasks are running</p>
          </div>
        ) : (
          <div className="space-y-6">
            {runningTasks.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-secondary mb-3">
                  Running ({runningTasks.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {runningTasks.map(task => (
                    <AgentCard
                      key={task.meta.id}
                      task={task}
                      agent={agentMap.get(task.meta.id)!}
                      onSelect={() => onSelectTask(task.meta.id)}
                      onStop={() => handleStop(task.meta.id)}
                      stopping={stopping.has(task.meta.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {queuedTasks.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-secondary mb-3">
                  Queued ({queuedTasks.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {queuedTasks.map(task => (
                    <QueuedCard key={task.meta.id} task={task} onSelect={() => onSelectTask(task.meta.id)} />
                  ))}
                </div>
              </section>
            )}

            {failedTasks.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-secondary mb-3">
                  Failed ({failedTasks.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {failedTasks.map(task => (
                    <FailedCard
                      key={task.meta.id}
                      task={task}
                      onSelect={() => onSelectTask(task.meta.id)}
                      onRetry={() => handleRetry(task.meta.id)}
                      retrying={retrying.has(task.meta.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
