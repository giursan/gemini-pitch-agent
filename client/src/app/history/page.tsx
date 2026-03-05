'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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

function scoreColor(score: number) {
    if (score >= 70) return 'text-emerald-400';
    if (score >= 40) return 'text-amber-400';
    return 'text-red-400';
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
            <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100 font-[family-name:var(--font-geist-sans)]">
            <div className="max-w-4xl mx-auto px-6 py-10">
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-2xl font-bold text-white">Session History</h1>
                    <Link
                        href="/"
                        className="px-5 py-2 rounded-full text-sm font-semibold bg-white text-black hover:bg-neutral-200 transition-colors"
                    >
                        New Session
                    </Link>
                </div>

                {sessions.length === 0 ? (
                    <div className="text-center text-white/30 py-20">
                        <p className="text-lg mb-2">No sessions yet</p>
                        <p className="text-sm">Start a practice session to see your history here.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sessions.map((s) => (
                            <button
                                key={s.sessionId}
                                onClick={() => viewReport(s.sessionId)}
                                className="w-full bg-neutral-900 border border-white/5 rounded-xl p-5 flex items-center gap-4 hover:bg-neutral-800 transition-colors text-left"
                            >
                                <div className={`text-3xl font-bold font-mono w-16 text-center ${scoreColor(s.overallScore)}`}>
                                    {s.overallScore}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-white/80">
                                        {new Date(s.startedAt).toLocaleDateString('en-US', {
                                            weekday: 'short',
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </div>
                                    <div className="text-xs text-white/30 mt-1 flex gap-3">
                                        <span>{formatDuration(s.durationMs)}</span>
                                        <span className={s.feedbackMode === 'shark' ? 'text-red-400' : 'text-blue-400'}>
                                            {s.feedbackMode === 'shark' ? '🦈 Shark' : '👁️ Silent'}
                                        </span>
                                    </div>
                                </div>
                                <span className="text-white/20 text-sm">→</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Inline Report Viewer */}
                {selectedReport && (
                    <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto">
                        <div className="max-w-4xl mx-auto px-6 py-10">
                            <button
                                onClick={() => setSelectedReport(null)}
                                className="mb-6 px-4 py-2 rounded-full text-sm font-medium bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
                            >
                                ← Back to History
                            </button>
                            {/* Reuse report structure */}
                            <div className="bg-neutral-950 rounded-2xl p-6 border border-white/10">
                                <h2 className="text-xl font-bold mb-4">Session Report</h2>
                                {selectedReport.report && (
                                    <div>
                                        <div className={`text-5xl font-bold font-mono text-center py-6 ${scoreColor(selectedReport.report.overallScore || 0)}`}>
                                            {selectedReport.report.overallScore || 0}/100
                                        </div>
                                        {selectedReport.report.coachNote && (
                                            <p className="text-white/50 text-sm text-center mt-2 mb-6">{selectedReport.report.coachNote}</p>
                                        )}
                                        <div className="grid grid-cols-2 gap-3">
                                            {Object.entries(selectedReport.report.categories || {}).map(([key, cat]: [string, any]) => (
                                                <div key={key} className="bg-neutral-900 rounded-lg p-4">
                                                    <div className="flex justify-between text-sm mb-1">
                                                        <span className="text-white/50 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                                                        <span className={`font-mono font-bold ${scoreColor(cat.score || 0)}`}>{cat.score}</span>
                                                    </div>
                                                    <p className="text-xs text-white/30">{cat.summary}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
