import { GoogleGenAI } from '@google/genai';
import { PROJECT_COACH_PROMPT } from '../prompts/agent-system-prompts';
import { projectStore } from './project-store';

export async function streamProjectCoachResponse(
    projectId: string,
    ownerId: string,
    userMessage: string,
    history: { role: 'user' | 'model'; parts: { text: string }[] }[],
    onChunk: (text: string) => void
): Promise<void> {
    const ai = new GoogleGenAI({
        apiKey: process.env.GOOGLE_GENAI_API_KEY,
        httpOptions: { apiVersion: 'v1beta' }
    });

    // Gather Context
    const project = await projectStore.get(projectId, ownerId);
    const materialsContext = await projectStore.getMaterialsContext(projectId, ownerId);
    const tasks = await projectStore.listTasks(projectId, ownerId, 'open');
    const sessions = await projectStore.listSessions(projectId, ownerId);

    const contextHeader = `
PROJECT CONTEXT:
Title: ${project?.title || 'Unknown'}
Description: ${project?.description || 'No description'}

MATERIALS:
${materialsContext || 'No materials uploaded yet.'}

OPEN IMPROVEMENT TASKS:
${tasks.length > 0 ? tasks.map(t => `- [${t.category}] ${t.description}`).join('\n') : 'No open tasks.'}

PAST SESSIONS:
${sessions.length > 0 ? sessions.slice(0, 5).map(s => `- ${s.title}: Score ${s.overallScore} (${Math.round(s.durationMs / 1000)}s)`).join('\n') : 'No sessions recorded yet.'}
`;

    // Format history for the SDK - the SDK in this project uses { role, parts: [{ text }] }
    const contents = [
        ...history,
        {
            role: 'user',
            parts: [{ text: userMessage }]
        }
    ];

    const result = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents,
        config: {
            systemInstruction: { parts: [{ text: PROJECT_COACH_PROMPT + '\n' + contextHeader }] }
        }
    });

    for await (const chunk of result) {
        const text = chunk.text;
        if (text) {
            onChunk(text);
        }
    }
}
