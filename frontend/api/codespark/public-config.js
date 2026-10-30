import { parseCodeSparkConfig, setApiHeaders, supabaseRest } from "./_security.js";

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET method required." });
  try {
    const rows = await supabaseRest("candidate_stations?id=eq.codespark_system_config&select=code,student");
    const config = parseCodeSparkConfig(rows?.[0]);
    return res.status(200).json({ success: true, activeExamId: config?.activeExamId || null });
  } catch (error) {
    console.error("[CodeSpark public config]", error?.message || "read failed");
    return res.status(503).json({ success: false, error: "CodeSpark configuration is temporarily unavailable." });
  }
}
