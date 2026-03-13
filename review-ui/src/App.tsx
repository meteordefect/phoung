import { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { ChatView } from './ChatView';
import { TaskDetailView } from './TaskDetailView';
import { MonitorView } from './MonitorView';
import { ContextPanel } from './ContextPanel';
import { LogsDrawer } from './LogsDrawer';
import { api } from './api';
import { eventBus } from './lib/eventBus';
import type { Task, Conversation } from './types';

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeView, setActiveView] = useState<'chat' | 'task' | 'monitor'>('chat');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
  });
  const tasksSigRef = useRef('');
  const convSigRef = useRef('');

  const fetchTasks = useCallback(async () => {
    try {
      const data = await api.tasks.list();
      const sig = data.map(t => `${t.meta.id}:${t.meta.status}`).join(',');
      if (sig === tasksSigRef.current) return;
      tasksSigRef.current = sig;
      setTasks(data);
    } catch { /* API may not be ready */ }
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const data = await api.conversations.list();
      const sig = data.map(c => c.id).join(',');
      if (sig === convSigRef.current) return;
      convSigRef.current = sig;
      setConversations(data);
    } catch { /* API may not be ready */ }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchConversations();

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => { fetchTasks(); fetchConversations(); }, 30000);
    };
    const stopPolling = () => {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
    };
    startPolling();

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => { fetchTasks(); fetchConversations(); startPolling(); }, 500);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
      if (debounce) clearTimeout(debounce);
    };
  }, [fetchTasks, fetchConversations]);

  useEffect(() => {
    const unsubs = [
      eventBus.on('task:updated', () => fetchTasks()),
      eventBus.on('chat:message', () => fetchConversations()),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [fetchTasks, fetchConversations]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '`' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setLogsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('light', next === 'light');
  };

  const handleSelectChat = (convId?: string) => {
    setActiveView('chat');
    setSelectedConversationId(convId || null);
    setSelectedTaskId(null);
  };

  const handleSelectTask = (taskId: string) => {
    setActiveView('task');
    setSelectedTaskId(taskId);
  };

  const handleNewChat = () => {
    setActiveView('chat');
    setSelectedConversationId(null);
    setSelectedTaskId(null);
  };

  const handleSelectMonitor = () => {
    setActiveView('monitor');
    setSelectedTaskId(null);
    setSelectedConversationId(null);
  };

  const handleConversationCreated = (convId: string) => {
    setSelectedConversationId(convId);
    fetchConversations();
  };

  const selectedTask = tasks.find(t => t.meta.id === selectedTaskId) || null;

  return (
    <div className="h-screen flex bg-surface text-primary font-sans">
      <Sidebar
        tasks={tasks}
        conversations={conversations}
        activeView={activeView}
        selectedTaskId={selectedTaskId}
        selectedConversationId={selectedConversationId}
        onSelectChat={handleSelectChat}
        onSelectTask={handleSelectTask}
        onSelectMonitor={handleSelectMonitor}
        onNewChat={handleNewChat}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="flex-1 min-h-0 overflow-hidden flex">
          <div className={`flex-1 min-w-0 ${activeView === 'chat' ? '' : 'hidden'}`}>
            <ChatView
              key={selectedConversationId ?? '__new__'}
              initialConversationId={selectedConversationId}
              onConversationCreated={handleConversationCreated}
            />
          </div>
          {activeView === 'monitor' && (
            <div className="flex-1 min-w-0">
              <MonitorView
                tasks={tasks}
                onSelectTask={handleSelectTask}
                onRefresh={fetchTasks}
              />
            </div>
          )}
          {activeView === 'task' && selectedTask && (
            <div className="flex-1 min-w-0">
              <TaskDetailView task={selectedTask} onRefresh={fetchTasks} />
            </div>
          )}
          {activeView === 'task' && !selectedTask && (
            <div className="flex-1 flex items-center justify-center text-tertiary text-sm">
              Select a task from the sidebar
            </div>
          )}
          {activeView === 'task' && selectedTask?.meta.pr && (
            <ContextPanel taskId={selectedTask.meta.id} pr={selectedTask.meta.pr} />
          )}
        </div>

        <LogsDrawer open={logsOpen} onToggle={() => setLogsOpen(prev => !prev)} />
      </div>
    </div>
  );
}

export default App;
