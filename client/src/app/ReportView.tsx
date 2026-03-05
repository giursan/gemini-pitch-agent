'use client';

interface ReportViewProps {
    report: Record<string, any>;
    sessionId: string;
    onNewSession: () => void;
}

const CATEGORY_ICONS: Record<string, string> = {
    eyeContact: '👁️',
    posture: '🧍',
    gestures: '🤚',
    speech: '🎙️',
    content: '📝',
};

const CATEGORY_LABELS: Record<string, string> = {
    eyeContact: 'Eye Contact',
    posture: 'Posture & Body',
    gestures: 'Gestures',
    speech: 'Speech & Pacing',
    content: 'Content Quality',
};

function scoreColor(score: number) {
    if (score >= 70) return 'text-emerald-400';
    if (score >= 40) return 'text-amber-400';
    return 'text-red-400';
}

function scoreBg(score: number) {
    if (score >= 70) return 'bg-emerald-500/20 border-emerald-500/30';
    if (score >= 40) return 'bg-amber-500/20 border-amber-500/30';
    return 'bg-red-500/20 border-red-500/30';
}

export default function ReportView({ report, sessionId, onNewSession }: ReportViewProps) {
    const categories = report.categories || {};
    const keyMoments = report.keyMoments || [];
    const strengths = report.topStrengths || [];
    const improvements = report.topImprovements || [];

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100 font-[family-name:var(--font-geist-sans)]">
            <div className="max-w-4xl mx-auto px-6 py-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Session Report</h1>
                        <p className="text-sm text-white/40 font-mono mt-1">{report.duration || '--'}</p>
                    </div>
                    <button
                        onClick={onNewSession}
                        className="px-5 py-2 rounded-full text-sm font-semibold bg-white text-black hover:bg-neutral-200 transition-colors"
                    >
                        New Session
                    </button>
                </div>

                {/* Overall Score */}
                <div className={`${scoreBg(report.overallScore || 0)} border rounded-2xl p-8 text-center mb-8`}>
                    <div className={`text-6xl font-bold font-mono ${scoreColor(report.overallScore || 0)}`}>
                        {report.overallScore || 0}
                    </div>
                    <div className="text-white/50 text-sm mt-2 uppercase tracking-widest">Overall Score</div>
                </div>

                {/* Category Breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                    {Object.entries(categories).map(([key, cat]: [string, any]) => (
                        <div key={key} className="bg-neutral-900 border border-white/5 rounded-xl p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-lg">{CATEGORY_ICONS[key] || '📊'}</span>
                                <span className="text-sm font-semibold text-white/70">{CATEGORY_LABELS[key] || key}</span>
                                <span className={`ml-auto font-mono font-bold ${scoreColor(cat.score || 0)}`}>
                                    {cat.score || 0}
                                </span>
                            </div>
                            <p className="text-xs text-white/40 leading-relaxed mb-3">{cat.summary}</p>
                            {cat.tips?.length > 0 && (
                                <ul className="space-y-1">
                                    {cat.tips.map((tip: string, i: number) => (
                                        <li key={i} className="text-xs text-white/30 flex gap-2">
                                            <span className="text-white/20">→</span>
                                            {tip}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </div>

                {/* Strengths & Improvements */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-emerald-400 mb-3 uppercase tracking-widest">Strengths</h3>
                        <ul className="space-y-2">
                            {strengths.map((s: string, i: number) => (
                                <li key={i} className="text-sm text-white/60 flex gap-2">
                                    <span className="text-emerald-400">✓</span>
                                    {s}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-amber-400 mb-3 uppercase tracking-widest">To Improve</h3>
                        <ul className="space-y-2">
                            {improvements.map((s: string, i: number) => (
                                <li key={i} className="text-sm text-white/60 flex gap-2">
                                    <span className="text-amber-400">→</span>
                                    {s}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Key Moments */}
                {keyMoments.length > 0 && (
                    <div className="bg-neutral-900 border border-white/5 rounded-xl p-5 mb-8">
                        <h3 className="text-sm font-semibold text-white/50 mb-4 uppercase tracking-widest">Key Moments</h3>
                        <div className="space-y-3">
                            {keyMoments.map((m: any, i: number) => (
                                <div key={i} className="flex items-start gap-3 text-sm">
                                    <span className="font-mono text-white/30 w-12 shrink-0">{m.timeOffset}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full border ${m.type === 'positive' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                                            m.type === 'alert' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                                                'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                        }`}>
                                        {m.type}
                                    </span>
                                    <span className="text-white/50">{m.description}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Coach Note */}
                {report.coachNote && (
                    <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-6">
                        <h3 className="text-sm font-semibold text-purple-300 mb-2 uppercase tracking-widest">Coach's Note</h3>
                        <p className="text-white/60 text-sm leading-relaxed">{report.coachNote}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
