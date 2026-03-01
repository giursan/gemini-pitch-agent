'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { useEyeContact } from '../hooks/useEyeContact';

// Lightweight utility to convert Float32Array to 16-bit PCM Base64
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

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  // We manage CV metrics locally now, and qualitative metrics via Gemini
  const [cvMetrics, setCvMetrics] = useState({ eyeContact: 100, isSlouching: false });
  const [sessionMetrics, setSessionMetrics] = useState({ pacing: 0, filler: 0 });
  const [alerts, setAlerts] = useState<{ type: string, msg: string }[]>([]);

  const webcamRef = useRef<Webcam>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Call the MediaPipe CV hook with the overlay canvas
  const realTimeEyeContact = useEyeContact(webcamRef as any || { current: null }, overlayCanvasRef);

  // Audio & VAD Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const telemetryIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const BARGE_IN_THRESHOLD = 0.05; // Audio level threshold

  // Cleanup on unmount
  useEffect(() => {
    return () => stopSession();
  }, []);

  const stopSession = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    if (telemetryIntervalRef.current) clearInterval(telemetryIntervalRef.current);
    if (audioContextRef.current) audioContextRef.current.close();
    setIsConnected(false);
  }, []);

  const toggleConnection = async () => {
    if (isConnected) {
      stopSession();
    } else {
      await startSession();
    }
  };

  const startSession = async () => {
    try {
      if (!webcamRef.current?.video) return;
      const stream = webcamRef.current.video.srcObject as MediaStream;

      // Connect WebSocket
      const ws = new WebSocket('ws://localhost:8080'); // Hardcoded for local dev MVP
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log("Connected to local backend proxy");
        startMediaExtraction(stream, ws);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        // Example handling of Agentic UI Updates from Gemini function calls
        if (data.serverContent?.modelTurn) {
          // Agent is speaking
        } else if (data.toolCall) {
          // Gemini emitted an overlay tool call!
          const args = data.toolCall.functionCalls[0].args;
          if (args.type === "alert" || data.toolCall.functionCalls[0].name === "emit_alert") {
            setAlerts(prev => [...prev.slice(-2), { type: args.severity, msg: args.message }]);
          } else if (args.type === "metrics" || data.toolCall.functionCalls[0].name === "update_metrics") {
            // Ignore eyeContact from Gemini now, we use CV
            setSessionMetrics({ pacing: args.pacing || sessionMetrics.pacing, filler: args.filler || sessionMetrics.filler });
          }
        }
      };

      ws.onclose = stopSession;
    } catch (err) {
      console.error("Error starting session", err);
    }
  };

  const startMediaExtraction = (stream: MediaStream, ws: WebSocket) => {
    // 1. Audio and VAD Extraction
    const audioCtx = new window.AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioCtx;

    // We get the audio track specifically
    const audioStream = new MediaStream(stream.getAudioTracks());
    if (audioStream.getAudioTracks().length === 0) {
      console.warn("No audio tracks found in stream.");
      // We can continue running CV even without audio for testing
    } else {
      const source = audioCtx.createMediaStreamSource(audioStream);
      const analyser = audioCtx.createAnalyser();
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      analyserRef.current = analyser;

      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);

        // VAD logic: detect if user is interrupting
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

        // Send PCM Base64 chunks to Gemini
        const pcmBase64 = floatTo16BitPcmAndBase64(inputData);
        ws.send(JSON.stringify({ type: 'audio', data: pcmBase64 }));
      };
    }

    // 2. Video Context & Telemetry (1 FPS)
    // We send BOTH the raw frame (for semantic agentic understanding) AND the CV telemetry
    telemetryIntervalRef.current = setInterval(() => {
      if (webcamRef.current) {
        const imageSrc = webcamRef.current.getScreenshot();
        if (imageSrc) {
          const base64Data = imageSrc.split(',')[1];
          // Send vision frame for semantics (e.g. "What is written on the whiteboard behind me?")
          ws.send(JSON.stringify({ type: 'video', data: base64Data }));
        }

        // Send deterministic CV telemetry to guide the LLM
        ws.send(JSON.stringify({
          type: 'client_telemetry',
          data: {
            eyeContact: realTimeEyeContact
          }
        }));
      }
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-[family-name:var(--font-geist-sans)]">
      <header className="px-6 py-4 flex items-center justify-between border-b border-white/10">
        <h1 className="text-xl font-semibold tracking-tight text-white/90">Aura <span className="text-white/50 font-normal">Mentor</span></h1>
        <button
          onClick={toggleConnection}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${isConnected ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-white text-black hover:bg-neutral-200'}`}
        >
          {isConnected ? 'End Session' : 'Start Practice'}
        </button>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row p-6 gap-6 max-w-7xl mx-auto w-full">
        <section className="flex-1 flex flex-col gap-4">
          <div className="relative rounded-2xl overflow-hidden bg-neutral-900 aspect-video ring-1 ring-white/10 flex items-center justify-center shadow-2xl relative">
            <Webcam
              audio={true}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={{ width: 1280, height: 720, facingMode: "user" }}
              className="w-full h-full object-cover"
              muted={true} // Mututed locally to prevent feedback loop
            />
            {/* CV Overlay Canvas */}
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full z-10 pointer-events-none object-cover"
            />
            {isConnected && (
              <div className="absolute top-4 left-4 flex gap-2">
                <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-xs font-mono font-medium text-emerald-400 border border-emerald-500/30 animate-pulse">
                  ● LIVE AI
                </span>
                <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-xs font-mono font-medium text-blue-400 border border-blue-500/30">
                  CV ENABLED
                </span>
              </div>
            )}
          </div>

          <div className="h-24 bg-neutral-900 border border-white/5 rounded-xl p-4 flex items-center shadow-inner overflow-hidden">
            {alerts.length > 0 ? (
              <div className="space-y-1 w-full">
                {alerts.map((a, i) => (
                  <p key={i} className={`text-sm font-medium ${a.type === 'critical' || a.type === 'warning' ? 'text-amber-400' : 'text-blue-400'}`}>
                    {a.type.toUpperCase()}: {a.msg}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-neutral-400 text-sm font-mono italic">Awaiting feedback...</p>
            )}
          </div>
        </section>

        <aside className="w-full lg:w-80 flex flex-col gap-4">
          <div className="bg-neutral-900 border border-white/5 p-5 rounded-2xl shadow-lg flex-1">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-500 mb-4">Live Metrics</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                <span className="text-neutral-400">Eye Contact (CV)</span>
                <span className={`font-mono font-bold ${realTimeEyeContact > 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {realTimeEyeContact}%
                </span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                <span className="text-neutral-400">Pacing (WPM)</span>
                <span className={`font-mono font-bold ${sessionMetrics.pacing > 120 && sessionMetrics.pacing < 160 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {sessionMetrics.pacing > 0 ? sessionMetrics.pacing : '--'}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm pb-2">
                <span className="text-neutral-400">Filler Words</span>
                <span className={`font-mono font-bold ${sessionMetrics.filler < 5 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {sessionMetrics.filler} / min
                </span>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
