import { FolderOpen } from 'lucide-react';
import type { RunningAgent, Task } from './types';

interface ProjectCardProps {
  name: string;
  tasks: Task[];
  agents: RunningAgent[];
  onClick: () => void;
}

function timeAgo(date: string): string {
  const ms = Date.now() - new Date(date).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
}

export function ProjectCard({ name, tasks, agents, onClick }: ProjectCardProps) {
  const activeTasks = tasks.filter(t => !['completed', 'failed', 'rejected'].includes(t.meta.status));
  const runningAgents = agents.filter(a => a.project === name);

  const lastTask = tasks
    .filter(t => t.meta.created)
    .sort((a, b) => new Date(b.meta.created!).getTime() - new Date(a.meta.created!).getTime())[0];

  return (
    <button
      onClick={onClick}
      className="bg-card border border-border rounded-xl p-5 text-left hover:shadow-card-hover hover:border-accent/30 transition-all w-full"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
            <FolderOpen size={16} className="text-accent-light" />
          </div>
          <span className="font-serif font-semibold text-primary text-base">{name}</span>
        </div>
        {runningAgents.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-green-400 flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span>{runningAgents.length} running</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-secondary">
        <span>{activeTasks.length} open task{activeTasks.length !== 1 ? 's' : ''}</span>
        {lastTask?.meta.created && (
          <>
            <span className="text-tertiary">·</span>
            <span className="text-tertiary">Last: {timeAgo(lastTask.meta.created)}</span>
          </>
        )}
      </div>
    </button>
  );
}
