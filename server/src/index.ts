import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { Orchestrator } from './services/orchestrator';
import { generateReport } from './services/report-generator';
import { sessionStore } from './services/session-store';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;

// ── REST Endpoints ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
    res.status(200).send('OK');
});

app.get('/sessions', async (_req, res) => {
    const sessions = await sessionStore.list();
    res.json(sessions);
});

app.get('/sessions/:id', async (req, res) => {
    const session = await sessionStore.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
});

app.delete('/sessions/:id', async (req, res) => {
    try {
        await sessionStore.delete(req.params.id);
        res.status(204).send();
    } catch (err) {
        console.error('Failed to delete session:', err);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

// ── WebSocket Handling ──────────────────────────────────────────────────────────

wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected to proxy WebSocket.');

    let orchestrator: Orchestrator | null = null;
    let isPaused = false;

    ws.on('message', async (rawMessage: Buffer) => {
        try {
            const data = JSON.parse(rawMessage.toString());

            switch (data.type) {
                // ── Session Lifecycle ─────────────────────────────────────
                case 'session_start': {
                    const sessionId = randomUUID();
                    const feedbackMode = data.feedbackMode || 'silent';
                    const agents = {
                        eyeContact: data.agents?.eyeContact ?? true,
                        posture: data.agents?.posture ?? true,
                        gestures: data.agents?.gestures ?? true,
                        speech: data.agents?.speech ?? true,
                    };

                    orchestrator = new Orchestrator({
                        sessionId,
                        feedbackMode,
                        agents,
                        ws,
                    });

                    try {
                        await orchestrator.start();
                        isPaused = false;
                        // Confirm session started
                        ws.send(JSON.stringify({
                            type: 'session_started',
                            sessionId,
                            feedbackMode,
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

                    // Grab the summary before stopping
                    const summary = orchestrator.getSessionSummary();
                    orchestrator.stop();

                    // Notify client we're generating the report
                    ws.send(JSON.stringify({ type: 'generating_report' }));

                    // Generate report via Gemini
                    const report = await generateReport(summary);

                    // Persist to Firestore
                    await sessionStore.save(summary, report);

                    // Send report to client
                    ws.send(JSON.stringify({
                        type: 'session_report',
                        sessionId: summary.sessionId,
                        report,
                    }));

                    orchestrator = null;
                    isPaused = false;
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
