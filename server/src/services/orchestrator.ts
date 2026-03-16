/**
 * Orchestrator — deterministic TypeScript coordinator that merges signals
 * from the Delivery Agent, Content Agent, and CV Evaluator.
 *
 * No LLM calls. Pure logic for priority resolution and rate-limiting.
 */

import { WebSocket } from 'ws';
import { GoogleGenAI } from '@google/genai';
import { DeliveryAgent, type DeliveryReport, type TimelineEvent, type SessionSummary } from './adk-live-session';
import { ContentAgent, type ContentAssessment } from './content-agent';
import { CvEvaluator, type CvTelemetry, type OrchestratorSignal } from './cv-evaluator';
import type { LiveServerMessage } from '@google/genai';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface AgentSelection {
    // Visual
    eyeContact: boolean;
    posture: boolean;
    gestures: boolean;
    // Delivery
    speech: boolean;
    pacing: boolean;
    fillerWords: boolean;
    // Content
    content: boolean;
    congruity: boolean;
    timeManagement: boolean;
    // Settings
    expectedTimeMin: number;
}

interface OrchestratorConfig {
    sessionId: string;
    feedbackMode: 'silent' | 'loud';
    persona: 'mentor' | 'evaluator' | 'shark' | 'basic';
    agents: AgentSelection;
    ws: WebSocket;
    /** Project this session belongs to (null for legacy/unscoped sessions) */
    projectId?: string | null;
    /** Extracted text from project materials (for content agent context) */
    materialsContext?: string;
    /** Open improvement tasks from previous sessions */
    tasksContext?: string;
}

// ── Coach Chat Prompt ───────────────────────────────────────────────────────────

const COACH_CHAT_SYSTEM_PROMPT = `You are Aura, an expert presentation coach embedded in a live practice session. The user is currently practicing their presentation and can chat with you in real time.

You have full access to their LIVE session data (metrics, transcript, body language, alerts). Use this data to give specific, actionable coaching advice.

Rules:
- Reference their ACTUAL data (e.g. "Your pacing is at 180 WPM — that's too fast")
- Be concise — they're mid-presentation, keep responses to 2-3 sentences
- Be encouraging but honest
- If they ask about something you can see in the data, quote the numbers
- If they ask for strategy advice, be specific to their content/topic
`;

function getCoachSystemPrompt(persona: 'mentor' | 'evaluator' | 'shark' | 'basic'): string {
    const roles = {
        mentor: 'You are the Mentor, a friendly, encouraging, and constructive presentation coach.',
        evaluator: 'You are the Evaluator, a neutral, objective, and data-driven presentation coach.',
        shark: 'You are the Shark, a brutal but world-class presentation coach. You are extremely direct, critical, and authoritative, like a high-stakes investor.',
        basic: 'You are a robotic assistant. Your job is to repeat directives exactly as provided, with no additional personality or commentary.'
    };
    
    const rules = {
        mentor: '- Be constructive, supportive, and point out areas for improvement gently.',
        evaluator: '- State the facts and metrics directly without excessive emotion.',
        shark: '- Be brutal but constructive. If they waste your time, tell them.',
        basic: '- Repeat provided text EXACTLY. Do not add any extra words.'
    };

    return `${roles[persona]} You are watching a LIVE transcript of a presenter practicing their pitch.

YOUR ROLE:
- Interrupt the speaker if they are doing poorly (too many filler words, monotone, slow pacing, weak arguments, or contradictions).
${rules[persona]}
- If they are doing great, stay SILENT (respond with "NO_ROAST").

RULES:
- Your response MUST be EXACTLY ONE SENTENCE. No more.
- Do NOT use fragments. Use full, powerful sentences.
- If you don't have something critical to say, return ONLY the exact text "NO_ROAST".

CONTEXT:
`;
}

// ── Orchestrator ────────────────────────────────────────────────────────────────

export class Orchestrator {
    private analystAgent: DeliveryAgent; // The "Ear" (Transcription/Metrics)
    private coachAgent: DeliveryAgent;   // The "Voice" (Persona)
    private contentAgent: ContentAgent;  // The "Brain" (Batch Analysis)
    private cvEvaluator: CvEvaluator;
    private ws: WebSocket;
    private config: OrchestratorConfig;

