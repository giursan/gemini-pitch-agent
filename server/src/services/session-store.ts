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
db.settings({ ignoreUndefinedProperties: true });
const USERS_COLLECTION = 'users';
const SESSIONS_COLLECTION = 'sessions';

// ── Session Store (Firestore) ───────────────────────────────────────────────────

export const sessionStore = {
    /**
     * Save a session with its report.
     */
    async save(ownerId: string, summary: SessionSummary, report: Record<string, any>): Promise<void> {
        const data = {
            ...summary,
            report,
            savedAt: Date.now(),
        };
        await db.collection(USERS_COLLECTION).doc(ownerId)
            .collection(SESSIONS_COLLECTION).doc(summary.sessionId).set(data);
        console.log(`Session saved to Firestore: ${summary.sessionId}`);
    },

    /**
     * List all saved sessions (metadata only).
     */
    async list(ownerId: string): Promise<Array<{
        sessionId: string;
        startedAt: number;
        endedAt: number | null;
        durationMs: number;
        feedbackMode: string;
        overallScore: number;
        title: string;
    }>> {
        try {
            const snapshot = await db.collection(USERS_COLLECTION).doc(ownerId)
                .collection(SESSIONS_COLLECTION)
                .orderBy('startedAt', 'desc')
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
        } catch (err: any) {
            if (err.code === 9) { // FAILED_PRECONDITION
                console.error('─── MISSING FIRESTORE INDEX ───');
                console.error('A collection group index is required for "sessions" ordered by "startedAt" DESC.');
                console.error('Please create it in the Firebase Console: https://console.firebase.google.com/project/_/firestore/indexes');
                console.error('──────────────────────────────');
            } else {
                console.error('Failed to list sessions:', err);
            }
            return [];
        }
    },

    /**
     * Get a full session by ID.
     */
    async get(ownerId: string, sessionId: string): Promise<Record<string, any> | null> {
        try {
            const doc = await db.collection(USERS_COLLECTION).doc(ownerId)
                .collection(SESSIONS_COLLECTION).doc(sessionId).get();
            if (!doc.exists) return null;
            return doc.data() as Record<string, any>;
        } catch (err: any) {
            console.error(`Failed to get session ${sessionId}:`, err.message);
            return null;
        }
    },

    /**
     * Delete a session by ID.
     */
    async delete(ownerId: string, sessionId: string): Promise<void> {
        try {
            await db.collection(USERS_COLLECTION).doc(ownerId)
                .collection(SESSIONS_COLLECTION).doc(sessionId).delete();
            console.log(`Session deleted: ${sessionId}`);
        } catch (err: any) {
            console.error(`Failed to delete session ${sessionId}:`, err.message);
        }
    },
};
