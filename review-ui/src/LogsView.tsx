import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Copy, Check, ChevronDown, Terminal } from 'lucide-react';
import { api } from './api';

const SERVICES = ['api', 'ui', 'nginx'] as const;
type Service = typeof SERVICES[number];

const SERVICE_LABELS: Record<Service, string> = {
  api: 'Main Agent API',
  ui: 'Review UI',
  nginx: 'Nginx',
};

export function LogsView() {
  const [activeService, setActiveService] = useState<Service>('api');
  const [logs, setLogs] = useState<Record<Service, string>>({ api: '', ui: '', nginx: '' });
  const [loading, setLoading] = useState<Record<Service, boolean>>({ api: false, ui: false, nginx: false });
  const [copied, setCopied] = useState(false);
  const [lines, setLines] = useState(200);
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLPreElement>(null);

  const fetchLogs = useCallback(async (service: Service) => {
    setLoading(prev => ({ ...prev, [service]: true }));
    try {
      const data = await api.logs.get(service, lines);
      setLogs(prev => ({ ...prev, [service]: data.logs }));
    } catch (err: any) {
      setLogs(prev => ({ ...prev, [service]: `Error fetching logs: ${err.message}` }));
    } finally {
      setLoading(prev => ({ ...prev, [service]: false }));
    }
  }, [lines]);

  useEffect(() => {
    fetchLogs(activeService);
  }, [activeService, fetchLogs]);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(logs[activeService]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleScroll = () => {
    if (!logRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  };

  const colorizeLog = (text: string) => {
    return text.split('\n').map((line, i) => {
      let cls = 'text-log-default';
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

  return (
    <div className="flex flex-col h-[calc(100vh-200px)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-primary">Logs</h1>
          <p className="text-sm text-secondary mt-0.5">Container logs — live view with copy</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={lines}
              onChange={e => setLines(Number(e.target.value))}
              className="appearance-none pl-3 pr-8 py-1.5 text-sm bg-subtle border border-border rounded-lg text-secondary focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
            >
              <option value={100}>Last 100 lines</option>
              <option value={200}>Last 200 lines</option>
              <option value={500}>Last 500 lines</option>
              <option value={1000}>Last 1000 lines</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-tertiary pointer-events-none" />
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-secondary hover:text-primary bg-subtle hover:bg-subtle/80 border border-border rounded-lg transition-colors"
          >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>

          <button
            onClick={() => fetchLogs(activeService)}
            disabled={loading[activeService]}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-secondary hover:text-primary bg-subtle hover:bg-subtle/80 border border-border rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading[activeService] ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-card border border-border flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex border-b border-border px-4 pt-3 gap-1 flex-shrink-0">
          {SERVICES.map(svc => (
            <button
              key={svc}
              onClick={() => setActiveService(svc)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors -mb-px ${
                activeService === svc
                  ? 'border-accent text-accent-light bg-accent/5'
                  : 'border-transparent text-secondary hover:text-primary hover:bg-subtle/50'
              }`}
            >
              <Terminal size={12} />
              {SERVICE_LABELS[svc]}
              {loading[svc] && (
                <RefreshCw size={10} className="animate-spin text-tertiary" />
              )}
            </button>
          ))}
        </div>

        <pre
          ref={logRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto p-4 text-xs font-mono leading-relaxed bg-[#0d1117] text-slate-300 min-h-0"
        >
          {logs[activeService]
            ? colorizeLog(logs[activeService])
            : (
              <span className="text-tertiary italic">
                {loading[activeService] ? 'Loading logs...' : 'No logs yet — click Refresh'}
              </span>
            )
          }
        </pre>

        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-subtle/30 flex-shrink-0 text-xs text-tertiary">
          <span>{logs[activeService].split('\n').filter(Boolean).length} lines</span>
          <button
            onClick={() => {
              setAutoScroll(true);
              logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
            }}
            className={`flex items-center gap-1 transition-opacity ${autoScroll ? 'opacity-30' : 'opacity-100 text-accent-light hover:text-accent'}`}
          >
            <ChevronDown size={12} /> Scroll to bottom
          </button>
        </div>
      </div>
    </div>
  );
}
