import { useState } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';

export function Files() {
  const { data: files, loading, error } = usePolling(() => api.files.list(), 10000);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSelectFile = async (path: string) => {
    setSelectedFile(path);
    setLoadingFile(true);
    try {
      const file = await api.files.get(path);
      setFileContent(file.content || '');
    } catch (err) {
      alert(`Failed to load file: ${err}`);
    } finally {
      setLoadingFile(false);
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await api.files.update(selectedFile, fileContent);
      alert('File saved successfully');
    } catch (err) {
      alert(`Failed to save file: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !files) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-tertiary">Loading files...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-danger">Error loading files: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Files</h1>
        <p className="text-secondary mt-1">Browse and edit workspace files</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Workspace Files" noPadding className="h-full">
          {files && files.length > 0 ? (
            <div className="max-h-[500px] overflow-y-auto p-2 space-y-1">
              {files.map((file) => (
                <button
                  key={file}
                  onClick={() => handleSelectFile(file)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors font-medium ${
                    selectedFile === file
                      ? 'bg-accent text-white shadow-sm'
                      : 'hover:bg-subtle text-secondary hover:text-primary'
                  }`}
                >
                  {file}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-tertiary text-sm p-6 text-center">No files found</div>
          )}
        </Card>

        <Card title={selectedFile || 'Select a file'} className="lg:col-span-2 min-h-[500px]">
          {loadingFile ? (
            <div className="text-tertiary flex items-center justify-center h-64">Loading file...</div>
          ) : selectedFile ? (
            <div className="space-y-4 h-full flex flex-col">
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="w-full flex-1 min-h-[400px] px-4 py-3 border border-border rounded-xl font-mono text-sm focus:ring-2 focus:ring-ring focus:border-transparent outline-none bg-subtle/30 text-primary resize-none"
                spellCheck={false}
              />
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-tertiary text-sm flex items-center justify-center h-64">Select a file to view and edit</div>
          )}
        </Card>
      </div>
    </div>
  );
}
