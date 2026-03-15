import { useEffect, useRef, useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface HandLandmark {
    x: number;
    y: number;
    z: number;
}

export interface HandResult {
    landmarks: HandLandmark[];
    worldLandmarks: HandLandmark[];
    gesture: string;
    confidence: number;
    handedness: string;
}

export interface GestureResult {
    gesture: string;
    confidence: number;
    handedness: string;
}

export interface GestureMetrics {
    currentGestures: GestureResult[];
    handResults: HandResult[];
    handsDetected: number;
    gestureCounts: Record<string, number>;
    openGestureRatio: number;
    closedGestureRatio: number;
    isReady: boolean;
}

const DEFAULT_METRICS: GestureMetrics = {
    currentGestures: [],
    handResults: [],
    handsDetected: 0,
    gestureCounts: {},
    openGestureRatio: 0,
    closedGestureRatio: 0,
    isReady: false,
};

const OPEN_GESTURES = new Set(['Open_Palm', 'Victory', 'ILoveYou', 'Thumb_Up', 'Pointing_Up']);
const CLOSED_GESTURES = new Set(['Closed_Fist', 'Thumb_Down']);

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

export function useGestureRecognizer(
    videoRef: React.RefObject<HTMLVideoElement | null>,
    enabled: boolean = true,
) {
    const [metrics, setMetrics] = useState<GestureMetrics>(DEFAULT_METRICS);
    const handResultsRef = useRef<HandResult[]>([]);
    const recognizerRef = useRef<any>(null);
    const rafRef = useRef<number | null>(null);
    const lastTimestampRef = useRef<number>(0);
    const countsRef = useRef<Record<string, number>>({});
    const totalFramesRef = useRef(0);
    const openFramesRef = useRef(0);
    const closedFramesRef = useRef(0);
    const isProcessingRef = useRef(false);
    const consecutiveErrorsRef = useRef(0);
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return;

        let cancelled = false;

        const suppressWasmError = (event: ErrorEvent) => {
            const msg = event.message || '';
            const stack = event.error?.stack || '';
            const isMediaPipeWasm =
                msg.includes('TensorFlow Lite') ||
                msg.includes('XNNPACK') ||
                msg.includes('finishProcessing') ||
                stack.includes('vision_bundle') ||
                stack.includes('recognizeForVideo');
            if (isMediaPipeWasm) {
                event.preventDefault();
                event.stopImmediatePropagation();
                return true;
            }
        };
        window.addEventListener('error', suppressWasmError, true);

        const init = async () => {
            try {
                // Stagger initialization to avoid Emscripten Wasm concurrent load crashes
                await new Promise(resolve => setTimeout(resolve, 2000));

                const _window = window as any;
                const _tempModule = _window.Module;
                _window.Module = undefined;

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

                _window.Module = _tempModule;

                if (cancelled) {
                    try { recognizer.close(); } catch (e) { /* ignore */ }
                    return;
                }

                recognizerRef.current = recognizer;
                consecutiveErrorsRef.current = 0;
                setMetrics(prev => ({ ...prev, isReady: true }));

                offscreenCanvasRef.current = document.createElement('canvas');

                let lastProcessTime = 0;
                const FRAME_INTERVAL_MS = 0;
                const MAX_CONSECUTIVE_ERRORS = 5;
                const ERROR_BACKOFF_MS = 2000;

                const processFrame = () => {
                    if (cancelled) return;

                    const now = performance.now();

                    if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
                        if (now - lastProcessTime < ERROR_BACKOFF_MS) {
                            rafRef.current = requestAnimationFrame(processFrame);
                            return;
                        }
                        consecutiveErrorsRef.current = 0;
                    }

                    if (now - lastProcessTime < FRAME_INTERVAL_MS) {
                        rafRef.current = requestAnimationFrame(processFrame);
                        return;
                    }

                    if (isProcessingRef.current) {
                        rafRef.current = requestAnimationFrame(processFrame);
                        return;
                    }

                    lastProcessTime = now;

                    const video = videoRef.current;
                    if (video && !video.paused && !video.ended && video.readyState >= 2 && recognizerRef.current) {
                        const ts = Math.round(now);
                        if (ts <= lastTimestampRef.current) {
                            rafRef.current = requestAnimationFrame(processFrame);
                            return;
                        }

                        isProcessingRef.current = true;
                        try {
                            const osc = offscreenCanvasRef.current!;

                            // Always use canvas for stability on Mac/Chrome
                            const vw = video.videoWidth || 640;
                            const vh = video.videoHeight || 480;
                            if (vw === 0 || vh === 0) {
                                isProcessingRef.current = false;
                                rafRef.current = requestAnimationFrame(processFrame);
                                return;
                            }

                            if (osc.width !== vw) osc.width = vw;
                            if (osc.height !== vh) osc.height = vh;
                            const ctx = osc.getContext('2d', { alpha: false })!;
                            ctx.drawImage(video, 0, 0, vw, vh);

                            const result = recognizerRef.current.recognizeForVideo(osc, ts);
                            lastTimestampRef.current = ts;
                            consecutiveErrorsRef.current = 0;

                            const gestures: GestureResult[] = [];
                            const handResults: HandResult[] = [];
                            let hasOpen = false;
                            let hasClosed = false;

                            if (result.gestures && result.gestures.length > 0) {
                                for (let i = 0; i < result.gestures.length; i++) {
                                    const gestureList = result.gestures[i];
                                    const handedness = result.handednesses?.[i]?.[0]?.categoryName || 'Unknown';

                                    const landmarks: HandLandmark[] = result.landmarks?.[i]?.map((lm: any) => ({
                                        x: lm.x, y: lm.y, z: lm.z,
                                    })) || [];

                                    const worldLandmarks: HandLandmark[] = result.worldLandmarks?.[i]?.map((lm: any) => ({
                                        x: lm.x, y: lm.y, z: lm.z,
                                    })) || [];

                                    if (gestureList.length > 0) {
                                        const top = gestureList[0];
                                        const name = top.categoryName || 'None';
                                        const confidence = top.score || 0;

                                        gestures.push({ gesture: name, confidence, handedness });
                                        handResults.push({
                                            landmarks,
                                            worldLandmarks,
                                            gesture: name,
                                            confidence,
                                            handedness,
                                        });

                                        countsRef.current[name] = (countsRef.current[name] || 0) + 1;
                                        if (OPEN_GESTURES.has(name)) hasOpen = true;
                                        if (CLOSED_GESTURES.has(name)) hasClosed = true;
                                    }
                                }
                            }

                            handResultsRef.current = handResults;
                            totalFramesRef.current++;
                            if (hasOpen) openFramesRef.current++;
                            if (hasClosed) closedFramesRef.current++;

                            const total = totalFramesRef.current || 1;
                            setMetrics({
                                currentGestures: gestures,
                                handResults,
                                handsDetected: handResults.length,
                                gestureCounts: { ...countsRef.current },
                                openGestureRatio: Math.round((openFramesRef.current / total) * 100) / 100,
                                closedGestureRatio: Math.round((closedFramesRef.current / total) * 100) / 100,
                                isReady: true,
                            });
                        } catch (e) {
                            consecutiveErrorsRef.current++;
                        } finally {
                            isProcessingRef.current = false;
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
            window.removeEventListener('error', suppressWasmError, true);
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            try { recognizerRef.current?.close(); } catch (e) { /* ignore */ }
            recognizerRef.current = null;
        };
    }, [videoRef, enabled]);

    useEffect(() => {
        if (!enabled) {
            countsRef.current = {};
            totalFramesRef.current = 0;
            openFramesRef.current = 0;
            closedFramesRef.current = 0;
            setMetrics(DEFAULT_METRICS);
            handResultsRef.current = [];
        }
    }, [enabled]);

    return { metrics, handResultsRef };
}
