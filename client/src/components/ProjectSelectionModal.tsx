'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Check, Loader2, X } from 'lucide-react';

interface Project {
  projectId: string;
  title: string;
}

interface ProjectSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (projectId: string) => void;
  onSkip: () => void;
}

export default function ProjectSelectionModal({
  isOpen,
  onClose,
  onSelect,
  onSkip,
}: ProjectSelectionModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
    }
  }, [isOpen]);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:8080/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newTitle.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:8080/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newTitle,
          description: 'Created during practice session',
        }),
      });
      if (res.ok) {
        const newProject = await res.json();
        setProjects([...projects, newProject]);
        setSelectedProjectId(newProject.projectId);
        setNewTitle('');
        setIsCreating(false);
      }
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1C1C1E] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
            <div>
                <h3 className="text-xl font-semibold text-white">Save Session</h3>
                <p className="text-sm text-zinc-400 mt-1">Which project should this session belong to?</p>
            </div>
            {/* NO_CLOSE_BUTTON — we WANT them to select or skip explicitly */}
        </div>

        <div className="p-6 max-h-[400px] overflow-y-auto custom-scrollbar space-y-3">
          {isLoading && projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-zinc-400">Loading your projects...</p>
            </div>
          ) : (
            <>
              {projects.map((p) => (
                <button
                  key={p.projectId}
                  onClick={() => setSelectedProjectId(p.projectId)}
                  className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all ${
                    selectedProjectId === p.projectId
                      ? 'bg-blue-500/10 border-blue-500/50 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.1)]'
                      : 'bg-white/5 border-white/5 text-zinc-300 hover:bg-white/10 hover:border-white/10'
                  }`}
                >
                  <span className="font-medium truncate">{p.title}</span>
                  {selectedProjectId === p.projectId && (
                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </button>
              ))}

              {!isCreating ? (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full p-4 rounded-xl border border-dashed border-white/10 bg-white/2 flex items-center justify-center gap-2 text-zinc-400 hover:text-white hover:bg-white/5 hover:border-white/20 transition-all group"
                >
                  <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span className="font-medium">Create New Project</span>
                </button>
              ) : (
                <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3 animate-in slide-in-from-top-2 duration-200">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Project Title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                    className="w-full bg-[#2C2C2E] border border-white/10 rounded-lg p-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateProject}
                      disabled={!newTitle.trim()}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white py-2 rounded-lg font-medium transition-colors"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => setIsCreating(false)}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-6 border-t border-white/5 bg-[#252528] flex gap-3">
          <button
            onClick={onSkip}
            className="flex-1 px-4 py-3 rounded-xl bg-transparent border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 transition-all font-medium"
          >
            Skip/No Project
          </button>
          <button
            onClick={() => selectedProjectId && onSelect(selectedProjectId)}
            disabled={!selectedProjectId || isLoading}
            className="flex-1 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:grayscale text-white font-semibold transition-all shadow-lg shadow-blue-950/20"
          >
            Confirm & Save
          </button>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
