import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, AtSign } from 'lucide-react';
import { api } from '../../api/client';
import type { Agent } from '../../types';

interface ChatInputProps {
  onSend: (message: string, mentionedAgentIds?: string[]) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

interface Mention {
  id: string;
  name: string;
  displayName: string;
  start: number;
  end: number;
}

export function ChatInput({ onSend, disabled, placeholder = "Type a message... Use @ to mention agents" }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Agent[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Load agents for mentions
  useEffect(() => {
    const loadAgents = async () => {
      try {
        const agentList = await api.agents.list();
        // Only include online agents
        setAgents(agentList.filter(a => a.status === 'online'));
      } catch (err) {
        console.error('Failed to load agents:', err);
      }
    };
    loadAgents();
  }, []);

  // Parse mentions from input
  const parseMentions = useCallback((text: string): { text: string; mentions: Mention[] } => {
    const mentions: Mention[] = [];

    // Find all @mentions like @agentName
    const mentionRegex = /@(\w+)/g;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      const [fullMatch, name] = match;
      const agent = agents.find(a => 
        a.name.toLowerCase() === name.toLowerCase() ||
        a.name.toLowerCase().startsWith(name.toLowerCase())
      );

      if (agent) {
        const mention: Mention = {
          id: agent.id,
          name: agent.name,
          displayName: agent.name,
          start: match.index,
          end: match.index + fullMatch.length,
        };
        mentions.push(mention);
      }
    }

    return { text, mentions };
  }, [agents]);

  // Handle mention typing
  const handleMentionTrigger = useCallback((text: string, cursorPos: number) => {
    // Check if we're typing a mention (@)
    const textBeforeCursor = text.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      const query = mentionMatch[1];
      setMentionQuery(query);
      setMentionStart(cursorPos - mentionMatch[0].length);

      // Filter agents based on query
      const filtered = agents.filter(agent =>
        query === '' ||
        agent.name.toLowerCase().includes(query.toLowerCase()) ||
        (agent.description && agent.description.toLowerCase().includes(query.toLowerCase()))
      );

      setSuggestions(filtered);
      setSelectedIndex(0);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  }, [agents]);

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInput(newValue);
    adjustTextareaHeight();

    const cursorPos = e.target.selectionStart;
    handleMentionTrigger(newValue, cursorPos);
  };

  // Auto-resize textarea
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[selectedIndex]);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await handleSend();
    }
  };

  // Select a suggestion
  const handleSelectSuggestion = (agent: Agent) => {
    const beforeMention = input.slice(0, mentionStart);
    const afterMention = input.slice(mentionStart + mentionQuery.length + 1); // +1 for @
    const newValue = `${beforeMention}@${agent.name} ${afterMention}`;

    setInput(newValue);
    setShowSuggestions(false);
    setSuggestions([]);

    // Focus and move cursor
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        const newCursorPos = mentionStart + agent.name.length + 2; // +2 for @ and space
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // Handle send
  const handleSend = async () => {
    if (!input.trim() || disabled) return;

    const { mentions } = parseMentions(input);
    const mentionedIds = mentions.map(m => m.id);

    setInput('');
    adjustTextareaHeight();

    await onSend(input.trim(), mentionedIds.length > 0 ? mentionedIds : undefined);
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Format time for status
  const formatLastSeen = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return 'Active';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    return 'Recently';
  };

  return (
    <div className="relative">
      <div className="flex gap-2 items-end">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="w-full px-4 py-3 pr-12 bg-subtle border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed text-sm leading-relaxed text-primary placeholder:text-tertiary shadow-sm"
            style={{ minHeight: '44px', maxHeight: '150px' }}
          />
          {input.length > 0 && (
            <button
              onClick={() => {
                setInput('');
                adjustTextareaHeight();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary hover:text-secondary transition-colors"
              aria-label="Clear input"
            >
              <AtSign size={14} />
            </button>
          )}
        </div>
        <button
          onClick={handleSend}
          disabled={!input.trim() || disabled}
          className="px-4 py-3 bg-accent text-white rounded-xl hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm"
        >
          <Send size={18} />
        </button>
      </div>

      {/* Mention suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute left-0 right-0 bottom-full mb-2 bg-card border border-border rounded-xl shadow-lg z-50 max-h-64 overflow-y-auto"
        >
          <div className="p-2">
            <div className="text-xs text-tertiary uppercase tracking-wide px-2 py-1">
              {mentionQuery ? 'Matching Agents' : 'All Online Agents'}
            </div>
            {suggestions.map((agent, index) => (
              <button
                key={agent.id}
                onClick={() => handleSelectSuggestion(agent)}
                className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors ${
                  index === selectedIndex
                    ? 'bg-accent/15 text-accent-light'
                    : 'hover:bg-subtle'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-subtle flex items-center justify-center text-lg shadow-sm border border-border">
                  🤖
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-primary truncate">{agent.name}</div>
                  {agent.description && (
                    <div className="text-xs text-tertiary truncate">{agent.description}</div>
                  )}
                </div>
                <div className="text-xs text-success font-medium">
                  {formatLastSeen(agent.last_heartbeat)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {showSuggestions && suggestions.length === 0 && mentionQuery && (
        <div className="absolute left-0 right-0 bottom-full mb-2 bg-card border border-border rounded-xl shadow-lg z-50 p-3 text-sm text-tertiary">
          No matching agents found
        </div>
      )}
    </div>
  );
}
