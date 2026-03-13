import { useState } from 'react';
import { Card } from '../components/Card';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';

export function Events() {
  const [limit, setLimit] = useState(100);
  const { data: events, loading, error } = usePolling(
    () => api.events.list({ limit }),
    10000
  );

  if (loading && !events) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-tertiary">Loading events...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-danger">Error loading events: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">Events</h1>
          <p className="text-secondary mt-1">System audit trail and activity log</p>
        </div>
        <div className="relative">
          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10))}
            className="select-base"
          >
            <option value="50">Last 50</option>
            <option value="100">Last 100</option>
            <option value="200">Last 200</option>
            <option value="500">Last 500</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-tertiary">
            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
            </svg>
          </div>
        </div>
      </div>

      <Card noPadding>
        {events && events.length > 0 ? (
          <div className="divide-y divide-border">
            {events.map((event) => (
              <div
                key={event.id}
                className="p-4 hover:bg-subtle/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-subtle text-primary border border-border">
                        {event.type}
                      </span>
                      <span className="text-xs text-tertiary">
                        {new Date(event.created_at).toLocaleString()}
                      </span>
                    </div>
                    {(event.agent_name || event.mission_name) && (
                      <div className="text-sm text-secondary mt-1 ml-1">
                        {event.agent_name && (
                           <span className="font-medium text-primary">{event.agent_name}</span>
                        )}
                        {event.agent_name && event.mission_name && <span className="text-tertiary mx-1">•</span>}
                        {event.mission_name && (
                            <span className="text-secondary">{event.mission_name}</span>
                        )}
                      </div>
                    )}
                    {Object.keys(event.data).length > 0 && (
                      <details className="mt-2 ml-1 group">
                        <summary className="text-xs text-secondary cursor-pointer hover:text-primary transition-colors select-none flex items-center gap-1">
                          <span className="group-open:rotate-90 transition-transform">▶</span> Data Payload
                        </summary>
                        <pre className="mt-2 text-[10px] bg-subtle p-3 rounded-lg overflow-x-auto text-secondary border border-border">
                          {JSON.stringify(event.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-4xl mb-4 grayscale opacity-50">📜</div>
            <div className="text-primary font-medium mb-2">No events yet</div>
            <div className="text-sm text-secondary">
              Events will appear here as the system runs
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
