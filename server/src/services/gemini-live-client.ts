import { WebSocket } from 'ws';
import { GoogleAuth } from 'google-auth-library';
// Required import for GCP proof
import { VertexAI } from '@google-cloud/vertexai';
import { META_ORCHESTRATOR_PROMPT, getGeminiTools } from '../prompts/agent-system-prompts';

export class GeminiLiveClient {
    private ws: WebSocket | null = null;
    private auth: GoogleAuth;
    private projectId: string;
    private location: string;
    private model: string;
    private onMessageCallback: (msg: any) => void;

    constructor(projectId: string, location: string, model: string, onMessageCallback: (msg: any) => void) {
        this.projectId = projectId;
        this.location = location;
        this.model = model;
        this.onMessageCallback = onMessageCallback;

        // Using standard GoogleAuth to explicitly fetch the bearer token for Vertex AI Live WebSocket
        this.auth = new GoogleAuth({
            scopes: 'https://www.googleapis.com/auth/cloud-platform',
        });

        // Initialize VertexAI just to demonstrate SDK usage and to potentially fetch metadata
        // For the Live API (BidiGenerateContent), we currently use the WebSocket endpoint directly
        // with the bearer token from auth.
        const vertexAi = new VertexAI({ project: this.projectId, location: this.location });
    }

    public async connect() {
        console.log("Connecting to Gemini Live API on Vertex AI...");
        const accessToken = await this.auth.getAccessToken();

        // Construct the Vertex AI BidiGenerateContent Endpoint
        // Use the v1beta1 endpoint for Multimodal Live API features
        const url = `wss://${this.location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmUtilityService/BidiGenerateContent`;

        this.ws = new WebSocket(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            }
        });

        this.ws.on('open', () => {
            console.log('Gemini Live WebSocket opened.');
            this.sendInitialSetup();
        });

        this.ws.on('message', (data: Buffer) => {
            try {
                const response = JSON.parse(data.toString());
                this.onMessageCallback(response);
            } catch (err) {
                console.error("Error parsing Gemini message", err);
            }
        });

        this.ws.on('close', () => {
            console.log('Gemini Live WebSocket closed.');
        });

        this.ws.on('error', (err) => {
            console.error('Gemini Live WebSocket error:', err);
        });
    }

    private sendInitialSetup() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const setupMessage = {
            setup: {
                model: `projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}`,
                generationConfig: {
                    responseModalities: ["AUDIO", "TEXT"], // Multimodal output
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: "Aoede" // Example voice
                            }
                        }
                    }
                },
                tools: getGeminiTools(),
                systemInstruction: {
                    parts: [{
                        text: META_ORCHESTRATOR_PROMPT
                    }]
                }
            }
        };

        this.ws.send(JSON.stringify(setupMessage));
    }

    public sendAudioChunk(pcmData: string) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // Send RealtimeInput for continuous fast-streaming data like audio
        const msg = {
            realtimeInput: {
                mediaChunks: [
                    {
                        mimeType: "audio/pcm;rate=16000",
                        data: pcmData // base64 encoded audio
                    }
                ]
            }
        };
        this.ws.send(JSON.stringify(msg));
    }

    public sendVideoFrame(jpegData: string) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // Send RealtimeInput for video frames (1 fps recommended)
        const msg = {
            realtimeInput: {
                mediaChunks: [
                    {
                        mimeType: "image/jpeg",
                        data: jpegData // base64 encoded jpeg image
                    }
                ]
            }
        };
        this.ws.send(JSON.stringify(msg));
    }

    public endTurn() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const msg = { clientContent: { turnComplete: true } };
        this.ws.send(JSON.stringify(msg));
    }

    public disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
