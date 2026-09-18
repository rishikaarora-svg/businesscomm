/*
 * Verbal & Non-Verbal Business Communication — Stride School of Business
 *
 * Plain HTML/CSS/JS, no build step, no framework. Open index.html in a
 * browser and it runs. This was ported out of a constrained templating
 * environment (Claude's "Design" artifact type) so it can be developed
 * normally — git, a real editor, tests, whatever you want to add.
 *
 * Architecture, so you can find your way around:
 *  - DATA / LOGIC (top of file): the situation library, the non-verbal
 *    scoring model, the rule-based "communication check" analysis, the
 *    suggested-rewrite and persona builders. All pure functions — no DOM
 *    access — so they're easy to unit test if you want to add tests.
 *  - STATE: one plain object (`state`), mutated by the action functions.
 *  - RENDER: `render()` rebuilds the whole screen from `state` into
 *    `#app`. Discrete actions (clicking a button, picking an option) call
 *    `setState()`, which mutates state and calls `render()`.
 *  - LIVE TEXT FIELDS: textareas/inputs are NOT re-rendered on every
 *    keystroke (that would drop focus/cursor). Typing updates `state`
 *    directly and only touches the couple of DOM nodes that need to
 *    change (a warning message, a Next button's disabled state) — see
 *    `bindTextField()`.
 *  - EVENTS: buttons use a single delegated click listener on `#app`
 *    (data-action / data-* attributes), so it keeps working across
 *    re-renders without re-attaching a listener per button.
 */

// ============================================================
// DATA
// ============================================================

const SITUATIONS = [
  { id: 'complaint', title: 'Handling a Customer Complaint', blurb: 'An upset customer wants their problem solved and to feel heard.', audience: 'an upset customer', audienceCap: 'An upset customer', goal: 'calm them down and resolve the issue', context: 'You work at the customer support desk of a mid-size e-commerce company. A customer’s order arrived a week late, and the replacement item that finally showed up was damaged too. They have already emailed twice with no reply and are now calling you directly, clearly frustrated. Your manager expects support cases to be resolved on the first contact whenever possible.' },
  { id: 'feedback', title: 'Giving Feedback to an Employee', blurb: 'You need to help a team member improve without discouraging them.', audience: 'an employee you are coaching', audienceCap: 'The employee you are coaching', goal: 'help them improve without discouraging them', context: 'You are a team lead at a marketing agency. A team member who joined three months ago has been missing small details in client deliverables — typos, wrong dates, an inconsistent brand color. The work is otherwise promising and no client has complained yet, but you want to raise it in your next 1:1 before it becomes a pattern.' },
  { id: 'pitch', title: 'Presenting an Idea to a Manager', blurb: 'You want your manager to back a new idea in a short window of time.', audience: 'your manager', audienceCap: 'Your manager', goal: 'persuade them your idea is worth backing', context: 'You are two years into your role and believe the company should pilot a referral program to bring in new clients at a lower cost than paid ads. You have about five minutes at the end of a weekly leadership meeting to make the case to your manager, who is data-driven, time-pressed, and used to people overselling ideas.' },
  { id: 'client', title: 'Speaking to a New Client', blurb: 'A first conversation that sets the tone for a new business relationship.', audience: 'a new client', audienceCap: 'The new client', goal: 'build trust and make a strong first impression', context: 'You are meeting a potential client for the first time on a video call, for a project that could become a long-term retainer if this first engagement goes well. They have worked with agencies before and had at least one bad experience, so they are naturally a little guarded and watching closely for how you communicate.' },
  { id: 'teamwork', title: 'Working with a Team Member', blurb: 'You are coordinating on shared work and need everyone aligned.', audience: 'a teammate', audienceCap: 'Your teammate', goal: 'collaborate openly and respectfully', context: 'You are working with a teammate from a different department on a joint deliverable with a tight shared deadline. They have been slow to respond to messages this week, and you are not sure if they are overloaded, deprioritizing the work, or dealing with something else — you need to raise it without sounding like you are checking up on them.' },
  { id: 'salary', title: 'Asking for a Raise or Promotion', blurb: 'You want to make the case for more responsibility or pay, professionally.', audience: 'your manager', audienceCap: 'Your manager', goal: 'make a fair, well-supported case without sounding entitled', context: 'You have taken on noticeably more responsibility over the last two review cycles and believe your title or pay should reflect it. Performance reviews are still a month away, but you want to raise the topic now, informally, with a manager who tends to avoid these conversations unless someone brings them up directly.' },
  { id: 'vendor', title: 'Pushing Back on a Vendor Delay', blurb: 'A supplier has missed a deadline that affects your own delivery to a client.', audience: 'a vendor account manager', audienceCap: 'The vendor’s account manager', goal: 'get a firm new timeline while protecting the relationship', context: 'A key vendor was due to deliver materials three days ago; they still have not, and your own delivery to a client is now at risk because of it. You need to push for a firm new date and some accountability, but this vendor is otherwise reliable and you want to keep working with them long-term.' },
  { id: 'badnews', title: 'Delivering Difficult News to Your Team', blurb: 'A project your team cared about is being paused or cut, and they need to hear it from you.', audience: 'your team', audienceCap: 'Your team', goal: 'be honest about the setback while keeping morale intact', context: 'Leadership has just told you that the project your team has spent the last two months on is being paused indefinitely due to budget cuts. Your team does not know yet. You have a stand-up meeting in an hour and need to tell them yourself, before they hear it secondhand.' },
  { id: 'crossfunctional', title: 'Aligning with Another Department’s Lead', blurb: 'You need a peer in another team to prioritize your request over their own.', audience: 'a lead from another department', audienceCap: 'The other department’s lead', goal: 'get real buy-in, not just polite agreement', context: 'Your project needs design and engineering time from a team that does not report to you and has its own competing deadlines. You are meeting their lead to ask them to prioritize your request this sprint, knowing they will naturally want to protect their own team’s plan first.' },
  { id: 'investor', title: 'Answering a Tough Investor Question', blurb: 'An investor is pressing you on a metric that did not go the way you promised.', audience: 'an investor', audienceCap: 'The investor', goal: 'stay credible while being straightforward about the miss', context: 'You are two months into a startup role and presenting quarterly numbers to an early investor. One key metric came in well below what was promised last quarter, and the investor has just asked you directly why. You know evasive answers will hurt trust more than the miss itself.' },
  { id: 'onboarding', title: 'Welcoming a New Team Member', blurb: 'A new hire joins today and looks to you for how things really work here.', audience: 'a new team member', audienceCap: 'The new team member', goal: 'make them feel welcome while setting clear expectations', context: 'A new hire starts today on your team. They are clearly a little nervous and unsure where anything is. You have 20 minutes with them before their first meeting to welcome them, explain how the team actually works day to day, and set expectations for their first two weeks.' },
  { id: 'apology', title: 'Apologizing for a Missed Deadline', blurb: 'You missed a client deadline and need to own it without losing their trust.', audience: 'a client', audienceCap: 'The client', goal: 'repair trust and keep the account, not just excuse the delay', context: 'Your team missed a deliverable deadline for a long-standing client by three days because of an internal scheduling mistake. The client has noticed and asked what happened. You need to call them, take responsibility, and explain what happens next — without sounding defensive or over-apologizing to the point of losing credibility.' }
];

// Where a returning student's history lives. In the old artifact-canvas
// version this had to be localStorage (the only per-viewer persistence
// available there). Now that this is a normal web page, you could swap
// this for a real backend / login-based store if you want history to
// follow a student across devices — see README.md.
const SCENARIO_HISTORY_KEY = 'stride_comm_activity_history_v1';
const SCENARIO_HISTORY_MAX = 100;

