"use strict";
/**
 * Content Agent — batch Gemini analysis of transcript chunks.
 * Uses gemini-2.5-flash for cost-effective, non-realtime content evaluation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentAgent = void 0;
const genai_1 = require("@google/genai");
const agent_system_prompts_1 = require("../prompts/agent-system-prompts");
const DEFAULT_ASSESSMENT = {
    contentScore: 0,
    argumentStrength: 'weak',
    evidenceQuality: 'none',
    structureClarity: 'unclear',
    persuasionTechniques: [],
    suggestions: [],
    summary: 'Insufficient transcript to analyze.',
};
// ── Content Agent ───────────────────────────────────────────────────────────────
class ContentAgent {
    ai;
    static MODEL = 'gemini-2.5-flash';
    lastAssessment = { ...DEFAULT_ASSESSMENT };
    constructor() {
        this.ai = new genai_1.GoogleGenAI({
            apiKey: process.env.GOOGLE_GENAI_API_KEY,
        });
    }
    /**
     * Analyze a transcript chunk and return a content assessment.
     * Should be called every ~20 seconds with accumulated transcript.
     */
    async analyzeTranscript(transcript) {
        if (!transcript || transcript.trim().length < 20) {
            return this.lastAssessment;
        }
        try {
            const response = await this.ai.models.generateContent({
                model: ContentAgent.MODEL,
                contents: `${agent_system_prompts_1.CONTENT_AGENT_PROMPT}\n\nTRANSCRIPT:\n${transcript}`,
            });
            const text = response.text?.trim() || '{}';
            const cleaned = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
            const parsed = JSON.parse(cleaned);
            this.lastAssessment = {
                contentScore: clamp(parsed.contentScore ?? 0, 0, 100),
                argumentStrength: parsed.argumentStrength || 'weak',
                evidenceQuality: parsed.evidenceQuality || 'none',
                structureClarity: parsed.structureClarity || 'unclear',
                persuasionTechniques: parsed.persuasionTechniques || [],
                suggestions: parsed.suggestions || [],
                summary: parsed.summary || '',
            };
            return this.lastAssessment;
        }
        catch (err) {
            console.error('[ContentAgent] Analysis error:', err);
            return this.lastAssessment;
        }
    }
    getLastAssessment() {
        return this.lastAssessment;
    }
}
exports.ContentAgent = ContentAgent;
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
