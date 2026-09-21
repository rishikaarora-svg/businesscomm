/*
 * Tiny static file server + AI backend for the Stride communication activity.
 *
 * No npm dependencies on purpose (Node 18+ ships a global `fetch`, and plain
 * `http` is enough for a classroom app): `node server.js` and you're done.
 *
 * Two endpoints call the Google AI (Gemini) API server-side, so the API key
 * never ships to the browser:
 *   POST /api/analyze  -> the "AI Communication Check" (step 5)
 *   POST /api/rewrite  -> the "Suggested Rewrite" (step 7)
 *
 * Both require GOOGLE_API_KEY to be set (env var, or a .env file next to
 * this script). If it's missing, or the API call fails for any reason, the
 * client-side rule-based fallback in app.js takes over automatically — see
 * README.md.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

loadDotEnv();

const PORT = process.env.PORT || 8080;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const GEMINI_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

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

// Strips ```json ... ``` fences if the model wraps its output despite being
// told not to; with responseMimeType 'application/json' Gemini shouldn't,
// but this keeps parsing robust.
function extractJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

// Despite responseMimeType 'application/json' and explicit instructions,
// this model sometimes emits JS-object-literal keys instead of JSON's
// required double-quoted keys (`label: "x"` instead of `"label": "x"`).
// This walks the text respecting string boundaries (so it only touches
// structural key positions, never text *inside* a string value) and quotes
// any bare identifier immediately followed by a colon.
function quoteUnquotedKeys(text) {
  let result = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    if (text[i] === '"') {
      let j = i + 1;
      while (j < n) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === '"') { j++; break; }
        j++;
      }
      result += text.slice(i, j);
      i = j;
    } else {
      let j = text.indexOf('"', i);
      if (j === -1) j = n;
      result += text.slice(i, j).replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
      i = j;
    }
  }
  return result;
}

function parseModelJson(text) {
  const candidate = extractJson(text);
  try {
    return JSON.parse(candidate);
  } catch (e) {
    return JSON.parse(quoteUnquotedKeys(candidate));
  }
}

async function callGemini(system, userPrompt, maxTokens) {
  if (!GOOGLE_API_KEY) {
    const err = new Error('GOOGLE_API_KEY is not set');
    err.code = 'NO_API_KEY';
    throw err;
  }
  const response = await fetch(`${GEMINI_URL(GEMINI_MODEL)}?key=${encodeURIComponent(GOOGLE_API_KEY)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      // thinkingBudget: 0 disables this model's hidden reasoning pass — left
      // on, it silently burns most of maxOutputTokens on reasoning tokens
      // that never appear in `parts`, truncating the actual JSON answer.
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } }
    })
  });
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`Google AI API error ${response.status}: ${bodyText.slice(0, 300)}`);
  }
  const data = await response.json();
  const candidate = (data.candidates || [])[0];
  const parts = (candidate && candidate.content && candidate.content.parts) || [];
  // Concatenate every text part rather than assuming parts[0] holds the
  // whole answer — Gemini sometimes splits a single response across parts.
  const text = parts.map((p) => p.text || '').join('');
  if (!text) {
    const reason = (candidate && candidate.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || 'no content';
    throw new Error(`Google AI API returned no text content (${reason})`);
  }
  return parseModelJson(text);
}

const ANALYZE_SYSTEM = `You are a business-communication coach for BBA students at Stride School of Business.
You will be given a workplace scenario and a student's message plus the tone of voice and body language they chose to go with it.

Analyze it and respond with ONLY a valid JSON array (no markdown fences, no commentary before or after) of exactly 6 objects, in this exact order, each shaped {"label": string, "text": string}, with these exact labels:
"Professionalism", "Clarity", "Tone", "Verbal Communication", "Non-Verbal Communication", "Possible Receiver Reaction".

Rules for the "text" of each section:
- 2-4 sentences, written directly to the student ("you"/"your").
- Ground it in the student's actual wording — quote or paraphrase a specific short phrase from their message where it helps.
- Be constructive and specific to this scenario, never a generic template, and never give a numeric score.
- For "Non-Verbal Communication", reference the specific body-language choices provided and explicitly say which ones help or hurt in this scenario, using the given ideal/caution/avoid ratings as ground truth (don't contradict them, but you can explain the "why" in your own words).
- For "Possible Receiver Reaction", predict concretely how the specific person described (their role, and what's at stake for them) would realistically react to this exact message, referencing the stated goal.`;

const REWRITE_SYSTEM = `You are a business-communication coach for BBA students at Stride School of Business.
You will be given a workplace scenario and a student's message.

Respond with ONLY a valid JSON object (no markdown fences, no commentary) shaped {"text": string, "rationale": string}:
- "text": a polished rewrite of the student's message, written in first person as something they could actually say, that fits this scenario's audience and goal, fixes any professionalism/clarity/tone problems, and stays reasonably close to the student's own length and voice rather than becoming generic corporate-speak.
- "rationale": 2-4 sentences, written directly to the student ("you"/"your"), explaining the specific changes you made and why they fit this scenario.`;

function buildAnalyzePrompt(body) {
  const s = body.situation || {};
  const nv = Array.isArray(body.nonverbal) ? body.nonverbal : [];
  const nvLines = nv.map((n) => `- ${n.category}: "${n.choice}" (rated ${n.level} for this scenario)`).join('\n') || '(none selected)';
  return `SCENARIO
Title: ${s.title || ''}
Context: ${s.context || ''}
Audience: ${s.audience || ''}
Student's goal: ${s.goal || ''}

STUDENT'S MESSAGE
"${body.verbalMessage || ''}"

STUDENT'S SELF-DESCRIPTION OF THEIR OWN DELIVERY
Tone: ${body.tone || ''}
Word choice: ${body.wordChoice || ''}
Clarity: ${body.clarity || ''}

NON-VERBAL CHOICES (rating is pre-computed ground truth for this scenario)
${nvLines}

STUDENT'S OWN PREDICTION OF HOW THE RECEIVER WILL REACT
"${body.receiverGuess || ''}"

Now produce the JSON array described in your instructions.`;
}

function buildRewritePrompt(body) {
  const s = body.situation || {};
  return `SCENARIO
Title: ${s.title || ''}
Context: ${s.context || ''}
Audience: ${s.audience || ''}
Student's goal: ${s.goal || ''}

STUDENT'S MESSAGE
"${body.verbalMessage || ''}"

Now produce the JSON object described in your instructions.`;
}

async function handleAnalyze(req, res) {
  try {
    const body = await readJsonBody(req);
    if (!body.verbalMessage || !body.situation) return sendJson(res, 400, { error: 'Missing situation or verbalMessage' });
    const sections = await callGemini(ANALYZE_SYSTEM, buildAnalyzePrompt(body), 1200);
    if (!Array.isArray(sections) || !sections.length) throw new Error('Unexpected AI response shape');
    sendJson(res, 200, sections);
  } catch (e) {
    const status = e.code === 'NO_API_KEY' ? 503 : 502;
    sendJson(res, status, { error: e.message });
  }
}

async function handleRewrite(req, res) {
  try {
    const body = await readJsonBody(req);
    if (!body.situation) return sendJson(res, 400, { error: 'Missing situation' });
    const result = await callGemini(REWRITE_SYSTEM, buildRewritePrompt(body), 700);
    if (!result || typeof result.text !== 'string') throw new Error('Unexpected AI response shape');
    sendJson(res, 200, result);
  } catch (e) {
    const status = e.code === 'NO_API_KEY' ? 503 : 502;
    sendJson(res, status, { error: e.message });
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/analyze') return handleAnalyze(req, res);
  if (req.method === 'POST' && req.url === '/api/rewrite') return handleRewrite(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Stride communication activity running at http://localhost:${PORT}`);
  if (!GOOGLE_API_KEY) {
    console.log('GOOGLE_API_KEY is not set — the AI check/rewrite will fall back to the built-in rule-based logic. See README.md.');
  } else {
    console.log(`Live AI calls enabled (model: ${GEMINI_MODEL}).`);
  }
});
