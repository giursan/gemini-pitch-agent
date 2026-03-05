'use client';

import { Eye, User, Hand, Mic, FileText, BarChart2, Check, ArrowUp, Lightbulb } from 'lucide-react';

interface ReportViewProps {
    report: Record<string, any>;
    sessionId: string;
    onNewSession: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
    eyeContact: 'text-google-blue bg-google-blue/5 border-neutral-200',
    posture: 'text-google-green bg-google-green/5 border-neutral-200',
    gestures: 'text-google-purple bg-google-purple/5 border-neutral-200',
    speech: 'text-google-yellow bg-google-yellow/5 border-neutral-200',
    content: 'text-google-red bg-google-red/5 border-neutral-200',
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    eyeContact: <Eye className="w-5 h-5 text-google-blue" />,
    posture: <User className="w-5 h-5 text-google-green" />,
    gestures: <Hand className="w-5 h-5 text-google-purple" />,
    speech: <Mic className="w-5 h-5 text-google-yellow" />,
    content: <FileText className="w-5 h-5 text-google-red" />,
};

const CATEGORY_LABELS: Record<string, string> = {
    eyeContact: 'Eye Contact',
    posture: 'Body Language',
    gestures: 'Gestures',
    speech: 'Vocal Delivery',
    content: 'Content Quality',
};

