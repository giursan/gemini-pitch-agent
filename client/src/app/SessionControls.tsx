'use client';

import { useState } from 'react';
import { EyeOff, Volume2, MonitorPlay, Settings2, X, ChevronDown, ChevronUp } from 'lucide-react';

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
}

export default function SessionControls({ state, onStart, onPause, onResume, onEnd }: SessionControlsProps) {
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
                    className="flex items-center gap-2 px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg text-sm font-bold border border-neutral-200 hover:bg-neutral-200 transition-all"
                >
                    <Settings2 className="w-4 h-4" />
                    Setup Session
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
                    className="google-button px-8 py-2.5 rounded-lg text-sm font-bold bg-google-blue text-white shadow-lg shadow-google-blue/25 hover:opacity-90 active:scale-[0.98] transition-all"
                >
                    Start Practice
                </button>
            )}

            {state === 'recording' && (
                <div className="flex items-center gap-2">
                    {state === 'recording' && (
                        <>
                            <button
                                onClick={onPause}
                                className="google-button px-6 py-2.5 rounded-lg text-sm font-bold bg-white text-neutral-700 border border-border/60 hover:bg-neutral-50 active:scale-[0.98] transition-all"
                            >
                                Pause
                            </button>
                            <button
                                onClick={onEnd}
                                className="google-button px-6 py-2.5 rounded-lg text-sm font-bold bg-google-red text-white shadow-lg shadow-google-red/25 hover:opacity-90 active:scale-[0.98] transition-all"
                            >
                                Stop
                            </button>
                        </>
                    )}
                </div>
            )}

            {state === 'paused' && (
                <div className="flex items-center gap-2">
                    <button
                        onClick={onResume}
                        className="google-button px-6 py-2.5 rounded-lg text-sm font-bold bg-google-blue text-white shadow-lg shadow-google-blue/25 hover:opacity-90 active:scale-[0.98] transition-all"
                    >
                        Resume
                    </button>
                    <button
                        onClick={onEnd}
                        className="google-button px-6 py-2.5 rounded-lg text-sm font-bold bg-google-red text-white shadow-lg shadow-google-red/25 hover:opacity-90 active:scale-[0.98] transition-all"
                    >
                        Stop
                    </button>
                </div>
            )}

            {/* Setup Modal Overlay */}
            {isSetupOpen && (
                <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl mx-4 overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="px-6 py-5 border-b border-neutral-200 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-neutral-900">Configure Practice Environment</h2>
                            <button onClick={() => setIsSetupOpen(false)} className="text-neutral-400 hover:text-neutral-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto max-h-[70vh] bg-neutral-50/50 space-y-8">
                            
                            {/* Dimension B & C */}
                            <div className="grid grid-cols-2 gap-6">
                                {/* Modality */}
                                <div className="space-y-3">
                                    <h3 className="text-xs font-black uppercase text-neutral-400 tracking-wider">Modality</h3>
                                    <div className="flex flex-col gap-2">
                                        <button onClick={() => setFeedbackMode('silent')} className={`px-4 py-3 rounded-xl border flex items-center gap-3 text-left transition-all ${feedbackMode === 'silent' ? 'border-google-blue bg-google-blue/5 shadow-sm' : 'border-neutral-200 bg-white hover:border-neutral-300'}`}>
                                            <div className={`p-2 rounded-lg ${feedbackMode === 'silent' ? 'bg-google-blue text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                                                <EyeOff className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className={`text-sm font-bold ${feedbackMode === 'silent' ? 'text-google-blue' : 'text-neutral-700'}`}>Silent Mode</p>
                                                <p className="text-[10px] text-neutral-500 mt-0.5">Visual UI popups only. No interruptions.</p>
                                            </div>
                                        </button>
                                        <button onClick={() => setFeedbackMode('loud')} className={`px-4 py-3 rounded-xl border flex items-center gap-3 text-left transition-all ${feedbackMode === 'loud' ? 'border-google-red bg-google-red/5 shadow-sm' : 'border-neutral-200 bg-white hover:border-neutral-300'}`}>
                                            <div className={`p-2 rounded-lg ${feedbackMode === 'loud' ? 'bg-google-red text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                                                <Volume2 className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className={`text-sm font-bold ${feedbackMode === 'loud' ? 'text-google-red' : 'text-neutral-700'}`}>Loud Mode</p>
                                                <p className="text-[10px] text-neutral-500 mt-0.5">Voice interruptions for immediate reaction.</p>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                {/* Persona */}
                                <div className="space-y-3">
                                    <h3 className="text-xs font-black uppercase text-neutral-400 tracking-wider">Coach Persona</h3>
                                    <div className="flex flex-col gap-2">
                                        {(['mentor', 'evaluator', 'shark', 'basic'] as const).map(p => (
                                            <button 
                                                key={p} 
                                                onClick={() => setPersona(p)} 
                                                className={`px-4 py-2.5 rounded-xl border text-left transition-all ${persona === p ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white hover:border-neutral-300 text-neutral-700'}`}
                                            >
                                                <p className="text-sm font-bold capitalize">{p}</p>
                                                <p className={`text-[10px] ${persona === p ? 'text-neutral-300' : 'text-neutral-500'}`}>
                                                    {p === 'mentor' && 'Encouraging & constructive'}
                                                    {p === 'evaluator' && 'Neutral & data-driven'}
                                                    {p === 'shark' && 'Brutal & demanding'}
                                                    {p === 'basic' && 'Robotic repetition of alerts'}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <hr className="border-neutral-200" />

                            {/* Dimension A: Analysis Matrix */}
                            <div>
                                <h3 className="text-xs font-black uppercase text-neutral-400 tracking-wider mb-4">Analysis Matrix</h3>
                                
                                <div className="space-y-3">
                                    {/* Visual */}
                                    <div className="bg-white border text-sm border-neutral-200 rounded-xl overflow-hidden transition-all">
                                        <button onClick={() => setExpandedCat(expandedCat === 'visual' ? null : 'visual')} className="w-full px-5 py-4 flex items-center justify-between bg-white hover:bg-neutral-50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <span className="font-bold text-neutral-900">👁️ Visual Category</span>
                                                <span className="text-xs text-neutral-500">Camera</span>
                                            </div>
                                            {expandedCat === 'visual' ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
                                        </button>
                                        {expandedCat === 'visual' && (
                                            <div className="px-5 pb-5 pt-2 grid grid-cols-2 gap-3 border-t border-neutral-100 bg-neutral-50/30">
                                                <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-700 hover:text-neutral-900">
                                                    <input type="checkbox" checked={agents.eyeContact} onChange={e => setAgents({...agents, eyeContact: e.target.checked})} className="w-4 h-4 accent-google-blue rounded" />
                                                    Eye Contact
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-700 hover:text-neutral-900">
                                                    <input type="checkbox" checked={agents.posture} onChange={e => setAgents({...agents, posture: e.target.checked})} className="w-4 h-4 accent-google-blue rounded" />
                                                    Posture
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-700 hover:text-neutral-900">
                                                    <input type="checkbox" checked={agents.gestures} onChange={e => setAgents({...agents, gestures: e.target.checked})} className="w-4 h-4 accent-google-blue rounded" />
                                                    Hand Gestures
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Delivery */}
                                    <div className="bg-white border text-sm border-neutral-200 rounded-xl overflow-hidden transition-all">
                                        <button onClick={() => setExpandedCat(expandedCat === 'delivery' ? null : 'delivery')} className="w-full px-5 py-4 flex items-center justify-between bg-white hover:bg-neutral-50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <input type="checkbox" checked={agents.speech} onChange={e => {
                                                    e.stopPropagation();
                                                    setAgents({...agents, speech: e.target.checked, pacing: e.target.checked, fillerWords: e.target.checked});
                                                }} className="w-4 h-4 accent-google-blue rounded" />
                                                <span className="font-bold text-neutral-900">🎤 Delivery Category</span>
                                                <span className="text-xs text-neutral-500">Microphone</span>
                                            </div>
                                            {expandedCat === 'delivery' ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
                                        </button>
                                        {expandedCat === 'delivery' && (
                                            <div className={`px-5 pb-5 pt-2 grid grid-cols-2 gap-3 border-t border-neutral-100 bg-neutral-50/30 ${!agents.speech && 'opacity-50 pointer-events-none'}`}>
                                                <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-700 hover:text-neutral-900">
                                                    <input type="checkbox" checked={agents.pacing} onChange={e => setAgents({...agents, pacing: e.target.checked})} className="w-4 h-4 accent-google-blue rounded" />
                                                    Pacing (WPM)
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-700 hover:text-neutral-900">
                                                    <input type="checkbox" checked={agents.fillerWords} onChange={e => setAgents({...agents, fillerWords: e.target.checked})} className="w-4 h-4 accent-google-blue rounded" />
                                                    Filler Words
                                                </label>
                                            </div>
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="bg-white border text-sm border-neutral-200 rounded-xl overflow-hidden transition-all">
                                        <button onClick={() => setExpandedCat(expandedCat === 'content' ? null : 'content')} className="w-full px-5 py-4 flex items-center justify-between bg-white hover:bg-neutral-50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <input type="checkbox" checked={agents.content} onChange={e => {
                                                    e.stopPropagation();
                                                    setAgents({...agents, content: e.target.checked, congruity: e.target.checked, timeManagement: e.target.checked});
                                                }} disabled={!agents.speech} className="w-4 h-4 accent-google-blue rounded disabled:opacity-50" />
                                                <span className="font-bold text-neutral-900">🧠 Content Category</span>
                                                <span className="text-xs text-neutral-500">Requires Delivery</span>
                                            </div>
                                            {expandedCat === 'content' ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
                                        </button>
                                        {expandedCat === 'content' && (
                                            <div className={`px-5 pb-5 pt-2 flex flex-col gap-3 border-t border-neutral-100 bg-neutral-50/30 ${(!agents.content || !agents.speech) && 'opacity-50 pointer-events-none'}`}>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-700 hover:text-neutral-900">
                                                        <input type="checkbox" checked={agents.congruity} onChange={e => setAgents({...agents, congruity: e.target.checked})} className="w-4 h-4 accent-google-blue rounded" />
                                                        Congruity Check
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-700 hover:text-neutral-900">
                                                        <input type="checkbox" checked={agents.timeManagement} onChange={e => setAgents({...agents, timeManagement: e.target.checked})} className="w-4 h-4 accent-google-blue rounded" />
                                                        Time Management
                                                    </label>
                                                </div>
                                                <div className="flex items-center gap-3 mt-2">
                                                    <label className="text-xs font-bold text-neutral-600">Expected Time (mins):</label>
                                                    <input 
                                                        type="number" 
                                                        value={agents.expectedTimeMin} 
                                                        onChange={e => setAgents({...agents, expectedTimeMin: Math.max(1, parseInt(e.target.value) || 10)})}
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

                        <div className="px-6 py-4 border-t border-neutral-200 bg-white flex justify-end">
                            <button 
                                onClick={() => setIsSetupOpen(false)}
                                className="px-6 py-2.5 bg-neutral-900 text-white font-bold text-sm rounded-xl shadow-lg hover:bg-neutral-800 transition-colors"
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
