import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ExternalLink, Trash2, Clock } from 'lucide-react';
import { Card } from '../components/Card';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import { loadSessionsIndex } from '../hooks/useOpenClawChat';
import type { ChatSession } from '../hooks/useOpenClawChat';

export function Sessions() {
  const navigate = useNavigate();
  const { data: sessions, loading, error } = usePolling(() => api.sessions.list(), 10000);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(loadSessionsIndex);

  const handleSelectSession = async (id: string) => {
    setSelectedSession(id);
    setLoadingSession(true);
    try {
      const session = await api.sessions.get(id);
      setSessionData(session);
    } catch (err) {
      alert(`Failed to load session: ${err}`);
    } finally {
      setLoadingSession(false);
    }
  };

  const openChatSession = (key: string) => {
    navigate(`/chat?session=${encodeURIComponent(key)}`);
  };

  const deleteChatSession = (key: string) => {
    localStorage.removeItem(`openclaw-chat-msg-${key}`);
    const updated = loadSessionsIndex().filter(s => s.key !== key);
    try { localStorage.setItem('openclaw-chat-sessions', JSON.stringify(updated)); } catch {}
    setChatSessions(updated);
  };

  const formatSessionTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading && !sessions) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-tertiary">Loading sessions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-danger">Error loading sessions: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Sessions</h1>
        <p className="text-secondary mt-1">OpenClaw session transcripts and chat history</p>
      </div>

      {/* Chat History Section */}
      {chatSessions.length > 0 && (
        <Card title="Chat History" noPadding>
          <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto">
            {chatSessions.map((session) => (
              <div
                key={session.key}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:bg-subtle transition-all group"
              >
                <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
                  <MessageSquare size={14} className="text-accent-light" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary truncate">
                    {session.preview || 'New conversation'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Clock size={10} className="text-tertiary" />
                    <span className="text-xs text-tertiary">{formatSessionTime(session.timestamp)}</span>
                    <span className="text-xs text-tertiary">• {session.messageCount} message{session.messageCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openChatSession(session.key)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent-light bg-accent/10 hover:bg-accent/20 border border-accent/30 rounded-lg transition-colors"
                  >
                    <ExternalLink size={12} />
                    Open in Chat
                  </button>
                  <button
                    onClick={() => deleteChatSession(session.key)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-danger/20 text-tertiary hover:text-danger transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Server Sessions Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Session List" noPadding className="h-full">
          {sessions && sessions.length > 0 ? (
            <div className="max-h-[600px] overflow-y-auto p-2 space-y-1">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => handleSelectSession(session.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 group ${
                    selectedSession === session.id
                      ? 'bg-accent text-white border-accent shadow-md'
                      : 'bg-card hover:bg-subtle border-border text-secondary hover:border-border'
                  }`}
                >
                  <div className={`font-medium text-sm ${selectedSession === session.id ? 'text-white' : 'text-primary'}`}>{session.id}</div>
                  <div className={`text-xs mt-1 ${selectedSession === session.id ? 'text-white/80' : 'text-tertiary'}`}>
                    {new Date(session.created).toLocaleString()}
                  </div>
                  <div className={`text-xs mt-1 ${selectedSession === session.id ? 'text-white/60' : 'text-tertiary'}`}>
                    {(session.size / 1024).toFixed(1)} KB
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-tertiary text-sm p-6 text-center">No sessions found</div>
          )}
        </Card>

        <Card title={selectedSession || 'Select a session'} className="lg:col-span-2 min-h-[600px]">
          {loadingSession ? (
            <div className="text-tertiary flex items-center justify-center h-64">Loading session...</div>
          ) : sessionData ? (
            <div className="space-y-4 h-full flex flex-col">
              <div className="text-sm text-secondary bg-subtle px-4 py-2 rounded-lg border border-border inline-block self-start">
                Created: <span className="font-medium text-primary">{new Date(sessionData.created).toLocaleString()}</span>
              </div>
              <div className="bg-subtle/50 rounded-xl p-6 border border-border flex-1 overflow-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap text-primary">
                  {JSON.stringify(sessionData.content, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="text-tertiary text-sm flex items-center justify-center h-64">Select a session to view transcript</div>
          )}
        </Card>
      </div>
    </div>
  );
}
