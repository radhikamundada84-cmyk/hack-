import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const productionPreview = process.argv.includes('--production-preview');
dotenv.config({
  path: path.join(root, '.env'),
  override: process.env.NODE_ENV !== 'production' || productionPreview,
});

const app = express();
const port = Number(process.env.PORT) || 3001;
const sessionConfig = {
  type: 'realtime',
  model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
  instructions: [
    'You are Tourist Niketan, a warm, concise Maharashtra travel guide.',
    'Speak naturally in Hindi by default and comfortably understand Hindi, English, and Hinglish. Reply in the language and script the user prefers; Hindi replies should be spoken in natural Hindi.',
    'Help with Maharashtra destinations, culture, itineraries, and practical trip planning. Do not invent live prices, transport schedules, opening hours, or safety conditions. Clearly say when details need checking with an official or local source.',
  ].join(' '),
  audio: {
    input: {
      transcription: { model: 'gpt-4o-mini-transcribe' },
      turn_detection: { type: 'semantic_vad' },
      noise_reduction: { type: 'near_field' },
    },
    output: { voice: process.env.OPENAI_REALTIME_VOICE || 'marin' },
  },
};

// Basic per-IP throttling limits accidental or abusive session creation.
const recentSessions = new Map();
function limitSessionRequests(req, res, next) {
  const now = Date.now();
  const key = req.ip;
  const timestamps = (recentSessions.get(key) || []).filter((time) => now - time < 60_000);
  if (recentSessions.size > 1_000) {
    for (const [address, times] of recentSessions) {
      if (!times.some((time) => now - time < 60_000)) recentSessions.delete(address);
    }
  }
  if (timestamps.length >= 10) {
    return res.status(429).json({ error: 'Too many voice sessions. Please wait a minute and try again.' });
  }
  timestamps.push(now);
  recentSessions.set(key, timestamps);
  next();
}

app.post('/api/realtime/session', express.text({ type: 'application/sdp', limit: '1mb' }), limitSessionRequests, async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'Voice assistant is not configured yet. Add OPENAI_API_KEY to the server environment.' });
  }
  if (typeof req.body !== 'string' || !req.body.startsWith('v=0')) {
    return res.status(400).json({ error: 'A valid WebRTC session offer is required.' });
  }

  const form = new FormData();
  form.set('sdp', req.body);
  form.set('session', JSON.stringify(sessionConfig));

  try {
    const upstream = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    const answer = await upstream.text();
    if (!upstream.ok) {
      // Log only a sanitized error code, never the response body or credentials.
      let errorCode = 'unknown';
      try {
        const upstreamError = JSON.parse(answer)?.error?.code;
        if (typeof upstreamError === 'string' && /^[a-z0-9_-]{1,80}$/i.test(upstreamError)) errorCode = upstreamError;
      } catch { /* The upstream response may not be JSON. */ }
      console.error(`Realtime session request failed with status ${upstream.status} (${errorCode})`);
      const message = errorCode === 'credit_balance_exhausted'
        ? 'Your OpenAI API project has no available credits. Enable API billing or add credits, then restart the voice session.'
        : upstream.status === 401 || upstream.status === 403
          ? 'OpenAI rejected OPENAI_API_KEY. Replace it with a valid key from your OpenAI Platform project and confirm Realtime API access.'
          : 'Could not start a voice session. Please try again shortly.';
      return res.status(upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status).json({
        error: message,
      });
    }
    res.type('application/sdp').send(answer);
  } catch {
    console.error('Realtime session request could not reach OpenAI.');
    res.status(502).json({ error: 'Could not reach the Realtime service. Check the server connection and try again.' });
  }
});

if (process.env.NODE_ENV === 'production' || productionPreview) {
  app.use(express.static(path.join(root, 'dist')));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      return res.sendFile(path.join(root, 'dist', 'index.html'));
    }
    next();
  });
}

app.listen(port, () => console.log(`Tourist Niketan API listening on port ${port}`));
