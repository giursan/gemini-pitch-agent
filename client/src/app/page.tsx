'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Folder, BarChart2, Video } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface Project {
    projectId: string;
    title: string;
    description: string;
    createdAt: number;
    updatedAt: number;
    sessionCount: number;
    latestScore: number | null;
    bestScore: number | null;
}

export default function DashboardPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newProjectTitle, setNewProjectTitle] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [greeting, setGreeting] = useState('Welcome back');

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Good morning!');
        else if (hour < 18) setGreeting('Good afternoon!');
        else setGreeting('Good evening!');

        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        try {
            const res = await apiFetch('/projects');
            const data = await res.json();
            if (Array.isArray(data)) {
                setProjects(data);
            } else {
                console.error('Projects data is not an array:', data);
                setProjects([]);
            }
        } catch (err) {
            console.error('Failed to fetch projects:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectTitle.trim()) return;

        setIsCreating(true);
        try {
            const res = await apiFetch('/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newProjectTitle,
                    description: newProjectDesc
                })
            });

            if (res.ok) {
                setNewProjectTitle('');
                setNewProjectDesc('');
                setIsCreateModalOpen(false);
                fetchProjects();
            }
        } catch (err) {
            console.error('Failed to create project:', err);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8F9FA] pb-20">
            <header className="bg-white border-b border-neutral-200 pt-10 pb-12 shadow-sm mb-12">
                <div className="max-w-6xl mx-auto px-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                    <div>
                        <h1 className="text-3xl font-black text-neutral-900 tracking-tight leading-tight">{greeting}</h1>
                        <p className="text-sm text-neutral-500 mt-1 font-medium max-w-md">
                            Manage your pitch preparations and materials.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="flex items-center gap-3 px-6 py-3 rounded-full text-[10px] font-black bg-white text-neutral-900 border border-neutral-200 hover:border-neutral-900/40 hover:shadow-md transition-all uppercase tracking-[0.2em]"
                        >
                            <Plus className="w-4 h-4" />
                            NEW PROJECT
                        </button>
                        <Link
                            href="/practice"
                            className="flex items-center gap-3 px-8 py-4 rounded-full text-[10px] font-black bg-neutral-900 text-white shadow-xl shadow-neutral-900/20 hover:scale-[1.05] hover:bg-neutral-800 transition-all uppercase tracking-[0.2em]"
                        >
                            <Video className="w-4 h-4 text-white" />
                            QUICK SESSION
                        </Link>
                    </div>
                </div>
            </header>

            <div className="max-w-6xl mx-auto px-8">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center p-20 gap-4">
                        <div className="relative">
                            <div className="absolute inset-0 bg-neutral-900/10 blur-2xl rounded-full scale-150 animate-pulse"></div>
                            <img src="/images/aura-ai-logo-dark.svg?v=2" alt="Loading" className="w-16 h-16 rounded-2xl shadow-xl relative z-10 animate-pulse" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-400">Loading Projects</span>
                    </div>
                ) : projects.length === 0 ? (
                    <div className="bg-white rounded-[3rem] border border-dashed border-neutral-200 p-24 text-center shadow-sm">
                        <div className="w-20 h-20 bg-neutral-50 rounded-[28px] flex items-center justify-center mx-auto mb-8 shadow-inner border border-neutral-100">
                            <Folder className="w-10 h-10 text-neutral-200" />
                        </div>
                        <h3 className="text-xl font-bold text-neutral-900 mb-2">No projects yet</h3>
                        <p className="text-sm text-neutral-400 mb-10 max-w-sm mx-auto font-medium leading-relaxed">
                            Organize your sessions by project. Each project can have its own materials and goals.
                        </p>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="inline-flex items-center gap-3 px-10 py-4 bg-neutral-900 text-white rounded-2xl text-[10px] font-black hover:bg-neutral-800 hover:shadow-2xl hover:scale-[1.02] transition-all uppercase tracking-[0.2em]"
                        >
                            START FIRST PROJECT
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 flex items-center gap-2">
                                <Folder className="w-3.5 h-3.5 text-neutral-900" />
                                {projects.length} {projects.length === 1 ? 'Project' : 'Projects'}
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {projects.map(project => (
                                <Link
                                    href={`/projects/${project.projectId}`}
                                    key={project.projectId}
                                    className="group bg-white rounded-[2rem] border border-neutral-200/60 p-8 shadow-sm hover:shadow-xl hover:border-neutral-900/20 hover:-translate-y-1 transition-all duration-500"
                                >
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="w-14 h-14 bg-neutral-50 rounded-xl flex items-center justify-center text-neutral-400 group-hover:bg-neutral-900 group-hover:text-white transition-all duration-500 group-hover:rotate-6 group-hover:scale-110">
                                            <Folder className="w-7 h-7" />
                                        </div>
                                        {project.latestScore && (
                                            <div className="text-right">
                                                <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Latest</p>
                                                <p className={`text-2xl font-black leading-tight ${project.latestScore >= 80 ? 'text-google-green' : project.latestScore >= 60 ? 'text-google-blue' : 'text-google-red'}`}>
                                                    {project.latestScore}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    <h3 className="text-xl font-black text-neutral-900 mb-2 truncate tracking-tight group-hover:text-neutral-800 transition-colors">
                                        {project.title}
                                    </h3>
                                    <p className="text-sm text-neutral-500 line-clamp-2 mb-8 min-h-[40px] font-medium leading-relaxed">
                                        {project.description || 'No description provided.'}
                                    </p>

                                    <div className="flex items-center justify-between pt-5 border-t border-neutral-100">
                                        <div className="flex gap-5">
                                            <div className="flex items-center gap-1.5 text-neutral-400">
                                                <Video className="w-3.5 h-3.5" />
                                                <span className="text-[10px] font-black">{project.sessionCount}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-neutral-400">
                                                <BarChart2 className="w-3.5 h-3.5" />
                                                <span className="text-[10px] font-black">{project.bestScore || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-8">
                            <h2 className="text-2xl font-black text-neutral-900 mb-2">New Project</h2>
                            <p className="text-sm text-neutral-500 mb-8">Set a focus for your upcoming pitch or presentation.</p>

                            <form onSubmit={handleCreateProject} className="space-y-6">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-neutral-400 mb-2 tracking-widest">Title</label>
                                    <input
                                        autoFocus
                                        value={newProjectTitle}
                                        onChange={e => setNewProjectTitle(e.target.value)}
                                        placeholder="e.g. Q4 Investor Deck"
                                        className="w-full bg-neutral-50 border-2 border-neutral-100 rounded-xl px-4 py-3 text-sm focus:border-google-blue focus:bg-white outline-none transition-all placeholder:text-neutral-300"
                                        required
                                    />
                                </div>
                                <div className="relative">
                                    <label className="block text-[10px] font-black uppercase text-neutral-400 mb-2 tracking-widest">Description</label>
                                    <textarea
                                        value={newProjectDesc}
                                        onChange={e => setNewProjectDesc(e.target.value)}
                                        placeholder="Optional description"
                                        className="w-full bg-neutral-50 border-2 border-neutral-100 rounded-xl px-4 py-3 text-sm focus:border-google-blue focus:bg-white outline-none transition-all placeholder:text-neutral-300 min-h-[120px] resize-none"
                                    />
                                </div>

                                <div className="flex items-center justify-between">
                                    <button
                                        type="button"
                                        onClick={() => setIsCreateModalOpen(false)}
                                        className="text-[10px] font-black uppercase tracking-widest text-neutral-400 hover:text-neutral-900 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isCreating}
                                        className="flex items-center gap-2 px-6 py-3 bg-neutral-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-neutral-800 transition-colors disabled:opacity-60"
                                    >
                                        {isCreating ? 'Creating...' : 'Create Project'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