function loadScenarioHistory() {
  try {
    const raw = localStorage.getItem(SCENARIO_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch (e) {
    return [];
  }
}

function saveScenarioHistory(history) {
  try {
    localStorage.setItem(SCENARIO_HISTORY_KEY, JSON.stringify(history.slice(-SCENARIO_HISTORY_MAX)));
  } catch (e) {}
}

function pickRecommendedSituationId(history) {
  const seen = {};
  history.forEach((id) => { seen[id] = true; });
  const neverTried = SITUATIONS.filter((s) => !seen[s.id]);
  if (neverTried.length) return neverTried[0].id;
  const lastIndex = {};
  history.forEach((id, i) => { lastIndex[id] = i; });
  const sorted = SITUATIONS.slice().sort((a, b) => (lastIndex[a.id] ?? -1) - (lastIndex[b.id] ?? -1));
  return sorted[0].id;
}

const NONVERBAL_CATEGORIES = [
  { key: 'facial', label: 'Facial Expression', options: [
    { key: 'calm_attentive', label: 'Calm & Attentive' },
    { key: 'frowning_tense', label: 'Frowning / Tense' },
    { key: 'big_smile', label: 'Big Smile' },
    { key: 'blank', label: 'Blank / Expressionless' }
  ] },
  { key: 'eye', label: 'Eye Contact', options: [
    { key: 'steady', label: 'Steady, Natural Eye Contact' },
    { key: 'avoiding', label: 'Avoiding Eye Contact' },
    { key: 'staring', label: 'Prolonged / Intense Staring' }
  ] },
  { key: 'posture', label: 'Posture', options: [
    { key: 'open', label: 'Open, Upright Posture' },
    { key: 'crossed', label: 'Crossed Arms / Closed Off' },
    { key: 'slouched', label: 'Slouched / Overly Relaxed' }
  ] },
  { key: 'gesture', label: 'Hand Gestures', options: [
    { key: 'open_measured', label: 'Open, Measured Gestures' },
    { key: 'pointing', label: 'Pointing / Sharp Gestures' },
    { key: 'fidgeting', label: 'Fidgeting / No Gestures' }
  ] },
  { key: 'voice', label: 'Voice / Tone of Delivery', options: [
    { key: 'calm_steady', label: 'Calm & Steady' },
    { key: 'raised_sharp', label: 'Raised / Sharp' },
    { key: 'flat', label: 'Flat / Monotone' },
    { key: 'warm', label: 'Warm & Enthusiastic' }
  ] },
  { key: 'space', label: 'Personal Space', options: [
    { key: 'respectful', label: "Respectful Distance (about an arm's length)" },
    { key: 'too_close', label: 'Too Close' },
    { key: 'too_far', label: 'Too Far / Distant' }
  ] }
];

// Each option carries a "default" level that applies to any situation not
// listed in "overrides" — this is what lets the situation library grow
// without having to edit every option by hand for every new scenario.
const LEVELS = {
  facial: {
    calm_attentive: { default: 'ideal', overrides: {} },
    frowning_tense: { default: 'avoid', overrides: {} },
    big_smile: { default: 'caution', overrides: { pitch: 'ideal', client: 'ideal', teamwork: 'ideal', onboarding: 'ideal', crossfunctional: 'caution', badnews: 'avoid', apology: 'caution' } },
    blank: { default: 'avoid', overrides: { teamwork: 'caution', crossfunctional: 'caution' } }
  },
  eye: {
    steady: { default: 'ideal', overrides: {} },
    avoiding: { default: 'avoid', overrides: { teamwork: 'caution' } },
    staring: { default: 'caution', overrides: {} }
  },
  posture: {
    open: { default: 'ideal', overrides: {} },
    crossed: { default: 'avoid', overrides: {} },
    slouched: { default: 'avoid', overrides: { feedback: 'caution', teamwork: 'caution', onboarding: 'caution' } }
  },
  gesture: {
    open_measured: { default: 'ideal', overrides: {} },
    pointing: { default: 'avoid', overrides: { pitch: 'caution' } },
    fidgeting: { default: 'caution', overrides: { pitch: 'avoid', investor: 'avoid' } }
  },
  voice: {
    calm_steady: { default: 'ideal', overrides: {} },
    raised_sharp: { default: 'avoid', overrides: {} },
    flat: { default: 'caution', overrides: { complaint: 'avoid', client: 'avoid', pitch: 'avoid', badnews: 'avoid', apology: 'avoid' } },
    warm: { default: 'caution', overrides: { feedback: 'ideal', pitch: 'ideal', client: 'ideal', teamwork: 'ideal', onboarding: 'ideal' } }
  },
  space: {
    respectful: { default: 'ideal', overrides: {} },
    too_close: { default: 'avoid', overrides: { pitch: 'caution' } },
    too_far: { default: 'caution', overrides: {} }
  }
};

function getLevel(catKey, optKey, situationId) {
  const entry = LEVELS[catKey] && LEVELS[catKey][optKey];
  if (!entry) return 'caution';
  if (entry.overrides && Object.prototype.hasOwnProperty.call(entry.overrides, situationId)) {
    return entry.overrides[situationId];
  }
  return entry.default;
}

const REASONS = {
  facial: {
    calm_attentive: { ideal: 'A calm, attentive face reassures {audience} that you are engaged and in control, which supports your goal to {goal}.', caution: '', avoid: '' },
    frowning_tense: { avoid: 'A tense or frowning face can make {audience} feel like you are irritated or defensive, which works against your goal to {goal}.', caution: '', ideal: '' },
    big_smile: { ideal: 'A warm smile puts {audience} at ease and signals genuine interest, supporting your goal to {goal}.', caution: 'A big smile here can unintentionally seem like you are not taking the moment seriously, which may get in the way of your goal to {goal}.', avoid: '' },
    blank: { avoid: 'An expressionless face can read as indifference to {audience}, working against your goal to {goal}.', caution: 'A neutral face can come across as disengaged here, so add small cues of interest.', ideal: '' }
  },
  eye: {
    steady: { ideal: 'Steady, natural eye contact signals honesty and confidence to {audience}, helping you {goal}.', caution: '', avoid: '' },
    avoiding: { avoid: 'Avoiding eye contact can make {audience} doubt your sincerity, working against your goal to {goal}.', caution: 'Occasionally breaking eye contact is natural, but too much can look evasive here.', ideal: '' },
    staring: { caution: 'Holding eye contact too long can feel intense to {audience} rather than confident, which may distract from your goal to {goal}.', ideal: '', avoid: '' }
  },
  posture: {
    open: { ideal: 'An open, upright posture shows {audience} that you are receptive and confident, supporting your goal to {goal}.', caution: '', avoid: '' },
    crossed: { avoid: 'Crossed arms can look defensive or closed off to {audience}, which works against your goal to {goal}.', caution: '', ideal: '' },
    slouched: { avoid: 'Slouching can suggest disinterest to {audience}, undercutting your goal to {goal}.', caution: 'A relaxed posture is fine in small doses, but keep enough structure that you still look engaged.', ideal: '' }
  },
  gesture: {
    open_measured: { ideal: 'Open, measured gestures support your words without distracting {audience}, helping you {goal}.', caution: '', avoid: '' },
    pointing: { avoid: 'Sharp or pointing gestures can feel accusatory to {audience}, working against your goal to {goal}.', caution: 'A little energy in your gestures is fine here, but keep them open rather than sharp so they do not feel forceful.', ideal: '' },
    fidgeting: { caution: 'Fidgeting can signal nervousness to {audience}, which may soften your credibility as you try to {goal}.', avoid: 'Fidgeting or having no gestures at all can undercut your credibility with {audience} as you try to {goal}.', ideal: '' }
  },
  voice: {
    calm_steady: { ideal: 'A calm, steady voice reads as composed and trustworthy to {audience}, supporting your goal to {goal}.', caution: '', avoid: '' },
    raised_sharp: { avoid: 'A raised or sharp voice can escalate tension with {audience}, working directly against your goal to {goal}.', caution: '', ideal: '' },
    flat: { avoid: 'A flat, monotone voice can sound indifferent to {audience}, undercutting your goal to {goal}.', caution: 'A flatter tone can feel impersonal here, so add some warmth if you can.', ideal: '' },
    warm: { ideal: 'A warm, enthusiastic voice builds rapport with {audience} and supports your goal to {goal}.', caution: 'Enthusiasm is good, but with {audience} it helps to first acknowledge the situation before sounding upbeat, so it does not feel dismissive.', avoid: '' }
  },
  space: {
    respectful: { ideal: "A respectful distance keeps {audience} comfortable while you {goal}.", caution: '', avoid: '' },
    too_close: { avoid: 'Standing too close can feel invasive to {audience}, working against your goal to {goal}.', caution: 'Standing close can feel a little intense here; a small step back usually helps.', ideal: '' },
    too_far: { caution: 'Standing too far away can feel cold or disengaged to {audience}, which may not help you {goal}.', ideal: '', avoid: '' }
  }
};

const LEVEL_META = {
  ideal: { label: 'Good Fit', color: '#3F7A5D', bg: '#E7F1EA' },
  caution: { label: 'Worth a Second Thought', color: '#9A6B12', bg: '#FBF0DC' },
  avoid: { label: 'Likely to Work Against You', color: '#B3402A', bg: '#FBE7E1' }
};

const OUTCOMES = {
  complaint: { positive: 'reassured that you are taking the problem seriously and willing to fix it', neutral: 'somewhat calmer, but may still have doubts about how well you understood the issue', negative: 'even more frustrated, and may feel like the complaint was not really heard' },
  feedback: { positive: 'motivated to improve, because the feedback felt fair and supportive', neutral: 'aware of the issue, but not fully sure how to act on it', negative: 'discouraged or defensive, because the feedback may have felt harsh or unclear' },
  pitch: { positive: 'interested and open to exploring your idea further', neutral: 'polite but non-committal, without a strong reason to act yet', negative: 'unconvinced, and may not take the idea further' },
  client: { positive: 'confident that this is a business relationship worth investing in', neutral: 'cautiously interested, but not fully won over yet', negative: 'uncertain about working with you, which can be hard to reverse this early' },
  teamwork: { positive: 'comfortable collaborating and sharing ideas with you going forward', neutral: 'willing to cooperate, but may hold back their honest input', negative: 'hesitant to bring problems or ideas to you in future' },
  salary: { positive: 'receptive, and likely to follow up with a concrete next step on your title or pay', neutral: 'noncommittal, acknowledging the request without promising anything yet', negative: 'put off by the ask, and may see it as premature or entitled' },
  vendor: { positive: 'cooperative, and likely to commit to a firm new date and some accountability', neutral: 'apologetic but vague about a new timeline', negative: 'defensive, which risks the relationship without fixing the delay' },
  badnews: { positive: 'disappointed but reassured that you were straight with them and still have their back', neutral: 'unsettled, and unsure what this means for them next', negative: 'blindsided or resentful, which can damage morale beyond this one decision' },
  crossfunctional: { positive: 'genuinely willing to prioritize your request, not just agreeing to be polite', neutral: 'noncommittal, saying they will "try" without a real commitment', negative: 'quietly deprioritizing your request the moment the meeting ends' },
  investor: { positive: 'reassured that you understand the miss and have a credible plan', neutral: 'wary, waiting to see if the next quarter improves before judging', negative: 'concerned about your credibility, which is harder to rebuild than the metric itself' },
  onboarding: { positive: 'welcomed and clear on what is expected of them in the first two weeks', neutral: 'polite but still unsure how things really work here', negative: 'anxious and unsure whether they made the right choice joining' },
  apology: { positive: 'reassured that you own the mistake and have a real plan, keeping their trust', neutral: 'accepting of the apology but watching closely for whether it happens again', negative: 'doubtful about relying on your team going forward' }
};

const STEP_TITLES = ['', 'Step 1 of 8 — Choose a Business Situation', 'Step 2 of 8 — Create Your Verbal Message', 'Step 3 of 8 — Add Non-Verbal Communication', 'Step 4 of 8 — Receiver Reaction', 'Step 5 of 8 — AI Communication Check', 'Step 6 of 8 — Improve Your Message', 'Step 7 of 8 — Suggested Rewrite & Persona', 'Step 8 of 8 — Final Communication Card'];

const STOPWORDS = { the: 1, a: 1, an: 1, to: 1, of: 1, and: 1, is: 1, are: 1, i: 1, you: 1, it: 1, in: 1, on: 1, for: 1, that: 1, this: 1, will: 1, be: 1, we: 1, my: 1, your: 1, with: 1, was: 1, have: 1, has: 1, do: 1, does: 1, so: 1, but: 1, not: 1, at: 1, as: 1, if: 1, can: 1 };

// ============================================================
// LOGIC (pure functions — no DOM access, easy to unit test)
// ============================================================

function isCoherentText(text, minWords) {
  minWords = minWords || 3;
  const t = (text || '').trim();
  if (!t) return { ok: false, reason: '' };
  const words = t.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < minWords) {
    return { ok: false, reason: `Write at least ${minWords} words, as a real sentence, not just a few characters.` };
  }
  const letterWords = words.filter((w) => /[a-zA-Z]/.test(w));
  if (letterWords.length / words.length < 0.6) {
    return { ok: false, reason: 'This does not look like readable text yet — use actual words.' };
  }
  let gibberishCount = 0;
  letterWords.forEach((w) => {
    const clean = w.replace(/[^a-zA-Z]/g, '');
    if (!clean) return;
    const hasVowel = /[aeiouAEIOU]/.test(clean);
    const repeatedChar = /(.)\1{3,}/.test(clean);
    const longConsonantRun = /[^aeiouAEIOU\s]{5,}/.test(clean);
    if (repeatedChar || longConsonantRun || (!hasVowel && clean.length >= 4)) gibberishCount++;
  });
  if (letterWords.length > 0 && gibberishCount / letterWords.length > 0.3) {
    return { ok: false, reason: 'Some of this looks like random keystrokes rather than real words — please rewrite it as an actual sentence.' };
  }
  const lower = t.toLowerCase();
  const keyboardMash = ['asdf', 'qwer', 'zxcv', 'jkl;', 'hjkl', 'asdasd', 'qweqwe', 'lkjlkj'];
  if (keyboardMash.some((k) => lower.indexOf(k) !== -1)) {
    return { ok: false, reason: 'This looks like keyboard mashing — please write a real sentence.' };
  }
  return { ok: true, reason: '' };
}

function topPhrases(text, n) {
  const words = (text || '').toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS[w]);
  const counts = {};
  words.forEach((w) => { counts[w] = (counts[w] || 0) + 1; });
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, n || 5);
}

