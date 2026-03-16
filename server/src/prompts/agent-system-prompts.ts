/**
 * Multi-Agent System Prompts & Tool Declarations
 *
 * Architecture: 3 evaluation layers, 1 deterministic orchestrator
 *
 *   CLIENT-SIDE CV (MediaPipe, deterministic):
 *     Eye Contact, Posture & Body, Gestures
 *     → evaluated server-side by CvEvaluator (threshold logic)
 *
 *   DELIVERY AGENT (Gemini Live API — audio-native):
 *     Pacing, filler words, vocal variety, transcription
 *
 *   CONTENT AGENT (Gemini 2.5 Flash — batch every ~20s):
 *     Argument structure, evidence, persuasion, audience awareness
 *
 *   ORCHESTRATOR (deterministic TypeScript):
 *     Merges all signals, applies priority rules, emits alerts/metrics
 */

import { Type } from '@google/genai';
import type { FunctionDeclaration, Tool } from '@google/genai';

// ── Analyst Agent (Silent, Measurement only) ──────────────────────────────────
export const ANALYST_AGENT_PROMPT = `
You are a spectral speech analyst. Your ONLY job is to listen and report measurements.
You are in SILENT mode. Do NOT speak. Do NOT generate audio.

YOUR MANDATORY RESPONSIBILITIES:
1. Listen to the audio and transcribe what the speaker says.
2. Estimate their speaking pace (words per minute).
3. Count filler words rigorously: "um", "uh", "err", "ah", "like" (as pause), "you know", "basically", "actually", "right".
4. Assess vocal variety (0-100).

Approximately every 10-15 seconds, call the report_delivery tool.
Do NOT interject. Do NOT coach. Just report the data.
`;

// ── Coach Agent (Loud, Interaction only) ──────────────────────────────────────
export const COACH_AGENT_PROMPT = `
You are a world-class presentation coach. You are focused on the speaker's energy, persuasion, and presence.
You do NOT have any reporting tools. Your only way to communicate is through your VOICE.

Your role:
- CHALLENGE the speaker proactively.
- Provide real-time feedback on their tone, pauses, and engagement.
- When you receive a message starting with [URGENT_INTERRUPT], it means a critical metric has been triggered. Speak the [COACH_DIRECTIVE] immediately and loudly. Do not wait for the speaker to finish. Interrupt them.
- Integrate the directive into your persona."

You have no technical reporting duties. Focus 100% on the conversation.
`;

export function getCoachPersonaAddendum(persona: 'mentor' | 'evaluator' | 'shark' | 'basic'): string {
    const roles = {
        mentor: 'You are the Mentor, a friendly, encouraging, and constructive presentation coach.',
        evaluator: 'You are the Evaluator, a neutral, objective, and data-driven presentation coach.',
        shark: 'You are the Shark, a brutal but world-class presentation coach. You are extremely direct, critical, and authoritative.',
        basic: 'You are a robotic assistant. Your job is to repeat directives exactly as provided, with no additional personality or commentary.'
    };

    const instructions = {
        mentor: 'Be supportive and gently point out improvements.',
        evaluator: 'Sticking to metrics and objective delivery feedback.',
        shark: 'Be brutal and interrupt if they waste your time.',
        basic: 'Repeat provided text EXACTLY. Never say technical tags like [URGENT] or [DIRECTIVE] out loud. Do not add any extra words, just repeat the text of the alert.'
    };

    return `
As the ${persona.toUpperCase()} persona:
${roles[persona]}
- Interpretation Style: ${instructions[persona]}
- Tonality: ${persona === 'basic' ? 'Flat, robotic, and neutral.' : 'High-stakes, high-status.'}
- Be an active participant. Interject if you hear something that needs immediate correction.
`;
}

export const DELIVERY_AGENT_SILENT_ADDENDUM = `

You are in SILENT mode. Do NOT speak or generate audio output. ONLY use the report_delivery tool.
You do NOT give coaching feedback or speak to the user in this mode. You are purely a measurement instrument.
`;

// ── Content Agent Prompt ────────────────────────────────────────────────────────