    // State
    private transcriptBuffer: string = '';
    private contentAnalysisInterval: NodeJS.Timeout | null = null;
    private lastAlertTs: number = 0;
    private alertIdCounter: number = 0;
    private isPaused: boolean = false;
    private cvSnapshots: Record<string, any>[] = [];

    // Latest metrics (accumulated)
    private latestPacing: number = 0;
    private latestFiller: number = 0;
    private latestVocalVariety: number = 0;
    private latestContentScore: number = 0;
    private latestDeliveryScore: number = 0;
    private totalFillers: number = 0;
    private allFillerWords: string[] = [];
    private sessionStartTime: number = Date.now();

    // Rate limiting
    private static readonly MIN_ALERT_INTERVAL_MS = 8000;    // max 1 alert per 8s
    private static readonly CONTENT_ANALYSIS_INTERVAL_MS = 20000; // every 20s
    private static readonly METRICS_EMIT_INTERVAL_MS = 10000;     // every 10s

    private metricsInterval: NodeJS.Timeout | null = null;
    private transcriptLength: number = 0;
    private lastSharkRoastTs: number = 0;

    // Signal Priorities (higher = more important for live feedback)
    private static readonly SIGNAL_PRIORITIES: Record<string, number> = {
        'critical': 100,
        'eye_contact': 80,
        'posture': 70,
        'delivery': 60,
        'content': 40,
        'orchestrator': 50
    };

    // Chat
    private chatHistory: { role: 'user' | 'coach', text: string }[] = [];
    private chatAi: GoogleGenAI;

    constructor(config: OrchestratorConfig) {
        this.config = config;
        this.ws = config.ws;

        // Initialize AI client for coach chat
        this.chatAi = new GoogleGenAI({
            apiKey: process.env.GOOGLE_GENAI_API_KEY,
            httpOptions: { apiVersion: 'v1beta' }
        });

        // Initialize sub-agents
        this.analystAgent = new DeliveryAgent(
            config.sessionId,
            'analyst',
            'silent', // Analysts MUST always be silent to prevent 1011/1008 conflicts
            config.persona,
            true, 
        );
        
        this.coachAgent = new DeliveryAgent(
            config.sessionId,
            'coach',
            config.feedbackMode,
            config.persona,
            true, // Coaches always have speech engine capabilities
        );

        this.contentAgent = new ContentAgent();
        this.cvEvaluator = new CvEvaluator();

        // Wire up Analyst agent callbacks (Metrics & Transcript)
        // We always wire these so the Orchestrator can receive data if the agent is started
        this.analystAgent.setOnDeliveryReport((report) => this.handleDeliveryReport(report));
        this.analystAgent.setOnRawMessage((msg) => this.handleRawGeminiMessage(msg));

        // Wire up Coach agent callbacks (Vocal Interjections & Audio Output)
        this.coachAgent.setOnAudioOutput((pcm) => this.forwardAudioToClient(pcm));
        this.coachAgent.setOnRawMessage((msg) => this.handleRawGeminiMessage(msg));
    }

