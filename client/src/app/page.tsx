'use client';

import Link from 'next/link';
import { ArrowRight, Video, History, Activity } from 'lucide-react';
import { useEffect, useState } from 'react';

interface RecentSession {
    sessionId: string;
    startedAt: number;
    finalReport?: { overallScore: number };
}

export default function DashboardPage() {
    const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);

    useEffect(() => {
        fetch('http://localhost:8080/sessions')
            .then(r => r.json())
            .then(data => setRecentSessions(data.slice(0, 3)))
            .catch(console.error);
    }, []);

    return (
        <div className="min-h-screen font-sans p-8 max-w-6xl mx-auto">
            <header className="flex items-center justify-between mb-10 pb-6 border-b border-neutral-200">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 leading-tight">Dashboard</h1>
                    <p className="text-sm text-neutral-500 mt-1">Welcome back. Ready to perfect your pitch?</p>
                </div>
                <Link
                    href="/practice"
                    className="flex items-center gap-2 px-6 py-3 rounded-md text-sm font-bold bg-google-blue text-white shadow-sm hover:bg-primary-hover transition-colors"
                >
                    <Video className="w-4 h-4" />
                    New Practice
                </Link>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div className="bg-white p-6 rounded-lg border border-neutral-200 shadow-sm flex flex-col items-start gap-4 hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 bg-google-blue/10 rounded-md flex items-center justify-center text-google-blue">
                        <Video className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-bold text-neutral-900">Practice Space</h3>
                        <p className="text-xs text-neutral-500 mt-1 leading-relaxed">Start a new live session with Aura multi-agent feedback and tracking.</p>
                    </div>
                    <Link href="/practice" className="mt-auto pt-4 text-google-blue text-xs font-bold hover:underline flex items-center gap-1">
                        ENTER PRACTICE <ArrowRight className="w-3 h-3" />
                    </Link>
                </div>

                <div className="bg-white p-6 rounded-lg border border-neutral-200 shadow-sm flex flex-col items-start gap-4 hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 bg-google-green/10 rounded-md flex items-center justify-center text-google-green">
                        <History className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-bold text-neutral-900">Session History</h3>
                        <p className="text-xs text-neutral-500 mt-1 leading-relaxed">Review your past presentations, playback recordings and track progress.</p>
                    </div>
                    <Link href="/history" className="mt-auto pt-4 text-google-green text-xs font-bold hover:underline flex items-center gap-1">
                        VIEW HISTORY <ArrowRight className="w-3 h-3" />
                    </Link>
                </div>

                <div className="bg-white p-6 rounded-lg border border-neutral-200 shadow-sm flex flex-col items-start gap-4 hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 bg-google-purple/10 rounded-md flex items-center justify-center text-google-purple">
                        <Activity className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-bold text-neutral-900">TED Benchmarks</h3>
                        <p className="text-xs text-neutral-500 mt-1 leading-relaxed">Calibrate the neural tracker against world-class speakers for empirical scoring.</p>
                    </div>
                    <Link href="/profiler" className="mt-auto pt-4 text-google-purple text-xs font-bold hover:underline flex items-center gap-1">
                        OPEN PROFILER <ArrowRight className="w-3 h-3" />
                    </Link>
                </div>
            </div>

            <section>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-neutral-900">Recent Sessions</h2>
                    <Link href="/history" className="text-sm text-google-blue font-medium hover:underline">View All Files</Link>
                </div>

                {recentSessions.length === 0 ? (
                    <div className="bg-white border border-neutral-200 rounded-lg p-10 text-center text-neutral-500 text-sm">
                        No recent sessions. Click &quot;New Practice&quot; to start.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {recentSessions.map(session => (
                            <Link href={`/history`} key={session.sessionId} className="block bg-white p-5 rounded-lg border border-neutral-200 shadow-sm hover:border-google-blue transition-colors group">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-bold text-neutral-900">ID: {session.sessionId ? session.sessionId.split('-')[0] : 'UNKNOWN'}</h3>
                                        <p className="text-[10px] text-neutral-400 mt-1 uppercase tracking-widest">{new Date(session.startedAt).toLocaleString()}</p>
                                    </div>
                                    <div className="text-right bg-neutral-50 px-3 py-2 rounded border border-neutral-200 group-hover:bg-google-blue/5 transition-colors">
                                        <p className="text-[8px] uppercase font-bold text-neutral-400">Score</p>
                                        <p className={`text-lg font-black ${session.finalReport?.overallScore && session.finalReport.overallScore >= 70 ? 'text-google-green' : 'text-google-blue'}`}>
                                            {session.finalReport?.overallScore || 'N/A'}
                                        </p>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
