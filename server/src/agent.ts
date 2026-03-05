import 'dotenv/config';
import { FunctionTool, LlmAgent } from '@google/adk';
import { z } from 'zod';
import { META_ORCHESTRATOR_PROMPT } from './prompts/agent-system-prompts';

// ── Tool: emit_alert ────────────────────────────────────────
const emitAlert = new FunctionTool({
    name: 'emit_alert',
    description: 'Emit a real-time UI alert to the user without interrupting their speech.',
    parameters: z.object({
        severity: z.enum(['info', 'warning', 'critical']).describe("Either 'info', 'warning', or 'critical'"),
        message: z.string().describe("Short 3-5 word instruction (e.g. 'Speak Louder', 'Look at camera')"),
    }),
    execute: ({ severity, message }) => {
        // Tool results are forwarded to the client via ADK events.
        // The actual UI rendering is handled client-side.
        return { severity, message, timestamp: Date.now() };
    },
});

// ── Tool: update_metrics ────────────────────────────────────
const updateMetrics = new FunctionTool({
    name: 'update_metrics',
    description: 'Update the live telemetry dials on the user\'s screen.',
    parameters: z.object({
        eyeContact: z.number().int().min(0).max(100).describe('Estimated eye contact percentage (0-100)'),
        pacing: z.number().int().min(0).describe('Estimated pacing in words per minute (WPM)'),
        filler: z.number().int().min(0).describe('Filler words per minute'),
    }),
    execute: ({ eyeContact, pacing, filler }) => {
        return { eyeContact, pacing, filler, timestamp: Date.now() };
    },
});

// ── Root Agent ──────────────────────────────────────────────
export const rootAgent = new LlmAgent({
    name: 'aura_presentation_mentor',
    model: 'gemini-2.5-flash-preview-native-audio-dialog',
    description: 'An elite presentation coach that observes via live video/audio and provides real-time feedback.',
    instruction: META_ORCHESTRATOR_PROMPT,
    tools: [emitAlert, updateMetrics],
});
