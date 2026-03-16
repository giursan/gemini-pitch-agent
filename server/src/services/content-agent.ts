/**
 * Content Agent — batch Gemini analysis of transcript chunks.
 * Uses gemini-flash-latest for cost-effective, non-realtime content evaluation.
 */

import { GoogleGenAI } from '@google/genai';
import { CONTENT_AGENT_PROMPT } from '../prompts/agent-system-prompts';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface ContentAssessment {
    contentScore: number;                    // 0-100
    argumentStrength: 'weak' | 'moderate' | 'strong';
    evidenceQuality: 'none' | 'anecdotal' | 'concrete' | 'data-driven';
    structureClarity: 'unclear' | 'partial' | 'clear';
    contentCoveragePercentage: number;
    contradictions: string[];
    persuasionTechniques: string[];
    suggestions: string[];
    summary: string;
}

const DEFAULT_ASSESSMENT: ContentAssessment = {
    contentScore: 0,
    argumentStrength: 'weak',
    evidenceQuality: 'none',
    structureClarity: 'unclear',
    contentCoveragePercentage: 0,
    contradictions: [],
    persuasionTechniques: [],
    suggestions: [],
    summary: 'Insufficient transcript to analyze.',
};

// ── Content Agent ───────────────────────────────────────────────────────────────

export class ContentAgent {
    private ai: GoogleGenAI;
    private static readonly MODEL = 'gemini-flash-latest';
    private lastAssessment: ContentAssessment = { ...DEFAULT_ASSESSMENT };

    constructor() {
        this.ai = new GoogleGenAI({
            apiKey: process.env.GOOGLE_GENAI_API_KEY,
            httpOptions: { apiVersion: 'v1beta' }
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
                config: {
                    responseMimeType: 'application/json',
                }
            });

            const text = response.candidates?.[0]?.content?.parts
                ?.map(p => (p as any).text)
                .filter(Boolean)
                .join('') || '{}';
            
            // Clean markdown block if present, then attempt to find the first '{' and last '}'
            let cleaned = text.trim();
            if (cleaned.includes('```')) {
                cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
            }
            
            // If the model still returned some text before the JSON, find the actual object boundaries
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                cleaned = cleaned.slice(firstBrace, lastBrace + 1);
            }

            let parsed;
            try {
                parsed = JSON.parse(cleaned);
            } catch (pErr) {
                console.error(`[ContentAgent] JSON Parse Error. Original text:`, text);
                console.error(`[ContentAgent] Cleaned text attempted:`, cleaned);
                throw pErr;
            }

            this.lastAssessment = {
                contentScore: clamp(parsed.contentScore ?? 0, 0, 100),
                argumentStrength: parsed.argumentStrength || 'weak',
                evidenceQuality: parsed.evidenceQuality || 'none',
                structureClarity: parsed.structureClarity || 'unclear',
                contentCoveragePercentage: clamp(parsed.contentCoveragePercentage ?? 0, 0, 100),
                contradictions: parsed.contradictions || [],
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