function analyzeVerbal(text) {
  const t = (text || '').trim();
  const lower = t.toLowerCase();
  const words = t.length ? t.split(/\s+/).filter((w) => w.length > 0) : [];
  const wordCount = words.length;
  const courtesyWords = ['please', 'thank you', 'thanks', 'appreciate', 'understand', 'sorry', 'apologize', 'respect', 'glad', 'happy to'];
  const aggressiveWords = ['stupid', 'ridiculous', 'never', 'whatever', 'obviously', 'unacceptable', 'useless', 'pathetic', 'your fault'];
  const hasCourtesy = courtesyWords.some((w) => lower.indexOf(w) !== -1);
  const hasAggressive = aggressiveWords.some((w) => lower.indexOf(w) !== -1);
  const exclaimCount = (t.match(/!/g) || []).length;
  const hasAllCapsWord = words.some((w) => w.length > 3 && w === w.toUpperCase() && /[A-Z]/.test(w));
  return { wordCount, hasCourtesy, hasAggressive, exclaimCount, hasAllCapsWord };
}

function fmt(tpl, vals) {
  if (!tpl) return '';
  return tpl.split('{audience}').join(vals.audience).split('{goal}').join(vals.goal);
}

function getExplanation(catKey, optKey, situationId) {
  const level = getLevel(catKey, optKey, situationId);
  const situation = SITUATIONS.find((s) => s.id === situationId);
  const reasonTpl = (REASONS[catKey] && REASONS[catKey][optKey] && REASONS[catKey][optKey][level]) || '';
  const text = fmt(reasonTpl, situation) || 'This choice is workable here, though not the strongest possible fit.';
  const meta = LEVEL_META[level];
  return { level, levelLabel: meta.label, color: meta.color, bg: meta.bg, text };
}

