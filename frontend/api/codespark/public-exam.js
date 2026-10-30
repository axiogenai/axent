import { getCodeSparkRosterConfig, setApiHeaders, supabaseRest } from "./_security.js";

const EXAM_FIELDS = "id,title,description,instructions,subject,topic,exam_category,duration_minutes,start_time,end_time,total_marks,question_count,question_ids,shuffle_questions,shuffle_options,negative_marking_enabled,allow_review,show_explanations_after_submit,max_attempts,status,created_at,updated_at,created_by";

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "GET method required." });

  try {
    let examRow = null;
    const config = await getCodeSparkRosterConfig().catch(() => null);

    // 1. Try explicit activeExamId if configured
    if (config?.activeExamId) {
      const rows = await supabaseRest(`mcq_exams?id=eq.${encodeURIComponent(config.activeExamId)}&select=${EXAM_FIELDS}`);
      if (rows?.[0]) examRow = rows[0];
    }

    // 2. Fallback: Find the latest PUBLISHED exam
    if (!examRow) {
      const published = await supabaseRest(`mcq_exams?status=eq.PUBLISHED&id=neq.codespark_system_config&order=created_at.desc&limit=1&select=${EXAM_FIELDS}`);
      if (published?.[0]) examRow = published[0];
    }

    // 3. Fallback: Find any active non-archived exam
    if (!examRow) {
      const anyExam = await supabaseRest(`mcq_exams?status=neq.ARCHIVED&id=neq.codespark_system_config&order=created_at.desc&limit=1&select=${EXAM_FIELDS}`);
      if (anyExam?.[0]) examRow = anyExam[0];
    }

    if (!examRow) {
      return res.status(404).json({ success: false, error: "No examination paper is currently available." });
    }

    return res.status(200).json({ success: true, exam: examRow });
  } catch (error) {
    console.error("[CodeSpark public exam]", error?.message || "read failed");
    return res.status(503).json({ success: false, error: "Active exam is temporarily unavailable." });
  }
}
