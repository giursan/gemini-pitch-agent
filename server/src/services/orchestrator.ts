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
    eyeContact: boolean;
    posture: boolean;
    gestures: boolean;
    speech: boolean;
}

interface OrchestratorConfig {
    sessionId: string;
    feedbackMode: 'silent' | 'shark';
    agents: AgentSelection;
    ws: WebSocket;
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

// ── Orchestrator ────────────────────────────────────────────────────────────────

export class Orchestrator {
    private deliveryAgent: DeliveryAgent;
    private contentAgent: ContentAgent;
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

    // Rate limiting
    private static readonly MIN_ALERT_INTERVAL_MS = 8000;    // max 1 alert per 8s
    private static readonly CONTENT_ANALYSIS_INTERVAL_MS = 20000; // every 20s
    private static readonly METRICS_EMIT_INTERVAL_MS = 10000;     // every 10s

    private metricsInterval: NodeJS.Timeout | null = null;
    private transcriptLength: number = 0;

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
        });

        // Initialize sub-agents
        this.deliveryAgent = new DeliveryAgent(
            config.sessionId,
            config.feedbackMode,
            config.agents.speech,
        );
        this.contentAgent = new ContentAgent();
        this.cvEvaluator = new CvEvaluator();

        // Wire up delivery agent callbacks (only meaningful if speech is enabled)
        if (config.agents.speech) {
            this.deliveryAgent.setOnDeliveryReport((report) => this.handleDeliveryReport(report));
            this.deliveryAgent.setOnAudioOutput((pcm) => this.forwardAudioToClient(pcm));
            this.deliveryAgent.setOnRawMessage((msg) => this.handleRawGeminiMessage(msg));
        }
    }

    /**
     * Start the orchestrator: connect the Delivery Agent and start periodic analysis.
     */
    async start(): Promise<void> {
        const agents = this.config.agents;
        const enabledList = Object.entries(agents).filter(([, v]) => v).map(([k]) => k);
        console.log(`[Orchestrator:${this.config.sessionId}] Starting session (agents: ${enabledList.join(', ')})...`);

        // Connect Delivery Agent only if speech is enabled
        if (agents.speech) {
            await this.deliveryAgent.connect();
        }

        // Start periodic content analysis only if speech is enabled (needs transcript)
        if (agents.speech) {
            this.contentAnalysisInterval = setInterval(() => {
                if (!this.isPaused) this.runContentAnalysis();
            }, Orchestrator.CONTENT_ANALYSIS_INTERVAL_MS);
        }

        // Start periodic metrics emission
        this.metricsInterval = setInterval(() => {
            if (!this.isPaused) this.emitMetrics();
        }, Orchestrator.METRICS_EMIT_INTERVAL_MS);
    }

    // ── Input Handlers ──────────────────────────────────────────────────────

    /** Handle incoming audio chunks from the client */
    handleAudio(pcmData: string): void {
        if (this.isPaused || !this.config.agents.speech) return;
        this.deliveryAgent.sendAudioChunk(pcmData);
    }

    /** Handle CV telemetry snapshots from the client */
    handleCvTelemetry(telemetry: Record<string, any>): void {
        if (this.isPaused) return;

        this.cvSnapshots.push({ ts: Date.now(), ...telemetry });
        this.deliveryAgent.logEvent('cv_telemetry', telemetry);

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

        const recentAlerts = this.deliveryAgent.timeline
            .filter(e => e.type === 'alert')
            .slice(-5)
            .map(e => `[${e.data.source}] ${e.data.severity}: ${e.data.message}`);

        const contentAssessment = this.contentAgent.getLastAssessment();
        const sessionDurationSec = Math.round((Date.now() - this.deliveryAgent.startedAt) / 1000);

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

        const prompt = `${COACH_CHAT_SYSTEM_PROMPT}\n\n${contextBlock}\n\nCHAT HISTORY:\n${chatContext}\n\nRespond to the user's latest message. Be specific and reference their actual data.`;

        try {
            const response = await this.chatAi.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            const reply = response.text?.trim() || 'Sorry, I couldn\'t generate a response.';
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
        this.deliveryAgent.endTurn();
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
        if (report.vocalVariety !== undefined) {
            this.latestVocalVariety = report.vocalVariety;
        }

        // Calculate delivery score from components
        const pacingScore = scorePacing(report.pacing);
        const fillerScore = scoreFillerRate(report.filler);
        const vocalScore = report.vocalVariety ?? 50;
        this.latestDeliveryScore = Math.round((pacingScore + fillerScore + vocalScore) / 3);

        if (report.transcript) {
            this.transcriptBuffer += ' ' + report.transcript;
            this.transcriptLength += report.transcript.length;

            // Log transcript event
            this.deliveryAgent.logEvent('transcript', {
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

        // Only alert on extreme values
        if (report.pacing > 0) {
            if (report.pacing > 180) {
                signals.push({ source: 'delivery', severity: 'warning', message: 'Slow down your pace' });
            } else if (report.pacing < 100 && report.pacing > 0) {
                signals.push({ source: 'delivery', severity: 'info', message: 'Pick up the pace' });
            }
        }

        if (report.filler > 8) {
            signals.push({ source: 'delivery', severity: 'warning', message: 'Reduce filler words' });
        }

        return signals;
    }

    private async runContentAnalysis(): Promise<void> {
        if (this.transcriptBuffer.trim().length < 30) return;

        try {
            const assessment = await this.contentAgent.analyzeTranscript(this.transcriptBuffer);
            this.latestContentScore = assessment.contentScore;

            this.deliveryAgent.logEvent('content_report', {
                ...assessment,
            });

            // Generate content-based alerts
            const signals = this.evaluateContent(assessment);
            for (const signal of signals) {
                this.processSignal(signal);
            }

            // In shark mode, inject coaching directives for content issues
            if (this.config.feedbackMode === 'shark' && assessment.suggestions.length > 0) {
                const directive = `The speaker's content needs work: ${assessment.suggestions[0]}. Challenge them on this.`;
                this.deliveryAgent.injectCoachingDirective(directive);
            }
        } catch (err) {
            console.error(`[Orchestrator] Content analysis error:`, err);
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

        // Log to timeline
        this.deliveryAgent.logEvent('alert', {
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
    }

    private emitMetrics(): void {
        this.sendToClient({
            type: 'metrics',
            pacing: this.latestPacing,
            filler: this.latestFiller,
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
        const summary = this.deliveryAgent.getSessionSummary();
        summary.cvSnapshots = this.cvSnapshots;
        return summary;
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
        this.deliveryAgent.disconnect();
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
