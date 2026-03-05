'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Download, Play, StopCircle, Video, ChevronLeft } from 'lucide-react';
import { useEyeContact } from '../../hooks/useEyeContact';
import { useBodyLanguageAnalysis, type BodyLanguageMetrics } from '../../hooks/useBodyLanguageAnalysis';
import { buildBenchmarkProfile, saveBenchmarkProfile, loadBenchmarkProfile } from '../../hooks/useTEDBenchmarks';

interface ProfileResult {
    name: string;
    duration: number;
    avgMetrics: BodyLanguageMetrics;
    samples: BodyLanguageMetrics[];
}

export default function ProfilerPage() {
    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [videoName, setVideoName] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState<ProfileResult[]>([]);
    const [currentMetrics, setCurrentMetrics] = useState<BodyLanguageMetrics | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const samplesRef = useRef<BodyLanguageMetrics[]>([]);

    const { eyeContactScore, landmarksRef } = useEyeContact(videoRef, canvasRef, true);
    const { metrics } = useBodyLanguageAnalysis(landmarksRef, isProcessing);

    useEffect(() => {
        if (isProcessing && metrics) {
            setCurrentMetrics(metrics);
            samplesRef.current.push({ ...metrics });
        }
    }, [isProcessing, metrics]);

    useEffect(() => {
        if (!isProcessing || !videoRef.current) return;

        const interval = setInterval(() => {
            const video = videoRef.current;
            if (video && video.duration > 0) {
                setProgress((video.currentTime / video.duration) * 100);
            }
        }, 200);

        return () => clearInterval(interval);
    }, [isProcessing]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setVideoName(file.name);
        const url = URL.createObjectURL(file);
        setVideoSrc(url);
    };

    const startProfiling = useCallback(() => {
        const video = videoRef.current;
        if (!video || !videoSrc) return;

        samplesRef.current = [];
        setIsProcessing(true);
        setProgress(0);

        video.currentTime = 0;
        video.playbackRate = 1;
        video.play();

        video.onended = () => {
            setIsProcessing(false);
            finalizeProfiling();
        };
    }, [videoSrc, videoName]);

    const stopProfiling = useCallback(() => {
        const video = videoRef.current;
        if (video) video.pause();
        setIsProcessing(false);
        if (samplesRef.current.length > 0) {
            finalizeProfiling();
        }
    }, [videoName]);

    const finalizeProfiling = () => {
        const samples = samplesRef.current;
        if (samples.length === 0) return;

        const avg: BodyLanguageMetrics = {
            postureAngle: Math.round(samples.reduce((s, m) => s + m.postureAngle, 0) / samples.length),
            isGoodPosture: samples.filter(m => m.isGoodPosture).length / samples.length > 0.5,
            shoulderSymmetry: Math.round((samples.reduce((s, m) => s + m.shoulderSymmetry, 0) / samples.length) * 100) / 100,
            bodyStability: Math.round((samples.reduce((s, m) => s + m.bodyStability, 0) / samples.length) * 100) / 100,
            gesturesPerMin: Math.round(samples.reduce((s, m) => s + m.gesturesPerMin, 0) / samples.length),
            handVisibility: Math.round((samples.reduce((s, m) => s + m.handVisibility, 0) / samples.length) * 100) / 100,
            smileScore: Math.round((samples.reduce((s, m) => s + m.smileScore, 0) / samples.length) * 100) / 100,
            expressiveness: Math.round((samples.reduce((s, m) => s + m.expressiveness, 0) / samples.length) * 100) / 100,
            overallScore: Math.round(samples.reduce((s, m) => s + m.overallScore, 0) / samples.length),
        };

        const result: ProfileResult = {
            name: videoName || 'Unknown',
            duration: videoRef.current?.duration || 0,
            avgMetrics: avg,
            samples,
        };

        setResults(prev => [...prev, result]);
    };

    const exportBenchmarks = () => {
        if (results.length === 0) return;

        const profile = buildBenchmarkProfile(
            results.map(r => ({
                name: r.name,
                samples: r.samples,
            }))
        );

        saveBenchmarkProfile(profile);

        const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ted_benchmark_profile.json';
        a.click();
        URL.revokeObjectURL(url);

        alert(`✅ Calibration successful!\nUsed ${profile.videosAnalyzed.length} benchmark sources.`);
    };

    return (
        <div className="min-h-[100vh] bg-neutral-50 flex flex-col font-sans selection:bg-google-blue/10">
            {/* Local Header */}
            <header className="px-8 py-5 flex items-center justify-between bg-white border-b border-neutral-200">
                <h1 className="text-xl font-bold text-neutral-900 leading-none">
                    TED Profiler
                </h1>
                <Link
                    href="/"
                    className="google-button flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-50 transition-all active:scale-[0.98]"
                >
                    <ChevronLeft className="w-4 h-4" /> BACK TO DASHBOARD
                </Link>
            </header>

            <main className="max-w-7xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
                {/* Left Column: Input and Video */}
                <div className="lg:col-span-8 space-y-8">
                    {/* Upload Card */}
                    <div className={`shadow-sm bg-white rounded-lg p-8 border-2 border-dashed transition-all duration-300 ${videoSrc ? 'border-google-blue/40' : 'border-neutral-200 hover:border-google-blue/20'}`}>
                        <input
                            type="file"
                            accept="video/*"
                            onChange={handleFileSelect}
                            className="hidden"
                            id="video-upload"
                        />
                        <label
                            htmlFor="video-upload"
                            className="cursor-pointer flex flex-col items-center gap-4 text-center group"
                        >
                            <div className="w-16 h-16 rounded-lg bg-neutral-50 border border-neutral-100 flex items-center justify-center group-hover:scale-110 group-hover:bg-google-blue/5 transition-all"><Video className="w-8 h-8 text-neutral-400" /></div>
                            <div>
                                <p className="text-lg font-bold text-neutral-900 leading-none">
                                    {videoName || 'Drop TED source video or upload'}
                                </p>
                                <p className="text-xs font-medium text-neutral-400 mt-2 uppercase tracking-widest">
                                    Calibration requires high-quality MP4 or WebM
                                </p>
                            </div>
                        </label>
                    </div>

                    {/* Video Analysis Station */}
                    <div className="relative rounded-lg overflow-hidden bg-neutral-900 aspect-video google-shadow border border-white/5 ring-8 ring-neutral-50 shadow-2xl">
                        <video
                            ref={videoRef}
                            src={videoSrc || undefined}
                            className="w-full h-full object-contain bg-black"
                            crossOrigin="anonymous"
                            playsInline
                            muted
                        />
                        <canvas
                            ref={canvasRef}
                            className="absolute inset-0 w-full h-full z-10 pointer-events-none object-contain opacity-60"
                        />

                        {/* Scanning Overlay */}
                        {isProcessing && (
                            <div className="absolute top-6 left-6 flex gap-3 z-20">
                                <div className="px-4 py-2 bg-google-red text-white rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-google-red/20 animate-pulse">
                                    <span className="w-2 h-2 rounded-full bg-white" />
                                    SCANNING FRAME
                                </div>
                                <div className="px-4 py-2 bg-google-blue text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-google-blue/20">
                                    {Math.round(progress)}% COMPLETE
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Progress Bar (Material Style) */}
                    <div className="bg-neutral-100 rounded-full h-3 p-0.5 overflow-hidden">
                        <div
                            className="bg-google-blue h-full rounded-full transition-all duration-300 shadow-sm"
                            style={{ width: `${progress}%` }}
                        />
                    </div>

                    {/* Control Bar */}
                    <div className="flex gap-4">
                        <button
                            onClick={isProcessing ? stopProfiling : startProfiling}
                            disabled={!videoSrc}
                            className={`flex flex-1 items-center justify-center gap-2 px-8 py-4 rounded-lg text-sm font-bold tracking-tight transition-all active:scale-[0.98] ${!videoSrc
                                ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                                : isProcessing
                                    ? 'bg-google-red text-white shadow-lg shadow-google-red/20'
                                    : 'bg-google-blue text-white shadow-lg shadow-google-blue/20 hover:bg-primary-hover'
                                }`}
                        >
                            {isProcessing ? <><StopCircle className="w-5 h-5" /> STOP CALIBRATION</> : <><Play className="w-5 h-5" /> INITIATE SCAN</>}
                        </button>

                        {results.length > 0 && (
                            <button
                                onClick={exportBenchmarks}
                                className="flex items-center gap-2 px-10 py-4 rounded-lg text-sm font-bold bg-google-green text-white shadow-lg shadow-google-green/20 hover:opacity-90 transition-all active:scale-[0.98]"
                            >
                                <Download className="w-5 h-5" /> SYNC & EXPORT
                            </button>
                        )}
                    </div>
                </div>

                {/* Right Column: Results & Info */}
                <div className="lg:col-span-4 space-y-6">
                    {/* Live Telemetry Card */}
                    {isProcessing && currentMetrics && (
                        <div className="bg-white border border-neutral-200 p-7 rounded-lg shadow-sm">
                            <h2 className="text-[10px] font-black uppercase tracking-widest text-google-blue mb-6">
                                Live Neural Output
                            </h2>
                            <div className="space-y-4">
                                <MetricRow label="POSTURE ANGLE" value={`${currentMetrics.postureAngle}°`} good={currentMetrics.isGoodPosture} />
                                <MetricRow label="SYMMETRY" value={`${Math.round(currentMetrics.shoulderSymmetry * 100)}%`} good={currentMetrics.shoulderSymmetry > 0.8} />
                                <MetricRow label="STABILITY" value={`${Math.round(currentMetrics.bodyStability * 100)}%`} good={currentMetrics.bodyStability > 0.7} />
                                <MetricRow label="GESTURE RATE" value={`${currentMetrics.gesturesPerMin}`} good={currentMetrics.gesturesPerMin >= 10} />
                                <MetricRow label="EXPRESSION" value={`${Math.round(currentMetrics.expressiveness * 100)}%`} good={currentMetrics.expressiveness > 0.3} />
                                <MetricRow label="RECEPTION" value={`${eyeContactScore}%`} good={eyeContactScore > 50} />
                                <div className="pt-4 border-t border-border/40 mt-2 flex justify-between items-baseline">
                                    <span className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Aggregate PR</span>
                                    <span className={`text-2xl font-black ${currentMetrics.overallScore >= 70 ? 'text-google-green' : 'text-google-blue'}`}>
                                        {currentMetrics.overallScore}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Results Portfolio */}
                    {results.length > 0 && (
                        <div className="bg-white border border-neutral-200 p-7 rounded-lg shadow-sm max-h-[500px] overflow-y-auto">
                            <h2 className="text-[10px] font-black uppercase tracking-widest text-google-green mb-6">
                                Portfolio ({results.length})
                            </h2>
                            <div className="space-y-4">
                                {results.map((r, i) => (
                                    <div key={i} className="bg-neutral-50 rounded-lg p-5 border border-neutral-200 hover:border-google-green/40 transition-colors">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="min-w-0 pr-4">
                                                <p className="text-xs font-bold text-neutral-900 truncate leading-tight mb-1">{r.name}</p>
                                                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-tighter">
                                                    {Math.round(r.duration)}s • {r.samples.length} SAMPLES
                                                </p>
                                            </div>
                                            <div className={`px-2 py-1 rounded text-[10px] font-black ${r.avgMetrics.overallScore >= 70 ? 'bg-google-green text-white' : 'bg-google-blue text-white'
                                                }`}>
                                                {r.avgMetrics.overallScore}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="bg-white p-2 rounded-md text-center border border-neutral-200">
                                                <span className="block text-[8px] font-bold text-neutral-400 leading-none">POSTURE</span>
                                                <span className="text-[10px] font-bold text-neutral-800">{r.avgMetrics.postureAngle}°</span>
                                            </div>
                                            <div className="bg-white p-2 rounded-md text-center border border-neutral-200">
                                                <span className="block text-[8px] font-bold text-neutral-400 leading-none">GESTURES</span>
                                                <span className="text-[10px] font-bold text-neutral-800">{r.avgMetrics.gesturesPerMin}/M</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Methodology Panel */}
                    <div className="bg-neutral-50 border border-neutral-200 p-6 rounded-lg">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-google-blue" />
                            Protocol
                        </h3>
                        <ul className="text-[11px] font-medium text-neutral-500 space-y-3">
                            <li className="flex gap-3">
                                <span className="text-google-blue">01</span>
                                <span>Feed benchmark video into Neural Tracker (MP)</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="text-google-blue">02</span>
                                <span>Calibrate telemetry against 46 key landmarks</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="text-google-blue">03</span>
                                <span>Aura accumulates statistical z-scores (Local)</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </main>
        </div>
    );
}

function MetricRow({ label, value, good }: { label: string; value: string; good: boolean }) {
    return (
        <div className="flex justify-between items-center py-2 border-b border-neutral-200">
            <span className="text-[10px] font-bold text-neutral-400 tracking-tight">{label}</span>
            <span className={`text-[11px] font-black ${good ? 'text-google-green' : 'text-google-yellow'}`}>
                {value}
            </span>
        </div>
    );
}
