import { getRound2AssignedProblems, normalizeRound2Key } from "./_round2-grader.js";
import { readBody, setApiHeaders, supabaseRest } from "./_security.js";

const cleanId = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "_").slice(0, 80);

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "POST method required." });
  let body;
  try { body = readBody(req); } catch { return res.status(400).json({ success: false, error: "Invalid request." }); }
  const key = normalizeRound2Key(body.key);
  const reason = String(body.reason || "").slice(0, 180);
  if (key.length < 8 || !reason) return res.status(400).json({ success: false, error: "Invalid proctor event." });

  try {
    const { candidate } = await getRound2AssignedProblems(key);
    const roll = String(candidate.rollNumber || candidate.email || candidate.name || "candidate").trim();
    const rowId = `r2_station_${cleanId(roll)}`;
    const rows = await supabaseRest(`candidate_stations?id=eq.${rowId}&select=student,station_number`);
    const prior = rows?.[0]?.student && typeof rows[0].student === "object" ? rows[0].student : {};
    const priorCount = Math.max(0, Math.min(100, Number(prior.proctorStrikeCount) || 0));
    const strikeCount = priorCount + 1;
    const events = Array.isArray(prior.proctorEvents) ? prior.proctorEvents.slice(-9) : [];
    events.push({ reason, strike: strikeCount, at: new Date().toISOString() });
    const locked = Boolean(prior.proctorLocked || strikeCount >= 3);
    await supabaseRest("candidate_stations?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{
        id: rowId,
        lab_id: "ROUND_2_ARENA",
        station_number: String(rows?.[0]?.station_number || "Station #01"),
        status: locked ? "LOCKED" : "IN_PROGRESS",
        student: { ...prior, name: candidate.name, rollNumber: candidate.rollNumber || "", email: candidate.email || "", proctorStrikeCount: strikeCount, proctorLocked: locked, proctorEvents: events },
        last_updated_timestamp: Date.now()
      }])
    });
    return res.status(200).json({ success: true, strikeCount, locked });
  } catch (error) {
    console.error("[CodeSpark proctor event]", error?.message || "event failed");
    return res.status(error.statusCode || 503).json({ success: false, error: error.statusCode ? error.message : "Proctor event could not be recorded." });
  }
}
