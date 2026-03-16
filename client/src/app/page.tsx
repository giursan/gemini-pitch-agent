'use client';

import Link from 'next/link';
import { ArrowRight, Video, History, Activity, Folder, Loader2, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Project {
    projectId: string;
    title: string;
    sessionCount: number;
    latestScore: number | null;
    updatedAt: number;
}

const GrowthChart = ({ data }: { data: Project[] }) => {
    const maxScore = 100;

    return (
        <div className="flex items-end justify-between gap-3 h-48 w-full px-2 pt-8">
            {data.map((p, i) => {
                const score = p.latestScore || 0;
                const height = Math.max(score > 0 ? 8 : 2, (score / maxScore) * 100);
                return (
                    <div key={p.projectId} className="flex-1 flex flex-col items-center group cursor-default">
                        <div className="w-full relative flex flex-col items-center justify-end h-full">
                            {/* Score Tooltip */}
                            <div className="absolute -top-10 px-2.5 py-1.5 bg-neutral-900 text-white text-[10px] font-black rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 shadow-xl whitespace-nowrap z-20 border border-neutral-700">
                                {score}% Score
                            </div>

                            {/* Bar Container */}
                            <div className="w-full bg-neutral-100/50 rounded-xl overflow-hidden relative group-hover:bg-neutral-100 transition-colors duration-500 h-full flex items-end">
                                <div
                                    className={`w-full rounded-xl transition-all duration-1000 ease-out
                                        ${score >= 80 ? 'bg-google-green' : score >= 60 ? 'bg-google-blue' : score > 0 ? 'bg-google-red' : 'bg-neutral-200'}
                                    `}
                                    style={{
                                        height: `${height}%`,
                                        transitionDelay: `${i * 100}ms`,
                                    }}
                                />
                            </div>
                        </div>
                        <span className="text-[9px] font-black text-neutral-400 mt-4 uppercase tracking-widest truncate w-full text-center px-1">
                            {p.title.split(' ')[0]}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

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
        <div className="font-sans min-h-screen bg-[#F8F9FA] pb-20">
            {/* Platform Header Strip */}
            <header className="bg-white border-b border-neutral-200 pt-10 pb-12 shadow-sm mb-12">
                <div className="max-w-6xl mx-auto px-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-black text-neutral-900 tracking-tight leading-tight">{greeting}</h1>
                        <p className="text-sm text-neutral-500 mt-1 font-medium max-w-md">
                            Ready to perfect your pitch today?
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <Link
                            href="/practice"
                            className="flex items-center gap-3 px-8 py-4 rounded-full text-[10px] font-black bg-neutral-900 text-white shadow-xl shadow-neutral-900/20 hover:scale-[1.05] hover:bg-neutral-800 transition-all uppercase tracking-[0.2em] relative overflow-hidden"
                        >
                            <Video className="w-4 h-4 text-white" />
                            QUICK SESSION
                        </Link>
                    </div>
                </div>
            </header>

            <div className="max-w-6xl mx-auto px-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20 animate-fade-in-up">
                <div className="glass-card p-8 rounded-[2rem] flex flex-col items-start gap-5 hover:-translate-y-2 transition-all duration-500 blue-glow-hover group animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                    <div className="w-16 h-16 bg-google-blue/10 rounded-xl flex items-center justify-center text-google-blue group-hover:bg-google-blue group-hover:text-white transition-all duration-500 group-hover:rotate-6 group-hover:scale-110">
                        <Folder className="w-8 h-8" />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-neutral-900 tracking-tight">Project Management</h3>
                        <p className="text-sm text-neutral-600 mt-3 leading-relaxed font-medium">Organize sessions, upload slide decks, and track long-term improvement over time.</p>
                    </div>
                    <Link href="/projects" className="mt-auto pt-8 text-google-blue text-[10px] font-bold uppercase tracking-[0.2em] hover:underline flex items-center gap-2 transition-all group-hover:translate-x-1.5">
                        SEE ALL PROJECTS <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>

                <div className="glass-card p-8 rounded-[2rem] flex flex-col items-start gap-5 hover:-translate-y-2 transition-all duration-500 green-glow-hover group animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                    <div className="w-16 h-16 bg-google-green/10 rounded-xl flex items-center justify-center text-google-green group-hover:bg-google-green group-hover:text-white transition-all duration-500 group-hover:-rotate-6 group-hover:scale-110">
                        <Video className="w-8 h-8" />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-neutral-900 tracking-tight">Practice Arena</h3>
                        <p className="text-sm text-neutral-600 mt-3 leading-relaxed font-medium">Start an analyzed session with real-time body language and content tracking.</p>
                    </div>
                    <Link href="/practice" className="mt-auto pt-8 text-google-green text-[10px] font-bold uppercase tracking-[0.2em] hover:underline flex items-center gap-2 transition-all group-hover:translate-x-1.5">
                        OPEN ARENA <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>

                <div className="glass-card p-8 rounded-[2rem] flex flex-col items-start gap-5 hover:-translate-y-2 transition-all duration-500 purple-glow-hover group animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                    <div className="w-16 h-16 bg-google-purple/10 rounded-xl flex items-center justify-center text-google-purple group-hover:bg-google-purple group-hover:text-white transition-all duration-500 group-hover:rotate-12 group-hover:scale-110">
                        <Activity className="w-8 h-8" />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-neutral-900 tracking-tight">Skill Profiler</h3>
                        <p className="text-sm text-neutral-600 mt-3 leading-relaxed font-medium">Benchmark your delivery against curated TED talk empirical data benchmarks.</p>
                    </div>
                    <Link href="/profiler" className="mt-auto pt-8 text-google-purple text-[10px] font-bold uppercase tracking-[0.2em] hover:underline flex items-center gap-2 transition-all group-hover:translate-x-1.5">
                        VIEW PROFILER <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            <section className="animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                <div className="flex items-end justify-between mb-10">
                    <div>
                        <h2 className="text-2xl font-black text-neutral-900 tracking-tight leading-tight">Performance Insights</h2>
                        <p className="text-[13px] text-neutral-500 mt-2 font-medium">Aggregate performance tracking across projects</p>
                    </div>
                    <Link href="/projects" className="text-[10px] font-black uppercase tracking-widest text-neutral-400 hover:text-neutral-900 flex items-center gap-2 transition-all">
                        EXPLORE ALL PROJECTS <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </div>

                {isLoading ? (
                    <div className="flex justify-center p-20">
                        <Loader2 className="w-8 h-8 animate-spin text-neutral-300" />
                    </div>
                ) : recentProjects.length === 0 ? (
                    <div className="glass-card rounded-[3rem] p-24 text-center border-dashed border-2 border-neutral-200/50">
                        <div className="w-20 h-20 bg-neutral-50 rounded-[28px] flex items-center justify-center mx-auto mb-8 shadow-inner border border-neutral-100">
                            <Activity className="w-10 h-10 text-neutral-200" />
                        </div>
                        <h3 className="text-xl font-bold text-neutral-900 mb-2">Initialize your baseline</h3>
                        <p className="text-sm text-neutral-400 mb-10 max-w-sm mx-auto font-medium leading-relaxed">Your performance analytics will populate here once you've completed your first practice sessions.</p>
                        <Link href="/projects" className="inline-flex items-center gap-3 px-10 py-4 bg-neutral-900 text-white rounded-2xl text-[10px] font-black hover:bg-neutral-800 hover:shadow-2xl hover:scale-[1.02] transition-all uppercase tracking-[0.2em]">
                            LAUNCH YOUR FIRST PROJECT
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        {/* The Insights Section */}
                        <div className="lg:col-span-8 bg-white border border-neutral-200/60 rounded-[3rem] p-10 shadow-sm relative overflow-hidden group/chart">
                            <div className="absolute top-0 right-0 p-8 opacity-[0.03] scale-150 rotate-12 group-hover/chart:rotate-0 transition-transform duration-700">
                                <Activity className="w-32 h-32" />
                            </div>

                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-google-blue"></div>
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-900">Project Performance Index</h3>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-google-green"></div>
                                        <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-tighter">Peak</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-google-blue"></div>
                                        <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-tighter">Average</span>
                                    </div>
                                </div>
                            </div>

                            <GrowthChart data={recentProjects} />
                        </div>

                        {/* Quick Access Sidebar */}
                        <div className="lg:col-span-4 space-y-4">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-6 flex items-center gap-2">
                                <Folder className="w-3.5 h-3.5 text-neutral-900" /> Recent entries
                            </h3>
                            {recentProjects.map((project, idx) => (
                                <Link
                                    href={`/projects/${project.projectId}`}
                                    key={project.projectId}
                                    className="block group bg-white/60 backdrop-blur-md border border-neutral-200/60 p-5 rounded-[24px] hover:border-neutral-900/40 hover:bg-white transition-all duration-300"
                                >
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className="w-10 h-10 bg-neutral-50 rounded-xl flex items-center justify-center text-neutral-400 group-hover:bg-neutral-900 group-hover:text-white transition-all duration-300 shrink-0">
                                                <Folder className="w-5 h-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-sm font-bold text-neutral-800 truncate tracking-tight group-hover:text-neutral-900">{project.title}</h4>
                                                <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">{project.sessionCount} Sessions</p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className={`text-lg font-black ${project.latestScore && project.latestScore >= 70 ? 'text-google-green' : project.latestScore ? 'text-google-blue' : 'text-neutral-200'}`}>
                                                {project.latestScore || '--'}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </section>
            </div>
        </div>
    );
}
