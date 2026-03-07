/**
 * Content Agent — batch Gemini analysis of transcript chunks.
 * Uses gemini-2.5-flash for cost-effective, non-realtime content evaluation.
 */

import { GoogleGenAI } from '@google/genai';
import { CONTENT_AGENT_PROMPT } from '../prompts/agent-system-prompts';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface ContentAssessment {
    contentScore: number;                    // 0-100
    argumentStrength: 'weak' | 'moderate' | 'strong';
    evidenceQuality: 'none' | 'anecdotal' | 'concrete' | 'data-driven';
    structureClarity: 'unclear' | 'partial' | 'clear';
    persuasionTechniques: string[];
    suggestions: string[];
    summary: string;
}

const DEFAULT_ASSESSMENT: ContentAssessment = {
    contentScore: 0,
    argumentStrength: 'weak',
    evidenceQuality: 'none',
    structureClarity: 'unclear',
    persuasionTechniques: [],
    suggestions: [],
    summary: 'Insufficient transcript to analyze.',
};

// ── Content Agent ───────────────────────────────────────────────────────────────

export class ContentAgent {
    private ai: GoogleGenAI;
    private static readonly MODEL = 'gemini-2.5-flash';
    private lastAssessment: ContentAssessment = { ...DEFAULT_ASSESSMENT };

    constructor() {
        this.ai = new GoogleGenAI({
            apiKey: process.env.GOOGLE_GENAI_API_KEY,
        });
    }

    /**
     * Analyze a transcript chunk and return a content assessment.
     * Should be called every ~20 seconds with accumulated transcript.
     */
    async analyzeTranscript(transcript: string): Promise<ContentAssessment> {
        if (!transcript || transcript.trim().length < 20) {
            return this.lastAssessment;
        }

        try {
            const response = await this.ai.models.generateContent({
                model: ContentAgent.MODEL,
                contents: `${CONTENT_AGENT_PROMPT}\n\nTRANSCRIPT:\n${transcript}`,
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
        } catch (err) {
            console.error('[ContentAgent] Analysis error:', err);
            return this.lastAssessment;
        }
    }

    getLastAssessment(): ContentAssessment {
        return this.lastAssessment;
    }
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}
