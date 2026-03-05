import { GoogleGenAI, Modality, Session as GenAISession } from '@google/genai';
import type { LiveServerMessage, LiveConnectConfig } from '@google/genai';
import { META_ORCHESTRATOR_PROMPT, getGeminiTools } from '../prompts/agent-system-prompts';

// ── Timeline Event Types ────────────────────────────────────────────────────────

export interface TimelineEvent {
    ts: number;                           // epoch ms
    type: 'alert' | 'metrics' | 'cv_telemetry' | 'transcript' | 'system';
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

// ── Session Class ───────────────────────────────────────────────────────────────

/**
 * Manages a single Gemini Live API session per WebSocket connection.
 * Includes a timeline logger that accumulates all events for post-session analysis.
 */
export class GeminiLiveSession {
    private session: GenAISession | null = null;
    private onMessageCallback: (msg: LiveServerMessage) => void;
    private feedbackMode: 'silent' | 'shark' = 'silent';
    private enableSpeech: boolean = true;

    // Timeline
    private timeline: TimelineEvent[] = [];
    private cvSnapshots: Record<string, any>[] = [];
    private sessionId: string;
    private startedAt: number = 0;
    private lastInjectedTelemetryTs: number = 0;

    private static readonly MODEL = process.env.GEMINI_MODEL
        || 'models/gemini-2.5-flash-native-audio-latest';

    constructor(
        sessionId: string,
        onMessageCallback: (msg: LiveServerMessage) => void,
        feedbackMode: 'silent' | 'shark' = 'silent',
        enableSpeech: boolean = true
    ) {
        this.sessionId = sessionId;
        this.onMessageCallback = onMessageCallback;
        this.feedbackMode = feedbackMode;
        this.enableSpeech = enableSpeech;
    }

    /**
     * Connect to the Gemini Live API and start listening for events.
     */
    public async connect(): Promise<void> {
        console.log(`[${this.sessionId}] Connecting to Gemini Live API (mode: ${this.feedbackMode})...`);
        this.startedAt = Date.now();
        this.logEvent('system', { message: 'Session started', feedbackMode: this.feedbackMode, enableSpeech: this.enableSpeech });

        if (!this.enableSpeech) {
            console.log(`[${this.sessionId}] Speech agent disabled. Bypassing Gemini WS connection.`);
            return;
        }

        const ai = new GoogleGenAI({
            apiKey: process.env.GOOGLE_GENAI_API_KEY,
        });

        // Build system instruction with feedback mode context
        const modeInstruction = this.feedbackMode === 'shark'
            ? `\n\nYou are in SHARK MODE. You MUST speak out loud to give feedback and interrupt with tough questions. Be direct and challenging.`
            : `\n\nYou are in SILENT COACH MODE. Do NOT speak or generate audio. Use ONLY the emit_alert and update_metrics tool calls to provide feedback silently through the UI.`;

        const transcriptionInstruction = `\n\nCRITICAL: You are receiving a live audio stream of the user speaking. You must actively listen to the presentation. You must regularly evaluate their pacing (Words Per Minute), count their filler words ("um", "uh", "like"), and grade their delivery and content. You MUST call the update_metrics tool frequently (every 10-15 seconds) to update the UI dashboard with these metrics. This is mandatory for the experience to work.`;

        const finalSystemInstruction = META_ORCHESTRATOR_PROMPT + modeInstruction + transcriptionInstruction;

        const config: LiveConnectConfig = {
            responseModalities: ['AUDIO'] as any,
            systemInstruction: { parts: [{ text: finalSystemInstruction }] },
            tools: getGeminiTools(),
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
            model: GeminiLiveSession.MODEL,
            config,
            callbacks: {
                onopen: () => {
                    console.log(`[${this.sessionId}] Gemini Live WebSocket opened.`);
                },
                onmessage: (message: LiveServerMessage) => {
                    // Log tool calls to the timeline
                    if (message.toolCall?.functionCalls) {
                        for (const fc of message.toolCall.functionCalls) {
                            if (fc.name === 'emit_alert') {
                                this.logEvent('alert', fc.args || {});
                            } else if (fc.name === 'update_metrics') {
                                this.logEvent('metrics', fc.args || {});
                            }
                        }
                    }

                    // Log transcriptions
                    if (message.serverContent?.modelTurn?.parts) {
                        const textParts = message.serverContent.modelTurn.parts
                            .filter((p: any) => p.text)
                            .map((p: any) => p.text);
                        if (textParts.length > 0) {
                            this.logEvent('transcript', { speaker: 'model', text: textParts.join('') });
                        }
                    }

                    this.onMessageCallback(message);
                },
                onerror: (e: ErrorEvent) => {
                    console.error(`[${this.sessionId}] Gemini Live error:`, e.error);
                    this.logEvent('system', { message: 'WebSocket error', error: String(e.error) });
                },
                onclose: (e: any) => {
                    console.log(`[${this.sessionId}] Gemini Live WebSocket closed. Code: ${e?.code}, Reason: ${e?.reason}`);
                },
            },
        });
    }

