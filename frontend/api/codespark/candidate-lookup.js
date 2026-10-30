import { parseCodeSparkConfig, readBody, setApiHeaders, supabaseRest } from "./_security.js";

const CONFIG_ID = "codespark_system_config";
const normalize = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "").replace(/^(AXENT-R2-|AXENT-|R2-)/, "");

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "POST method required." });
  let body;
  try { body = readBody(req); } catch { return res.status(400).json({ success: false, error: "Invalid request." }); }
  const entered = normalize(body.key);
  if (entered.length < 4 || entered.length > 64) return res.status(400).json({ success: false, error: "Enter a valid access key." });

  try {
    const rows = await supabaseRest(`candidate_stations?id=eq.${CONFIG_ID}&select=code,student`);
    const config = parseCodeSparkConfig(rows?.[0]);
    if (!config || !Array.isArray(config.candidates)) return res.status(503).json({ success: false, error: "Candidate roster is unavailable." });

    const candidate = config.candidates.find((item) => {
      const r1 = normalize(item?.accessKey);
      const r2 = normalize(item?.round2Key);
      return entered === r1 || (r2 && entered === r2);
    });
    if (!candidate) return res.status(404).json({ success: false, error: "Access key not recognized." });

    const isRound2 = Boolean(candidate.round2Key && entered === normalize(candidate.round2Key));
    const shortlisted = Boolean(candidate.isShortlisted || candidate.status === "SHORTLISTED" || candidate.round2Key);
    if (isRound2 && entered.length < 8) {
      return res.status(403).json({ success: false, error: "This Round 2 key is outdated. Ask the administrator to issue a new secure access key." });
    }
    if (isRound2 && !shortlisted) return res.status(403).json({ success: false, error: "Candidate is not shortlisted." });

    const safeCandidate = {
      id: candidate.id,
      name: candidate.name,
      fullName: candidate.fullName,
      rollNumber: candidate.rollNumber,
      email: candidate.email,
      department: candidate.department,
      status: candidate.status,
      isShortlisted: shortlisted,
      accessKey: isRound2 ? candidate.round2Key : candidate.accessKey,
      ...(isRound2 ? { round2Key: candidate.round2Key } : {})
    };
    return res.status(200).json({ success: true, candidate: safeCandidate, targetRound: isRound2 ? "round2" : "round1", isShortlisted: shortlisted });
  } catch (error) {
    console.error("[CodeSpark candidate lookup]", error?.message || "lookup failed");
    return res.status(503).json({ success: false, error: "Candidate verification is temporarily unavailable." });
  }
}
