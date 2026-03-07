import admin from 'firebase-admin';
import path from 'path';
import type { SessionSummary } from './adk-live-session';

// ── Initialize Firebase Admin ───────────────────────────────────────────────────

const serviceAccountPath = path.resolve(process.cwd(), '..', 'service-account.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
        projectId: process.env.FIREBASE_PROJECT_ID || 'gemini-pitch-agent-c23da',
    });
}

const db = admin.firestore();
const SESSIONS_COLLECTION = 'sessions';

// ── Session Store (Firestore) ───────────────────────────────────────────────────

export const sessionStore = {
    /**
     * Save a session with its report.
     */
    async save(summary: SessionSummary, report: Record<string, any>): Promise<void> {
        const data = {
            ...summary,
            report,
            savedAt: Date.now(),
        };
        await db.collection(SESSIONS_COLLECTION).doc(summary.sessionId).set(data);
        console.log(`Session saved to Firestore: ${summary.sessionId}`);
    },

    /**
     * List all saved sessions (metadata only).
     */
    async list(): Promise<Array<{
        sessionId: string;
        startedAt: number;
        endedAt: number | null;
        durationMs: number;
        feedbackMode: string;
        overallScore: number;
        title: string;
    }>> {
        const snapshot = await db.collection(SESSIONS_COLLECTION)
            .orderBy('startedAt', 'desc')
            .select('sessionId', 'startedAt', 'endedAt', 'durationMs', 'feedbackMode', 'report')
            .get();

        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                sessionId: data.sessionId,
                startedAt: data.startedAt,
                endedAt: data.endedAt,
                durationMs: data.durationMs,
                feedbackMode: data.feedbackMode,
                overallScore: data.report?.overallScore ?? 0,
                title: data.report?.title ?? `Session ${data.sessionId.slice(0, 8)}`,
            };
        });
    },

    /**
     * Get a full session by ID.
     */
    async get(sessionId: string): Promise<Record<string, any> | null> {
        const doc = await db.collection(SESSIONS_COLLECTION).doc(sessionId).get();
        if (!doc.exists) return null;
        return doc.data() as Record<string, any>;
    },

    /**
     * Delete a session by ID.
     */
    async delete(sessionId: string): Promise<void> {
        await db.collection(SESSIONS_COLLECTION).doc(sessionId).delete();
        console.log(`Session deleted from Firestore: ${sessionId}`);
    },
};