function buildFullAnalysis(state) {
  const situation = SITUATIONS.find((s) => s.id === state.situationId);
  if (!situation) return [];
  const a = analyzeVerbal(state.verbalMessage);
  const aud = situation.audience;
  const audCap = situation.audienceCap;
  const goal = situation.goal;

  const goodOnes = [], watchOnes = [], riskyOnes = [];
  let nvScore = 0;
  NONVERBAL_CATEGORIES.forEach((cat) => {
    const optKey = state.nonverbal[cat.key];
    if (!optKey) return;
    const opt = cat.options.find((o) => o.key === optKey);
    const level = getLevel(cat.key, optKey, situation.id);
    const entry = { catLabel: cat.label, optLabel: opt.label };
    if (level === 'ideal') { goodOnes.push(entry); nvScore += 1; }
    else if (level === 'caution') { watchOnes.push(entry); }
    else { riskyOnes.push(entry); nvScore -= 1; }
  });

  let verbalScore = 0;
  if (a.hasCourtesy && !a.hasAggressive) verbalScore += 1;
  if (a.hasAggressive) verbalScore -= 2;
  if (a.hasAllCapsWord) verbalScore -= 1;
  if (a.exclaimCount >= 3) verbalScore -= 1;

  const total = nvScore + verbalScore;
  const bucket = total >= 4 ? 'positive' : (total <= -2 ? 'negative' : 'neutral');

  let professionalism;
  if (a.hasAggressive || a.hasAllCapsWord) {
    professionalism = `A few word choices${a.hasAllCapsWord ? ' (including a word written in all capitals)' : ''} could come across as sharper or less professional than intended. In a business setting, even strong feelings usually land better in measured language.`;
  } else {
    professionalism = 'Your message stays within a professional register. There is no harsh or careless language that would need softening before you send it.';
  }

  let clarityText;
  if (a.wordCount < 8) {
    clarityText = `At about ${a.wordCount} word${a.wordCount === 1 ? '' : 's'}, your message is quite brief. ${audCap} may be left unsure what you actually want to happen next. Consider adding one clear sentence that states the outcome you are asking for.`;
  } else if (a.wordCount > 90) {
    clarityText = `Your message runs long, at roughly ${a.wordCount} words. ${audCap} may lose track of the main point. Try cutting it down to the two or three sentences that matter most.`;
  } else {
    clarityText = `Your message is a workable length, at roughly ${a.wordCount} words, for this situation: long enough to explain yourself, short enough to stay easy to follow.`;
  }

  let toneText;
  if (a.hasAggressive) {
    toneText = `Some phrasing leans sharper than the situation calls for. With ${aud}, a calmer tone usually lands better and keeps the door open for a good outcome.`;
  } else if (a.exclaimCount >= 3) {
    toneText = `Frequent exclamation marks can make the message feel rushed rather than composed. With ${aud}, one well-placed exclamation mark usually carries more weight than several.`;
  } else if (a.hasCourtesy) {
    toneText = `Your word choice comes across as courteous and considered, which suits a conversation with ${aud}.`;
  } else {
    toneText = `Your tone reads as fairly neutral. Depending on how you want ${aud} to feel, a touch more warmth, or a touch more firmness, could sharpen the effect.`;
  }

  const verbalComm = `You described your own tone as "${state.tone}", your word choice as "${state.wordChoice}", and your clarity as "${state.clarity}". Reading the message back, check whether it actually sounds the way you described it. That gap, between how we intend to sound and how a message actually reads, is one of the most common challenges in business communication, and one of the easiest to fix with a second read before sending.`;

  const nvParts = [];
  if (goodOnes.length) nvParts.push(`${goodOnes.length} of your six choices support this situation well (${goodOnes.map((g) => `${g.catLabel}: ${g.optLabel}`).join('; ')}).`);
  if (watchOnes.length) nvParts.push(`A few are worth a second thought: ${watchOnes.map((g) => `${g.catLabel}: ${g.optLabel}`).join('; ')}. These are not wrong, just not the strongest fit for ${aud}.`);
  if (riskyOnes.length) nvParts.push(`${riskyOnes.length === 1 ? 'One choice may' : riskyOnes.length + ' choices may'} actually work against you: ${riskyOnes.map((g) => `${g.catLabel}: ${g.optLabel}`).join('; ')}. These are the ones worth reconsidering first.`);
  if (!watchOnes.length && !riskyOnes.length) nvParts.push('Overall, your non-verbal choices line up well with what this situation calls for.');
  const nvText = nvParts.join(' ');

  const outcome = OUTCOMES[situation.id][bucket];
  let reactionExtra;
  if (bucket === 'positive') {
    reactionExtra = `This is largely because your verbal message stayed measured and most of your non-verbal choices support your goal to ${goal}.`;
  } else if (bucket === 'negative') {
    if (riskyOnes.length) {
      reactionExtra = `In particular, "${riskyOnes[0].optLabel}" for ${riskyOnes[0].catLabel} is likely to work against you here.`;
    } else if (a.hasAggressive) {
      reactionExtra = 'In particular, some of your word choices may come across as sharper than intended.';
    } else {
      reactionExtra = 'A combination of smaller choices is adding up against you, none of them serious on their own.';
    }
  } else {
    reactionExtra = 'Nothing here is seriously wrong, but nothing strongly stands out as reassuring either. A few small adjustments could tip this further in your favor.';
  }
  const receiverText = `${audCap} is likely to feel ${outcome}. ${reactionExtra}`;

  return [
    { label: 'Professionalism', text: professionalism },
    { label: 'Clarity', text: clarityText },
    { label: 'Tone', text: toneText },
    { label: 'Verbal Communication', text: verbalComm },
    { label: 'Non-Verbal Communication', text: nvText },
    { label: 'Possible Receiver Reaction', text: receiverText }
  ];
}

function buildReceiverPreview(state, situation) {
  const a = analyzeVerbal(state.verbalMessage);
  let nvScore = 0;
  NONVERBAL_CATEGORIES.forEach((cat) => {
    const optKey = state.nonverbal[cat.key];
    if (!optKey) return;
    const level = getLevel(cat.key, optKey, situation.id);
    if (level === 'ideal') nvScore += 1;
    else if (level === 'avoid') nvScore -= 1;
  });
  let verbalScore = 0;
  if (a.hasCourtesy && !a.hasAggressive) verbalScore += 1;
  if (a.hasAggressive) verbalScore -= 2;
  if (a.hasAllCapsWord) verbalScore -= 1;
  const total = nvScore + verbalScore;
  const bucket = total >= 3 ? 'positive' : (total <= -1 ? 'negative' : 'neutral');
  const outcome = OUTCOMES[situation.id][bucket];
  return `${situation.audienceCap} is likely to feel ${outcome}, based on the message and non-verbal choices you have made so far.`;
}

function buildSuggestedRewrite(state, situation) {
  const a = analyzeVerbal(state.verbalMessage);
  const base = (state.improvedMessage && state.improvedMessage.trim()) || state.verbalMessage || '';
  const aud = situation.audience;
  const goal = situation.goal;
  let opener;
  if (a.hasAggressive) {
    opener = 'Thanks for bearing with me on this — ';
  } else if (!a.hasCourtesy) {
    opener = 'I wanted to check in with you about this. ';
  } else {
    opener = '';
  }
  let body = base.trim();
  if (a.hasAggressive) {
    const aggressiveWords = ['stupid', 'ridiculous', 'never', 'whatever', 'obviously', 'unacceptable', 'useless', 'pathetic'];
    aggressiveWords.forEach((w) => {
      const re = new RegExp(`\\b${w}\\b`, 'gi');
      body = body.replace(re, () => 'a real challenge');
    });
  }
  if (a.hasAllCapsWord) {
    body = body.replace(/\b[A-Z]{4,}\b/g, (m) => m.charAt(0) + m.slice(1).toLowerCase());
  }
  body = body.replace(/!{2,}/g, '.');
  let ask = '';
  if (a.wordCount < 8) {
    ask = ' Here is what I would like to do next: could we find a time to talk this through so we land on the right next step?';
  }
  const closer = ` I want to make sure we ${goal}, and I would welcome your thoughts.`;
  const rewrite = (opener + body + ask + closer).replace(/\s+/g, ' ').trim();
  const rationaleParts = [];
  if (a.hasAggressive) rationaleParts.push(`softened a few sharper words so the message stays firm without sounding accusatory to ${aud}`);
  if (a.hasAllCapsWord) rationaleParts.push('removed all-capitals emphasis, which can read as shouting in text');
  if (a.wordCount < 8) rationaleParts.push(`added a concrete next step, since a very short message can leave ${aud} unsure what you are asking for`);
  if (!a.hasCourtesy) rationaleParts.push('opened with an acknowledging line to invite a more collaborative response');
  rationaleParts.push(`closed by naming your goal (to ${goal}) directly, which keeps the message purposeful`);
  return { text: rewrite, rationale: rationaleParts.join('; ') + '.' };
}

function buildPersonaTraits(state) {
  const a = analyzeVerbal(`${state.verbalMessage || ''} ${state.improvedMessage || ''}`);
  const lengthTrait = a.wordCount < 8 ? 'Brief — tends to write short, direct messages' : (a.wordCount > 60 ? 'Expansive — tends to explain fully before landing the point' : 'Balanced — writes enough to be clear without over-explaining');
  const courtesyTrait = a.hasCourtesy && !a.hasAggressive ? 'Warm and courteous by default' : (a.hasAggressive ? 'Direct, sometimes blunt under pressure' : 'Neutral and matter-of-fact');
  const toneWords = [state.tone, state.wordChoice, state.clarity].filter((t) => t && t.trim()).join(', ') || 'not yet described';
  const phrases = topPhrases(`${state.verbalMessage || ''} ${state.improvedMessage || ''}`, 5);
  const punctTrait = a.exclaimCount >= 3 ? 'Uses exclamation marks often — comes across as energetic, occasionally rushed' : (a.exclaimCount >= 1 ? 'Uses the occasional exclamation mark for emphasis' : 'Uses measured punctuation, rarely exclamatory');
  return [
    { key: 'length', label: 'Message length', value: lengthTrait },
    { key: 'courtesy', label: 'Default register', value: courtesyTrait },
    { key: 'selfDescribed', label: 'Self-described style', value: toneWords },
    { key: 'punctuation', label: 'Punctuation habit', value: punctTrait },
    { key: 'phrases', label: 'Recurring words', value: phrases.length ? phrases.join(', ') : 'not enough text yet to tell' }
  ];
}

function buildPersonaMarkdown(state, situation, traits) {
  const lines = [];
  lines.push(`# Communication Persona${state.studentName ? ' — ' + state.studentName : ''}`);
  lines.push('');
  lines.push('_Generated from the Verbal & Non-Verbal Business Communication activity, Stride School of Business._');
  lines.push('');
  lines.push('## Situation used to build this persona');
  lines.push(situation ? situation.title : 'Not selected');
  lines.push('');
  lines.push('## Traits');
  traits.forEach((t) => lines.push(`- **${t.label}**: ${t.value}`));
  lines.push('');
  lines.push('## Original message');
  lines.push('> ' + (state.verbalMessage || '').split('\n').join('\n> '));
  lines.push('');
  if (state.improvedMessage) {
    lines.push('## Improved message (student’s own revision)');
    lines.push('> ' + state.improvedMessage.split('\n').join('\n> '));
    lines.push('');
  }
  lines.push('## Notes for future activities');
  lines.push('Use these traits as a starting context on this student’s natural voice so future suggested rewrites stay recognizably theirs rather than generic.');
  return lines.join('\n');
}

