import { useEffect, useRef, useState } from 'react';
import type * as cam from '@mediapipe/camera_utils';
import type { FaceMesh as FaceMeshType, Results } from '@mediapipe/face_mesh';
import type { HandResult } from './useGestureRecognizer';

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
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        const currentPose = poseObj;

        let activeCanvasCtx: CanvasRenderingContext2D | null = null;

        // ── Audience cut detection (videoMode only) ────────────────────────
        // Track running average face size to detect camera cuts to audience
        let avgFaceSize = 0;
        let faceSizeCount = 0;
        const FACE_SIZE_TOLERANCE = 0.30; // Skip if face is <30% of average

        const onFaceResults = (results: Results) => {
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
                const rightIris = landmarks[473];

                const leftEyeInner = landmarks[133];
                const leftEyeOuter = landmarks[33];

                if (leftIris && leftEyeInner && leftEyeOuter) {
                    const eyeWidth = Math.abs(leftEyeOuter.x - leftEyeInner.x);
                    const irisOffset = Math.abs(leftIris.x - leftEyeInner.x);
                    const ratio = irisOffset / eyeWidth;

                    let score = 100;
                    if (ratio < 0.35 || ratio > 0.65) {
                        score = Math.max(0, 100 - (Math.abs(0.5 - ratio) * 200));
                    }

                    setEyeContactScore(prev => Math.round((prev * 0.8) + (score * 0.2)));
                }
            } else {
                landmarksRef.current = { ...landmarksRef.current, faceLandmarks: null };
                setEyeContactScore(0);
            }
        };

        const onPoseResults = (results: any) => {
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
                    drawConnectors(activeCanvasCtx, filteredLandmarks, filteredConnections, { color: '#00FF00', lineWidth: 4 });
                    drawLandmarks(activeCanvasCtx, filteredLandmarks.filter((_: any, i: number) => !HAND_INDICES.has(i)), { color: '#FF0000', lineWidth: 2 });
                } else {
                    drawConnectors(activeCanvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
                    drawLandmarks(activeCanvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });
                }
            }

            // ── Draw hand skeletons from GestureRecognizer (synchronized) ──
            if (activeCanvasCtx && handResultsRef?.current && handResultsRef.current.length > 0 && canvasRef?.current) {
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
                    activeCanvasCtx.strokeStyle = lineColor;
                    activeCanvasCtx.lineWidth = 3;
                    for (const [a, b] of HAND_CONNECTIONS) {
                        const la = hand.landmarks[a];
                        const lb = hand.landmarks[b];
                        activeCanvasCtx.beginPath();
                        activeCanvasCtx.moveTo(la.x * w, la.y * h);
                        activeCanvasCtx.lineTo(lb.x * w, lb.y * h);
                        activeCanvasCtx.stroke();
                    }

                    // Draw landmark dots
                    activeCanvasCtx.fillStyle = dotColor;
                    for (const lm of hand.landmarks) {
                        activeCanvasCtx.beginPath();
                        activeCanvasCtx.arc(lm.x * w, lm.y * h, 4, 0, 2 * Math.PI);
                        activeCanvasCtx.fill();
                    }

                    // Brighter fingertip dots
                    activeCanvasCtx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                    for (const idx of [4, 8, 12, 16, 20]) {
                        const lm = hand.landmarks[idx];
                        activeCanvasCtx.beginPath();
                        activeCanvasCtx.arc(lm.x * w, lm.y * h, 6, 0, 2 * Math.PI);
                        activeCanvasCtx.fill();
                    }

                    // Connect hand wrist to pose elbow (bridge the two skeletons)
                    const elbowIdx = hand.handedness === 'Left' ? 13 : 14;
                    const elbow = results.poseLandmarks?.[elbowIdx];
                    if (elbow && elbow.visibility > 0.5) {
                        const wrist = hand.landmarks[0];
                        activeCanvasCtx.strokeStyle = lineColor;
                        activeCanvasCtx.lineWidth = 3;
                        activeCanvasCtx.beginPath();
                        activeCanvasCtx.moveTo(elbow.x * w, elbow.y * h);
                        activeCanvasCtx.lineTo(wrist.x * w, wrist.y * h);
                        activeCanvasCtx.stroke();
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
                if (videoElement && !videoElement.paused && !videoElement.ended && videoElement.readyState >= 2 && !isClosed) {
                    try {
                        if (faceMeshRef.current) await faceMeshRef.current.send({ image: videoElement });
                        if (currentPose) await currentPose.send({ image: videoElement });
                    } catch (e) {
                        // Silently handle frame processing errors
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
                    if (videoElement && !isClosed) {
                        try {
                            if (faceMeshRef.current) await faceMeshRef.current.send({ image: videoElement });
                            if (currentPose) await currentPose.send({ image: videoElement });
                        } catch (e) {
                            // Silently handle exceptions from closed models
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

    }, [videoRef, canvasRef, videoMode, handResultsRef]);

    return { eyeContactScore, landmarksRef };
}
