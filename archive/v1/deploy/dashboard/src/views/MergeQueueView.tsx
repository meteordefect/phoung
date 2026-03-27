import { useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ExternalLink, GitMerge, MessageSquare, CheckCircle, XCircle, Clock } from 'lucide-react';
import { api } from '../api/client';
import type { Task } from '../types';
import { usePolling } from '../hooks/usePolling';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';

const CI_ICONS = {
  passing: <CheckCircle size={14} className="text-[rgb(var(--color-done))]" />,
  failing: <XCircle size={14} className="text-[rgb(var(--color-danger))]" />,
  pending: <Clock size={14} className="text-[rgb(var(--color-waiting))]" />,
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

export function MergeQueueView() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackTask, setFeedbackTask] = useState<Task | null>(null);
  const [feedback, setFeedback] = useState('');
  const [merging, setMerging] = useState<string | null>(null);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const lastSigRef = useRef('');

  const fetchQueue = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.tasks.mergeQueue(projectId);
      const sig = data.map(t => `${t.id}:${t.status}:${t.ci_status}`).join(',');
      if (sig === lastSigRef.current) { setLoading(false); return; }
      lastSigRef.current = sig;
      setTasks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  usePolling(fetchQueue, 15000, true, { busEvents: ['task:updated', 'pr:merged'] });

  const handleMerge = async (task: Task) => {
    setMerging(task.id);
    try {
      await api.tasks.merge(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (err) {
      console.error(err);
    } finally {
      setMerging(null);
    }
  };

  const handleFeedback = async () => {
    if (!feedbackTask || !feedback.trim()) return;
    setSendingFeedback(true);
    try {
      await api.tasks.requestChanges(feedbackTask.id, feedback);
      setFeedbackTask(null);
      setFeedback('');
    } catch (err) {
      console.error(err);
    } finally {
      setSendingFeedback(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-primary">Merge Queue</h1>
        <p className="text-sm text-[rgb(var(--muted-foreground))] mt-0.5">
          PRs waiting for your approval
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 text-[rgb(var(--muted-foreground))]">
          <GitMerge className="mx-auto h-12 w-12 opacity-30 mb-3" />
          <p className="text-sm">No PRs waiting for review.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[rgb(var(--border))] overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task / PR</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>CI</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <div className="space-y-0.5">
                      <div className="font-medium text-sm">{task.title}</div>
                      <div className="flex items-center gap-2">
                        <Badge variant={task.status as Parameters<typeof Badge>[0]['variant']} className="text-[10px]">
                          {task.status.replace('_', ' ')}
                        </Badge>
                        {task.pr_url && task.pr_number && (
                          <a
                            href={task.pr_url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))] transition-colors"
                          >
                            <ExternalLink size={11} /> PR #{task.pr_number}
                          </a>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-[rgb(var(--muted-foreground))]">
                    {task.agent_type}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      {CI_ICONS[task.ci_status ?? 'pending']}
                      <span className="text-[rgb(var(--muted-foreground))]">
                        {task.ci_status ?? 'pending'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-[rgb(var(--muted-foreground))]">
                    {timeAgo(task.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setFeedbackTask(task); setFeedback(''); }}
                        className="gap-1"
                      >
                        <MessageSquare size={12} /> Changes
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleMerge(task)}
                        disabled={merging === task.id || task.ci_status === 'failing'}
                        className="gap-1"
                      >
                        <GitMerge size={12} />
                        {merging === task.id ? 'Merging…' : 'Approve & Merge'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Request Changes Dialog */}
      <Dialog open={!!feedbackTask} onOpenChange={() => setFeedbackTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Changes</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-[rgb(var(--muted-foreground))]">
              Describe what needs to be changed. This will be sent to the manager.
            </p>
            <Textarea
              className="min-h-[100px] bg-transparent border-[rgb(var(--input))]"
              placeholder="The API endpoint needs to handle pagination…"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackTask(null)}>Cancel</Button>
            <Button onClick={handleFeedback} disabled={sendingFeedback || !feedback.trim()}>
              {sendingFeedback ? 'Sending…' : 'Send Feedback'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