// ============================================================
// STATE
// ============================================================

function initialState() {
  return {
    screen: 0,
    studentName: '',
    situationId: null,
    verbalMessage: '',
    tone: '',
    wordChoice: '',
    clarity: '',
    nonverbal: { facial: null, eye: null, posture: null, gesture: null, voice: null, space: null },
    receiverGuess: '',
    analysisRun: false,
    analysisSections: [],
    improvedMessage: '',
    learnVerbal: '',
    learnNonverbal: '',
    learnFuture: '',
    cardCreated: false,
    suggestionRun: false,
    suggestedRewrite: '',
    suggestionRationale: '',
    personaDownloadNote: '',
    scenarioHistory: loadScenarioHistory()
  };
}

let state = initialState();

function setState(patch) {
  Object.assign(state, patch);
  render();
}

// ============================================================
// ACTIONS
// ============================================================

function selectSituation(id) { setState({ situationId: id }); }

function pickNonverbal(catKey, optKey) {
  const next = Object.assign({}, state.nonverbal);
  next[catKey] = optKey;
  setState({ nonverbal: next });
}

function goNext() { setState({ screen: Math.min(8, state.screen + 1) }); }
function goBack() { setState({ screen: Math.max(0, state.screen - 1) }); }
function startActivity() { setState({ screen: 1 }); }

function runAnalysis() {
  const sections = buildFullAnalysis(state);
  setState({ analysisSections: sections, analysisRun: true });
}

function generateSuggestion() {
  const situation = SITUATIONS.find((x) => x.id === state.situationId);
  if (!situation) return;
  const result = buildSuggestedRewrite(state, situation);
  setState({ suggestedRewrite: result.text, suggestionRationale: result.rationale, suggestionRun: true });
}

function downloadPersona() {
  const situation = SITUATIONS.find((x) => x.id === state.situationId) || null;
  const traits = buildPersonaTraits(state);
  const md = buildPersonaMarkdown(state, situation, traits);
  const filename = `${state.studentName ? state.studentName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() : 'student'}-communication-persona.md`;
  try {
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setState({ personaDownloadNote: 'Downloaded.' });
  } catch (e) {
    setState({ personaDownloadNote: 'Could not create the download just now.' });
  }
}

function createCard() {
  const updatedHistory = state.scenarioHistory.slice();
  if (state.situationId) updatedHistory.push(state.situationId);
  saveScenarioHistory(updatedHistory);
  setState({ cardCreated: true, scenarioHistory: updatedHistory });
}

function editReflections() { setState({ cardCreated: false }); }

function resetActivity() {
  const keepHistory = state.scenarioHistory;
  state = initialState();
  state.scenarioHistory = keepHistory;
  render();
}

// ============================================================
// DERIVED VALUES (recomputed on every render from `state`)
// ============================================================

function derive() {
  const s = state;
  const situation = SITUATIONS.find((x) => x.id === s.situationId) || null;

  const recommendedId = pickRecommendedSituationId(s.scenarioHistory);
  const triedSet = {};
  s.scenarioHistory.forEach((id) => { triedSet[id] = true; });

  const situationItems = SITUATIONS.map((sit) => {
    const selected = s.situationId === sit.id;
    return Object.assign({}, sit, {
      selected,
      borderColor: selected ? '#A85D16' : '#E4DFD5',
      bgColor: selected ? '#FBF0DC' : '#FFFFFF',
      triedBefore: !!triedSet[sit.id],
      recommended: sit.id === recommendedId && !selected
    });
  });

  const nvCategories = NONVERBAL_CATEGORIES.map((cat) => {
    const selectedKey = s.nonverbal[cat.key];
    const options = cat.options.map((opt) => {
      const chosen = selectedKey === opt.key;
      return Object.assign({}, opt, {
        chosen,
        borderColor: chosen ? '#A85D16' : '#E4DFD5',
        bgColor: chosen ? '#FBF0DC' : '#FFFFFF'
      });
    });
    let explanation = null;
    if (selectedKey && situation) explanation = getExplanation(cat.key, selectedKey, situation.id);
    return { key: cat.key, label: cat.label, options, hasSelection: !!selectedKey, explanation };
  });

  const allNvChosen = NONVERBAL_CATEGORIES.every((cat) => !!s.nonverbal[cat.key]);
  const progressDots = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ n, dotColor: n <= s.screen ? '#A85D16' : '#E4DFD5' }));

  const verbalCheck = isCoherentText(s.verbalMessage, 4);
  const receiverCheck = isCoherentText(s.receiverGuess, 3);
  const improvedCheck = isCoherentText(s.improvedMessage, 4);
  const learnVerbalCheck = isCoherentText(s.learnVerbal, 3);
  const learnNonverbalCheck = isCoherentText(s.learnNonverbal, 3);
  const learnFutureCheck = isCoherentText(s.learnFuture, 3);

  const canStep1 = !!s.situationId;
  const canStep2 = verbalCheck.ok && s.tone.trim().length > 0 && s.wordChoice.trim().length > 0 && s.clarity.trim().length > 0;
  const canStep3 = allNvChosen;
  const canStep4 = receiverCheck.ok;
  const canStep5 = s.analysisRun;
  const canStep6 = improvedCheck.ok;
  const canStep7 = s.suggestionRun;
  const canCard = learnVerbalCheck.ok && learnNonverbalCheck.ok && learnFutureCheck.ok;

  const receiverPreview = situation ? buildReceiverPreview(s, situation) : '';
  const personaTraits = buildPersonaTraits(s);

  const cardNvList = nvCategories.filter((c) => c.hasSelection).map((c) => {
    const chosenOpt = c.options.find((o) => o.chosen);
    return { key: c.key, label: c.label, choice: chosenOpt ? chosenOpt.label : '' };
  });

  return {
    situation, situationItems, nvCategories, allNvChosen, progressDots,
    verbalCheck, receiverCheck, improvedCheck, learnVerbalCheck, learnNonverbalCheck, learnFutureCheck,
    canStep1, canStep2, canStep3, canStep4, canStep5, canStep6, canStep7, canCard,
    receiverPreview, personaTraits, cardNvList
  };
}

// ============================================================
// RENDER — templates (esc() everywhere we display free-typed text)
// ============================================================

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function checkSvg(size, stroke) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
}

function topbarHTML(s) {
  return `
    <div class="topbar">
      <div class="col" style="gap:2px;">
        <span style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#A85D16;">Stride School of Business</span>
        <span style="font-size:16px;font-weight:600;font-family:'Space Grotesk',system-ui,sans-serif;color:#14213D;">Verbal &amp; Non-Verbal Business Communication</span>
      </div>
      <div class="row align-center gap-16">
        <span style="font-size:13px;color:#6B7280;">BBA I &middot; Classroom Activity</span>
        ${s.screen > 0 ? `<button class="btn btn-ghost" type="button" data-action="resetActivity">Restart</button>` : ''}
      </div>
    </div>`;
}

function progressHTML(s, v) {
  if (!(s.screen >= 1 && s.screen <= 8)) return '';
  const dots = v.progressDots.map((d) => `<span style="width:10px;height:10px;border-radius:999px;background:${d.dotColor};display:inline-block;"></span>`).join('');
  return `
    <div class="row between align-center gap-16">
      <span style="font-size:13px;font-weight:600;color:#6B7280;">${esc(STEP_TITLES[s.screen] || '')}</span>
      <div class="row gap-6">${dots}</div>
    </div>`;
}

function introHTML(s) {
  return `
    <div class="card col gap-20" style="padding:36px;">
      <div class="col gap-10">
        <span style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#A85D16;">Classroom Activity</span>
        <h1 style="margin:0;font-family:'Space Grotesk',system-ui,sans-serif;font-size:30px;font-weight:700;color:#14213D;line-height:1.25;">Verbal &amp; Non-Verbal Business Communication</h1>
        <p style="margin:0;font-size:15px;color:#4B5563;line-height:1.65;">In business, how you say something often matters as much as what you say. In this activity you will pick a real workplace situation, write your own message, choose the body language and voice that go with it, then see how those choices are likely to land, and improve them.</p>
      </div>
      <div class="col gap-10" style="padding:20px;background:#FBF8F1;border-radius:10px;border:1.5px solid #E4DFD5;">
        <span class="field-label">How this works</span>
        <ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:14px;color:#374151;line-height:1.5;">
          <li>Choose a business situation.</li>
          <li>Write the message you would actually say.</li>
          <li>Choose the body language and tone of voice that go with it.</li>
          <li>Predict how the other person will react.</li>
          <li>Run a communication check for feedback.</li>
          <li>Improve your message.</li>
          <li>Build your final Business Communication Impact Card.</li>
        </ol>
      </div>
      <div class="col gap-8" style="max-width:360px;">
        <label class="field-label" for="studentName">Your name (optional, for your instructor)</label>
        <input id="studentName" class="text-input" type="text" placeholder="e.g., Aditi Sharma">
      </div>
      <div><button class="btn btn-primary" type="button" style="padding:14px 28px;font-size:15px;" data-action="startActivity">START ACTIVITY</button></div>
    </div>`;
}

