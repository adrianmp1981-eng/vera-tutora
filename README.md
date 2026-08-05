<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/93e0732c-3d2e-4bde-b838-fb29b925c977

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Security: server-side Gemini key

All calls to the Gemini API go through a Vercel serverless function at
[`api/gemini.ts`](api/gemini.ts). The `GEMINI_API_KEY` lives **only on the
server** (`process.env.GEMINI_API_KEY`) and is never bundled into the client, so
it can't be read from the browser devtools.

- **Do not** use a `VITE_`-prefixed key — Vite inlines those into the public
  bundle. Use plain `GEMINI_API_KEY`.
- On Vercel, add `GEMINI_API_KEY` under Project Settings → Environment Variables.
- The proxy also enforces a simple origin check and an in-memory rate limit
  (20 requests/min per IP) to deter casual abuse.

> Note: `api/gemini.ts` needs a serverless host (Vercel). `npm run dev` serves
> the static client; run it on Vercel (or `vercel dev`) to exercise the proxy.
