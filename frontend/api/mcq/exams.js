import { readBody, setApiHeaders, supabaseRest } from "../codespark/_security.js";

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    // ── GET: Fetch Exams from Supabase using Service Role ──────────────────────
    if (req.method === "GET") {
      const { id } = req.query || {};
      let path = "mcq_exams?order=created_at.desc";
      if (id) {
        path = `mcq_exams?id=eq.${encodeURIComponent(id)}`;
      }
      const rows = await supabaseRest(path);
      return res.status(200).json({
        success: true,
        exams: Array.isArray(rows) ? rows : (rows ? [rows] : [])
      });
    }

    // ── POST: Upsert Exam(s) into Supabase using Service Role ──────────────────
    if (req.method === "POST") {
      const body = readBody(req);
      const incoming = body.exams || (body.exam ? [body.exam] : []);
      if (!Array.isArray(incoming) || incoming.length === 0) {
        return res.status(400).json({ success: false, error: "Exam payload required." });
      }

      const rows = incoming.map((e) => {
        const normalizedStatus = String(e.status || "PUBLISHED").toUpperCase().trim();
        const validStatus = ["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"].includes(normalizedStatus)
          ? normalizedStatus
          : "PUBLISHED";

        return {
          id: String(e.id),
          title: String(e.title || "Untitled Assessment"),
          description: String(e.description || ""),
          instructions: String(e.instructions || ""),
          subject: String(e.subject || ""),
          topic: String(e.topic || ""),
          exam_category: String(e.exam_category || e.examCategory || "Internal Assessment (CIE)"),
          duration_minutes: Math.max(1, Math.round(Number(e.duration_minutes || e.durationMinutes) || 30)),
          start_time: e.start_time || e.startTime ? Number(e.start_time || e.startTime) : null,
          end_time: e.end_time || e.endTime ? Number(e.end_time || e.endTime) : null,
          total_marks: Number(e.total_marks || e.totalMarks) || 0,
          question_count: Math.max(1, Number(e.question_count || e.questionCount) || (Array.isArray(e.question_ids || e.questionIds) ? (e.question_ids || e.questionIds).length : 1)),
          question_ids: Array.isArray(e.question_ids || e.questionIds) ? (e.question_ids || e.questionIds) : [],
          shuffle_questions: Boolean(e.shuffle_questions ?? e.shuffleQuestions ?? true),
          shuffle_options: Boolean(e.shuffle_options ?? e.shuffleOptions ?? true),
          negative_marking_enabled: Boolean(e.negative_marking_enabled ?? e.negativeMarkingEnabled),
          allow_review: Boolean(e.allow_review ?? e.allowReview ?? true),
          show_explanations_after_submit: Boolean(e.show_explanations_after_submit ?? e.showExplanationsAfterSubmit ?? true),
          max_attempts: Math.max(1, Number(e.max_attempts || e.maxAttempts) || 1),
          status: validStatus,
          created_at: Number(e.created_at || e.createdAt) || Date.now(),
          updated_at: Number(e.updated_at || e.updatedAt) || Date.now(),
          created_by: String(e.created_by || e.createdBy || "admin"),
          published_at: e.published_at || e.publishedAt ? Number(e.published_at || e.publishedAt) : null
        };
      });

      await supabaseRest("mcq_exams?on_conflict=id", {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(rows)
      });

      return res.status(200).json({ success: true, count: rows.length });
    }

    // ── DELETE: Remove Exam & Cascade Attempts from Supabase ───────────────────
    if (req.method === "DELETE") {
      const id = (req.query?.id || req.body?.id);
      if (!id) {
        return res.status(400).json({ success: false, error: "Exam ID required for deletion." });
      }

      try {
        await supabaseRest(`mcq_attempts?exam_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
      } catch {}

      await supabaseRest(`mcq_exams?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
      return res.status(200).json({ success: true, deletedId: id });
    }

    return res.status(405).json({ success: false, error: "Method not allowed." });
  } catch (error) {
    console.error("[MCQ Exams API]", error?.message || error);
    return res.status(500).json({ success: false, error: error?.message || "Internal server error." });
  }
}
