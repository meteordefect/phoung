import { useState } from 'react';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import type { Agent } from '../types';

export function Overview() {
  const { data: agents, refetch: refetchAgents } = usePolling(() => api.agents.list(), 5000);
  const { data: missions } = usePolling(() => api.missions.list(), 5000);
  const { data: events } = usePolling(() => api.events.list({ limit: 10 }), 10000);
  const { data: health } = usePolling(() => api.health(), 30000);
  
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  const stats = {
    agents: {
      total: agents?.length || 0,
      online: agents?.filter((a) => a.status === 'online').length || 0,
    },
    missions: {
      total: missions?.length || 0,
      active: missions?.filter((m) => m.status === 'active').length || 0,
      completed: missions?.filter((m) => m.status === 'completed').length || 0,
    },
  };

  const handleEditClick = (agent: Agent) => {
    setEditingAgent(agent);
    setEditForm({
      name: agent.name,
      description: agent.description || '',
    });
  };

  const handleCloseModal = () => {
    setEditingAgent(null);
    setEditForm({ name: '', description: '' });
    setSaving(false);
  };

  const handleSave = async () => {
    if (!editingAgent) return;
    
    setSaving(true);
    try {
      await api.agents.update(editingAgent.id, {
        name: editForm.name,
        description: editForm.description || undefined,
      });
      refetchAgents();
      handleCloseModal();
    } catch (err) {
      alert(`Failed to update agent: ${err}`);
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Overview</h1>
        <p className="text-secondary mt-1 text-lg">System status and recent activity</p>
      </div>

      {/* Compact Stats for Mobile, Full Cards for Desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Agents & System Health - Combined on Mobile */}
        <Card>
          <div className="flex flex-col h-full justify-between">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="text-sm font-medium text-secondary uppercase tracking-wide">Agents</div>
                <div className="text-4xl font-serif font-bold text-primary mt-2">{stats.agents.total}</div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-success"></span>
                  <div className="text-sm font-medium text-success">{stats.agents.online} online</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-medium text-secondary uppercase tracking-wide mb-2">System</div>
                <StatusBadge status={health?.status === 'ok' ? 'online' : 'offline'} className="text-xs py-1 px-2" />
              </div>
            </div>
          </div>
        </Card>

        {/* Missions - Combined Active & Completed */}
        <Card>
          <div className="flex flex-col h-full justify-between">
            <div>
              <div className="text-sm font-medium text-secondary uppercase tracking-wide">Missions</div>
              <div className="text-4xl font-serif font-bold text-primary mt-2">{stats.missions.total}</div>
              <div className="mt-3 flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-accent"></span>
                  <div className="text-sm font-medium text-accent">{stats.missions.active} active</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-success"></span>
                  <div className="text-sm font-medium text-success">{stats.missions.completed} done</div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card title="Agents" noPadding>
          {agents && agents.length > 0 ? (
            <div className="divide-y divide-border">
              {agents.slice(0, 5).map((agent) => (
                <div key={agent.id} className="flex items-center justify-between p-4 hover:bg-subtle/30 transition-colors group">
                  <div className="flex items-center gap-3 flex-1">
                     <div className="w-8 h-8 rounded-full bg-subtle flex items-center justify-center text-lg border border-border">
                        🤖
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-primary text-sm">{agent.name}</div>
                      <div className="text-xs text-secondary">{agent.openclaw_version || 'Unknown version'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditClick(agent)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-secondary hover:text-primary px-2 py-1 hover:bg-subtle rounded"
                      title="Edit agent"
                    >
                      ✏️
                    </button>
                    <StatusBadge status={agent.status} variant="dot" />
                  </div>
                </div>
              ))}
              <div className="p-3 text-center border-t border-border/50">
                <a href="/agents" className="text-xs font-medium text-accent hover:text-accent-dark transition-colors">View All Agents →</a>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-secondary text-sm">No agents registered</div>
          )}
        </Card>

        <Card title="Recent Events" noPadding>
          {events && events.length > 0 ? (
            <div className="divide-y divide-border">
              {events.map((event) => (
                <div key={event.id} className="p-4 hover:bg-subtle/30 transition-colors">
                  <div className="flex justify-between items-start mb-1">
                     <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-subtle text-primary border border-border uppercase tracking-wide">
                        {event.type}
                      </span>
                      <div className="text-[10px] text-tertiary">
                        {new Date(event.created_at).toLocaleString()}
                      </div>
                  </div>
                  <div className="text-xs text-secondary pl-1">
                    {event.agent_name && (
                        <>
                        <span className="text-tertiary">Agent:</span> <span className="font-medium text-primary">{event.agent_name}</span>
                        </>
                    )}
                    {event.agent_name && event.mission_name && <span className="mx-1.5 text-tertiary">|</span>}
                    {event.mission_name && (
                        <>
                        <span className="text-tertiary">Mission:</span> {event.mission_name}
                        </>
                    )}
                  </div>
                </div>
              ))}
               <div className="p-3 text-center border-t border-border/50">
                <a href="/events" className="text-xs font-medium text-accent hover:text-accent-dark transition-colors">View Full Log →</a>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-secondary text-sm">No recent events</div>
          )}
        </Card>
      </div>

      <Modal
        isOpen={!!editingAgent}
        onClose={handleCloseModal}
        title="Edit Agent"
        footer={
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={handleCloseModal}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving || !editForm.name.trim()}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-2">
              Agent Name
            </label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="input-base"
              placeholder="Enter agent name"
              disabled={saving}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary mb-2">
              Description (Optional)
            </label>
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              className="input-base resize-none"
              placeholder="Enter agent description"
              rows={3}
              disabled={saving}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
