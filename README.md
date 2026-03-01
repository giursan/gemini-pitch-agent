# Aura Presentation Mentor (Gemini Live Hackathon)

This repository contains the source code for the Aura Presentation Mentor, a real-time multimodal AI agent that helps users practice presentations using the Gemini Live API over WebSockets.

## Architecture
- **Client:** Next.js application that captures WebRTC audio and video (1 FPS) and renders real-time telemetry from the AI.
- **Server:** Node.js WebSocket proxy that communicates with Vertex AI's Gemini Multimodal Live API (`BidiGenerateContent`).
- **AI Core:** Gemini 1.5 Flash (Live capabilities) acting as the Meta-Orchestrator, providing continuous verbal feedback and structured JSON tool calls to control the client UI.

## Local Development
1. **Server:**
   \`\`\`bash
   cd server
   npm install
   export GOOGLE_CLOUD_PROJECT="your-project-id"
   export GOOGLE_CLOUD_LOCATION="us-central1"
   npm run dev
   \`\`\`
   *(Ensure you have run \`gcloud auth application-default login\`)*

2. **Client:**
   \`\`\`bash
   cd client
   npm install
   npm run dev
   \`\`\`

## Google Cloud Deployment (Cloud Run)
To deploy the backend to Google Cloud Run:
\`\`\`bash
cd server
gcloud run deploy aura-mentor-backend \
  --source . \
  --region=us-central1 \
  --allow-unauthenticated \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=your-project-id"
\`\`\`
*Note: Update the \`ws://localhost:8080\` in \`client/src/app/page.tsx\` to your deployed Cloud Run WebSocket URL (e.g., \`wss://aura-mentor-backend-[hash]-uc.a.run.app\`).*

## Proof of GCP Implementation (Hackathon Requirement)
To meet the hackathon requirements for GCP proof:
1. **Code Proof:** Check \`server/src/services/gemini-live-client.ts\` lines 1-40. We explicitly import \`@google-cloud/vertexai\` and establish an authenticated WebSocket to the Vertex AI \`BidiGenerateContent\` endpoint using application default credentials.
2. **Video Proof:** To verify deployment, deploy the server to Cloud Run using the command above. In the video, navigate to the GCP Console -> Cloud Logging and run the query:
   \`resource.type = "cloud_run_revision" AND resource.labels.service_name = "aura-mentor-backend"\`
   This will show the live WebSocket connections and Gemini API payloads streaming in real-time.