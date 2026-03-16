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
    agents: {
        eyeContact: boolean;
        posture: boolean;
        gestures: boolean;
        speech: boolean;
    };
    timeline: TimelineEvent[];
    cvSnapshots: Record<string, any>[];   // periodic CV telemetry snapshots
    tasksContext?: string;               // project improvement tasks
}

// ── Delivery Report Type ────────────────────────────────────────────────────────

export interface DeliveryReport {
    pacing: number;
    filler: number;
    fillerWords?: string[];
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
        || 'models/gemini-2.5-flash-native-audio-preview-12-2025';

    constructor(
        sessionId: string,
        feedbackMode: 'silent' | 'shark' = 'silent',
        enableSpeech: boolean = true,
    ) {
        this.sessionId = sessionId;
        this.feedbackMode = feedbackMode;
        this.enableSpeech = enableSpeech;
        this.startedAt = Date.now();
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
            httpOptions: { apiVersion: 'v1alpha' }
        });

        // ALWAYS use SILENT mode for the Live API to ensure connection stability.
        // As requested: A complete copy of the working silent mode.
        // Shark coaching logic is handled externally by the Orchestrator + Client TTS.
        const systemInstruction = DELIVERY_AGENT_PROMPT + DELIVERY_AGENT_SILENT_ADDENDUM;

        const config: LiveConnectConfig = {
            responseModalities: ['AUDIO'] as any,
            systemInstruction: { parts: [{ text: systemInstruction }] },
            tools: getDeliveryAgentTools(),
        };

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
                                    fillerWords: Array.isArray(args.fillerWords) ? args.fillerWords : [],
                                    vocalVariety: args.vocalVariety != null ? Number(args.vocalVariety) : undefined,
                                    transcript: String(args.transcript || ''),
                                };
                                this.logEvent('delivery_report', report);
                                this.onDeliveryReport?.(report);
                            }

                            // IMPORTANT: In the Live API, every ToolCall MUST receive a corresponding ToolResponse.
                            // If we don't respond (even to unrecognized tools), the session eventually hangs or terminates with 1011 Internal Error.
                            this.session?.sendToolResponse({
                                functionResponses: [{
                                    name: fc.name,
                                    id: fc.id,
                                    response: { success: true }
                                }]
                            });
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
                onerror: (e: any) => {
                    console.error(`[DeliveryAgent:${this.sessionId}] Error:`, e);
                    this.logEvent('system', { message: 'WebSocket error', error: String(e || 'unknown') });
                },
                onclose: (e: any) => {
                    console.log(`[DeliveryAgent:${this.sessionId}] WebSocket closed. Code: ${e?.code}, Reason: ${e?.reason || 'no reason'}`);
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
        // The Gemini Live API inherently supports barge-in using native Voice Activity Detection (VAD)
        // when streaming audio chunks via sendRealtimeInput. Manually sending empty turnComplete: true
        // causes a 1007 "Invalid Argument" crash in @google/genai version 1.14.0.
    }

    public disconnect(): void {
        if (this.session) {
            this.logEvent('system', { message: 'Delivery Agent disconnected' });
            console.log(`[DeliveryAgent:${this.sessionId}] Disconnecting...`);
            this.session.close();
            this.session = null;
        }
    }

    public getSessionSummary(): Omit<SessionSummary, 'agents'> {
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
