import { useRef, useEffect, useState } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { User, Bot, Wifi, WifiOff, AtSign, Plus, History, Trash2, Clock, MessageSquare, X } from 'lucide-react';
import { Badge } from '../ui/badge';
import { useOpenClawChat } from '../../hooks/useOpenClawChat';
import type { ChatSession } from '../../hooks/useOpenClawChat';
import { ChatInput } from './ChatInput';

// Get OpenClaw gateway config from environment
const getGatewayWsUrl = () => {
  const envUrl = import.meta.env.VITE_GATEWAY_WS_URL;
  if (envUrl) return envUrl;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const port = window.location.port ? `:${window.location.port}` : '';
  return `${protocol}//${host}${port}`;
};

const GATEWAY_WS_URL = getGatewayWsUrl();
const GATEWAY_TOKEN = import.meta.env.VITE_GATEWAY_TOKEN || '';

export function ChatView() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { projectId } = useParams<{ projectId?: string }>();

  const {
    messages, isConnected, isConnecting, error, sendMessage,
    activeSessionKey, savedSessions, startNewSession, loadSession, deleteSession,
    streamingContent, isWaitingForReply,
  } = useOpenClawChat(GATEWAY_WS_URL, GATEWAY_TOKEN, projectId);

  // Handle URL session parameter (e.g. /chat?session=xxx)
  useEffect(() => {
    const sessionParam = searchParams.get('session');
    if (sessionParam) {
      loadSession(sessionParam);
      setSearchParams({}, { replace: true });
    }
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (message: string, _mentionedAgentIds?: string[]) => {
    if (!message.trim() || !isConnected) return;

    try {
      await sendMessage(message);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

  // Render message content with highlighted mentions
  const renderMessageContent = (content: string) => {
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <span key={index} className="inline-flex items-center gap-1 bg-accent/20 text-accent-light px-1.5 py-0.5 rounded-md mx-0.5 font-medium">
            <AtSign size={12} />
            {part.slice(1)}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  // Extract mentioned agent names from a message
  const extractMentions = (content: string): string[] => {
    const mentions = content.match(/@(\w+)/g);
    return mentions ? mentions.map(m => m.slice(1)) : [];
  };

  const handleSelectSession = (session: ChatSession) => {
    loadSession(session.key);
    setShowHistory(false);
  };

  const handleNewChat = () => {
    startNewSession();
    setShowHistory(false);
  };

  const handleDeleteSession = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    deleteSession(key);
  };

  const renderSessionList = (isMobile: boolean) => (
    savedSessions.length === 0 ? (
      <div className="text-center text-tertiary text-xs p-6">
        <MessageSquare size={24} className="mx-auto mb-2 opacity-30" />
        No saved conversations
      </div>
    ) : (
      savedSessions.map((session) => (
        <button
          key={session.key}
          onClick={() => handleSelectSession(session)}
          className={`w-full text-left px-3 py-2.5 rounded-lg transition-all group ${
            session.key === activeSessionKey
              ? 'bg-accent/15 border border-accent/30'
              : 'hover:bg-subtle border border-transparent active:bg-subtle'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm truncate flex-1 ${
              session.key === activeSessionKey ? 'text-accent-light font-medium' : 'text-primary'
            }`}>
              {session.preview || 'New conversation'}
            </p>
            <button
              onClick={(e) => handleDeleteSession(e, session.key)}
              className={`${isMobile ? '' : 'opacity-0 group-hover:opacity-100'} p-1 rounded hover:bg-danger/20 text-tertiary hover:text-danger transition-all flex-shrink-0`}
            >
              <Trash2 size={isMobile ? 14 : 12} />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Clock size={10} className="text-tertiary" />
            <span className="text-xs text-tertiary">{formatSessionTime(session.timestamp)}</span>
            <span className="text-xs text-tertiary">• {session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}</span>
          </div>
        </button>
      ))
    )
  );

  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">Chat</h1>
          <p className="text-secondary mt-1 hidden sm:block">Talk to your agents directly • Use @ to mention specific agents</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-secondary hover:text-primary bg-subtle hover:bg-subtle/80 border border-border rounded-lg transition-colors"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">New Chat</span>
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-lg transition-colors ${
              showHistory
                ? 'text-accent-light bg-accent/15 border-accent/30'
                : 'text-secondary hover:text-primary bg-subtle hover:bg-subtle/80 border-border'
            }`}
          >
            <History size={14} />
            <span className="hidden sm:inline">History</span>
            {savedSessions.length > 0 && (
              <span className="ml-1 text-xs bg-accent/20 text-accent-light px-1.5 py-0.5 rounded-full">
                {savedSessions.length}
              </span>
            )}
          </button>

          <div className="flex items-center gap-2 ml-2 pl-3 border-l border-border">
            {isConnecting ? (
              <>
                <div className="w-2 h-2 rounded-full bg-warning animate-pulse"></div>
                <span className="text-sm text-secondary hidden sm:inline">Connecting...</span>
              </>
            ) : isConnected ? (
              <>
                <Wifi size={16} className="text-success" />
                <span className="text-sm text-secondary hidden sm:inline">Connected</span>
              </>
            ) : (
              <>
                <WifiOff size={16} className="text-danger" />
                <span className="text-sm text-danger hidden sm:inline">Disconnected</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-card border border-border flex-1 flex flex-row min-h-0 max-h-[calc(100vh-250px)] overflow-hidden">
        {/* Desktop Session History Sidebar */}
        {showHistory && (
          <div className="hidden md:flex w-72 border-r border-border flex-col bg-subtle/30 flex-shrink-0">
            <div className="p-3 border-b border-border">
              <h3 className="text-sm font-semibold text-primary">Chat History</h3>
              <p className="text-xs text-tertiary mt-0.5">
                {savedSessions.length} conversation{savedSessions.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {renderSessionList(false)}
            </div>
          </div>
        )}

        {/* Chat Main Area */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Connection notice when gateway is unavailable */}
          {!isConnected && !isConnecting && (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 m-4 mb-0">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 pt-0.5">
                  <WifiOff size={20} className="text-warning" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-warning mb-1">OpenClaw Gateway Not Available</h3>
                  <p className="text-xs text-secondary leading-relaxed">
                    The chat feature requires an OpenClaw Gateway to be running on the server.
                    The gateway is not currently configured or running. This feature is currently unavailable.
                  </p>
                  <p className="text-xs text-tertiary mt-2">
                    <strong>Available features:</strong> Overview, Agents, Missions, Files, Sessions, Events, Settings
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            {error && (
              <div className="text-center text-danger text-sm p-4 bg-danger/10 rounded-lg">
                {error}
              </div>
            )}

            {messages.length === 0 && !error && !streamingContent && (
              <div className="text-center text-secondary p-8">
                <Bot size={48} className="mx-auto mb-4 opacity-20" />
                <p className="text-sm">
                  {isConnected
                    ? 'No messages yet. Start a conversation with OpenClaw!'
                    : 'Waiting for connection to OpenClaw gateway...'}
                </p>
                <p className="text-xs mt-2 text-tertiary">
                  Connected to: {GATEWAY_WS_URL}
                </p>
              </div>
            )}

            {messages.map((msg) => {
              const mentions = msg.role === 'user' ? extractMentions(msg.content) : [];

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* Avatar */}
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      msg.role === 'user'
                        ? 'bg-accent text-white'
                        : 'bg-subtle border border-border'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <User size={16} />
                    ) : (
                      <Bot size={16} className="text-secondary" />
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div className={`flex-1 max-w-[70%] ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {/* OpenClaw badge (for assistant responses) */}
                    {msg.role === 'assistant' && (
                      <div className="mb-1">
                        <Badge
                          variant="outline"
                          className="text-xs px-2 py-0.5 bg-[rgb(var(--color-done)/0.15)] text-[rgb(var(--color-done))] border-[rgb(var(--color-done)/0.3)]"
                        >
                          OpenClaw
                        </Badge>
                      </div>
                    )}

                    {/* Message Content */}
                    <div
                      className={`inline-block rounded-lg px-4 py-2 ${
                        msg.role === 'user'
                          ? 'bg-accent text-white'
                          : 'bg-subtle border border-border'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {msg.role === 'user' ? renderMessageContent(msg.content) : msg.content}
                      </p>
                    </div>

                    {/* Mentioned Agents */}
                    {mentions.length > 0 && (
                      <div className={`flex gap-1 mt-1.5 flex-wrap ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {mentions.map((agentName, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 text-xs bg-accent/20 text-accent-light px-1.5 py-0.5 rounded-md"
                          >
                            <AtSign size={8} />
                            {agentName}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Timestamp */}
                    <div className="text-xs text-tertiary mt-1 px-1">
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Streaming bubble */}
            {(streamingContent || isWaitingForReply) && (
              <div className="flex gap-3 flex-row">
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-subtle border border-border">
                  <Bot size={16} className="text-secondary" />
                </div>
                <div className="flex-1 max-w-[70%] text-left">
                  <div className="mb-1">
                    <Badge
                      variant="outline"
                      className="text-xs px-2 py-0.5 bg-[rgb(var(--color-done)/0.15)] text-[rgb(var(--color-done))] border-[rgb(var(--color-done)/0.3)]"
                    >
                      OpenClaw
                    </Badge>
                  </div>
                  <div className="inline-block rounded-lg px-4 py-2 bg-subtle border border-border">
                    {streamingContent ? (
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {streamingContent}
                        <span className="inline-block w-1.5 h-4 ml-0.5 bg-accent/60 animate-pulse align-text-bottom rounded-sm" />
                      </p>
                    ) : (
                      <div className="flex items-center gap-1.5 py-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce [animation-delay:0ms]" />
                        <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce [animation-delay:150ms]" />
                        <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce [animation-delay:300ms]" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-border p-4">
            <ChatInput
              onSend={handleSend}
              disabled={!isConnected}
              placeholder={isConnected ? "Type your message... Use @agent to mention" : "Waiting for connection..."}
            />
            <p className="text-xs text-tertiary mt-2 hidden sm:flex items-center gap-2">
              <AtSign size={12} className="opacity-70" />
              Type <span className="font-mono bg-subtle px-1 rounded">@agentname</span> to mention specific agents
            </p>
          </div>
        </div>
      </div>

      {/* Mobile history popup */}
      {showHistory && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setShowHistory(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[70vh] bg-card rounded-t-2xl border-t border-border flex flex-col animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-primary">Chat History</h3>
                <p className="text-xs text-tertiary mt-0.5">
                  {savedSessions.length} conversation{savedSessions.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => setShowHistory(false)} className="p-2 rounded-lg hover:bg-subtle transition-colors">
                <X size={18} className="text-tertiary" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {renderSessionList(true)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
