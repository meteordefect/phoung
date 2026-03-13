import { useState, useEffect } from 'react';
import {
  ListTodo, Clock, Loader, CheckCircle,
  XCircle, AlertCircle, ExternalLink, ChevronDown, ChevronRight,
  Plus, PanelLeftClose, PanelLeftOpen, Sun, Moon, ArrowLeft,
  MessageSquare, Cpu,
} from 'lucide-react';
import { Badge } from './components/ui/badge';
import { usePreserveScroll } from './lib/usePreserveScroll';
import type { Task, TaskStatus, Conversation, RunningAgent } from './types';

const STATUS_ICONS: Record<TaskStatus, JSX.Element> = {
  pending: <Clock size={12} className="text-waiting" />,
  queued: <Clock size={12} className="text-waiting" />,
  coding: <Loader size={12} className="text-working animate-spin" />,
  pr_open: <ExternalLink size={12} className="text-review" />,
  ready_to_merge: <CheckCircle size={12} className="text-done" />,
  needs_human: <AlertCircle size={12} className="text-warning" />,
  completed: <CheckCircle size={12} className="text-done" />,
  failed: <XCircle size={12} className="text-danger" />,
  rejected: <XCircle size={12} className="text-danger" />,
};

const STATUS_SHORT: Record<TaskStatus, string> = {
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

function ElapsedBadge({ since }: { since: string }) {
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

  return <span className="text-[10px] text-amber-400 font-mono">{text}</span>;
}

interface SidebarProps {
  project: string;
  tasks: Task[];
  conversations: Conversation[];
  agents: RunningAgent[];
  activeView: 'chat' | 'task';
  selectedTaskId: string | null;
  selectedConversationId: string | null;
  onBack: () => void;
  onSelectChat: (convId?: string) => void;
  onSelectTask: (taskId: string) => void;
  onNewChat: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export function Sidebar({
  project,
  tasks,
  conversations,
  agents,
  activeView,
  selectedTaskId,
  selectedConversationId,
  onBack,
  onSelectChat,
  onSelectTask,
  onNewChat,
  collapsed,
  onToggleCollapse,
  theme,
  onToggleTheme,
}: SidebarProps) {
  const [tasksOpen, setTasksOpen] = useState(true);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(true);

  const sidebarScrollRef = usePreserveScroll({ tasks, conversations });

  const activeTasks = tasks.filter(t => !['completed', 'failed', 'rejected'].includes(t.meta.status));
  const completedTasks = tasks.filter(t => ['completed', 'failed', 'rejected'].includes(t.meta.status));

  if (collapsed) {
    return (
      <div className="w-12 border-r border-border bg-card flex flex-col items-center py-3 gap-1.5 flex-shrink-0">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-md text-tertiary hover:text-primary hover:bg-subtle transition-colors"
          title="Expand sidebar"
        >
          <PanelLeftOpen size={16} />
        </button>
        <div className="w-6 border-t border-border my-1" />
        <button
          onClick={onBack}
          className="p-1.5 rounded-md text-tertiary hover:text-primary hover:bg-subtle transition-colors"
          title="Back to projects"
        >
          <ArrowLeft size={14} />
        </button>
        <button
          onClick={onNewChat}
          className="p-1.5 rounded-md text-tertiary hover:text-primary hover:bg-subtle transition-colors"
          title="New Chat"
        >
          <Plus size={14} />
        </button>
        <button
          onClick={() => onSelectChat()}
          className={`p-1.5 rounded-md transition-colors ${
            activeView === 'chat' ? 'text-accent-light bg-accent/15' : 'text-tertiary hover:text-primary hover:bg-subtle'
          }`}
          title="Chat"
        >
          <MessageSquare size={14} />
        </button>
        <button
          onClick={() => activeTasks[0] && onSelectTask(activeTasks[0].meta.id)}
          className={`p-1.5 rounded-md transition-colors relative ${
            activeView === 'task' ? 'text-accent-light bg-accent/15' : 'text-tertiary hover:text-primary hover:bg-subtle'
          }`}
          title="Tasks"
        >
          <ListTodo size={14} />
          {activeTasks.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-accent text-white text-[8px] font-bold rounded-full flex items-center justify-center">
              {activeTasks.length}
            </span>
          )}
        </button>
        <div className="flex-1" />
        {agents.length > 0 && (
          <div className="p-1.5 text-green-400" title={`${agents.length} agent(s) running`}>
            <Cpu size={14} />
          </div>
        )}
        <button
          onClick={onToggleTheme}
          className="p-1.5 rounded-md text-tertiary hover:text-primary hover:bg-subtle transition-colors"
          title="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    );
  }

  return (
    <div className="w-60 border-r border-border bg-card flex flex-col min-h-0 flex-shrink-0">
      <div className="flex items-center justify-between px-3 h-12 border-b border-border flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-tertiary hover:text-primary transition-colors"
          title="Back to projects"
        >
          <ArrowLeft size={14} />
          <span className="text-xs">Projects</span>
        </button>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onNewChat}
            className="p-1.5 rounded-md text-tertiary hover:text-primary hover:bg-subtle transition-colors"
            title="New Chat"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-md text-tertiary hover:text-primary hover:bg-subtle transition-colors"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>
      </div>

      <div className="px-3 py-2.5 border-b border-border flex-shrink-0">
        <span className="font-serif font-bold text-primary text-sm">{project}</span>
      </div>

      <div ref={sidebarScrollRef} className="flex-1 overflow-y-auto px-2 pb-2">
        {/* Agents */}
        {agents.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setAgentsOpen(!agentsOpen)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-tertiary hover:text-secondary transition-colors"
            >
              {agentsOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              Agents
              <span className="ml-auto text-[10px] font-medium bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full normal-case tracking-normal">
                {agents.length}
              </span>
            </button>
            {agentsOpen && (
              <div className="mt-0.5 space-y-0.5">
                {agents.map(agent => (
                  <button
                    key={agent.containerId}
                    onClick={() => onSelectTask(agent.taskId)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                      activeView === 'task' && selectedTaskId === agent.taskId
                        ? 'bg-accent/15 text-primary'
                        : 'bg-subtle/50 text-secondary hover:text-primary hover:bg-subtle'
                    }`}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                    <span className="flex-1 min-w-0 text-sm truncate">{agent.taskId}</span>
                    <ElapsedBadge since={agent.startedAt} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tasks */}
        <div className="mt-3">
          <button
            onClick={() => setTasksOpen(!tasksOpen)}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-tertiary hover:text-secondary transition-colors"
          >
            {tasksOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Tasks
            {activeTasks.length > 0 && (
              <span className="ml-auto text-[10px] font-medium bg-accent/20 text-accent-light px-1.5 py-0.5 rounded-full normal-case tracking-normal">
                {activeTasks.length}
              </span>
            )}
          </button>
          {tasksOpen && (
            <div className="mt-0.5 space-y-0.5">
              {activeTasks.length === 0 ? (
                <p className="text-xs text-tertiary px-2.5 py-2">No active tasks</p>
              ) : (
                activeTasks.map(task => {
                  const status = task.meta.status as TaskStatus;
                  const isActive = activeView === 'task' && selectedTaskId === task.meta.id;
                  const adds = task.meta.additions as number | undefined;
                  const dels = task.meta.deletions as number | undefined;
                  return (
                    <button
                      key={task.meta.id}
                      onClick={() => onSelectTask(task.meta.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors overflow-hidden ${
                        isActive
                          ? 'bg-accent/15 text-primary'
                          : 'bg-subtle/50 text-secondary hover:text-primary hover:bg-subtle'
                      }`}
                    >
                      <span className="flex-shrink-0">{STATUS_ICONS[status]}</span>
                      <span className="flex-1 min-w-0 text-sm truncate">{task.meta.id}</span>
                      {adds != null && (
                        <span className="flex items-center gap-1 text-[9px] font-mono flex-shrink-0">
                          <span className="text-green-400">+{adds}</span>
                          <span className="text-red-400">-{dels ?? 0}</span>
                        </span>
                      )}
                      <Badge variant={status} className="text-[9px] px-1.5 py-0 flex-shrink-0">
                        {STATUS_SHORT[status]}
                      </Badge>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Completed */}
        {completedTasks.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setCompletedOpen(!completedOpen)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-tertiary hover:text-secondary transition-colors"
            >
              {completedOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              Completed
              <span className="ml-auto text-[10px] text-tertiary normal-case tracking-normal">
                {completedTasks.length}
              </span>
            </button>
            {completedOpen && (
              <div className="mt-0.5 space-y-0.5 opacity-60">
                {completedTasks.map(task => {
                  const status = task.meta.status as TaskStatus;
                  return (
                    <button
                      key={task.meta.id}
                      onClick={() => onSelectTask(task.meta.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                        activeView === 'task' && selectedTaskId === task.meta.id
                          ? 'bg-accent/15 text-primary'
                          : 'text-tertiary hover:text-secondary hover:bg-subtle'
                      }`}
                    >
                      <span className="flex-shrink-0">{STATUS_ICONS[status]}</span>
                      <span className="flex-1 text-xs truncate">{task.meta.id}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Conversations */}
        <div className="mt-3">
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-tertiary hover:text-secondary transition-colors"
          >
            {historyOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Conversations
            {conversations.length > 0 && (
              <span className="ml-auto text-[10px] text-tertiary normal-case tracking-normal">
                {conversations.length}
              </span>
            )}
          </button>
          {historyOpen && (
            <div className="mt-0.5 space-y-0.5">
              {conversations.length === 0 ? (
                <p className="text-xs text-tertiary px-2.5 py-2">No conversations yet</p>
              ) : (
                conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => onSelectChat(conv.id)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors ${
                      activeView === 'chat' && selectedConversationId === conv.id
                        ? 'bg-accent/15 text-primary'
                        : 'text-secondary hover:text-primary hover:bg-subtle'
                    }`}
                  >
                    <p className="text-sm truncate">{conv.summary || conv.id}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Clock size={9} className="text-tertiary" />
                      <span className="text-[10px] text-tertiary">
                        {conv.started ? new Date(conv.started).toLocaleDateString() : ''}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-t border-border flex-shrink-0">
        <button
          onClick={onToggleTheme}
          className="flex items-center gap-2 px-2 py-1.5 text-xs text-tertiary hover:text-primary transition-colors rounded-md hover:bg-subtle w-full"
        >
          {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
    </div>
  );
}
