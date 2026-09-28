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
- `server.js` — local-dev static file server + thin adapter onto
  `lib/backend.js` for the three `/api/*` routes. Zero npm dependencies
  (Node 18+'s built-in `fetch`). See "Running it" and "The live AI call".
- `lib/backend.js` — the actual `/api/analyze`, `/api/rewrite`, and
  `/api/writing-check` logic (Gemini calls, SlopTotal proxy), written
  transport-agnostic (plain object in, `{status, body}` out) so it's shared
  identically between `server.js` (local dev) and `api/*.js` (Vercel). See
  "Deploying (Vercel)".
- `api/analyze.js`, `api/rewrite.js`, `api/writing-check.js` — Vercel
  serverless-function versions of the same three routes, each a thin
  adapter onto `lib/backend.js`. Only relevant when deployed to Vercel; not
  used by `node server.js`.
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

## Deploying (Vercel)

`server.js` is a plain `http.createServer` — Vercel does not run that as a
persistent process. Deployed there, only the static files (`index.html`,
`app.js`, `styles.css`, the logos) would be served automatically; every
`/api/*` call would 404, and both AI steps would silently fall back to the
rule-based logic with no visible error. That's exactly what "live AI isn't
working on Vercel" looks like if you hit this.

The fix already in this repo: the actual API logic lives in
`lib/backend.js`, transport-agnostic (it takes a plain JS object in, returns
`{ status, body }`, and knows nothing about `http.ServerResponse` or
Vercel's `res`). Two thin adapters call into it:
- `server.js` — for local dev, unchanged from your point of view (`node
  server.js`).
- `api/analyze.js`, `api/rewrite.js`, `api/writing-check.js` — one file per
  route, Vercel's file-based convention for Node.js serverless functions.
  Vercel auto-detects the `api/` folder and serves everything else (the
  static files) as-is; no `vercel.json` needed for this project's shape.

**What you still need to do on Vercel's end** (this repo can't do it for
you — it's account-specific configuration, not code):

1. In the Vercel project's **Settings → Environment Variables**, add
   `GOOGLE_API_KEY` (same value as your local `.env`). Optionally
   `GEMINI_MODEL` too if you're overriding the default.
2. Redeploy after adding it — Vercel only injects env vars set *before* a
   build/deploy, not retroactively into an already-running deployment.
3. Do **not** set `SLOPTOTAL_URL` to anything on Vercel unless you've
   separately deployed SlopTotal somewhere publicly reachable (its own
   heavy CPU/model-loading needs don't fit a serverless function's
   time/memory limits anyway — see the next section). Left unset,
   `/api/writing-check` on Vercel will always resolve to `{ skip: true }`,
   silently and correctly — the writing check is a local-classroom-server
   feature by design, not something meant to run on the public deployment.

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
a real Google AI (Gemini) model through `lib/backend.js` (used by both
`server.js` locally and `api/*.js` on Vercel):

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
- The prompts (`ANALYZE_SYSTEM` / `REWRITE_SYSTEM` in `lib/backend.js`) ask for
  strict JSON back and validate the shape before returning it to the
  client; malformed or missing output is treated as a failure and triggers
  the same fallback path.

If you want suggestions to stay recognizably in a given student's voice over
time, the next step is storing a short profile of their past messages per
student (see "Per-student, cross-device history" above) and feeding it into
the `/api/rewrite` prompt.

## The optional AI-writing check (SlopTotal)

When a student tries to move on from step 2 ("Create Your Verbal Message"),
the activity can optionally run their message through
[SlopTotal](https://github.com/pablocaeg/sloptotal), a self-hosted,
open-source AI-text detector (23 local CPU engines, no API key, nothing sent
to a third party). Unlike a typical plagiarism gate, this only ever blocks
on a confident positive, and the only way past it is to actually rewrite the
message — there is no "continue anyway":

- Clicking NEXT on step 2 (`advanceStep2()` in `app.js`) sends just
  `state.verbalMessage` — not a combined multi-field block — to
  `POST /api/writing-check`, since this fires right after that one field is
  written. The button shows "CHECKING…" and disables while the request is
  in flight.
- It only blocks the advance when SlopTotal returns **both**
  `confidence: "high"` **and** `verdict: "ai"`, showing an inline message
  under the textarea and keeping the student on step 2. A `"mixed"` verdict,
  or `"ai"`/`"human"` at `"low"` confidence, is treated as inconclusive and
  advances normally — those are exactly the cases most likely to be false
  positives, including for non-native English writers.
- The only way past a block is to edit the textarea and click NEXT again,
  which runs a fresh check on the revised text.
- If SlopTotal isn't running, is unreachable, times out, or returns anything
  unexpected, the check is silently skipped and the student advances as if
  the feature didn't exist — see `writingCheckHandler()` in `lib/backend.js`.

### Running SlopTotal

SlopTotal is a **separate Python/FastAPI service** — it does not run inside
`server.js` or share its process. Clone it as a sibling folder and start it
on port 8000 before using this feature; if it's not running, everything
above just degrades gracefully and the check is silently skipped.

```bash
git clone https://github.com/pablocaeg/sloptotal.git
cd sloptotal
python3.11 -m venv venv && source venv/bin/activate   # needs Python 3.10+
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

A few things worth knowing if you're setting this up yourself:

- **Python 3.10+ is a hard requirement, not just a recommendation** — the
  README says macOS's system Python 3.9 is "too old," and that's literal:
  `app/autoconfig.py` uses `str | None` union-type syntax at module scope,
  which raises `TypeError: unsupported operand type(s) for |` on 3.9. If you
  don't have Homebrew/pyenv handy, a fully self-contained interpreter (no
  system-wide install, no sudo) works too — e.g. a prebuilt CPython from
  [astral-sh/python-build-standalone](https://github.com/astral-sh/python-build-standalone/releases)
  (grab the `aarch64-apple-darwin-install_only_stripped` asset for Apple
  Silicon, or the matching `x86_64` one for Intel Macs), extracted anywhere,
  then `/path/to/extracted/python/bin/python3.11 -m venv venv` in place of
  the first line above.
- First run downloads the HuggingFace model weights it needs (~2 GB) into
  `sloptotal/models/` (`HF_HOME` in `.env`) — this can take a few minutes
  and needs network access.
- `server.js` proxies to `http://localhost:8000` by default; if you run
  SlopTotal on a different host/port, set `SLOPTOTAL_URL` in this project's
  `.env` to match.
- On startup, `server.js` logs whether it found SlopTotal at that URL — this
  is only a heads-up for whoever's running the classroom server, not
  something the activity depends on to function.

## Extending the scenario library

Add a new entry to `SITUATIONS` (needs `id`, `title`, `blurb`, `audience`,
`audienceCap`, `goal`, `context`), then add its outcome text to `OUTCOMES`
under the same `id` (`positive` / `neutral` / `negative`). You do **not**
need to touch `LEVELS` unless a specific non-verbal option should behave
differently for this new scenario than its `default` — that's the point of
the `{default, overrides}` shape: a brand-new scenario works immediately
using every option's default level, and you only add an override entry for
the specific combinations that need one.
