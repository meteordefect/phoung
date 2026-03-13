import { useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { api } from '../api/client';
import type { Event } from '../types';
import { usePolling } from '../hooks/usePolling';
import { usePreserveScroll } from '../hooks/usePreserveScroll';
import { Skeleton } from '../components/ui/skeleton';

const EVENT_COLORS: Record<string, string> = {
  task_created:     'text-[rgb(var(--color-working))]',
  agent_spawned:    'text-[rgb(var(--color-working))]',
  agent_exited:     'text-[rgb(var(--color-secondary))]',
  pr_opened:        'text-[rgb(var(--color-review))]',
  ci_passed:        'text-[rgb(var(--color-done))]',
  ci_failed:        'text-[rgb(var(--color-danger))]',
  review_requested: 'text-[rgb(var(--color-review))]',
  merged:           'text-[rgb(var(--color-done))]',
  merge_conflict:   'text-[rgb(var(--color-danger))]',
  agent_respawned:  'text-[rgb(var(--color-warning))]',
  project_created:  'text-[rgb(var(--color-working))]',
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ActivityView() {
  const { projectId } = useParams<{ projectId: string }>();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const lastSigRef = useRef('');

  const fetchEvents = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.tasks.activity(projectId, 100);
      const sig = data.map(e => e.id).join(',');
      if (sig === lastSigRef.current) { setLoading(false); return; }
      lastSigRef.current = sig;
      setEvents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  usePolling(fetchEvents, 15000, true, { busEvents: ['task:updated'] });

  const scrollRef = usePreserveScroll(events);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-primary">Activity</h1>
        <p className="text-sm text-[rgb(var(--muted-foreground))] mt-0.5">
          Audit log for this project
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 text-[rgb(var(--muted-foreground))]">
          <Activity className="mx-auto h-12 w-12 opacity-30 mb-3" />
          <p className="text-sm">No activity yet.</p>
        </div>
      ) : (
        <div ref={scrollRef} className="h-[calc(100vh-180px)] overflow-y-auto">
          <div className="space-y-1">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-[rgb(var(--muted)/0.5)] transition-colors"
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    EVENT_COLORS[event.type]
                      ? 'bg-current'
                      : 'bg-[rgb(var(--muted-foreground))]'
                  } ${EVENT_COLORS[event.type] ?? ''}`}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-[rgb(var(--foreground))]">
                    {event.type.replace(/_/g, ' ')}
                  </span>
                  {event.data && Object.keys(event.data).length > 0 && (
                    <span className="text-xs text-[rgb(var(--muted-foreground))] ml-2">
                      {Object.entries(event.data)
                        .slice(0, 3)
                        .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
                        .join(' · ')}
                    </span>
                  )}
                </div>
                <span className="text-xs text-[rgb(var(--muted-foreground))] shrink-0 tabular-nums">
                  {timeAgo(event.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
