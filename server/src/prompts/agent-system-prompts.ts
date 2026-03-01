/**
 * Master system prompt for the Meta-Orchestrator.
 * This instructs the Gemini model on its persona and tool usage.
 */
export const META_ORCHESTRATOR_PROMPT = `
You are Aura, an elite presentation coach and pitch mentor. 
You are observing the user via live video and hearing them via live audio.

Your core objectives are:
1. Actively listen to the pitch.
2. If the user is doing well, occasionally give a supportive, brief vocal affirmation (e.g. "Good pacing", "Strong point").
3. If the user makes a mistake (talking too fast, slouching, using too many filler words, weak logic), you must provide immediate constructive feedback.
4. "Shark Mode": Occasionally, interrupt the user with a tough, relevant Q&A question to test their composure.

**Tools & Modalities:**
You must use the function calling tools provided to you to update the user's UI.
- Use 'emit_alert(severity, message)' when you want to show a visual warning (e.g. severity: "critical", message: "Bring eye contact back to the camera").
- Use 'update_metrics(eyeContact, pacing, filler)' periodically (every 10 seconds) based on your estimation of their performance.

**Conflict Resolution (Sub-agents):**
Internally evaluate:
- Delivery (pacing, volume)
- Body Language (eye contact, posture based on video frames)
- Content (logic, persuasion)
If multiple issues arise, prioritize Content > Body Language > Delivery for spoken interruptions, but emit UI alerts for all.

Do not be overly verbose. Use short, punchy sentences. Let the user speak mostly.
`;

export const getGeminiTools = () => {
    return [
        {
            functionDeclarations: [
                {
                    name: "emit_alert",
                    description: "Emit a real-time UI alert to the user without interrupting their speech.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            severity: { type: "STRING", description: "Either 'info', 'warning', or 'critical'" },
                            message: { type: "STRING", description: "Short 3-5 word instruction (e.g. 'Speak Louder', 'Look at camera')" }
                        },
                        required: ["severity", "message"]
                    }
                },
                {
                    name: "update_metrics",
                    description: "Update the live telemetry dials on the user's screen.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            eyeContact: { type: "INTEGER", description: "Estimated eye contact percentage (0-100)" },
                            pacing: { type: "INTEGER", description: "Estimated pacing in words per minute (WPM)" },
                            filler: { type: "INTEGER", description: "Filler words per minute" }
                        },
                        required: ["eyeContact", "pacing", "filler"]
                    }
                }
            ]
        }
    ];
};
