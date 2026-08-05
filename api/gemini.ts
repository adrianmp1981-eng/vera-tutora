/**
 * Serverless proxy for the Gemini API (Vercel auto-detects the /api folder).
 *
 * The GEMINI_API_KEY lives ONLY here, on the server. It is read from
 * process.env.GEMINI_API_KEY (never a VITE_ prefixed var), so it is never
 * shipped to the browser bundle.
 *
 * Body: { kind?, model, contents, config, prompt, image }
 *   kind: 'generateContent' (default) | 'generateImages' | 'generateVideos'
 */

import { GoogleGenAI } from '@google/genai';

// --- Simple in-memory rate limit (resets on cold start; enough to deter casual abuse) ---
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20; // per IP per minute
const rateMap = new Map<string, { count: number; windowStart: number }>();

function getIp(req: any): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  if (Array.isArray(xff) && xff.length) return String(xff[0]).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// Allow same-origin production/preview (*.vercel.app), the exact VERCEL_URL,
// an optional explicit ALLOWED_ORIGIN, and localhost during development.
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return true;
  if (host.endsWith('.vercel.app')) return true;
  if (process.env.VERCEL_URL && host === process.env.VERCEL_URL) return true;
  if (process.env.ALLOWED_ORIGIN) {
    try {
      if (host === new URL(process.env.ALLOWED_ORIGIN).host) return true;
    } catch {
      if (host === process.env.ALLOWED_ORIGIN) return true;
    }
  }
  return false;
}

export default async function handler(req: any, res: any) {
  // 1. Method
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only POST is allowed.' });
    return;
  }

  // 2. Origin check
  if (!isAllowedOrigin(req.headers.origin)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Origin not allowed.' });
    return;
  }

  // 3. Rate limit (20 req/min per IP)
  const ip = getIp(req);
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateMap.set(ip, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
    if (entry.count > RATE_MAX) {
      res.status(429).json({
        error: 'RATE_LIMIT',
        message: 'Demasiadas peticiones. Espera un minuto e inténtalo de nuevo.',
      });
      return;
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'NO_API_KEY', message: 'Server misconfigured: GEMINI_API_KEY is not set.' });
    return;
  }

  let body: any = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { kind = 'generateContent', model, contents, config, prompt, image } = body || {};

  const ai = new GoogleGenAI({ apiKey });

  try {
    if (kind === 'generateImages') {
      const r = await ai.models.generateImages({ model, prompt, config });
      const imageBytes = r.generatedImages?.[0]?.image?.imageBytes || null;
      res.status(200).json({ imageBytes });
      return;
    }

    if (kind === 'generateVideos') {
      let operation = await ai.models.generateVideos({ model, prompt, image, config });
      while (!operation.done) {
        await new Promise((r) => setTimeout(r, 5000));
        operation = await ai.operations.getVideosOperation({ operation });
      }
      const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!uri) {
        res.status(200).json({ videoBase64: null });
        return;
      }
      // Fetch the rendered video server-side (key stays on the server) and return it inline.
      const vresp = await fetch(uri, { headers: { 'x-goog-api-key': apiKey } });
      const buf = Buffer.from(await vresp.arrayBuffer());
      res.status(200).json({ videoBase64: `data:video/mp4;base64,${buf.toString('base64')}` });
      return;
    }

    // Default: text generation.
    const r = await ai.models.generateContent({ model, contents, config });
    res.status(200).json({ text: r.text ?? '' });
  } catch (err: any) {
    // Forward Gemini's status + message so the client can tell a 429 quota from a real failure.
    const rawStatus = err?.status ?? err?.code ?? err?.response?.status;
    const status = typeof rawStatus === 'number' && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
    const message = err?.message || 'Gemini request failed.';
    res.status(status).json({ error: 'GEMINI_ERROR', status, message });
  }
}
