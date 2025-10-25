# Ollama React + Node Prototype

This project contains a React front-end and a Node.js backend that work together to collect prompts, audio recordings, and file attachments, send them to an Ollama-powered API, and display the generated response.

## Project structure

```
.
├── backend        # Express server that proxies requests to Ollama models
└── frontend       # Vite + React single-page application
```

## Requirements

- Node.js 18+
- An [Ollama](https://ollama.ai/) instance accessible from the backend
- The `whisper` model pulled into Ollama for transcription, and your preferred chat model (defaults to `llama3`).

## Backend setup

```bash
cd backend
npm install
npm run start
```

Environment variables can be stored in a `.env` file in `backend/`:

- `PORT` &mdash; HTTP port for the API (defaults to `3001`).
- `OLLAMA_MODEL` &mdash; Name of the Ollama model used for chat responses (defaults to `llama3`).

The server exposes `POST /api/process` which accepts multipart form data with:

- `prompt` &mdash; text prompt.
- `audio` &mdash; audio recording (`webm` by default) which will be transcribed via the `whisper` model.
- `files` &mdash; up to five attachments that will also be processed through Whisper (treating them as audio inputs).

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

The development server runs on <http://localhost:5173>. API requests to `/api/*` are proxied to the backend running on `http://localhost:3001`.

## Usage

1. Start the backend server.
2. Start the frontend dev server.
3. Open the frontend in your browser, type a prompt, optionally record audio and attach files.
4. Click **Send to Assistant** to submit the request and view the response from the Node.js API.

> **Note:** The transcription flow relies on the Ollama `whisper` model. Ensure the backend environment has access to the model and that it supports the provided file formats.
