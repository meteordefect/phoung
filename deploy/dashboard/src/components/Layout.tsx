import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  GitPullRequest, MessageSquare, ListTodo, Activity,
  FolderOpen, Settings as SettingsIcon, Menu, X,
  Sun, Moon, Plus, ChevronDown,
} from 'lucide-react';
import { api, connectSSE, disconnectSSE } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import type { Project } from '../types';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from './ui/dialog';
import { Label } from './ui/label';

interface LayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

function projectNav(projectId: string, counts?: { tasks_pending: number; merge_ready: number }): NavItem[] {
  return [
    { path: `/p/${projectId}/tasks`,       label: 'Tasks',       icon: ListTodo,       badge: counts?.tasks_pending },
    { path: `/p/${projectId}/merge-queue`, label: 'Merge Queue', icon: GitPullRequest, badge: counts?.merge_ready },
    { path: `/p/${projectId}/chat`,        label: 'Chat',        icon: MessageSquare },
    { path: `/p/${projectId}/activity`,    label: 'Activity',    icon: Activity },
    { path: `/p/${projectId}/files`,       label: 'Files',       icon: FolderOpen },
    { path: `/p/${projectId}/settings`,    label: 'Settings',    icon: SettingsIcon },
  ];
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ projectId?: string }>();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', repo_url: '', default_branch: 'main' });
  const [creating, setCreating] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    api.projects.list().then(setProjects).catch(console.error);
    connectSSE();
    return () => disconnectSSE();
  }, []);

  const activeProjectId = params.projectId && params.projectId !== 'default'
    ? params.projectId
    : projects[0]?.id;

  const [counts, setCounts] = useState({ tasks_pending: 0, merge_ready: 0 });
  const countsSigRef = useRef('');

  const fetchCounts = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const data = await api.tasks.counts(activeProjectId);
      const sig = `${data.tasks_pending}:${data.merge_ready}`;
      if (sig === countsSigRef.current) return;
      countsSigRef.current = sig;
      setCounts(data);
    } catch { /* ignore */ }
  }, [activeProjectId]);

  usePolling(fetchCounts, 15000);

  useEffect(() => {
    if (
      (location.pathname === '/p' || location.pathname === '/p/default/tasks') &&
      projects.length > 0
    ) {
      navigate(`/p/${projects[0].id}/tasks`, { replace: true });
    }
  }, [projects, location.pathname, navigate]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('light', next === 'light');
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const p = await api.projects.create(newProject);
      setProjects((prev) => [...prev, p]);
      setNewProjectOpen(false);
      setNewProject({ name: '', repo_url: '', default_branch: 'main' });
      navigate(`/p/${p.id}/tasks`);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const navItems = activeProjectId ? projectNav(activeProjectId, counts) : [];

  return (
    <div className="min-h-screen bg-surface text-primary flex flex-col font-sans">

      {/* Top bar — project tabs */}
      <header className="sticky top-0 z-50 bg-card border-b border-border flex items-center px-4 gap-2 h-12 shrink-0">
        <span className="font-serif font-bold text-primary text-base mr-3 hidden sm:block">Phoung</span>

        {/* Project switcher tabs */}
        <div className="flex items-center gap-1 overflow-x-auto flex-1">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate(`/p/${p.id}/tasks`)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeProjectId === p.id
                  ? 'bg-subtle text-primary shadow-sm ring-1 ring-border'
                  : 'text-secondary hover:text-primary hover:bg-subtle/50'
              }`}
            >
              {p.name}
              {(p.active_tasks ?? 0) > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[rgb(var(--color-accent)/0.2)] text-[rgb(var(--color-accent))] text-[10px] font-semibold">
                  {p.active_tasks}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Add project */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setNewProjectOpen(true)}
          className="shrink-0 gap-1"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">Add</span>
        </Button>

        {/* Theme + mobile menu */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-tertiary hover:text-primary hover:bg-subtle transition-colors"
          title="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg hover:bg-subtle transition-colors"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar — per project */}
        <aside className="hidden md:flex flex-col w-52 bg-card border-r border-border shrink-0">
          <nav className="flex-1 px-3 py-4 space-y-0.5">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                    isActive
                      ? 'bg-subtle text-primary shadow-sm ring-1 ring-border'
                      : 'text-secondary hover:text-primary hover:bg-subtle/50'
                  }`}
                >
                  <Icon
                    size={16}
                    className={`transition-transform duration-150 group-hover:scale-110 ${isActive ? 'opacity-100' : 'opacity-60'}`}
                  />
                  <span className="flex-1">{item.label}</span>
                  {(item.badge ?? 0) > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-[rgb(var(--color-accent)/0.2)] text-[rgb(var(--color-accent))] text-[10px] font-semibold px-1">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="px-4 py-3 border-t border-border">
            <p className="text-xs text-tertiary">Phoung v4.0</p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-surface">
          <div className="max-w-6xl mx-auto px-6 py-6 pb-24 md:pb-8">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="absolute top-12 left-0 h-full w-56 bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="p-3 space-y-0.5">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive ? 'bg-subtle text-primary' : 'text-secondary hover:text-primary hover:bg-subtle/50'
                    }`}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* New Project Dialog */}
      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateProject} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="proj-name">Name</Label>
              <input
                id="proj-name"
                className="input-base"
                placeholder="my-app"
                value={newProject.name}
                onChange={(e) => setNewProject((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-url">Repo URL</Label>
              <input
                id="proj-url"
                className="input-base"
                placeholder="git@github.com:user/my-app.git"
                value={newProject.repo_url}
                onChange={(e) => setNewProject((p) => ({ ...p, repo_url: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-branch">Default Branch</Label>
              <input
                id="proj-branch"
                className="input-base"
                placeholder="main"
                value={newProject.default_branch}
                onChange={(e) => setNewProject((p) => ({ ...p, default_branch: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewProjectOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create Project'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Suppress unused import warning for ChevronDown (used in future mobile dropdown)
void ChevronDown;
