import fs from 'fs';
import path from 'path';
import type { SessionSummary } from './adk-live-session';

const SESSIONS_DIR = path.join(process.cwd(), 'data', 'sessions');

/**
 * Simple file-based session store. Each session is a JSON file.
 */
export const sessionStore = {
    /**
     * Save a session with its report.
     */
    save(summary: SessionSummary, report: Record<string, any>): void {
        fs.mkdirSync(SESSIONS_DIR, { recursive: true });
        const filePath = path.join(SESSIONS_DIR, `${summary.sessionId}.json`);
        const data = {
            ...summary,
            report,
            savedAt: Date.now(),
        };
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`Session saved: ${filePath}`);
    },

    /**
     * List all saved sessions (metadata only, not full timelines).
     */
    list(): Array<{
        sessionId: string;
        startedAt: number;
        endedAt: number | null;
        durationMs: number;
        feedbackMode: string;
        overallScore: number;
    }> {
        if (!fs.existsSync(SESSIONS_DIR)) return [];

        return fs.readdirSync(SESSIONS_DIR)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                try {
                    const raw = fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8');
                    const data = JSON.parse(raw);
                    return {
                        sessionId: data.sessionId,
                        startedAt: data.startedAt,
                        endedAt: data.endedAt,
                        durationMs: data.durationMs,
                        feedbackMode: data.feedbackMode,
                        overallScore: data.report?.overallScore ?? 0,
                    };
                } catch {
                    return null;
                }
            })
            .filter(Boolean)
            .sort((a: any, b: any) => b.startedAt - a.startedAt) as any[];
    },

    /**
     * Get a full session by ID.
     */
    get(sessionId: string): Record<string, any> | null {
        const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    },
};
