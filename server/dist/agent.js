"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rootAgent = void 0;
require("dotenv/config");
const adk_1 = require("@google/adk");
const zod_1 = require("zod");
const agent_system_prompts_1 = require("./prompts/agent-system-prompts");
// ── Tool: emit_alert ────────────────────────────────────────
const emitAlert = new adk_1.FunctionTool({
    name: 'emit_alert',
    description: 'Emit a real-time UI alert to the user without interrupting their speech.',
    parameters: zod_1.z.object({
        severity: zod_1.z.enum(['info', 'warning', 'critical']).describe("Either 'info', 'warning', or 'critical'"),
        message: zod_1.z.string().describe("Short 3-5 word instruction (e.g. 'Speak Louder', 'Look at camera')"),
    }),
    execute: ({ severity, message }) => {
        // Tool results are forwarded to the client via ADK events.
        // The actual UI rendering is handled client-side.
        return { severity, message, timestamp: Date.now() };
    },
});
// ── Tool: update_metrics ────────────────────────────────────
const updateMetrics = new adk_1.FunctionTool({
    name: 'update_metrics',
    description: 'Update the live telemetry dials on the user\'s screen.',
    parameters: zod_1.z.object({
        eyeContact: zod_1.z.number().int().min(0).max(100).describe('Estimated eye contact percentage (0-100)'),
        pacing: zod_1.z.number().int().min(0).describe('Estimated pacing in words per minute (WPM)'),
        filler: zod_1.z.number().int().min(0).describe('Filler words per minute'),
    }),
    execute: ({ eyeContact, pacing, filler }) => {
        return { eyeContact, pacing, filler, timestamp: Date.now() };
    },
});
// ── Root Agent ──────────────────────────────────────────────
exports.rootAgent = new adk_1.LlmAgent({
    name: 'aura_presentation_mentor',
    model: 'gemini-2.5-flash-preview-native-audio-dialog',
    description: 'An elite presentation coach that observes via live video/audio and provides real-time feedback.',
    instruction: agent_system_prompts_1.META_ORCHESTRATOR_PROMPT,
    tools: [emitAlert, updateMetrics],
});
