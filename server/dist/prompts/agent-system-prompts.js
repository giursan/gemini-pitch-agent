"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.META_ORCHESTRATOR_PROMPT = exports.getGeminiTools = exports.getDeliveryAgentTools = exports.CONTENT_AGENT_PROMPT = exports.DELIVERY_AGENT_SILENT_ADDENDUM = exports.DELIVERY_AGENT_SHARK_ADDENDUM = exports.DELIVERY_AGENT_PROMPT = void 0;
const genai_1 = require("@google/genai");
// ── Delivery Agent Prompt ───────────────────────────────────────────────────────
exports.DELIVERY_AGENT_PROMPT = `
You are a speech delivery analyzer. You receive a live audio stream of a presenter speaking.

YOUR SOLE RESPONSIBILITIES:
1. Listen to the audio and transcribe what the speaker says
2. Estimate their speaking pace (words per minute)
3. Count filler words ("um", "uh", "like", "you know", "so", "basically", "right")
4. Assess vocal variety on a 0-100 scale (monotone=0, dynamic=100)

EVERY 10-15 SECONDS, you MUST call the report_delivery tool with your latest measurements.
Include a transcript of the speech you heard since your last report.

You do NOT give coaching feedback. You do NOT analyze content quality.
You are a measurement instrument. Be precise and consistent.
`;
exports.DELIVERY_AGENT_SHARK_ADDENDUM = `

ADDITIONAL ROLE — SHARK MODE:
In addition to your measurement duties, you also SPEAK OUT LOUD as a tough presentation coach.
When you receive a [COACH_DIRECTIVE] message, follow its instruction and speak it to the user.
You may also independently interject with tough investor-style questions to challenge the speaker.
Be direct, challenging, and constructive. Do not hold back.
`;
exports.DELIVERY_AGENT_SILENT_ADDENDUM = `

You are in SILENT mode. Do NOT speak or generate audio output. ONLY use the report_delivery tool.
`;
// ── Content Agent Prompt ────────────────────────────────────────────────────────
exports.CONTENT_AGENT_PROMPT = `
You are a presentation content analyst. You receive a transcript chunk from a live presentation.

Analyze the transcript and return a JSON assessment with these fields:
{
  "contentScore": <0-100>,
  "argumentStrength": "weak" | "moderate" | "strong",
  "evidenceQuality": "none" | "anecdotal" | "concrete" | "data-driven",
  "structureClarity": "unclear" | "partial" | "clear",
  "persuasionTechniques": ["<technique1>", ...],
  "suggestions": ["<actionable suggestion 1>", "<actionable suggestion 2>"],
  "summary": "<1 sentence summary of content quality>"
}

Be calibrated: most casual presentations score 40-60. Only truly excellent, well-structured arguments with evidence score 80+.

Return ONLY the JSON object, no markdown, no explanation.
`;
// ── Tool Declarations ───────────────────────────────────────────────────────────
const reportDeliveryDeclaration = {
    name: 'report_delivery',
    description: 'Report your latest delivery measurements. Call this every 10-15 seconds with updated metrics.',
    parameters: {
        type: genai_1.Type.OBJECT,
        properties: {
            pacing: {
                type: genai_1.Type.NUMBER,
                description: 'Estimated words per minute (WPM). Typical range: 80-200.',
            },
            filler: {
                type: genai_1.Type.NUMBER,
                description: 'Filler words per minute (um, uh, like, you know).',
            },
            vocalVariety: {
                type: genai_1.Type.NUMBER,
                description: 'Vocal variety score 0-100 (monotone=0, very dynamic=100).',
            },
            transcript: {
                type: genai_1.Type.STRING,
                description: 'Transcript of the speech heard since the last report. Include all words spoken.',
            },
        },
        required: ['pacing', 'filler', 'transcript'],
    },
};
// Legacy tool declarations kept for reference / report generation
const emitAlertDeclaration = {
    name: 'emit_alert',
    description: 'Emit a real-time UI alert from a specific agent to the user. Used for immediate coaching feedback.',
    parameters: {
        type: genai_1.Type.OBJECT,
        properties: {
            source: {
                type: genai_1.Type.STRING,
                description: "Which agent triggered this alert: 'eye_contact' | 'posture' | 'gesture' | 'delivery' | 'content' | 'orchestrator'",
            },
            severity: {
                type: genai_1.Type.STRING,
                description: "Alert severity: 'info' (positive/neutral) | 'warning' (needs attention) | 'critical' (urgent fix needed)",
            },
            message: {
                type: genai_1.Type.STRING,
                description: "Short 3-5 word coaching instruction, e.g. 'Slow down pace', 'Raise your chin', 'Add concrete example'",
            },
        },
        required: ['source', 'severity', 'message'],
    },
};
const updateMetricsDeclaration = {
    name: 'update_metrics',
    description: 'Update the live performance metrics dashboard.',
    parameters: {
        type: genai_1.Type.OBJECT,
        properties: {
            pacing: {
                type: genai_1.Type.NUMBER,
                description: 'Words per minute (WPM). Target: 130-160.',
            },
            filler: {
                type: genai_1.Type.NUMBER,
                description: 'Filler words per minute.',
            },
            contentScore: {
                type: genai_1.Type.NUMBER,
                description: 'Content quality score 0-100.',
            },
            deliveryScore: {
                type: genai_1.Type.NUMBER,
                description: 'Delivery quality score 0-100.',
            },
        },
        required: ['pacing', 'filler'],
    },
};
const getDeliveryAgentTools = () => {
    return [
        {
            functionDeclarations: [reportDeliveryDeclaration],
        },
    ];
};
exports.getDeliveryAgentTools = getDeliveryAgentTools;
// Keep legacy exports for backward compat / report generator
const getGeminiTools = () => {
    return [
        {
            functionDeclarations: [emitAlertDeclaration, updateMetricsDeclaration],
        },
    ];
};
exports.getGeminiTools = getGeminiTools;
// Re-export the old prompt name for agent.ts (ADK, unused in new flow)
exports.META_ORCHESTRATOR_PROMPT = exports.DELIVERY_AGENT_PROMPT;
