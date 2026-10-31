import { getCodeSparkRosterConfig, setApiHeaders } from "./_security.js";

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET method required." });
  try {
    const config = await getCodeSparkRosterConfig();
    return res.status(200).json({
      success: true,
      activeExamId: config?.activeExamId || null,
      isConcluded: Boolean(config?.isConcluded),
      round1StartTime: config?.round1StartTime || null,
      round1EndTime: config?.round1EndTime || null,
      round2StartTime: config?.round2StartTime || null,
      round2EndTime: config?.round2EndTime || null
    });
  } catch (error) {
    console.error("[CodeSpark public config]", error?.message || "read failed");
    return res.status(503).json({ success: false, error: "CodeSpark configuration is temporarily unavailable." });
  }
}
