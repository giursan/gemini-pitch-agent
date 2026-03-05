'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useEyeContact } from '../../hooks/useEyeContact';
import { useBodyLanguageAnalysis, TED_BENCHMARKS, type BodyLanguageMetrics } from '../../hooks/useBodyLanguageAnalysis';
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
    const rafRef = useRef<number | null>(null);

    // Reuse our existing tracking pipeline — videoMode=true skips Camera utility (no getUserMedia)
    const { eyeContactScore, landmarksRef } = useEyeContact(videoRef, canvasRef, true);
    const { metrics, benchmarks } = useBodyLanguageAnalysis(landmarksRef, isProcessing);

    // Collect samples while processing
    useEffect(() => {
        if (isProcessing && metrics) {
            setCurrentMetrics(metrics);
            samplesRef.current.push({ ...metrics });
        }
    }, [isProcessing, metrics]);

    // Track video progress
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

        // Play the video — MediaPipe Camera util inside useEyeContact
        // will automatically process frames as the video plays
        video.currentTime = 0;
        video.playbackRate = 1; // Real-time for accurate tracking
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

        // Average all samples
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

        // Build full statistical benchmark profile from all profiled videos
        const profile = buildBenchmarkProfile(
            results.map(r => ({
                name: r.name,
                samples: r.samples,
            }))
        );

        // Save to localStorage for use in the main app
        saveBenchmarkProfile(profile);

        // Also export as JSON file for reference
        const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ted_benchmark_profile.json';
        a.click();
        URL.revokeObjectURL(url);

        alert(`✅ Benchmark profile saved!\n${profile.videosAnalyzed.length} videos, ${profile.totalSamples} samples.\nYour live sessions will now score against these TED benchmarks.`);
    };

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100 font-[family-name:var(--font-geist-sans)]">
            <header className="px-6 py-4 flex items-center justify-between border-b border-white/10">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight text-white/90">
                        Aura <span className="text-white/50 font-normal">TED Profiler</span>
                    </h1>
                    <p className="text-xs text-neutral-500 mt-0.5">
                        Scan presentation videos to generate empirical body language benchmarks
                    </p>
                </div>
                <a href="/" className="text-sm text-neutral-400 hover:text-white transition-colors">
                    ← Back to Mentor
                </a>
            </header>

            <main className="max-w-7xl mx-auto p-6 flex flex-col lg:flex-row gap-6">
                {/* Left: Video + Controls */}
                <section className="flex-1 flex flex-col gap-4">
                    {/* Upload Zone */}
                    <div className="bg-neutral-900 border border-dashed border-white/10 rounded-2xl p-6 text-center">
                        <input
                            type="file"
                            accept="video/*"
                            onChange={handleFileSelect}
                            className="hidden"
                            id="video-upload"
                        />
                        <label
                            htmlFor="video-upload"
                            className="cursor-pointer block"
                        >
                            <div className="text-3xl mb-2">🎬</div>
                            <p className="text-neutral-400 text-sm">
                                {videoName || 'Drop a TED talk video or click to upload'}
                            </p>
                            <p className="text-neutral-600 text-xs mt-1">
                                MP4, WebM, MOV supported
                            </p>
                        </label>
                    </div>

                    {/* Video Player with Overlay */}
                    <div className="relative rounded-2xl overflow-hidden bg-neutral-900 aspect-video ring-1 ring-white/10 shadow-2xl">
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
                            className="absolute inset-0 w-full h-full z-10 pointer-events-none object-contain"
                        />
                        {isProcessing && (
                            <div className="absolute top-4 left-4 flex gap-2">
                                <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-xs font-mono font-medium text-amber-400 border border-amber-500/30 animate-pulse">
                                    ● SCANNING
                                </span>
                                <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-xs font-mono font-medium text-blue-400 border border-blue-500/30">
                                    {Math.round(progress)}%
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Progress Bar */}
                    {isProcessing && (
                        <div className="w-full bg-neutral-800 rounded-full h-1.5">
                            <div
                                className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    )}

                    {/* Controls */}
                    <div className="flex gap-3">
                        <button
                            onClick={isProcessing ? stopProfiling : startProfiling}
                            disabled={!videoSrc}
                            className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${!videoSrc
                                ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                                : isProcessing
                                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                    : 'bg-amber-500 text-black hover:bg-amber-400'
                                }`}
                        >
                            {isProcessing ? '⏹ Stop Scan' : '▶ Start Scan'}
                        </button>

                        {results.length > 0 && (
                            <button
                                onClick={exportBenchmarks}
                                className="px-4 py-3 rounded-xl text-sm font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                            >
                                📥 Save & Export Benchmarks
                            </button>
                        )}
                    </div>

                    {/* Calibration status */}
                    {(() => {
                        const existing = typeof window !== 'undefined' ? loadBenchmarkProfile() : null;
                        return existing ? (
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-xs text-emerald-400">
                                ✅ Calibrated against {existing.videosAnalyzed.length} TED talk(s) ({existing.totalSamples} samples)
                            </div>
                        ) : (
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-400">
                                ⚠ No benchmarks saved yet — scan TED talks and click &quot;Save &amp; Export&quot;
                            </div>
                        );
                    })()}
                </section>

                {/* Right: Live Metrics + Results */}
                <aside className="w-full lg:w-96 flex flex-col gap-4">
                    {/* Live Metrics During Scan */}
                    {isProcessing && currentMetrics && (
                        <div className="bg-neutral-900 border border-white/5 p-5 rounded-2xl shadow-lg">
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-amber-500 mb-4">
                                Live Scan Metrics
                            </h2>
                            <div className="space-y-2 text-sm">
                                <MetricRow label="Posture" value={`${currentMetrics.postureAngle}°`} good={currentMetrics.isGoodPosture} />
                                <MetricRow label="Shoulder Balance" value={`${Math.round(currentMetrics.shoulderSymmetry * 100)}%`} good={currentMetrics.shoulderSymmetry > 0.8} />
                                <MetricRow label="Stability" value={`${Math.round(currentMetrics.bodyStability * 100)}%`} good={currentMetrics.bodyStability > 0.7} />
                                <MetricRow label="Gestures/min" value={`${currentMetrics.gesturesPerMin}`} good={currentMetrics.gesturesPerMin >= 10} />
                                <MetricRow label="Hand Visibility" value={`${Math.round(currentMetrics.handVisibility * 100)}%`} good={currentMetrics.handVisibility > 0.6} />
                                <MetricRow label="Smile" value={`${Math.round(currentMetrics.smileScore * 100)}%`} good={currentMetrics.smileScore > 0.3} />
                                <MetricRow label="Expressiveness" value={`${Math.round(currentMetrics.expressiveness * 100)}%`} good={currentMetrics.expressiveness > 0.3} />
                                <MetricRow label="Eye Contact" value={`${eyeContactScore}%`} good={eyeContactScore > 50} />
                                <div className="pt-2 border-t border-white/5 flex justify-between">
                                    <span className="text-neutral-300 font-semibold">Overall</span>
                                    <span className={`font-mono font-bold ${currentMetrics.overallScore >= 70 ? 'text-emerald-400' :
                                        currentMetrics.overallScore >= 40 ? 'text-amber-400' : 'text-red-400'
                                        }`}>
                                        {currentMetrics.overallScore}/100
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Completed Results */}
                    {results.length > 0 && (
                        <div className="bg-neutral-900 border border-white/5 p-5 rounded-2xl shadow-lg">
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-emerald-500 mb-4">
                                Profiled Videos ({results.length})
                            </h2>
                            <div className="space-y-4">
                                {results.map((r, i) => (
                                    <div key={i} className="border border-white/5 rounded-xl p-4 space-y-2">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-sm font-medium text-white truncate max-w-[200px]">{r.name}</p>
                                                <p className="text-xs text-neutral-500">
                                                    {Math.round(r.duration)}s • {r.samples.length} samples
                                                </p>
                                            </div>
                                            <span className={`font-mono font-bold text-lg ${r.avgMetrics.overallScore >= 70 ? 'text-emerald-400' :
                                                r.avgMetrics.overallScore >= 40 ? 'text-amber-400' : 'text-red-400'
                                                }`}>
                                                {r.avgMetrics.overallScore}
                                            </span>
                                        </div>
                                        <div className="text-xs space-y-1 text-neutral-400">
                                            <div className="flex justify-between">
                                                <span>Posture</span>
                                                <span className="font-mono">{r.avgMetrics.postureAngle}°</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Gestures/min</span>
                                                <span className="font-mono">{r.avgMetrics.gesturesPerMin}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Stability</span>
                                                <span className="font-mono">{Math.round(r.avgMetrics.bodyStability * 100)}%</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Smile</span>
                                                <span className="font-mono">{Math.round(r.avgMetrics.smileScore * 100)}%</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Info Card */}
                    <div className="bg-neutral-900/50 border border-white/5 p-4 rounded-2xl">
                        <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">How It Works</h3>
                        <ol className="text-xs text-neutral-400 space-y-1 list-decimal list-inside">
                            <li>Upload a TED talk video (downloaded MP4)</li>
                            <li>Hit &quot;Start Scan&quot; — MediaPipe processes each frame</li>
                            <li>Metrics are collected in real-time as the video plays</li>
                            <li>Scan multiple videos, then export averaged benchmarks</li>
                        </ol>
                    </div>
                </aside>
            </main>
        </div>
    );
}

// Simple metric row component
function MetricRow({ label, value, good }: { label: string; value: string; good: boolean }) {
    return (
        <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
            <span className="text-neutral-400">{label}</span>
            <span className={`font-mono font-bold ${good ? 'text-emerald-400' : 'text-amber-400'}`}>
                {value}
            </span>
        </div>
    );
}
