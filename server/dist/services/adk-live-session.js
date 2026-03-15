"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeliveryAgent = void 0;
const genai_1 = require("@google/genai");
const agent_system_prompts_1 = require("../prompts/agent-system-prompts");
// ── Delivery Agent (Gemini Live Session) ────────────────────────────────────────
/**
 * Focused Delivery Agent — manages a Gemini Live API session that is
 * responsible ONLY for audio-based delivery analysis:
 * - Transcription
 * - Pacing (WPM)
 * - Filler word counting
 * - Shark mode spoken feedback
 */
class DeliveryAgent {
    session = null;
    feedbackMode = 'silent';
    enableSpeech = true;
    // Callbacks
    onDeliveryReport = null;
    onAudioOutput = null;
    onRawMessage = null;
    // Timeline (shared with Orchestrator via reference)
    timeline = [];
    sessionId;
    startedAt = 0;
    static MODEL = process.env.GEMINI_MODEL
        || 'models/gemini-2.5-flash-native-audio-latest';
    constructor(sessionId, feedbackMode = 'silent', enableSpeech = true) {
        this.sessionId = sessionId;
        this.feedbackMode = feedbackMode;
        this.enableSpeech = enableSpeech;
    }
    /** Register callback for delivery reports (pacing, filler, transcript) */
    setOnDeliveryReport(cb) {
        this.onDeliveryReport = cb;
    }
    /** Register callback for audio output (shark mode) */
    setOnAudioOutput(cb) {
        this.onAudioOutput = cb;
    }
    /** Register callback for raw Gemini messages (for forwarding) */
    setOnRawMessage(cb) {
        this.onRawMessage = cb;
    }
    /**
     * Connect to the Gemini Live API and start listening.
     */
    async connect() {
        console.log(`[DeliveryAgent:${this.sessionId}] Connecting (mode: ${this.feedbackMode})...`);
        this.startedAt = Date.now();
        this.logEvent('system', { message: 'Delivery Agent started', feedbackMode: this.feedbackMode });
        if (!this.enableSpeech) {
            console.log(`[DeliveryAgent:${this.sessionId}] Speech disabled. Skipping Live API connection.`);
            return;
        }
        const ai = new genai_1.GoogleGenAI({
            apiKey: process.env.GOOGLE_GENAI_API_KEY,
        });
        // Build focused system instruction
        const modeAddendum = this.feedbackMode === 'shark'
            ? agent_system_prompts_1.DELIVERY_AGENT_SHARK_ADDENDUM
            : agent_system_prompts_1.DELIVERY_AGENT_SILENT_ADDENDUM;
        const systemInstruction = agent_system_prompts_1.DELIVERY_AGENT_PROMPT + modeAddendum;
        const config = {
            responseModalities: ['AUDIO'],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            tools: (0, agent_system_prompts_1.getDeliveryAgentTools)(),
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
                onmessage: (message) => {
                    // Handle report_delivery tool calls
                    if (message.toolCall?.functionCalls) {
                        for (const fc of message.toolCall.functionCalls) {
                            if (fc.name === 'report_delivery') {
                                const args = fc.args || {};
                                const report = {
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
                onerror: (e) => {
                    console.error(`[DeliveryAgent:${this.sessionId}] Error:`, e.error);
                    this.logEvent('system', { message: 'WebSocket error', error: String(e.error) });
                },
                onclose: (e) => {
                    console.log(`[DeliveryAgent:${this.sessionId}] WebSocket closed. Code: ${e?.code}`);
                },
            },
        });
    }
    // ── Media Methods ───────────────────────────────────────────────────────
    sendAudioChunk(pcmData) {
        if (!this.session)
            return;
        this.session.sendRealtimeInput({
            audio: { mimeType: 'audio/pcm;rate=16000', data: pcmData },
        });
    }
    /** Inject a coaching directive from the orchestrator (shark mode) */
    injectCoachingDirective(text) {
        if (!this.session)
            return;
        this.logEvent('system', { message: `Coach directive: ${text}` });
        this.session.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: `[COACH_DIRECTIVE] ${text}` }] }],
            turnComplete: true,
        });
    }
    sendTextMessage(text) {
        if (!this.session)
            return;
        this.logEvent('system', { message: `User chat: ${text}` });
        this.session.sendClientContent({
            turns: [{ role: 'user', parts: [{ text }] }],
            turnComplete: true,
        });
    }
    endTurn() {
        if (!this.session)
            return;
        this.session.sendClientContent({ turnComplete: true });
    }
    disconnect() {
        if (this.session) {
            this.logEvent('system', { message: 'Delivery Agent disconnected' });
            console.log(`[DeliveryAgent:${this.sessionId}] Disconnecting...`);
            this.session.close();
            this.session = null;
        }
    }
    getSessionSummary() {
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
    logEvent(type, data) {
        this.timeline.push({ ts: Date.now(), type, data });
    }
}
exports.DeliveryAgent = DeliveryAgent;
