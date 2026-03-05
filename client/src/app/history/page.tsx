'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Inbox, Clock, Zap, EyeOff, ArrowRight, X, Lightbulb, ChevronLeft } from 'lucide-react';
import ReportView from '../ReportView';

interface SessionEntry {
    sessionId: string;
    startedAt: number;
    endedAt: number | null;
    durationMs: number;
    feedbackMode: string;
    overallScore: number;
}

function formatDuration(ms: number): string {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return mins > 0 ? `${mins}m ${remainSecs}s` : `${remainSecs}s`;
}

export default function HistoryPage() {
    const [sessions, setSessions] = useState<SessionEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState<Record<string, any> | null>(null);

    useEffect(() => {
        fetch('http://localhost:8080/sessions')
            .then(res => res.json())
            .then(data => {
                setSessions(data || []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const viewReport = async (sessionId: string) => {
        const res = await fetch(`http://localhost:8080/sessions/${sessionId}`);
        const data = await res.json();
        setSelectedReport(data);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-google-blue/10 border-t-google-blue rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-neutral-50 flex flex-col font-sans selection:bg-google-blue/10">
            {/* Local Header */}
            <header className="px-8 py-5 flex items-center justify-between bg-white border-b border-neutral-200">
                <h1 className="text-xl font-bold text-neutral-900 leading-none">
                    Session History
                </h1>
                <Link
                    href="/"
                    className="google-button px-6 py-2.5 rounded-lg text-xs font-bold bg-google-blue text-white shadow-sm hover:bg-primary-hover transition-all active:scale-[0.98]"
                >
                    NEW PRACTICE
                </Link>
            </header>

            <main className="max-w-4xl mx-auto px-8 py-12">
                {sessions.length === 0 ? (
                    <div className="text-center py-32 bg-white rounded-lg border border-neutral-200 shadow-sm flex flex-col items-center gap-4">
                        <div className="w-20 h-20 rounded-full bg-neutral-50 flex items-center justify-center border border-neutral-100"><Inbox className="w-10 h-10 text-neutral-400" /></div>
                        <div className="space-y-1">
                            <p className="text-xl font-bold text-neutral-900">No practice sessions yet</p>
                            <p className="text-sm text-neutral-400 font-medium">Your journey to a perfect pitch starts with your first practice.</p>
                        </div>
                        <Link href="/practice" className="mt-4 text-google-blue font-bold text-sm hover:underline flex items-center gap-1">Start Practicing Now <ArrowRight className="w-4 h-4" /></Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-4 mb-2">
                            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{sessions.length} RECORDED SESSIONS</span>
                        </div>
                        {sessions.map((s) => (
                            <button
                                key={s.sessionId}
                                onClick={() => viewReport(s.sessionId)}
                                className="w-full bg-white border border-neutral-200 rounded-lg p-6 flex items-center gap-6 group hover:shadow-md hover:border-google-blue/40 hover:-translate-y-0.5 transition-all duration-300 text-left"
                            >
                                <div className={`w-16 h-16 rounded-lg flex flex-col items-center justify-center border font-sans shadow-sm transition-colors ${s.overallScore >= 70 ? 'bg-google-green/5 border-neutral-200 text-google-green' :
                                    s.overallScore >= 40 ? 'bg-google-blue/5 border-neutral-200 text-google-blue' :
                                        'bg-google-red/5 border-neutral-200 text-google-red'
                                    }`}>
                                    <span className="text-2xl font-bold leading-none">{s.overallScore}</span>
                                    <span className="text-[9px] font-extrabold uppercase tracking-tighter mt-0.5 opacity-60">SCORE</span>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-neutral-800 tracking-tight group-hover:text-google-blue transition-colors">
                                        {new Date(s.startedAt).toLocaleDateString('en-US', {
                                            weekday: 'short',
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </div>
                                    <div className="text-[11px] font-bold text-neutral-400 mt-1.5 flex items-center gap-3">
                                        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-neutral-100 rounded-full text-neutral-500">
                                            <Clock className="w-3.5 h-3.5" /> {formatDuration(s.durationMs)}
                                        </span>
                                        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${s.feedbackMode === 'shark'
                                            ? 'bg-google-red/10 text-google-red'
                                            : 'bg-google-blue/10 text-google-blue'
                                            }`}>
                                            {s.feedbackMode === 'shark' ? <><Zap className="w-3.5 h-3.5" /> SHARK MODE</> : <><EyeOff className="w-3.5 h-3.5" /> SILENT COACH</>}
                                        </span>
                                    </div>
                                </div>
                                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-neutral-50 group-hover:bg-google-blue group-hover:text-white transition-all text-neutral-300 border border-neutral-200 group-hover:border-google-blue">
                                    <ArrowRight className="w-5 h-5" />
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {/* Inline Report Overlay */}
                {selectedReport && (
                    <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-md z-50 overflow-y-auto animate-in fade-in duration-300">
                        <div className="max-w-5xl mx-auto px-8 py-10">
                            <div className="flex justify-between items-center mb-6">
                                <button
                                    onClick={() => setSelectedReport(null)}
                                    className="google-button flex items-center gap-2 px-6 py-3 rounded-lg text-xs font-bold bg-white text-neutral-700 shadow-sm hover:shadow-md border border-neutral-200 active:scale-95 transition-all"
                                >
                                    <ChevronLeft className="w-4 h-4" /> BACK TO LIST
                                </button>
                                <button
                                    onClick={() => setSelectedReport(null)}
                                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Visual wrapper for report matching ReportView style */}
                            <div className="bg-white rounded-lg overflow-hidden google-shadow min-h-[80vh] animate-in zoom-in-95 duration-500 border border-white/20">
                                {selectedReport.report && (
                                    <div className="p-0">
                                        {/* Simplified Report View for the Modal */}
                                        <div className="bg-google-blue/5 p-12 border-b border-border/40">
                                            <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                                                <div className="flex flex-col items-center md:items-start text-center md:text-left">
                                                    <h2 className="text-4xl font-black text-neutral-900 tracking-tight mb-2">Detailed Analysis</h2>
                                                    <p className="text-neutral-500 font-bold uppercase tracking-widest text-xs">Generated for session {selectedReport.sessionId.slice(0, 8)}</p>
                                                </div>
                                                <div className="relative w-32 h-32 flex items-center justify-center bg-white rounded-lg google-shadow">
                                                    <div className="flex flex-col items-center">
                                                        <span className={`text-4xl font-black ${selectedReport.report.overallScore >= 70 ? 'text-google-green' :
                                                            selectedReport.report.overallScore >= 40 ? 'text-google-blue' :
                                                                'text-google-red'
                                                            }`}>{selectedReport.report.overallScore}</span>
                                                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-1">Total PR</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-12 space-y-10">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {Object.entries(selectedReport.report.categories || {}).map(([key, cat]: [string, any]) => (
                                                    <div key={key} className="p-6 rounded-lg bg-neutral-50 border border-border/40 group hover:border-google-blue/30 transition-colors">
                                                        <div className="flex justify-between items-center mb-3">
                                                            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">{key.replace(/([A-Z])/g, ' $1')}</h4>
                                                            <span className={`font-mono font-bold text-lg ${cat.score >= 70 ? 'text-google-green' : 'text-google-blue'}`}>{cat.score}</span>
                                                        </div>
                                                        <p className="text-sm font-medium text-neutral-600 leading-relaxed mb-4">{cat.summary}</p>
                                                        {cat.tips && cat.tips.length > 0 && (
                                                            <div className="flex items-start gap-2">
                                                                <Lightbulb className="w-3.5 h-3.5 text-google-blue shrink-0 mt-0.5" />
                                                                <p className="text-[11px] font-bold text-google-blue leading-snug">{cat.tips[0]}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            {selectedReport.report.coachNote && (
                                                <div className="p-8 rounded-lg bg-neutral-900 text-white relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 p-8 opacity-10 text-8xl font-black group-hover:scale-110 transition-transform tracking-tighter">&quot;</div>
                                                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-white/40 mb-3">Coach's Meta Note</h4>
                                                    <p className="text-lg font-medium tracking-tight text-white/90 leading-relaxed italic z-10 relative">
                                                        &quot;{selectedReport.report.coachNote}&quot;
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
