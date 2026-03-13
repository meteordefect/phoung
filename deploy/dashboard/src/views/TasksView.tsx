import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  GitBranch, ExternalLink, MoreHorizontal, RefreshCw,
  XCircle, Plus, Bot, Clock, Paperclip, X,
} from 'lucide-react';
import { api } from '../api/client';
import type { Task } from '../types';
import { usePolling } from '../hooks/usePolling';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';

const STATUS_LABELS: Record<string, string> = {
  pending:    'Pending',
  spawned:    'Spawning',
  coding:     'Coding',
  pr_open:    'PR Open',
  ci_pending: 'CI Running',
  review:     'Ready to Merge',
  merged:     'Merged',
  failed:     'Failed',
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

function TaskCard({ task, onCancel, onRetry }: { task: Task; onCancel: () => void; onRetry: () => void }) {
  const statusVariant = task.status as Parameters<typeof Badge>[0]['variant'];

  return (
    <Card className="hover:shadow-card-hover transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold leading-snug">{task.title}</CardTitle>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant={statusVariant}>{STATUS_LABELS[task.status] ?? task.status}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {task.pr_url && (
                  <DropdownMenuItem asChild>
                    <a href={task.pr_url} target="_blank" rel="noreferrer" className="flex items-center gap-2">
                      <ExternalLink size={14} /> View PR
                    </a>
                  </DropdownMenuItem>
                )}
                {task.status === 'failed' && (
                  <DropdownMenuItem onClick={onRetry} className="flex items-center gap-2">
                    <RefreshCw size={14} /> Retry
                  </DropdownMenuItem>
                )}
                {['pending','spawned','coding','pr_open','ci_pending'].includes(task.status) && (
                  <DropdownMenuItem
                    onClick={onCancel}
                    className="flex items-center gap-2 text-[rgb(var(--color-danger))]"
                  >
                    <XCircle size={14} /> Cancel
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-[rgb(var(--muted-foreground))] line-clamp-2 mb-3">
          {task.description}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[rgb(var(--muted-foreground))]">
          <span className="flex items-center gap-1">
            <Bot size={12} /> {task.agent_type}{task.model ? ` / ${task.model}` : ''}
          </span>
          {task.branch && (
            <span className="flex items-center gap-1">
              <GitBranch size={12} />
              <code className="font-mono text-[10px]">{task.branch}</code>
            </span>
          )}
          {task.pr_url && task.pr_number && (
            <a
              href={task.pr_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 hover:text-[rgb(var(--foreground))] transition-colors"
            >
              <ExternalLink size={12} /> PR #{task.pr_number}
            </a>
          )}
          <span className="flex items-center gap-1 ml-auto">
            <Clock size={12} /> {timeAgo(task.created_at)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function TasksView() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', agent_type: 'kimi', task_type: 'feature', model: 'kimi-k2.5' });
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSigRef = useRef('');

  const fetchTasks = useCallback(async () => {
    if (!projectId || projectId === 'default') {
      setLoading(false);
      return;
    }
    try {
      const data = await api.tasks.list(projectId);
      const sig = data.map(t => `${t.id}:${t.status}`).join(',');
      if (sig === lastSigRef.current) { setLoading(false); return; }
      lastSigRef.current = sig;
      setTasks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  usePolling(fetchTasks, 10000, true, { busEvents: ['task:updated'] });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || projectId === 'default') return;
    setSubmitting(true);
    try {
      let upload_id: string | undefined;
      if (files.length > 0) {
        const upload = await api.uploads.create(files);
        upload_id = upload.upload_id;
      }

      const task = await api.tasks.create(projectId, {
        title: form.title,
        description: form.description,
        agent_type: form.agent_type,
        task_type: form.task_type,
        model: form.model || undefined,
        upload_id,
      });
      setTasks((prev) => [task, ...prev]);
      setNewTaskOpen(false);
      setForm({ title: '', description: '', agent_type: 'kimi', task_type: 'feature', model: 'kimi-k2.5' });
      setFiles([]);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (taskId: string) => {
    await api.tasks.cancel(taskId).catch(console.error);
    fetchTasks();
  };

  const handleRetry = async (taskId: string) => {
    await api.tasks.retry(taskId).catch(console.error);
    fetchTasks();
  };

  const active = tasks.filter((t) => !['merged', 'failed'].includes(t.status));
  const done = tasks.filter((t) => ['merged', 'failed'].includes(t.status));

  if (!projectId || projectId === 'default') {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="rounded-xl bg-subtle border border-border p-8 max-w-sm w-full">
          <ListTodoEmpty />
          <h2 className="text-base font-semibold text-primary mt-3">No project selected</h2>
          <p className="text-sm text-[rgb(var(--muted-foreground))] mt-1.5">
            Create a project first using the <strong className="text-primary font-semibold">+ Add</strong> button in the top bar, then come back here to spawn agents.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold text-primary">Tasks</h1>
          <p className="text-sm text-[rgb(var(--muted-foreground))] mt-0.5">
            {active.length} active · {tasks.length} total
          </p>
        </div>
        <Button onClick={() => setNewTaskOpen(true)} className="gap-2">
          <Plus size={15} /> New Task
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 text-[rgb(var(--muted-foreground))]">
          <ListTodoEmpty />
          <p className="text-sm mt-2">No tasks yet. Create one to spawn a coding agent.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
                Active ({active.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {active.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    onCancel={() => handleCancel(t.id)}
                    onRetry={() => handleRetry(t.id)}
                  />
                ))}
              </div>
            </section>
          )}
          {done.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
                Completed / Failed ({done.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 opacity-70">
                {done.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    onCancel={() => handleCancel(t.id)}
                    onRetry={() => handleRetry(t.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* New Task Dialog */}
      <Dialog open={newTaskOpen} onOpenChange={setNewTaskOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Title</Label>
              <input
                id="task-title"
                className="input-base"
                placeholder="Fix login bug"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-desc">Description (agent prompt)</Label>
              <Textarea
                id="task-desc"
                className="min-h-[120px] bg-transparent border-[rgb(var(--input))]"
                placeholder="Describe exactly what the agent should do, what files to touch, what tests to run…"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Attachments</Label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".csv,.pdf,.txt,.json,.md,.xml,.yaml,.yml,.tsv,.log"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                  e.target.value = '';
                }}
              />
              <div
                className="border border-dashed border-[rgb(var(--input))] rounded-lg p-3 cursor-pointer hover:bg-[rgb(var(--muted))] transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {files.length === 0 ? (
                  <p className="text-sm text-[rgb(var(--muted-foreground))] text-center flex items-center justify-center gap-2">
                    <Paperclip className="h-4 w-4" />
                    Attach CSV, PDF, or text files as context
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {files.map((f, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-xs bg-[rgb(var(--muted))] text-[rgb(var(--foreground))] px-2 py-1 rounded-md"
                      >
                        {f.name}
                        <button
                          type="button"
                          className="hover:text-red-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFiles((prev) => prev.filter((_, idx) => idx !== i));
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Select
                  value={form.model}
                  onValueChange={(v) => {
                    const agentType = v === 'glm-4-flash' ? 'glm' : 'kimi';
                    setForm((f) => ({ ...f, agent_type: agentType, model: v }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kimi-k2.5">Kimi K2.5</SelectItem>
                    <SelectItem value="glm-4-flash">GLM 4.7</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Task Type</Label>
                <Select
                  value={form.task_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, task_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="feature">Feature</SelectItem>
                    <SelectItem value="bugfix">Bug Fix</SelectItem>
                    <SelectItem value="refactor">Refactor</SelectItem>
                    <SelectItem value="test">Test</SelectItem>
                    <SelectItem value="docs">Docs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewTaskOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create & Spawn Agent'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ListTodoEmpty() {
  return (
    <svg className="mx-auto h-12 w-12 text-[rgb(var(--muted-foreground))] opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}
