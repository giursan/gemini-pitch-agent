"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReport = generateReport;
const genai_1 = require("@google/genai");
const REPORT_PROMPT = `You are an expert presentation coach analyzing a completed practice session. 
Based on the timeline of events and telemetry data below, generate a comprehensive analysis report.

Guidelines for Analysis:
1. ONLY include categories in the "categories" object if they were explicitly ENABLED during the session.
2. Incorporate specific metrics into the "summary" strings (e.g., "Your average pacing was 155 WPM" or "Detected 4 filler words").
3. Assessment should be based on the provided session data.
4. TASKS TRACKING: 
   - Look at the "openTasks" provided in the session data. If the user successfully addressed any of these tasks during this session (based on telemetry/transcript), list their IDs (e.g. "1", "2") in the "resolvedTaskIds" array.
   - Based on the "topImprovements", derive specific, actionable "newTasks". Each newTask should have a "description" and a "category" matching the improvement. 
   - ONLY create new tasks for categories that were ENABLED.

Return ONLY valid JSON in the structure below. Do not use markdown/code fences.

{
  "title": "<catchy title>",
  "overallScore": <0-100 derived only from ENABLED categories>,
  "duration": "<e.g. '2m 30s'>",
  "categories": {
    "eyeContact": { "score": <0-100>, "summary": "...", "tips": ["..."] },
    "posture": { "score": <0-100>, "summary": "...", "tips": ["..."] },
    "gestures": { "score": <0-100>, "summary": "...", "tips": ["..."] },
    "speech": { "score": <0-100>, "summary": "...", "tips": ["..."] },
    "content": { "score": <0-100>, "summary": "...", "tips": ["..."] }
  },
  "keyMoments": [ { "timeOffset": "...", "type": "...", "description": "..." } ],
  "newTasks": [ { "description": "...", "category": "eyeContact|posture|gestures|speech|content" } ],
  "resolvedTaskIds": ["..."],
  "topStrengths": ["..."],
  "topImprovements": ["..."],
  "coachNote": "..."
}

SESSION DATA:
`;
/**
 * Generates a post-session analysis report using Gemini (non-streaming).
 */
async function generateReport(summary) {
    const ai = new genai_1.GoogleGenAI({
        apiKey: process.env.GOOGLE_GENAI_API_KEY,
        httpOptions: { apiVersion: 'v1beta' }
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
    // Aggregate CV telemetry and Delivery Agent metrics
    const cvAverages = aggregateCvSnapshots(summary.cvSnapshots);
    const deliveryStats = aggregateDeliveryReports(summary.timeline);
    const sessionData = JSON.stringify({
        sessionId: summary.sessionId,
        durationMs: summary.durationMs,
        feedbackMode: summary.feedbackMode,
        enabledAgents: summary.agents,
        openTasks: summary.tasksContext || "None",
        cvAverages,
        deliveryStats,
        timeline: condensedTimeline,
    }, null, 2);
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-flash-latest',
            contents: REPORT_PROMPT + sessionData,
        });
        // Manually extract text parts to avoid the 'thoughtSignature' warning clutter
        const text = response.candidates?.[0]?.content?.parts
            ?.map(p => p.text)
            .filter(Boolean)
            .join('')
            .trim() || '{}';
        // Strip markdown code fences if present
        let cleaned = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
        // Attempt to fix common JSON issues if parse fails
        try {
            return JSON.parse(cleaned);
        }
        catch (e) {
            console.warn('[ReportGenerator] Primary JSON parse failed, attempting sanitization...', e);
            try {
                // Remove trailing commas
                cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
                // Ensure proper quoting if needed (risky but better than failing)
                return JSON.parse(cleaned);
            }
            catch (innerErr) {
                console.error('[ReportGenerator] Sanitization failed, returning fallback.', innerErr);
                throw innerErr;
            }
        }
    }
    catch (err) {
        console.error('Report generation error:', err);
        return {
            title: `Session Analysis — ${new Date(summary.startedAt).toLocaleDateString()}`,
            overallScore: 0,
            duration: `${Math.round(summary.durationMs / 1000)}s`,
            categories: {},
            keyMoments: [],
            topStrengths: [],
            topImprovements: ['Critical Error: The AI response could not be parsed as valid JSON.'],
            coachNote: 'We encountered an error generating your detailed report. Please check the session metrics for raw data.',
        };
    }
}
/**
 * Aggregate CV snapshots into averages for the report prompt.
 */
function aggregateCvSnapshots(snapshots) {
    if (snapshots.length === 0)
        return {};
    const sums = {};
    const counts = {};
    for (const snap of snapshots) {
        for (const [key, val] of Object.entries(snap)) {
            if (typeof val === 'number') {
                sums[key] = (sums[key] || 0) + val;
                counts[key] = (counts[key] || 0) + 1;
            }
        }
    }
    const averages = {};
    for (const key of Object.keys(sums)) {
        averages[key] = Math.round((sums[key] / counts[key]) * 100) / 100;
    }
    return averages;
}
/**
 * Aggregate delivery reports to get average pacing and total fillers.
 */
function aggregateDeliveryReports(timeline) {
    const reports = timeline.filter(e => e.type === 'delivery_report');
    if (reports.length === 0)
        return {};
    let totalPacing = 0;
    let totalFillers = 0;
    const fillerWords = [];
    const transcripts = [];
    for (const r of reports) {
        totalPacing += (r.data?.pacing || 0);
        totalFillers += (r.data?.filler || 0);
        if (Array.isArray(r.data?.fillerWords)) {
            fillerWords.push(...r.data.fillerWords);
        }
        if (r.data?.transcript)
            transcripts.push(r.data.transcript);
    }
    return {
        avgPacing: Math.round(totalPacing / reports.length),
        totalFillers,
        fillerBreakdown: fillerWords.reduce((acc, w) => {
            acc[w] = (acc[w] || 0) + 1;
            return acc;
        }, {}),
        fullTranscript: transcripts.join(' '),
    };
}
