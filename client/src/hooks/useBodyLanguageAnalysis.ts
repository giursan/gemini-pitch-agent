import { useEffect, useRef, useState } from 'react';
import type { BodyLandmarks } from './useEyeContact';

// ─── MediaPipe Pose Landmark IDs ───────────────────────────────────────────────
export const LM = {
    LEFT_EAR: 7,
    RIGHT_EAR: 8,
    LEFT_SHOULDER: 11,
    RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13,
    RIGHT_ELBOW: 14,
    LEFT_WRIST: 15,
    RIGHT_WRIST: 16,
    LEFT_HIP: 23,
    RIGHT_HIP: 24,
} as const;

// ─── FaceMesh Landmark IDs ─────────────────────────────────────────────────────
const FM = {
    MOUTH_LEFT: 61,
    MOUTH_RIGHT: 291,
    LEFT_EYEBROW_UPPER: 105,
    RIGHT_EYEBROW_UPPER: 334,
    NOSE_TIP: 1,
    CHIN: 152,
} as const;

// ─── TED Talk Benchmarks ───────────────────────────────────────────────────────
export const TED_BENCHMARKS = {
    /** Top TED speakers: ~26 gestures/min (465 in 18 min) */
    gesturesPerMin: 26,
    /** Ideal eye contact when speaking: 50-70% */
    eyeContactPct: 0.65,
    /** Upright posture angle (ear→shoulder→hip) in degrees */
    idealPostureAngle: 165,
    /** Slouch threshold */
    slouchAngle: 145,
    /** Hand visibility: top speakers show hands >80% of time */
    handVisibilityPct: 0.80,
    /** Smile benchmark (relative width, normalized) */
    smileWidth: 0.35,
};

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface PostureBaseline {
    neckRatio: number;      // Chin→Shoulder / Shoulder→Hip
    breadthRatio: number;   // ShoulderWidth / Shoulder→Hip
    idealAngle: number;
}

export interface BodyLanguageMetrics {
    // Posture
    postureAngle: number;       // Current ear→shoulder→hip angle (degrees)
    isGoodPosture: boolean;     // >slouchAngle threshold
    shoulderSymmetry: number;   // 0–1 (1 = perfectly level)
    bodyStability: number;      // 0–1 (1 = perfectly still)

    // Shrimp Indicators (0-1, where 1 is perfect/baseline)
    neckStability: number;      // Current neck ratio relative to baseline
    shoulderExpansion: number;  // Current breadth ratio relative to baseline

    // Raw live values
    currentNeckRatio: number;      // Raw live Chin→Shoulder / Shoulder→Hip
    currentBreadthRatio: number;   // Raw live ShoulderWidth / Shoulder→Hip


    // Gestures
    gesturesPerMin: number;     // Estimated from wrist velocity spikes in sliding window
    handVisibility: number;     // 0–1 fraction of time hands are visible

    // Face
    smileScore: number;         // 0–1 current smile intensity
    expressiveness: number;     // 0–1 facial animation level

    // Composite
    overallScore: number;       // 0–100 weighted composite
}

const DEFAULT_METRICS: BodyLanguageMetrics = {
    postureAngle: 170,
    isGoodPosture: true,
    shoulderSymmetry: 1,
    bodyStability: 1,
    neckStability: 1,
    shoulderExpansion: 1,
    currentNeckRatio: 0,
    currentBreadthRatio: 0,
    gesturesPerMin: 0,
    handVisibility: 1,
    smileScore: 0,
    expressiveness: 0,
    overallScore: 50,
};

// ─── Utility: angle between 3 points (in degrees) ─────────────────────────────
export function angleBetween(
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number }
): number {
    const ba = { x: a.x - b.x, y: a.y - b.y };
    const bc = { x: c.x - b.x, y: c.y - b.y };
    const dot = ba.x * bc.x + ba.y * bc.y;
    const magBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y);
    const magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y);
    if (magBA === 0 || magBC === 0) return 180;
    const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
    return (Math.acos(cosAngle) * 180) / Math.PI;
}