function step1HTML(v) {
  const cards = v.situationItems.map((sit) => `
    <button class="situation-card" type="button" style="border-color:${sit.borderColor};background:${sit.bgColor};" data-action="selectSituation" data-id="${sit.id}">
      <div class="row" style="align-items:flex-start;justify-content:space-between;gap:8px;">
        <span style="font-weight:600;font-size:15px;color:#14213D;">${esc(sit.title)}</span>
        ${sit.selected ? checkSvg(18, '#A85D16') : ''}
      </div>
      <span style="font-size:13px;color:#6B7280;line-height:1.4;">${esc(sit.blurb)}</span>
      <div class="row gap-6 wrap">
        ${sit.recommended ? `<span class="badge" style="background:#3F7A5D;">SUGGESTED FOR YOU</span>` : ''}
        ${sit.triedBefore ? `<span class="badge" style="background:#9A8F7A;">DONE BEFORE</span>` : ''}
      </div>
    </button>`).join('');

  return `
    <div class="card col gap-20" style="padding:30px;">
      <div class="col gap-6">
        <h2 style="margin:0;font-family:'Space Grotesk',system-ui,sans-serif;font-size:21px;color:#14213D;">Choose a Business Situation</h2>
        <p style="margin:0;font-size:14px;color:#6B7280;">Pick the scenario you want to work through. You will use it for the rest of the activity. Situations you have not tried yet are marked so you can build a wider range of skills each time you use this activity.</p>
      </div>
      <div class="grid-2">${cards}</div>
      <div class="row between align-center divider-top">
        <button class="btn btn-ghost" type="button" data-action="goBack">BACK</button>
        <button id="step1-next-btn" class="btn btn-primary" type="button" ${v.canStep1 ? '' : 'disabled'} data-action="goNext">NEXT</button>
      </div>
    </div>`;
}

function step2HTML(v) {
  return `
    <div class="card col gap-20" style="padding:30px;">
      <div class="col gap-6">
        <span class="field-label" style="color:#A85D16;">${esc(v.situation ? v.situation.title : '')}</span>
        <h2 style="margin:0;font-family:'Space Grotesk',system-ui,sans-serif;font-size:21px;color:#14213D;">Create Your Verbal Message</h2>
        <p style="margin:0;font-size:14px;color:#6B7280;">What would YOU say in this situation? Write it the way you would actually say it out loud.</p>
      </div>
      <div style="padding:12px 14px;border-radius:8px;background:#FBF8F1;border:1.5px solid #E4DFD5;font-size:13px;color:#6B7280;line-height:1.5;">${esc(v.situation ? v.situation.context : '')}</div>
      <div class="col gap-8">
        <label class="field-label" for="verbalMessage">Your message</label>
        <textarea id="verbalMessage" class="textarea" rows="5" placeholder="Type exactly what you would say..."></textarea>
        <span id="verbalMessageWarning" class="warning-text ${v.verbalCheck.reason ? '' : 'hidden'}">${esc(v.verbalCheck.reason)}</span>
      </div>
      <div class="grid-3">
        <div class="col gap-8">
          <label class="field-label" for="tone">Tone</label>
          <input id="tone" class="text-input" type="text" placeholder="e.g., calm and firm">
        </div>
        <div class="col gap-8">
          <label class="field-label" for="wordChoice">Word Choice</label>
          <input id="wordChoice" class="text-input" type="text" placeholder="e.g., simple, respectful words">
        </div>
        <div class="col gap-8">
          <label class="field-label" for="clarity">Clarity</label>
          <input id="clarity" class="text-input" type="text" placeholder="e.g., clear and to the point">
        </div>
      </div>
      <div class="row between align-center divider-top">
        <button class="btn btn-ghost" type="button" data-action="goBack">BACK</button>
        <button id="step2-next-btn" class="btn btn-primary" type="button" ${v.canStep2 ? '' : 'disabled'} data-action="goNext">NEXT</button>
      </div>
    </div>`;
}

function step3HTML(v) {
  const categories = v.nvCategories.map((cat) => {
    const options = cat.options.map((opt) => `
      <button class="chip" type="button" style="border-color:${opt.borderColor};background:${opt.bgColor};" data-action="pickNonverbal" data-cat="${cat.key}" data-opt="${opt.key}">
        ${opt.chosen ? checkSvg(14, '#A85D16') : ''}
        ${esc(opt.label)}
      </button>`).join('');
    const explanation = cat.hasSelection ? `
      <div class="row" style="align-items:flex-start;gap:10px;padding:12px 14px;border-radius:8px;background:${cat.explanation.bg};">
        <span class="badge" style="background:${cat.explanation.color};">${esc(cat.explanation.levelLabel)}</span>
        <span style="font-size:13px;color:#374151;line-height:1.5;">${esc(cat.explanation.text)}</span>
      </div>` : '';
    return `
      <div class="col gap-10" style="padding:16px 0;border-top:1.5px solid #EEE9DD;">
        <span class="field-label">${esc(cat.label)}</span>
        <div class="row wrap gap-10">${options}</div>
        ${explanation}
      </div>`;
  }).join('');

  return `
    <div class="card col gap-6" style="padding:30px;">
      <div class="col gap-6" style="padding-bottom:14px;">
        <span class="field-label" style="color:#A85D16;">${esc(v.situation ? v.situation.title : '')}</span>
        <h2 style="margin:0;font-family:'Space Grotesk',system-ui,sans-serif;font-size:21px;color:#14213D;">Add Non-Verbal Communication</h2>
        <p style="margin:0;font-size:14px;color:#6B7280;">Choose how you would deliver this message. Pick one option in each row, then read why it fits or does not fit this situation.</p>
      </div>
      ${categories}
      <div class="row between align-center" style="padding-top:16px;margin-top:8px;border-top:1.5px solid #EEE9DD;">
        <button class="btn btn-ghost" type="button" data-action="goBack">BACK</button>
        <button class="btn btn-primary" type="button" ${v.canStep3 ? '' : 'disabled'} data-action="goNext">NEXT</button>
      </div>
    </div>`;
}

function step4HTML(v) {
  return `
    <div class="card col gap-20" style="padding:30px;">
      <div class="col gap-6">
        <span class="field-label" style="color:#A85D16;">${esc(v.situation ? v.situation.title : '')}</span>
        <h2 style="margin:0;font-family:'Space Grotesk',system-ui,sans-serif;font-size:21px;color:#14213D;">Receiver Reaction</h2>
        <p style="margin:0;font-size:14px;color:#6B7280;">How do you think the receiver will react to your communication?</p>
      </div>
      <div class="col gap-8">
        <label class="field-label" for="receiverGuess">Your prediction</label>
        <textarea id="receiverGuess" class="textarea" rows="4" placeholder="Write what you expect them to think or feel..."></textarea>
        <span id="receiverGuessWarning" class="warning-text ${v.receiverCheck.reason ? '' : 'hidden'}">${esc(v.receiverCheck.reason)}</span>
      </div>
      <div class="col gap-8" style="padding:16px 18px;border-radius:10px;background:#FBF8F1;border:1.5px solid #E4DFD5;">
        <span class="field-label" style="color:#A85D16;">Likely Reaction, Based on Your Choices So Far</span>
        <span id="receiverPreview" style="font-size:14px;color:#374151;line-height:1.55;">${esc(v.receiverPreview)}</span>
      </div>
      <div class="row between align-center divider-top">
        <button class="btn btn-ghost" type="button" data-action="goBack">BACK</button>
        <button id="step4-next-btn" class="btn btn-primary" type="button" ${v.canStep4 ? '' : 'disabled'} data-action="goNext">NEXT</button>
      </div>
    </div>`;
}

function step5HTML(s, v) {
  const sections = s.analysisRun ? `
    <div class="col gap-14">
      ${s.analysisSections.map((sec) => `
        <div class="col gap-6" style="padding:16px 18px;border-radius:10px;background:#FBF8F1;border:1.5px solid #E4DFD5;">
          <span class="field-label">${esc(sec.label)}</span>
          <span style="font-size:14px;color:#374151;line-height:1.55;">${esc(sec.text)}</span>
        </div>`).join('')}
    </div>` : '';

  return `
    <div class="card col gap-20" style="padding:30px;">
      <div class="col gap-6">
        <span class="field-label" style="color:#A85D16;">${esc(v.situation ? v.situation.title : '')}</span>
        <h2 style="margin:0;font-family:'Space Grotesk',system-ui,sans-serif;font-size:21px;color:#14213D;">AI Communication Check</h2>
        <p style="margin:0;font-size:14px;color:#6B7280;">Run a check on your message, tone, body language and voice choices. This looks for patterns, not perfection, and it never gives a score.</p>
      </div>
      <div><button class="btn btn-primary" type="button" style="padding:14px 26px;" data-action="runAnalysis">ANALYZE MY COMMUNICATION</button></div>
      ${sections}
      <div class="row between align-center divider-top">
        <button class="btn btn-ghost" type="button" data-action="goBack">BACK</button>
        <button class="btn btn-primary" type="button" ${v.canStep5 ? '' : 'disabled'} data-action="goNext">NEXT</button>
      </div>
    </div>`;
}

