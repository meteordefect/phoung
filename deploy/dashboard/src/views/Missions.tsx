import React, { useState } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';

export function Missions() {
  const { data: missions, loading, error, refetch } = usePolling(() => api.missions.list(), 5000);
  const { data: agents } = usePolling(() => api.agents.list(), 5000);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newMission, setNewMission] = useState({ name: '', description: '', agentId: '' });
  const [creating, setCreating] = useState(false);
  const [expandedMission, setExpandedMission] = useState<string | null>(null);
  const [missionDetails, setMissionDetails] = useState<Record<string, any>>({});

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      // Create the mission
      const mission = await api.missions.create({
        name: newMission.name,
        description: newMission.description,
      });
      
      // Automatically create a command for this mission
      await api.missions.queueCommand(mission.id, {
        type: 'openclaw.chat',
        payload: {
          message: newMission.name,
          context: newMission.description,
        },
        agent_id: newMission.agentId || undefined,
        priority: 10,
      });
      
      setNewMission({ name: '', description: '', agentId: '' });
      setShowCreateForm(false);
      refetch();
    } catch (err) {
      alert(`Failed to create mission: ${err}`);
    } finally {
      setCreating(false);
    }
  };

  const toggleMissionDetails = async (missionId: string) => {
    if (expandedMission === missionId) {
      setExpandedMission(null);
    } else {
      setExpandedMission(missionId);
      if (!missionDetails[missionId]) {
        try {
          const details = await api.missions.get(missionId);
          setMissionDetails(prev => ({ ...prev, [missionId]: details }));
        } catch (err) {
          console.error('Failed to load mission details:', err);
        }
      }
    }
  };

  if (loading && !missions) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-tertiary">Loading missions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-danger">Error loading missions: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">Missions</h1>
          <p className="text-secondary mt-1">High-level objectives and command queues</p>
        </div>
        <Button
          onClick={() => setShowCreateForm(!showCreateForm)}
          variant={showCreateForm ? 'secondary' : 'primary'}
        >
          {showCreateForm ? 'Cancel' : 'New Mission'}
        </Button>
      </div>

      {showCreateForm && (
        <Card title="Create New Mission">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">
                Mission Name
              </label>
              <input
                type="text"
                value={newMission.name}
                onChange={(e) => setNewMission({ ...newMission, name: e.target.value })}
                className="input-base"
                placeholder="e.g., Explain who you are to me"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">
                Description (Optional)
              </label>
              <textarea
                value={newMission.description}
                onChange={(e) => setNewMission({ ...newMission, description: e.target.value })}
                className="input-base resize-none"
                placeholder="Additional context for the agent"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">
                Assign to Agent
              </label>
              <select
                value={newMission.agentId}
                onChange={(e) => setNewMission({ ...newMission, agentId: e.target.value })}
                className="select-base w-full"
              >
                <option value="">Any Available Agent</option>
                {agents?.filter(a => a.status === 'online').map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} ({agent.openclaw_version || 'v1.0.0'})
                  </option>
                ))}
              </select>
              <p className="text-xs text-tertiary mt-1">
                Leave blank to assign to any available agent
              </p>
            </div>
            <div className="flex justify-end pt-2">
                <Button
                type="submit"
                disabled={creating}
                >
                {creating ? 'Creating...' : 'Create Mission'}
                </Button>
            </div>
          </form>
        </Card>
      )}

      {missions && missions.length > 0 ? (
        <div className="space-y-4">
          {missions.map((mission) => {
            const isExpanded = expandedMission === mission.id;
            const details = missionDetails[mission.id];
            
            return (
              <Card key={mission.id}>
                <div className="space-y-3">
                  <div 
                    className="flex items-start justify-between cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => toggleMissionDetails(mission.id)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-tertiary">{isExpanded ? '▼' : '▶'}</span>
                        <h3 className="font-semibold text-lg text-primary">{mission.name}</h3>
                      </div>
                      {mission.description && (
                        <p className="text-sm text-secondary mt-1 ml-6">{mission.description}</p>
                      )}
                    </div>
                    <StatusBadge status={mission.status} />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm pt-2">
                    <div className="bg-subtle p-3 rounded-lg">
                      <div className="text-tertiary text-xs uppercase tracking-wide mb-1">Total Commands</div>
                      <div className="font-medium text-primary text-lg">{mission.total_commands || 0}</div>
                    </div>
                    <div className="bg-subtle p-3 rounded-lg">
                      <div className="text-tertiary text-xs uppercase tracking-wide mb-1">Completed</div>
                      <div className="font-medium text-success text-lg">{mission.completed_commands || 0}</div>
                    </div>
                    <div className="bg-subtle p-3 rounded-lg">
                      <div className="text-tertiary text-xs uppercase tracking-wide mb-1">Failed</div>
                      <div className="font-medium text-danger text-lg">{mission.failed_commands || 0}</div>
                    </div>
                    <div className="bg-subtle p-3 rounded-lg">
                      <div className="text-tertiary text-xs uppercase tracking-wide mb-1">Created</div>
                      <div className="font-medium text-primary text-lg">
                        {new Date(mission.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {isExpanded && details && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <h4 className="text-sm font-semibold text-secondary mb-3">Command Results</h4>
                      {details.commands && details.commands.length > 0 ? (
                        <div className="space-y-3">
                          {details.commands.map((cmd: any) => (
                            <div key={cmd.id} className="bg-subtle rounded-lg p-4 border border-border">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono bg-card px-2 py-1 rounded border border-border">{cmd.type}</span>
                                  <StatusBadge status={cmd.status} />
                                </div>
                                {cmd.agent_name && (
                                  <span className="text-xs text-tertiary">by {cmd.agent_name}</span>
                                )}
                              </div>
                              
                              {cmd.result && (
                                <div className="mt-3">
                                  <div className="text-xs text-tertiary mb-1">Response:</div>
                                  <div className="bg-card rounded p-3 border border-border">
                                    {typeof cmd.result === 'object' && cmd.result.response ? (
                                      <div className="space-y-2">
                                        <div className="text-sm text-primary whitespace-pre-wrap">
                                          {cmd.result.response}
                                        </div>
                                        {cmd.result.query && (
                                          <details className="text-xs text-tertiary mt-2">
                                            <summary className="cursor-pointer hover:text-secondary">Debug Info</summary>
                                            <pre className="mt-2 text-xs">
                                              {JSON.stringify(cmd.result, null, 2)}
                                            </pre>
                                          </details>
                                        )}
                                      </div>
                                    ) : (
                                      <pre className="text-sm text-primary whitespace-pre-wrap font-sans">
                                        {typeof cmd.result === 'string' 
                                          ? cmd.result 
                                          : JSON.stringify(cmd.result, null, 2)}
                                      </pre>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              <div className="flex gap-4 mt-3 text-xs text-tertiary">
                                {cmd.created_at && (
                                  <span>Created: {new Date(cmd.created_at).toLocaleString()}</span>
                                )}
                                {cmd.completed_at && (
                                  <span>Completed: {new Date(cmd.completed_at).toLocaleString()}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-tertiary italic">No commands executed yet</div>
                      )}
                    </div>
                  )}

                  {isExpanded && !details && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="text-sm text-tertiary italic">Loading details...</div>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🎯</div>
            <div className="text-primary font-medium mb-2">No missions yet</div>
            <div className="text-sm text-secondary">
              Create a mission to start queuing commands for agents
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
