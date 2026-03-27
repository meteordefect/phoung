import { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { api } from '../api/client';

export function Settings() {
  const [sshKey, setSshKey] = useState<string | null>(null);
  const [keyExists, setKeyExists] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.sshKey.get().then((res) => {
      setKeyExists(res.exists);
      setSshKey(res.public_key);
    }).catch(() => {});
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await api.sshKey.generate();
      setSshKey(res.public_key);
      setKeyExists(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate key');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (sshKey) {
      navigator.clipboard.writeText(sshKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Settings</h1>
        <p className="text-secondary mt-1">System configuration and preferences</p>
      </div>

      <Card title="GitHub SSH Key">
        <div className="space-y-4">
          <p className="text-sm text-secondary leading-relaxed">
            Generate an SSH key to let Phoung access your GitHub repos.
            Copy the public key below and add it to{' '}
            <a
              href="https://github.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              GitHub &rarr; Settings &rarr; SSH Keys
            </a>.
          </p>

          {!keyExists ? (
            <div className="space-y-3">
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? 'Generating…' : 'Generate SSH Key'}
              </Button>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <pre className="bg-subtle border border-border rounded-xl p-4 pr-20 text-xs font-mono text-primary break-all whitespace-pre-wrap select-all">
                  {sshKey}
                </pre>
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute top-3 right-3"
                  onClick={handleCopy}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <p className="text-xs text-tertiary">
                This is the public key — safe to share. The private key stays on this server.
              </p>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="System Information" noPadding>
          <div className="divide-y divide-border">
            <div className="flex justify-between p-4 hover:bg-subtle/30 transition-colors">
              <span className="text-secondary font-medium">Version</span>
              <span className="font-mono text-sm text-primary bg-subtle px-2 py-0.5 rounded border border-border">v3.0</span>
            </div>
            <div className="flex justify-between p-4 hover:bg-subtle/30 transition-colors">
              <span className="text-secondary font-medium">Architecture</span>
              <span className="text-primary text-sm">Pull-based Control Plane</span>
            </div>
            <div className="flex justify-between p-4 hover:bg-subtle/30 transition-colors">
              <span className="text-secondary font-medium">Database</span>
              <span className="text-primary text-sm">PostgreSQL 16</span>
            </div>
            <div className="flex justify-between p-4 hover:bg-subtle/30 transition-colors">
              <span className="text-secondary font-medium">API URL</span>
              <span className="font-mono text-xs text-primary bg-subtle px-2 py-0.5 rounded border border-border">
                {import.meta.env.VITE_API_URL || '/api'}
              </span>
            </div>
          </div>
        </Card>

        <Card title="About">
          <div className="space-y-4 text-sm text-secondary">
            <p className="leading-relaxed">
              Phoung is a self-hosted control plane for managing remote OpenClaw AI agent instances.
            </p>
            <p className="leading-relaxed">
              Features pull-based heartbeat architecture, PostgreSQL-backed state management,
              and a password-protected dashboard.
            </p>
            <div className="pt-6 mt-4 border-t border-border">
              <p className="text-xs text-tertiary font-medium">
                © 2026 Friend Labs • Built with React, TypeScript, and Tailwind CSS
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