function step6HTML(s, v) {
  const feedback = s.analysisSections.map((sec) => `
    <div class="col gap-4" style="padding:12px 14px;border-radius:8px;background:#FBF8F1;border:1.5px solid #E4DFD5;">
      <span style="font-size:12px;font-weight:700;color:#A85D16;text-transform:uppercase;letter-spacing:.04em;">${esc(sec.label)}</span>
      <span style="font-size:13px;color:#374151;line-height:1.5;">${esc(sec.text)}</span>
    </div>`).join('');

  return `
    <div class="card col gap-20" style="padding:30px;">
      <h2 style="margin:0;font-family:'Space Grotesk',system-ui,sans-serif;font-size:21px;color:#14213D;">Improve Your Message</h2>
      <div class="col gap-8">
        <span class="field-label">MY ORIGINAL MESSAGE</span>
        <div style="padding:14px 16px;border-radius:8px;background:#F4F1E9;border:1.5px solid #E4DFD5;font-size:14px;color:#374151;line-height:1.55;white-space:pre-line;">${esc(s.verbalMessage)}</div>
      </div>
      <div class="col gap-10">
        <span class="field-label">AI FEEDBACK</span>
        ${feedback}
      </div>
      <div class="col gap-8">
        <label class="field-label" for="improvedMessage">MY IMPROVED MESSAGE</label>
        <textarea id="improvedMessage" class="textarea" rows="5" placeholder="Rewrite your message using the feedback above..."></textarea>
        <span id="improvedMessageWarning" class="warning-text ${v.improvedCheck.reason ? '' : 'hidden'}">${esc(v.improvedCheck.reason)}</span>
      </div>
      <div class="row between align-center divider-top">
        <button class="btn btn-ghost" type="button" data-action="goBack">BACK</button>
        <button id="step6-next-btn" class="btn btn-primary" type="button" ${v.canStep6 ? '' : 'disabled'} data-action="goNext">NEXT</button>
      </div>
    </div>`;
}

function step7HTML(s, v) {
  const compareYourMessage = (s.improvedMessage && s.improvedMessage.trim()) || s.verbalMessage;
  const body = s.suggestionRun ? `
    <div class="grid-2">
      <div class="col gap-8" style="padding:16px;border-radius:10px;background:#F4F1E9;border:1.5px solid #E4DFD5;">
        <span class="field-label">YOUR MESSAGE</span>
        <span style="font-size:14px;color:#374151;line-height:1.55;white-space:pre-line;">${esc(compareYourMessage)}</span>
      </div>
      <div class="col gap-8" style="padding:16px;border-radius:10px;background:#EAF2ED;border:1.5px solid #CFE3D6;">
        <span class="field-label" style="color:#274236;">SUGGESTED REWRITE</span>
        <span style="font-size:14px;color:#274236;line-height:1.55;white-space:pre-line;">${esc(s.suggestedRewrite)}</span>
      </div>
    </div>
    <div class="col gap-6" style="padding:14px 16px;border-radius:8px;background:#FBF8F1;border:1.5px solid #E4DFD5;">
      <span class="field-label" style="color:#A85D16;">WHY THIS REWRITE</span>
      <span style="font-size:13px;color:#374151;line-height:1.5;">${esc(s.suggestionRationale)}</span>
    </div>
    <div class="col gap-10 divider-top">
      <span class="field-label">YOUR COMMUNICATION PERSONA (SO FAR)</span>
      <p style="margin:0;font-size:13px;color:#6B7280;">Built from the words, tone and non-verbal choices you have entered across this activity.</p>
      <div class="col gap-6" style="padding:14px 16px;border-radius:8px;background:#FFFFFF;border:1.5px solid #E4DFD5;">
        ${v.personaTraits.map((t) => `
          <div class="row gap-8" style="font-size:13px;color:#374151;line-height:1.5;">
            <span style="font-weight:600;color:#14213D;min-width:130px;">${esc(t.label)}</span>
            <span>${esc(t.value)}</span>
          </div>`).join('')}
      </div>
      <div>
        <button class="btn btn-secondary" type="button" data-action="downloadPersona">DOWNLOAD MY PERSONA (.MD)</button>
        ${s.personaDownloadNote ? `<span style="font-size:12px;color:#6B7280;margin-left:10px;">${esc(s.personaDownloadNote)}</span>` : ''}
      </div>
    </div>` : '';

  return `
    <div class="card col gap-20" style="padding:30px;">
      <div class="col gap-6">
        <span class="field-label" style="color:#A85D16;">${esc(v.situation ? v.situation.title : '')}</span>
        <h2 style="margin:0;font-family:'Space Grotesk',system-ui,sans-serif;font-size:21px;color:#14213D;">Suggested Rewrite &amp; Your Communication Persona</h2>
        <p style="margin:0;font-size:14px;color:#6B7280;">See your message next to a coach-style suggested rewrite for this situation, then build a short persona of how you tend to communicate. This runs entirely from patterns in your own writing &mdash; it never scores you.</p>
      </div>
      <div><button class="btn btn-primary" type="button" style="padding:14px 26px;" data-action="generateSuggestion">GENERATE SUGGESTED REWRITE</button></div>
      ${body}
      <div class="row between align-center divider-top">
        <button class="btn btn-ghost" type="button" data-action="goBack">BACK</button>
        <button class="btn btn-primary" type="button" ${v.canStep7 ? '' : 'disabled'} data-action="goNext">NEXT</button>
      </div>
    </div>`;
}

