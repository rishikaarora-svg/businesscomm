# Read the Room — Stride School of Business

_Verbal & Non-Verbal Business Communication classroom activity._

A classroom activity where a student picks a real workplace situation, writes
the message they'd actually say, chooses the body language/tone that goes
with it, predicts how it'll land, gets an AI-powered communication check,
sees an AI-suggested rewrite side-by-side with their own, and builds a final
Business Communication Impact Card that includes that improved message.

The front end is plain HTML/CSS/JS — **no framework, no bundler, no client-side
npm install.** The AI check/rewrite are backed by a small Node server with
zero dependencies (see "Running it" below); everything still works with no
server at all, just with rule-based feedback instead of live AI.

## Files

- `index.html` — the page shell. Loads fonts, `styles.css`, `app.js`.
- `styles.css` — all styling (same visual design as the original artifact:
  warm cream background, navy/rust accent colors).
- `server.js` — static file server + the `/api/analyze` and `/api/rewrite`
  endpoints that call the Google AI (Gemini) API server-side. Zero npm
  dependencies (Node 18+'s built-in `fetch`). See "Running it" and "The live
  AI call".
- `.env.example` — copy to `.env` and set `GOOGLE_API_KEY` to enable live
  AI (never commit the real `.env` — it's gitignored).
- `app.js` — everything else. It's one file on purpose (easy to read top to
  bottom), organized into clearly commented sections:
  - **DATA** — the 12-scenario situation library (`SITUATIONS`), the
    non-verbal category/option model (`NONVERBAL_CATEGORIES`), the scoring
    table (`LEVELS`, using a `{default, overrides}` shape so adding a new
    scenario doesn't require touching every existing option), the
    explanation text templates (`REASONS`), and the likely-outcome text per
    scenario (`OUTCOMES`).
  - **LOGIC** — pure functions with no DOM access: `isCoherentText()` (the
    gibberish/coherence gate on every free-text field), `analyzeVerbal()`,
    `buildFullAnalysis()` (the rule-based fallback for the AI Communication
    Check), `buildSuggestedRewrite()` (the rule-based fallback rewrite).
    These have no dependency on the DOM or browser APIs, so they're the
    easiest place to add automated tests if you want them later.
  - **STATE** — one plain object, `state`. `setState(patch)` mutates it and
    calls `render()`.
  - **ACTIONS** — functions like `selectSituation`, `goNext`, `runAnalysis`,
    `createCard`, etc. These are what buttons call.
  - **DERIVED VALUES** — `derive()` recomputes anything that depends on
    `state` (validity of each step, the situation cards' badges, live
    explanations) fresh on every render, so `state` itself never gets out
    of sync with what's shown.
  - **RENDER** — one template function per screen (`introHTML`, `step1HTML`
    ... `step7HTML`), all just returning HTML strings. `render()` sets
    `#app`'s `innerHTML` to the current screen.
  - **RENDER + BIND** — after every `render()`, `bindTextFieldsForScreen()`
    wires up whichever textareas/inputs are on screen. Typing does **not**
    trigger a full re-render (that would drop your cursor mid-keystroke) —
    it updates `state` directly and only touches the couple of DOM nodes
    that need to change (a warning message, a "Next" button's disabled
    state). Buttons use one delegated click listener on `#app` (matching on
    `data-action` attributes), so it keeps working across re-renders without
    needing to be re-attached.

## Running it

The activity itself is still plain HTML/CSS/JS, but the "AI Communication
Check" (step 5) and "Suggested Rewrite" (step 6) now call a real Google AI
(Gemini) model through a tiny bundled Node server, `server.js`. It has
**zero npm dependencies** — Node 18+'s built-in `fetch` is enough to call
the Google AI API, and the built-in `http` module serves the static files —
so there's still no build step, just `node server.js` instead of a generic
static server.

```
cp .env.example .env      # then edit .env and set GOOGLE_API_KEY
node server.js             # or: npm start
```

Then open http://localhost:8080. If `GOOGLE_API_KEY` isn't set, or the
API call fails for any reason (offline, rate-limited, bad key, invalid
model name), both steps automatically fall back to the original rule-based
check/rewrite — the activity still works end-to-end with no key at all, it
just says "RULE-BASED (OFFLINE)" next to the result instead of
"AI-GENERATED".

If you don't need live AI and just want the old fully-static behavior, any
plain static file server still works for everything except those two steps,
e.g. `npx serve .` or `python3 -m http.server 8080`.

Optional env vars (see `.env.example`): `PORT` (default `8080`),
`GEMINI_MODEL` (default `gemini-3.6-flash` — if your API key's account
doesn't have access to that exact model name, check
[Google AI Studio](https://aistudio.google.com/) for the model id available
to you and set `GEMINI_MODEL` accordingly).

## Where this came from, and what changed

This was originally built as a Claude "Design" canvas Artifact — a
templating environment (`.dc.html`) with its own control-flow tags
(`<sc-if>`, `<sc-for>`), a React-like `DCLogic` class, and a fixed, small set
of runtime capabilities the artifact type declares up front (it had `db`
writable only by admins, no live-AI `sample` capability, etc.). That's a
fine environment for a quick interactive artifact, but it's awkward for
"properly" developing a real classroom tool — no git-friendly diffs, no
real editor tooling, no way to add a real backend.

This port keeps 100% of the behavior (every scenario, every scoring rule,
every explanation string, the coherence check, the scenario-rotation logic)
but as plain JS you can now edit, version, and extend normally.

The scenario history, the coherence check, and the scoring were already
plain JS logic; they carried over unchanged. (An earlier version of this
port also had a downloadable "Communication Persona" file, built from
`claude.use('downloads').save(...)` in the original artifact; that whole
feature — the manual "Improve Your Message" step it depended on and the
persona builder — has since been removed as not adding enough value. The
activity now goes straight from the AI Communication Check to the AI
Suggested Rewrite, which becomes part of the final card.)

## The "different scenario each time" mechanic

`loadScenarioHistory()` / `saveScenarioHistory()` read and write a small
JSON array of situation ids to `localStorage` under the key
`stride_comm_activity_history_v1`. `pickRecommendedSituationId()` looks at
that history and recommends a situation the student hasn't tried yet (or,
once they've tried everything, the one they did longest ago). This is what
puts "SUGGESTED FOR YOU" / "DONE BEFORE" badges on the Step 1 cards.

Because this is now a real app rather than a sandboxed artifact, this is the
first thing worth upgrading if you want it to be more than a "per-browser"
memory:

- **Per-student, cross-device history**: swap `localStorage` for a real
  backend. The cleanest approach is a tiny API (Node/Express, or a
  serverless function) backed by a database, keyed by student login/email,
  with two endpoints: `GET /history?student=...` and
  `POST /history` `{student, situationId}`. Replace the two `localStorage`
  calls in `app.js` with `fetch()` calls to those endpoints.
- If Stride already has an LMS (Canvas, Moodle, Google Classroom, etc.),
  the more useful integration is probably writing the finished final card
  back into that LMS as a submission.

## The live AI call

The "AI Communication Check" (step 5) and "Suggested Rewrite" (step 6) call
a real Google AI (Gemini) model through `server.js`:

- `POST /api/analyze` takes `{ situation, verbalMessage, tone, wordChoice, clarity, nonverbal, receiverGuess }`
  and returns the same shape the old rule-based `buildFullAnalysis()` did
  (an array of `{ label, text }`, one per section) — but the six `text`
  values are now genuinely written about the student's specific message by
  Gemini, not templated strings. The non-verbal ratings (ideal/caution/avoid)
  are still computed deterministically client-side from `LEVELS` and sent
  along as ground truth, so the model's commentary can't contradict the
  rules taught elsewhere in the activity — it only has to explain them well
  for this specific message.
- `POST /api/rewrite` takes `{ situation, verbalMessage }` and returns
  `{ text, rationale }` — an actual rewrite tailored to the scenario, not a
  regex-based find/replace. That rewrite (`state.suggestedRewrite`) is what
  shows up as "Your Improved Message" on the final card in step 7.
- In `app.js`, `runAnalysis()` and `generateSuggestion()` are `async`: they
  call `fetchAiAnalysis()` / `fetchAiRewrite()` (which `POST` to those two
  endpoints), show a loading state while in flight, and on any failure
  (missing key, network error, bad response) fall back to the original
  `buildFullAnalysis()` / `buildSuggestedRewrite()` rule-based logic so the
  activity never breaks or blocks a student. `state.analysisSource` /
  `state.suggestionSource` (`'ai'` or `'fallback'`) drive the small
  "AI-GENERATED" / "RULE-BASED (OFFLINE)" badge next to each result.
- The prompts (`ANALYZE_SYSTEM` / `REWRITE_SYSTEM` in `server.js`) ask for
  strict JSON back and validate the shape before returning it to the
  client; malformed or missing output is treated as a failure and triggers
  the same fallback path.

If you want suggestions to stay recognizably in a given student's voice over
time, the next step is storing a short profile of their past messages per
student (see "Per-student, cross-device history" above) and feeding it into
the `/api/rewrite` prompt.

## Extending the scenario library

Add a new entry to `SITUATIONS` (needs `id`, `title`, `blurb`, `audience`,
`audienceCap`, `goal`, `context`), then add its outcome text to `OUTCOMES`
under the same `id` (`positive` / `neutral` / `negative`). You do **not**
need to touch `LEVELS` unless a specific non-verbal option should behave
differently for this new scenario than its `default` — that's the point of
the `{default, overrides}` shape: a brand-new scenario works immediately
using every option's default level, and you only add an override entry for
the specific combinations that need one.
