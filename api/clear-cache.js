import { clearCache } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cacheSize = 0; // Cache not shared between functions
  clearCache();
  res.json({
    success: true,
    message: `Cleared ${cacheSize} cache entries`
  });
}