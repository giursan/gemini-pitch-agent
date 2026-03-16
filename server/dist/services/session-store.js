"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionStore = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const path_1 = __importDefault(require("path"));
// ── Initialize Firebase Admin ───────────────────────────────────────────────────
const serviceAccountPath = path_1.default.resolve(process.cwd(), '..', 'service-account.json');
if (!firebase_admin_1.default.apps.length) {
    firebase_admin_1.default.initializeApp({
        credential: firebase_admin_1.default.credential.cert(serviceAccountPath),
        projectId: process.env.FIREBASE_PROJECT_ID || 'gemini-pitch-agent-c23da',
    });
}
const db = firebase_admin_1.default.firestore();
db.settings({ ignoreUndefinedProperties: true });
const SESSIONS_COLLECTION = 'sessions';
// ── Session Store (Firestore) ───────────────────────────────────────────────────
exports.sessionStore = {
    /**
     * Save a session with its report.
     */
    async save(summary, report) {
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
    async list() {
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
    async get(sessionId) {
        const doc = await db.collection(SESSIONS_COLLECTION).doc(sessionId).get();
        if (!doc.exists)
            return null;
        return doc.data();
    },
    /**
     * Delete a session by ID.
     */
    async delete(sessionId) {
        await db.collection(SESSIONS_COLLECTION).doc(sessionId).delete();
        console.log(`Session deleted from Firestore: ${sessionId}`);
    },
};
