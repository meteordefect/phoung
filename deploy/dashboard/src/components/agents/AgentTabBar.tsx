import { Bot, Terminal } from 'lucide-react';
import { Badge } from '../ui/badge';
import type { Task } from '../../types';

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-[rgb(var(--color-waiting))]',
  spawned: 'bg-[rgb(var(--color-working))] animate-pulse',
  coding: 'bg-[rgb(var(--color-working))] animate-pulse',
  pr_open: 'bg-[rgb(var(--color-review))]',
  ci_pending: 'bg-[rgb(var(--color-waiting))] animate-pulse',
  review: 'bg-[rgb(var(--color-review))]',
  failed: 'bg-[rgb(var(--color-danger))]',
};

interface AgentTabBarProps {
  tasks: Task[];
  activeTaskId: string | null;
  onSelect: (taskId: string) => void;
  unreadCounts: Record<string, number>;
}

export function AgentTabBar({ tasks, activeTaskId, onSelect, unreadCounts }: AgentTabBarProps) {
  if (tasks.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-card overflow-x-auto shrink-0">
      <Terminal size={14} className="text-tertiary mr-1 shrink-0" />
      {tasks.map((task) => {
        const isActive = task.id === activeTaskId;
        const dotClass = STATUS_DOT[task.status] || 'bg-tertiary';
        const unread = unreadCounts[task.id] || 0;

        return (
          <button
            key={task.id}
            onClick={() => onSelect(task.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
              isActive
                ? 'bg-subtle text-primary ring-1 ring-border shadow-sm'
                : 'text-secondary hover:text-primary hover:bg-subtle/50'
            }`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
            <Bot size={12} className="shrink-0 opacity-60" />
            <span className="max-w-[140px] truncate">{task.title}</span>
            <Badge
              variant={task.status as any}
              className="text-[9px] px-1.5 py-0 leading-4"
            >
              {task.agent_type}
            </Badge>
            {unread > 0 && !isActive && (
              <span className="w-4 h-4 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
