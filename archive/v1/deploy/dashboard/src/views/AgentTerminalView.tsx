import { useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Terminal, Bot } from 'lucide-react';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { AgentTabBar } from '../components/agents/AgentTabBar';
import { AgentTerminalPane } from '../components/agents/AgentTerminalPane';
import { Skeleton } from '../components/ui/skeleton';
import type { Task } from '../types';

const ACTIVE_STATUSES = ['pending', 'spawned', 'coding', 'pr_open', 'ci_pending', 'review'];

export function AgentTerminalView() {
  const { projectId } = useParams<{ projectId: string }>();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const prevTaskIdsRef = useRef<string>('');

  const fetchTasks = useCallback(async () => {
    if (!projectId || projectId === 'default') return [];
    return api.tasks.list(projectId);
  }, [projectId]);

  const { data: allTasks, loading } = usePolling<Task[]>(fetchTasks, 8000, true, {
    busEvents: ['task:updated'],
  });

  const activeTasks = (allTasks || []).filter((t) => ACTIVE_STATUSES.includes(t.status));

  const taskIds = activeTasks.map((t) => t.id).join(',');
  if (taskIds !== prevTaskIdsRef.current) {
    prevTaskIdsRef.current = taskIds;
    if (activeTasks.length > 0 && (!activeTaskId || !activeTasks.find((t) => t.id === activeTaskId))) {
      setActiveTaskId(activeTasks[0].id);
    }
  }

  const selectedTask = activeTasks.find((t) => t.id === activeTaskId) || null;

  const handleNewEvents = useCallback(
    (taskId: string, count: number) => {
      if (taskId !== activeTaskId) {
        setUnreadCounts((prev) => ({ ...prev, [taskId]: (prev[taskId] || 0) + count }));
      }
    },
    [activeTaskId]
  );

  const handleSelectTab = useCallback((taskId: string) => {
    setActiveTaskId(taskId);
    setUnreadCounts((prev) => ({ ...prev, [taskId]: 0 }));
  }, []);

  if (!projectId || projectId === 'default') {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="rounded-xl bg-subtle border border-border p-8 max-w-sm w-full">
          <Terminal className="mx-auto h-12 w-12 text-tertiary opacity-40" />
          <h2 className="text-base font-semibold text-primary mt-3">No project selected</h2>
          <p className="text-sm text-tertiary mt-1.5">
            Select a project to view running agents.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] -mx-6 -mt-6 -mb-8">
      <div className="px-4 py-3 shrink-0">
        <h1 className="text-2xl font-serif font-bold text-primary">Agents</h1>
        <p className="text-sm text-tertiary mt-0.5">
          {activeTasks.length} active agent{activeTasks.length !== 1 ? 's' : ''} running
        </p>
      </div>

      {loading ? (
        <div className="px-4 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : activeTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center px-4">
          <Bot className="h-16 w-16 text-tertiary opacity-30 mb-4" />
          <h2 className="text-base font-semibold text-primary">No active agents</h2>
          <p className="text-sm text-tertiary mt-1 max-w-sm">
            Spawn a task from the Tasks view to start a coding agent. Active agents will appear here as tabs.
          </p>
        </div>
      ) : (
        <>
          <AgentTabBar
            tasks={activeTasks}
            activeTaskId={activeTaskId}
            onSelect={handleSelectTab}
            unreadCounts={unreadCounts}
          />
          {selectedTask && (
            <AgentTerminalPane
              key={selectedTask.id}
              task={selectedTask}
              onNewEvents={(count) => handleNewEvents(selectedTask.id, count)}
            />
          )}
        </>
      )}
    </div>
  );
}
