// Server-side permanent database erasure using Supabase service-role key
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-authority-role');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Supabase credentials not configured' });
  }

  const headers = {
    'apikey': serviceRoleKey,
    'Authorization': `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json'
  };

  try {
    // 1. Delete all candidate stations (including ghost candidates & system config)
    await fetch(`${supabaseUrl}/rest/v1/candidate_stations?id=not.is.null`, { method: 'DELETE', headers });

    // 2. Delete all MCQ attempts
    await fetch(`${supabaseUrl}/rest/v1/mcq_attempts?id=not.is.null`, { method: 'DELETE', headers });

    // 3. Delete all code submissions
    await fetch(`${supabaseUrl}/rest/v1/code_submissions?id=not.is.null`, { method: 'DELETE', headers });

    // 4. Optionally wipe exams and questions if full wipe requested
    const full = req.query?.full === 'true' || req.body?.full === true;
    if (full) {
      await fetch(`${supabaseUrl}/rest/v1/mcq_questions?id=not.is.null`, { method: 'DELETE', headers });
      await fetch(`${supabaseUrl}/rest/v1/mcq_exams?id=not.is.null`, { method: 'DELETE', headers });
    }

    return res.status(200).json({ success: true, message: 'Database wiped clean successfully' });
  } catch (err) {
    console.error('[Wipe API Error]:', err);
    return res.status(500).json({ error: err.message || 'Wipe failed' });
  }
}
