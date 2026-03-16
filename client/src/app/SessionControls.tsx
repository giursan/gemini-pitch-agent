'use client';

import { useState } from 'react';
import { UserCheck, EyeOff, Volume2, MonitorPlay, Settings2, X, ChevronDown, ChevronUp, Video, Pause, Play, Square, Eye, Mic, Brain } from 'lucide-react';

export type SessionState = 'idle' | 'recording' | 'paused' | 'generating' | 'report';
export type FeedbackMode = 'silent' | 'loud';
export type Persona = 'mentor' | 'evaluator' | 'shark' | 'basic';

export type AgentSelection = {
    // Visual
    eyeContact: boolean;
    posture: boolean;
    gestures: boolean;
    // Delivery
    speech: boolean;
    pacing: boolean;
    fillerWords: boolean;
    // Content
    content: boolean;
    congruity: boolean;
    timeManagement: boolean;
    // Settings
    expectedTimeMin: number;
};

interface SessionControlsProps {
    state: SessionState;
    onStart: (mode: FeedbackMode, persona: Persona, agents: AgentSelection) => void;
    onPause: () => void;
    onResume: () => void;
    onEnd: () => void;
    onCalibrate?: () => void;
    hasBaseline?: boolean;
}

export default function SessionControls({ state, onStart, onPause, onResume, onEnd, onCalibrate, hasBaseline }: SessionControlsProps) {
    const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>('silent');
    const [persona, setPersona] = useState<Persona>('mentor');
    const [agents, setAgents] = useState<AgentSelection>({
        eyeContact: true,
        posture: true,
        gestures: true,
        speech: true,
        pacing: true,
        fillerWords: true,
        content: true,
        congruity: true,
        timeManagement: true,
        expectedTimeMin: 10
    });

    const [isSetupOpen, setIsSetupOpen] = useState(false);
    const [expandedCat, setExpandedCat] = useState<'visual' | 'delivery' | 'content' | null>('visual');

    if (state === 'generating') {
        return (
            <div className="flex items-center gap-3 px-4 py-2 bg-neutral-50 rounded-lg border border-border/50">
                <div className="w-4 h-4 border-2 border-google-blue/20 border-t-google-blue rounded-full animate-spin" />
                <span className="text-xs text-neutral-500 font-bold uppercase tracking-wider">Analyzing...</span>
            </div>
        );
    }

    if (state === 'report') return null;

    return (
        <div className="flex items-center gap-4 relative">
            {state === 'idle' && (
                <button
                    onClick={() => setIsSetupOpen(true)}
                    className="w-12 h-12 flex items-center justify-center bg-white text-neutral-900 border border-neutral-200 rounded-full hover:scale-[1.05] active:scale-[0.98] transition-all shadow-sm"
                    title="Setup Session"
                >
                    <Settings2 className="w-4 h-4" />
                </button>
            )}

            {state === 'idle' && onCalibrate && (
                <button
                    onClick={onCalibrate}
                    className={`h-12 flex items-center gap-3 px-8 rounded-full text-[10px] font-black transition-all hover:scale-[1.05] active:scale-[0.98] uppercase tracking-[0.2em] border ${hasBaseline ? 'bg-google-green/5 text-google-green border-google-green/20' : 'bg-white text-neutral-900 border-neutral-200 shadow-sm'}`}
                >
                    <UserCheck className="w-4 h-4" />
                    {hasBaseline ? 'RE-CALIBRATE' : 'CALIBRATE'}
                </button>
            )}

            {/* Status indicators */}
            {(state === 'recording' || state === 'paused') && (
                <div className="flex items-center gap-2 mr-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${state === 'recording' ? 'bg-google-red animate-pulse' : 'bg-google-yellow'}`} />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">
                        {state === 'recording' ? 'Recording' : 'Paused'}
                    </span>
                </div>
            )}

            {/* Action Buttons */}
            {state === 'idle' && (
                <button
                    onClick={() => onStart(feedbackMode, persona, agents)}
                    className="h-12 flex items-center gap-3 px-8 bg-neutral-900 text-white rounded-full text-[10px] font-black shadow-xl shadow-neutral-900/20 hover:scale-[1.05] active:scale-[0.98] transition-all uppercase tracking-[0.2em]"
                >
                    <Video className="w-4 h-4" />
                    START PRACTICE
                </button>
            )}

            {state === 'recording' && (
                <div className="flex items-center gap-3">
                    <button
                        onClick={onPause}
                        className="w-12 h-12 flex items-center justify-center bg-white text-neutral-700 border border-neutral-200 rounded-full hover:bg-neutral-50 active:scale-[0.95] transition-all shadow-sm group"
                        title="Pause Session"
                    >
                        <Pause className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    </button>
                    <button
                        onClick={onEnd}
                        className="w-12 h-12 flex items-center justify-center bg-google-red text-white rounded-full hover:bg-red-600 active:scale-[0.95] transition-all group"
                        title="Stop Session"
                    >
                        <Square className="w-5 h-5 fill-white group-hover:scale-110 transition-transform" />
                    </button>
                </div>
            )}

            {state === 'paused' && (
                <div className="flex items-center gap-3">
                    <button
                        onClick={onResume}
                        className="w-12 h-12 flex items-center justify-center bg-neutral-900 text-white rounded-full hover:bg-black active:scale-[0.95] transition-all group"
                        title="Resume Session"
                    >
                        <Play className="w-5 h-5 fill-white translate-x-0.5 group-hover:scale-110 transition-transform" />
                    </button>
                    <button
                        onClick={onEnd}
                        className="w-12 h-12 flex items-center justify-center bg-google-red text-white rounded-full hover:bg-red-600 active:scale-[0.95] transition-all group"
                        title="Stop Session"
                    >
                        <Square className="w-5 h-5 fill-white group-hover:scale-110 transition-transform" />
                    </button>
                </div>
            )}

            {/* Setup Modal Overlay */}
            {isSetupOpen && (
                <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl mx-4 overflow-hidden animate-in fade-in zoom-in duration-300 border border-neutral-200">
                        <div className="px-10 py-8 flex items-center justify-between">
                            <h2 className="text-2xl font-black text-neutral-900 tracking-tight leading-tight">Configure Space</h2>
                            <button onClick={() => setIsSetupOpen(false)} className="w-10 h-10 flex items-center justify-center bg-neutral-100 hover:bg-neutral-200 text-neutral-500 rounded-full transition-all active:scale-95">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="px-10 pb-10 overflow-y-auto max-h-[70vh] space-y-10 custom-scrollbar">

                            {/* Dimension B & C */}
                            <div className="grid grid-cols-2 gap-8">
                                {/* Modality */}
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black uppercase text-neutral-400 tracking-[0.2em]">Modality</h3>
                                    <div className="flex flex-col gap-3">
                                        <button onClick={() => setFeedbackMode('silent')} className={`px-5 py-4 rounded-2xl border-2 flex items-center gap-4 text-left transition-all ${feedbackMode === 'silent' ? 'border-google-blue bg-google-blue text-white' : 'border-neutral-100 bg-white hover:border-neutral-200'}`}>
                                            <div className={`p-2.5 rounded-xl ${feedbackMode === 'silent' ? 'bg-white/20 text-white' : 'bg-google-blue/10 text-google-blue'}`}>
                                                <EyeOff className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black tracking-tight">Silent</p>
                                                <p className={`text-[10px] leading-tight mt-1 ${feedbackMode === 'silent' ? 'text-white/70' : 'text-neutral-500'}`}>Visual popups only.</p>
                                            </div>
                                        </button>
                                        <button onClick={() => setFeedbackMode('loud')} className={`px-5 py-4 rounded-2xl border-2 flex items-center gap-4 text-left transition-all ${feedbackMode === 'loud' ? 'border-google-red bg-google-red text-white' : 'border-neutral-100 bg-white hover:border-neutral-200'}`}>
                                            <div className={`p-2.5 rounded-xl ${feedbackMode === 'loud' ? 'bg-white/20 text-white' : 'bg-google-red/10 text-google-red'}`}>
                                                <Volume2 className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black tracking-tight">Loud</p>
                                                <p className={`text-[10px] leading-tight mt-1 ${feedbackMode === 'loud' ? 'text-white/70' : 'text-neutral-500'}`}>Voice interruptions.</p>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                {/* Persona */}
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black uppercase text-neutral-400 tracking-[0.2em]">Aura Mentor Persona</h3>
                                    <div className="flex flex-col gap-3">
                                        {(['mentor', 'evaluator', 'shark', 'basic'] as const).map(p => (
                                            <button
                                                key={p}
                                                onClick={() => setPersona(p)}
                                                className={`px-5 py-3 rounded-2xl border-2 text-left transition-all ${persona === p ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-100 bg-white hover:border-neutral-200 text-neutral-700'}`}
                                            >
                                                <p className="text-sm font-black capitalize tracking-tight">{p}</p>
                                                <p className={`text-[10px] leading-tight mt-0.5 ${persona === p ? 'text-neutral-400' : 'text-neutral-500'}`}>
                                                    {p === 'mentor' && 'Encouraging & constructive'}
                                                    {p === 'evaluator' && 'Neutral & data-driven'}
                                                    {p === 'shark' && 'Brutal & demanding'}
                                                    {p === 'basic' && 'Robotic repetition'}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <hr className="border-neutral-200" />

                            {/* Dimension A: Analysis Matrix */}
                            <div className="space-y-6">
                                <h3 className="text-[10px] font-black uppercase text-neutral-400 tracking-[0.2em]">Analysis Matrix</h3>

                                <div className="space-y-3">
                                    {/* Visual */}
                                    <div className={`bg-white border-2 text-sm rounded-[1.5rem] overflow-hidden transition-all hover:border-neutral-200 ${expandedCat === 'visual' ? 'border-neutral-900' : 'border-neutral-100'}`}>
                                        <button onClick={() => setExpandedCat(expandedCat === 'visual' ? null : 'visual')} className="w-full px-6 py-5 flex items-center justify-between bg-white transition-colors">
                                            <div className="flex items-center gap-4">
                                                <input type="checkbox" checked={agents.eyeContact || agents.posture || agents.gestures} onChange={e => {
                                                    e.stopPropagation();
                                                    setAgents({ ...agents, eyeContact: e.target.checked, posture: e.target.checked, gestures: e.target.checked });
                                                }} className="w-5 h-5 accent-neutral-900 rounded-lg" />
                                                <div className="flex items-center gap-2">
                                                    <Eye className="w-4 h-4 text-neutral-900" />
                                                    <span className="font-black text-neutral-900 tracking-tight text-base">Visual Tracking</span>
                                                </div>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Camera Enabled</span>
                                            </div>
                                            {expandedCat === 'visual' ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
                                        </button>
                                        {expandedCat === 'visual' && (
                                            <div className="px-5 pb-5 pt-2 grid grid-cols-2 gap-3 border-t border-neutral-100 bg-neutral-50/30">
                                                <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-neutral-600 hover:text-neutral-900 transition-colors">
                                                    <input type="checkbox" checked={agents.eyeContact} onChange={e => setAgents({ ...agents, eyeContact: e.target.checked })} className="w-4 h-4 accent-neutral-900 rounded-md" />
                                                    Eye Contact
                                                </label>
                                                <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-neutral-600 hover:text-neutral-900 transition-colors">
                                                    <input type="checkbox" checked={agents.posture} onChange={e => setAgents({ ...agents, posture: e.target.checked })} className="w-4 h-4 accent-neutral-900 rounded-md" />
                                                    Posture
                                                </label>
                                                <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-neutral-600 hover:text-neutral-900 transition-colors">
                                                    <input type="checkbox" checked={agents.gestures} onChange={e => setAgents({ ...agents, gestures: e.target.checked })} className="w-4 h-4 accent-neutral-900 rounded-md" />
                                                    Hand Gestures
                                                </label>
                                            </div>
                                        )}
                                    </div>

                                    {/* Delivery */}
                                    <div className={`bg-white border-2 text-sm rounded-[1.5rem] overflow-hidden transition-all hover:border-neutral-200 ${expandedCat === 'delivery' ? 'border-neutral-900' : 'border-neutral-100'}`}>
                                        <button onClick={() => setExpandedCat(expandedCat === 'delivery' ? null : 'delivery')} className="w-full px-6 py-5 flex items-center justify-between bg-white transition-colors">
                                            <div className="flex items-center gap-4">
                                                <input type="checkbox" checked={agents.speech} onChange={e => {
                                                    e.stopPropagation();
                                                    setAgents({ ...agents, speech: e.target.checked, pacing: e.target.checked, fillerWords: e.target.checked });
                                                }} className="w-5 h-5 accent-neutral-900 rounded-lg" />
                                                <div className="flex items-center gap-2">
                                                    <Mic className="w-4 h-4 text-neutral-900" />
                                                    <span className="font-black text-neutral-900 tracking-tight text-base">Delivery Metrics</span>
                                                </div>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Microphone</span>
                                            </div>
                                            {expandedCat === 'delivery' ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
                                        </button>
                                        {expandedCat === 'delivery' && (
                                            <div className={`px-5 pb-5 pt-2 grid grid-cols-2 gap-3 border-t border-neutral-100 bg-neutral-50/30 ${!agents.speech && 'opacity-50 pointer-events-none'}`}>
                                                <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-neutral-600 hover:text-neutral-900 transition-colors">
                                                    <input type="checkbox" checked={agents.pacing} onChange={e => setAgents({ ...agents, pacing: e.target.checked })} className="w-4 h-4 accent-neutral-900 rounded-md" />
                                                    Pacing (WPM)
                                                </label>
                                                <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-neutral-600 hover:text-neutral-900 transition-colors">
                                                    <input type="checkbox" checked={agents.fillerWords} onChange={e => setAgents({ ...agents, fillerWords: e.target.checked })} className="w-4 h-4 accent-neutral-900 rounded-md" />
                                                    Filler Words
                                                </label>
                                            </div>
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className={`bg-white border-2 text-sm rounded-[1.5rem] overflow-hidden transition-all hover:border-neutral-200 ${expandedCat === 'content' ? 'border-neutral-900' : 'border-neutral-100'}`}>
                                        <button onClick={() => setExpandedCat(expandedCat === 'content' ? null : 'content')} className="w-full px-6 py-5 flex items-center justify-between bg-white transition-colors">
                                            <div className="flex items-center gap-4">
                                                <input type="checkbox" checked={agents.content} onChange={e => {
                                                    e.stopPropagation();
                                                    setAgents({ ...agents, content: e.target.checked, congruity: e.target.checked, timeManagement: e.target.checked });
                                                }} disabled={!agents.speech} className="w-5 h-5 accent-neutral-900 rounded-lg disabled:opacity-30" />
                                                <div className="flex items-center gap-2">
                                                    <Brain className="w-4 h-4 text-neutral-900" />
                                                    <span className="font-black text-neutral-900 tracking-tight text-base">Content Intel</span>
                                                </div>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">AI Logic</span>
                                            </div>
                                            {expandedCat === 'content' ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
                                        </button>
                                        {expandedCat === 'content' && (
                                            <div className={`px-5 pb-5 pt-2 flex flex-col gap-3 border-t border-neutral-100 bg-neutral-50/30 ${(!agents.content || !agents.speech) && 'opacity-50 pointer-events-none'}`}>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-neutral-600 hover:text-neutral-900 transition-colors">
                                                        <input type="checkbox" checked={agents.congruity} onChange={e => setAgents({ ...agents, congruity: e.target.checked })} className="w-4 h-4 accent-neutral-900 rounded-md" />
                                                        Congruity Check
                                                    </label>
                                                    <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-neutral-600 hover:text-neutral-900 transition-colors">
                                                        <input type="checkbox" checked={agents.timeManagement} onChange={e => setAgents({ ...agents, timeManagement: e.target.checked })} className="w-4 h-4 accent-neutral-900 rounded-md" />
                                                        Time Management
                                                    </label>
                                                </div>
                                                <div className="flex items-center gap-3 mt-2">
                                                    <label className="text-xs font-bold text-neutral-600">Expected Time (mins):</label>
                                                    <input
                                                        type="number"
                                                        value={agents.expectedTimeMin}
                                                        onChange={e => setAgents({ ...agents, expectedTimeMin: Math.max(1, parseInt(e.target.value) || 10) })}
                                                        className="w-20 px-3 py-1.5 rounded-lg border border-neutral-200 text-sm outline-none focus:border-google-blue"
                                                        min={1}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="px-10 py-8 bg-neutral-50 flex justify-end">
                            <button
                                onClick={() => setIsSetupOpen(false)}
                                className="h-14 px-12 bg-neutral-900 text-white font-black text-[11px] rounded-full shadow-2xl shadow-neutral-900/20 hover:scale-[1.05] active:scale-[0.98] transition-all uppercase tracking-[0.2em]"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
