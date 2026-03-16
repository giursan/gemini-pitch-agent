import { useEffect, useRef, useState } from 'react';
import type * as cam from '@mediapipe/camera_utils';
import type { FaceMesh as FaceMeshType, Results } from '@mediapipe/face_mesh';
import type { HandResult } from './useGestureRecognizer';
import { LM, angleBetween, PRACTICE_BENCHMARKS, type PostureBaseline } from './useBodyLanguageAnalysis';

/** Raw landmarks exposed each frame for downstream analysis hooks */
export interface BodyLandmarks {
    /** MediaPipe FaceMesh 478 landmarks (includes iris) */
    faceLandmarks: { x: number; y: number; z: number }[] | null;
    /** MediaPipe Pose 33 landmarks */
    poseLandmarks: { x: number; y: number; z: number; visibility?: number }[] | null;
    timestamp: number;
}

// Approximates whether the user is looking at the camera based on iris/pupil positioning relative to eye corners
export function useEyeContact(
    videoRef: any,
    canvasRef?: React.RefObject<HTMLCanvasElement | null>,
    /** When true, processes a <video> element playing a file instead of starting a webcam */
    videoMode: boolean = false,
    features: { eyeContact: boolean; posture: boolean } = { eyeContact: true, posture: true },
    /** Optional ref to hand landmark results from useGestureRecognizer, drawn in the pose pass */
    handResultsRef?: React.RefObject<HandResult[]>,
    /** Optional calibrated baseline to render accurate posture diagnostic colors */
    baseline: PostureBaseline | null = null,
    enabled: boolean = true,
) {
    const [eyeContactScore, setEyeContactScore] = useState<number>(100);
    const faceMeshRef = useRef<FaceMeshType | null>(null);
    const cameraRef = useRef<cam.Camera | null>(null);
    /** Exposed ref holding the latest landmarks for external consumption */
    const landmarksRef = useRef<BodyLandmarks>({ faceLandmarks: null, poseLandmarks: null, timestamp: 0 });

    useEffect(() => {
        // Determine the video element from either a ReactWebcam ref or a raw <video> ref
        const videoElement = videoRef.current?.video || videoRef.current;
        if (!videoElement) return;
        if (typeof window === 'undefined') return;

        // Use dynamic require to avoid Next.js ESM/CJS static analysis errors at build time
        const faceMeshModule = require('@mediapipe/face_mesh');
        const poseModule = require('@mediapipe/pose');
        const cameraUtilsModule = require('@mediapipe/camera_utils');
        const drawingUtilsModule = require('@mediapipe/drawing_utils');

        const FaceMeshConstructor = faceMeshModule.FaceMesh || (window as any).FaceMesh;
        const PoseConstructor = poseModule.Pose || (window as any).Pose;
        const CameraConstructor = cameraUtilsModule.Camera || (window as any).Camera;

        const drawConnectors = drawingUtilsModule.drawConnectors || (window as any).drawConnectors;
        const drawLandmarks = drawingUtilsModule.drawLandmarks || (window as any).drawLandmarks;

        const FACEMESH_TESSELATION = faceMeshModule.FACEMESH_TESSELATION || (window as any).FACEMESH_TESSELATION;
        const FACEMESH_RIGHT_EYE = faceMeshModule.FACEMESH_RIGHT_EYE || (window as any).FACEMESH_RIGHT_EYE;
        const FACEMESH_LEFT_EYE = faceMeshModule.FACEMESH_LEFT_EYE || (window as any).FACEMESH_LEFT_EYE;
        const FACEMESH_RIGHT_IRIS = faceMeshModule.FACEMESH_RIGHT_IRIS || (window as any).FACEMESH_RIGHT_IRIS;
        const FACEMESH_LEFT_IRIS = faceMeshModule.FACEMESH_LEFT_IRIS || (window as any).FACEMESH_LEFT_IRIS;
        const POSE_CONNECTIONS = poseModule.POSE_CONNECTIONS || (window as any).POSE_CONNECTIONS;

        if (!FaceMeshConstructor || !PoseConstructor) {
            console.warn("MediaPipe failed to load on this environment.");
            return;
        }

        // In video mode we don't need Camera utility at all
        if (!videoMode && !CameraConstructor) {
            console.warn("MediaPipe Camera utility failed to load.");
            return;
        }

        // Always initialize both models
        faceMeshRef.current = new FaceMeshConstructor({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMeshRef.current!.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        const poseObj = new PoseConstructor({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });
        poseObj.setOptions({
            modelComplexity: 0, // Lite model is much faster and sufficient for posture
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        const currentPose = poseObj;

        let lastModelProcessTime = 0;
        const MIN_PROCESS_INTERVAL = 66; // Limit to 15 FPS

        let activeCanvasCtx: CanvasRenderingContext2D | null = null;

        // ── Audience cut detection (videoMode only) ────────────────────────
        // Track running average face size to detect camera cuts to audience
        let avgFaceSize = 0;
        let faceSizeCount = 0;
        const FACE_SIZE_TOLERANCE = 0.30; // Skip if face is <30% of average

        const onFaceResults = (results: Results) => {
            if (!enabled) return;
            // --- DRAWING LOGIC ---
            if (canvasRef?.current && videoElement) {
                const canvasCtx = canvasRef.current.getContext('2d');
                activeCanvasCtx = canvasCtx;
                if (canvasCtx) {
                    canvasRef.current.width = videoElement.videoWidth || 640;
                    canvasRef.current.height = videoElement.videoHeight || 480;

                    canvasCtx.save();
                    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

                    if (results.multiFaceLandmarks) {
                        for (const landmarks of results.multiFaceLandmarks) {
                            // Draw the main face mesh (very faint)
                            drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION,
                                { color: '#C0C0C070', lineWidth: 1 });
                            // Highlight the eyes
                            drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYE, { color: '#FF3030' });
                            drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_IRIS, { color: '#FF3030' });
                            drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYE, { color: '#30FF30' });
                            drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_IRIS, { color: '#30FF30' });
                        }
                    }
                }
            }
            // --- END DRAWING LOGIC ---

            // ── Audience cut filtering (videoMode) ─────────────────────────
            if (videoMode && results.multiFaceLandmarks) {
                // Filter 1: Skip frames with != 1 face (audience shots show multiple or zero)
                if (results.multiFaceLandmarks.length !== 1) {
                    // Don't update landmarks — downstream hooks keep last valid sample
                    return;
                }

                // Filter 2: Face size consistency — measure bounding box of face
                const lm = results.multiFaceLandmarks[0];
                const xs = lm.map(p => p.x);
                const ys = lm.map(p => p.y);
                const faceWidth = Math.max(...xs) - Math.min(...xs);
                const faceHeight = Math.max(...ys) - Math.min(...ys);
                const faceSize = faceWidth * faceHeight;

                if (faceSizeCount > 10) {
                    // Face is too small compared to running average → probably audience/wide shot
                    if (faceSize < avgFaceSize * FACE_SIZE_TOLERANCE) {
                        return; // Skip this frame
                    }
                }

                // Update running average (exponential moving average)
                faceSizeCount++;
                avgFaceSize = avgFaceSize === 0
                    ? faceSize
                    : avgFaceSize * 0.95 + faceSize * 0.05;
            }

            // Store face landmarks in ref for downstream analysis
            if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                const landmarks = results.multiFaceLandmarks[0];
                landmarksRef.current = {
                    ...landmarksRef.current,
                    faceLandmarks: landmarks.map(l => ({ x: l.x, y: l.y, z: l.z })),
                    timestamp: performance.now(),
                };

                const leftIris = landmarks[468];
                const leftEyeInner = landmarks[133];
                const leftEyeOuter = landmarks[33];
                const leftEyeTop = landmarks[159];
                const leftEyeBottom = landmarks[145];

                const rightEyeOuter = landmarks[263];
                const nose = landmarks[1];
                const chin = landmarks[152];

                if (leftIris && leftEyeInner && leftEyeOuter && leftEyeTop && leftEyeBottom && nose && chin) {
                    // ── 1. Iris X-Centering (Horizontal) ──
                    const eyeWidth = Math.abs(leftEyeOuter.x - leftEyeInner.x);
                    const irisXOffset = Math.abs(leftIris.x - leftEyeInner.x);
                    const xRatio = irisXOffset / Math.max(eyeWidth, 0.001);
                    
                    // ── 2. Iris Y-Centering (Vertical) ──
                    const eyeHeight = Math.abs(leftEyeBottom.y - leftEyeTop.y);
                    const irisYOffset = Math.abs(leftIris.y - leftEyeTop.y);
                    const yRatio = irisYOffset / Math.max(eyeHeight, 0.001);

                    // ── 3. Head Yaw (Left/Right) ──
                    // Where is the nose relative to the eye corners?
                    const headWidth = Math.abs(rightEyeOuter.x - leftEyeOuter.x);
                    const noseXOffset = Math.abs(nose.x - leftEyeOuter.x);
                    const yawRatio = noseXOffset / Math.max(headWidth, 0.001);

                    // ── 4. Head Pitch (Up/Down) ──
                    const eyeY = (leftEyeOuter.y + rightEyeOuter.y) / 2;
                    const headHeight = Math.abs(chin.y - eyeY);
                    const noseYOffset = Math.abs(nose.y - eyeY);
                    const pitchRatio = noseYOffset / Math.max(headHeight, 0.001);

                    // ── Score Composition ──
                    let irisScore = 100;
                    // Tighter safe zone (0.43 - 0.57)
                    if (xRatio < 0.43 || xRatio > 0.57 || yRatio < 0.43 || yRatio > 0.57) {
                        const xPenalty = Math.abs(0.5 - xRatio) * 400;
                        const yPenalty = Math.abs(0.5 - yRatio) * 400;
                        irisScore = Math.max(0, 100 - (xPenalty + yPenalty));
                    }

                    let headScore = 100;
                    // Expected yawRatio ~0.5, pitchRatio ~0.35-0.45 depending on face
                    if (yawRatio < 0.4 || yawRatio > 0.6 || pitchRatio > 0.5 || pitchRatio < 0.25) {
                        const yawPenalty = Math.abs(0.5 - yawRatio) * 500;
                        const pitchPenalty = Math.abs(0.38 - pitchRatio) * 500;
                        headScore = Math.max(0, 100 - (yawPenalty + pitchPenalty));
                    }

                    const instantScore = (irisScore * 0.4) + (headScore * 0.6);

                    // Asymmetric smoothing: drop fast, recover slow
                    setEyeContactScore(prev => {
                        const weight = instantScore < prev ? 0.4 : 0.1; // 40% update on drop, 10% on recovery
                        return Math.round((prev * (1 - weight)) + (instantScore * weight));
                    });
                }
            } else {
                landmarksRef.current = { ...landmarksRef.current, faceLandmarks: null };
                setEyeContactScore(0);
            }
        };

        const onPoseResults = (results: any) => {
            if (!enabled) return;
            // Store pose landmarks in ref for downstream analysis
            if (results.poseLandmarks) {
                landmarksRef.current = {
                    ...landmarksRef.current,
                    poseLandmarks: results.poseLandmarks.map((l: any) => ({
                        x: l.x, y: l.y, z: l.z, visibility: l.visibility
                    })),
                    timestamp: performance.now(),
                };
            } else {
                landmarksRef.current = { ...landmarksRef.current, poseLandmarks: null };
            }

            if (activeCanvasCtx && results.poseLandmarks) {
                const ctx = activeCanvasCtx;
                const hasHandResults = handResultsRef?.current && handResultsRef.current.length > 0;

                if (hasHandResults) {
                    // Filter out hand/wrist landmarks (15-22) since GestureRecognizer provides detailed hand tracking
                    const HAND_INDICES = new Set([15, 16, 17, 18, 19, 20, 21, 22]);
                    const filteredLandmarks = results.poseLandmarks.map((lm: any, i: number) =>
                        HAND_INDICES.has(i) ? { ...lm, visibility: 0 } : lm
                    );
                    const filteredConnections = POSE_CONNECTIONS.filter(
                        ([a, b]: [number, number]) => !HAND_INDICES.has(a) && !HAND_INDICES.has(b)
                    );
                    drawConnectors(ctx, filteredLandmarks, filteredConnections, { color: '#00FF00', lineWidth: 4 });
                    drawLandmarks(ctx, filteredLandmarks.filter((_: any, i: number) => !HAND_INDICES.has(i)), { color: '#FF0000', lineWidth: 2 });
                } else {
                    drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
                    drawLandmarks(ctx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });
                }

                // ── Draw Posture Angle Analysis ──
                if (results.poseLandmarks && results.poseLandmarks.length >= 25 && canvasRef?.current) {
                    const pose = results.poseLandmarks;
                    const w = canvasRef.current.width;
                    const h = canvasRef.current.height;

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

                    const angle = Math.round(angleBetween(earMid, shoulderMid, hipMid));
                    const targetAngle = baseline ? Math.max(baseline.idealAngle - 15, PRACTICE_BENCHMARKS.slouchAngle - 10) : PRACTICE_BENCHMARKS.slouchAngle;
                    const isGood = angle > targetAngle;

                    // Draw points
                    ctx.fillStyle = isGood ? '#00FF00' : '#FF0000';
                    [earMid, shoulderMid, hipMid].forEach(p => {
                        ctx.beginPath();
                        ctx.arc(p.x * w, p.y * h, 6, 0, 2 * Math.PI);
                        ctx.fill();
                    });

                    // Draw lines for the angle
                    ctx.strokeStyle = isGood ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
                    ctx.lineWidth = 6;
                    ctx.beginPath();
                    ctx.moveTo(earMid.x * w, earMid.y * h);
                    ctx.lineTo(shoulderMid.x * w, shoulderMid.y * h);
                    ctx.lineTo(hipMid.x * w, hipMid.y * h);
                    ctx.stroke();

                    // Draw angle text
                    ctx.fillStyle = 'white';
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 4;
                    ctx.font = 'bold 28px sans-serif';
                    const text = `${angle}°`;
                    const textX = shoulderMid.x * w + 30;
                    const textY = shoulderMid.y * h;
                    ctx.strokeText(text, textX, textY);
                    ctx.fillText(text, textX, textY);

                    // Label "Posture Angle"
                    ctx.font = 'bold 12px sans-serif';
                    ctx.strokeText('POSTURE', textX, textY - 25);
                    ctx.fillText('POSTURE', textX, textY - 25);
                }
            }

            // ── Draw hand skeletons from GestureRecognizer (synchronized) ──
            if (activeCanvasCtx && handResultsRef?.current && handResultsRef.current.length > 0 && canvasRef?.current) {
                const ctx = activeCanvasCtx;
                const w = canvasRef.current.width;
                const h = canvasRef.current.height;
                const HAND_CONNECTIONS: [number, number][] = [
                    [0, 1], [1, 2], [2, 3], [3, 4],
                    [0, 5], [5, 6], [6, 7], [7, 8],
                    [0, 9], [9, 10], [10, 11], [11, 12],
                    [0, 13], [13, 14], [14, 15], [15, 16],
                    [0, 17], [17, 18], [18, 19], [19, 20],
                    [5, 9], [9, 13], [13, 17],
                ];
                for (const hand of handResultsRef.current) {
                    if (!hand.landmarks || hand.landmarks.length < 21) continue;
                    const isCyan = hand.handedness === 'Left';
                    const lineColor = isCyan ? 'rgba(0, 255, 255, 0.8)' : 'rgba(255, 0, 255, 0.8)';
                    const dotColor = isCyan ? 'rgba(0, 255, 255, 1)' : 'rgba(255, 0, 255, 1)';

                    // Draw connections
                    ctx.strokeStyle = lineColor;
                    ctx.lineWidth = 3;
                    for (const [a, b] of HAND_CONNECTIONS) {
                        const la = hand.landmarks[a];
                        const lb = hand.landmarks[b];
                        ctx.beginPath();
                        ctx.moveTo(la.x * w, la.y * h);
                        ctx.lineTo(lb.x * w, lb.y * h);
                        ctx.stroke();
                    }

                    // Draw landmark dots
                    ctx.fillStyle = dotColor;
                    for (const lm of hand.landmarks) {
                        ctx.beginPath();
                        ctx.arc(lm.x * w, lm.y * h, 4, 0, 2 * Math.PI);
                        ctx.fill();
                    }

                    // Brighter fingertip dots
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                    for (const idx of [4, 8, 12, 16, 20]) {
                        const lm = hand.landmarks[idx];
                        ctx.beginPath();
                        ctx.arc(lm.x * w, lm.y * h, 6, 0, 2 * Math.PI);
                        ctx.fill();
                    }

                    // Connect hand wrist to pose elbow (bridge the two skeletons)
                    const elbowIdx = hand.handedness === 'Left' ? 13 : 14;
                    const elbow = results.poseLandmarks?.[elbowIdx];
                    if (elbow && elbow.visibility > 0.5) {
                        const wrist = hand.landmarks[0];
                        ctx.strokeStyle = lineColor;
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.moveTo(elbow.x * w, elbow.y * h);
                        ctx.lineTo(wrist.x * w, wrist.y * h);
                        ctx.stroke();
                    }
                }
            }

            if (activeCanvasCtx) {
                activeCanvasCtx.restore();
            }
        }

        if (faceMeshRef.current) faceMeshRef.current.onResults(onFaceResults);
        if (currentPose) currentPose.onResults(onPoseResults);

        let rafId: number | null = null;
        let isClosed = false;

        if (videoMode) {
            // VIDEO MODE: Use requestAnimationFrame to process frames while video plays
            const processVideoFrame = async () => {
                const now = performance.now();
                if (videoElement && !videoElement.paused && !videoElement.ended && videoElement.readyState >= 2 && !isClosed) {
                    if (now - lastModelProcessTime >= MIN_PROCESS_INTERVAL) {
                        try {
                            lastModelProcessTime = now;
                            if (faceMeshRef.current) await faceMeshRef.current.send({ image: videoElement });
                            if (currentPose) await currentPose.send({ image: videoElement });
                        } catch (e) {
                            // Silently handle frame processing errors
                        }
                    }
                }
                if (!isClosed) rafId = requestAnimationFrame(processVideoFrame);
            };
            // Start the loop — it will idle when video is paused
            rafId = requestAnimationFrame(processVideoFrame);
        } else {
            // LIVE MODE: Use MediaPipe Camera utility (starts getUserMedia)
            cameraRef.current = new CameraConstructor(videoElement, {
                onFrame: async () => {
                    const now = performance.now();
                    if (videoElement && !isClosed) {
                        if (now - lastModelProcessTime >= MIN_PROCESS_INTERVAL) {
                            try {
                                lastModelProcessTime = now;
                                if (faceMeshRef.current) await faceMeshRef.current.send({ image: videoElement });
                                if (currentPose) await currentPose.send({ image: videoElement });
                            } catch (e) {
                                // Silently handle exceptions from closed models
                            }
                        }
                    }
                },
                width: 640,
                height: 480
            });

            cameraRef.current!.start();
        }

        return () => {
            isClosed = true;
            if (rafId !== null) cancelAnimationFrame(rafId);
            cameraRef.current?.stop();
            try { faceMeshRef.current?.close(); } catch (e) { /* ignore Wasm collision abort */ }
            try { currentPose?.close(); } catch (e) { /* ignore Wasm collision abort */ }
        };

    }, [videoRef, canvasRef, videoMode, handResultsRef, enabled]);

    return { eyeContactScore, landmarksRef };
}
