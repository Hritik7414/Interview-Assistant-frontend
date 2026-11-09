# Cue frontend

The Cue dashboard captures microphone or browser-tab audio, streams it to the
backend, and displays the live transcript, detected questions, streamed answer
suggestions, and latency diagnostics.

## Requirements

- Node.js 22.12 or newer
- npm
- The Cue backend running locally or at a configured URL

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Open <http://localhost:3000>. The default backend URL is
`http://localhost:4000`. Set `PUBLIC_SERVER_URL` in `.env` if the backend is at
a different address. The frontend does not require provider API keys.

## Checks

```bash
npm run typecheck
npm run lint
npm run check:architecture
npm test
```

Run the browser suite with `npm run test:e2e`. It needs the backend project with
dependencies installed alongside this repository. Set `E2E_BACKEND_DIR` if the
backend is elsewhere. Playwright uses ports 3100 and 4100.

## Structure

- `src/app/` contains the Next.js routes and global styles.
- `src/mvc/models/`, `controllers/`, and `views/` contain UI state rules,
  orchestration, and dashboard panels.
- `src/services/` contains browser audio capture, REST, and WebSocket clients.
- `src/shared/` contains the protocol schemas and audio-frame codec. The backend
  repository is the source of truth; sync changes from the full project root
  with `node scripts/sync-shared.mjs`.
- `tests/` contains unit, component, contract, and browser tests.

See the full project's architecture and protocol documents for design details.
