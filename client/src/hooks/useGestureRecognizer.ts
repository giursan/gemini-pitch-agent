import { useEffect, useRef, useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface GestureResult {
    /** Detected gesture name (e.g., "Open_Palm", "Closed_Fist", "Pointing_Up", "Thumb_Up") */
    gesture: string;
    /** Confidence score 0–1 */
    confidence: number;
    /** Which hand: "Left" | "Right" */
    handedness: string;
}

export interface GestureMetrics {
    /** Current detected gestures (one per hand, max 2) */
    currentGestures: GestureResult[];
    /** Running counts of each gesture type seen */
    gestureCounts: Record<string, number>;
    /** Time-weighted percentage of "open" gestures (Open_Palm, Victory, ILoveYou) */
    openGestureRatio: number;
    /** Time-weighted percentage of "closed/nervous" gestures (Closed_Fist, None) */
    closedGestureRatio: number;
    /** Whether the model is loaded and ready */
    isReady: boolean;
}

const DEFAULT_METRICS: GestureMetrics = {
    currentGestures: [],
    gestureCounts: {},
    openGestureRatio: 0,
    closedGestureRatio: 0,
    isReady: false,
};

// Categorize gestures into "open" (confident) vs "closed" (nervous/defensive)
const OPEN_GESTURES = new Set(['Open_Palm', 'Victory', 'ILoveYou', 'Thumb_Up', 'Pointing_Up']);
const CLOSED_GESTURES = new Set(['Closed_Fist', 'Thumb_Down']);

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

/**
 * Uses MediaPipe's pre-trained Gesture Recognizer to classify hand gestures
 * in real-time from a video element.
 */
export function useGestureRecognizer(
    videoRef: React.RefObject<HTMLVideoElement | null>,
    enabled: boolean = true,
) {
    const [metrics, setMetrics] = useState<GestureMetrics>(DEFAULT_METRICS);
    const recognizerRef = useRef<any>(null);
    const rafRef = useRef<number | null>(null);
    const countsRef = useRef<Record<string, number>>({});
    const totalFramesRef = useRef(0);
    const openFramesRef = useRef(0);
    const closedFramesRef = useRef(0);

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return;

        let cancelled = false;

        const init = async () => {
            try {
                // Stagger initialization to avoid Emscripten Wasm concurrent load crashes
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Hack to prevent Emscripten from colliding between legacy MediaPipe and tasks-vision Wasms
                const _window = window as any;
                const _tempModule = _window.Module;
                _window.Module = undefined;

                // Dynamic import to avoid SSR issues
                const vision = await import('@mediapipe/tasks-vision');
                const { GestureRecognizer, FilesetResolver } = vision;

                const filesetResolver = await FilesetResolver.forVisionTasks(WASM_URL);

                const recognizer = await GestureRecognizer.createFromOptions(filesetResolver, {
                    baseOptions: {
                        modelAssetPath: MODEL_URL,
                        delegate: 'CPU',
                    },
                    runningMode: 'VIDEO',
                    numHands: 2,
                });

                // Restore legacy Module reference
                _window.Module = _tempModule;

                if (cancelled) {
                    try { recognizer.close(); } catch (e) { /* ignore Wasm collision abort */ }
                    return;
                }

                recognizerRef.current = recognizer;
                setMetrics(prev => ({ ...prev, isReady: true }));

                // Start processing frames
                const processFrame = () => {
                    if (cancelled) return;

                    const video = videoRef.current;
                    if (video && !video.paused && !video.ended && video.readyState >= 2 && recognizerRef.current) {
                        try {
                            const result = recognizerRef.current.recognizeForVideo(video, performance.now());

                            const gestures: GestureResult[] = [];
                            let hasOpen = false;
                            let hasClosed = false;

                            if (result.gestures && result.gestures.length > 0) {
                                for (let i = 0; i < result.gestures.length; i++) {
                                    const gestureList = result.gestures[i];
                                    const handedness = result.handednesses?.[i]?.[0]?.categoryName || 'Unknown';

                                    if (gestureList.length > 0) {
                                        const top = gestureList[0];
                                        const name = top.categoryName || 'None';
                                        const confidence = top.score || 0;

                                        gestures.push({ gesture: name, confidence, handedness });

                                        // Update counts
                                        countsRef.current[name] = (countsRef.current[name] || 0) + 1;

                                        if (OPEN_GESTURES.has(name)) hasOpen = true;
                                        if (CLOSED_GESTURES.has(name)) hasClosed = true;
                                    }
                                }
                            }

                            // Track open/closed ratios
                            totalFramesRef.current++;
                            if (hasOpen) openFramesRef.current++;
                            if (hasClosed) closedFramesRef.current++;

                            const total = totalFramesRef.current || 1;
                            setMetrics({
                                currentGestures: gestures,
                                gestureCounts: { ...countsRef.current },
                                openGestureRatio: Math.round((openFramesRef.current / total) * 100) / 100,
                                closedGestureRatio: Math.round((closedFramesRef.current / total) * 100) / 100,
                                isReady: true,
                            });
                        } catch (e) {
                            // Frame processing error — skip silently
                        }
                    }

                    rafRef.current = requestAnimationFrame(processFrame);
                };

                rafRef.current = requestAnimationFrame(processFrame);

            } catch (e) {
                console.error('Failed to initialize GestureRecognizer:', e);
            }
        };

        init();

        return () => {
            cancelled = true;
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            try { recognizerRef.current?.close(); } catch (e) { /* ignore abort */ }
            recognizerRef.current = null;
        };
    }, [videoRef, enabled]);

    // Reset on disable
    useEffect(() => {
        if (!enabled) {
            countsRef.current = {};
            totalFramesRef.current = 0;
            openFramesRef.current = 0;
            closedFramesRef.current = 0;
            setMetrics(DEFAULT_METRICS);
        }
    }, [enabled]);

    return metrics;
}
