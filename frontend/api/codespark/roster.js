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

    // Public key consumption endpoint when candidate finishes Round 1
    if (req.method === "POST" && (req.query?.action === "consume_key" || req.body?.action === "consume_key")) {
      const body = readBody(req);
      const keyToConsume = String(body.key || body.accessKey || "").trim().toUpperCase();
      const rollToConsume = String(body.rollNumber || body.roll || "").trim().toUpperCase();
      if (!keyToConsume && !rollToConsume) {
        return res.status(400).json({ success: false, error: "Access key or roll number required." });
      }

      try {
        const cfg = await getCodeSparkRosterConfig(true).catch(() => null);
        if (cfg) {
          const usedKeys = new Set(Array.isArray(cfg.usedAccessKeys) ? cfg.usedAccessKeys : []);
          if (keyToConsume) usedKeys.add(keyToConsume);

          const updatedCandidates = Array.isArray(cfg.candidates) ? cfg.candidates.map((c) => {
            const matchKey = keyToConsume && (String(c.accessKey || "").trim().toUpperCase() === keyToConsume);
            const matchRoll = rollToConsume && (String(c.rollNumber || "").trim().toUpperCase() === rollToConsume);
            if (matchKey || matchRoll) {
              if (c.accessKey) usedKeys.add(String(c.accessKey).trim().toUpperCase());
              return { ...c, status: "SUBMITTED" };
            }
            return c;
          }) : [];

          const updatedConfig = {
            ...cfg,
            candidates: updatedCandidates,
            usedAccessKeys: Array.from(usedKeys),
            updatedAt: Date.now()
          };

          await supabaseRest("candidate_stations?on_conflict=id", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify([{
              id: CONFIG_ID, lab_id: "SYSTEM_CONFIG", station_number: "CONFIG",
              status: "CONFIG", code: JSON.stringify(updatedConfig), student: updatedConfig,
              last_updated_timestamp: Date.now()
            }])
          });

          invalidateRosterCache();
        }
      } catch (e) {
        console.warn("[roster consume_key]", e?.message);
      }
      return res.status(200).json({ success: true, message: "Access key consumed and invalidated." });
    }

    // Require admin or paper setter authority for other POST and DELETE actions
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    if (req.method === "DELETE") {
      const action = req.query?.action || "purge_all";
      const roll = req.query?.roll || req.query?.key || "";

      // ── FACTORY RESET: Complete Database Erasure (Exams, Questions, Attempts, Stations, Submissions) ──
      if (action === "factory_reset_all_database" || action === "wipe_entire_database") {
        try {
          // 1. Delete all attempts
          await supabaseRest("mcq_attempts?id=not.is.null", { method: "DELETE" });
        } catch (e) { console.warn("[roster factory wipe attempts]", e?.message); }

        try {
          // 2. Delete all questions
          await supabaseRest("mcq_questions?id=not.is.null", { method: "DELETE" });
        } catch (e) { console.warn("[roster factory wipe questions]", e?.message); }

        try {
          // 3. Delete all exams
          await supabaseRest("mcq_exams?id=not.is.null", { method: "DELETE" });
        } catch (e) { console.warn("[roster factory wipe exams]", e?.message); }

        try {
          // 4. Delete all round 2 finalizations
          await supabaseRest("codespark_round2_finalizations?station_id=not.is.null", { method: "DELETE" });
        } catch (e) { console.warn("[roster factory wipe r2]", e?.message); }

        try {
          // 5. Delete all code submissions
          await supabaseRest("code_submissions?id=not.is.null", { method: "DELETE" });
        } catch {}

        try {
          // 6. Delete all candidate stations
          await supabaseRest("candidate_stations?id=not.is.null", { method: "DELETE" });
        } catch (e) { console.warn("[roster factory wipe stations]", e?.message); }

        // 7. Seed blank initial configuration
        const pristineConfig = {
          updatedAt: Date.now(),
          candidates: [],
          attempts: [],
          usedAccessKeys: [],
          manualShortlistRolls: [],
          isConcluded: false,
          activeExamId: null
        };

        try {
          await supabaseRest("candidate_stations", {
            method: "POST",
            body: JSON.stringify([{
              id: CONFIG_ID, lab_id: "SYSTEM_CONFIG", station_number: "CONFIG",
              status: "CONFIG", code: JSON.stringify(pristineConfig), student: pristineConfig,
              last_updated_timestamp: Date.now()
            }])
          });
        } catch (e) { console.warn("[roster factory seed config]", e?.message); }

        invalidateRosterCache();
        return res.status(200).json({
          success: true,
          message: "Entire cloud database successfully wiped clean (all exams, questions, attempts, stations, and submissions permanently deleted)."
        });
      }

      // ── Standard Attempt / Wall Purge (Preserves Questions and Exams) ──
      if (action === "reset_all" || action === "purge_all" || action === "purge_attempts") {
        // 1. Permanently wipe all rows from mcq_attempts using service role
        try {
          await supabaseRest("mcq_attempts?id=not.is.null", { method: "DELETE" });
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
          await supabaseRest("codespark_round2_finalizations?station_id=not.is.null", { method: "DELETE" });
        } catch {}

        // 4. Reset system config in candidate_stations (preserves active exam & questions)
        try {
          const cfg = await getCodeSparkRosterConfig(true).catch(() => null);
          const cleanCfg = {
            ...(cfg || {}),
            attempts: [],
            isConcluded: false,
            usedAccessKeys: [],
            manualShortlistRolls: [],
            candidates: (req.query?.wipe_candidates === "true" || action === "wipe_all_candidates") ? [] : ((cfg && cfg.candidates) ? cfg.candidates.map(c => ({
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
        } catch (errCfg) {
          console.warn("[roster DELETE config reset]", errCfg?.message);
        }

        invalidateRosterCache();
        return res.status(200).json({ success: true, message: "Workstations and attempts wiped clean." });
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

    // Write to candidate_stations table
    await supabaseRest("candidate_stations?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{
        id: CONFIG_ID, lab_id: "SYSTEM_CONFIG", station_number: "CONFIG",
        status: "CONFIG", code: JSON.stringify(payload), student: payload,
        last_updated_timestamp: Date.now()
      }])
    });

    invalidateRosterCache();
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[CodeSpark roster API]", error?.message || "storage error");
    return res.status(503).json({ success: false, error: "Roster storage is temporarily unavailable." });
  }
}
