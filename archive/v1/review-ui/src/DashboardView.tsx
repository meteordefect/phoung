import { Sun, Moon, FolderOpen, Clock, CheckCircle, XCircle, Loader, AlertCircle, ExternalLink } from 'lucide-react';
import type { ProjectInfo, Task, RunningAgent, Conversation } from './types';
import { ProjectCard } from './ProjectCard';

interface DashboardViewProps {
  projects: ProjectInfo[];
  tasks: Task[];
  agents: RunningAgent[];
  conversations: Conversation[];
  onSelectProject: (name: string) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
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

const STATUS_ICON: Record<string, JSX.Element> = {
  coding: <Loader size={12} className="text-working animate-spin" />,
  completed: <CheckCircle size={12} className="text-done" />,
  failed: <XCircle size={12} className="text-danger" />,
  rejected: <XCircle size={12} className="text-danger" />,
  pr_open: <ExternalLink size={12} className="text-review" />,
  ready_to_merge: <CheckCircle size={12} className="text-done" />,
  needs_human: <AlertCircle size={12} className="text-warning" />,
  pending: <Clock size={12} className="text-waiting" />,
  queued: <Clock size={12} className="text-waiting" />,
};

export function DashboardView({
  projects, tasks, agents, conversations, onSelectProject, theme, onToggleTheme,
}: DashboardViewProps) {
  const recentTasks = [...tasks]
    .filter(t => t.meta.created)
    .sort((a, b) => new Date(b.meta.created!).getTime() - new Date(a.meta.created!).getTime())
    .slice(0, 10);

  const projectTasks = (name: string) => tasks.filter(t => t.meta.project === name);
  const projectAgents = (name: string) => agents.filter(a => a.project === name);
  const openTaskCount = tasks.filter(t => !['completed', 'failed', 'rejected'].includes(t.meta.status)).length;

  return (
    <div className="h-screen flex flex-col bg-surface">
      <div className="flex items-center justify-between px-6 h-14 border-b border-border bg-card flex-shrink-0">
        <span className="font-serif font-bold text-primary text-lg tracking-wide">Phoung</span>
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-lg text-tertiary hover:text-primary hover:bg-subtle transition-colors"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center gap-6 mb-8 text-sm text-secondary">
            <span>{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
            <span className="text-tertiary">·</span>
            <span>{agents.length} agent{agents.length !== 1 ? 's' : ''} running</span>
            <span className="text-tertiary">·</span>
            <span>{openTaskCount} open task{openTaskCount !== 1 ? 's' : ''}</span>
          </div>

          {projects.length === 0 ? (
            <div className="text-center py-16">
              <div className="mx-auto w-14 h-14 rounded-xl bg-subtle flex items-center justify-center mb-4">
                <FolderOpen size={24} className="text-tertiary" />
              </div>
              <p className="text-sm text-secondary">No projects registered</p>
              <p className="text-xs text-tertiary mt-1">Use Phoung to register a project first</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
              {projects.map(p => (
                <ProjectCard
                  key={p.name}
                  name={p.name}
                  tasks={projectTasks(p.name)}
                  agents={projectAgents(p.name)}
                  onClick={() => onSelectProject(p.name)}
                />
              ))}
            </div>
          )}

          {recentTasks.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-tertiary mb-4">Recent Activity</h2>
              <div className="space-y-0.5">
                {recentTasks.map(task => (
                  <button
                    key={task.meta.id}
                    onClick={() => task.meta.project && onSelectProject(task.meta.project)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-subtle transition-colors"
                  >
                    {STATUS_ICON[task.meta.status] || <Clock size={12} className="text-tertiary" />}
                    <span className="text-sm text-primary flex-1 min-w-0 truncate">{task.meta.id}</span>
                    {task.meta.project && (
                      <span className="text-xs text-accent-light flex-shrink-0">{task.meta.project}</span>
                    )}
                    {task.meta.created && (
                      <span className="text-xs text-tertiary flex-shrink-0">{timeAgo(task.meta.created)}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
