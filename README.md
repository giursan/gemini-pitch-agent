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

## Auth Setup (Firebase)
This app uses Firebase Auth (Google) and Firebase Admin for server-side verification.

1. **Create a Firebase project** and enable **Google** as a sign-in provider.
2. **Add a Web App** and copy the config values.
3. **Client env (\`client/.env.local\`)**:
   - \`NEXT_PUBLIC_FIREBASE_API_KEY=...\`
   - \`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...\`
   - \`NEXT_PUBLIC_FIREBASE_PROJECT_ID=...\`
   - \`NEXT_PUBLIC_FIREBASE_APP_ID=...\`
   - \`NEXT_PUBLIC_API_BASE_URL=http://localhost:8080\` (optional override)
   - \`NEXT_PUBLIC_WS_BASE_URL=ws://localhost:8080\` (optional override)
4. **Server env**:
   - \`FIREBASE_PROJECT_ID=...\` (optional, defaults to \`gemini-pitch-agent-c23da\`)
5. **Service account**:
   - Place \`service-account.json\` in the repo root (already expected by \`server/src/services/session-store.ts\`).
6. **Migrate existing projects (one-time)**:
   - \`cd server && MIGRATE_OWNER_EMAIL="you@example.com" npx ts-node scripts/migrate-project-owners.ts\`

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
*Note: Set \`NEXT_PUBLIC_API_BASE_URL\` and \`NEXT_PUBLIC_WS_BASE_URL\` in the client env to your deployed URLs (e.g., \`https://...\` and \`wss://...\`).*

## Proof of GCP Implementation (Hackathon Requirement)
To meet the hackathon requirements for GCP proof:
1. **Code Proof:** Check \`server/src/services/gemini-live-client.ts\` lines 1-40. We explicitly import \`@google-cloud/vertexai\` and establish an authenticated WebSocket to the Vertex AI \`BidiGenerateContent\` endpoint using application default credentials.
2. **Video Proof:** To verify deployment, deploy the server to Cloud Run using the command above. In the video, navigate to the GCP Console -> Cloud Logging and run the query:
   \`resource.type = "cloud_run_revision" AND resource.labels.service_name = "aura-mentor-backend"\`
   This will show the live WebSocket connections and Gemini API payloads streaming in real-time.
