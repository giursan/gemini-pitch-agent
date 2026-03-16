'use client';

import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, Ruler, ShieldCheck, Timer, UserCheck, AlertCircle, X } from 'lucide-react';
import { BodyLandmarks } from '../hooks/useEyeContact';
import { GestureMetrics } from '../hooks/useGestureRecognizer';
import { LM, PostureBaseline, angleBetween } from '../hooks/useBodyLanguageAnalysis';

interface PostureCalibrationOverlayProps {
    landmarksRef: React.RefObject<BodyLandmarks>;
    gestureMetrics: GestureMetrics;
    onComplete: (baseline: PostureBaseline) => void;
    onCancel: () => void;
}

type CalibrationStep = 'POSITIONING' | 'UPRIGHT_INSTRUCTIONS' | 'COUNTDOWN' | 'CAPTURING' | 'SUCCESS';

export default function PostureCalibrationOverlay({
    landmarksRef,
    gestureMetrics,
    onComplete,
    onCancel
}: PostureCalibrationOverlayProps) {
    const [step, setStep] = useState<CalibrationStep>('POSITIONING');
    const [countdown, setCountdown] = useState(5);
    const [isVisible, setIsVisible] = useState(false);
    const lastGestureRef = useRef<string | null>(null);

    // Euclidean distance helper
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    };

    // Check visibility logic
    useEffect(() => {
        const interval = setInterval(() => {
            const lm = landmarksRef.current;
            if (!lm || !lm.poseLandmarks) {
                setIsVisible(false);
                return;
            }

            const pose = lm.poseLandmarks;
            const headVisible = pose[0]?.visibility && pose[0].visibility > 0.5;

            // We need hips to calculate trunk length (indices 23, 24)
            const poseArr = pose as any[];
            const leftHipVisible = poseArr[LM.LEFT_HIP]?.visibility && poseArr[LM.LEFT_HIP].visibility > 0.5;
            const rightHipVisible = poseArr[LM.RIGHT_HIP]?.visibility && poseArr[LM.RIGHT_HIP].visibility > 0.5;

            setIsVisible(!!(headVisible && (leftHipVisible || rightHipVisible)));
        }, 100);
        return () => clearInterval(interval);
    }, [landmarksRef]);

    // Handle Gesture Navigation
    useEffect(() => {
        const gesture = gestureMetrics.currentGestures[0]?.gesture;
        if (gesture === 'Thumb_Up' && lastGestureRef.current !== 'Thumb_Up') {
            if (step === 'POSITIONING' && isVisible) {
                setStep('UPRIGHT_INSTRUCTIONS');
            } else if (step === 'UPRIGHT_INSTRUCTIONS') {
                setStep('COUNTDOWN');
            }
        }
        lastGestureRef.current = gesture;
    }, [gestureMetrics, step, isVisible]);

    // Countdown logic
    useEffect(() => {
        if (step === 'COUNTDOWN') {
            const timer = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        setStep('CAPTURING');
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [step]);

    // Capture logic
    useEffect(() => {
        if (step === 'CAPTURING') {
            const lm = landmarksRef.current;
            if (lm && lm.poseLandmarks && lm.faceLandmarks) {
                const pose = lm.poseLandmarks;
                const face = lm.faceLandmarks;

                // ── Calculate Baseline Metrics ──
                const earMid = {
                    x: (pose[LM.LEFT_EAR].x + pose[LM.RIGHT_EAR].x) / 2,
                    y: (pose[LM.LEFT_EAR].y + pose[LM.RIGHT_EAR].y) / 2,
                };
                const shoulderMid = {
                    x: (pose[LM.LEFT_SHOULDER].x + pose[LM.RIGHT_SHOULDER].x) / 2,
                    y: (pose[LM.LEFT_SHOULDER].y + pose[LM.RIGHT_SHOULDER].y) / 2,
                };
                const hipMid = {
                    x: (pose[LM.LEFT_HIP].x + pose[LM.RIGHT_HIP].x) / 2,
                    y: (pose[LM.LEFT_HIP].y + pose[LM.RIGHT_HIP].y) / 2,
                };
                const chin = face[152]; // Chin index

                const trunkHeight = dist(shoulderMid, hipMid);
                const neckRatio = dist(chin, shoulderMid) / Math.max(trunkHeight, 0.01);
                const shoulderDist = dist(pose[LM.LEFT_SHOULDER], pose[LM.RIGHT_SHOULDER]);
                const breadthRatio = shoulderDist / Math.max(trunkHeight, 0.01);
                const idealAngle = angleBetween(earMid, shoulderMid, hipMid);

                const baseline: PostureBaseline = {
                    neckRatio,
                    breadthRatio,
                    idealAngle
                };

                onComplete(baseline);
                setStep('SUCCESS');

                // Final close
                setTimeout(() => {
                    onCancel();
                }, 2000);
            } else {
                // If we lost tracking during capture, reset
                setStep('POSITIONING');
                setCountdown(5);
            }
        }
    }, [step, landmarksRef, onComplete, onCancel]);

    return (
        <div className="fixed inset-0 z-[100] bg-black/40 flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="absolute top-12 flex flex-col items-center">
                <div className="w-16 h-16 rounded-3xl bg-white/10 backdrop-blur-md flex items-center justify-center mb-6">
                    <UserCheck className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-4xl font-black text-white tracking-tight leading-tight">
                    Postural Stance Calibration
                </h2>
            </div>

            {/* Top-Right Close Button */}
            <button 
                onClick={onCancel}
                className="absolute top-8 right-8 w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-all active:scale-95 group"
                title="Cancel Calibration"
            >
                <X className="w-6 h-6 group-hover:rotate-90 transition-transform" />
            </button>

            {/* Main Guidance UI */}
            <div className="flex-1 flex flex-col items-center justify-center max-w-2xl w-full text-center">

                {step === 'POSITIONING' && (
                    <div className="space-y-8 animate-in slide-in-from-bottom-8">
                        <div className={`p-8 rounded-3xl border-2 transition-all duration-500 ${isVisible ? 'bg-google-green/10 border-google-green/30' : 'bg-neutral-900 border-neutral-800'}`}>
                            {isVisible ? (
                                <CheckCircle2 className="w-20 h-20 text-google-green mx-auto mb-6 animate-bounce" />
                            ) : (
                                <Ruler className="w-20 h-20 text-neutral-600 mx-auto mb-6 animate-pulse" />
                            )}
                            <h3 className="text-4xl font-black text-white mb-6 tracking-tight">
                                {isVisible ? "Position Perfect" : "Full Body Check"}
                            </h3>
                            <p className="text-neutral-300 text-3xl font-medium leading-relaxed">
                                {isVisible
                                    ? "We can see your entire upper body. Now, confirm with a 👍 gesture to continue."
                                    : "Please step back until your hips and the top of your head are visible in the frame."}
                            </p>
                        </div>
                    </div>
                )}

                {step === 'UPRIGHT_INSTRUCTIONS' && (
                    <div className="space-y-8 animate-in zoom-in-95 duration-500">
                        <div className="p-10 rounded-3xl bg-google-blue/10 border-2 border-google-blue/30 max-w-3xl mx-auto">
                            <ShieldCheck className="w-24 h-24 text-google-blue mx-auto mb-8" />
                            <h3 className="text-4xl font-black text-white mb-6 tracking-tight">Set Your Best Stance</h3>
                            <p className="text-neutral-300 text-3xl font-medium leading-relaxed">
                                Stand as tall as possible. Pull your shoulders back and lift your chin slightly.
                                <br /><br />
                                Give a 👍 when you are ready to snapshot this baseline.
                            </p>
                        </div>
                    </div>
                )}

                {step === 'COUNTDOWN' && (
                    <div className="relative flex flex-col items-center">
                        <div className="w-64 h-64 rounded-full border-[12px] border-white/5 flex items-center justify-center relative">
                            <div className="inset-0 rounded-full border-[12px] border-google-blue border-t-transparent animate-spin absolute" style={{ animationDuration: '5s' }} />
                            <span className="text-[10rem] font-black text-white tabular-nums animate-pulse absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{countdown}</span>
                        </div>
                        <p className="text-white font-black text-4xl mt-12 tracking-widest uppercase">Hold Position</p>
                    </div>
                )}

                {step === 'CAPTURING' && (
                    <div className="flex flex-col items-center gap-6">
                        <div className="w-24 h-24 bg-white rounded-full animate-ping opacity-75" />
                        <h3 className="text-2xl font-bold text-white">Analyzing Geometry...</h3>
                    </div>
                )}

                {step === 'SUCCESS' && (
                    <div className="space-y-8 animate-in zoom-in-95">
                        <div className="w-32 h-32 bg-google-green rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-google-green/40">
                            <CheckCircle2 className="w-16 h-16 text-white" />
                        </div>
                        <h3 className="text-6xl font-black text-white">Baseline Captured</h3>
                        <p className="text-google-green font-black text-2xl tracking-widest uppercase">Calibration Success</p>
                    </div>
                )}
            </div>

            {/* Footer / Cancel */}
            <div className="absolute bottom-12">
                <button
                    onClick={onCancel}
                    className="h-12 flex items-center gap-3 px-8 bg-google-red/10 text-google-red border border-google-red/20 rounded-full text-[10px] font-black hover:bg-google-red/20 active:scale-[0.98] transition-all uppercase tracking-[0.2em]"
                >
                    <X className="w-4 h-4" />
                    Cancel Calibration
                </button>
            </div>
        </div>
    );
}
