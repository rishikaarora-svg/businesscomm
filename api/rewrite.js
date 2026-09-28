// Vercel serverless function for POST /api/rewrite — see api/analyze.js and
// lib/backend.js for context.
const { rewriteHandler } = require('../lib/backend');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const result = await rewriteHandler(body);
  res.status(result.status).json(result.body);
};
