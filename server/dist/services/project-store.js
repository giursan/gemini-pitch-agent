"use strict";
/**
 * Project Store — Firestore CRUD for projects, materials, and improvement tasks.
 *
 * Data model:
 *   projects/{projectId}
 *   projects/{projectId}/sessions/{sessionId}
 *   projects/{projectId}/materials/{materialId}
 *   projects/{projectId}/tasks/{taskId}
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectStore = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const genai_1 = require("@google/genai");
const crypto_1 = require("crypto");
// Re-use the Firebase Admin instance initialized in session-store.ts
const db = firebase_admin_1.default.firestore();
const PROJECTS_COLLECTION = 'projects';
// ── Project Store ───────────────────────────────────────────────────────────────
exports.projectStore = {
    // ── Project CRUD ────────────────────────────────────────────────────────────
    async create(title, description = '') {
        const projectId = (0, crypto_1.randomUUID)();
        const now = Date.now();
        const project = {
            projectId,
            title,
            description,
            createdAt: now,
            updatedAt: now,
            sessionCount: 0,
            latestScore: null,
            bestScore: null,
        };
        await db.collection(PROJECTS_COLLECTION).doc(projectId).set(project);
        console.log(`Project created: ${projectId} — "${title}"`);
        return project;
    },
    async get(projectId) {
        const doc = await db.collection(PROJECTS_COLLECTION).doc(projectId).get();
        if (!doc.exists)
            return null;
        return doc.data();
    },
    async list() {
        const snapshot = await db.collection(PROJECTS_COLLECTION)
            .orderBy('updatedAt', 'desc')
            .get();
        return snapshot.docs.map(doc => doc.data());
    },
    async update(projectId, updates) {
        await db.collection(PROJECTS_COLLECTION).doc(projectId).update({
            ...updates,
            updatedAt: Date.now(),
        });
    },
    async delete(projectId) {
        // Delete subcollections first
        const subcollections = ['sessions', 'materials', 'tasks'];
        for (const sub of subcollections) {
            const snap = await db.collection(PROJECTS_COLLECTION).doc(projectId).collection(sub).get();
            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            if (snap.docs.length > 0)
                await batch.commit();
        }
        await db.collection(PROJECTS_COLLECTION).doc(projectId).delete();
        console.log(`Project deleted: ${projectId}`);
    },
    // ── Sessions (scoped to project) ────────────────────────────────────────────
    async saveSession(projectId, summary, report) {
        const data = {
            ...summary,
            projectId,
            report,
            savedAt: Date.now(),
        };
        await db.collection(PROJECTS_COLLECTION).doc(projectId)
            .collection('sessions').doc(summary.sessionId).set(data);
        // Update project denormalized fields
        const overallScore = report?.overallScore ?? 0;
        const projectRef = db.collection(PROJECTS_COLLECTION).doc(projectId);
        const projectDoc = await projectRef.get();
        if (projectDoc.exists) {
            const project = projectDoc.data();
            await projectRef.update({
                sessionCount: (project.sessionCount || 0) + 1,
                latestScore: overallScore,
                bestScore: Math.max(project.bestScore ?? 0, overallScore),
                updatedAt: Date.now(),
            });
        }
        console.log(`Session saved to project ${projectId}: ${summary.sessionId}`);
    },
    async listSessions(projectId) {
        const snapshot = await db.collection(PROJECTS_COLLECTION).doc(projectId)
            .collection('sessions')
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
    async getSession(projectId, sessionId) {
        const doc = await db.collection(PROJECTS_COLLECTION).doc(projectId)
            .collection('sessions').doc(sessionId).get();
        if (!doc.exists)
            return null;
        return doc.data();
    },
    async deleteSession(projectId, sessionId) {
        await db.collection(PROJECTS_COLLECTION).doc(projectId)
            .collection('sessions').doc(sessionId).delete();
        // Decrement session count
        const projectRef = db.collection(PROJECTS_COLLECTION).doc(projectId);
        const projectDoc = await projectRef.get();
        if (projectDoc.exists) {
            const project = projectDoc.data();
            await projectRef.update({
                sessionCount: Math.max(0, (project.sessionCount || 1) - 1),
                updatedAt: Date.now(),
            });
        }
        console.log(`Session deleted from project ${projectId}: ${sessionId}`);
    },
    // ── Materials ───────────────────────────────────────────────────────────────
    async addMaterial(projectId, filename, mimeType, fileBuffer) {
        const materialId = (0, crypto_1.randomUUID)();
        // Extract text from the uploaded file using Gemini Flash
        let extractedText = '';
        try {
            extractedText = await extractTextFromFile(fileBuffer, mimeType, filename);
        }
        catch (err) {
            console.error(`[ProjectStore] Failed to extract text from ${filename}:`, err);
            extractedText = `[Text extraction failed for ${filename}]`;
        }
        const material = {
            materialId,
            filename,
            mimeType,
            extractedText,
            uploadedAt: Date.now(),
            sizeBytes: fileBuffer.length,
        };
        await db.collection(PROJECTS_COLLECTION).doc(projectId)
            .collection('materials').doc(materialId).set(material);
        await db.collection(PROJECTS_COLLECTION).doc(projectId).update({ updatedAt: Date.now() });
        console.log(`Material added to project ${projectId}: ${filename} (${materialId})`);
        return material;
    },
    async listMaterials(projectId) {
        const snapshot = await db.collection(PROJECTS_COLLECTION).doc(projectId)
            .collection('materials')
            .orderBy('uploadedAt', 'desc')
            .get();
        return snapshot.docs.map(doc => doc.data());
    },
    async deleteMaterial(projectId, materialId) {
        await db.collection(PROJECTS_COLLECTION).doc(projectId)
            .collection('materials').doc(materialId).delete();
        await db.collection(PROJECTS_COLLECTION).doc(projectId).update({ updatedAt: Date.now() });
        console.log(`Material deleted from project ${projectId}: ${materialId}`);
    },
    /** Get all extracted text from project materials (for Content Agent context). */
    async getMaterialsContext(projectId) {
        const materials = await this.listMaterials(projectId);
        if (materials.length === 0)
            return '';
        return materials
            .map(m => `--- ${m.filename} ---\n${m.extractedText}`)
            .join('\n\n');
    },
    // ── Improvement Tasks ───────────────────────────────────────────────────────
    async addTasks(projectId, sessionId, improvements, category = 'content') {
        const tasks = [];
        const batch = db.batch();
        for (const description of improvements) {
            const taskId = (0, crypto_1.randomUUID)();
            const task = {
                taskId,
                description,
                category,
                status: 'open',
                sourceSessionId: sessionId,
                createdAt: Date.now(),
                resolvedAt: null,
            };
            batch.set(db.collection(PROJECTS_COLLECTION).doc(projectId).collection('tasks').doc(taskId), task);
            tasks.push(task);
        }
        if (tasks.length > 0)
            await batch.commit();
        console.log(`${tasks.length} improvement tasks added to project ${projectId}`);
        return tasks;
    },
    async listTasks(projectId, status) {
        let query = db.collection(PROJECTS_COLLECTION).doc(projectId)
            .collection('tasks');
        if (status) {
            query = query.where('status', '==', status);
        }
        const snapshot = await query.get();
        const tasks = snapshot.docs.map(doc => doc.data());
        // Sort in memory to avoid requiring a composite index
        return tasks.sort((a, b) => b.createdAt - a.createdAt);
    },
    async updateTask(projectId, taskId, status) {
        const update = { status };
        if (status === 'improved' || status === 'dismissed') {
            update.resolvedAt = Date.now();
        }
        await db.collection(PROJECTS_COLLECTION).doc(projectId)
            .collection('tasks').doc(taskId).update(update);
    },
    /** Get open tasks as a context string for the orchestrator. */
    async getOpenTasksContext(projectId) {
        const tasks = await this.listTasks(projectId, 'open');
        if (tasks.length === 0)
            return '';
        return 'FOCUS AREAS (from previous sessions):\n' +
            tasks.map((t) => `ID ${t.taskId}: [${t.category}] ${t.description}`).join('\n');
    },
    async getOpenTasks(projectId) {
        return this.listTasks(projectId, 'open');
    }
};
// ── Text Extraction ─────────────────────────────────────────────────────────────
/**
 * Extract text from an uploaded file using Gemini Flash's multimodal capability.
 * Handles PDFs, images, and plain text files.
 */
async function extractTextFromFile(fileBuffer, mimeType, filename) {
    // Plain text files — just return the content
    if (mimeType.startsWith('text/')) {
        return fileBuffer.toString('utf-8');
    }
    // For PDFs, images, etc. — use Gemini's multimodal input
    const ai = new genai_1.GoogleGenAI({
        apiKey: process.env.GOOGLE_GENAI_API_KEY,
        httpOptions: { apiVersion: 'v1beta' }
    });
    const base64Data = fileBuffer.toString('base64');
    const response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: [
            {
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            mimeType,
                            data: base64Data,
                        },
                    },
                    {
                        text: `Extract ALL text content from this file (${filename}). 
If it's a presentation, include slide numbers and all text from each slide. 
If it's a document, extract the full text preserving structure.
Return ONLY the extracted text, no commentary.`,
                    },
                ],
            },
        ],
    });
    return response.text?.trim() || `[No text could be extracted from ${filename}]`;
}
