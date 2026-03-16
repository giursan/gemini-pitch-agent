import express from 'express';
import admin from 'firebase-admin';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { Orchestrator } from './services/orchestrator';
import { generateReport } from './services/report-generator';
import { sessionStore } from './services/session-store';
import { projectStore } from './services/project-store';
import { streamProjectCoachResponse } from './services/project-coach';
import { requireAuth, type AuthedRequest } from './middleware/auth';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;

const handleNotFound = (err: unknown, res: express.Response, message: string) => {
    if (err instanceof Error && err.message === 'not_found') {
        res.status(404).json({ error: message });
        return true;
    }
    return false;
};

// ── REST Endpoints ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
    res.status(200).send('OK');
});

// ── Legacy Session Endpoints (backward compat) ──────────────────────────────────

app.get('/sessions', async (req: AuthedRequest, res) => {
    const sessions = await sessionStore.list(req.user!.uid);
    res.json(sessions);
});

app.get('/sessions/:id', async (req: AuthedRequest, res) => {
    const sessionId = String(req.params.id);
    const session = await sessionStore.get(req.user!.uid, sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
});

app.delete('/sessions/:id', async (req: AuthedRequest, res) => {
    try {
        const sessionId = String(req.params.id);
        await sessionStore.delete(req.user!.uid, sessionId);
        res.status(204).send();
    } catch (err) {
        console.error('Failed to delete session:', err);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

// ── Project Endpoints ───────────────────────────────────────────────────────────

app.get('/projects', async (req: AuthedRequest, res) => {
    try {
        const projects = await projectStore.list(req.user!.uid);
        res.json(projects);
    } catch (err) {
        console.error('Failed to list projects:', err);
        res.status(500).json({ error: 'Failed to list projects' });
    }
});

app.post('/projects', async (req: AuthedRequest, res) => {
    try {
        const { title, description } = req.body;
        if (!title || typeof title !== 'string') {
            return res.status(400).json({ error: 'Title is required' });
        }
        const project = await projectStore.create(req.user!.uid, title.trim(), (description || '').trim());
        res.status(201).json(project);
    } catch (err) {
        console.error('Failed to create project:', err);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

app.get('/projects/:id', async (req: AuthedRequest, res) => {
    try {
        const project = await projectStore.get(req.params.id as string, req.user!.uid);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        res.json(project);
    } catch (err) {
        console.error('Failed to get project:', err);
        res.status(500).json({ error: 'Failed to get project' });
    }
});

app.put('/projects/:id', async (req: AuthedRequest, res) => {
    try {
        const { title, description } = req.body;
        await projectStore.update(req.params.id as string, req.user!.uid, {
            ...(title !== undefined && { title: title.trim() }),
            ...(description !== undefined && { description: description.trim() }),
        });
        res.json({ success: true });
    } catch (err) {
        if (handleNotFound(err, res, 'Project not found')) return;
        console.error('Failed to update project:', err);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

app.delete('/projects/:id', async (req: AuthedRequest, res) => {
    try {
        await projectStore.delete(req.params.id as string, req.user!.uid);
        res.status(204).send();
    } catch (err) {
        if (handleNotFound(err, res, 'Project not found')) return;
        console.error('Failed to delete project:', err);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

app.post('/projects/:id/chat', async (req: AuthedRequest, res) => {
    try {
        const { message, history } = req.body;
        const projectId = String(req.params.id);

        if (!message) return res.status(400).json({ error: 'Message is required' });
        const project = await projectStore.get(projectId, req.user!.uid);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        // Set headers for streaming
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        await streamProjectCoachResponse(
            projectId,
            req.user!.uid,
            message,
            history || [],
            (chunk) => {
                res.write(chunk);
            }
        );

        res.end();
    } catch (err) {
        console.error('Project chat error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate chat response' });
        } else {
            res.end();
        }
    }
});

// ── Project Sessions ────────────────────────────────────────────────────────────

app.get('/projects/:id/sessions', async (req: AuthedRequest, res) => {
    try {
        const sessions = await projectStore.listSessions(req.params.id as string, req.user!.uid);
        res.json(sessions);
    } catch (err) {
        if (handleNotFound(err, res, 'Project not found')) return;
        console.error('Failed to list project sessions:', err);
        res.status(500).json({ error: 'Failed to list sessions' });
    }
});

app.get('/projects/:id/sessions/:sessionId', async (req: AuthedRequest, res) => {
    try {
        const session = await projectStore.getSession(req.params.id as string, req.user!.uid, req.params.sessionId as string);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        res.json(session);
    } catch (err) {
        if (handleNotFound(err, res, 'Project not found')) return;
        console.error('Failed to get session:', err);
        res.status(500).json({ error: 'Failed to get session' });
    }
});

app.delete('/projects/:id/sessions/:sessionId', async (req: AuthedRequest, res) => {
    try {
        await projectStore.deleteSession(req.params.id as string, req.user!.uid, req.params.sessionId as string);
        res.status(204).send();
    } catch (err) {
        if (handleNotFound(err, res, 'Project not found')) return;
        console.error('Failed to delete session:', err);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

// ── Project Materials ───────────────────────────────────────────────────────────

app.get('/projects/:id/materials', async (req: AuthedRequest, res) => {
    try {
        const materials = await projectStore.listMaterials(req.params.id as string, req.user!.uid);
        res.json(materials);
    } catch (err) {
        if (handleNotFound(err, res, 'Project not found')) return;
        console.error('Failed to list materials:', err);
        res.status(500).json({ error: 'Failed to list materials' });
    }
});

app.post('/projects/:id/materials', upload.single('file'), async (req: AuthedRequest, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'No file uploaded' });

        const material = await projectStore.addMaterial(
            req.params.id as string,
            req.user!.uid,
            String(file.originalname),
            file.mimetype,
            file.buffer,
        );
        res.status(201).json(material);
    } catch (err) {
        if (handleNotFound(err, res, 'Project not found')) return;
        console.error('Failed to upload material:', err);
        res.status(500).json({ error: 'Failed to upload material' });
    }
});

app.delete('/projects/:id/materials/:materialId', async (req: AuthedRequest, res) => {
    try {
        await projectStore.deleteMaterial(req.params.id as string, req.user!.uid, req.params.materialId as string);
        res.status(204).send();
    } catch (err) {
        if (handleNotFound(err, res, 'Project not found')) return;
        console.error('Failed to delete material:', err);
        res.status(500).json({ error: 'Failed to delete material' });
    }
});

// ── Project Tasks ───────────────────────────────────────────────────────────────

app.get('/projects/:id/tasks', async (req: AuthedRequest, res) => {
    try {
        const rawStatus = req.query.status;
        const status = typeof rawStatus === 'string' ? rawStatus : undefined;
        const tasks = await projectStore.listTasks(
            req.params.id as string,
            req.user!.uid,
            status as 'open' | 'improved' | 'dismissed' | undefined,
        );
        res.json(tasks);
    } catch (err) {
        if (handleNotFound(err, res, 'Project not found')) return;
        console.error('Failed to list tasks:', err);
        res.status(500).json({ error: 'Failed to list tasks' });
    }
});

app.put('/projects/:id/tasks/:taskId', async (req: AuthedRequest, res) => {
    try {
        const { status } = req.body;
        if (!['open', 'improved', 'dismissed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        await projectStore.updateTask(req.params.id as string, req.user!.uid, req.params.taskId as string, status);
        res.json({ success: true });
    } catch (err) {
        if (handleNotFound(err, res, 'Project not found')) return;
        console.error('Failed to update task:', err);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// ── WebSocket Handling ──────────────────────────────────────────────────────────

wss.on('connection', (ws: WebSocket, req) => {
    console.log('Client connected to proxy WebSocket.');

    let orchestrator: Orchestrator | null = null;
    let isPaused = false;
    let currentProjectId: string | null = null;

    const authPromise = (async () => {
        try {
            const baseUrl = `http://${req.headers.host || 'localhost'}`;
            const url = new URL(req.url || '', baseUrl);
            const token = url.searchParams.get('token');
            if (!token) {
                ws.close(1008, 'Missing auth token');
                return null;
            }
            const decoded = await admin.auth().verifyIdToken(token);
            return { uid: decoded.uid, email: decoded.email };
        } catch (err) {
            ws.close(1008, 'Invalid auth token');
            return null;
        }
    })();

    ws.on('message', async (rawMessage: Buffer) => {
        try {
            const auth = await authPromise;
            if (!auth) return;

            const data = JSON.parse(rawMessage.toString());

            switch (data.type) {
                // ── Session Lifecycle ─────────────────────────────────────
                case 'session_start': {
                    const sessionId = randomUUID();
                    const feedbackMode = data.feedbackMode || 'silent';
                    const persona = data.persona || 'mentor';
                    const projectId = data.projectId || null;
                    currentProjectId = projectId;
                    const agents = {
                        eyeContact: data.agents?.eyeContact ?? true,
                        posture: data.agents?.posture ?? true,
                        gestures: data.agents?.gestures ?? true,
                        speech: data.agents?.speech ?? true,
                        pacing: data.agents?.pacing ?? true,
                        fillerWords: data.agents?.fillerWords ?? true,
                        content: data.agents?.content ?? true,
                        congruity: data.agents?.congruity ?? true,
                        timeManagement: data.agents?.timeManagement ?? true,
                        expectedTimeMin: data.agents?.expectedTimeMin ?? 10,
                    };

                    // Load project context if scoped to a project
                    let materialsContext = '';
                    let tasksContext = '';
                    if (projectId) {
                        try {
                            const project = await projectStore.get(projectId, auth.uid);
                            if (!project) {
                                ws.send(JSON.stringify({ type: 'error', message: 'Project not found or access denied.' }));
                                currentProjectId = null;
                                return;
                            }
                            materialsContext = await projectStore.getMaterialsContext(projectId, auth.uid);
                            tasksContext = await projectStore.getOpenTasksContext(projectId, auth.uid);
                        } catch (err) {
                            console.error('Failed to load project context:', err);
                        }
                    }

                    orchestrator = new Orchestrator({
                        sessionId,
                        feedbackMode,
                        persona,
                        agents,
                        ws,
                        projectId,
                        materialsContext,
                        tasksContext,
                    });

                    try {
                        await orchestrator.start();
                        isPaused = false;
                        // Confirm session started
                        ws.send(JSON.stringify({
                            type: 'session_started',
                            sessionId,
                            feedbackMode,
                            projectId,
                        }));
                    } catch (err) {
                        console.error('Failed to start orchestrator:', err);
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Failed to connect to Gemini Live API',
                            detail: String(err),
                        }));
                        orchestrator = null;
                    }
                    break;
                }

                case 'session_pause': {
                    isPaused = true;
                    orchestrator?.pause();
                    ws.send(JSON.stringify({ type: 'session_paused' }));
                    break;
                }

                case 'session_resume': {
                    isPaused = false;
                    orchestrator?.resume();
                    ws.send(JSON.stringify({ type: 'session_resumed' }));
                    break;
                }



                case 'session_end': {
                    if (!orchestrator) break;

                    // Allow updating project ID at the very end (e.g. from quick session)
                    if (data.projectId) {
                        const project = await projectStore.get(data.projectId, auth.uid);
                        if (!project) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Project not found or access denied.' }));
                            currentProjectId = null;
                        } else {
                            currentProjectId = data.projectId;
                            orchestrator.updateConfig({ projectId: data.projectId });
                        }
                    }

                    // Grab the summary before stopping
                    const summary = orchestrator.getSessionSummary();
                    orchestrator.stop();

                    // Notify client we're generating the report
                    ws.send(JSON.stringify({ type: 'generating_report' }));

                    // Generate report via Gemini
                    const report = await generateReport(summary);

                    // Persist to Firestore (project-scoped or legacy)
                    if (currentProjectId) {
                        await projectStore.saveSession(currentProjectId, auth.uid, summary, report);

                        // Process tasks derived by AI
                        if (Array.isArray(report.newTasks)) {
                            // Group new tasks by category for efficient saving
                            const tasksByCategory = report.newTasks.reduce((acc: any, t: any) => {
                                acc[t.category] = acc[t.category] || [];
                                acc[t.category].push(t.description);
                                return acc;
                            }, {});

                            for (const [cat, items] of Object.entries(tasksByCategory)) {
                                await projectStore.addTasks(currentProjectId, auth.uid, summary.sessionId, items as string[], cat as any);
                            }
                        }

                        // Mark resolved tasks as improved
                        if (Array.isArray(report.resolvedTaskIds)) {
                            for (const taskId of report.resolvedTaskIds) {
                                try {
                                    if (taskId && taskId.length > 5) { // Basic sanity check for UUIDs
                                        await projectStore.updateTask(currentProjectId, auth.uid, taskId, 'improved');
                                    }
                                } catch (e) {
                                    console.warn(`[index] Could not resolve task ${taskId}:`, e);
                                }
                            }
                        }
                    } else {
                        await sessionStore.save(auth.uid, summary, report);
                    }

                    // Send report to client
                    ws.send(JSON.stringify({
                        type: 'session_report',
                        sessionId: summary.sessionId,
                        projectId: currentProjectId,
                        report,
                    }));

                    orchestrator = null;
                    isPaused = false;
                    currentProjectId = null;
                    break;
                }

                // ── Media Streams (only when recording) ──────────────────
                case 'audio': {
                    if (orchestrator && !isPaused && data.data) {
                        orchestrator.handleAudio(data.data);
                    }
                    break;
                }

                case 'video': {
                    // Video frames no longer sent to Gemini — 
                    // visual analysis handled by client-side CV + CvEvaluator
                    break;
                }

                case 'barge_in': {
                    if (orchestrator && !isPaused) {
                        orchestrator.handleBargeIn();
                    }
                    break;
                }

                // ── Text Input ───────────────────────────────────────────────
                case 'chat_message': {
                    if (orchestrator && !isPaused && data.text) {
                        orchestrator.handleChatMessage(data.text);
                    }
                    break;
                }

                // ── CV Telemetry from client ─────────────────────────────
                case 'client_telemetry': {
                    if (orchestrator && !isPaused && data.data) {
                        orchestrator.handleCvTelemetry(data.data);
                    }
                    break;
                }
            }
        } catch (e) {
            console.error('Error handling WS message:', e);
        }
    });

    ws.on('close', () => {
        console.log('Frontend client disconnected.');
        if (orchestrator) {
            orchestrator.stop();
            orchestrator = null;
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
