import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Skeleton } from './components/ui/skeleton';

const ChatView = lazy(() => import('./components/chat/ChatView').then(m => ({ default: m.ChatView })));
const TasksView = lazy(() => import('./views/TasksView').then(m => ({ default: m.TasksView })));
const MergeQueueView = lazy(() => import('./views/MergeQueueView').then(m => ({ default: m.MergeQueueView })));
const ActivityView = lazy(() => import('./views/ActivityView').then(m => ({ default: m.ActivityView })));
const Files = lazy(() => import('./views/Files').then(m => ({ default: m.Files })));
const Settings = lazy(() => import('./views/Settings').then(m => ({ default: m.Settings })));

function TabFallback() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-32" />
      <div className="space-y-3 mt-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Suspense fallback={<TabFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/p" replace />} />
            <Route path="/p" element={<Navigate to="/p/default/tasks" replace />} />
            <Route path="/p/:projectId/tasks" element={<TasksView />} />
            <Route path="/p/:projectId/merge-queue" element={<MergeQueueView />} />
            <Route path="/p/:projectId/chat" element={<ChatView />} />
            <Route path="/p/:projectId/activity" element={<ActivityView />} />
            <Route path="/p/:projectId/files" element={<Files />} />
            <Route path="/p/:projectId/settings" element={<Settings />} />
            <Route path="/chat" element={<ChatView />} />
            <Route path="/files" element={<Files />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Suspense>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
