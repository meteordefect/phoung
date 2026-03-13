import { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { ChatView } from './ChatView';
import { TaskDetailView } from './TaskDetailView';
import { DashboardView } from './DashboardView';
import { ContextPanel } from './ContextPanel';
import { LogsDrawer } from './LogsDrawer';
import { api } from './api';
import { eventBus } from './lib/eventBus';
import type { Task, Conversation, ProjectInfo, RunningAgent } from './types';

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [agents, setAgents] = useState<RunningAgent[]>([]);

  const [topLevel, setTopLevel] = useState<'dashboard' | 'project'>('dashboard');
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'chat' | 'task'>('chat');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
  });

  const tasksSigRef = useRef('');
  const convSigRef = useRef('');
  const agentsSigRef = useRef('');

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

  const fetchProjects = useCallback(async () => {
    try {
      setProjects(await api.projects.list());
    } catch { /* API may not be ready */ }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await api.agents.running();
      const sig = data.map(a => `${a.taskId}:${a.containerId}`).join(',');
      if (sig === agentsSigRef.current) return;
      agentsSigRef.current = sig;
      setAgents(data);
    } catch { /* API may not be ready */ }
  }, []);

  const fetchAll = useCallback(() => {
    fetchTasks();
    fetchConversations();
    fetchProjects();
    fetchAgents();
  }, [fetchTasks, fetchConversations, fetchProjects, fetchAgents]);

  useEffect(() => {
    fetchAll();

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(fetchAll, 30000);
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
        debounce = setTimeout(() => { fetchAll(); startPolling(); }, 500);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
      if (debounce) clearTimeout(debounce);
    };
  }, [fetchAll]);

  useEffect(() => {
    const unsubs = [
      eventBus.on('task:updated', () => { fetchTasks(); fetchAgents(); }),
      eventBus.on('chat:message', () => fetchConversations()),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [fetchTasks, fetchConversations, fetchAgents]);

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

  useEffect(() => {
    if (topLevel !== 'project') return;
    const id = setInterval(fetchAgents, 10000);
    return () => clearInterval(id);
  }, [topLevel, fetchAgents]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('light', next === 'light');
  };

  const handleSelectProject = (name: string) => {
    setSelectedProject(name);
    setTopLevel('project');
    setActiveView('chat');
    setSelectedTaskId(null);
    setSelectedConversationId(null);
  };

  const handleBackToDashboard = () => {
    setTopLevel('dashboard');
    setSelectedProject(null);
    setSelectedTaskId(null);
    setSelectedConversationId(null);
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

  const handleConversationCreated = (convId: string) => {
    setSelectedConversationId(convId);
    fetchConversations();
  };

  if (topLevel === 'dashboard') {
    return (
      <DashboardView
        projects={projects}
        tasks={tasks}
        agents={agents}
        conversations={conversations}
        onSelectProject={handleSelectProject}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  const projectTasks = tasks.filter(t => t.meta.project === selectedProject);
  const projectConversations = conversations.filter(c => c.project === selectedProject);
  const projectAgents = agents.filter(a => a.project === selectedProject);
  const selectedTask = projectTasks.find(t => t.meta.id === selectedTaskId) || null;

  return (
    <div className="h-screen flex bg-surface text-primary font-sans">
      <Sidebar
        project={selectedProject!}
        tasks={projectTasks}
        conversations={projectConversations}
        agents={projectAgents}
        activeView={activeView}
        selectedTaskId={selectedTaskId}
        selectedConversationId={selectedConversationId}
        onBack={handleBackToDashboard}
        onSelectChat={handleSelectChat}
        onSelectTask={handleSelectTask}
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
              project={selectedProject || undefined}
            />
          </div>
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
