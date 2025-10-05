import { ensureMongoConnection, supabase, imapManager } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const mongoDb = await ensureMongoConnection();
    const mongoStatus = mongoDb ? "connected" : "disconnected";

    const { data: supabaseData, error: supabaseError } = await supabase
      .from('emails')
      .select('count')
      .limit(1)
      .single();

    const supabaseStatus = supabaseError ? "disconnected" : "connected";

    let imapStatus = "disconnected";
    try {
      const imapAlive = await imapManager.checkConnection();
      imapStatus = imapAlive ? "connected" : "disconnected";
    } catch (imapErr) {
      imapStatus = "error";
    }

    res.json({
      status: "ok",
      services: {
        mongodb: mongoStatus,
        supabase: supabaseStatus,
        imap: imapStatus
      },
      cache: {
        keys: 0 // Cache not shared between functions
      },
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error.message
    });
  }
}