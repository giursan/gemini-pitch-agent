'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FolderPlus,
  Settings2,
  Bot,
  Zap,
  BarChart3,
  MessageSquareText,
  CheckCircle2,
  ArrowRight,
  Eye,
  Speech,
  Brain,
  Volume2,
  VolumeX,
  Swords,
  HeartHandshake,
  Sparkles,
  Video,
  PauseCircle,
  FileText,
  Target
} from 'lucide-react';

export default function HowItWorks() {
  const [activePersona, setActivePersona] = useState<'mentor' | 'evaluator' | 'shark' | 'basic'>('mentor');
  const [analyseVisuals, setAnalyseVisuals] = useState(true);
  const [analyseDelivery, setAnalyseDelivery] = useState(true);
  const [analyseContent, setAnalyseContent] = useState(true);
  const [feedbackChannel, setFeedbackChannel] = useState<'loud' | 'silent'>('loud');
  const [activeAlertIndex, setActiveAlertIndex] = useState(0);

  const fakeAlerts = [
    { icon: Zap, color: 'text-google-yellow', text: 'Pacing Alert: Slow down' },
    { icon: Eye, color: 'text-google-blue', text: 'Visuals: Maintain eye contact' },
    { icon: Speech, color: 'text-google-green', text: 'Delivery: Filler "um" detected' },
  ];

  // Auto-toggle persona for the demo animation
  useEffect(() => {
    const personas: ('mentor' | 'evaluator' | 'shark' | 'basic')[] = ['mentor', 'evaluator', 'shark', 'basic'];
    const interval = setInterval(() => {
      setActivePersona(prev => personas[(personas.indexOf(prev) + 1) % personas.length]);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Auto-toggle fake alerts
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveAlertIndex(prev => (prev + 1) % fakeAlerts.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen mesh-background overflow-hidden selection:bg-google-blue/20 selection:text-google-blue">
      {/* ── HERO SECTION ── */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.03]"></div>

        <div className="max-w-5xl mx-auto px-6 relative z-10 text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-neutral-900 tracking-tighter leading-[0.9] mb-8">
            Pursuit the <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-google-blue via-google-purple to-google-red">
              perfect pitch.
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-neutral-500 max-w-3xl mx-auto font-medium leading-relaxed mb-12">
            Aura bridges the gap between raw ideas and masterful delivery. Discover how our multi-agent architecture transforms your practice sessions into a continuous growth loop.
          </p>
        </div>
      </section>

      {/* ── THE RATIONALE / BACKGROUND ── */}
      <section className="py-24 relative z-20 border-y border-neutral-200/50 bg-white/40 backdrop-blur-3xl">
        <div className="max-w-6xl mx-auto px-6 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300 fill-mode-both">
          <div className="flex flex-col md:flex-row gap-16 items-start">
            <div className="flex-1 sticky top-32">
              <h2 className="text-4xl md:text-5xl font-black text-neutral-900 tracking-tight mb-6 leading-[1.1]">
                Beyond standard video recording.
              </h2>
              <div className="w-20 h-2 bg-gradient-to-r from-google-blue via-google-purple to-google-red rounded-full opacity-80"></div>
              <p className="mt-8 text-xl text-neutral-500 font-medium leading-relaxed">
                Aura doesn't just surface metrics; it understands the semantic context of your unique presentation layer.
              </p>
            </div>
            <div className="flex-1 space-y-10">
              <div className="flex gap-5 group">
                <div className="mt-1 w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center shrink-0 group-hover:bg-google-red/10 group-hover:scale-110 transition-all duration-300">
                  <Settings2 className="w-6 h-6 text-neutral-400 group-hover:text-google-red transition-colors" />
                </div>
                <div>
                  <h4 className="font-black text-neutral-900 text-xl tracking-tight mb-2">The Latency of Improvement</h4>
                  <p className="text-neutral-600 text-lg font-medium leading-relaxed">
                    Traditional practice relies on recording yourself and guessing what went wrong, or pinging colleagues for biased feedback. This creates a massive, frustrating gap between practicing and actually improving.
                  </p>
                </div>
              </div>

              <div className="flex gap-5 group">
                <div className="mt-1 w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center shrink-0 group-hover:bg-google-blue/10 group-hover:scale-110 transition-all duration-300">
                  <Brain className="w-6 h-6 text-neutral-400 group-hover:text-google-blue transition-colors" />
                </div>
                <div>
                  <h4 className="font-black text-neutral-900 text-xl tracking-tight mb-2">The Edge AI Agent Swarm</h4>
                  <p className="text-neutral-600 text-lg font-medium leading-relaxed">
                    Aura solves this by deploying an autonomous <span className="text-google-blue font-bold">Swarm of AI agents</span> directly to your browser edge. They monitor every micro-expression, vocal cadence, and logical transition in real-time.
                  </p>
                </div>
              </div>

              <div className="flex gap-5 group">
                <div className="mt-1 w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center shrink-0 group-hover:bg-google-green/10 group-hover:scale-110 transition-all duration-300">
                  <Target className="w-6 h-6 text-neutral-400 group-hover:text-google-green transition-colors" />
                </div>
                <div>
                  <h4 className="font-black text-neutral-900 text-xl tracking-tight mb-2">Verifiable Conviction</h4>
                  <p className="text-neutral-600 text-lg font-medium leading-relaxed">
                    The result is a rigorous, closed feedback loop. You receive actionable data immediately, transforming raw presentation anxiety into absolute, verifiable conviction before you ever step onto a stage.
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ── THE 5-STEP JOURNEY ── */}
      <section className="py-20 relative">
        <div className="max-w-6xl mx-auto px-6">
          <div className="space-y-32">

            {/* STEP 1: Core Context */}
            <div className="flex flex-col lg:flex-row gap-16 items-center">
              <div className="flex-1 order-2 lg:order-1 relative group">
                <div className="absolute inset-0 bg-google-blue/10 blur-[60px] rounded-full transform group-hover:scale-110 transition-transform duration-700"></div>
                <div className="glass-card p-10 rounded-[40px] border border-white/60 relative overflow-hidden shadow-2xl shadow-neutral-900/5">
                  <div className="absolute -top-10 -right-10 w-40 h-40 bg-google-blue/10 rounded-full blur-2xl"></div>
                  <FolderPlus className="w-16 h-16 text-google-blue mb-8" />
                  <h3 className="text-3xl font-black text-neutral-900 tracking-tight mb-4">Initialize the Brain</h3>
                  <p className="text-lg text-neutral-600 font-medium leading-relaxed mb-8">
                    Start by creating a dedicated Project. Because a pitch to investors is vastly different from a keynote speech, context is everything. Upload your slide decks, PDFs, or research materials into the Context Engine. Aura consumes this data to ground its feedback in your actual reality.
                  </p>
                  <ul className="space-y-4">
                    {["Upload rich context materials", "Define exact presentation goals", "Isolate context per-project context"].map((item, i) => (
                      <li key={i} className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-google-blue shrink-0" />
                        <span className="text-sm font-bold text-neutral-800">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex-1 order-1 lg:order-2">
                <div className="flex items-center gap-4 mb-4">
                  <span className="px-4 py-1.5 rounded-full bg-google-blue/10 text-google-blue text-xs font-black uppercase tracking-widest border border-google-blue/20">Phase 01</span>
                </div>
                <h2 className="text-4xl lg:text-5xl font-black text-neutral-900 tracking-tight mb-6">
                  Project Creation & Context
                </h2>
                <p className="text-xl text-neutral-500 font-medium leading-relaxed">
                  Before you even turn on your camera, you establish the rules of engagement. By feeding Aura your source materials, the AI knows exactly what you <span className="italic">should</span> be saying.
                </p>
              </div>
            </div>

            {/* STEP 2: Session Configuration (Highly Visual) */}
            <div className="glass-card rounded-[48px] p-8 md:p-16 border-2 border-white shadow-xl shadow-google-purple/5 relative overflow-hidden">
              <div className="absolute -top-40 -left-40 w-96 h-96 bg-google-purple/10 rounded-full blur-[100px] pointer-events-none"></div>

              <div className="text-center max-w-3xl mx-auto mb-16 relative z-10">
                <span className="px-4 py-1.5 rounded-full bg-google-purple/10 text-google-purple text-xs font-black uppercase tracking-widest border border-google-purple/20 mb-6 inline-block">Phase 02</span>
                <h2 className="text-4xl lg:text-5xl font-black text-neutral-900 tracking-tight mb-6">
                  Session Configuration
                </h2>
                <p className="text-xl text-neutral-500 font-medium leading-relaxed">
                  Every practice session is highly modular. Tailor what the agents analyze and exactly how they deliver feedback to match your current training goals.
                </p>
              </div>

              {/* The Configuration Showcase Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
                {/* Visuals / Delivery / Content */}
                <div className="bg-white rounded-[32px] p-8 shadow-sm border border-neutral-100/50 hover:border-google-blue/30 transition-all flex flex-col">
                  <h4 className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-6">Analysis Dimensions</h4>
                  <div className="space-y-4 mb-6">
                    <button onClick={() => setAnalyseVisuals(!analyseVisuals)} className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${analyseVisuals ? 'bg-google-blue/5 border-google-blue/30 shadow-sm' : 'bg-neutral-50 border-neutral-200'}`}>
                      <div className="flex items-center gap-3"><Eye className={`w-5 h-5 transition-colors ${analyseVisuals ? 'text-google-blue' : 'text-neutral-400'}`} /><span className={`text-sm font-bold transition-colors ${analyseVisuals ? 'text-google-blue' : 'text-neutral-500'}`}>Visuals</span></div>
                      <div className={`w-10 h-6 rounded-full relative transition-colors ${analyseVisuals ? 'bg-google-blue' : 'bg-neutral-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${analyseVisuals ? 'right-1' : 'left-1 shadow-sm'}`}></div></div>
                    </button>
                    <button onClick={() => setAnalyseDelivery(!analyseDelivery)} className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${analyseDelivery ? 'bg-google-green/5 border-google-green/30 shadow-sm' : 'bg-neutral-50 border-neutral-200'}`}>
                      <div className="flex items-center gap-3"><Speech className={`w-5 h-5 transition-colors ${analyseDelivery ? 'text-google-green' : 'text-neutral-400'}`} /><span className={`text-sm font-bold transition-colors ${analyseDelivery ? 'text-google-green' : 'text-neutral-500'}`}>Delivery</span></div>
                      <div className={`w-10 h-6 rounded-full relative transition-colors ${analyseDelivery ? 'bg-google-green' : 'bg-neutral-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${analyseDelivery ? 'right-1' : 'left-1 shadow-sm'}`}></div></div>
                    </button>
                    <button onClick={() => setAnalyseContent(!analyseContent)} className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${analyseContent ? 'bg-google-purple/5 border-google-purple/30 shadow-sm' : 'bg-neutral-50 border-neutral-200'}`}>
                      <div className="flex items-center gap-3"><Brain className={`w-5 h-5 transition-colors ${analyseContent ? 'text-google-purple' : 'text-neutral-400'}`} /><span className={`text-sm font-bold transition-colors ${analyseContent ? 'text-google-purple' : 'text-neutral-500'}`}>Content</span></div>
                      <div className={`w-10 h-6 rounded-full relative transition-colors ${analyseContent ? 'bg-google-purple' : 'bg-neutral-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${analyseContent ? 'right-1' : 'left-1 shadow-sm'}`}></div></div>
                    </button>
                  </div>
                </div>

                {/* Feedback Mode */}
                <div className="bg-white rounded-[32px] p-8 shadow-sm border border-neutral-100/50 hover:border-google-yellow/30 transition-all flex flex-col">
                  <h4 className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-6">Feedback Channel</h4>
                  <div className="flex-1 flex flex-col justify-center gap-4">
                    <button
                      onClick={() => setFeedbackChannel('loud')}
                      className={`group relative p-6 rounded-[24px] border-2 transition-all cursor-pointer overflow-hidden text-left ${feedbackChannel === 'loud' ? 'border-google-yellow bg-google-yellow/5' : 'border-transparent bg-neutral-50 hover:bg-neutral-100'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center shrink-0 transition-transform ${feedbackChannel === 'loud' ? 'scale-110' : ''}`}>
                          <Volume2 className={`w-6 h-6 transition-colors ${feedbackChannel === 'loud' ? 'text-google-yellow' : 'text-neutral-400'}`} />
                        </div>
                        <div>
                          <h5 className={`font-black transition-colors ${feedbackChannel === 'loud' ? 'text-neutral-900' : 'text-neutral-600'}`}>Loud Interruptions</h5>
                          <p className="text-xs text-neutral-500 font-medium mt-1">Coach interrupts you with audio</p>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => setFeedbackChannel('silent')}
                      className={`group relative p-6 rounded-[24px] border-2 transition-all cursor-pointer text-left ${feedbackChannel === 'silent' ? 'border-google-yellow bg-google-yellow/5' : 'border-transparent bg-neutral-50 hover:bg-neutral-100'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center shrink-0 transition-transform ${feedbackChannel === 'silent' ? 'scale-110' : ''}`}>
                          <VolumeX className={`w-6 h-6 transition-colors ${feedbackChannel === 'silent' ? 'text-google-yellow' : 'text-neutral-400'}`} />
                        </div>
                        <div>
                          <h5 className={`font-black transition-colors ${feedbackChannel === 'silent' ? 'text-neutral-900' : 'text-neutral-600'}`}>Silent Nudges</h5>
                          <p className="text-xs text-neutral-500 font-medium mt-1">Non-intrusive visual alerts only</p>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Persona Selection (Animated Demo) */}
                <div className="bg-neutral-900 rounded-[32px] p-8 shadow-2xl relative overflow-hidden flex flex-col justify-between">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent"></div>
                  <div className="relative z-10 flex justify-between items-center mb-8">
                    <h4 className="text-xs font-black text-neutral-400 uppercase tracking-widest">Active Persona</h4>
                    <Sparkles className="w-4 h-4 text-google-blue animate-pulse" />
                  </div>

                  <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
                    <div className="relative w-full h-40">
                      {/* Mentor Mode */}
                      <div className={`absolute inset-0 transition-all duration-700 flex flex-col items-center justify-center text-center ${activePersona === 'mentor' ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-8 pointer-events-none'}`}>
                        <div className="w-16 h-16 bg-google-green/20 rounded-2xl flex items-center justify-center border border-google-green/30 mb-4 shadow-[0_0_30px_rgba(26,162,96,0.3)]">
                          <HeartHandshake className="w-8 h-8 text-google-green" />
                        </div>
                        <h5 className="text-xl font-black text-white mb-2">The Mentor</h5>
                        <p className="text-xs text-white/50 font-medium leading-relaxed">Friendly, encouraging, and constructive presentation coach.</p>
                      </div>

                      {/* Evaluator Mode */}
                      <div className={`absolute inset-0 transition-all duration-700 flex flex-col items-center justify-center text-center ${activePersona === 'evaluator' ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-8 pointer-events-none'}`}>
                        <div className="w-16 h-16 bg-google-blue/20 rounded-2xl flex items-center justify-center border border-google-blue/30 mb-4 shadow-[0_0_30px_rgba(26,115,232,0.3)]">
                          <BarChart3 className="w-8 h-8 text-google-blue" />
                        </div>
                        <h5 className="text-xl font-black text-white mb-2">The Evaluator</h5>
                        <p className="text-xs text-white/50 font-medium leading-relaxed">Neutral, objective, structured, and strictly data-driven.</p>
                      </div>

                      {/* Shark Mode */}
                      <div className={`absolute inset-0 transition-all duration-700 flex flex-col items-center justify-center text-center ${activePersona === 'shark' ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-8 pointer-events-none'}`}>
                        <div className="w-16 h-16 bg-google-red/20 rounded-2xl flex items-center justify-center border border-google-red/30 mb-4 shadow-[0_0_30px_rgba(217,48,37,0.3)]">
                          <Swords className="w-8 h-8 text-google-red" />
                        </div>
                        <h5 className="text-xl font-black text-white mb-2">Shark Mode</h5>
                        <p className="text-xs text-white/50 font-medium leading-relaxed">Brutal scrutiny, extremely direct, interrupts frequently.</p>
                      </div>

                      {/* Basic Mode */}
                      <div className={`absolute inset-0 transition-all duration-700 flex flex-col items-center justify-center text-center ${activePersona === 'basic' ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-8 pointer-events-none'}`}>
                        <div className="w-16 h-16 bg-neutral-600/20 rounded-2xl flex items-center justify-center border border-neutral-600/30 mb-4 shadow-[0_0_30px_rgba(115,115,115,0.3)]">
                          <Bot className="w-8 h-8 text-neutral-400" />
                        </div>
                        <h5 className="text-xl font-black text-white mb-2">Basic Assistant</h5>
                        <p className="text-xs text-white/50 font-medium leading-relaxed">Flat, robotic, and neutral. Repeats directives precisely.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic Summary Text */}
              <div className="mt-12 flex items-center justify-center px-4">
                <p className="text-xl md:text-xl text-neutral-500 font-medium leading-relaxed text-center max-w-4xl transition-all animate-in fade-in zoom-in-95 duration-500" key={`${analyseVisuals}-${analyseDelivery}-${analyseContent}-${feedbackChannel}`}>
                  {(!analyseVisuals && !analyseDelivery && !analyseContent) ?
                    <>No dimensions selected. Aura will function as a standard <span className="text-neutral-700 font-black">silent camera</span> without intelligent interference.</> :
                    <>
                      Aura will analyze your{" "}
                      {analyseVisuals && <span className="font-black text-google-blue">expansive posture and consistent eye contact</span>}
                      {analyseVisuals && (analyseDelivery || analyseContent) && (analyseDelivery && analyseContent ? ", " : " and ")}
                      {analyseDelivery && <span className="font-black text-google-green">vocal pacing and reduction of filler words</span>}
                      {analyseDelivery && analyseContent && (analyseVisuals ? ", and " : " and ")}
                      {analyseContent && <span className="font-black text-google-purple">persuasive logical flow and semantic structure</span>}
                      . It will guide you via <span className="font-black text-google-yellow">
                        {feedbackChannel === 'loud' ? "loud, conversational audio interruptions" : "silent, color-coded visual nudges"}
                      </span>.
                    </>
                  }
                </p>
              </div>

            </div>

            {/* STEP 3: Multi-Agent Coaching */}
            <div className="flex flex-col lg:flex-row gap-16 items-center">
              <div className="flex-1 order-2 lg:order-1 relative group w-full">
                <div className="absolute inset-0 bg-google-yellow/10 blur-[60px] rounded-full transform group-hover:scale-110 transition-transform duration-700"></div>
                <div className="glass-card p-2 rounded-[40px] border border-white/60 relative overflow-hidden shadow-2xl shadow-neutral-900/5 aspect-video flex items-center justify-center bg-neutral-900">
                  {/* Abstract representation of the practice screen */}
                  <div className="absolute inset-2 rounded-[32px] border border-white/10 overflow-hidden bg-neutral-800">
                    <div className="absolute top-4 left-4 flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-google-red animate-pulse"></div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-white/50">Recording</div>
                    </div>

                    {/* Fake Person Mesh */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-40">
                      <svg className="w-64 h-full" viewBox="0 0 100 150" fill="none" strokeWidth="1.5">
                        <style>{`
                           @keyframes sway {
                             0%, 100% { transform: rotate(0deg); }
                             50% { transform: rotate(8deg); }
                           }
                           @keyframes waveLeft {
                             0%, 100% { transform: rotate(0deg); }
                             50% { transform: rotate(20deg); }
                           }
                           @keyframes waveRight {
                             0%, 100% { transform: rotate(0deg); }
                             50% { transform: rotate(-25deg); }
                           }
                           @keyframes breathe {
                             0%, 100% { transform: translateY(0px); }
                             50% { transform: translateY(4px); }
                           }
                           .head-sway { transform-origin: 50px 49px; animation: sway 6s ease-in-out infinite; }
                           .arm-left { transform-origin: 25px 60px; animation: waveLeft 3s ease-in-out infinite; }
                           .arm-right { transform-origin: 75px 60px; animation: waveRight 4s ease-in-out infinite; }
                           .torso-breathe { animation: breathe 4s ease-in-out infinite; }
                         `}</style>

                        <g className="torso-breathe">
                          {/* Head/Face mesh abstract */}
                          <g className="head-sway">
                            <circle cx="50" cy="35" r="14" className="stroke-google-blue" strokeDasharray="4 2">
                              <animateTransform attributeName="transform" type="rotate" from="0 50 35" to="360 50 35" dur="15s" repeatCount="indefinite" />
                            </circle>
                            <circle cx="50" cy="35" r="8" className="stroke-google-purple" />
                          </g>

                          {/* Spine & Shoulders */}
                          <path d="M50 49 L50 95 M25 60 L75 60" className="stroke-google-green" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="50" cy="49" r="2" className="fill-google-yellow" />
                          <circle cx="25" cy="60" r="2" className="fill-google-yellow" />
                          <circle cx="75" cy="60" r="2" className="fill-google-yellow" />
                          <circle cx="50" cy="95" r="2" className="fill-google-yellow" />

                          {/* Left Arm Waving */}
                          <g className="arm-left">
                            <path d="M25 60 L15 90 L25 100" className="stroke-google-green" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="15" cy="90" r="2" className="fill-google-yellow" />
                            <circle cx="25" cy="100" r="2" className="fill-google-yellow animate-pulse" />
                          </g>

                          {/* Right Arm Waving */}
                          <g className="arm-right">
                            <path d="M75 60 L85 90 L75 100" className="stroke-google-green" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="85" cy="90" r="2" className="fill-google-yellow" />
                            <circle cx="75" cy="100" r="2" className="fill-google-yellow animate-pulse" />
                          </g>

                          {/* Legs */}
                          <g>
                            <path d="M50 95 L30 140 M50 95 L70 140" className="stroke-google-green" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="30" cy="140" r="2" className="fill-google-yellow" />
                            <circle cx="70" cy="140" r="2" className="fill-google-yellow" />
                          </g>
                        </g>
                      </svg>
                    </div>

                    {/* Fake Alert */}
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl flex items-center gap-3 shadow-2xl transition-all duration-500 animate-in fade-in slide-in-from-bottom-2 whitespace-nowrap" key={activeAlertIndex}>
                      {React.createElement(fakeAlerts[activeAlertIndex].icon, { className: `w-5 h-5 shrink-0 ${fakeAlerts[activeAlertIndex].color}` })}
                      <span className="text-sm font-bold text-white tracking-wide">{fakeAlerts[activeAlertIndex].text}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 order-1 lg:order-2">
                <div className="flex items-center gap-4 mb-4">
                  <span className="px-4 py-1.5 rounded-full bg-google-yellow/10 text-google-yellow text-xs font-black uppercase tracking-widest border border-google-yellow/20">Phase 03</span>
                </div>
                <h2 className="text-4xl lg:text-5xl font-black text-neutral-900 tracking-tight mb-6">
                  Live Multi-Agent Orchestration
                </h2>
                <p className="text-xl text-neutral-500 font-medium leading-relaxed mb-8">
                  Once practice begins, your camera and microphone feed stream securely to our local Orchestrator and Google Gemini via raw WebSockets. Our AI Swarm dissects your performance in milliseconds: tracking eye-contact, posture gaps, talking speed, and rhetorical structure.
                </p>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white border border-neutral-200">
                    <Video className="w-5 h-5 text-neutral-400" /> <span className="text-sm font-bold text-neutral-700">WebAssembly Vision</span>
                  </div>
                  <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white border border-neutral-200">
                    <Bot className="w-5 h-5 text-neutral-400" /> <span className="text-sm font-bold text-neutral-700">Gemini Live API</span>
                  </div>
                  <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white border border-neutral-200">
                    <PauseCircle className="w-5 h-5 text-neutral-400" /> <span className="text-sm font-bold text-neutral-700">Pause / Resume</span>
                  </div>
                </div>
              </div>
            </div>

            {/* STEP 4: Dimensional Audit */}
            <div className="flex flex-col lg:flex-row gap-16 items-center">
              <div className="flex-1 relative group w-full">
                <div className="absolute inset-0 bg-google-green/10 blur-[60px] rounded-full transform group-hover:scale-110 transition-transform duration-700"></div>
                <div className="glass-card p-10 rounded-[40px] border border-white/60 relative overflow-hidden shadow-2xl shadow-neutral-900/5 h-full">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8 border-b border-neutral-100 pb-6">
                    <div className="flex items-center gap-3">
                      <Target className="w-8 h-8 text-google-green" />
                      <h4 className="text-xl font-black text-neutral-900">Performance Report</h4>
                    </div>
                    <div className="text-5xl font-black text-google-green shrink-0">87</div>
                  </div>
                  <div className="space-y-4 mb-8">
                    <div className="flex justify-between items-center bg-white/60 p-3 rounded-xl"><span className="text-sm font-bold text-neutral-600">Eye Contact</span><div className="w-24 sm:w-32 h-2 bg-neutral-100 rounded-full overflow-hidden"><div className="w-[85%] h-full bg-google-blue"></div></div></div>
                    <div className="flex justify-between items-center bg-white/60 p-3 rounded-xl"><span className="text-sm font-bold text-neutral-600">Persuasion</span><div className="w-24 sm:w-32 h-2 bg-neutral-100 rounded-full overflow-hidden"><div className="w-[92%] h-full bg-google-purple"></div></div></div>
                    <div className="flex justify-between items-center bg-white/60 p-3 rounded-xl"><span className="text-sm font-bold text-neutral-600">Filler Words</span><div className="w-24 sm:w-32 h-2 bg-neutral-100 rounded-full overflow-hidden"><div className="w-[60%] h-full bg-google-yellow"></div></div></div>
                  </div>
                  <div className="bg-google-green/10 rounded-2xl p-4 border border-google-green/20">
                    <p className="text-[10px] font-black text-google-green uppercase tracking-widest mb-2 flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5" /> Improvement Task Generated</p>
                    <p className="text-sm text-neutral-800 font-bold leading-tight">Practice standardizing hand placements during transitions.</p>
                  </div>
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-4">
                  <span className="px-4 py-1.5 rounded-full bg-google-green/10 text-google-green text-xs font-black uppercase tracking-widest border border-google-green/20">Phase 04</span>
                </div>
                <h2 className="text-4xl lg:text-5xl font-black text-neutral-900 tracking-tight mb-6">
                  Dimensional Performance Audit
                </h2>
                <p className="text-xl text-neutral-500 font-medium leading-relaxed mb-6">
                  Finish the session and receive an instant, multi-dimensional report. We break down your strengths and weaknesses across the criteria you selected.
                </p>
                <p className="text-lg text-neutral-500 font-medium leading-relaxed">
                  More importantly, Aura verifies if you resolved prior <span className="font-bold text-neutral-900">Improvement Tasks</span> from previous sessions, and generates new specific focus areas for your next attempt. It's a closed, intelligent loop.
                </p>
              </div>
            </div>

            {/* STEP 5: AI Project Coach */}
            <div className="glass-card rounded-[48px] p-8 md:p-16 border-2 border-white shadow-2xl shadow-google-blue/10 relative overflow-hidden bg-gradient-to-br from-white to-google-blue/5">
              <div className="flex flex-col lg:flex-row gap-12 lg:items-center relative z-10">
                <div className="flex-1">
                  <span className="px-4 py-1.5 rounded-full bg-google-blue/10 text-google-blue text-xs font-black uppercase tracking-widest border border-google-blue/20 mb-6 inline-block">Phase 05</span>
                  <h2 className="text-4xl lg:text-5xl font-black text-neutral-900 tracking-tight mb-6">
                    The Continuous Coach
                  </h2>
                  <p className="text-xl text-neutral-500 font-medium leading-relaxed mb-8">
                    Back on your dashboard, the conversation doesn't end. Your AI Project Coach lives in the sidebar, holding the complete memory of your context materials and every practice session you've run.
                  </p>
                  <ul className="space-y-4">
                    {["Chat to resolve improvement tasks", "Ask for script rewrites based on session feedback", "Brainstorm Q&A defenses for upcoming pitches"].map((item, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <MessageSquareText className="w-6 h-6 text-google-blue shrink-0 mt-0.5" />
                        <span className="text-lg font-bold text-neutral-800">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex-1 w-full relative">
                  <div className="absolute top-10 -right-20 w-80 h-80 bg-google-blue/10 blur-[80px] rounded-full pointer-events-none"></div>
                  <div className="bg-white rounded-[32px] border border-neutral-200 shadow-xl p-6 relative">
                    <div className="absolute top-0 right-10 -translate-y-1/2 px-4 py-2 bg-neutral-900 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg">Chat Context</div>
                    <div className="space-y-4 mb-6 pt-6">
                      <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-neutral-100 shrink-0 border border-neutral-200"></div>
                        <div className="bg-neutral-50 rounded-2xl rounded-tl-none p-4 border border-neutral-100 flex-1">
                          <p className="text-sm font-medium text-neutral-700 leading-snug">I noticed I speak too fast when explaining the architecture. How can I fix this?</p>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-google-blue flex items-center justify-center shrink-0 shadow-lg shadow-google-blue/20">
                          <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <div className="bg-white rounded-2xl rounded-tl-none p-4 border border-google-blue/20 shadow-sm flex-1">
                          <p className="text-sm font-medium text-neutral-800 leading-snug">Your session data shows a peak of <span className="text-google-red font-bold">210 WPM</span> there. Let's rewrite that slide's script to insert deliberate breath pauses...</p>
                        </div>
                      </div>
                    </div>
                    <div className="h-12 border border-neutral-200 rounded-full flex items-center px-4 bg-neutral-50">
                      <span className="text-sm text-neutral-400 font-medium">Message your coach...</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-32 relative text-center">
        <div className="max-w-3xl mx-auto px-6 animate-fade-in-up">
          <img src="/images/aura-ai-logo-dark.svg" alt="Aura" className="w-20 h-20 mx-auto mb-8" />
          <h2 className="text-5xl font-black text-neutral-900 tracking-tight mb-6">
            Your Coach is Ready.
          </h2>
          <p className="text-xl text-neutral-500 font-medium mb-12">
            Jump into the lab and experience the entire loop for yourself.
          </p>
          <Link href="/projects" className="inline-flex items-center gap-3 h-16 px-10 rounded-full bg-neutral-900 text-white font-bold tracking-widest uppercase text-sm shadow-2xl shadow-neutral-900/20 hover:scale-[1.02] active:scale-95 transition-all">
            Create a Project <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

    </div>
  );
}
