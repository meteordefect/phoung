import { useState } from 'react';
import {
  Bot, Rocket, RefreshCw, AlertCircle, Brain, Wrench,
  ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle, Info,
} from 'lucide-react';
import type { StreamMessage, MessageBlock } from './types';

const TOOL_CONFIG: Record<string, { icon: typeof Rocket; label: string; accent: string }> = {
  spawn_subagent: { icon: Rocket, label: 'Spawn Sub-Agent', accent: 'blue' },
  list_tasks: { icon: RefreshCw, label: 'List Tasks', accent: 'slate' },
  update_task: { icon: RefreshCw, label: 'Update Task', accent: 'amber' },
  ask_human: { icon: AlertCircle, label: 'Ask Human', accent: 'yellow' },
  check_prs: { icon: RefreshCw, label: 'Check PRs', accent: 'slate' },
  create_memory: { icon: Brain, label: 'Create Memory', accent: 'purple' },
  read: { icon: Wrench, label: 'Read File', accent: 'slate' },
  write: { icon: Wrench, label: 'Write File', accent: 'emerald' },
  edit: { icon: Wrench, label: 'Edit File', accent: 'amber' },
  bash: { icon: Wrench, label: 'Shell', accent: 'orange' },
  grep: { icon: Wrench, label: 'Grep', accent: 'slate' },
  find: { icon: Wrench, label: 'Find', accent: 'slate' },
  ls: { icon: Wrench, label: 'List Dir', accent: 'slate' },
};

function accentClasses(accent: string) {
  const map: Record<string, string> = {
    blue: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    slate: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
    amber: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    yellow: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    purple: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
    emerald: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    orange: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  };
  return map[accent] || map.slate;
}