function step8HTML(s, v) {
  if (!s.cardCreated) {
    return `
      <div class="card col gap-20" style="padding:30px;">
        <h2 style="margin:0;font-family:'Space Grotesk',system-ui,sans-serif;font-size:21px;color:#14213D;">Final Business Communication Card</h2>
        <p style="margin:0;font-size:14px;color:#6B7280;">Before you build your card, reflect on what you learned.</p>
        <div class="col gap-8">
          <label class="field-label" for="learnVerbal">What I learned about verbal communication</label>
          <textarea id="learnVerbal" class="textarea" rows="3" placeholder="Write your reflection..."></textarea>
          <span id="learnVerbalWarning" class="warning-text ${v.learnVerbalCheck.reason ? '' : 'hidden'}">${esc(v.learnVerbalCheck.reason)}</span>
        </div>
        <div class="col gap-8">
          <label class="field-label" for="learnNonverbal">What I learned about non-verbal communication</label>
          <textarea id="learnNonverbal" class="textarea" rows="3" placeholder="Write your reflection..."></textarea>
          <span id="learnNonverbalWarning" class="warning-text ${v.learnNonverbalCheck.reason ? '' : 'hidden'}">${esc(v.learnNonverbalCheck.reason)}</span>
        </div>
        <div class="col gap-8">
          <label class="field-label" for="learnFuture">What I will do differently in future business communication</label>
          <textarea id="learnFuture" class="textarea" rows="3" placeholder="Write your reflection..."></textarea>
          <span id="learnFutureWarning" class="warning-text ${v.learnFutureCheck.reason ? '' : 'hidden'}">${esc(v.learnFutureCheck.reason)}</span>
        </div>
        <div class="row between align-center divider-top">
          <button class="btn btn-ghost" type="button" data-action="goBack">BACK</button>
          <button id="card-btn" class="btn btn-primary" type="button" ${v.canCard ? '' : 'disabled'} data-action="createCard">CREATE MY FINAL CARD</button>
        </div>
      </div>`;
  }

  const nvRows = v.cardNvList.map((nv) => `
    <div class="row between" style="gap:12px;padding:8px 0;border-bottom:1px solid #EEE9DD;">
      <span style="font-size:13px;color:#6B7280;">${esc(nv.label)}</span>
      <span style="font-size:13px;color:#14213D;font-weight:500;">${esc(nv.choice)}</span>
    </div>`).join('');

  const analysisRows = s.analysisSections.map((sec) => `
    <div class="col gap-4" style="padding:10px 12px;border-radius:8px;background:#FBF8F1;border:1.5px solid #E4DFD5;">
      <span style="font-size:11px;font-weight:700;color:#A85D16;text-transform:uppercase;letter-spacing:.04em;">${esc(sec.label)}</span>
      <span style="font-size:13px;color:#374151;line-height:1.5;">${esc(sec.text)}</span>
    </div>`).join('');

  const personaRows = v.personaTraits.map((t) => `
    <div class="row gap-8" style="font-size:13px;color:#374151;line-height:1.5;">
      <span style="font-weight:600;color:#14213D;min-width:130px;">${esc(t.label)}</span>
      <span>${esc(t.value)}</span>
    </div>`).join('');

  return `
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="col gap-4" style="padding:26px 30px;background:#14213D;">
        <span style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#E8B27A;">Business Communication Impact Card</span>
        <span style="font-size:21px;font-weight:700;font-family:'Space Grotesk',system-ui,sans-serif;color:#FFFFFF;">${esc(v.situation ? v.situation.title : '')}</span>
        ${s.studentName ? `<span style="font-size:13px;color:#C7CEDB;">Prepared by ${esc(s.studentName)}</span>` : ''}
      </div>
      <div class="col gap-20" style="padding:26px 30px;">
        <div class="col gap-6">
          <span class="field-label">Original Verbal Message</span>
          <div style="padding:12px 14px;border-radius:8px;background:#F4F1E9;font-size:14px;color:#374151;line-height:1.55;white-space:pre-line;">${esc(s.verbalMessage)}</div>
        </div>
        <div class="grid-3">
          <div class="col gap-4"><span class="field-label">Tone</span><span style="font-size:14px;color:#374151;">${esc(s.tone)}</span></div>
          <div class="col gap-4"><span class="field-label">Word Choice</span><span style="font-size:14px;color:#374151;">${esc(s.wordChoice)}</span></div>
          <div class="col gap-4"><span class="field-label">Clarity</span><span style="font-size:14px;color:#374151;">${esc(s.clarity)}</span></div>
        </div>
        <div class="col gap-8">
          <span class="field-label">Non-Verbal Communication</span>
          <div class="col gap-6">${nvRows}</div>
        </div>
        <div class="col gap-6">
          <span class="field-label">Expected Receiver Reaction</span>
          <div style="padding:12px 14px;border-radius:8px;background:#F4F1E9;font-size:14px;color:#374151;line-height:1.55;white-space:pre-line;">${esc(s.receiverGuess)}</div>
        </div>
        <div class="col gap-10">
          <span class="field-label">AI Feedback</span>
          ${analysisRows}
        </div>
        <div class="col gap-6">
          <span class="field-label">Improved Communication</span>
          <div style="padding:12px 14px;border-radius:8px;background:#EAF2ED;border:1.5px solid #CFE3D6;font-size:14px;color:#274236;line-height:1.55;white-space:pre-line;">${esc(s.improvedMessage)}</div>
        </div>
        ${s.suggestedRewrite ? `
        <div class="col gap-6">
          <span class="field-label">Suggested Rewrite</span>
          <div style="padding:12px 14px;border-radius:8px;background:#FBF8F1;border:1.5px solid #E4DFD5;font-size:14px;color:#374151;line-height:1.55;white-space:pre-line;">${esc(s.suggestedRewrite)}</div>
        </div>` : ''}
        <div class="col gap-6">
          <span class="field-label">Communication Persona</span>
          <div class="col gap-4">${personaRows}</div>
        </div>
        <div class="col gap-10 divider-top">
          <span class="field-label">My Learning</span>
          <div class="col gap-4"><span style="font-size:12px;font-weight:600;color:#6B7280;">What I learned about verbal communication</span><span style="font-size:14px;color:#374151;line-height:1.5;">${esc(s.learnVerbal)}</span></div>
          <div class="col gap-4"><span style="font-size:12px;font-weight:600;color:#6B7280;">What I learned about non-verbal communication</span><span style="font-size:14px;color:#374151;line-height:1.5;">${esc(s.learnNonverbal)}</span></div>
          <div class="col gap-4"><span style="font-size:12px;font-weight:600;color:#6B7280;">What I will do differently in future business communication</span><span style="font-size:14px;color:#374151;line-height:1.5;">${esc(s.learnFuture)}</span></div>
        </div>
      </div>
    </div>
    <div class="row between align-center wrap gap-10" style="padding:6px 2px;">
      <button class="btn btn-ghost" type="button" data-action="editReflections">BACK TO EDIT</button>
      <div class="row gap-10 align-center">
        <button class="btn btn-secondary" type="button" data-action="downloadPersona">DOWNLOAD PERSONA (.MD)</button>
        <button class="btn btn-secondary" type="button" data-action="resetActivity">START NEW ACTIVITY</button>
      </div>
    </div>`;
}

function screenHTML(s, v) {
  switch (s.screen) {
    case 0: return introHTML(s);
    case 1: return step1HTML(v);
    case 2: return step2HTML(v);
    case 3: return step3HTML(v);
    case 4: return step4HTML(v);
    case 5: return step5HTML(s, v);
    case 6: return step6HTML(s, v);
    case 7: return step7HTML(s, v);
    case 8: return step8HTML(s, v);
    default: return '';
  }
}

// ============================================================
// RENDER + BIND
// ============================================================

const appEl = document.getElementById('app');

function render() {
  const v = derive();
  appEl.innerHTML = `
    <div class="page">
      ${topbarHTML(state)}
      <div class="content">
        ${progressHTML(state, v)}
        ${screenHTML(state, v)}
      </div>
    </div>`;
  bindTextFieldsForScreen(v);
}

// Text inputs are bound (and their live value restored) after every
// render, but typing into them updates `state` directly and only
// touches the couple of DOM nodes that need to change — see
// bindTextField() — so the cursor/focus is never lost mid-keystroke.
function bindTextField(id, stateKey, onInput) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = state[stateKey];
  el.addEventListener('input', (e) => {
    state[stateKey] = e.target.value;
    if (onInput) onInput();
  });
}

function setWarning(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('hidden', !text);
}

function setDisabled(id, disabled) {
  const el = document.getElementById(id);
  if (!el) return;
  el.disabled = !!disabled;
}

function bindTextFieldsForScreen(v) {
  switch (state.screen) {
    case 0:
      bindTextField('studentName', 'studentName');
      break;
    case 2: {
      const refreshStep2 = () => {
        const verbalCheck = isCoherentText(state.verbalMessage, 4);
        const canStep2 = verbalCheck.ok && state.tone.trim().length > 0 && state.wordChoice.trim().length > 0 && state.clarity.trim().length > 0;
        setWarning('verbalMessageWarning', verbalCheck.reason);
        setDisabled('step2-next-btn', !canStep2);
      };
      bindTextField('verbalMessage', 'verbalMessage', refreshStep2);
      bindTextField('tone', 'tone', refreshStep2);
      bindTextField('wordChoice', 'wordChoice', refreshStep2);
      bindTextField('clarity', 'clarity', refreshStep2);
      break;
    }
    case 4: {
      const situation = SITUATIONS.find((x) => x.id === state.situationId);
      bindTextField('receiverGuess', 'receiverGuess', () => {
        const receiverCheck = isCoherentText(state.receiverGuess, 3);
        setWarning('receiverGuessWarning', receiverCheck.reason);
        setDisabled('step4-next-btn', !receiverCheck.ok);
        const previewEl = document.getElementById('receiverPreview');
        if (previewEl && situation) previewEl.textContent = buildReceiverPreview(state, situation);
      });
      break;
    }
    case 6:
      bindTextField('improvedMessage', 'improvedMessage', () => {
        const improvedCheck = isCoherentText(state.improvedMessage, 4);
        setWarning('improvedMessageWarning', improvedCheck.reason);
        setDisabled('step6-next-btn', !improvedCheck.ok);
      });
      break;
    case 8:
      if (!state.cardCreated) {
        const refreshCard = () => {
          const lv = isCoherentText(state.learnVerbal, 3);
          const lnv = isCoherentText(state.learnNonverbal, 3);
          const lf = isCoherentText(state.learnFuture, 3);
          setWarning('learnVerbalWarning', lv.reason);
          setWarning('learnNonverbalWarning', lnv.reason);
          setWarning('learnFutureWarning', lf.reason);
          setDisabled('card-btn', !(lv.ok && lnv.ok && lf.ok));
        };
        bindTextField('learnVerbal', 'learnVerbal', refreshCard);
        bindTextField('learnNonverbal', 'learnNonverbal', refreshCard);
        bindTextField('learnFuture', 'learnFuture', refreshCard);
      }
      break;
    default:
      break;
  }
}

// One delegated listener on the (never-replaced) #app container handles
// every button click across every re-render.
appEl.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  switch (action) {
    case 'resetActivity': resetActivity(); break;
    case 'startActivity': startActivity(); break;
    case 'goNext': goNext(); break;
    case 'goBack': goBack(); break;
    case 'selectSituation': selectSituation(el.dataset.id); break;
    case 'pickNonverbal': pickNonverbal(el.dataset.cat, el.dataset.opt); break;
    case 'runAnalysis': runAnalysis(); break;
    case 'generateSuggestion': generateSuggestion(); break;
    case 'downloadPersona': downloadPersona(); break;
    case 'createCard': createCard(); break;
    case 'editReflections': editReflections(); break;
    default: break;
  }
});

render();
