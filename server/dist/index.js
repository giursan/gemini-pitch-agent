"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const ws_1 = require("ws");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const multer_1 = __importDefault(require("multer"));
const crypto_1 = require("crypto");
const orchestrator_1 = require("./services/orchestrator");
const report_generator_1 = require("./services/report-generator");
const session_store_1 = require("./services/session-store");
const project_store_1 = require("./services/project-store");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max
const server = http_1.default.createServer(app);
const wss = new ws_1.WebSocketServer({ server });
const PORT = process.env.PORT || 8080;
// ── REST Endpoints ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.status(200).send('OK');
});
// ── Legacy Session Endpoints (backward compat) ──────────────────────────────────
app.get('/sessions', async (_req, res) => {
    const sessions = await session_store_1.sessionStore.list();
    res.json(sessions);
});
app.get('/sessions/:id', async (req, res) => {
    const session = await session_store_1.sessionStore.get(req.params.id);
    if (!session)
        return res.status(404).json({ error: 'Session not found' });
    res.json(session);
});
app.delete('/sessions/:id', async (req, res) => {
    try {
        await session_store_1.sessionStore.delete(req.params.id);
        res.status(204).send();
    }
    catch (err) {
        console.error('Failed to delete session:', err);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});
// ── Project Endpoints ───────────────────────────────────────────────────────────
app.get('/projects', async (_req, res) => {
    try {
        const projects = await project_store_1.projectStore.list();
        res.json(projects);
    }
    catch (err) {
        console.error('Failed to list projects:', err);
        res.status(500).json({ error: 'Failed to list projects' });
    }
});
app.post('/projects', async (req, res) => {
    try {
        const { title, description } = req.body;
        if (!title || typeof title !== 'string') {
            return res.status(400).json({ error: 'Title is required' });
        }
        const project = await project_store_1.projectStore.create(title.trim(), (description || '').trim());
        res.status(201).json(project);
    }
    catch (err) {
        console.error('Failed to create project:', err);
        res.status(500).json({ error: 'Failed to create project' });
    }
});
app.get('/projects/:id', async (req, res) => {
    try {
        const project = await project_store_1.projectStore.get(req.params.id);
        if (!project)
            return res.status(404).json({ error: 'Project not found' });
        res.json(project);
    }
    catch (err) {
        console.error('Failed to get project:', err);
        res.status(500).json({ error: 'Failed to get project' });
    }
});
app.put('/projects/:id', async (req, res) => {
    try {
        const { title, description } = req.body;
        await project_store_1.projectStore.update(req.params.id, {
            ...(title !== undefined && { title: title.trim() }),
            ...(description !== undefined && { description: description.trim() }),
        });
        res.json({ success: true });
    }
    catch (err) {
        console.error('Failed to update project:', err);
        res.status(500).json({ error: 'Failed to update project' });
    }
});
app.delete('/projects/:id', async (req, res) => {
    try {
        await project_store_1.projectStore.delete(req.params.id);
        res.status(204).send();
    }
    catch (err) {
        console.error('Failed to delete project:', err);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});
// ── Project Sessions ────────────────────────────────────────────────────────────
app.get('/projects/:id/sessions', async (req, res) => {
    try {
        const sessions = await project_store_1.projectStore.listSessions(req.params.id);
        res.json(sessions);
    }
    catch (err) {
        console.error('Failed to list project sessions:', err);
        res.status(500).json({ error: 'Failed to list sessions' });
    }
});
app.get('/projects/:id/sessions/:sessionId', async (req, res) => {
    try {
        const session = await project_store_1.projectStore.getSession(req.params.id, req.params.sessionId);
        if (!session)
            return res.status(404).json({ error: 'Session not found' });
        res.json(session);
    }
    catch (err) {
        console.error('Failed to get session:', err);
        res.status(500).json({ error: 'Failed to get session' });
    }
});
app.delete('/projects/:id/sessions/:sessionId', async (req, res) => {
    try {
        await project_store_1.projectStore.deleteSession(req.params.id, req.params.sessionId);
        res.status(204).send();
    }
    catch (err) {
        console.error('Failed to delete session:', err);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});
// ── Project Materials ───────────────────────────────────────────────────────────
app.get('/projects/:id/materials', async (req, res) => {
    try {
        const materials = await project_store_1.projectStore.listMaterials(req.params.id);
        res.json(materials);
    }
    catch (err) {
        console.error('Failed to list materials:', err);
        res.status(500).json({ error: 'Failed to list materials' });
    }
});
app.post('/projects/:id/materials', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        if (!file)
            return res.status(400).json({ error: 'No file uploaded' });
        const material = await project_store_1.projectStore.addMaterial(req.params.id, String(file.originalname), file.mimetype, file.buffer);
        res.status(201).json(material);
    }
    catch (err) {
        console.error('Failed to upload material:', err);
        res.status(500).json({ error: 'Failed to upload material' });
    }
});
app.delete('/projects/:id/materials/:materialId', async (req, res) => {
    try {
        await project_store_1.projectStore.deleteMaterial(req.params.id, req.params.materialId);
        res.status(204).send();
    }
    catch (err) {
        console.error('Failed to delete material:', err);
        res.status(500).json({ error: 'Failed to delete material' });
    }
});
// ── Project Tasks ───────────────────────────────────────────────────────────────
app.get('/projects/:id/tasks', async (req, res) => {
    try {
        const rawStatus = req.query.status;
        const status = typeof rawStatus === 'string' ? rawStatus : undefined;
        const tasks = await project_store_1.projectStore.listTasks(req.params.id, status);
        res.json(tasks);
    }
    catch (err) {
        console.error('Failed to list tasks:', err);
        res.status(500).json({ error: 'Failed to list tasks' });
    }
});
app.put('/projects/:id/tasks/:taskId', async (req, res) => {
    try {
        const { status } = req.body;
        if (!['open', 'improved', 'dismissed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        await project_store_1.projectStore.updateTask(req.params.id, req.params.taskId, status);
        res.json({ success: true });
    }
    catch (err) {
        console.error('Failed to update task:', err);
        res.status(500).json({ error: 'Failed to update task' });
    }
});
// ── WebSocket Handling ──────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
    console.log('Client connected to proxy WebSocket.');
    let orchestrator = null;
    let isPaused = false;
    let currentProjectId = null;
    ws.on('message', async (rawMessage) => {
        try {
            const data = JSON.parse(rawMessage.toString());
            switch (data.type) {
                // ── Session Lifecycle ─────────────────────────────────────
                case 'session_start': {
                    const sessionId = (0, crypto_1.randomUUID)();
                    const feedbackMode = data.feedbackMode || 'silent';
                    const projectId = data.projectId || null;
                    currentProjectId = projectId;
                    const agents = {
                        eyeContact: data.agents?.eyeContact ?? true,
                        posture: data.agents?.posture ?? true,
                        gestures: data.agents?.gestures ?? true,
                        speech: data.agents?.speech ?? true,
                    };
                    // Load project context if scoped to a project
                    let materialsContext = '';
                    let tasksContext = '';
                    if (projectId) {
                        try {
                            materialsContext = await project_store_1.projectStore.getMaterialsContext(projectId);
                            tasksContext = await project_store_1.projectStore.getOpenTasksContext(projectId);
                        }
                        catch (err) {
                            console.error('Failed to load project context:', err);
                        }
                    }
                    orchestrator = new orchestrator_1.Orchestrator({
                        sessionId,
                        feedbackMode,
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
                    }
                    catch (err) {
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
                    if (!orchestrator)
                        break;
                    // Grab the summary before stopping
                    const summary = orchestrator.getSessionSummary();
                    orchestrator.stop();
                    // Notify client we're generating the report
                    ws.send(JSON.stringify({ type: 'generating_report' }));
                    // Generate report via Gemini
                    const report = await (0, report_generator_1.generateReport)(summary);
                    // Persist to Firestore (project-scoped or legacy)
                    if (currentProjectId) {
                        await project_store_1.projectStore.saveSession(currentProjectId, summary, report);
                        // Auto-generate improvement tasks from report
                        if (report.topImprovements && report.topImprovements.length > 0) {
                            await project_store_1.projectStore.addTasks(currentProjectId, summary.sessionId, report.topImprovements);
                        }
                    }
                    else {
                        await session_store_1.sessionStore.save(summary, report);
                    }
                    // Send report to client
                    ws.send(JSON.stringify({
                        type: 'session_report',
                        sessionId: summary.sessionId,
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
        }
        catch (e) {
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