function ToolBlock({ block }: { block: MessageBlock }) {
  const [expanded, setExpanded] = useState(false);
  const config = TOOL_CONFIG[block.toolName || ''] || {
    icon: Wrench, label: block.toolName || 'Tool', accent: 'slate',
  };
  const Icon = config.icon;
  const classes = accentClasses(config.accent);
  const [textClass, bgClass, borderClass] = classes.split(' ');
  const running = !block.isComplete;

  return (
    <div className={`rounded-md border px-2.5 py-1.5 my-1.5 ${bgClass} ${borderClass}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left cursor-pointer"
      >
        {running ? (
          <Loader2 size={12} className={`flex-shrink-0 ${textClass} animate-spin`} />
        ) : block.isError ? (
          <XCircle size={12} className="flex-shrink-0 text-red-400" />
        ) : (
          <CheckCircle2 size={12} className={`flex-shrink-0 ${textClass}`} />
        )}
        <Icon size={12} className={`flex-shrink-0 ${textClass}`} />
        <span className={`text-xs font-medium ${textClass}`}>{config.label}</span>
        {block.toolArgs?.task_id != null && (
          <span className="text-[10px] text-tertiary font-mono">
            {String(block.toolArgs.task_id)}
          </span>
        )}
        {block.toolArgs?.project != null && (
          <span className="text-[10px] text-tertiary">
            {String(block.toolArgs.project)}
          </span>
        )}
        <span className="ml-auto flex-shrink-0">
          {expanded
            ? <ChevronUp size={10} className="text-tertiary" />
            : <ChevronDown size={10} className="text-tertiary" />}
        </span>
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1.5">
          {block.toolArgs && Object.keys(block.toolArgs).length > 0 && (
            <pre className="text-[11px] text-secondary whitespace-pre-wrap font-mono leading-relaxed max-h-32 overflow-y-auto px-1">
              {JSON.stringify(block.toolArgs, null, 2)}
            </pre>
          )}
          {block.toolResult && (
            <pre className={`text-[11px] whitespace-pre-wrap font-mono leading-relaxed max-h-40 overflow-y-auto px-1 ${block.isError ? 'text-red-400' : 'text-secondary'}`}>
              {block.toolResult}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function ThinkingBlock({ block }: { block: MessageBlock }) {
  const [expanded, setExpanded] = useState(false);
  const running = !block.isComplete;

  return (
    <div className="rounded-md border px-2.5 py-1.5 my-1.5 bg-violet-400/5 border-violet-400/15">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left cursor-pointer"
      >
        {running ? (
          <Loader2 size={12} className="flex-shrink-0 text-violet-400 animate-spin" />
        ) : (
          <Brain size={12} className="flex-shrink-0 text-violet-400" />
        )}
        <span className="text-xs font-medium text-violet-400">
          {running ? 'Thinking...' : 'Reasoning'}
        </span>
        {block.content && (
          <span className="text-[10px] text-tertiary truncate max-w-[200px]">
            {block.content.slice(0, 60)}{block.content.length > 60 ? '...' : ''}
          </span>
        )}
        <span className="ml-auto flex-shrink-0">
          {expanded
            ? <ChevronUp size={10} className="text-tertiary" />
            : <ChevronDown size={10} className="text-tertiary" />}
        </span>
      </button>
      {expanded && block.content && (
        <pre className="text-[11px] text-tertiary whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto mt-1.5 px-1 italic">
          {block.content}
        </pre>
      )}
    </div>
  );
}

function StatusBlock({ block }: { block: MessageBlock }) {
  return (
    <div className="flex items-center gap-2 my-1 px-1">
      <Info size={10} className="text-tertiary flex-shrink-0" />
      <span className="text-[11px] text-tertiary italic">{block.content}</span>
    </div>
  );
}

function ErrorBlock({ block }: { block: MessageBlock }) {
  return (
    <div className="rounded-md border px-2.5 py-1.5 my-1.5 bg-red-400/10 border-red-400/20">
      <div className="flex items-center gap-2">
        <XCircle size={12} className="flex-shrink-0 text-red-400" />
        <span className="text-xs text-red-400">{block.content}</span>
      </div>
    </div>
  );
}

function TextBlock({ block }: { block: MessageBlock }) {
  if (!block.content) return null;
  return (
    <div className="inline-block rounded-lg px-3.5 py-2 bg-subtle border border-border mb-1">
      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{block.content}</p>
    </div>
  );
}

function BlockRenderer({ block }: { block: MessageBlock }) {
  switch (block.kind) {
    case 'text': return <TextBlock block={block} />;
    case 'thinking': return <ThinkingBlock block={block} />;
    case 'tool': return <ToolBlock block={block} />;
    case 'status': return <StatusBlock block={block} />;
    case 'error': return <ErrorBlock block={block} />;
    default: return null;
  }
}

interface StreamMessageCardProps {
  message: StreamMessage;
}

export function StreamMessageCard({ message }: StreamMessageCardProps) {
  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (message.role === 'user') {
    const text = message.blocks.map(b => b.content).join('');
    return (
      <div className="flex gap-3 flex-row-reverse">
        <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-accent text-white">
          <span className="text-xs font-medium">M</span>
        </div>
        <div className="flex-1 max-w-[75%] text-right">
          <div className="inline-block rounded-lg px-3.5 py-2 bg-accent text-white">
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{text}</p>
          </div>
          <div className="text-[10px] text-tertiary mt-1 px-1">{formatTime(message.timestamp)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-subtle border border-border">
        <Bot size={14} className="text-secondary" />
      </div>
      <div className="flex-1 max-w-[85%]">
        <div>
          {message.blocks.map(block => (
            <BlockRenderer key={block.id} block={block} />
          ))}
          {message.isStreaming && message.blocks.length === 0 && (
            <div className="inline-block rounded-lg px-3.5 py-2 bg-subtle border border-border">
              <div className="flex items-center gap-1.5 py-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce [animation-delay:0ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce [animation-delay:150ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>
        <div className="text-[10px] text-tertiary mt-1 px-1">{formatTime(message.timestamp)}</div>
      </div>
    </div>
  );
}
