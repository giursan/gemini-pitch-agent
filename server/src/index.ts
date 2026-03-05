import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { GeminiLiveSession } from './services/adk-live-session';
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

// ── WebSocket Handling ──────────────────────────────────────────────────────────

wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected to proxy WebSocket.');

    let liveSession: GeminiLiveSession | null = null;
    let isPaused = false;

    ws.on('message', async (rawMessage: Buffer) => {
        try {
            const data = JSON.parse(rawMessage.toString());

            switch (data.type) {
                // ── Session Lifecycle ─────────────────────────────────────
                case 'session_start': {
                    const sessionId = randomUUID();
                    const feedbackMode = data.feedbackMode || 'silent';
                    const enableSpeech = data.agents?.speech ?? true;

                    liveSession = new GeminiLiveSession(sessionId, (message) => {
                        if (ws.readyState === WebSocket.OPEN) {
                            try {
                                ws.send(JSON.stringify(message));
                            } catch (err) {
                                console.error('Error serializing message:', err);
                            }
                        }
                    }, feedbackMode, enableSpeech);

                    try {
                        await liveSession.connect();
                        isPaused = false;
                        // Confirm session started
                        ws.send(JSON.stringify({
                            type: 'session_started',
                            sessionId,
                            feedbackMode,
                        }));
                    } catch (err) {
                        console.error('Failed to start Gemini session:', err);
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Failed to connect to Gemini Live API',
                            detail: String(err),
                        }));
                        liveSession = null;
                    }
                    break;
                }

                case 'session_pause': {
                    isPaused = true;
                    ws.send(JSON.stringify({ type: 'session_paused' }));
                    break;
                }

                case 'session_resume': {
                    isPaused = false;
                    ws.send(JSON.stringify({ type: 'session_resumed' }));
                    break;
                }

                case 'session_end': {
                    if (!liveSession) break;

                    // Grab the summary before disconnecting
                    const summary = liveSession.getSessionSummary();
                    liveSession.disconnect();

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

                    liveSession = null;
                    isPaused = false;
                    break;
                }

                // ── Media Streams (only when recording) ──────────────────
                case 'audio': {
                    if (liveSession && !isPaused && data.data) {
                        liveSession.sendAudioChunk(data.data);
                    }
                    break;
                }

                case 'video': {
                    if (liveSession && !isPaused && data.data) {
                        liveSession.sendVideoFrame(data.data);
                    }
                    break;
                }

                case 'barge_in': {
                    if (liveSession && !isPaused) {
                        liveSession.endTurn();
                    }
                    break;
                }

                // ── Text Input ───────────────────────────────────────────────
                case 'chat_message': {
                    if (liveSession && !isPaused && data.text) {
                        liveSession.sendTextMessage(data.text);
                    }
                    break;
                }

                // ── CV Telemetry from client ─────────────────────────────
                case 'client_telemetry': {
                    if (liveSession && !isPaused && data.data) {
                        liveSession.logCvTelemetry(data.data);
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
        if (liveSession) {
            liveSession.disconnect();
            liveSession = null;
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