    public updateConfig(newConfig: Partial<OrchestratorConfig>) {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * Start the orchestrator: connect the Delivery Agent and start periodic analysis.
     */
    async start(): Promise<void> {
        const agents = this.config.agents;
        const enabledList = Object.entries(agents).filter(([, v]) => v).map(([k]) => k);
        console.log(`[Orchestrator:${this.config.sessionId}] Starting session (agents: ${enabledList.join(', ')})...`);
        if (this.config.projectId) {
            console.log(`[Orchestrator] Project: ${this.config.projectId}`);
            if (this.config.materialsContext) console.log(`[Orchestrator] Materials context: ${this.config.materialsContext.length} chars`);
            if (this.config.tasksContext) console.log(`[Orchestrator] Tasks context loaded`);
        }

        // Logic for which agents to connect:
        // 1. Analyst: needed if Speech Metrics, Content Metrics, or Loud Mode (for transcript context) is on.
        const needsAnalyst = agents.speech || agents.content || this.config.feedbackMode === 'loud';
        // 2. Coach: needed if Loud Mode is on.
        const needsCoach = this.config.feedbackMode === 'loud';

        // Connect agents sequentially with a small delay to avoid WebSocket handshake collisions
        if (needsAnalyst) {
            console.log(`[Orchestrator] Connecting Analyst (metrics/transcript engine)...`);
            await this.analystAgent.connect();
            // Small delay to let the first socket stabilize
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (needsCoach) {
            console.log(`[Orchestrator] Connecting Coach (vocal persona engine)...`);
            await this.coachAgent.connect();
        }

        // Start periodic content analysis only if speech is enabled (needs transcript)
        if (agents.speech) {
            this.contentAnalysisInterval = setInterval(() => {
                if (!this.isPaused) this.runContentAnalysis();
            }, Orchestrator.CONTENT_ANALYSIS_INTERVAL_MS);
        }

        this.metricsInterval = setInterval(() => {
            if (!this.isPaused) this.emitMetrics();
        }, Orchestrator.METRICS_EMIT_INTERVAL_MS);
    }



    // ── Input Handlers ──────────────────────────────────────────────────────

    /** Handle incoming audio chunks from the client */
    handleAudio(pcmData: string): void {
        if (this.isPaused) return;
        // Pipe to whoever is currently connected
        this.analystAgent.sendAudioChunk(pcmData);
        this.coachAgent.sendAudioChunk(pcmData);
    }

    /** Handle CV telemetry snapshots from the client */
    handleCvTelemetry(telemetry: Record<string, any>): void {
        if (this.isPaused) return;

        this.cvSnapshots.push({ ts: Date.now(), ...telemetry });
        this.logEvent('cv_telemetry', telemetry);

        // Run deterministic CV evaluation with agent filter
        const signals = this.cvEvaluator.evaluate(
            telemetry as CvTelemetry,
            this.config.agents,
        );

        // Process any triggered alerts
        for (const signal of signals) {
            this.processSignal(signal);
        }
    }

    /**
     * Handle chat messages from the user — context-aware coaching chat.
     * Uses Gemini 2.5 Flash with full session state injected as context.
     */
    async handleChatMessage(text: string): Promise<void> {
        this.chatHistory.push({ role: 'user', text });

        // Build live session context snapshot
        const latestCv = this.cvSnapshots.length > 0
            ? this.cvSnapshots[this.cvSnapshots.length - 1]
            : null;

        const recentAlerts = this.analystAgent.timeline
            .filter(e => e.type === 'alert')
            .slice(-5)
            .map(e => `[${e.data.source}] ${e.data.severity}: ${e.data.message}`);

        const contentAssessment = this.contentAgent.getLastAssessment();
        const sessionDurationSec = Math.round((Date.now() - this.analystAgent.startedAt) / 1000);

        const contextBlock = [
            `SESSION CONTEXT (live, ${sessionDurationSec}s into session):`,
            `  Pacing: ${this.latestPacing} WPM (target: 130-160)`,
            `  Filler words/min: ${this.latestFiller}`,
            `  Delivery score: ${this.latestDeliveryScore}/100`,
            `  Content score: ${this.latestContentScore}/100`,
            `  Content assessment: ${contentAssessment.summary || 'not yet analyzed'}`,
            `  Argument strength: ${contentAssessment.argumentStrength}`,
            `  Evidence quality: ${contentAssessment.evidenceQuality}`,
            latestCv ? [
                `  Eye contact: ${latestCv.eyeContact}%`,
                `  Posture: ${latestCv.isGoodPosture ? 'good' : 'poor'} (angle: ${latestCv.postureAngle}°)`,
                `  Smile: ${Math.round((latestCv.smileScore || 0) * 100)}%`,
                `  Gestures/min: ${latestCv.gesturesPerMin}`,
                `  Body stability: ${Math.round((latestCv.bodyStability || 0) * 100)}%`,
            ].join('\n') : '  CV data: not yet available',
            recentAlerts.length > 0
                ? `  Recent alerts: ${recentAlerts.join('; ')}`
                : '  Recent alerts: none',
            `  Transcript so far: "${this.transcriptBuffer.trim().slice(-500) || '(no speech detected yet)'}"`,
        ].join('\n');

        const chatContext = this.chatHistory
            .map(m => `${m.role === 'user' ? 'USER' : 'COACH'}: ${m.text}`)
            .join('\n');

        const prompt = `${COACH_CHAT_SYSTEM_PROMPT}\n\n${contextBlock}${this.config.tasksContext ? '\n\n' + this.config.tasksContext : ''}\n\nCHAT HISTORY:\n${chatContext}\n\nRespond to the user's latest message. Be specific and reference their actual data.`;

        try {
            const response = await this.chatAi.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            // Manually extract text parts to avoid the 'thoughtSignature' warning clutter
            const reply = response.candidates?.[0]?.content?.parts
                ?.map(p => (p as any).text)
                .filter(Boolean)
                .join('')
                .trim() || 'Sorry, I couldn\'t generate a response.';

            this.chatHistory.push({ role: 'coach', text: reply });

            this.sendToClient({
                type: 'chat_reply',
                text: reply,
            });
        } catch (err) {
            console.error('[Orchestrator] Chat error:', err);
            this.sendToClient({
                type: 'chat_reply',
                text: 'Sorry, I encountered an error processing your message. Try again.',
            });
        }
    }

    /** Handle barge-in events */
    handleBargeIn(): void {
        this.analystAgent.endTurn();
        this.coachAgent.endTurn();
    }

    /** Pause the session */
    pause(): void {
        this.isPaused = true;
    }

    /** Resume the session */
    resume(): void {
        this.isPaused = false;
    }

    // ── Internal Signal Processing ──────────────────────────────────────────

    private handleDeliveryReport(report: DeliveryReport): void {
        // Update metrics
        this.latestPacing = report.pacing;
        this.latestFiller = report.filler;
        this.totalFillers += report.filler;

        if (report.fillerWords && report.fillerWords.length > 0) {
            this.allFillerWords = [...this.allFillerWords, ...report.fillerWords];
        }

        if (report.vocalVariety !== undefined) {
            this.latestVocalVariety = report.vocalVariety;
        }

        // Calculate delivery score from components
        const elapsedMins = (Date.now() - this.sessionStartTime) / 60000;
        const currentFillerRate = elapsedMins > 0.1 ? (this.totalFillers / elapsedMins) : 0;

        const pacingScore = scorePacing(report.pacing);
        const fillerScore = scoreFillerRate(currentFillerRate);
        const vocalScore = report.vocalVariety ?? 50;
        this.latestDeliveryScore = Math.round((pacingScore + fillerScore + vocalScore) / 3);

        if (report.transcript) {
            this.transcriptBuffer += ' ' + report.transcript;
            this.transcriptLength += report.transcript.length;

            this.sendToClient({ type: 'transcript', text: report.transcript });
            this.logEvent('transcript', {
                speaker: 'user',
                text: report.transcript,
            });
        }

        // Check for delivery-specific alerts
        const deliverySignals = this.evaluateDelivery(report);
        for (const signal of deliverySignals) {
            this.processSignal(signal);
        }
    }

    private evaluateDelivery(report: DeliveryReport): OrchestratorSignal[] {
        const signals: OrchestratorSignal[] = [];

        // 1. Pacing Alerts
        if (report.pacing > 0) {
            if (report.pacing > 185) {
                signals.push({ source: 'delivery', severity: 'warning', message: 'Slow down. Your pace is too fast.' });
            } else if (report.pacing < 90 && report.pacing > 0) {
                signals.push({ source: 'delivery', severity: 'info', message: 'Pick up the pace. You are slowing down.' });
            }
        }

        // 2. Filler Word Alerts
        if (report.filler > 7) {
            signals.push({ source: 'delivery', severity: 'warning', message: 'Watch your filler words.' });
        }

        // 3. Vocal Variety (Energy) Alerts
        if (report.vocalVariety !== undefined) {
            if (report.vocalVariety < 45) {
                signals.push({ source: 'delivery', severity: 'info', message: 'You sound monotone. Vary your pitch.' });
            } else if (report.vocalVariety > 90) {
                signals.push({ source: 'delivery', severity: 'warning', message: 'Your energy is too high. Calm your voice.' });
            }
        }

        return signals;
    }

    private async runContentAnalysis(): Promise<void> {
        if (this.transcriptBuffer.trim().length < 30) return;

        try {
            // Inject materials context if available (from project)
            const materialsPrefix = this.config.materialsContext
                ? `REFERENCE MATERIALS:\n${this.config.materialsContext}\n\n`
                : '';
            const assessment = await this.contentAgent.analyzeTranscript(
                materialsPrefix + this.transcriptBuffer,
            );
            this.latestContentScore = assessment.contentScore;

            this.logEvent('content_report', {
                ...assessment,
            });

            // Generate content-based alerts
            const signals = this.evaluateContent(assessment);
            for (const signal of signals) {
                this.processSignal(signal);
            }

            // Trigger coaching for personalized textual/voice feedback
            // SKIP periodic roasts if persona is 'basic'
            if (this.config.persona !== 'basic') {
                this.runSharkCoaching();
            }
        } catch (err) {
            console.error(`[Orchestrator] Content analysis error:`, err);
        }
    }

    private async runSharkCoaching(): Promise<void> {
        // Rate limit: don't roast more than once every 12 seconds
        const now = Date.now();
        if (now - this.lastSharkRoastTs < 12000) return;

        // Don't roast if they haven't said enough yet
        if (this.transcriptBuffer.length < 50) return;

        const latestCv = this.cvSnapshots.length > 0 ? this.cvSnapshots[this.cvSnapshots.length - 1] : null;
        const contentAssessment = this.contentAgent.getLastAssessment();

        const context = [
            `Current Pacing: ${this.latestPacing} WPM`,
            `Recent Filler Count: ${this.latestFiller}`,
            `Eye Contact: ${latestCv ? latestCv.eyeContact : '??'}%`,
            `Posture: ${latestCv ? (latestCv.isGoodPosture ? 'Good' : 'Poor') : '??'}`,
            `Vocal Delivery Score: ${this.latestDeliveryScore}/100`,
            `Content Strength: ${contentAssessment.argumentStrength}`,
            `Transcript Chunk: "${this.transcriptBuffer.slice(-300)}"`,
        ].join('\n');

        try {
            const response = await this.chatAi.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: getCoachSystemPrompt(this.config.persona) + context,
            });

            // Manually extract text parts to avoid the 'thoughtSignature' warning clutter
            const roast = response.candidates?.[0]?.content?.parts
                ?.map(p => (p as any).text)
                .filter(Boolean)
                .join('')
                .trim() || 'NO_ROAST';

            if (roast !== 'NO_ROAST' && !roast.includes('NO_ROAST')) {
                this.lastSharkRoastTs = Date.now();
                
                // 1. Send text to client for UI logging/alerts
                this.sendToClient({
                    type: 'shark_speak',
                    text: roast,
                });

                // 2. Route to Coach Agent for Native Voice if in loud mode
                if (this.config.feedbackMode === 'loud') {
                    this.coachAgent.injectCoachingDirective(roast);
                }
            }
        } catch (err) {
            console.error('[Orchestrator] Shark coaching error:', err);
        }
    }

