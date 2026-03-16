'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import Webcam from 'react-webcam';
import { Eye, Mic, TrendingUp, Pause, Hand, Maximize, Minimize, ActivitySquare, Terminal, Send, MessageSquare, Play, Square, PanelRightClose, LayoutDashboard } from 'lucide-react';
import { useEyeContact } from '../../hooks/useEyeContact';
import { useBodyLanguageAnalysis, type PostureBaseline } from '../../hooks/useBodyLanguageAnalysis';
import { useGestureRecognizer } from '../../hooks/useGestureRecognizer';
import SessionControls, { type SessionState, type FeedbackMode, type AgentSelection, type Persona } from '../SessionControls';
import FeedbackOverlay, { type Alert } from '../FeedbackOverlay';
import ReportView from '../ReportView';
import { useSearchParams } from 'next/navigation';
import { Folder, UserCheck } from 'lucide-react';
import PostureCalibrationOverlay from '../PostureCalibrationOverlay';
import ReactMarkdown from 'react-markdown';
import ProjectSelectionModal from '@/components/ProjectSelectionModal';
import { apiFetch, getWsUrl } from '@/lib/api';

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

export default function PracticePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center gap-4 animate-in fade-in duration-700">
        <div className="w-12 h-12 border-4 border-google-blue/20 border-t-google-blue rounded-full animate-spin" />
        <p className="text-sm font-bold text-neutral-400 uppercase tracking-widest">Initializing Practice Environment...</p>
      </div>
    }>
      <Home />
    </Suspense>
  );
}

