import { normalizeRound2Key } from "./_round2-grader.js";
import { getCodeSparkRosterConfig, readBody, setApiHeaders, supabaseRest } from "./_security.js";

const cleanId = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "_").slice(0, 80);

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  let key = "";
  if (req.method === "GET") {
    key = normalizeRound2Key(req.query?.key);
  } else if (req.method === "POST") {
    try {
      const body = readBody(req);
      key = normalizeRound2Key(body?.key);
    } catch {
      return res.status(400).json({ success: false, error: "Invalid JSON request." });
    }
  } else {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  if (!key || key.length < 4) {
    return res.status(400).json({ success: false, error: "Valid Round 2 key required." });
  }

  try {
    const roster = await getCodeSparkRosterConfig();
    const candidate = roster?.candidates?.find(
      (item) => item.round2Key && normalizeRound2Key(item.round2Key) === key
    );

    if (!candidate) {
      return res.status(404).json({ success: false, error: "Candidate not found in roster." });
    }

    const roll = String(candidate.rollNumber || candidate.email || candidate.name || "candidate").trim();
    const rowId = `r2_station_${cleanId(roll)}`;
    const rows = await supabaseRest(`candidate_stations?id=eq.${rowId}&select=student,status`);
    const student = rows?.[0]?.student || {};
    const isLocked = Boolean(student.proctorLocked === true || rows?.[0]?.status === "LOCKED");

    return res.status(200).json({
      success: true,
      strikeCount: Number(student.proctorStrikeCount) || 0,
      locked: isLocked,
      candidate: {
        name: candidate.name,
        rollNumber: candidate.rollNumber
      }
    });
  } catch (error) {
    console.error("[CodeSpark proctor status]", error?.message || error);
    return res.status(500).json({ success: false, error: "Unable to retrieve proctor status." });
  }
}
