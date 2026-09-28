/*
 * Transport-agnostic backend logic, shared between two runtimes:
 *   - server.js: a plain `http.createServer` for local dev (`node server.js`)
 *   - api/*.js: Vercel serverless functions (one file per route, Vercel's
 *     file-based routing convention) for the deployed site
 *
 * Every exported handler here takes an already-parsed JSON body (a plain
 * object, not a request stream) and returns `{ status, body }` — neither
 * shape knows anything about `http.ServerResponse` vs. Vercel's `res`, so
 * each runtime's thin adapter (see server.js / api/*.js) just translates
 * that into whatever its own response API expects.
 *
 * Env vars (GOOGLE_API_KEY, GEMINI_MODEL, SLOPTOTAL_URL) are read from
 * `process.env` at call time, not at module load: server.js populates them
 * via its own `.env` loader before requiring this file; Vercel injects real
 * project env vars into `process.env` directly, no file involved.
 */

function getGoogleApiKey() { return process.env.GOOGLE_API_KEY || ''; }
function getGeminiModel() { return process.env.GEMINI_MODEL || 'gemini-3.6-flash'; }
function getSloptotalUrl() { return process.env.SLOPTOTAL_URL || 'http://localhost:8000'; }

const GEMINI_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

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
  const apiKey = getGoogleApiKey();
  if (!apiKey) {
    const err = new Error('GOOGLE_API_KEY is not set');
    err.code = 'NO_API_KEY';
    throw err;
  }
  const response = await fetch(`${GEMINI_URL(getGeminiModel())}?key=${encodeURIComponent(apiKey)}`, {
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

async function analyzeHandler(body) {
  try {
    if (!body.verbalMessage || !body.situation) return { status: 400, body: { error: 'Missing situation or verbalMessage' } };
    const sections = await callGemini(ANALYZE_SYSTEM, buildAnalyzePrompt(body), 1200);
    if (!Array.isArray(sections) || !sections.length) throw new Error('Unexpected AI response shape');
    return { status: 200, body: sections };
  } catch (e) {
    return { status: e.code === 'NO_API_KEY' ? 503 : 502, body: { error: e.message } };
  }
}

async function rewriteHandler(body) {
  try {
    if (!body.situation) return { status: 400, body: { error: 'Missing situation' } };
    const result = await callGemini(REWRITE_SYSTEM, buildRewritePrompt(body), 700);
    if (!result || typeof result.text !== 'string') throw new Error('Unexpected AI response shape');
    return { status: 200, body: result };
  } catch (e) {
    return { status: e.code === 'NO_API_KEY' ? 503 : 502, body: { error: e.message } };
  }
}

// This route itself never reports failure as an error — unlike
// analyzeHandler/rewriteHandler (which report failure with a 4xx/5xx and let
// the client fall back), every failure path here responds 200 with
// { skip: true }. That way app.js never needs to distinguish "SlopTotal is
// down" from "SlopTotal said skip" from "network hiccup" — it only ever has
// to check `result.skip`, and only a genuine { skip: false, confidence:
// "high", verdict: "ai" } response is treated as a real signal by the
// caller (see advanceStep2() in app.js, which is what actually blocks on
// it). On Vercel there is no localhost:8000 to reach at all (SlopTotal is a
// separate local-only process — see README.md), so this always resolves to
// { skip: true } there, which is the correct behavior.
async function writingCheckHandler(body) {
  try {
    const text = (body.text || '').trim();
    if (!text) return { status: 200, body: { skip: true } };

    let response;
    try {
      response = await fetch(`${getSloptotalUrl()}/api/quick-score`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(8000)
      });
    } catch (networkErr) {
      // Connection refused (SlopTotal isn't running), DNS failure, or our
      // own 8s timeout — all treated the same: skip the check.
      return { status: 200, body: { skip: true } };
    }

    if (!response.ok) return { status: 200, body: { skip: true } };
    const data = await response.json();
    if (!data || typeof data.verdict !== 'string' || typeof data.confidence !== 'string') {
      return { status: 200, body: { skip: true } };
    }
    return { status: 200, body: { skip: false, score: data.score, verdict: data.verdict, confidence: data.confidence } };
  } catch (e) {
    return { status: 200, body: { skip: true } };
  }
}

module.exports = {
  getGoogleApiKey,
  getGeminiModel,
  getSloptotalUrl,
  analyzeHandler,
  rewriteHandler,
  writingCheckHandler
};
