// Vercel serverless function for POST /api/analyze — see lib/backend.js for
// the actual logic (shared with server.js's local-dev version of this same
// route) and README.md ("Deploying (Vercel)") for why this file needs to
// exist at all: Vercel doesn't run server.js's `http.createServer` as a
// persistent process, only file-based functions under api/.
const { analyzeHandler } = require('../lib/backend');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const result = await analyzeHandler(body);
  res.status(result.status).json(result.body);
};
