'use client';

import { useState } from 'react';

export type SessionState = 'idle' | 'recording' | 'paused' | 'generating' | 'report';
export type FeedbackMode = 'silent' | 'shark';

interface SessionControlsProps {
    state: SessionState;
    onStart: (mode: FeedbackMode) => void;
    onPause: () => void;
    onResume: () => void;
    onEnd: () => void;
}

export default function SessionControls({ state, onStart, onPause, onResume, onEnd }: SessionControlsProps) {
    const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>('silent');

    if (state === 'generating') {
        return (
            <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="text-sm text-white/60 font-medium">Generating analysis...</span>
            </div>
        );
    }

    if (state === 'report') return null;

    return (
        <div className="flex items-center gap-3">
            {/* Feedback Mode Toggle */}
            {state === 'idle' && (
                <button
                    onClick={() => setFeedbackMode(m => m === 'silent' ? 'shark' : 'silent')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${feedbackMode === 'shark'
                            ? 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30'
                            : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'
                        }`}
                    title={feedbackMode === 'shark' ? 'Shark Mode: AI will interrupt you' : 'Silent Coach: Visual feedback only'}
                >
                    {feedbackMode === 'shark' ? '🦈 Shark Mode' : '👁️ Silent Coach'}
                </button>
            )}

            {/* Recording indicator */}
            {state === 'recording' && (
                <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-xs font-mono font-medium text-emerald-400 border border-emerald-500/30 animate-pulse">
                    ● REC
                </span>
            )}
            {state === 'paused' && (
                <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-xs font-mono font-medium text-amber-400 border border-amber-500/30">
                    ⏸ PAUSED
                </span>
            )}

            {/* Action Buttons */}
            {state === 'idle' && (
                <button
                    onClick={() => onStart(feedbackMode)}
                    className="px-5 py-2 rounded-full text-sm font-semibold bg-white text-black hover:bg-neutral-200 transition-colors"
                >
                    Start Practice
                </button>
            )}

            {state === 'recording' && (
                <>
                    <button
                        onClick={onPause}
                        className="px-4 py-2 rounded-full text-sm font-medium bg-white/10 text-white/80 hover:bg-white/20 transition-colors border border-white/10"
                    >
                        Pause
                    </button>
                    <button
                        onClick={onEnd}
                        className="px-4 py-2 rounded-full text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors border border-red-500/30"
                    >
                        End Session
                    </button>
                </>
            )}

            {state === 'paused' && (
                <>
                    <button
                        onClick={onResume}
                        className="px-4 py-2 rounded-full text-sm font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors border border-emerald-500/30"
                    >
                        Resume
                    </button>
                    <button
                        onClick={onEnd}
                        className="px-4 py-2 rounded-full text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors border border-red-500/30"
                    >
                        End Session
                    </button>
                </>
            )}
        </div>
    );
}
