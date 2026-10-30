import { parseCodeSparkConfig, readBody, requireAdmin, setApiHeaders, supabaseRest, invalidateRosterCache, getCodeSparkRosterConfig } from "./_security.js";

const CONFIG_ID = "codespark_system_config";

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed." });
  }

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

    // Require admin or paper setter authority for POST and DELETE
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    if (req.method === "DELETE") {
      const action = req.query?.action || "purge_all";
      const roll = req.query?.roll || req.query?.key || "";

      if (action === "reset_all" || action === "purge_all" || action === "purge_attempts") {
        // 1. Permanently wipe all rows from mcq_attempts using service role
        try {
          await supabaseRest("mcq_attempts?id=neq.none", { method: "DELETE" });
        } catch (e) {
          console.warn("[roster DELETE attempts]", e?.message);
        }

        // 2. Permanently delete all student station records
        try {
          await supabaseRest(`candidate_stations?id=neq.${CONFIG_ID}`, { method: "DELETE" });
        } catch (e) {
          console.warn("[roster DELETE stations]", e?.message);
        }

        // 3. Clear round 2 finalizations
        try {
          await supabaseRest("codespark_round2_finalizations?id=neq.none", { method: "DELETE" });
        } catch {}

        // 4. Reset system config in candidate_stations and mcq_exams
        try {
          const cfg = await getCodeSparkRosterConfig(true).catch(() => null);
          const cleanCfg = {
            ...(cfg || {}),
            attempts: [],
            isConcluded: false,
            manualShortlistRolls: [],
            candidates: action === "reset_all" ? [] : ((cfg && cfg.candidates) ? cfg.candidates.map(c => ({
              ...c,
              status: "REGISTERED",
              round1Score: undefined,
              round1MaxScore: undefined,
              isShortlisted: false,
              round2Key: undefined
            })) : []),
            updatedAt: Date.now()
          };

          await supabaseRest("candidate_stations?on_conflict=id", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify([{
              id: CONFIG_ID, lab_id: "SYSTEM_CONFIG", station_number: "CONFIG",
              status: "CONFIG", code: JSON.stringify(cleanCfg), student: cleanCfg,
              last_updated_timestamp: Date.now()
            }])
          });

          await supabaseRest("mcq_exams?on_conflict=id", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify([{
              id: CONFIG_ID,
              title: "CodeSpark System Configuration",
              instructions: JSON.stringify(cleanCfg),
              status: "PUBLISHED",
              updated_at: Date.now()
            }])
          });
        } catch (errCfg) {
          console.warn("[roster DELETE config reset]", errCfg?.message);
        }

        invalidateRosterCache();
        return res.status(200).json({ success: true, message: "Database wiped and system reset back to Round 1." });
      }

      if (action === "delete_candidate" && roll) {
        const clean = String(roll).trim().toUpperCase();
        try {
          await supabaseRest(`mcq_attempts?student_roll=ilike.*${encodeURIComponent(clean)}*`, { method: "DELETE" });
        } catch {}
        try {
          await supabaseRest(`candidate_stations?student_name=ilike.*${encodeURIComponent(clean)}*`, { method: "DELETE" });
        } catch {}
        try {
          await supabaseRest(`candidate_stations?roll_number=eq.${encodeURIComponent(clean)}`, { method: "DELETE" });
        } catch {}

        invalidateRosterCache();
        return res.status(200).json({ success: true, message: `Candidate ${clean} deleted from cloud.` });
      }

      return res.status(400).json({ success: false, error: "Unknown delete action." });
    }

    // POST: Save roster configuration
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
