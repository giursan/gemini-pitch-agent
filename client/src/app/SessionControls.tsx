'use client';

import { useState } from 'react';
import { EyeOff, Zap } from 'lucide-react';

export type SessionState = 'idle' | 'recording' | 'paused' | 'generating' | 'report';
export type FeedbackMode = 'silent' | 'shark';
export type AgentSelection = {
    eyeContact: boolean;
    posture: boolean;
    gestures: boolean;
    speech: boolean;
};

interface SessionControlsProps {
    state: SessionState;
    onStart: (mode: FeedbackMode, agents: AgentSelection) => void;
    onPause: () => void;
    onResume: () => void;
    onEnd: () => void;
}

export default function SessionControls({ state, onStart, onPause, onResume, onEnd }: SessionControlsProps) {
    const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>('silent');
    const [agents, setAgents] = useState<AgentSelection>({
        eyeContact: true,
        posture: true,
        gestures: true,
        speech: true
    });

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
        <div className="flex items-center gap-4">
            {/* Feedback Mode Toggle (Material 3 Style) */}
            {state === 'idle' && (
                <div className="flex bg-neutral-100 p-1 rounded-lg border border-neutral-200">
                    <button
                        onClick={() => setFeedbackMode('silent')}
                        className={`px-4 py-1.5 flex items-center gap-1.5 rounded-md text-[11px] font-bold transition-all ${feedbackMode === 'silent'
                            ? 'bg-white text-neutral-900 shadow-sm'
                            : 'text-neutral-500 hover:text-neutral-700'
                            }`}
                    >
                        <EyeOff className="w-3.5 h-3.5" /> SILENT
                    </button>
                    <button
                        onClick={() => setFeedbackMode('shark')}
                        className={`px-4 py-1.5 flex items-center gap-1.5 rounded-md text-[11px] font-bold transition-all ${feedbackMode === 'shark'
                            ? 'bg-google-red text-white shadow-lg shadow-google-red/20'
                            : 'text-neutral-500 hover:text-neutral-700'
                            }`}
                    >
                        <Zap className="w-3.5 h-3.5" /> SHARK
                    </button>
                </div>
            )}

            {/* Agent Selectors */}
            {state === 'idle' && (
                <div className="flex bg-neutral-100 p-1.5 rounded-lg border border-neutral-200">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-500 uppercase cursor-pointer hover:text-neutral-700 transition-colors px-2 border-r border-neutral-300 last:border-0 pl-3">
                        <input type="checkbox" checked={agents.eyeContact} onChange={e => setAgents(prev => ({ ...prev, eyeContact: e.target.checked }))} className="w-3 h-3 accent-google-blue" />
                        Eyes
                    </label>
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-500 uppercase cursor-pointer hover:text-neutral-700 transition-colors px-2 border-r border-neutral-300 last:border-0">
                        <input type="checkbox" checked={agents.posture} onChange={e => setAgents(prev => ({ ...prev, posture: e.target.checked }))} className="w-3 h-3 accent-google-blue" />
                        Posture
                    </label>
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-500 uppercase cursor-pointer hover:text-neutral-700 transition-colors px-2 border-r border-neutral-300 last:border-0">
                        <input type="checkbox" checked={agents.gestures} onChange={e => setAgents(prev => ({ ...prev, gestures: e.target.checked }))} className="w-3 h-3 accent-google-blue" />
                        Hands
                    </label>
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-500 uppercase cursor-pointer hover:text-neutral-700 transition-colors px-2 border-r border-neutral-300 last:border-0 pr-3">
                        <input type="checkbox" checked={agents.speech} onChange={e => setAgents(prev => ({ ...prev, speech: e.target.checked }))} className="w-3 h-3 accent-google-blue" />
                        Gemini Vox
                    </label>
                </div>
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
                    onClick={() => onStart(feedbackMode, agents)}
                    className="google-button px-8 py-2.5 rounded-lg text-sm font-bold bg-google-blue text-white shadow-lg shadow-google-blue/25 hover:bg-primary-hover active:scale-[0.98] transition-all"
                >
                    Start Practice
                </button>
            )}

            {state === 'recording' && (
                <div className="flex items-center gap-2">
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
        </div>
    );
}
