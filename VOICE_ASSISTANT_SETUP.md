# Hindi voice assistant setup

The site uses OpenAI's Realtime API over WebRTC for live speech-to-speech conversations. The browser sends its WebRTC offer to the site's Express endpoint; the server adds the permanent API key and exchanges it with OpenAI. The key is never sent to the browser.

## Run locally

1. Install Node.js 20.19+ or 22.12+.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and set `OPENAI_API_KEY` to an API key from your OpenAI Platform project. Keep `.env` private; it is gitignored.
4. Start the frontend and API server with `npm run dev`.
5. Open the Vite URL printed in the terminal, open the floating Hindi assistant, and allow microphone access when prompted. Localhost is treated as a secure context by modern browsers.

Optional server settings:

- `PORT` changes the Express API port (default `3001`).
- `OPENAI_REALTIME_MODEL` changes the Realtime model (default `gpt-realtime-2.1`).
- `OPENAI_REALTIME_VOICE` changes the spoken voice (default `marin`).

## Build and deploy

Run `npm run build` to create `dist/`, then `npm run preview` to preview the built site and API together. For deployment, set `NODE_ENV=production` and `OPENAI_API_KEY` in the platform's server environment, then run `npm start`. The Express server serves the built site and session endpoint from the same origin. Deploy behind HTTPS so browsers allow microphone access. Do not set the key as a `VITE_` variable or commit a real `.env` file.

The deployment needs outbound HTTPS access to `api.openai.com` and an OpenAI Platform project with Realtime API access and billing enabled. ChatGPT subscriptions do not provide API credits. Realtime usage is billed separately by the API account. Check current model availability and pricing in the OpenAI Platform before launch. The endpoint limits session creation to 10 requests per IP per minute; add your own user authentication and usage controls if this site is public.

## Manual checks

- Create or select an OpenAI Platform project, enable API billing, create a key, and add it to the server's environment.
- Ensure production is served over HTTPS and that the deployment runs the Express server (or ports `/api/realtime/session` to it).
- Test on a supported browser with a working microphone. A real conversation requires a valid API key, available Realtime model, API billing, microphone permission, and network access to OpenAI.
