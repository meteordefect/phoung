import { useState, useEffect } from 'react';
import {
  FileText, ExternalLink, CheckCircle, XCircle,
  Clock, Loader, Minus, Plus,
} from 'lucide-react';
import { api } from './api';
import type { PrInfo } from './types';

interface ContextPanelProps {
  taskId: string;
  pr: string;
}

export function ContextPanel({ taskId, pr }: ContextPanelProps) {
  const [prInfo, setPrInfo] = useState<PrInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.tasks.prInfo(taskId)
      .then(setPrInfo)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [taskId, pr]);

  if (loading) {
    return (
      <div className="w-64 border-l border-border bg-card flex-shrink-0 flex items-center justify-center">
        <Loader size={16} className="animate-spin text-tertiary" />
      </div>
    );
  }

  if (error || !prInfo) {
    return (
      <div className="w-64 border-l border-border bg-card flex-shrink-0 p-3">
        <p className="text-xs text-tertiary">{error || 'No PR info available'}</p>
      </div>
    );
  }

  return (
    <div className="w-64 border-l border-border bg-card flex-shrink-0 flex flex-col min-h-0">
      <div className="px-3 py-2.5 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-secondary uppercase tracking-wider">Changes</span>
          <span className="text-[11px] text-tertiary">{prInfo.changed_files} files</span>
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="flex items-center gap-0.5 text-[11px] text-green-400 font-mono">
            <Plus size={9} />{prInfo.additions}
          </span>
          <span className="flex items-center gap-0.5 text-[11px] text-red-400 font-mono">
            <Minus size={9} />{prInfo.deletions}
          </span>
          <a
            href={prInfo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-tertiary hover:text-accent-light transition-colors"
            title="Open PR on GitHub"
          >
            <ExternalLink size={11} />
          </a>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="py-1">
          {prInfo.files.map(file => (
            <div
              key={file.filename}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-subtle transition-colors group"
            >
              <FileText size={11} className="text-tertiary flex-shrink-0" />
              <span className="flex-1 text-[11px] text-secondary truncate group-hover:text-primary" title={file.filename}>
                {file.filename.split('/').pop()}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {file.additions > 0 && (
                  <span className="text-[10px] text-green-400 font-mono">+{file.additions}</span>
                )}
                {file.deletions > 0 && (
                  <span className="text-[10px] text-red-400 font-mono">-{file.deletions}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {prInfo.checks.length > 0 && (
        <div className="border-t border-border px-3 py-2.5 flex-shrink-0">
          <p className="text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5">CI Checks</p>
          <div className="space-y-1">
            {prInfo.checks.map((check, i) => (
              <div key={i} className="flex items-center gap-2">
                {check.conclusion === 'success' ? (
                  <CheckCircle size={11} className="text-green-400 flex-shrink-0" />
                ) : check.conclusion === 'failure' ? (
                  <XCircle size={11} className="text-red-400 flex-shrink-0" />
                ) : check.status === 'in_progress' ? (
                  <Loader size={11} className="text-yellow-400 animate-spin flex-shrink-0" />
                ) : (
                  <Clock size={11} className="text-tertiary flex-shrink-0" />
                )}
                <span className="text-[11px] text-secondary truncate">{check.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
