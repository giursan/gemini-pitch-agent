import { GoogleGenAI, Modality, Session as GenAISession } from '@google/genai';
import type { LiveServerMessage, LiveConnectConfig, Tool } from '@google/genai';
import {
    ANALYST_AGENT_PROMPT,
    COACH_AGENT_PROMPT,
    getCoachPersonaAddendum,
    DELIVERY_AGENT_SILENT_ADDENDUM,
    getDeliveryAgentTools,
} from '../prompts/agent-system-prompts';

// ── Timeline Event Types ────────────────────────────────────────────────────────

import type { AgentSelection } from './orchestrator';

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
    feedbackMode: 'silent' | 'loud';
    agents: AgentSelection;
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
    private feedbackMode: 'silent' | 'loud' = 'silent';
    private persona: 'mentor' | 'evaluator' | 'shark' | 'basic' = 'mentor';
    private role: 'analyst' | 'coach' = 'analyst';
    private enableSpeech: boolean = true;

    // Callbacks
    private onDeliveryReport: ((report: DeliveryReport) => void) | null = null;
    private onAudioOutput: ((base64Pcm: string) => void) | null = null;
    private onRawMessage: ((msg: LiveServerMessage) => void) | null = null;
    private isProcessingToolCall: boolean = false;
    private muteUntil: number = 0;

    // Timeline (shared with Orchestrator via reference)
    public timeline: TimelineEvent[] = [];
    public sessionId: string;
    public startedAt: number = 0;

    private static readonly MODEL = process.env.GEMINI_MODEL
        || 'gemini-2.5-flash-native-audio-preview-12-2025';

    constructor(
        sessionId: string,
        role: 'analyst' | 'coach' = 'analyst',
        feedbackMode: 'silent' | 'loud' = 'silent',
        persona: 'mentor' | 'evaluator' | 'shark' | 'basic' = 'mentor',
        enableSpeech: boolean = true,
    ) {
        this.sessionId = sessionId;
        this.role = role;
        this.feedbackMode = feedbackMode;
        this.persona = persona;
        this.enableSpeech = enableSpeech;
        this.startedAt = Date.now();
    }

    /** Register callback for delivery reports (pacing, filler, transcript) */
    setOnDeliveryReport(cb: (report: DeliveryReport) => void): void {
        this.onDeliveryReport = cb;
    }

    /** Register callback for audio output (loud mode) */
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
        console.log(`[DeliveryAgent:${this.role}:${this.sessionId}] Connecting (mode: ${this.feedbackMode})...`);
        this.startedAt = Date.now();
        this.logEvent('system', { role: this.role, message: 'Delivery Agent started', feedbackMode: this.feedbackMode });

        if (!this.enableSpeech) {
            console.log(`[DeliveryAgent:${this.sessionId}] Speech disabled. Skipping Live API connection.`);
            return;
        }

        const ai = new GoogleGenAI({
            apiKey: process.env.GOOGLE_GENAI_API_KEY,
            httpOptions: { apiVersion: 'v1beta' }
        });

        let systemInstruction = '';
        let tools: Tool[] | undefined = undefined;
        let modalities: Modality[] = [Modality.AUDIO];

        // Set system instructions based on role
        if (this.role === 'analyst') {
            systemInstruction = ANALYST_AGENT_PROMPT;
            tools = getDeliveryAgentTools();
        } else {
            systemInstruction = COACH_AGENT_PROMPT + '\n' + getCoachPersonaAddendum(this.persona);
            tools = undefined; 
        }

        // Both roles need AUDIO modality to hear the speaker and avoid 1007 errors.
        // We rely on the system instruction to keep the Analyst silent.
        modalities = [Modality.AUDIO];

        const config: LiveConnectConfig = {
            responseModalities: modalities,
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
            },
            systemInstruction: { parts: [{ text: systemInstruction }] },
            tools: tools,
        };

        this.session = await ai.live.connect({
            model: DeliveryAgent.MODEL,
            config,
            callbacks: {
                onopen: () => {
                    console.log(`[DeliveryAgent:${this.role}:${this.sessionId}] Live WebSocket opened.`);
                },
                onmessage: (message: LiveServerMessage) => {
                    // Handle report_delivery tool calls
                    if (message.toolCall?.functionCalls) {
                        this.isProcessingToolCall = true;
                        console.log(`[DeliveryAgent:${this.role}:${this.sessionId}] Tool call received:`, message.toolCall.functionCalls.map(f => f.name));
                        const functionResponses = [];

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

                            functionResponses.push({
                                name: fc.name,
                                id: fc.id,
                                response: { success: true }
                            });
                        }

                        // Send all tool responses in a single message to avoid race conditions/1011 error
                        if (functionResponses.length > 0) {
                            this.session?.sendToolResponse({ functionResponses });
                        }
                        
                        // Briefly keep gating audio to allow the server to process the response state transition
                        setTimeout(() => {
                            this.isProcessingToolCall = false;
                        }, 50);
                    }

                    if (message.serverContent?.modelTurn) {
                        const text = message.serverContent.modelTurn.parts?.[0]?.text;
                        if (text) {
                            this.logEvent('transcript', { message: text, source: 'Gemini' });
                        }
                        
                        // Forward audio output for loud mode
                        if (this.feedbackMode === 'loud' && message.serverContent.modelTurn.parts) {
                            for (const part of message.serverContent.modelTurn.parts) {
                                if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
                                    this.onAudioOutput?.(part.inlineData.data);
                                }
                            }
                        }
                    }

                    // Forward raw message to orchestrator for any additional processing
                    this.onRawMessage?.(message);
                },
                onerror: (e: any) => {
                    console.error(`[DeliveryAgent:${this.role}:${this.sessionId}] Error:`, e);
                    this.logEvent('system', { message: 'WebSocket error', error: String(e || 'unknown') });
                },
                onclose: (e: any) => {
                    console.log(`[DeliveryAgent:${this.role}:${this.sessionId}] WebSocket closed. Code: ${e?.code}, Reason: ${e?.reason || 'no reason'}`);
                },
            },
        });
    }

    // ── Media Methods ───────────────────────────────────────────────────────

    public sendAudioChunk(pcmData: string): void {
        if (!this.session || this.isProcessingToolCall) return;
        
        // Simulated Pause (Barge-in force): If we are currently in a forced mute window,
        // we skip sending audio to trick the Gemini VAD into thinking the user paused.
        if (Date.now() < this.muteUntil) return;

        this.session.sendRealtimeInput({
            audio: { mimeType: 'audio/pcm;rate=16000', data: pcmData },
        });
    }

    /** Force a small silence gap to trigger Gemini's VAD (interjection) */
    public forceInterjectionPause(durationMs: number = 500): void {
        this.muteUntil = Date.now() + durationMs;
    }

    /** Inject a coaching directive from the orchestrator (shark mode) */
    public injectCoachingDirective(text: string): void {
        if (!this.session) return;
        this.logEvent('system', { message: `Coach directive: ${text}` });

        // FORCE interjection by creating a longer silence gap (1.2s)
        // This is usually the threshold for Gemini's VAD to trigger a turn change.
        this.forceInterjectionPause(1200);

        this.session.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: `[URGENT_INTERRUPT] [COACH_DIRECTIVE]: ${text}` }] }],
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
