'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Eye, Mic, TrendingUp, Pause, Hand, Maximize, Minimize, ActivitySquare, Terminal, Send, MessageSquare, Play, Square } from 'lucide-react';
import { useEyeContact } from '../../hooks/useEyeContact';
import { useBodyLanguageAnalysis, TED_BENCHMARKS } from '../../hooks/useBodyLanguageAnalysis';
import { useGestureRecognizer } from '../../hooks/useGestureRecognizer';
import { loadBenchmarkProfile, scoreSession } from '../../hooks/useTEDBenchmarks';
import SessionControls, { type SessionState, type FeedbackMode, type AgentSelection } from '../SessionControls';
import FeedbackOverlay, { type Alert } from '../FeedbackOverlay';
import ReportView from '../ReportView';

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
  const [feed, setFeed] = useState<{ timestamp: number, source: string, message: string }[]>([]);
  const [showFeed, setShowFeed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'gemini', text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [enableGestures, setEnableGestures] = useState(false);
  const [enabledAgents, setEnabledAgents] = useState<AgentSelection>({
    eyeContact: true,
    posture: true,
    gestures: true,
    speech: true
  });

  const webcamRef = useRef<Webcam>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackTimeRef = useRef(0);
  const telemetryIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const alertIdRef = useRef(0);
  const feedbackModeRef = useRef<FeedbackMode>('silent');

  const isActive = sessionState === 'recording' || sessionState === 'paused';

  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);

  // CV Hooks (run while session is active)
  // Note: handResultsRef from gesture hook is passed to eye contact hook for synchronized drawing
  const { metrics: gestureMetrics, handResultsRef: gestureHandResultsRef } = useGestureRecognizer(videoElementRef, enableGestures && enabledAgents.gestures);
  const { eyeContactScore: realTimeEyeContact, landmarksRef } = useEyeContact(
    webcamRef as any || { current: null }, overlayCanvasRef, false, enabledAgents, gestureHandResultsRef
  );
  const { metrics: bodyMetrics, benchmarks } = useBodyLanguageAnalysis(landmarksRef, isActive);

  useEffect(() => {
    const video = (webcamRef.current as any)?.video || null;
    videoElementRef.current = video;
  });

  // Stagger GestureRecognizer by 3 seconds after session starts to prevent WASM load crash
  useEffect(() => {
    if (isActive) {
      const t = setTimeout(() => setEnableGestures(true), 5000);
      return () => clearTimeout(t);
    } else {
      setEnableGestures(false);
    }
  }, [isActive]);



  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      fullscreenContainerRef.current?.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  };

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
    if (playbackCtxRef.current) {
      playbackCtxRef.current.close();
      playbackCtxRef.current = null;
    }
    playbackTimeRef.current = 0;
  }, []);

  // ── Shark Mode Audio Playback ─────────────────────────────────────────

  const playGeminiAudio = useCallback((base64Pcm: string) => {
    if (!playbackCtxRef.current) {
      playbackCtxRef.current = new AudioContext({ sampleRate: 24000 });
      playbackTimeRef.current = 0;
    }
    const ctx = playbackCtxRef.current;

    // Decode base64 → Int16 PCM → Float32
    const binaryStr = atob(base64Pcm);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    // Create audio buffer and queue it
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startTime = Math.max(now, playbackTimeRef.current);
    source.start(startTime);
    playbackTimeRef.current = startTime + buffer.duration;
  }, []);

  // ── Session Lifecycle ───────────────────────────────────────────────────

  const handleStart = async (feedbackMode: FeedbackMode, agents: AgentSelection) => {
    setEnabledAgents(agents);
    feedbackModeRef.current = feedbackMode;
    try {
      if (!webcamRef.current?.video) return;
      let stream = webcamRef.current.video.srcObject as MediaStream;

      // Force request audio permissions if the webcam stream didn't bundle it automatically
      if (agents.speech && (!stream || stream.getAudioTracks().length === 0)) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (stream) {
            audioStream.getAudioTracks().forEach(track => stream.addTrack(track));
          } else {
            stream = audioStream;
          }
        } catch (e) {
          console.error("Microphone permission denied or unavailable:", e);
          alert("Microphone access is required for the Speech agent. Please allow microphone permissions in your browser.");
          return;
        }
      }

      const ws = new WebSocket('ws://localhost:8080');
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'session_start', feedbackMode, agents }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          // ── Server Protocol Messages ──────────────────────────────
          case 'session_started':
            setSessionId(data.sessionId);
            setSessionState('recording');
            setAlerts([]);
            setFeed([{ timestamp: Date.now(), source: 'System', message: 'Multi-agent session started. Delivery + Content + CV agents active.' }]);
            setReport(null);
            startMediaExtraction(stream, ws);
            return;

          case 'session_paused':
            setSessionState('paused');
            return;

          case 'session_resumed':
            setSessionState('recording');
            return;

          case 'generating_report':
            setSessionState('generating');
            cleanupMedia();
            return;

          case 'session_report':
            setReport(data.report);
            setSessionState('report');
            return;

          case 'error':
            console.error('Server error:', data.message);
            setSessionState('idle');
            return;

          // ── Orchestrator Alert Messages ────────────────────────────
          case 'alert': {
            const id = data.id || `alert-${++alertIdRef.current}`;
            const source = data.source || 'orchestrator';
            setAlerts(prev => [...prev, {
              id,
              severity: data.severity || 'info',
              message: `[${source}] ${data.message || ''}`,
              timestamp: data.timestamp || Date.now(),
            }]);
            setFeed(prev => [...prev, { timestamp: Date.now(), source, message: `Alert: ${data.message}` }]);
            return;
          }

          // ── Orchestrator Metrics Messages ──────────────────────────
          case 'metrics':
            setSessionMetrics(prev => ({
              pacing: data.pacing ?? prev.pacing,
              filler: data.filler ?? prev.filler,
              contentScore: data.contentScore ?? prev.contentScore,
              deliveryScore: data.deliveryScore ?? prev.deliveryScore,
            }));
            return;

          // ── Shark Mode Audio Output ────────────────────────────────
          case 'audio_output':
            if (feedbackModeRef.current === 'shark' && data.data) {
              playGeminiAudio(data.data);
            }
            return;

          // ── Chat Replies ───────────────────────────────────────────
          case 'chat_reply':
            setChatMessages(prev => [...prev, { role: 'gemini', text: data.text }]);
            return;
        }

        // Legacy: handle raw Gemini messages (tool calls) for backward compat
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
              setFeed(prev => [...prev, { timestamp: Date.now(), source, message: `Alert: ${fc.args?.message}` }]);
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

        // Legacy: handle shark mode audio from raw Gemini messages
        if (feedbackModeRef.current === 'shark' && data.serverContent?.modelTurn?.parts) {
          for (const part of data.serverContent.modelTurn.parts) {
            if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
              playGeminiAudio(part.inlineData.data);
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
    setChatMessages([]);
    setSessionMetrics({ pacing: 0, filler: 0, contentScore: 0, deliveryScore: 0 });
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const handleSendChat = () => {
    if (!chatInput.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const msg = chatInput.trim();
    setChatMessages(prev => [...prev, { role: 'user', text: msg }]);
    setChatInput('');
    wsRef.current.send(JSON.stringify({ type: 'chat_message', text: msg }));
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

        if (Math.random() < 0.25) {
          console.log(`[Audio Debug] Mic RMS amplitude: ${rms.toFixed(4)}`);
        }

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
          currentGestures: gestureMetrics?.currentGestures?.map(g => g.gesture) || [],
          openGestureRatio: gestureMetrics?.openGestureRatio ?? 0,
          handsDetected: gestureMetrics?.handsDetected ?? 0,
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
    <div className="min-h-[100vh] bg-neutral-50 flex flex-col font-sans selection:bg-google-blue/10">
      {/* Local Header */}
      <header className="px-8 py-5 flex items-center justify-between bg-white border-b border-neutral-200">
        <h1 className="text-xl font-bold text-neutral-900 leading-none">
          Live Practice
        </h1>
        <div className="flex items-center gap-6">
          <SessionControls
            state={sessionState}
            onStart={handleStart}
            onPause={handlePause}
            onResume={handleResume}
            onEnd={handleEnd}
          />
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row p-8 gap-8 max-w-7xl mx-auto w-full animate-in fade-in duration-700">
        {/* Left Section: Video & Active Insights */}
        <section className={`flex-1 flex flex-col gap-6 w-full ${isFullscreen ? 'fixed inset-0 z-50 !p-0 bg-black' : ''}`} ref={fullscreenContainerRef}>
          <div className={`relative overflow-hidden bg-black flex items-center justify-center group ${isFullscreen ? 'w-full h-full rounded-none' : 'rounded-lg border border-neutral-200 aspect-video shadow-sm'}`}>
            <Webcam
              audio={true}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={{ width: 1280, height: 720, facingMode: "user" }}
              className="w-full h-full object-cover transition-transform duration-700"
              muted={true}
            />
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full z-10 pointer-events-none object-cover opacity-80"
            />

            {/* Fullscreen Toggle Button */}
            <button
              onClick={toggleFullscreen}
              className="absolute bottom-4 right-4 z-40 p-2 bg-black/50 hover:bg-black/70 rounded text-white backdrop-blur-md transition-colors opacity-0 group-hover:opacity-100"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>

            {/* Floating Fullscreen Controls */}
            {isFullscreen && isActive && (
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-6 py-4 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-10 duration-500 opacity-0 group-hover:opacity-100 transition-opacity">
                {sessionState === 'recording' ? (
                  <button
                    onClick={handlePause}
                    className="flex items-center gap-2.5 px-6 py-3 bg-white text-neutral-900 rounded-xl text-sm font-bold shadow-lg hover:scale-105 transition-all active:scale-95"
                  >
                    <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
                      <Pause className="w-4 h-4 fill-neutral-900" />
                    </div>
                    PAUSE SESSION
                  </button>
                ) : (
                  <button
                    onClick={handleResume}
                    className="flex items-center gap-2.5 px-6 py-3 bg-google-blue text-white rounded-xl text-sm font-bold shadow-lg shadow-google-blue/30 hover:scale-105 transition-all active:scale-95"
                  >
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                      <Play className="w-4 h-4 fill-white" />
                    </div>
                    RESUME SESSION
                  </button>
                )}
                <button
                  onClick={handleEnd}
                  className="flex items-center gap-2.5 px-6 py-3 bg-google-red text-white rounded-xl text-sm font-bold shadow-lg shadow-google-red/30 hover:scale-105 transition-all active:scale-95"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                    <Square className="w-4 h-4 fill-white" />
                  </div>
                  STOP & ANALYZE
                </button>
              </div>
            )}

            {/* Status Badges - Material Design Style */}
            <div className="absolute top-6 left-6 flex flex-col gap-3 z-20">
              {isActive && (
                <>
                  <div className="px-4 py-2 bg-white/90 backdrop-blur-xl rounded-lg shadow-sm border border-neutral-200 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-google-green animate-pulse" />
                    <span className="text-[11px] font-bold tracking-wider text-neutral-700">LIVE FEEDBACK ACTIVE</span>
                  </div>
                  <div className="px-4 py-2 bg-google-blue/10 backdrop-blur-xl rounded-lg border border-neutral-200 flex items-center gap-2">
                    <span className="text-[11px] font-bold tracking-wider text-google-blue">{Object.values(enabledAgents).filter(Boolean).length} AGENT{Object.values(enabledAgents).filter(Boolean).length !== 1 ? 'S' : ''} MONITORING</span>
                  </div>
                </>
              )}
            </div>

            {/* Specialized Overlays */}
            {sessionState === 'paused' && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-md flex items-center justify-center z-30 transition-all">
                <div className="bg-white rounded-lg p-8 shadow-md border border-neutral-200 flex flex-col items-center gap-4 animate-in zoom-in-95 duration-300">
                  <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center">
                    <Pause className="w-8 h-8 text-neutral-600" />
                  </div>
                  <span className="text-xl font-bold text-neutral-900">Session Paused</span>
                </div>
              </div>
            )}

            {sessionState === 'generating' && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center z-30 gap-6">
                <div className="relative">
                  <div className="w-20 h-20 border-4 border-google-blue/10 border-t-google-blue rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center font-bold text-google-blue">
                    <ActivitySquare className="w-8 h-8" />
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-2xl font-bold text-neutral-900">Finalizing Report</span>
                  <p className="text-neutral-500 text-sm mt-1">Orchestrating multi-agent analysis...</p>
                </div>
              </div>
            )}

            {sessionState === 'idle' && (
              <div className="absolute inset-0 bg-neutral-100/80 flex items-center justify-center z-15 pointer-events-none">

              </div>
            )}

            {/* Feedback Notifications */}
            <FeedbackOverlay alerts={alerts} onDismiss={handleDismissAlert} />

            {isFullscreen && showFeed && (
              <div className="absolute bottom-20 left-6 right-6 lg:left-auto lg:right-6 lg:w-96 bg-black/80 backdrop-blur-md border border-neutral-800 rounded-lg p-4 z-40 max-h-60 overflow-y-auto">
                <div className="flex items-center gap-2 mb-3 text-white/80 border-b border-white/10 pb-2">
                  <Terminal className="w-4 h-4" />
                  <h3 className="text-xs font-bold uppercase tracking-wider">Orchestrator Logs</h3>
                </div>
                <div className="space-y-2 font-mono text-[10px]">
                  {[...feed].reverse().map((entry, idx) => (
                    <div key={idx} className="flex gap-2">
                      <span className="text-neutral-500">[{new Date(entry.timestamp).toLocaleTimeString()}]</span>
                      <span className="text-google-blue font-bold">[{entry.source}]</span>
                      <span className="text-white/90">{entry.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quick Stats Below Video (hidden in fullscreen) */}
          {!isFullscreen && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {enabledAgents.posture && <QuickMetric label="Posture Score" value={`${bodyMetrics.overallScore}%`} color="blue" />}
              {enabledAgents.eyeContact && <QuickMetric label="Gaze Contact" value={`${realTimeEyeContact}%`} color="green" />}
              {enabledAgents.speech && <QuickMetric label="Pacing (WPM)" value={sessionMetrics.pacing || '--'} color="amber" />}
              {enabledAgents.speech && <QuickMetric label="Filler Words" value={sessionMetrics.filler} color="red" />}
            </div>
          )}

          {/* Moved Intelligence Dashboard here */}
          {!isFullscreen && (
            <div className="bg-white shadow-sm border border-neutral-200 p-7 rounded-lg mt-2 w-full">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-8 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-google-blue" />
                Intelligence Dashboard
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {/* Visual Performance Section — shown when any visual agent is active */}
                {(enabledAgents.eyeContact || enabledAgents.posture || enabledAgents.gestures) && (
                  <section>
                    <SectionHeader icon={<Eye className="w-5 h-5" />} title="Visual Presence" subtitle="Body & Facial Analysis" />
                    <div className="space-y-4 pt-2">
                      {enabledAgents.eyeContact && <MetricRow label="Eye Contact" value={`${realTimeEyeContact}%`} good={realTimeEyeContact > 70} />}
                      {enabledAgents.posture && (
                        <>
                          <MetricRow label="Posture" value={bodyMetrics.isGoodPosture ? 'Upright' : 'Slouching'} good={bodyMetrics.isGoodPosture} />
                          <MetricRow label="Shoulder Symmetry" value={`${Math.round(bodyMetrics.shoulderSymmetry * 100)}%`} good={bodyMetrics.shoulderSymmetry > 0.8} />
                          <MetricRow label="Stability" value={`${Math.round(bodyMetrics.bodyStability * 100)}%`} good={bodyMetrics.bodyStability > 0.7} />
                        </>
                      )}
                      {enabledAgents.eyeContact && <MetricRow label="Smile Intensity" value={`${Math.round(bodyMetrics.smileScore * 100)}%`} good={bodyMetrics.smileScore > 0.3} />}
                      {enabledAgents.gestures && (
                        <>
                          <MetricRow
                            label="Active Gestures"
                            value={gestureMetrics?.currentGestures?.length > 0
                              ? gestureMetrics.currentGestures.map(g => g.gesture.replace('_', ' ')).join(', ')
                              : '--'}
                            good={true}
                            color="text-google-purple"
                          />
                          <MetricRow
                            label="Hands Detected"
                            value={`${gestureMetrics?.handsDetected ?? 0}`}
                            good={(gestureMetrics?.handsDetected ?? 0) > 0}
                            color="text-google-purple"
                          />
                        </>
                      )}
                    </div>
                  </section>
                )}

                {/* Verbal Performance Section — shown when speech agent is active */}
                {enabledAgents.speech && (
                  <section className="flex flex-col">
                    <SectionHeader icon={<Mic className="w-5 h-5" />} title="Verbal Performance" subtitle="Voice & Content Analysis" />
                    <div className="space-y-4 pt-2">
                      <MetricRow label="Pacing" value={sessionMetrics.pacing > 0 ? `${sessionMetrics.pacing} WPM` : '--'} good={sessionMetrics.pacing > 120 && sessionMetrics.pacing < 160} />
                      <MetricRow label="Filler Frequency" value={`${sessionMetrics.filler}/min`} good={sessionMetrics.filler < 5} />
                      <MetricRow label="Delivery Grade" value={sessionMetrics.deliveryScore > 0 ? `${sessionMetrics.deliveryScore}/100` : '--'} good={sessionMetrics.deliveryScore >= 70} />
                      <MetricRow label="Content Depth" value={sessionMetrics.contentScore > 0 ? `${sessionMetrics.contentScore}/100` : '--'} good={sessionMetrics.contentScore >= 70} />
                    </div>

                    {/* Overall Score Circle */}
                    <div className="mt-auto pt-8 flex items-center justify-between border-t border-neutral-100">
                      <div>
                        <h4 className="text-sm font-bold text-neutral-900">Overall Rating</h4>
                        <p className="text-[10px] uppercase text-neutral-400 font-bold mt-1 tracking-wider">Aura Session PR</p>
                      </div>
                      <div className="relative w-24 h-24 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-neutral-100" />
                          <circle
                            cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="6" fill="transparent"
                            strokeDasharray={263.89}
                            strokeDashoffset={263.89 - (263.89 * bodyMetrics.overallScore) / 100}
                            className={`transition-all duration-1000 ${bodyMetrics.overallScore >= 70 ? 'text-google-green' : bodyMetrics.overallScore >= 40 ? 'text-google-blue' : 'text-google-red'}`}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold text-neutral-900">{bodyMetrics.overallScore}</span>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* TED Comparison Section — shown when any visual agent is active */}
                {(enabledAgents.eyeContact || enabledAgents.posture || enabledAgents.gestures) && (
                  <section className="bg-neutral-50 px-6 py-6 border border-neutral-200 rounded-lg h-full">
                    <SectionHeader icon={<TrendingUp className="w-5 h-5" />} title="Comparison" subtitle="vs. Empirical TED Benchmarks" />
                    <div className="pt-4">
                      {(() => {
                        const profile = loadBenchmarkProfile();
                        if (!profile) return (
                          <a href="/profiler" className="block p-4 bg-white border border-amber-500/10 rounded-lg group transition-all hover:border-amber-500/30">
                            <p className="text-[11px] font-bold text-amber-600 mb-1">UNAUTHENTICATED BASELINE</p>
                            <p className="text-xs text-neutral-500 leading-relaxed group-hover:text-neutral-700 transition-colors">
                              Scan TED talks in the Profiler to unlock advanced percentile rankings.
                            </p>
                          </a>
                        );
                        const scores = scoreSession(bodyMetrics, profile);
                        const visibleKeys = [
                          ...(enabledAgents.eyeContact ? ['eyeContact'] : []),
                          ...(enabledAgents.posture ? ['postureAngle'] : []),
                          ...(enabledAgents.gestures ? ['gesturesPerMin'] : []),
                          'overallScore',
                        ];
                        return (
                          <div className="space-y-6">
                            {Object.entries(scores).filter(([k]) => visibleKeys.includes(k)).map(([key, result]) => (
                              <div key={key} className="space-y-2.5">
                                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                                  <span className="text-neutral-700">{key.replace(/([A-Z])/g, ' $1')}</span>
                                  <span className={result.percentile >= 70 ? 'text-google-green' : 'text-google-blue'}>P{result.percentile}</span>
                                </div>
                                <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-1000 ${result.percentile >= 70 ? 'bg-google-green' : 'bg-google-blue'}`}
                                    style={{ width: `${result.percentile}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </section>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Right Sidebar: Deep Real-time Metrics (hidden in fullscreen) */}
        {!isFullscreen && (
          <aside className="w-full lg:w-[380px] flex flex-col gap-6">
            <div className="bg-white shadow-sm border border-neutral-200 p-5 rounded-lg flex flex-col flex-1 max-h-[calc(100vh-160px)]">
              {/* Header Toggle between Chat and Feed */}
              <div className="flex bg-neutral-100 p-1 rounded-lg border border-neutral-200 mb-4 shrink-0">
                <button
                  onClick={() => setShowFeed(false)}
                  className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${!showFeed ? 'bg-white text-google-blue shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Coach Chat
                  </div>
                </button>
                <button
                  onClick={() => setShowFeed(true)}
                  className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${showFeed ? 'bg-white text-google-blue shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Terminal className="w-4 h-4" />
                    Orchestrator
                    <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-google-green animate-pulse' : 'bg-neutral-400'}`} />
                  </div>
                </button>
              </div>

              {/* Chat Window View */}
              {!showFeed && (
                <div className="flex flex-col flex-1 min-h-0">
                  <div className="flex-1 overflow-y-auto mb-4 pr-2 space-y-4">
                    {chatMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center px-4 opacity-70">
                        <MessageSquare className="w-8 h-8 text-neutral-400 mb-3" />
                        <p className="text-[11px] text-neutral-500 font-medium leading-relaxed">Ask Gemini for specific coaching feedback or presentation strategy advice during your session.</p>
                      </div>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div key={idx} className={`p-3 rounded-lg text-xs leading-relaxed ${msg.role === 'user' ? 'bg-google-blue/5 text-neutral-800 ml-8 border border-google-blue/10' : 'bg-neutral-50 border border-neutral-200 mr-8 text-neutral-700'}`}>
                          <span className="font-bold text-[9px] uppercase tracking-[0.1em] block mb-1.5 text-neutral-400">{msg.role === 'user' ? 'You' : 'Gemini'}</span>
                          {msg.text}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSendChat(); }}
                      className="flex-1 text-xs bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2.5 outline-none focus:bg-white focus:border-google-blue focus:ring-1 focus:ring-google-blue/20 transition-all font-medium min-w-0"
                      placeholder="Ask the coach..."
                      disabled={!isActive}
                    />
                    <button
                      onClick={handleSendChat}
                      disabled={!isActive || !chatInput.trim()}
                      className="bg-google-blue disabled:bg-neutral-300 text-white w-10 shrink-0 flex items-center justify-center rounded-lg shadow-sm hover:opacity-90 transition-all active:scale-[0.95]"
                    >
                      <Send className="w-4 h-4 -ml-0.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Orchestrator Feed View */}
              {showFeed && (
                <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg flex-1 overflow-y-auto font-mono text-xs flex flex-col gap-2 shadow-inner">
                  {feed.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-70">
                      <Terminal className="w-6 h-6 text-neutral-500 mb-2" />
                      <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Awaiting Data Stream</p>
                    </div>
                  ) : (
                    [...feed].reverse().map((entry, idx) => (
                      <div key={idx} className="flex flex-col border-b border-neutral-800 pb-2.5 mb-1">
                        <span className="text-[9px] text-neutral-500 font-medium">[{new Date(entry.timestamp).toLocaleTimeString()}]</span>
                        <div className="mt-1 leading-tight flex flex-col gap-0.5">
                          <span className="text-google-blue font-bold tracking-tight">[{entry.source}]</span>
                          <span className="text-neutral-300 font-medium">{entry.message}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}

// ── Components ──────────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-600">{icon}</div>
      <div className="flex flex-col">
        <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
        <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wide">{subtitle}</p>
      </div>
    </div>
  );
}

function MetricRow({ label, value, good, color }: {
  label: string;
  value: React.ReactNode;
  good: boolean | null;
  color?: string;
}) {
  const statusColor = good === null ? 'text-neutral-400' : good ? 'text-google-green' : 'text-google-red';
  const displayColor = color || statusColor;

  return (
    <div className="flex justify-between items-center group py-0.5">
      <span className="text-xs font-medium text-neutral-500 group-hover:text-neutral-700 transition-colors">{label}</span>
      <span className={`text-xs font-bold font-mono tracking-tight ${displayColor}`}>{value}</span>
    </div>
  );
}

function QuickMetric({ label, value, color }: { label: string; value: React.ReactNode; color: 'blue' | 'green' | 'amber' | 'red' }) {
  const themes = {
    blue: 'bg-google-blue/5 text-google-blue border-google-blue/10',
    green: 'bg-google-green/5 text-google-green border-google-green/10',
    amber: 'bg-google-yellow/5 text-google-yellow border-google-yellow/10',
    red: 'bg-google-red/5 text-google-red border-google-red/10',
  };

  return (
    <div className={`p-4 rounded-lg border border-neutral-200 bg-white flex flex-col items-center justify-center gap-1`}>
      <span className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">{label}</span>
      <span className={`text-xl font-bold ${themes[color].split(' ')[1]}`}>{value}</span>
    </div>
  );
}
