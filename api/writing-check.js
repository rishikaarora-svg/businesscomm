// Vercel serverless function for POST /api/writing-check — see
// api/analyze.js and lib/backend.js for context.
//
// On Vercel this will always resolve to { skip: true }: SlopTotal is a
// separate local-only Python process (see README.md), and there is no
// localhost:8000 to reach from inside a Vercel function. That is the
// correct, intended behavior, not a bug — the writing-check nudge is a
// local-classroom-server-only feature by design.
const { writingCheckHandler } = require('../lib/backend');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const result = await writingCheckHandler(body);
  res.status(result.status).json(result.body);
};
