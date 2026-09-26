# LiveTranslate

Live conference captions: a host's speech is transcribed and translated in
real time via [Soniox](https://soniox.com), and each listener independently
picks their own target language and gets live captions plus optional
text-to-speech readout.

## How it works

Soniox's real-time translation is configured per WebSocket connection, one
target language at a time. So:

- The host's browser captures mic audio as raw 16kHz mono PCM and streams it
  to our backend over a WebSocket.
- The backend holds the real `SONIOX_API_KEY` (never sent to the browser) and,
  for each distinct target language currently requested by any listener in a
  room, opens one Soniox real-time session, forwarding the host's audio into
  it.
- Each listener picks a language and receives translated captions relayed
  from the matching Soniox session over their own WebSocket.
- Sessions are opened lazily (first listener for a language) and closed when
  the last listener for that language leaves.

Text-to-speech uses only the browser's built-in `SpeechSynthesis` API — free,
no extra API calls, off by default, toggled per listener.

## Project layout

```
server/        Express + ws backend: room registry + Soniox relay
src/           Vite + TypeScript frontend (host + listener screens)
index.html     Single-page entry point
```

## Local development

```bash
npm install
cp .env.example .env   # fill in SONIOX_API_KEY
npm run dev:server     # terminal 1: backend on :3000
npm run dev:client     # terminal 2: Vite dev server with proxy to :3000
```

Open the Vite dev URL, click **Host a session**, allow mic access, then open
the shown join link in another tab/device and pick a language.

## Production build

```bash
npm run build   # builds the frontend into dist/
npm start        # serves dist/ + the WebSocket relay from one process
```

## Deploy (free)

This repo includes a `render.yaml` for a single free
[Render](https://render.com) Web Service that serves both the frontend and
the backend. Connect the repo on Render, set the `SONIOX_API_KEY` env var,
and deploy.

## Notes

- Each distinct target language active in a room costs one concurrent Soniox
  real-time stream; the curated 12-language picker caps this at 12 per room.
- Late joiners only see captions from the moment their language's session
  opens — there's no rewind of missed speech.
- No accounts/auth; rooms are ephemeral and identified only by their code.