export default function ReportView({ report, sessionId, onNewSession }: ReportViewProps) {
    const categories = report.categories || {};
    const keyMoments = report.keyMoments || [];
    const strengths = report.topStrengths || [];
    const improvements = report.topImprovements || [];
    const overallScore = report.overallScore || 0;

    return (
        <div className="min-h-screen bg-background text-foreground font-sans">
            <div className="max-w-5xl mx-auto px-8 py-12">
                {/* Header */}
                <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-12 gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-google-blue flex items-center justify-center shadow-lg shadow-google-blue/20">
                            <span className="text-white font-bold text-xl font-sans">A</span>
                        </div>
                        <div className="flex flex-col">
                            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 leading-none">Session Analysis</h1>
                            <div className="flex items-center gap-3 mt-2">
                                <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">{report.duration || '--'} Session</span>
                                <span className="w-1 h-1 rounded-full bg-neutral-300" />
                                <span className="text-xs font-mono text-neutral-400">ID: {sessionId.slice(0, 8)}</span>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onNewSession}
                        className="google-button px-8 py-3 rounded-lg text-sm font-bold bg-google-blue text-white shadow-lg shadow-google-blue/25 hover:bg-primary-hover transition-all active:scale-[0.98]"
                    >
                        Start New Session
                    </button>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left Column: Scores & Categories */}
                    <div className="lg:col-span-8 space-y-8">
                        {/* Highlights Card */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white border border-neutral-200 rounded-lg p-7 group hover:border-google-green/40 transition-colors shadow-sm">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-lg bg-google-green/10 flex items-center justify-center text-google-green text-xl font-bold"><Check className="w-5 h-5" /></div>
                                    <h3 className="text-sm font-bold text-google-green uppercase tracking-widest leading-none">Strengths</h3>
                                </div>
                                <ul className="space-y-3">
                                    {strengths.map((s: string, i: number) => (
                                        <li key={i} className="text-sm font-medium text-neutral-700 flex gap-3">
                                            <span className="text-google-green shrink-0 mt-0.5">•</span>
                                            {s}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="bg-white border border-neutral-200 rounded-lg p-7 group hover:border-google-red/40 transition-colors shadow-sm">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-lg bg-google-red/10 flex items-center justify-center text-google-red text-xl font-bold"><ArrowUp className="w-5 h-5" /></div>
                                    <h3 className="text-sm font-bold text-google-red uppercase tracking-widest leading-none">Growth Items</h3>
                                </div>
                                <ul className="space-y-3">
                                    {improvements.map((s: string, i: number) => (
                                        <li key={i} className="text-sm font-medium text-neutral-700 flex gap-3">
                                            <span className="text-google-red shrink-0 mt-0.5">•</span>
                                            {s}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* Detailed Breakdown */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {Object.entries(categories).map(([key, cat]: [string, any]) => (
                                <div key={key} className="bg-white border border-neutral-200 rounded-lg p-7 shadow-sm hover:-translate-y-1 transition-transform duration-300 hover:border-neutral-300">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-neutral-50 border border-neutral-200 flex items-center justify-center text-xl shadow-sm">{CATEGORY_ICONS[key] || <BarChart2 className="w-5 h-5 text-neutral-500" />}</div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Dimension</span>
                                                <h4 className="text-sm font-bold text-neutral-900 leading-none mt-1">{CATEGORY_LABELS[key] || key}</h4>
                                            </div>
                                        </div>
                                        <div className={`text-xl font-bold font-sans ${cat.score >= 70 ? 'text-google-green' : cat.score >= 40 ? 'text-google-blue' : 'text-google-red'}`}>
                                            {cat.score}
                                        </div>
                                    </div>
                                    <p className="text-xs font-medium text-neutral-500 leading-relaxed mb-4">{cat.summary}</p>
                                    {cat.tips?.length > 0 && (
                                        <div className="space-y-2">
                                            {cat.tips.slice(0, 2).map((tip: string, i: number) => (
                                                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-[11px] font-medium text-neutral-600 leading-tight">
                                                    <Lightbulb className="w-4 h-4 text-google-blue shrink-0 mt-0.5" />
                                                    {tip}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right Column: Overall Score & Story */}
                    <div className="lg:col-span-4 space-y-8">
                        {/* Overall Score Circle */}
                        <div className="bg-surface shadow-sm border border-neutral-200 rounded-lg p-10 flex flex-col items-center">
                            <div className="relative w-40 h-40 flex items-center justify-center">
                                <svg className="w-full h-full transform -rotate-90 scale-110">
                                    <circle cx="80" cy="80" r="74" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-neutral-50" />
                                    <circle
                                        cx="80" cy="80" r="74" stroke="currentColor" strokeWidth="8" fill="transparent"
                                        strokeDasharray={465}
                                        strokeDashoffset={465 - (465 * overallScore) / 100}
                                        className={`transition-all duration-1000 ${overallScore >= 70 ? 'text-google-green' : overallScore >= 40 ? 'text-google-blue' : 'text-google-red'}`}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-5xl font-bold text-neutral-900 font-sans tracking-tight">{overallScore}</span>
                                    <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-[.2em] mt-1">Total PR</span>
                                </div>
                            </div>
                            <div className="mt-8 text-center pt-8 border-t border-border/50 w-full">
                                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1">Coach Note</p>
                                <p className="text-sm font-medium text-neutral-600 italic leading-relaxed">
                                    &quot;{report.coachNote || 'Your presentation showed strong engagement potential. Keep refining the gesture pace.'}&quot;
                                </p>
                            </div>
                        </div>

                        {/* Timeline / Key Moments */}
                        {keyMoments.length > 0 && (
                            <div className="bg-surface shadow-sm border border-neutral-200 rounded-lg p-7">
                                <h3 className="text-[11px] font-bold text-neutral-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-google-blue" />
                                    Critical Moments
                                </h3>
                                <div className="space-y-6 overflow-hidden">
                                    {keyMoments.slice(0, 5).map((m: any, i: number) => (
                                        <div key={i} className="flex gap-4 relative">
                                            {i !== keyMoments.slice(0, 5).length - 1 && (
                                                <div className="absolute top-8 left-2 w-px h-8 bg-neutral-100" />
                                            )}
                                            <div className="flex flex-col items-center">
                                                <div className={`w-4 h-4 rounded-full border-2 ${m.type === 'positive' ? 'bg-google-green/10 border-google-green' :
                                                    m.type === 'alert' ? 'bg-google-red/10 border-google-red' :
                                                        'bg-google-blue/10 border-google-blue'
                                                    }`} />
                                            </div>
                                            <div className="flex-1 -mt-1">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-mono font-bold text-neutral-400">{m.timeOffset || '0:00'}</span>
                                                    <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md ${m.type === 'positive' ? 'bg-google-green text-white' :
                                                        m.type === 'alert' ? 'bg-google-red text-white' :
                                                            'bg-google-blue text-white'
                                                        }`}>
                                                        {m.type}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] font-medium text-neutral-600 leading-snug">{m.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
