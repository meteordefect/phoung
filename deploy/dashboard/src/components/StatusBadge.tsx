interface StatusBadgeProps {
  status: string;
  className?: string;
  variant?: 'solid' | 'outline' | 'dot';
}

const statusConfig: Record<string, { bg: string, text: string, dot: string }> = {
  // Active / Good states
  online: { bg: 'bg-emerald-500', text: 'text-white', dot: 'bg-emerald-500' },
  active: { bg: 'bg-emerald-500', text: 'text-white', dot: 'bg-emerald-500' },
  completed: { bg: 'bg-emerald-600', text: 'text-white', dot: 'bg-emerald-600' },
  done: { bg: 'bg-emerald-600', text: 'text-white', dot: 'bg-emerald-600' },
  
  // Working / Processing states
  working: { bg: 'bg-accent', text: 'text-white', dot: 'bg-accent' },
  running: { bg: 'bg-accent', text: 'text-white', dot: 'bg-accent' },
  
  // Warning / Review states
  review: { bg: 'bg-purple-600', text: 'text-white', dot: 'bg-purple-600' },
  stale: { bg: 'bg-amber-500', text: 'text-white', dot: 'bg-amber-500' },
  waiting: { bg: 'bg-amber-500', text: 'text-white', dot: 'bg-amber-500' },
  pending: { bg: 'bg-amber-500', text: 'text-white', dot: 'bg-amber-500' },
  
  // Error / Bad states
  offline: { bg: 'bg-gray-500', text: 'text-white', dot: 'bg-gray-400' },
  failed: { bg: 'bg-red-600', text: 'text-white', dot: 'bg-red-600' },
  cancelled: { bg: 'bg-gray-400', text: 'text-white', dot: 'bg-gray-400' },
  
  // Default
  default: { bg: 'bg-subtle', text: 'text-secondary', dot: 'bg-tertiary' }
};

export function StatusBadge({ status, className = '', variant = 'solid' }: StatusBadgeProps) {
  const normalizedStatus = status?.toLowerCase() || 'default';
  const config = statusConfig[normalizedStatus] || statusConfig.default;
  
  if (variant === 'dot') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-sm text-secondary ${className}`}>
        <span className={`w-2 h-2 rounded-full ${config.dot} shadow-sm`} />
        <span className="capitalize">{status}</span>
      </span>
    );
  }

  if (variant === 'outline') {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider border border-border text-secondary bg-card ${className}`}>
        {status}
      </span>
    );
  }
  
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider shadow-sm ${config.bg} ${config.text} ${className}`}>
      {status}
    </span>
  );
}
