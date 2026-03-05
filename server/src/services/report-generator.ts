import { GoogleGenAI } from '@google/genai';
import type { SessionSummary } from './adk-live-session';

const REPORT_PROMPT = `You are an expert presentation coach analyzing a completed practice session. 
Based on the timeline of events below, generate a comprehensive analysis report.

Return ONLY valid JSON in the following structure (no markdown, no code fences):
{
  "overallScore": <number 0-100>,
  "duration": "<formatted string like '2m 30s'>",
  "categories": {
    "eyeContact": { "score": <0-100>, "summary": "<1-2 sentences>", "tips": ["<tip1>", "<tip2>"] },
    "posture": { "score": <0-100>, "summary": "<1-2 sentences>", "tips": ["<tip1>", "<tip2>"] },
    "gestures": { "score": <0-100>, "summary": "<1-2 sentences>", "tips": ["<tip1>", "<tip2>"] },
    "speech": { "score": <0-100>, "summary": "<1-2 sentences>", "tips": ["<tip1>", "<tip2>"] },
    "content": { "score": <0-100>, "summary": "<1-2 sentences>", "tips": ["<tip1>", "<tip2>"] }
  },
  "keyMoments": [
    { "timeOffset": "<e.g. '0:45'>", "type": "<alert|positive|suggestion>", "description": "<what happened>" }
  ],
  "topStrengths": ["<strength1>", "<strength2>", "<strength3>"],
  "topImprovements": ["<improvement1>", "<improvement2>", "<improvement3>"],
  "coachNote": "<2-3 sentence personalized encouragement and next-steps>"
}

SESSION DATA:
`;

/**
 * Generates a post-session analysis report using Gemini (non-streaming).
 */
export async function generateReport(summary: SessionSummary): Promise<Record<string, any>> {
    const ai = new GoogleGenAI({
        apiKey: process.env.GOOGLE_GENAI_API_KEY,
    });

    // Build a condensed version of the timeline for the prompt
    const condensedTimeline = summary.timeline
        .filter(e => e.type !== 'cv_telemetry') // Too noisy for the prompt
        .map(e => ({
            time: new Date(e.ts).toISOString(),
            offsetMs: e.ts - summary.startedAt,
            type: e.type,
            ...e.data,
        }));

    // Aggregate CV telemetry into averages
    const cvAverages = aggregateCvSnapshots(summary.cvSnapshots);

    const sessionData = JSON.stringify({
        sessionId: summary.sessionId,
        durationMs: summary.durationMs,
        feedbackMode: summary.feedbackMode,
        cvAverages,
        timeline: condensedTimeline,
    }, null, 2);

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-05-20',
            contents: REPORT_PROMPT + sessionData,
        });

        const text = response.text?.trim() || '{}';
        // Strip markdown code fences if present
        const cleaned = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
        return JSON.parse(cleaned);
    } catch (err) {
        console.error('Report generation error:', err);
        return {
            overallScore: 0,
            duration: `${Math.round(summary.durationMs / 1000)}s`,
            categories: {},
            keyMoments: [],
            topStrengths: [],
            topImprovements: ['Session data was insufficient for analysis.'],
            coachNote: 'Try a longer session next time for a more detailed analysis.',
        };
    }
}

/**
 * Aggregate CV snapshots into averages for the report prompt.
 */
function aggregateCvSnapshots(snapshots: Record<string, any>[]): Record<string, any> {
    if (snapshots.length === 0) return {};

    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};

    for (const snap of snapshots) {
        for (const [key, val] of Object.entries(snap)) {
            if (typeof val === 'number') {
                sums[key] = (sums[key] || 0) + val;
                counts[key] = (counts[key] || 0) + 1;
            }
        }
    }

    const averages: Record<string, number> = {};
    for (const key of Object.keys(sums)) {
        averages[key] = Math.round((sums[key] / counts[key]) * 100) / 100;
    }
    return averages;
}