function Home() {
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionMetrics, setSessionMetrics] = useState({ pacing: 0, filler: 0, totalFillers: 0, fillerWords: [] as string[], contentScore: 0, deliveryScore: 0 });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [report, setReport] = useState<Record<string, any> | null>(null);
  const [feed, setFeed] = useState<{ timestamp: number, source: string, message: string }[]>([]);
  const [showFeed, setShowFeed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [posturalBaseline, setPosturalBaseline] = useState<PostureBaseline | null>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(true);

  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'gemini', text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [enableGestures, setEnableGestures] = useState(false);
  const [enabledAgents, setEnabledAgents] = useState<AgentSelection>({
    eyeContact: true,
    posture: true,
    gestures: true,
    speech: true,
    pacing: true,
    fillerWords: true,
    content: true,
    congruity: true,
    timeManagement: true,
    expectedTimeMin: 10
  });

  const webcamRef = useRef<Webcam>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackTimeRef = useRef(0);
  const telemetryIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const alertIdRef = useRef(0);
  const feedbackModeRef = useRef<FeedbackMode>('silent');
  const personaRef = useRef<Persona>('mentor');

  const BARGE_IN_THRESHOLD = 0.05;

  const sessionStateRef = useRef<SessionState>(sessionState);
  useEffect(() => {
    sessionStateRef.current = sessionState;
  }, [sessionState]);

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
      audioContextRef.current.close().catch(() => { });
      audioContextRef.current = null;
    }
    if (playbackCtxRef.current) {
      playbackCtxRef.current.close().catch(() => { });
      playbackCtxRef.current = null;
    }

    // Stop microphone tracks
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      audioStreamRef.current = null;
    }

    // Stop webcam tracks from react-webcam
    const webcamStream = webcamRef.current?.video?.srcObject as MediaStream | null;
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      if (webcamRef.current?.video) {
        webcamRef.current.video.srcObject = null;
      }
    }

    playbackTimeRef.current = 0;
  }, []);

  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const [projectTitle, setProjectTitle] = useState<string | null>(null);

  const isActive = sessionState === 'recording' || sessionState === 'paused';

  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);

  // Keep a mutable ref of the latest telemetry so the interval closure always sees fresh data
  const latestTelemetryRef = useRef<any>({});



  useEffect(() => {
    // Only run on client after mount
    try {
      const saved = localStorage.getItem('posturalBaseline');
      if (saved) {
        setPosturalBaseline(JSON.parse(saved));
      }
    } catch (e) { }
  }, []);

  useEffect(() => {
    if (posturalBaseline) {
      localStorage.setItem('posturalBaseline', JSON.stringify(posturalBaseline));
    }
  }, [posturalBaseline]);

  useEffect(() => {
    // Ensure the video element is mounted before starting MediaPipe
    const checkVideo = setInterval(() => {
      const video = (webcamRef.current as any)?.video || null;
      if (video) {
        videoElementRef.current = video;
        setIsVideoReady(true);
        clearInterval(checkVideo);
      }
    }, 500);
    return () => clearInterval(checkVideo);
  }, []);

  // CV Hooks (run while session is active)
  const isCVActive = (sessionState === 'recording' || isCalibrating) && isVideoReady;
  const { metrics: gestureMetrics, handResultsRef: gestureHandResultsRef } = useGestureRecognizer(videoElementRef, isCVActive && enabledAgents.gestures && enableGestures);
  const { eyeContactScore: realTimeEyeContact, landmarksRef } = useEyeContact(
    isVideoReady ? videoElementRef : { current: null }, overlayCanvasRef, false, enabledAgents, gestureHandResultsRef, posturalBaseline, isCVActive && enabledAgents.eyeContact
  );
  const { metrics: bodyMetrics } = useBodyLanguageAnalysis(landmarksRef, sessionState === 'recording' || isCalibrating, posturalBaseline);

  // Update ref every render (after hooks so variables are defined)
  latestTelemetryRef.current = {
    eyeContact: realTimeEyeContact,
    postureAngle: bodyMetrics?.postureAngle || 0,
    isGoodPosture: bodyMetrics?.isGoodPosture || false,
    neckStability: bodyMetrics?.neckStability ?? 1,
    shoulderExpansion: bodyMetrics?.shoulderExpansion ?? 1,
    gesturesPerMin: bodyMetrics?.gesturesPerMin || 0,
    handVisibility: bodyMetrics?.handVisibility || 0,
    handEnergy: gestureMetrics?.velocity || 0,
    handsHidden: bodyMetrics?.handsHidden || false,
    gestureVariety: Object.keys(gestureMetrics?.gestureCounts || {}).length,
    totalGestures: Object.values(gestureMetrics?.gestureCounts || {}).reduce((a: number, b: number) => a + b, 0),
    smileScore: bodyMetrics?.smileScore || 0,
    overallScore: bodyMetrics?.overallScore || 0,
    currentGestures: gestureMetrics?.currentGestures?.map((g: any) => g.gesture) || [],
    openGestureRatio: gestureMetrics?.openGestureRatio ?? 0,
    handsDetected: gestureMetrics?.handsDetected ?? 0,
  };

  // Stagger GestureRecognizer by 3 seconds after session starts to prevent WASM load crash
  useEffect(() => {
    if (sessionState === 'recording' || isCalibrating) {
      const t = setTimeout(() => setEnableGestures(true), isCalibrating ? 1000 : 5000);
      return () => clearTimeout(t);
    } else {
      setEnableGestures(false);
    }
  }, [isActive, isCalibrating]);



  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (projectId) {
      apiFetch(`/projects/${projectId}`)
        .then(r => r.json())
        .then(data => setProjectTitle(data.title))
        .catch(console.error);
    }
  }, [projectId]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      fullscreenContainerRef.current?.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  };



  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanupMedia();
      if (wsRef.current) wsRef.current.close();
    };
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

  const handleStart = async (feedbackMode: FeedbackMode, persona: Persona, agents: AgentSelection) => {
    setEnabledAgents(agents);
    feedbackModeRef.current = feedbackMode;
    personaRef.current = persona;

    if (!audioContextRef.current) {
      audioContextRef.current = new window.AudioContext({ sampleRate: 16000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(console.error);
    }

    try {
      const { stream, audioStream } = await getMediaStreams(agents);
      if (!stream) return;
      audioStreamRef.current = audioStream;

      const wsUrl = await getWsUrl();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'session_start',
          feedbackMode,
          persona,
          agents,
          projectId
        }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          // ── Server Protocol Messages ──────────────────────────────
          case 'session_started':
            setSessionId(data.sessionId);
            setSessionState('recording');
            setAlerts([]);
            setLiveTranscript('');
            setFeed([{ timestamp: Date.now(), source: 'System', message: 'Multi-agent session started. Delivery + Content + CV agents active.' }]);
            setReport(null);

            // Pass the dedicated audio stream if available, otherwise the webcam stream
            const activeStream = audioStreamRef.current || stream;
            startMediaExtraction(activeStream, ws);
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
            setReport({ ...data.report, projectId: data.projectId });
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
            const isLoud = feedbackModeRef.current === 'loud';

            // NOTE: We no longer call speakText(data.message) here in Loud mode
            // because critical alerts are now routed through the Gemini Live native voice.

            setAlerts(prev => [...prev, {
              id,
              severity: isLoud ? 'critical' : (data.severity || 'info'),
              message: isLoud ? data.message : `[${source}] ${data.message || ''}`,
              timestamp: data.timestamp || Date.now(),
            }]);

            setFeed(prev => [...prev, { timestamp: Date.now(), source, message: `Alert: ${data.message}` }]);
            return;
          }

          // ── Orchestrator Metrics Messages ──────────────────────────
          case 'metrics':
            setSessionMetrics(prev => ({
              pacing: data.pacing ?? prev.pacing,
              filler: data.fillerRate ?? prev.filler,
              totalFillers: data.totalFillers ?? prev.totalFillers,
              fillerWords: data.allFillerWords ?? prev.fillerWords,
              contentScore: data.contentScore ?? prev.contentScore,
              deliveryScore: data.deliveryScore ?? prev.deliveryScore,
            }));
            return;

          // ── Loud Mode Audio Output ────────────────────────────────
          case 'audio_output':
            if (feedbackModeRef.current === 'loud' && data.data) {
              playGeminiAudio(data.data);
            }
            return;

          case 'shark_speak':
            if (data.text) {
              // GEMINI LIVE VOICE: Audio is injected server-side and played via 'audio_output' in Loud mode.
              // In both modes, we show the text as a critical alert.
              const id = `shark-${Date.now()}`;
              setAlerts(prev => [{
                id,
                severity: 'critical' as const,
                message: data.text,
                timestamp: Date.now(),
              }, ...prev].slice(0, 5));
            }
            return;
          // ── Chat Replies ───────────────────────────────────────────
          case 'chat_reply':
            setChatMessages(prev => [...prev, { role: 'gemini', text: data.text }]);
            return;

          // ── Live Transcript ─────────────────────────────────────────
          case 'transcript':
            setLiveTranscript(prev => {
              // Keep only the last 1000 characters to prevent UI lag
              const newTranscript = (prev + ' ' + data.text).trim();
              return newTranscript.slice(-1000);
            });
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
                totalFillers: prev.totalFillers,
                fillerWords: prev.fillerWords,
                contentScore: fc.args?.contentScore ?? prev.contentScore,
                deliveryScore: fc.args?.deliveryScore ?? prev.deliveryScore,
              }));
            }
          }
        }

        // Legacy: handle loud mode audio from raw Gemini messages
        if (feedbackModeRef.current === 'loud' && data.serverContent?.modelTurn?.parts) {
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

  const handleResume = async () => {
    wsRef.current?.send(JSON.stringify({ type: 'session_resume' }));
  };

  const handleEnd = () => {
    cleanupMedia();
    if (projectId) {
      wsRef.current?.send(JSON.stringify({ type: 'session_end' }));
    } else {
      setIsProjectModalOpen(true);
    }
  };

  const handleProjectSelect = (selectedId: string) => {
    setIsProjectModalOpen(false);
    wsRef.current?.send(JSON.stringify({ 
      type: 'session_end', 
      projectId: selectedId 
    }));
  };

  const handleProjectSkip = () => {
    setIsProjectModalOpen(false);
    wsRef.current?.send(JSON.stringify({ type: 'session_end' }));
  };



  const handleNewSession = () => {
    setSessionState('idle');
    setReport(null);
    setSessionId(null);
    setAlerts([]);
    setChatMessages([]);
    setSessionMetrics({ pacing: 0, filler: 0, totalFillers: 0, fillerWords: [], contentScore: 0, deliveryScore: 0 });
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

  const getMediaStreams = async (agents: AgentSelection) => {
    let audioStream: MediaStream | null = null;
    if (agents.speech) {
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (e) {
        console.error("Microphone denied:", e);
      }
    }

    // Wait a bit for the Webcam component to mount if it was hidden
    let attempts = 0;
    while (!webcamRef.current?.video && attempts < 10) {
      await new Promise(r => setTimeout(r, 200));
      attempts++;
    }

    const stream = webcamRef.current?.video?.srcObject as MediaStream | null;
    return { stream, audioStream };
  };

  const startMediaExtraction = async (stream: MediaStream, ws: WebSocket) => {
    const audioCtx = audioContextRef.current;
    if (!audioCtx) return;

    // Ensure there is an active audio track
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      // Create a fresh MediaStream with just the audio track to avoid Chrome muted-video inheritance bugs
      const activeAudioStream = new MediaStream([audioTrack]);
      const source = audioCtx.createMediaStreamSource(activeAudioStream);

      const analyser = audioCtx.createAnalyser();
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);

        // VAD - Direct RMS calculation from float buffer (more reliable than Analyser on some systems)
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);

        if (Math.random() < 0.25) {
          console.log(`[Audio Debug] Mic RMS amplitude: ${rms.toFixed(4)}`);
        }

        if (rms > BARGE_IN_THRESHOLD) {
          ws.send(JSON.stringify({ type: 'barge_in', data: true }));
        }

        if (sessionStateRef.current !== 'recording') return;

        const pcmBase64 = floatTo16BitPcmAndBase64(inputData);
        ws.send(JSON.stringify({ type: 'audio', data: pcmBase64 }));
      };
    }

    // Video + CV telemetry at 1 FPS
    telemetryIntervalRef.current = setInterval(() => {
      if (sessionStateRef.current !== 'recording' || !webcamRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        const base64Data = imageSrc.split(',')[1];
        ws.send(JSON.stringify({ type: 'video', data: base64Data }));
      }

      ws.send(JSON.stringify({
        type: 'client_telemetry',
        data: latestTelemetryRef.current,
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
      <header className="px-8 h-24 flex items-center justify-between bg-white border-b border-neutral-200 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-black text-neutral-900 tracking-tight leading-tight">
            Live Practice
          </h1>
          {projectTitle && (
            <div className="flex items-center gap-2 px-3 py-1 bg-google-blue/5 border border-google-blue/10 rounded-full">
              <Folder className="w-3 h-3 text-google-blue" />
              <span className="text-[10px] font-black uppercase text-google-blue tracking-tight">{projectTitle}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-6">
          <SessionControls
            state={sessionState}
            onStart={handleStart}
            onPause={handlePause}
            onResume={handleResume}
            onEnd={handleEnd}
            onCalibrate={() => {
              setIsCalibrating(true);
              setIsFullscreen(true);
            }}
            hasBaseline={!!posturalBaseline}
          />
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row p-8 gap-8 max-w-[1600px] mx-auto w-full animate-in fade-in duration-700">
        {/* Left Section: Video & Active Insights */}
        <section className={`flex-1 flex flex-col gap-6 w-full ${isFullscreen ? 'fixed inset-0 z-50 !p-0 bg-black' : ''}`} ref={fullscreenContainerRef}>
          <div className={`relative overflow-hidden bg-black flex items-center justify-center group ${isFullscreen ? 'w-full h-full rounded-none' : 'rounded-lg border border-neutral-200 aspect-video shadow-sm'}`}>
            {(sessionState === 'recording' || sessionState === 'idle' || isCalibrating || sessionState === 'paused') && (
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={{ width: 1280, height: 720, facingMode: "user" }}
                className="w-full h-full object-cover transition-transform duration-700"
                muted={true}
              />
            )}
            <canvas
              ref={overlayCanvasRef}
              className={`absolute inset-0 w-full h-full z-10 pointer-events-none object-cover transition-opacity duration-300 ${showSkeleton ? 'opacity-80' : 'opacity-0'}`}
            />

            {/* Fullscreen Toggle Button */}
            {!isCalibrating && (
              <div className="absolute bottom-4 right-4 z-40 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setShowSkeleton(!showSkeleton)}
                  className={`p-2 rounded backdrop-blur-md transition-all ${showSkeleton ? 'bg-google-blue text-white shadow-lg shadow-google-blue/20' : 'bg-black/50 text-white/70 hover:bg-black/70'}`}
                  title="remove tracking"
                >
                  <ActivitySquare className={`w-5 h-5 ${showSkeleton ? 'animate-pulse' : ''}`} />
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="p-2 bg-black/50 hover:bg-black/70 rounded text-white backdrop-blur-md transition-colors"
                  title="full screen"
                >
                  {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                </button>
              </div>
            )}

            {/* Floating Fullscreen Controls */}
            {isFullscreen && isActive && (
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 flex items-center gap-6 px-6 py-4 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full shadow-2xl animate-in slide-in-from-bottom-10 duration-500 opacity-0 group-hover:opacity-100 transition-opacity">
                {sessionState === 'recording' ? (
                  <button
                    onClick={handlePause}
                    className="w-14 h-14 flex items-center justify-center rounded-full bg-white text-neutral-900 hover:scale-110 transition-all active:scale-90"
                    title="Pause Session"
                  >
                    <Pause className="w-6 h-6 fill-neutral-900" />
                  </button>
                ) : (
                  <button
                    onClick={handleResume}
                    className="w-14 h-14 flex items-center justify-center rounded-full bg-neutral-900 text-white border border-white/20 hover:scale-110 transition-all active:scale-90"
                    title="Resume Session"
                  >
                    <Play className="w-6 h-6 fill-white translate-x-0.5" />
                  </button>
                )}
                <button
                  onClick={handleEnd}
                  className="w-14 h-14 flex items-center justify-center rounded-full bg-google-red text-white hover:scale-110 transition-all active:scale-90"
                  title="Stop & Analyze"
                >
                  <Square className="w-6 h-6 fill-white" />
                </button>
              </div>
            )}

            {/* Status Badges - Material Design Style */}
            <div className="absolute top-6 left-6 flex flex-col gap-3 z-20">
              {isActive && (
                <>
                  <div className="px-4 py-2 bg-white/90 backdrop-blur-xl rounded-lg shadow-sm border border-neutral-200 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-google-green animate-pulse" />
                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-700">
                      LIVE FEEDBACK ACTIVE
                    </span>
                  </div>
                  <div className="px-4 py-2 bg-white/90 backdrop-blur-xl rounded-lg shadow-sm border border-neutral-200 flex items-center gap-2">
                    <span className="text-[11px] font-black tracking-wider text-google-blue">{Object.values(enabledAgents).filter(Boolean).length} AGENT{Object.values(enabledAgents).filter(Boolean).length !== 1 ? 'S' : ''} MONITORING</span>
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

            {/* Show Analytics Toggle (when hidden) */}
            {!isFullscreen && !showAnalytics && (
              <button
                onClick={() => setShowAnalytics(true)}
                className="absolute top-6 right-6 z-40 flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-md border border-neutral-200 rounded-lg shadow-sm text-neutral-600 hover:text-neutral-900 hover:bg-white transition-all animate-in slide-in-from-right-5 duration-300 font-bold text-[11px] tracking-wider uppercase"
              >
                <LayoutDashboard className="w-4 h-4" />
                SHOW ANALYTICS
              </button>
            )}

            <ProjectSelectionModal
              isOpen={isProjectModalOpen}
              onClose={() => setIsProjectModalOpen(false)}
              onSelect={handleProjectSelect}
              onSkip={handleProjectSkip}
            />

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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {enabledAgents.posture && <QuickMetric label="Posture Angle" value={`${bodyMetrics.postureAngle}°`} color="blue" />}
              {enabledAgents.eyeContact && <QuickMetric label="Gaze Contact" value={`${realTimeEyeContact}%`} color="green" />}
              {enabledAgents.gestures && <QuickMetric label="Hand Energy" value={gestureMetrics?.velocity || 0} color="amber" />}
              {enabledAgents.speech && <QuickMetric label="Pacing (WPM)" value={sessionMetrics.pacing || '--'} color="amber" />}
              {enabledAgents.speech && <QuickMetric label="Filler Rate" value={`${sessionMetrics.filler}/min`} color="red" />}
            </div>
          )}

        </section>

        {/* Right Section: Session Analytics */}
        {!isFullscreen && showAnalytics && (
          <aside className="w-full lg:w-[400px] flex flex-col gap-6 animate-in slide-in-from-right-10 duration-700">
            <div className="bg-white shadow-sm border border-neutral-200 rounded-2xl overflow-hidden flex flex-col h-full">
              <div className="p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50 group/header">
                <h2 className="text-xl font-black text-neutral-900 tracking-tight leading-tight">
                  Session Analytics
                </h2>
                <button 
                  onClick={() => setShowAnalytics(false)}
                  className="p-2 rounded-lg hover:bg-neutral-200 text-neutral-400 hover:text-neutral-600 transition-all"
                  title="Hide Analytics"
                >
                  <PanelRightClose className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar">
                {/* Overall Score - High Visibility at top */}
                {enabledAgents.speech && (
                  <section className="flex items-center justify-between p-6 bg-neutral-900 rounded-2xl text-white relative overflow-hidden group">
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">Session PR</h3>
                      <h4 className="text-xl font-black tracking-tight">Overall Rating</h4>
                    </div>
                    <div className="relative w-20 h-20 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="40" cy="40" r="35" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-white/10" />
                        <circle
                          cx="40" cy="40" r="35" stroke="currentColor" strokeWidth="5" fill="transparent"
                          strokeDasharray={219.9}
                          strokeDashoffset={219.9 - (219.9 * bodyMetrics.overallScore) / 100}
                          className={`transition-all duration-1000 ${bodyMetrics.overallScore >= 70 ? 'text-google-green' : bodyMetrics.overallScore >= 40 ? 'text-google-blue' : 'text-google-red'}`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl font-black">{bodyMetrics.overallScore}</span>
                      </div>
                    </div>
                  </section>
                )}

                {/* Visual Performance Section */}
                {(enabledAgents.eyeContact || enabledAgents.posture || enabledAgents.gestures) && (
                  <section>
                    <SectionHeader icon={<Eye className="w-5 h-5 text-neutral-900" />} title="Visual Presence" subtitle="Real-time Body Language" />
                    <div className="space-y-3.5 pt-2">
                      {enabledAgents.eyeContact && <MetricRow label="Eye Contact" value={`${realTimeEyeContact}%`} good={realTimeEyeContact > 70} />}
                      {enabledAgents.posture && (
                        <>
                          <MetricRow label="Posture Status" value={bodyMetrics.isGoodPosture ? 'Upright' : 'Slouching'} good={bodyMetrics.isGoodPosture} />
                          <MetricRow label="Neck Stability" value={`${Math.round(bodyMetrics.neckStability * 100)}%`} good={bodyMetrics.neckStability > 0.98} />
                          <MetricRow label="Shoulder Sweep" value={`${Math.round(bodyMetrics.shoulderExpansion * 100)}%`} good={bodyMetrics.shoulderExpansion > 0.9} />
                        </>
                      )}
                      <MetricRow label="Smile Intensity" value={`${Math.round(bodyMetrics.smileScore * 100)}%`} good={bodyMetrics.smileScore > 0.3} />
                      {enabledAgents.gestures && (
                        <>
                          <MetricRow
                            label="Gesture Variety"
                            value={`${Object.keys(gestureMetrics?.gestureCounts || {}).length} types`}
                            good={Object.keys(gestureMetrics?.gestureCounts || {}).length >= 3}
                            color="text-google-purple"
                          />
                          <MetricRow
                            label="Hand Energy"
                            value={`${Math.round(gestureMetrics?.velocity || 0)}/100`}
                            good={(gestureMetrics?.velocity || 0) < 70}
                            color="text-google-purple"
                          />
                        </>
                      )}
                    </div>
                  </section>
                )}

                {/* Verbal Performance Section */}
                {enabledAgents.speech && (
                  <section>
                    <SectionHeader icon={<Mic className="w-5 h-5 text-neutral-900" />} title="Vocal Metrics" subtitle="Delivery & Fluency" />
                    <div className="space-y-3.5 pt-2">
                      <MetricRow label="Pacing (WPM)" value={sessionMetrics.pacing > 0 ? `${sessionMetrics.pacing}` : '--'} good={sessionMetrics.pacing > 120 && sessionMetrics.pacing < 160} />
                      <MetricRow label="Filler Words" value={`${sessionMetrics.totalFillers} total`} good={sessionMetrics.totalFillers < 10} />
                      {sessionMetrics.fillerWords.length > 0 && (
                        <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="flex flex-wrap gap-1.5">
                            {Array.from(new Set(sessionMetrics.fillerWords)).map((word, i) => (
                              <span key={i} className="px-2 py-0.5 bg-neutral-50 border border-neutral-200 rounded text-[9px] font-mono text-neutral-500">
                                {word} <span className="text-google-red font-black">x{sessionMetrics.fillerWords.filter(w => w === word).length}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* Live Transcript Section */}
                {enabledAgents.speech && (
                  <section>
                    <SectionHeader icon={<Terminal className="w-5 h-5 text-neutral-900" />} title="Live Transcript" subtitle="Real-time Stream" />
                    <div className="mt-4 p-5 bg-neutral-50 rounded-2xl border border-neutral-200 min-h-[160px] max-h-[300px] overflow-y-auto custom-scrollbar group relative">
                      <div className="absolute top-3 right-3">
                        <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-google-green animate-pulse' : 'bg-neutral-300'}`} />
                      </div>
                      <p className="text-xs font-mono text-neutral-600 leading-relaxed">
                        <span className="text-neutral-300 mr-2">$</span>
                        {liveTranscript || (isActive ? 'System ready. Listening...' : 'Session idle.')}
                        {isActive && <span className="inline-block w-1.5 h-3 bg-google-green/40 ml-1 animate-pulse" />}
                      </p>
                    </div>
                  </section>
                )}
              </div>

              {/* Sidebar footer branding */}
              <div className="p-6 bg-neutral-50/50 border-t border-neutral-100 flex items-center justify-end">
                <div className="flex gap-1">
                  <div className="w-1 h-1 rounded-full bg-google-blue" />
                  <div className="w-1 h-1 rounded-full bg-google-red" />
                  <div className="w-1 h-1 rounded-full bg-google-yellow" />
                  <div className="w-1 h-1 rounded-full bg-google-green" />
                </div>
              </div>
            </div>
          </aside>
        )}
      </main>

      {isCalibrating && (
        <PostureCalibrationOverlay
          landmarksRef={landmarksRef}
          gestureMetrics={gestureMetrics}
          onComplete={(baseline: PostureBaseline) => {
            setPosturalBaseline(baseline);
            setIsCalibrating(false);
            setIsFullscreen(false);
          }}
          onCancel={() => {
            setIsCalibrating(false);
            setIsFullscreen(false);
          }}
        />
      )}
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
