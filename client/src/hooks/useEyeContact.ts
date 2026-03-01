import { useEffect, useRef, useState } from 'react';
import type * as cam from '@mediapipe/camera_utils';
import type { FaceMesh as FaceMeshType, Results } from '@mediapipe/face_mesh';

// Approximates whether the user is looking at the camera based on iris/pupil positioning relative to eye corners
export function useEyeContact(videoRef: any, canvasRef?: React.RefObject<HTMLCanvasElement | null>) {
    const [eyeContactScore, setEyeContactScore] = useState<number>(100);
    const faceMeshRef = useRef<FaceMeshType | null>(null);
    const cameraRef = useRef<cam.Camera | null>(null);

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

        if (!FaceMeshConstructor || !CameraConstructor || !PoseConstructor) {
            console.warn("MediaPipe failed to load on this environment.");
            return;
        }

        faceMeshRef.current = new FaceMeshConstructor({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMeshRef.current!.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true, // Need this for iris tracking
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        // POSE INIT
        const poseObj = new PoseConstructor({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });
        poseObj.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        // Save to a local variable for the cleanup closure, avoid ref mutation issues
        let currentPose = poseObj;

        let activeCanvasCtx: CanvasRenderingContext2D | null = null;

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

            if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                const landmarks = results.multiFaceLandmarks[0];

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
                setEyeContactScore(0);
            }
        };

        const onPoseResults = (results: any) => {
            if (activeCanvasCtx && results.poseLandmarks) {
                drawConnectors(activeCanvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
                drawLandmarks(activeCanvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });
                activeCanvasCtx.restore(); // Frame finished drawing
            } else if (activeCanvasCtx) {
                activeCanvasCtx.restore();
            }
        }

        faceMeshRef.current!.onResults(onFaceResults);
        poseObj.onResults(onPoseResults);

        cameraRef.current = new CameraConstructor(videoElement, {
            onFrame: async () => {
                if (videoElement) {
                    if (faceMeshRef.current) await faceMeshRef.current.send({ image: videoElement });
                    if (currentPose) await currentPose.send({ image: videoElement });
                }
            },
            width: 640,
            height: 480
        });

        cameraRef.current!.start();

        return () => {
            cameraRef.current?.stop();
            faceMeshRef.current?.close();
            currentPose?.close();
        };

    }, [videoRef, canvasRef]);

    return eyeContactScore;
}
