'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Activity } from 'lucide-react';

export default function MicTestPage() {
    const [isListening, setIsListening] = useState(false);
    const [rms, setRms] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const audioCtxRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);

    // Track processor RMS too
    const [processorRms, setProcessorRms] = useState(0);
    const [echoCancel, setEchoCancel] = useState(false);

    // Use a stable reference for the requestAnimationFrame callback
    const updateVisualizer = useCallback(() => {
        if (!analyserRef.current) return;

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteTimeDomainData(dataArray);

        let sumSquares = 0.0;
        for (let i = 0; i < dataArray.length; i++) {
            const normalized = (dataArray[i] / 128.0) - 1.0;
            sumSquares += normalized * normalized;
        }

        const currentRms = Math.sqrt(sumSquares / dataArray.length);
        setRms(currentRms);

        animationFrameRef.current = requestAnimationFrame(updateVisualizer);
    }, []);

    const startMic = async () => {
        try {
            setError(null);
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: echoCancel,
                    noiseSuppression: echoCancel,
                    autoGainControl: echoCancel
                }
            });
            streamRef.current = stream;

            const audioCtx = new window.AudioContext();
            audioCtxRef.current = audioCtx;

            const source = audioCtx.createMediaStreamSource(stream);

            // Method 1: AnalyserNode (standard visualizer)
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;

            // Method 2: ScriptProcessorNode (what we use in the practice page)
            const processor = audioCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            source.connect(processor);
            processor.connect(audioCtx.destination);

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) {
                    sum += inputData[i] * inputData[i];
                }
                const currentRms = Math.sqrt(sum / inputData.length);
                setProcessorRms(currentRms);
            };

            setIsListening(true);
            updateVisualizer();

        } catch (err: any) {
            console.error('Error accessing microphone:', err);
            setError(err.message || 'Failed to access microphone');
        }
    };

    const stopMic = () => {
        setIsListening(false);

        if (animationFrameRef.current !== null) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current.onaudioprocess = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }

        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(console.error);
        }

        setRms(0);
        setProcessorRms(0);
    };

    useEffect(() => {
        return () => {
            stopMic();
        };
    }, []);

    return (
        <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-8 font-sans">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-neutral-200 max-w-xl w-full">
                <div className="flex items-center gap-3 mb-6">
                    <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
                        <Activity className="w-6 h-6" />
                    </div>
                    <h1 className="text-2xl font-bold text-neutral-800">Microphone Diagnostics</h1>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 text-sm border border-red-100">
                        {error}
                    </div>
                )}

                <div className="flex items-center gap-2 mb-6 bg-neutral-100 p-4 rounded-xl">
                    <input
                        type="checkbox"
                        id="echo"
                        checked={echoCancel}
                        onChange={(e) => setEchoCancel(e.target.checked)}
                        disabled={isListening}
                        className="w-4 h-4"
                    />
                    <label htmlFor="echo" className="text-sm font-medium text-neutral-700">
                        Enable Echo Cancellation & Noise Suppression (Often breaks Mac Audio Streams)
                    </label>
                </div>

                <div className="space-y-8">
                    {/* Method 1: Analyser Node */}
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <label className="text-sm font-semibold text-neutral-600">1. AnalyserNode RMS (Visualizer Method)</label>
                            <span className="font-mono text-sm text-neutral-400">{rms.toFixed(5)}</span>
                        </div>
                        <div className="h-8 bg-neutral-100 rounded-full overflow-hidden relative">
                            <div
                                className="absolute top-0 left-0 bottom-0 bg-blue-500 transition-all duration-75 ease-out"
                                style={{ width: `${Math.min(100, rms * 500)}%` }} // Multiplied for visibility
                            />
                        </div>
                    </div>

                    {/* Method 2: ScriptProcessor Node */}
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <label className="text-sm font-semibold text-neutral-600">2. ScriptProcessor RMS (App Method)</label>
                            <span className="font-mono text-sm text-neutral-400">{processorRms.toFixed(5)}</span>
                        </div>
                        <div className="h-8 bg-neutral-100 rounded-full overflow-hidden relative">
                            <div
                                className="absolute top-0 left-0 bottom-0 bg-green-500 transition-all duration-75 ease-out"
                                style={{ width: `${Math.min(100, processorRms * 500)}%` }} // Multiplied for visibility
                            />
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex justify-center">
                    {!isListening ? (
                        <button
                            onClick={startMic}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium flex items-center gap-2 transition-colors"
                        >
                            <Mic className="w-5 h-5" />
                            Start Diagnostic Test
                        </button>
                    ) : (
                        <button
                            onClick={stopMic}
                            className="px-6 py-3 bg-red-100 hover:bg-red-200 text-red-600 rounded-full font-medium flex items-center gap-2 transition-colors"
                        >
                            <MicOff className="w-5 h-5" />
                            Stop Test
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