    private evaluateContent(assessment: ContentAssessment): OrchestratorSignal[] {
        const signals: OrchestratorSignal[] = [];

        // Reduce noise: Only give content alerts once we have a decent chunk of speech
        if (this.transcriptLength < 150) return signals;

        if (assessment.contentScore < 30) {
            signals.push({ source: 'content', severity: 'warning', message: 'Strengthen your argument' });
        }

        if (assessment.evidenceQuality === 'none') {
            signals.push({ source: 'content', severity: 'info', message: 'Add concrete examples' });
        }

        if (assessment.structureClarity === 'unclear') {
            signals.push({ source: 'content', severity: 'info', message: 'Clarify your main point' });
        }

        // Granular Setup Checks
        if (this.config.agents.congruity && assessment.contradictions && assessment.contradictions.length > 0) {
            // Emits a critical alert based on the first major contradiction found
            signals.push({ 
                source: 'content', 
                severity: 'critical', 
                message: `Contradiction: ${assessment.contradictions[0]}` 
            });
        }

        if (this.config.agents.timeManagement) {
            const elapsedMins = (Date.now() - this.sessionStartTime) / 60000;
            const expectedMins = this.config.agents.expectedTimeMin || 10;
            const timePassedPct = (elapsedMins / expectedMins) * 100;
            
            // If they are more than halfway through their time, but haven't covered half their material
            if (timePassedPct > 50 && assessment.contentCoveragePercentage < 30) {
                signals.push({ 
                    source: 'content', 
                    severity: 'warning', 
                    message: `You've used ${Math.round(timePassedPct)}% of your time, but only covered ${assessment.contentCoveragePercentage}% of the deck!`
                });
            }
        }

        return signals;
    }

