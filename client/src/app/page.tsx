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
    const [greeting, setGreeting] = useState('Welcome back');

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Good morning!');
        else if (hour < 18) setGreeting('Good afternoon!');
        else setGreeting('Good evening!');


        fetch('http://localhost:8080/projects')
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setRecentProjects(data.slice(0, 3));
                } else {
                    console.error('Projects data is not an array:', data);
                    setRecentProjects([]);
                }
            })
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, []);

    return (
        <div className="font-sans p-8 max-w-6xl mx-auto">
            <header className="flex items-center justify-between mb-12 pb-8 border-b border-neutral-200/60 animate-fade-in-up">
                <div>
                    <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">{greeting}</h1>
                    <p className="text-sm text-neutral-500 mt-1.5 font-medium">Ready to perfect your pitch today?</p>
                </div>
                <div className="flex gap-4">
                    <Link
                        href="/projects"
                        className="flex items-center gap-2 px-7 py-3.5 rounded-full text-[10px] font-bold bg-white border border-neutral-200 text-neutral-600 shadow-sm hover:bg-neutral-50 hover:shadow-md transition-all uppercase tracking-[0.15em]"
                    >
                        <Folder className="w-4 h-4" />
                        View Projects
                    </Link>
                    <Link
                        href="/practice"
                        className="flex items-center gap-2 px-7 py-3.5 rounded-full text-[10px] font-bold bg-google-blue text-white shadow-xl shadow-google-blue/25 hover:scale-[1.03] hover:shadow-google-blue/35 transition-all uppercase tracking-[0.15em] relative overflow-hidden group"
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            <span className="dot-pulse mr-1" />
                            Quick Session
                        </span>
                        <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                    </Link>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
                <div className="glass-card p-8 rounded-[2rem] flex flex-col items-start gap-5 hover:-translate-y-2 transition-all duration-500 blue-glow-hover group animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                    <div className="w-16 h-16 bg-google-blue/10 rounded-2xl flex items-center justify-center text-google-blue group-hover:bg-google-blue group-hover:text-white transition-all duration-500 group-hover:rotate-6 group-hover:scale-110">
                        <Folder className="w-8 h-8" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-neutral-900 tracking-tight">Project Management</h3>
                        <p className="text-xs text-neutral-500 mt-3 leading-relaxed font-medium">Organize sessions, upload slide decks, and track long-term improvement over time.</p>
                    </div>
                    <Link href="/projects" className="mt-auto pt-8 text-google-blue text-[10px] font-bold uppercase tracking-[0.2em] hover:underline flex items-center gap-2 transition-all group-hover:translate-x-1.5">
                        SEE ALL PROJECTS <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>

                <div className="glass-card p-8 rounded-[2rem] flex flex-col items-start gap-5 hover:-translate-y-2 transition-all duration-500 green-glow-hover group animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                    <div className="w-16 h-16 bg-google-green/10 rounded-2xl flex items-center justify-center text-google-green group-hover:bg-google-green group-hover:text-white transition-all duration-500 group-hover:-rotate-6 group-hover:scale-110">
                        <Video className="w-8 h-8" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-neutral-900 tracking-tight">Practice Arena</h3>
                        <p className="text-xs text-neutral-500 mt-3 leading-relaxed font-medium">Start an analyzed session with real-time body language and content tracking.</p>
                    </div>
                    <Link href="/practice" className="mt-auto pt-8 text-google-green text-[10px] font-bold uppercase tracking-[0.2em] hover:underline flex items-center gap-2 transition-all group-hover:translate-x-1.5">
                        OPEN ARENA <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>

                <div className="glass-card p-8 rounded-[2rem] flex flex-col items-start gap-5 hover:-translate-y-2 transition-all duration-500 purple-glow-hover group animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                    <div className="w-16 h-16 bg-google-purple/10 rounded-2xl flex items-center justify-center text-google-purple group-hover:bg-google-purple group-hover:text-white transition-all duration-500 group-hover:rotate-12 group-hover:scale-110">
                        <Activity className="w-8 h-8" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-neutral-900 tracking-tight">Skill Profiler</h3>
                        <p className="text-xs text-neutral-500 mt-3 leading-relaxed font-medium">Benchmark your delivery against curated TED talk empirical data benchmarks.</p>
                    </div>
                    <Link href="/profiler" className="mt-auto pt-8 text-google-purple text-[10px] font-bold uppercase tracking-[0.2em] hover:underline flex items-center gap-2 transition-all group-hover:translate-x-1.5">
                        VIEW PROFILER <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            <section className="animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                <div className="flex items-end justify-between mb-10">
                    <div>
                        <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">Recent Projects</h2>
                        <div className="flex items-center gap-3 mt-2">
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-google-blue/10 text-google-blue text-[9px] font-black uppercase tracking-widest rounded-full border border-google-blue/10">
                                <Folder className="w-3 h-3" /> Continuity Tracker
                            </div>
                        </div>
                    </div>
                    <Link href="/projects" className="text-[10px] font-bold uppercase tracking-widest text-google-blue hover:underline mb-1">View All Projects</Link>
                </div>

                {isLoading ? (
                    <div className="flex justify-center p-20">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-google-blue"></div>
                    </div>
                ) : recentProjects.length === 0 ? (
                    <div className="glass-card rounded-[2.5rem] p-20 text-center border-dashed border-2 border-neutral-200/50">
                        <div className="w-20 h-20 bg-neutral-50 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner">
                            <Folder className="w-10 h-10 text-neutral-300" />
                        </div>
                        <h3 className="text-xl font-bold text-neutral-900 mb-2">Ready to start?</h3>
                        <p className="text-sm text-neutral-400 mb-10 max-w-sm mx-auto">Create your first project to begin tracking your growth and mastering the art of the pitch.</p>
                        <Link href="/projects" className="inline-flex items-center gap-3 px-10 py-4 bg-neutral-900 text-white rounded-2xl text-[10px] font-bold hover:bg-neutral-800 hover:shadow-2xl hover:scale-105 transition-all uppercase tracking-[0.2em]">
                            CREATE YOUR FIRST PROJECT
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {recentProjects.map((project, idx) => (
                            <Link
                                href={`/projects/${project.projectId}`}
                                key={project.projectId}
                                className="group glass-card p-8 rounded-[2rem] hover:border-google-blue/50 hover:shadow-2xl transition-all duration-500 flex flex-col group animate-fade-in-up"
                                style={{ animationDelay: `${0.5 + idx * 0.1}s` }}
                            >
                                <div className="flex justify-between items-start mb-8">
                                    <div className="w-12 h-12 bg-neutral-50 rounded-2xl flex items-center justify-center text-neutral-400 group-hover:bg-google-blue group-hover:text-white transition-all duration-500 group-hover:scale-110">
                                        <Folder className="w-6 h-6" />
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[9px] uppercase font-black text-neutral-400 tracking-wider mb-0.5">LATEST SCORE</p>
                                        <p className={`text-2xl font-black ${project.latestScore && project.latestScore >= 70 ? 'text-google-green' : 'text-google-blue'}`}>
                                            {project.latestScore || '--'}
                                        </p>
                                    </div>
                                </div>
                                <h3 className="font-bold text-neutral-900 text-xl mb-2 truncate">{project.title}</h3>
                                <div className="border-t border-neutral-100/50 mt-auto pt-6 flex items-center justify-between">
                                    <p className="text-[9px] text-neutral-400 uppercase font-bold tracking-widest">
                                        {project.sessionCount} Sessions
                                    </p>
                                    <p className="text-[9px] text-neutral-300 uppercase font-medium tracking-tight">
                                        {new Date(project.updatedAt).toLocaleDateString()}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
