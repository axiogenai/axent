import { readBody, setApiHeaders, supabaseRest } from "../codespark/_security.js";

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    // ── GET: Fetch Questions from Supabase using Service Role ──────────────────
    if (req.method === "GET") {
      const { id, subject } = req.query || {};
      let path = "mcq_questions?order=created_at.desc";
      if (id) {
        path = `mcq_questions?id=eq.${encodeURIComponent(id)}`;
      } else if (subject) {
        path = `mcq_questions?subject=eq.${encodeURIComponent(subject)}&order=created_at.desc`;
      }
      const rows = await supabaseRest(path);
      return res.status(200).json({
        success: true,
        questions: Array.isArray(rows) ? rows : (rows ? [rows] : [])
      });
    }

    // ── POST: Upsert Question(s) into Supabase using Service Role ──────────────
    if (req.method === "POST") {
      const body = readBody(req);
      const incoming = body.questions || (body.question ? [body.question] : []);
      if (!Array.isArray(incoming) || incoming.length === 0) {
        return res.status(400).json({ success: false, error: "Question payload required." });
      }

      const rows = incoming.map((q) => {
        const normalizedDiff = String(q.difficulty || "MEDIUM").toUpperCase().trim();
        const validDiff = ["EASY", "MEDIUM", "HARD"].includes(normalizedDiff) ? normalizedDiff : "MEDIUM";

        let normalizedStatus = String(q.status || "PUBLISHED").toUpperCase().trim();
        if (normalizedStatus === "ACTIVE") normalizedStatus = "PUBLISHED";
        const validStatus = ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(normalizedStatus)
          ? normalizedStatus
          : "PUBLISHED";

        return {
          id: String(q.id),
          text: String(q.text || ""),
          options: Array.isArray(q.options) ? q.options : [],
          subject: String(q.subject || "General"),
          topic: String(q.topic || "General"),
          difficulty: validDiff,
          marks: Number(q.marks) || 1,
          negative_marks: Number(q.negative_marks ?? q.negativeMarks) || 0,
          explanation: String(q.explanation || ""),
          status: validStatus,
          tags: Array.isArray(q.tags) ? q.tags : [],
          created_at: Number(q.created_at || q.createdAt) || Date.now(),
          updated_at: Number(q.updated_at || q.updatedAt) || Date.now(),
          created_by: String(q.created_by || q.createdBy || "admin"),
          bank_group: String(q.bank_group || q.bankGroup || "")
        };
      });

      await supabaseRest("mcq_questions?on_conflict=id", {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(rows)
      });

      return res.status(200).json({ success: true, count: rows.length });
    }

    // ── DELETE: Remove Question(s) from Supabase ───────────────────────────────
    if (req.method === "DELETE") {
      const id = req.query?.id || req.body?.id;
      const ids = req.body?.ids || (id ? [id] : []);
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: "Question ID(s) required for deletion." });
      }

      for (const qid of ids) {
        await supabaseRest(`mcq_questions?id=eq.${encodeURIComponent(qid)}`, { method: "DELETE" });
      }

      return res.status(200).json({ success: true, deletedCount: ids.length });
    }

    return res.status(405).json({ success: false, error: "Method not allowed." });
  } catch (error) {
    console.error("[MCQ Questions API]", error?.message || error);
    return res.status(500).json({ success: false, error: error?.message || "Internal server error." });
  }
}
