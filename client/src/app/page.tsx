'use client';

import Link from 'next/link';
import { ArrowRight, Video, History, Activity, Folder } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Project {
    projectId: string;
    title: string;
    sessionCount: number;
    latestScore: number | null;
    updatedAt: number;
}

export default function DashboardPage() {
    const [recentProjects, setRecentProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:8080/projects')
            .then(r => r.json())
            .then(data => setRecentProjects(data.slice(0, 3)))
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, []);

    return (
        <div className="min-h-screen font-sans p-8 max-w-6xl mx-auto">
            <header className="flex items-center justify-between mb-10 pb-6 border-b border-neutral-200">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 leading-tight">Dashboard</h1>
                    <p className="text-sm text-neutral-500 mt-1">Welcome back. Ready to perfect your pitch?</p>
                </div>
                <div className="flex gap-3">
                    <Link
                        href="/projects"
                        className="flex items-center gap-2 px-6 py-3 rounded-full text-xs font-black bg-white border border-neutral-200 text-neutral-600 shadow-sm hover:bg-neutral-50 transition-all uppercase tracking-widest"
                    >
                        <Folder className="w-4 h-4" />
                        View Projects
                    </Link>
                    <Link
                        href="/practice"
                        className="flex items-center gap-2 px-6 py-3 rounded-full text-xs font-black bg-google-blue text-white shadow-lg shadow-google-blue/20 hover:scale-[1.02] transition-all uppercase tracking-widest"
                    >
                        <Video className="w-4 h-4" />
                        Quick Session
                    </Link>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
                <div className="bg-white p-7 rounded-2xl border border-neutral-200 shadow-sm flex flex-col items-start gap-4 hover:shadow-xl transition-all group">
                    <div className="w-14 h-14 bg-google-blue/5 rounded-2xl flex items-center justify-center text-google-blue group-hover:bg-google-blue group-hover:text-white transition-colors">
                        <Folder className="w-7 h-7" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-neutral-900 tracking-tight">Project Management</h3>
                        <p className="text-xs text-neutral-500 mt-2 leading-relaxed">Organize sessions, upload slide decks, and track long-term improvement.</p>
                    </div>
                    <Link href="/projects" className="mt-auto pt-6 text-google-blue text-[10px] font-black uppercase tracking-[0.15em] hover:underline flex items-center gap-1.5 transition-all group-hover:translate-x-1">
                        GOTO PROJECTS <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </div>

                <div className="bg-white p-7 rounded-2xl border border-neutral-200 shadow-sm flex flex-col items-start gap-4 hover:shadow-xl transition-all group">
                    <div className="w-14 h-14 bg-google-green/5 rounded-2xl flex items-center justify-center text-google-green group-hover:bg-google-green group-hover:text-white transition-colors">
                        <Video className="w-7 h-7" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-neutral-900 tracking-tight">Practice Arena</h3>
                        <p className="text-xs text-neutral-500 mt-2 leading-relaxed">Start an analyzed session with real-time body language and content tracking.</p>
                    </div>
                    <Link href="/practice" className="mt-auto pt-6 text-google-green text-[10px] font-black uppercase tracking-[0.15em] hover:underline flex items-center gap-1.5 transition-all group-hover:translate-x-1">
                        OPEN ARENA <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </div>

                <div className="bg-white p-7 rounded-2xl border border-neutral-200 shadow-sm flex flex-col items-start gap-4 hover:shadow-xl transition-all group">
                    <div className="w-14 h-14 bg-google-purple/5 rounded-2xl flex items-center justify-center text-google-purple group-hover:bg-google-purple group-hover:text-white transition-colors">
                        <Activity className="w-7 h-7" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-neutral-900 tracking-tight">Skill Profiler</h3>
                        <p className="text-xs text-neutral-500 mt-2 leading-relaxed">Benchmark your delivery against curated TED talk empirical data.</p>
                    </div>
                    <Link href="/profiler" className="mt-auto pt-6 text-google-purple text-[10px] font-black uppercase tracking-[0.15em] hover:underline flex items-center gap-1.5 transition-all group-hover:translate-x-1">
                        VIEW PROFILER <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </div>
            </div>

            <section>
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-xl font-black text-neutral-900 tracking-tight">Recent Projects</h2>
                        <p className="text-xs text-neutral-400 mt-1 uppercase tracking-widest font-bold">Continuity Tracker</p>
                    </div>
                    <Link href="/projects" className="text-xs font-black uppercase tracking-widest text-google-blue hover:underline">View All Projects</Link>
                </div>

                {isLoading ? (
                    <div className="flex justify-center p-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-google-blue"></div>
                    </div>
                ) : recentProjects.length === 0 ? (
                    <div className="bg-white border-2 border-dashed border-neutral-200 rounded-2xl p-16 text-center">
                        <Folder className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-neutral-900">No projects yet</h3>
                        <p className="text-sm text-neutral-400 mb-6">Create a project to start organizing your pitch practice.</p>
                        <Link href="/projects" className="inline-flex items-center gap-2 px-6 py-2.5 bg-neutral-900 text-white rounded-xl text-xs font-black hover:bg-neutral-800 transition-colors">
                            CREATE YOUR FIRST PROJECT
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {recentProjects.map(project => (
                            <Link
                                href={`/projects/${project.projectId}`}
                                key={project.projectId}
                                className="group bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm hover:border-google-blue hover:shadow-xl transition-all flex flex-col"
                            >
                                <div className="flex justify-between items-start mb-6">
                                    <div className="w-10 h-10 bg-neutral-50 rounded-xl flex items-center justify-center text-neutral-400 group-hover:bg-google-blue group-hover:text-white transition-colors">
                                        <Folder className="w-5 h-5" />
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[8px] uppercase font-black text-neutral-400 tracking-tighter">Latest Score</p>
                                        <p className={`text-xl font-black ${project.latestScore && project.latestScore >= 70 ? 'text-google-green' : 'text-google-blue'}`}>
                                            {project.latestScore || 'N/A'}
                                        </p>
                                    </div>
                                </div>
                                <h3 className="font-black text-neutral-900 text-lg mb-1 truncate">{project.title}</h3>
                                <p className="text-[10px] text-neutral-400 uppercase font-bold tracking-widest border-t border-neutral-100 pt-4 mt-auto">
                                    {project.sessionCount} Sessions • Updated {new Date(project.updatedAt).toLocaleDateString()}
                                </p>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
