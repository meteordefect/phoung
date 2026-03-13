import { useState } from 'react';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import type { Agent } from '../types';

export function Agents() {
  const { data: agents, loading, error, refetch } = usePolling(() => api.agents.list(), 5000);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleString();
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
      refetch();
      handleCloseModal();
    } catch (err) {
      alert(`Failed to update agent: ${err}`);
      setSaving(false);
    }
  };

  if (loading && !agents) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-tertiary">Loading agents...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-danger">Error loading agents: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">Agents</h1>
          <p className="text-secondary mt-1">Registered OpenClaw instances</p>
        </div>
      </div>

      {agents && agents.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <Card key={agent.id}>
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 rounded-full bg-subtle flex items-center justify-center text-xl shadow-inner">
                        🤖
                    </div>
                    <div className="flex-1">
                        <h3 className="font-semibold text-lg text-primary">{agent.name}</h3>
                        {agent.description && (
                        <p className="text-sm text-secondary mt-0.5">{agent.description}</p>
                        )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditClick(agent)}
                      className="text-xs"
                    >
                      ✏️ Edit
                    </Button>
                    <StatusBadge status={agent.status} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm bg-subtle/50 p-4 rounded-xl border border-border">
                  <div>
                    <div className="text-tertiary text-xs uppercase tracking-wide mb-1">Last Heartbeat</div>
                    <div className="font-medium text-primary">
                      {formatTimestamp(agent.last_heartbeat)}
                    </div>
                  </div>
                  <div>
                    <div className="text-tertiary text-xs uppercase tracking-wide mb-1">Version</div>
                    <div className="font-medium text-primary">
                      {agent.openclaw_version || 'Unknown'}
                    </div>
                  </div>
                  <div>
                    <div className="text-tertiary text-xs uppercase tracking-wide mb-1">IP Address</div>
                    <div className="font-medium text-primary">
                      {agent.ip_address || 'Unknown'}
                    </div>
                  </div>
                  <div>
                    <div className="text-tertiary text-xs uppercase tracking-wide mb-1">Agent ID</div>
                    <div className="font-mono text-xs text-secondary bg-subtle px-2 py-1 rounded border border-border inline-block">
                      {agent.id.slice(0, 8)}...
                    </div>
                  </div>
                </div>

                {Object.keys(agent.health).length > 0 && (
                  <div>
                    <div className="text-xs text-secondary mb-2 font-medium">Health Metrics</div>
                    <pre className="text-[10px] bg-subtle p-3 rounded-lg overflow-x-auto text-secondary border border-border">
                      {JSON.stringify(agent.health, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <div className="text-center py-12">
            <div className="text-4xl mb-4 grayscale opacity-50">🤖</div>
            <div className="text-primary font-medium mb-2">No agents registered yet</div>
            <div className="text-secondary text-sm">
              Agents will appear here once they register with the control plane
            </div>
          </div>
        </Card>
      )}

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
