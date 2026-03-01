import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { GeminiLiveClient } from './services/gemini-live-client';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// For a real app, these come from environment variables or auth tokens
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'presentation-mentor-hack';
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const MODEL = 'gemini-1.5-flash-002-live-exp'; // Use the multimodal live experimental model

wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected to proxy WebSocket.');

    // Initialize Vertex AI Gemini Live Client for this session
    const geminiLiveClient = new GeminiLiveClient(PROJECT_ID, LOCATION, MODEL, (response) => {
        // Forward Gemini Live API responses back to the Next.js client
        // Response could contain audio buffers and structured JSON (e.g. function calls/tools)
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(response));
        }
    });

    // Connect to Vertex AI when the frontend connects to us
    geminiLiveClient.connect().catch(console.error);

    ws.on('message', (message: Buffer) => {
        try {
            const data = JSON.parse(message.toString());

            // Determine what type of multimodal data the frontend sent
            if (data.type === 'audio' && data.data) {
                geminiLiveClient.sendAudioChunk(data.data);
            } else if (data.type === 'video' && data.data) {
                geminiLiveClient.sendVideoFrame(data.data);
            } else if (data.type === 'barge_in') {
                // User started speaking over the agent
                geminiLiveClient.endTurn();
            }
        } catch (e) {
            console.error('Error handling frontend WS message:', e);
        }
    });

    ws.on('close', () => {
        console.log('Frontend client disconnected.');
        geminiLiveClient.disconnect();
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