    /**
     * Log a CV telemetry snapshot AND inject it into Gemini's context
     * so the orchestrator can reason about agents 1-3.
     */
    public logCvTelemetry(telemetry: Record<string, any>): void {
        this.cvSnapshots.push({ ts: Date.now(), ...telemetry });
        this.logEvent('cv_telemetry', telemetry);

        // Inject structured CV data into Gemini's conversation context
        // Inject structured CV data into Gemini's conversation context only every 10 seconds
        // to avoid locking the conversation turn indefinitely and blowing up tokens
        if (this.session && (Date.now() - this.lastInjectedTelemetryTs > 10000)) {
            this.lastInjectedTelemetryTs = Date.now();
            const report = [
                `[AGENT_TELEMETRY]`,
                `eye_contact=${telemetry.eyeContact ?? '--'}%`,
                `posture_angle=${telemetry.postureAngle ?? '--'}°`,
                `good_posture=${telemetry.isGoodPosture ?? '--'}`,
                `gestures_per_min=${telemetry.gesturesPerMin ?? '--'}`,
                `hand_visibility=${Math.round((telemetry.handVisibility ?? 0) * 100)}%`,
                `smile=${Math.round((telemetry.smileScore ?? 0) * 100)}%`,
                `stability=${Math.round((telemetry.bodyStability ?? 0) * 100) || '--'}%`,
                `overall_cv_score=${telemetry.overallScore ?? '--'}/100`,
                `gestures=[${(telemetry.currentGestures || []).join(',')}]`,
                `open_gesture_ratio=${Math.round((telemetry.openGestureRatio ?? 0) * 100)}%`,
            ].join(' ');

            this.session.sendClientContent({
                turns: [{ role: 'user', parts: [{ text: report }] }],
                turnComplete: true,
            });
        }
    }

    /**
     * Get the full session summary for report generation.
     */
    public getSessionSummary(): SessionSummary {
        const endedAt = Date.now();
        return {
            sessionId: this.sessionId,
            startedAt: this.startedAt,
            endedAt,
            durationMs: endedAt - this.startedAt,
            feedbackMode: this.feedbackMode,
            timeline: this.timeline,
            cvSnapshots: this.cvSnapshots,
        };
    }

    // ── Media Methods ───────────────────────────────────────────────────────

    public sendAudioChunk(pcmData: string): void {
        if (!this.session) return;
        this.session.sendRealtimeInput({
            audio: { mimeType: 'audio/pcm;rate=16000', data: pcmData },
        });
    }

    public sendVideoFrame(jpegData: string): void {
        // Disabled: gemini-2.5-flash-native-audio models do not support video modality.
        // We rely on the CV telemetry injected via logCvTelemetry instead.
        /*
        if (!this.session) return;
        this.session.sendRealtimeInput({
            video: { mimeType: 'image/jpeg', data: jpegData },
        });
        */
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
            this.logEvent('system', { message: 'Session ended' });
            console.log(`[${this.sessionId}] Disconnecting Gemini Live session...`);
            this.session.close();
            this.session = null;
        }
    }

    // ── Private ─────────────────────────────────────────────────────────────

    private logEvent(type: TimelineEvent['type'], data: Record<string, any>): void {
        this.timeline.push({ ts: Date.now(), type, data });
    }
}
