# Verbal & Non-Verbal Business Communication — Stride School of Business

A classroom activity where a student picks a real workplace situation, writes
the message they'd actually say, chooses the body language/tone that goes
with it, predicts how it'll land, gets a rule-based communication check,
improves their message, sees a suggested rewrite side-by-side with their own,
and builds a "Communication Persona" they can download.

This is a plain HTML/CSS/JS app. **No build step, no framework, no npm
install.** Just open `index.html` in a browser.

## Files

- `index.html` — the page shell. Loads fonts, `styles.css`, `app.js`.
- `styles.css` — all styling (same visual design as the original artifact:
  warm cream background, navy/rust accent colors).
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
    `buildFullAnalysis()` (the AI Communication Check), `buildSuggestedRewrite()`
    (the rule-based rewrite), `buildPersonaTraits()` / `buildPersonaMarkdown()`.
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
    ... `step8HTML`), all just returning HTML strings. `render()` sets
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

Just open `index.html` directly in a browser (double-click it, or
`open index.html` / drag it into a browser tab). There's no server, no
bundler, nothing to install.

If you want to develop with live-reload, any static file server works, e.g.:

```
npx serve .
```

or Python's built-in one:

```
python3 -m http.server 8080
```

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

Two things were swapped for browser-native equivalents:

- **Downloading the persona file.** The artifact used
  `claude.use('downloads').save(...)`. This version uses a standard
  `Blob` + `URL.createObjectURL` + temporary `<a download>` click, which is
  the normal way to trigger a file download from a plain web page.
- Everything else (the scenario history, the coherence check, the scoring)
  was already plain JS logic; it's carried over unchanged.

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
  the more useful integration is probably writing the finished
  "Communication Persona" / final card back into that LMS as a submission,
  rather than only offering a `.md` download.

## Adding real AI (instead of the rule-based check)

The "AI Communication Check" and "Suggested Rewrite" are currently
rule-based (keyword/pattern heuristics in `analyzeVerbal()`,
`buildFullAnalysis()`, and `buildSuggestedRewrite()` — no network calls, no
API key needed, works offline). That was a deliberate choice in the
artifact version, which had no `sample`/live-AI capability declared.

Now that this is a normal web app, you can call a real LLM if you want
sharper, more personalized feedback. The straightforward way:

1. Add a tiny backend endpoint (don't call an LLM API directly from the
   browser — that exposes your API key). E.g. a single serverless function
   `POST /api/analyze` that takes `{ situation, verbalMessage, nonverbal, tone, wordChoice, clarity }`
   and returns the same shape `buildFullAnalysis()` returns today
   (an array of `{ label, text }`).
2. In `runAnalysis()`, replace the synchronous call to `buildFullAnalysis(state)`
   with an `async` `fetch()` to that endpoint, show a loading state while it's
   in flight, then `setState({ analysisSections: result, analysisRun: true })`
   when it resolves.
3. Do the same for `generateSuggestion()` / `buildSuggestedRewrite()`, and
   optionally feed the student's saved persona (`buildPersonaMarkdown()`
   output, or a stored version of it per student) into the prompt so
   suggestions stay recognizably in that student's voice over time — this
   is the "context md file" idea from earlier, just done for real once you
   have a backend to store it against a student id instead of only a
   browser download.

## Extending the scenario library

Add a new entry to `SITUATIONS` (needs `id`, `title`, `blurb`, `audience`,
`audienceCap`, `goal`, `context`), then add its outcome text to `OUTCOMES`
under the same `id` (`positive` / `neutral` / `negative`). You do **not**
need to touch `LEVELS` unless a specific non-verbal option should behave
differently for this new scenario than its `default` — that's the point of
the `{default, overrides}` shape: a brand-new scenario works immediately
using every option's default level, and you only add an override entry for
the specific combinations that need one.