    private processSignal(signal: OrchestratorSignal): void {
        const now = Date.now();

        // ── Priority & Lockout Logic ─────────────────────────────────────────────

        // Critical alerts always bypass rate limits
        const isCritical = signal.severity === 'critical';
        const timeSinceLast = now - this.lastAlertTs;

        if (!isCritical && timeSinceLast < Orchestrator.MIN_ALERT_INTERVAL_MS) {
            // Even if within cooldown, we might want to prioritize a very important signal
            // But for live UI sanity, we mostly just enforce the 8s gap.
            return;
        }

        // Apply a tie-breaking rule: if we have multiple signals in one loop,
        // we should ideally pick the one with highest source priority.
        // (Current loops in handleCvTelemetry etc. process signals sequentially,
        // so we'll just log and send the first valid one within the time window).

        this.lastAlertTs = now;
        this.alertIdCounter++;

        // Log to timeline (Using Analyst agent as the primary event log)
        this.logEvent('alert', {
            source: signal.source,
            severity: signal.severity,
            message: signal.message,
        });

        // Send alert to client
        this.sendToClient({
            type: 'alert',
            id: `alert-${this.alertIdCounter}`,
            source: signal.source,
            severity: signal.severity,
            message: signal.message,
            timestamp: now,
        });

        // 3. If in LOUD mode, route the alert to the Coach Agent so Gemini speaks it naturally
        if (this.config.feedbackMode === 'loud') {
            this.coachAgent.injectCoachingDirective(signal.message);
        }
    }