// ─── Utility: Euclidean distance ──────────────────────────────────────────────
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ─── Sliding window buffer ─────────────────────────────────────────────────────
const WINDOW_SIZE_MS = 5000; // 5 second sliding window

interface FrameSample {
    timestamp: number;
    hipCenter: { x: number; y: number };
    leftWrist: { x: number; y: number };
    rightWrist: { x: number; y: number };
    smileWidth: number;
    eyebrowHeight: number;
}

/**
 * Consumes the landmarksRef from useEyeContact and calculates real-time
 * body language metrics using a sliding window approach.
 */
export function useBodyLanguageAnalysis(
    landmarksRef: React.RefObject<BodyLandmarks>,
    enabled: boolean = true,
    baseline: PostureBaseline | null = null
) {
    const [metrics, setMetrics] = useState<BodyLanguageMetrics>(DEFAULT_METRICS);
    const samplesRef = useRef<FrameSample[]>([]);
    const gestureCountRef = useRef(0);
    const lastWristPosRef = useRef<{ left: { x: number; y: number }; right: { x: number; y: number } } | null>(null);
    const handVisibleCountRef = useRef(0);
    const totalFrameCountRef = useRef(0);

    useEffect(() => {
        if (!enabled) return;

        const GESTURE_VELOCITY_THRESHOLD = 0.03; // Normalized coordinate units per frame

        const interval = setInterval(() => {
            const lm = landmarksRef.current;
            if (!lm) return;

            const now = performance.now();
            const pose = lm.poseLandmarks;
            const face = lm.faceLandmarks;

            // ── Posture metrics (from Pose) ────────────────────────────────
            let postureAngle = 170;
            let shoulderSymmetry = 1;
            let hipCenter = { x: 0.5, y: 0.5 };

            if (pose && pose.length >= 25) {
                // Average left+right for robustness
                const earMid = {
                    x: (pose[LM.LEFT_EAR].x + pose[LM.RIGHT_EAR].x) / 2,
                    y: (pose[LM.LEFT_EAR].y + pose[LM.RIGHT_EAR].y) / 2,
                };
                const shoulderMid = {
                    x: (pose[LM.LEFT_SHOULDER].x + pose[LM.RIGHT_SHOULDER].x) / 2,
                    y: (pose[LM.LEFT_SHOULDER].y + pose[LM.RIGHT_SHOULDER].y) / 2,
                };
                const hipMidCalc = {
                    x: (pose[LM.LEFT_HIP].x + pose[LM.RIGHT_HIP].x) / 2,
                    y: (pose[LM.LEFT_HIP].y + pose[LM.RIGHT_HIP].y) / 2,
                };
                hipCenter = hipMidCalc;

                // Slouch angle: ear → shoulder → hip
                postureAngle = angleBetween(earMid, shoulderMid, hipMidCalc);

                // Shoulder symmetry: 1 = level, 0 = very tilted
                const shoulderYDiff = Math.abs(pose[LM.LEFT_SHOULDER].y - pose[LM.RIGHT_SHOULDER].y);
                const shoulderWidth = Math.abs(pose[LM.LEFT_SHOULDER].x - pose[LM.RIGHT_SHOULDER].x);
                shoulderSymmetry = Math.max(0, 1 - (shoulderYDiff / Math.max(shoulderWidth, 0.01)) * 2);

                // ── Shrimp Proxies ───────────────────────────────────────
                let neckStability = 1;
                let shoulderExpansion = 1;

                const trunkHeightCalc = dist(shoulderMid, hipMidCalc);
                const currentShoulderWidth = dist(pose[LM.LEFT_SHOULDER], pose[LM.RIGHT_SHOULDER]);
                const currentBreadthRatio = currentShoulderWidth / Math.max(trunkHeightCalc, 0.01);

                if (baseline) {
                    shoulderExpansion = Math.min(1.2, currentBreadthRatio / baseline.breadthRatio);
                }

                setMetrics(prev => ({
                    ...prev,
                    currentBreadthRatio,
                }));

                // ── Gesture detection (wrist velocity spikes) ──────────────
                const leftWrist = { x: pose[LM.LEFT_WRIST].x, y: pose[LM.LEFT_WRIST].y };
                const rightWrist = { x: pose[LM.RIGHT_WRIST].x, y: pose[LM.RIGHT_WRIST].y };

                // Hand visibility
                totalFrameCountRef.current++;
                const leftVis = pose[LM.LEFT_WRIST].visibility ?? 0;
                const rightVis = pose[LM.RIGHT_WRIST].visibility ?? 0;
                if (leftVis > 0.5 || rightVis > 0.5) {
                    handVisibleCountRef.current++;
                }

                if (lastWristPosRef.current) {
                    const leftVelocity = dist(leftWrist, lastWristPosRef.current.left);
                    const rightVelocity = dist(rightWrist, lastWristPosRef.current.right);
                    if (leftVelocity > GESTURE_VELOCITY_THRESHOLD || rightVelocity > GESTURE_VELOCITY_THRESHOLD) {
                        gestureCountRef.current++;
                    }
                }
                lastWristPosRef.current = { left: leftWrist, right: rightWrist };

                // Save sample for sliding window
                samplesRef.current.push({
                    timestamp: now,
                    hipCenter,
                    leftWrist,
                    rightWrist,
                    smileWidth: 0,
                    eyebrowHeight: 0,
                });
            }

            // ── Face metrics (from FaceMesh) ───────────────────────────────
            let smileScore = 0;
            let expressiveness = 0;

            if (face && face.length > 335) {
                const mouthLeft = face[FM.MOUTH_LEFT];
                const mouthRight = face[FM.MOUTH_RIGHT];
                const noseTip = face[FM.NOSE_TIP];
                const chin = face[FM.CHIN];

                // Face height for normalization
                const faceHeight = dist(noseTip, chin);

                // Smile: mouth width relative to face height
                const mouthWidth = dist(mouthLeft, mouthRight);
                smileScore = Math.min(1, (mouthWidth / Math.max(faceHeight, 0.01)) / 1.8);

                // Expressiveness: variance in eyebrow height over last samples
                const leftBrow = face[FM.LEFT_EYEBROW_UPPER];
                const rightBrow = face[FM.RIGHT_EYEBROW_UPPER];
                const browHeight = ((noseTip.y - leftBrow.y) + (noseTip.y - rightBrow.y)) / 2;

                // Neck ratio: Chin→Shoulder / Shoulder→Hip
                if (pose && pose.length >= 25) {
                    const shoulderMid = {
                        x: (pose[LM.LEFT_SHOULDER].x + pose[LM.RIGHT_SHOULDER].x) / 2,
                        y: (pose[LM.LEFT_SHOULDER].y + pose[LM.RIGHT_SHOULDER].y) / 2,
                    };
                    const hipMid = {
                        x: (pose[LM.LEFT_HIP].x + pose[LM.RIGHT_HIP].x) / 2,
                        y: (pose[LM.LEFT_HIP].y + pose[LM.RIGHT_HIP].y) / 2,
                    };
                    const trunkHeight = dist(shoulderMid, hipMid);
                    const neckLen = dist(chin, shoulderMid);
                    const currentNeckRatio = neckLen / Math.max(trunkHeight, 0.01);
                    setMetrics(prev => ({
                        ...prev,
                        currentNeckRatio,
                        neckStability: baseline ? Math.min(1.2, currentNeckRatio / baseline.neckRatio) : 1
                    }));
                }

                // Update last sample with face data
                if (samplesRef.current.length > 0) {
                    const lastSample = samplesRef.current[samplesRef.current.length - 1];
                    lastSample.smileWidth = mouthWidth;
                    lastSample.eyebrowHeight = browHeight;
                }

                // Calculate expressiveness from variance in recent samples
                const recentSamples = samplesRef.current.filter(s => now - s.timestamp < WINDOW_SIZE_MS);
                if (recentSamples.length > 5) {
                    const heights = recentSamples.map(s => s.eyebrowHeight);
                    const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
                    const variance = heights.reduce((a, b) => a + (b - mean) ** 2, 0) / heights.length;
                    expressiveness = Math.min(1, Math.sqrt(variance) * 50); // Scale to 0-1
                }
            }

            // ── Sliding window calculations ────────────────────────────────
            // Prune old samples
            samplesRef.current = samplesRef.current.filter(s => now - s.timestamp < WINDOW_SIZE_MS);
            const windowSamples = samplesRef.current;

            // Body stability: inverse of hip center variance
            let bodyStability = 1;
            if (windowSamples.length > 3) {
                const xs = windowSamples.map(s => s.hipCenter.x);
                const ys = windowSamples.map(s => s.hipCenter.y);
                const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
                const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
                const varX = xs.reduce((a, b) => a + (b - meanX) ** 2, 0) / xs.length;
                const varY = ys.reduce((a, b) => a + (b - meanY) ** 2, 0) / ys.length;
                const totalVar = Math.sqrt(varX + varY);
                bodyStability = Math.max(0, 1 - totalVar * 20); // Scale: small movement is okay
            }

            // Gestures per minute estimation (from sliding window)
            const windowDurationMin = WINDOW_SIZE_MS / 60000;
            // We count gesture "spikes" - but they come in bursts, so we need to debounce
            // Use a simple approach: count velocity spikes in the window
            let gestureSpikes = 0;
            let lastSpikeTime = 0;
            for (let i = 1; i < windowSamples.length; i++) {
                const prevS = windowSamples[i - 1];
                const currS = windowSamples[i];
                const lv = dist(currS.leftWrist, prevS.leftWrist);
                const rv = dist(currS.rightWrist, prevS.rightWrist);
                if ((lv > GESTURE_VELOCITY_THRESHOLD || rv > GESTURE_VELOCITY_THRESHOLD)
                    && (currS.timestamp - lastSpikeTime > 300)) { // Debounce: 300ms between gestures
                    gestureSpikes++;
                    lastSpikeTime = currS.timestamp;
                }
            }
            const gesturesPerMin = windowDurationMin > 0 ? gestureSpikes / windowDurationMin : 0;

            // Hand visibility
            const handVisibility = totalFrameCountRef.current > 0
                ? handVisibleCountRef.current / totalFrameCountRef.current
                : 1;

            const targetAngle = baseline ? Math.max(baseline.idealAngle - 15, TED_BENCHMARKS.slouchAngle - 10) : TED_BENCHMARKS.slouchAngle;
            const isGoodPosture = postureAngle > targetAngle;

            // ── Composite score (0–100) ────────────────────────────────────
            const postureScore = Math.min(1, postureAngle / TED_BENCHMARKS.idealPostureAngle);
            const gestureScore = Math.min(1, gesturesPerMin / TED_BENCHMARKS.gesturesPerMin);
            const handVisScore = Math.min(1, handVisibility / TED_BENCHMARKS.handVisibilityPct);

            const overallScore = Math.round(
                (postureScore * 25 +
                    shoulderSymmetry * 10 +
                    bodyStability * 15 +
                    gestureScore * 20 +
                    handVisScore * 10 +
                    smileScore * 10 +
                    expressiveness * 10)
            );

            setMetrics(prev => ({
                ...prev,
                postureAngle: Math.round(postureAngle),
                isGoodPosture,
                shoulderSymmetry: Math.round(shoulderSymmetry * 100) / 100,
                bodyStability: Math.round(bodyStability * 100) / 100,
                gesturesPerMin: Math.round(gesturesPerMin),
                handVisibility: Math.round(handVisibility * 100) / 100,
                smileScore: Math.round(smileScore * 100) / 100,
                expressiveness: Math.round(expressiveness * 100) / 100,
                overallScore: Math.min(100, Math.max(0, overallScore)),
            }));
        }, 100); // Sample at 10Hz (every 100ms)

        return () => clearInterval(interval);
    }, [landmarksRef, enabled]);

    // Reset counters when disabled
    useEffect(() => {
        if (!enabled) {
            samplesRef.current = [];
            gestureCountRef.current = 0;
            lastWristPosRef.current = null;
            handVisibleCountRef.current = 0;
            totalFrameCountRef.current = 0;
            setMetrics(DEFAULT_METRICS);
        }
    }, [enabled]);

    return { metrics, benchmarks: TED_BENCHMARKS };
}
