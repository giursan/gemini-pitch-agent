import { GoogleGenAI, Modality, Session as GenAISession } from '@google/genai';
import type { LiveServerMessage, LiveConnectConfig } from '@google/genai';
import {
    DELIVERY_AGENT_PROMPT,
    DELIVERY_AGENT_SHARK_ADDENDUM,
    DELIVERY_AGENT_SILENT_ADDENDUM,
    getDeliveryAgentTools,
} from '../prompts/agent-system-prompts';

// ── Timeline Event Types ────────────────────────────────────────────────────────

export interface TimelineEvent {
    ts: number;                           // epoch ms
    type: 'alert' | 'metrics' | 'cv_telemetry' | 'transcript' | 'system' | 'delivery_report' | 'content_report';
    data: Record<string, any>;
}

export interface SessionSummary {
    sessionId: string;
    startedAt: number;
    endedAt: number | null;
    durationMs: number;
    feedbackMode: 'silent' | 'shark';
    timeline: TimelineEvent[];
    cvSnapshots: Record<string, any>[];   // periodic CV telemetry snapshots
}

// ── Delivery Report Type ────────────────────────────────────────────────────────

export interface DeliveryReport {
    pacing: number;
    filler: number;
    vocalVariety?: number;
    transcript: string;
}

// ── Delivery Agent (Gemini Live Session) ────────────────────────────────────────

/**
 * Focused Delivery Agent — manages a Gemini Live API session that is
 * responsible ONLY for audio-based delivery analysis:
 * - Transcription
 * - Pacing (WPM)
 * - Filler word counting
 * - Shark mode spoken feedback
 */
export class DeliveryAgent {
    private session: GenAISession | null = null;
    private feedbackMode: 'silent' | 'shark' = 'silent';
    private enableSpeech: boolean = true;

    // Callbacks
    private onDeliveryReport: ((report: DeliveryReport) => void) | null = null;
    private onAudioOutput: ((base64Pcm: string) => void) | null = null;
    private onRawMessage: ((msg: LiveServerMessage) => void) | null = null;

    // Timeline (shared with Orchestrator via reference)
    public timeline: TimelineEvent[] = [];
    public sessionId: string;
    public startedAt: number = 0;

    private static readonly MODEL = process.env.GEMINI_MODEL
        || 'models/gemini-2.5-flash-native-audio-latest';

    constructor(
        sessionId: string,
        feedbackMode: 'silent' | 'shark' = 'silent',
        enableSpeech: boolean = true,
    ) {
        this.sessionId = sessionId;
        this.feedbackMode = feedbackMode;
        this.enableSpeech = enableSpeech;
    }

    /** Register callback for delivery reports (pacing, filler, transcript) */
    setOnDeliveryReport(cb: (report: DeliveryReport) => void): void {
        this.onDeliveryReport = cb;
    }

    /** Register callback for audio output (shark mode) */
    setOnAudioOutput(cb: (base64Pcm: string) => void): void {
        this.onAudioOutput = cb;
    }

    /** Register callback for raw Gemini messages (for forwarding) */
    setOnRawMessage(cb: (msg: LiveServerMessage) => void): void {
        this.onRawMessage = cb;
    }

