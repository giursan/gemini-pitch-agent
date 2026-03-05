'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { useEyeContact } from '../hooks/useEyeContact';
import { useBodyLanguageAnalysis, TED_BENCHMARKS } from '../hooks/useBodyLanguageAnalysis';
import { useGestureRecognizer } from '../hooks/useGestureRecognizer';
import SessionControls, { type SessionState, type FeedbackMode } from './SessionControls';
import FeedbackOverlay, { type Alert } from './FeedbackOverlay';
import ReportView from './ReportView';

// ── Audio Util ──────────────────────────────────────────────────────────────────

function floatTo16BitPcmAndBase64(input: Float32Array): string {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++) {
    let s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ── Main Page ───────────────────────────────────────────────────────────────────

export default function Home() {
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionMetrics, setSessionMetrics] = useState({ pacing: 0, filler: 0, contentScore: 0, deliveryScore: 0 });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [report, setReport] = useState<Record<string, any> | null>(null);

  const webcamRef = useRef<Webcam>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const telemetryIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const alertIdRef = useRef(0);

  const isActive = sessionState === 'recording' || sessionState === 'paused';

  // CV Hooks (run while session is active)
  const { eyeContactScore: realTimeEyeContact, landmarksRef } = useEyeContact(
    webcamRef as any || { current: null }, overlayCanvasRef
  );
  const { metrics: bodyMetrics, benchmarks } = useBodyLanguageAnalysis(landmarksRef, isActive);

  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = (webcamRef.current as any)?.video || null;
    videoElementRef.current = video;
  });
  const gestureMetrics = useGestureRecognizer(videoElementRef, isActive);

  const BARGE_IN_THRESHOLD = 0.05;

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanupMedia();
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const cleanupMedia = useCallback(() => {
    if (telemetryIntervalRef.current) {
      clearInterval(telemetryIntervalRef.current);
      telemetryIntervalRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  // ── Session Lifecycle ───────────────────────────────────────────────────

  const handleStart = async (feedbackMode: FeedbackMode) => {
    try {
      if (!webcamRef.current?.video) return;
      const stream = webcamRef.current.video.srcObject as MediaStream;

      const ws = new WebSocket('ws://localhost:8080');
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'session_start', feedbackMode }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        // Server protocol messages
        if (data.type === 'session_started') {
          setSessionId(data.sessionId);
          setSessionState('recording');
          setAlerts([]);
          setReport(null);
          startMediaExtraction(stream, ws);
          return;
        }
        if (data.type === 'session_paused') {
          setSessionState('paused');
          return;
        }
        if (data.type === 'session_resumed') {
          setSessionState('recording');
          return;
        }
        if (data.type === 'generating_report') {
          setSessionState('generating');
          cleanupMedia();
          return;
        }
        if (data.type === 'session_report') {
          setReport(data.report);
          setSessionState('report');
          return;
        }
        if (data.type === 'error') {
          console.error('Server error:', data.message);
          setSessionState('idle');
          return;
        }

        // Gemini Live API messages
        if (data.toolCall?.functionCalls) {
          for (const fc of data.toolCall.functionCalls) {
            if (fc.name === 'emit_alert') {
              const id = `alert-${++alertIdRef.current}`;
              const source = fc.args?.source || 'orchestrator';
              setAlerts(prev => [...prev, {
                id,
                severity: fc.args?.severity || 'info',
                message: `[${source}] ${fc.args?.message || ''}`,
                timestamp: Date.now(),
              }]);
            } else if (fc.name === 'update_metrics') {
              setSessionMetrics(prev => ({
                pacing: fc.args?.pacing ?? prev.pacing,
                filler: fc.args?.filler ?? prev.filler,
                contentScore: fc.args?.contentScore ?? prev.contentScore,
                deliveryScore: fc.args?.deliveryScore ?? prev.deliveryScore,
              }));
            }
          }
        }
      };

      ws.onclose = () => {
        if (sessionState !== 'report' && sessionState !== 'generating') {
          cleanupMedia();
          setSessionState('idle');
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        cleanupMedia();
        setSessionState('idle');
      };
    } catch (err) {
      console.error('Error starting session:', err);
    }
  };

  const handlePause = () => {
    wsRef.current?.send(JSON.stringify({ type: 'session_pause' }));
  };

  const handleResume = () => {
    wsRef.current?.send(JSON.stringify({ type: 'session_resume' }));
  };

  const handleEnd = () => {
    wsRef.current?.send(JSON.stringify({ type: 'session_end' }));
  };

  const handleNewSession = () => {
    setSessionState('idle');
    setReport(null);
    setSessionId(null);
    setAlerts([]);
    setSessionMetrics({ pacing: 0, filler: 0, contentScore: 0, deliveryScore: 0 });
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const handleDismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  // ── Media Extraction ────────────────────────────────────────────────────

  const startMediaExtraction = (stream: MediaStream, ws: WebSocket) => {
    const audioCtx = new window.AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioCtx;

    const audioStream = new MediaStream(stream.getAudioTracks());
    if (audioStream.getAudioTracks().length > 0) {
      const source = audioCtx.createMediaStreamSource(audioStream);
      const analyser = audioCtx.createAnalyser();
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);

        // VAD
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const x = (dataArray[i] - 128) / 128;
          sum += x * x;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        if (rms > BARGE_IN_THRESHOLD) {
          ws.send(JSON.stringify({ type: 'barge_in', data: true }));
        }

        const pcmBase64 = floatTo16BitPcmAndBase64(inputData);
        ws.send(JSON.stringify({ type: 'audio', data: pcmBase64 }));
      };
    }

    // Video + CV telemetry at 1 FPS
    telemetryIntervalRef.current = setInterval(() => {
      if (!webcamRef.current || ws.readyState !== WebSocket.OPEN) return;

      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        const base64Data = imageSrc.split(',')[1];
        ws.send(JSON.stringify({ type: 'video', data: base64Data }));
      }

      ws.send(JSON.stringify({
        type: 'client_telemetry',
        data: {
          eyeContact: realTimeEyeContact,
          postureAngle: bodyMetrics.postureAngle,
          isGoodPosture: bodyMetrics.isGoodPosture,
          gesturesPerMin: bodyMetrics.gesturesPerMin,
          handVisibility: bodyMetrics.handVisibility,
          smileScore: bodyMetrics.smileScore,
          overallScore: bodyMetrics.overallScore,
          currentGestures: gestureMetrics.currentGestures.map(g => g.gesture),
          openGestureRatio: gestureMetrics.openGestureRatio,
        },
      }));
    }, 1000);
  };

  // ── Report View ─────────────────────────────────────────────────────────

  if (sessionState === 'report' && report) {
    return <ReportView report={report} sessionId={sessionId || ''} onNewSession={handleNewSession} />;
  }

  // ── Main Live View ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-[family-name:var(--font-geist-sans)]">
      <header className="px-6 py-4 flex items-center justify-between border-b border-white/10">
        <h1 className="text-xl font-semibold tracking-tight text-white/90">
          Aura <span className="text-white/50 font-normal">Mentor</span>
        </h1>
        <SessionControls
          state={sessionState}
          onStart={handleStart}
          onPause={handlePause}
          onResume={handleResume}
          onEnd={handleEnd}
        />
      </header>

      <main className="flex-1 flex flex-col lg:flex-row p-6 gap-6 max-w-7xl mx-auto w-full">
        {/* Video Section */}
        <section className="flex-1 flex flex-col gap-4">
          <div className="relative rounded-2xl overflow-hidden bg-neutral-900 aspect-video ring-1 ring-white/10 flex items-center justify-center shadow-2xl">
            <Webcam
              audio={true}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={{ width: 1280, height: 720, facingMode: "user" }}
              className="w-full h-full object-cover"
              muted={true}
            />
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full z-10 pointer-events-none object-cover"
            />

            {/* Status badges */}
            {isActive && (
              <div className="absolute top-4 left-4 flex gap-2 z-20">
                <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-xs font-mono font-medium text-emerald-400 border border-emerald-500/30 animate-pulse">
                  ● LIVE AI
                </span>
                <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-xs font-mono font-medium text-blue-400 border border-blue-500/30">
                  CV ENABLED
                </span>
              </div>
            )}

            {/* Pause overlay */}
            {sessionState === 'paused' && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-30">
                <span className="text-2xl font-bold text-white/70">⏸ Paused</span>
              </div>
            )}

            {/* Generating overlay */}
            {sessionState === 'generating' && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-30 gap-4">
                <div className="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                <span className="text-lg font-semibold text-white/70">Analyzing your session...</span>
              </div>
            )}

            {/* Idle state */}
            {sessionState === 'idle' && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-15">
                <p className="text-white/40 text-sm font-medium">Click &quot;Start Practice&quot; to begin</p>
              </div>
            )}

            {/* Feedback toast overlay */}
            <FeedbackOverlay alerts={alerts} onDismiss={handleDismissAlert} />
          </div>
        </section>

        {/* Metrics Sidebar */}
        <aside className="w-full lg:w-80 flex flex-col gap-4">
          <div className="bg-neutral-900 border border-white/5 p-5 rounded-2xl shadow-lg flex-1 overflow-y-auto">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-500 mb-4">Live Metrics</h2>
            <div className="space-y-3">
              <MetricRow label="Eye Contact (CV)" value={`${realTimeEyeContact}%`} good={realTimeEyeContact > 70} />
              <MetricRow label="Posture" value={bodyMetrics.isGoodPosture ? '✓ Upright' : '⚠ Slouching'} good={bodyMetrics.isGoodPosture} />
              <MetricRow label="Posture Angle" value={`${bodyMetrics.postureAngle}°`} good={bodyMetrics.postureAngle > benchmarks.slouchAngle} />
              <MetricRow label="Shoulder Balance" value={`${Math.round(bodyMetrics.shoulderSymmetry * 100)}%`} good={bodyMetrics.shoulderSymmetry > 0.8} />
              <MetricRow label="Gestures/min" value={<>{bodyMetrics.gesturesPerMin} <span className="text-neutral-600 text-xs">/ {benchmarks.gesturesPerMin}</span></>} good={bodyMetrics.gesturesPerMin >= 10} />
              <MetricRow label="Stability" value={`${Math.round(bodyMetrics.bodyStability * 100)}%`} good={bodyMetrics.bodyStability > 0.7} />
              <MetricRow label="Hand Visibility" value={`${Math.round(bodyMetrics.handVisibility * 100)}%`} good={bodyMetrics.handVisibility > 0.6} />
              <MetricRow label="Smile" value={`${Math.round(bodyMetrics.smileScore * 100)}%`} good={bodyMetrics.smileScore > 0.3} />
              <MetricRow label="Expressiveness" value={`${Math.round(bodyMetrics.expressiveness * 100)}%`} good={bodyMetrics.expressiveness > 0.3} />
              <MetricRow label="Pacing (WPM)" value={sessionMetrics.pacing > 0 ? `${sessionMetrics.pacing}` : '--'} good={sessionMetrics.pacing > 120 && sessionMetrics.pacing < 160} />
              <MetricRow label="Filler Words" value={`${sessionMetrics.filler} / min`} good={sessionMetrics.filler < 5} />
              <MetricRow
                label="Hand Gesture"
                value={gestureMetrics.currentGestures.length > 0
                  ? gestureMetrics.currentGestures.map(g => g.gesture.replace('_', ' ')).join(' / ')
                  : '--'}
                good={null}
                color="text-purple-400"
              />
              <MetricRow label="Open Gestures" value={`${Math.round(gestureMetrics.openGestureRatio * 100)}%`} good={gestureMetrics.openGestureRatio > 0.5} />

              {/* Server-side Agent Scores */}
              <div className="mt-2 mb-1"><span className="text-xs font-semibold uppercase tracking-widest text-neutral-600">AI Agents</span></div>
              <MetricRow label="🎙️ Delivery Score" value={sessionMetrics.deliveryScore > 0 ? `${sessionMetrics.deliveryScore}/100` : '--'} good={sessionMetrics.deliveryScore >= 70} />
              <MetricRow label="📝 Content Score" value={sessionMetrics.contentScore > 0 ? `${sessionMetrics.contentScore}/100` : '--'} good={sessionMetrics.contentScore >= 70} />

              {/* Overall Score */}
              <div className="flex justify-between items-center text-sm pt-2">
                <span className="text-neutral-300 font-semibold">Overall Score</span>
                <span className={`font-mono font-bold text-lg ${bodyMetrics.overallScore >= 70 ? 'text-emerald-400' :
                  bodyMetrics.overallScore >= 40 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                  {bodyMetrics.overallScore}/100
                </span>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

// ── Metric Row Component ────────────────────────────────────────────────────────

function MetricRow({ label, value, good, color }: {
  label: string;
  value: React.ReactNode;
  good: boolean | null;
  color?: string;
}) {
  const textColor = color || (good === null ? 'text-white/60' : good ? 'text-emerald-400' : 'text-amber-400');
  return (
    <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
      <span className="text-neutral-400">{label}</span>
      <span className={`font-mono font-bold ${textColor}`}>{value}</span>
    </div>
  );
}
