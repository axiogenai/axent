import { getCodeSparkRosterConfig, setApiHeaders, supabaseRest } from "./_security.js";

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "GET method required." });
  try {
    const config = await getCodeSparkRosterConfig();
    if (!config?.activeExamId) return res.status(404).json({ success: false, error: "No active CodeSpark paper is configured." });
    const rows = await supabaseRest(`mcq_exams?id=eq.${encodeURIComponent(config.activeExamId)}&select=id,title,description,instructions,subject,topic,exam_category,duration_minutes,start_time,end_time,total_marks,question_count,question_ids,shuffle_questions,shuffle_options,negative_marking_enabled,allow_review,show_explanations_after_submit,max_attempts,status,created_at,updated_at,created_by`);
    if (!rows?.[0]) return res.status(404).json({ success: false, error: "The active CodeSpark paper is unavailable." });
    return res.status(200).json({ success: true, exam: rows[0] });
  } catch (error) {
    console.error("[CodeSpark public exam]", error?.message || "read failed");
    return res.status(503).json({ success: false, error: "Active exam is temporarily unavailable." });
  }
}
