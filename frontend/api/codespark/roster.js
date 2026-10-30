import { parseCodeSparkConfig, readBody, requireAdmin, setApiHeaders, supabaseRest, invalidateRosterCache } from "./_security.js";

const CONFIG_ID = "codespark_system_config";

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    if (req.method === "GET") {
      const rows = await supabaseRest(`candidate_stations?id=eq.${CONFIG_ID}&select=id,code,student,last_updated_timestamp`);
      let config = parseCodeSparkConfig(rows?.[0]);
      if (!config) {
        const legacy = await supabaseRest(`mcq_exams?id=eq.${CONFIG_ID}&select=instructions`);
        if (legacy?.[0]?.instructions) {
          try { const parsed = JSON.parse(legacy[0].instructions); if (Array.isArray(parsed.candidates)) config = parsed; } catch {}
        }
      }
      return res.status(200).json({ success: true, config });
    }

    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const body = readBody(req);
    const config = body.config;
    if (!config || typeof config !== "object" || !Array.isArray(config.candidates) || config.candidates.length > 10000) {
      return res.status(400).json({ success: false, error: "Invalid CodeSpark roster configuration." });
    }
    const payload = { ...config, updatedAt: Date.now() };

    // Dual-write: write to candidate_stations table
    await supabaseRest("candidate_stations?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{
        id: CONFIG_ID, lab_id: "SYSTEM_CONFIG", station_number: "CONFIG",
        status: "CONFIG", code: JSON.stringify(payload), student: payload,
        last_updated_timestamp: Date.now()
      }])
    });

    // Dual-write: also write to mcq_exams table for maximum redundancy
    try {
      await supabaseRest("mcq_exams?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([{
          id: CONFIG_ID,
          title: "CodeSpark System Configuration",
          description: "CodeSpark System Configuration Roster",
          instructions: JSON.stringify(payload),
          status: "PUBLISHED",
          created_at: Date.now(),
          updated_at: Date.now()
        }])
      });
    } catch {}

    invalidateRosterCache();
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[CodeSpark roster API]", error?.message || "storage error");
    return res.status(503).json({ success: false, error: "Roster storage is temporarily unavailable." });
  }
}
