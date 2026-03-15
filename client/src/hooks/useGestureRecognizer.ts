import { useEffect, useRef, useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

/** A single 3D landmark point */
export interface HandLandmark {
    x: number;
    y: number;
    z: number;
}

/** Full per-hand result including landmarks, gesture classification, and handedness */
export interface HandResult {
    /** 21 normalized image-space landmarks (x,y in [0,1], z relative depth) */
    landmarks: HandLandmark[];
    /** 21 world-space landmarks (x,y,z in meters, origin at hand center) */
    worldLandmarks: HandLandmark[];
    /** Detected gesture name (e.g., "Open_Palm", "Closed_Fist", "Pointing_Up") */
    gesture: string;
    /** Gesture confidence score 0–1 */
    confidence: number;
    /** Which hand: "Left" | "Right" */
    handedness: string;
}

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
    /** Full per-hand results with 21 landmarks each */
    handResults: HandResult[];
    /** Number of hands currently detected (0, 1, or 2) */
    handsDetected: number;
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
    handResults: [],
    handsDetected: 0,
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
 * and detect 21 hand landmarks per hand in real-time from a video element.
 *
 * Hand skeleton drawing is handled externally by useEyeContact via the
 * shared handResultsRef, so drawing stays synchronized with face/pose overlays.
 */
export function useGestureRecognizer(
    videoRef: React.RefObject<HTMLVideoElement | null>,
    enabled: boolean = true,
) {
    const [metrics, setMetrics] = useState<GestureMetrics>(DEFAULT_METRICS);
    /** Ref holding the latest hand results — readable by external drawing hooks */
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
    /** Offscreen canvas to capture video frames at correct dimensions */
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return;

        let cancelled = false;

        // ── Global error interceptor ────────────────────────────────────
        const suppressWasmError = (event: ErrorEvent) => {
            const msg = event.message || '';
            const stack = event.error?.stack || '';
            const isMediaPipeWasm =
                msg.includes('TensorFlow Lite') ||
                msg.includes('XNNPACK') ||
                msg.includes('finishProcessing') ||
                stack.includes('vision_bundle') ||
                stack.includes('finishProcessing') ||
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

                // Create offscreen canvas for correct-dimension frame capture
                offscreenCanvasRef.current = document.createElement('canvas');

                let lastProcessTime = 0;
                const FRAME_INTERVAL_MS = 0; // Process every frame for lowest latency
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
                            lastTimestampRef.current = ts;

                            // Draw video onto offscreen canvas at correct raw dimensions
                            // This ensures recognizeForVideo sees the correct pixel resolution
                            // for coordinate normalization (video.width/height attrs may be 0)
                            const osc = offscreenCanvasRef.current!;
                            const vw = video.videoWidth || 640;
                            const vh = video.videoHeight || 480;
                            if (osc.width !== vw) osc.width = vw;
                            if (osc.height !== vh) osc.height = vh;
                            const ctx = osc.getContext('2d')!;
                            ctx.drawImage(video, 0, 0, vw, vh);

                            const result = recognizerRef.current.recognizeForVideo(osc, ts);
                            consecutiveErrorsRef.current = 0;

                            const gestures: GestureResult[] = [];
                            const handResults: HandResult[] = [];
                            let hasOpen = false;
                            let hasClosed = false;

                            if (result.gestures && result.gestures.length > 0) {
                                for (let i = 0; i < result.gestures.length; i++) {
                                    const gestureList = result.gestures[i];
                                    const handedness = result.handednesses?.[i]?.[0]?.categoryName || 'Unknown';

                                    // Extract 21 landmarks for this hand
                                    const landmarks: HandLandmark[] = result.landmarks?.[i]?.map((lm: any) => ({
                                        x: lm.x,
                                        y: lm.y,
                                        z: lm.z,
                                    })) || [];

                                    const worldLandmarks: HandLandmark[] = result.worldLandmarks?.[i]?.map((lm: any) => ({
                                        x: lm.x,
                                        y: lm.y,
                                        z: lm.z,
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

                            // Update the shared ref so external hooks (useEyeContact) can draw
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
                            if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
                                console.warn(`[GestureRecognizer] ${MAX_CONSECUTIVE_ERRORS} consecutive Wasm errors — backing off for ${ERROR_BACKOFF_MS}ms`);
                            }
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
            handResultsRef.current = [];
        }
    }, [enabled]);

    return { metrics, handResultsRef };
}
