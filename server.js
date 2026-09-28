/*
 * Tiny static file server + local-dev entry point for the Stride
 * communication activity.
 *
 * No npm dependencies on purpose (Node 18+ ships a global `fetch`, and plain
 * `http` is enough for a classroom app): `node server.js` and you're done.
 *
 * The actual API logic (Gemini calls, SlopTotal proxy) lives in
 * lib/backend.js, transport-agnostic — this file is just the thinnest
 * possible adapter from `http.ServerResponse` onto it. The same backend
 * logic is also used by api/*.js, Vercel's serverless-function versions of
 * these same three routes, used when this project is deployed to Vercel
 * instead of run locally — see README.md ("Deploying (Vercel)").
 *
 * Three endpoints:
 *   POST /api/analyze        -> the "AI Communication Check" (step 5), calls
 *                                Google AI (Gemini) server-side
 *   POST /api/rewrite        -> the "Suggested Rewrite" (step 7), same
 *   POST /api/writing-check  -> optional AI-writing nudge before the final
 *                                card, proxies to a separately-run SlopTotal
 *                                instance on localhost:8000 (see README.md)
 *
 * The Gemini endpoints require GOOGLE_API_KEY to be set (env var, or a .env
 * file next to this script). If it's missing, or the API call fails for any
 * reason, the client-side rule-based fallback in app.js takes over
 * automatically. /api/writing-check degrades the same way: if SlopTotal
 * isn't running, it returns { skip: true } rather than an error, and app.js
 * just proceeds without the nudge — see README.md.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

loadDotEnv();

const backend = require('./lib/backend');

const PORT = process.env.PORT || 8080;

const STATIC_FILES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/app.js': 'app.js',
  '/styles.css': 'styles.css',
  '/logo.png': 'logo.png',
  '/logo-icon.png': 'logo-icon.png'
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png'
};

function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  });
}

function serveStatic(req, res) {
  const url = req.url.split('?')[0];
  const relPath = STATIC_FILES[url];
  if (!relPath) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  const filePath = path.join(__dirname, relPath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Server error');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    const MAX_BYTES = 200 * 1024;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(data);
}

async function handleApiRoute(handler, req, res) {
  try {
    const body = await readJsonBody(req);
    const result = await handler(body);
    sendJson(res, result.status, result.body);
  } catch (e) {
    sendJson(res, 400, { error: e.message || 'Invalid request' });
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/analyze') return handleApiRoute(backend.analyzeHandler, req, res);
  if (req.method === 'POST' && req.url === '/api/rewrite') return handleApiRoute(backend.rewriteHandler, req, res);
  if (req.method === 'POST' && req.url === '/api/writing-check') return handleApiRoute(backend.writingCheckHandler, req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Stride communication activity running at http://localhost:${PORT}`);
  if (!backend.getGoogleApiKey()) {
    console.log('GOOGLE_API_KEY is not set — the AI check/rewrite will fall back to the built-in rule-based logic. See README.md.');
  } else {
    console.log(`Live AI calls enabled (model: ${backend.getGeminiModel()}).`);
  }
  // Fire-and-forget: just a startup hint, never blocks the server or the
  // activity — the per-request fallback in writingCheckHandler is what
  // actually matters.
  const sloptotalUrl = backend.getSloptotalUrl();
  fetch(`${sloptotalUrl}/api/engines`, { signal: AbortSignal.timeout(1500) })
    .then((r) => {
      console.log(r.ok
        ? `SlopTotal writing check found at ${sloptotalUrl} — the optional writing-check nudge is enabled.`
        : `SlopTotal at ${sloptotalUrl} responded but looked unhealthy — the writing-check nudge will be skipped until it's up.`);
    })
    .catch(() => {
      console.log(`SlopTotal not found at ${sloptotalUrl} — the optional writing-check nudge will be silently skipped. See README.md to run it.`);
    });
});