    /**
     * Connect to the Gemini Live API and start listening.
     */
    public async connect(): Promise<void> {
        console.log(`[DeliveryAgent:${this.sessionId}] Connecting (mode: ${this.feedbackMode})...`);
        this.startedAt = Date.now();
        this.logEvent('system', { message: 'Delivery Agent started', feedbackMode: this.feedbackMode });

        if (!this.enableSpeech) {
            console.log(`[DeliveryAgent:${this.sessionId}] Speech disabled. Skipping Live API connection.`);
            return;
        }

        const ai = new GoogleGenAI({
            apiKey: process.env.GOOGLE_GENAI_API_KEY,
        });

        // Build focused system instruction
        const modeAddendum = this.feedbackMode === 'shark'
            ? DELIVERY_AGENT_SHARK_ADDENDUM
            : DELIVERY_AGENT_SILENT_ADDENDUM;

        const systemInstruction = DELIVERY_AGENT_PROMPT + modeAddendum;

        const config: LiveConnectConfig = {
            responseModalities: ['AUDIO'] as any,
            systemInstruction: { parts: [{ text: systemInstruction }] },
            tools: getDeliveryAgentTools(),
        };

        if (this.feedbackMode === 'shark') {
            config.speechConfig = {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName: 'Aoede',
                    },
                },
            };
        }

        this.session = await ai.live.connect({
            model: DeliveryAgent.MODEL,
            config,
            callbacks: {
                onopen: () => {
                    console.log(`[DeliveryAgent:${this.sessionId}] Live WebSocket opened.`);
                },
                onmessage: (message: LiveServerMessage) => {
                    // Handle report_delivery tool calls
                    if (message.toolCall?.functionCalls) {
                        for (const fc of message.toolCall.functionCalls) {
                            if (fc.name === 'report_delivery') {
                                const args = fc.args as Record<string, any> || {};
                                const report: DeliveryReport = {
                                    pacing: Number(args.pacing) || 0,
                                    filler: Number(args.filler) || 0,
                                    vocalVariety: args.vocalVariety != null ? Number(args.vocalVariety) : undefined,
                                    transcript: String(args.transcript || ''),
                                };
                                this.logEvent('delivery_report', report);
                                this.onDeliveryReport?.(report);
                            }
                        }
                    }

                    // Forward audio output for shark mode
                    if (this.feedbackMode === 'shark' && message.serverContent?.modelTurn?.parts) {
                        for (const part of message.serverContent.modelTurn.parts) {
                            if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
                                this.onAudioOutput?.(part.inlineData.data);
                            }
                        }
                    }

                    // Forward raw message to orchestrator for any additional processing
                    this.onRawMessage?.(message);
                },
                onerror: (e: ErrorEvent) => {
                    console.error(`[DeliveryAgent:${this.sessionId}] Error:`, e.error);
                    this.logEvent('system', { message: 'WebSocket error', error: String(e.error) });
                },
                onclose: (e: any) => {
                    console.log(`[DeliveryAgent:${this.sessionId}] WebSocket closed. Code: ${e?.code}`);
                },
            },
        });
    }

    // ── Media Methods ───────────────────────────────────────────────────────

    public sendAudioChunk(pcmData: string): void {
        if (!this.session) return;
        this.session.sendRealtimeInput({
            audio: { mimeType: 'audio/pcm;rate=16000', data: pcmData },
        });
    }

    /** Inject a coaching directive from the orchestrator (shark mode) */
    public injectCoachingDirective(text: string): void {
        if (!this.session) return;
        this.logEvent('system', { message: `Coach directive: ${text}` });
        this.session.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: `[COACH_DIRECTIVE] ${text}` }] }],
            turnComplete: true,
        });
    }

    public sendTextMessage(text: string): void {
        if (!this.session) return;
        this.logEvent('system', { message: `User chat: ${text}` });
        this.session.sendClientContent({
            turns: [{ role: 'user', parts: [{ text }] }],
            turnComplete: true,
        });
    }

    public endTurn(): void {
        if (!this.session) return;
        this.session.sendClientContent({ turnComplete: true });
    }

    public disconnect(): void {
        if (this.session) {
            this.logEvent('system', { message: 'Delivery Agent disconnected' });
            console.log(`[DeliveryAgent:${this.sessionId}] Disconnecting...`);
            this.session.close();
            this.session = null;
        }
    }

    public getSessionSummary(): SessionSummary {
        const endedAt = Date.now();
        return {
            sessionId: this.sessionId,
            startedAt: this.startedAt,
            endedAt,
            durationMs: endedAt - this.startedAt,
            feedbackMode: this.feedbackMode,
            timeline: this.timeline,
            cvSnapshots: [],
        };
    }

    // ── Private ─────────────────────────────────────────────────────────────

    public logEvent(type: TimelineEvent['type'], data: Record<string, any>): void {
        this.timeline.push({ ts: Date.now(), type, data });
    }
}