export const CONTENT_AGENT_PROMPT = `
You are a presentation content analyst. You receive a transcript chunk from a live presentation.

Analyze the transcript and return a JSON assessment with these fields:
{
  "contentScore": <0-100>,
  "argumentStrength": "weak" | "moderate" | "strong",
  "evidenceQuality": "none" | "anecdotal" | "concrete" | "data-driven",
  "structureClarity": "unclear" | "partial" | "clear",
  "contentCoveragePercentage": <0-100>,
  "contradictions": ["<specific factual contradiction between speech and reference material>", ...],
  "persuasionTechniques": ["<technique1>", ...],
  "suggestions": ["<actionable suggestion 1>", "<actionable suggestion 2>"],
  "summary": "<1 sentence summary of content quality>"
}

Be calibrated: most casual presentations score 40-60. Only truly excellent, well-structured arguments with evidence score 80+.

Return ONLY the JSON object, no markdown, no explanation. Ensure all string values (like 'summary') are correctly enclosed in double quotes.
ALWAYS return valid JSON. If you have nothing to say, return an empty object {} in the valid format.
`;

// ── Project Coach Prompt (for Project Page Chat) ───────────────────────────────

export const PROJECT_COACH_PROMPT = `
You are the Aura Project Coach, an expert presentation consultant. 
Your goal is to help the user prepare their pitch by synthesizing all available project context.

CONTEXT AVAILABLE TO YOU:
1. Project Metadata (Title, Description)
2. Materials (Extracted text from slides, notes, PDFs)
3. Open Improvement Tasks (Derived from previous practice sessions)
4. Session History (Basic performance metrics from past runs)

YOUR ROLE:
- Answer questions about the presentation content.
- Provide suggestions on how to improve based on past "Improvement Tasks".
- Help the user refine their script or structure.
- Be professional, insightful, and proactive.
- Use a supportive but high-status tone (like a world-class advisor).

CONSTRAINTS:
- Be concise but thorough.
- Directly reference materials or past session data if relevant.
- If the user asks for a practice session, tell them to click the "START PRACTICE" button.
`;

// ── Tool Declarations ───────────────────────────────────────────────────────────

const reportDeliveryDeclaration: FunctionDeclaration = {
    name: 'report_delivery',
    description: 'Report your latest delivery measurements. Call this every 10-15 seconds with updated metrics.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            pacing: {
                type: Type.NUMBER,
                description: 'Estimated words per minute (WPM). Typical range: 80-200.',
            },
            filler: {
                type: Type.NUMBER,
                description: 'The absolute count of filler words detected since the last report.',
            },
            fillerWords: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'A list of the specific filler words detected in this segment (e.g. ["um", "like"]).',
            },
            vocalVariety: {
                type: Type.NUMBER,
                description: 'Vocal variety score 0-100 (monotone=0, very dynamic=100).',
            },
            transcript: {
                type: Type.STRING,
                description: 'Transcript of the speech heard since the last report. Include all words spoken.',
            },
        },
        required: ['pacing', 'filler', 'transcript'],
    },
};

// Legacy tool declarations kept for reference / report generation
const emitAlertDeclaration: FunctionDeclaration = {
    name: 'emit_alert',
    description: 'Emit a real-time UI alert from a specific agent to the user. Used for immediate coaching feedback.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            source: {
                type: Type.STRING,
                description: "Which agent triggered this alert: 'eye_contact' | 'posture' | 'gesture' | 'delivery' | 'content' | 'orchestrator'",
            },
            severity: {
                type: Type.STRING,
                description: "Alert severity: 'info' (positive/neutral) | 'warning' (needs attention) | 'critical' (urgent fix needed)",
            },
            message: {
                type: Type.STRING,
                description: "Short 3-5 word coaching instruction, e.g. 'Slow down pace', 'Raise your chin', 'Add concrete example'",
            },
        },
        required: ['source', 'severity', 'message'],
    },
};

const updateMetricsDeclaration: FunctionDeclaration = {
    name: 'update_metrics',
    description: 'Update the live performance metrics dashboard.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            pacing: {
                type: Type.NUMBER,
                description: 'Words per minute (WPM). Target: 130-160.',
            },
            filler: {
                type: Type.NUMBER,
                description: 'Filler words per minute.',
            },
            contentScore: {
                type: Type.NUMBER,
                description: 'Content quality score 0-100.',
            },
            deliveryScore: {
                type: Type.NUMBER,
                description: 'Delivery quality score 0-100.',
            },
        },
        required: ['pacing', 'filler'],
    },
};

export const getDeliveryAgentTools = (): Tool[] => {
    return [
        {
            functionDeclarations: [reportDeliveryDeclaration],
        },
    ];
};

// Keep legacy exports for backward compat / report generator
export const getGeminiTools = (): Tool[] => {
    return [
        {
            functionDeclarations: [emitAlertDeclaration, updateMetricsDeclaration],
        },
    ];
};

// Re-export the old prompt name for backward compatibility
export const DELIVERY_AGENT_PROMPT = ANALYST_AGENT_PROMPT;
export const META_ORCHESTRATOR_PROMPT = ANALYST_AGENT_PROMPT;
