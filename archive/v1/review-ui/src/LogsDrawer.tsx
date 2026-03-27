import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import { api } from './api';

const SERVICES = ['api', 'ui', 'nginx'] as const;
type Service = typeof SERVICES[number];

const SERVICE_LABELS: Record<Service, string> = {
  api: 'Agent API',
  ui: 'Review UI',
  nginx: 'Nginx',
};

interface LogsDrawerProps {
  open: boolean;
  onToggle: () => void;
}

export function LogsDrawer({ open, onToggle }: LogsDrawerProps) {
  const [activeService, setActiveService] = useState<Service>('api');
  const [logs, setLogs] = useState<Record<Service, string>>({ api: '', ui: '', nginx: '' });
  const [loading, setLoading] = useState<Record<Service, boolean>>({ api: false, ui: false, nginx: false });
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLPreElement>(null);

  const fetchLogs = useCallback(async (service: Service) => {
    setLoading(prev => ({ ...prev, [service]: true }));
    try {
      const data = await api.logs.get(service, 200);
      setLogs(prev => ({ ...prev, [service]: data.logs }));
    } catch (err: any) {
      setLogs(prev => ({ ...prev, [service]: `Error: ${err.message}` }));
    } finally {
      setLoading(prev => ({ ...prev, [service]: false }));
    }
  }, []);

  useEffect(() => {
    if (open) fetchLogs(activeService);
  }, [open, activeService, fetchLogs]);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!logRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  };

  const colorizeLog = (text: string) => {
    if (!text) return null;
    return text.split('\n').map((line, i) => {
      let cls = 'text-slate-300';
      if (/error|exception|traceback|failed|fatal/i.test(line)) cls = 'text-red-400';
      else if (/warn/i.test(line)) cls = 'text-yellow-400';
      else if (/info|started|healthy|up/i.test(line)) cls = 'text-green-400';
      else if (/debug/i.test(line)) cls = 'text-blue-400';
      return (
        <span key={i} className={cls}>
          {line}
          {'\n'}
        </span>
      );
    });
  };

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center gap-2 px-4 h-8 border-t border-border bg-card/80 hover:bg-subtle transition-colors flex-shrink-0 w-full text-left"
      >
        <Terminal size={11} className="text-tertiary" />
        <span className="text-[11px] text-tertiary font-medium">Logs</span>
        <ChevronUp size={10} className="text-tertiary ml-auto" />
      </button>
    );
  }

  return (
    <div className="flex flex-col h-56 border-t border-border flex-shrink-0">
      <div className="flex items-center bg-card border-b border-border flex-shrink-0">
        <div className="flex gap-0.5 px-2 py-1 flex-1">
          {SERVICES.map(svc => (
            <button
              key={svc}
              onClick={() => setActiveService(svc)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded transition-colors ${
                activeService === svc
                  ? 'text-accent-light bg-accent/10'
                  : 'text-tertiary hover:text-secondary hover:bg-subtle'
              }`}
            >
              <Terminal size={10} />
              {SERVICE_LABELS[svc]}
              {loading[svc] && <RefreshCw size={8} className="animate-spin" />}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 px-2">
          <button
            onClick={() => fetchLogs(activeService)}
            disabled={loading[activeService]}
            className="p-1 rounded text-tertiary hover:text-secondary hover:bg-subtle transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={11} className={loading[activeService] ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onToggle}
            className="p-1 rounded text-tertiary hover:text-secondary hover:bg-subtle transition-colors"
            title="Collapse"
          >
            <ChevronDown size={11} />
          </button>
        </div>
      </div>

      <pre
        ref={logRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto px-3 py-2 text-[11px] font-mono leading-relaxed bg-[#0d1117] min-h-0"
      >
        {logs[activeService]
          ? colorizeLog(logs[activeService])
          : (
            <span className="text-tertiary italic">
              {loading[activeService] ? 'Loading logs...' : 'No logs — click Refresh'}
            </span>
          )
        }
      </pre>
    </div>
  );
}