    private emitMetrics(): void {
        const elapsedMins = (Date.now() - this.sessionStartTime) / 60000;
        const fillerFrequency = elapsedMins > 0.1 ? (this.totalFillers / elapsedMins) : 0;

        this.sendToClient({
            type: 'metrics',
            pacing: this.latestPacing,
            fillerRate: Math.round(fillerFrequency * 10) / 10,
            totalFillers: this.totalFillers,
            allFillerWords: this.allFillerWords,
            contentScore: this.latestContentScore,
            deliveryScore: this.latestDeliveryScore,
        });
    }

    private handleRawGeminiMessage(msg: LiveServerMessage): void {
        // Forward audio data for shark mode playback
        // (already handled via onAudioOutput callback)
        // This is for any additional message types we might want to forward
    }

    private forwardAudioToClient(base64Pcm: string): void {
        this.sendToClient({
            type: 'audio_output',
            data: base64Pcm,
        });
    }

    private sendToClient(data: Record<string, any>): void {
        if (this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(data));
            } catch (err) {
                console.error('[Orchestrator] Error sending to client:', err);
            }
        }
    }

    // ── Lifecycle ───────────────────────────────────────────────────────────

    getSessionSummary(): SessionSummary {
        const partialSummary = this.analystAgent.getSessionSummary();
        return {
            ...partialSummary,
            agents: this.config.agents,
            cvSnapshots: this.cvSnapshots,
            tasksContext: this.config.tasksContext,
        };
    }

    private logEvent(type: TimelineEvent['type'], data: Record<string, any>): void {
        this.analystAgent.logEvent(type, data);
    }

    stop(): void {
        if (this.contentAnalysisInterval) {
            clearInterval(this.contentAnalysisInterval);
            this.contentAnalysisInterval = null;
        }
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = null;
        }
        this.analystAgent.disconnect();
        this.coachAgent.disconnect();
        this.cvEvaluator.reset();
        console.log(`[Orchestrator:${this.config.sessionId}] Stopped.`);
    }
}

// ── Scoring Helpers ─────────────────────────────────────────────────────────────

/** Score pacing on 0-100 scale. 130-160 WPM is ideal. */
function scorePacing(wpm: number): number {
    if (wpm <= 0) return 0;
    const ideal = 145;
    const distance = Math.abs(wpm - ideal);
    return Math.max(0, Math.round(100 - distance * 1.5));
}

/** Score filler rate on 0-100 scale. 0 fillers/min = 100, 10+ = 0. */
function scoreFillerRate(fillersPerMin: number): number {
    return Math.max(0, Math.round(100 - fillersPerMin * 10));
}
