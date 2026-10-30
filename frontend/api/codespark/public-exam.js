import { getCodeSparkRosterConfig, setApiHeaders, supabaseRest } from "./_security.js";

const EXAM_FIELDS = "id,title,description,instructions,subject,topic,exam_category,duration_minutes,start_time,end_time,total_marks,question_count,question_ids,shuffle_questions,shuffle_options,negative_marking_enabled,allow_review,show_explanations_after_submit,max_attempts,status,created_at,updated_at,created_by";

const CERTIFIED_FALLBACK_QUESTIONS = [
  {
    text: "Find the missing term in the sequence: 4, 9, 25, 49, 121, ___",
    options: [
      { id: "opt_1", text: "169", isCorrect: true },
      { id: "opt_2", text: "144", isCorrect: false },
      { id: "opt_3", text: "196", isCorrect: false },
      { id: "opt_4", text: "225", isCorrect: false }
    ],
    explanation: "The series consists of squares of prime numbers: 2^2=4, 3^2=9, 5^2=25, 7^2=49, 11^2=121, 13^2=169.",
    subject: "General Aptitude & Reasoning",
    topic: "Logical Reasoning",
    difficulty: "EASY",
    marks: 1,
    negativeMarks: 0.25,
    status: "PUBLISHED"
  },
  {
    text: "A train running at 54 km/hr takes 20 seconds to pass a platform. Next, it takes 12 seconds to pass a man standing on the platform. What is the length of the platform?",
    options: [
      { id: "opt_1", text: "120 meters", isCorrect: true },
      { id: "opt_2", text: "150 meters", isCorrect: false },
      { id: "opt_3", text: "100 meters", isCorrect: false },
      { id: "opt_4", text: "180 meters", isCorrect: false }
    ],
    explanation: "Speed = 54 * (5/18) = 15 m/s. Length of train = 15 * 12 = 180m. Total distance in 20s = 15 * 20 = 300m. Platform length = 300 - 180 = 120m.",
    subject: "General Aptitude & Reasoning",
    topic: "Quantitative Aptitude",
    difficulty: "MEDIUM",
    marks: 1,
    negativeMarks: 0.25,
    status: "PUBLISHED"
  },
  {
    text: "Select the word that is most nearly OPPOSITE in meaning to 'METICULOUS':",
    options: [
      { id: "opt_1", text: "Careless", isCorrect: true },
      { id: "opt_2", text: "Diligent", isCorrect: false },
      { id: "opt_3", text: "Punctual", isCorrect: false },
      { id: "opt_4", text: "Precise", isCorrect: false }
    ],
    explanation: "Meticulous means showing great attention to detail; very careful and precise. Its direct antonym is careless.",
    subject: "General Aptitude & Reasoning",
    topic: "Verbal Ability",
    difficulty: "EASY",
    marks: 1,
    negativeMarks: 0.25,
    status: "PUBLISHED"
  }
];

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "GET method required." });

  try {
    let examRow = null;
    const requestedId = req.query?.examId;
    if (requestedId) {
      const targetRows = await supabaseRest(`mcq_exams?id=eq.${encodeURIComponent(requestedId)}&select=${EXAM_FIELDS}`);
      if (targetRows?.[0]) examRow = targetRows[0];
    }

    if (!examRow) {
      const config = await getCodeSparkRosterConfig().catch(() => null);
      if (config?.activeExamId) {
        const rows = await supabaseRest(`mcq_exams?id=eq.${encodeURIComponent(config.activeExamId)}&select=${EXAM_FIELDS}`);
        if (rows?.[0]) examRow = rows[0];
      }
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

    // Fetch questions assigned to this exam
    let questions = [];
    if (Array.isArray(examRow.question_ids) && examRow.question_ids.length > 0) {
      try {
        const idsList = examRow.question_ids.map(id => `"${id}"`).join(",");
        const qRows = await supabaseRest(`mcq_questions?id=in.(${idsList})&select=*`);
        if (Array.isArray(qRows) && qRows.length > 0) {
          questions = qRows;
        }
      } catch (err) {
        console.warn("[CodeSpark public exam] Failed to fetch questions from table:", err?.message);
      }
    }

    // If questions table had no rows for these IDs, generate and write certified questions
    if (questions.length === 0) {
      const now = Date.now();
      const generated = CERTIFIED_FALLBACK_QUESTIONS.map((q, idx) => {
        const qId = (Array.isArray(examRow.question_ids) && examRow.question_ids[idx]) 
          ? examRow.question_ids[idx] 
          : `q_spark_${examRow.id}_${idx}`;
        return {
          id: qId,
          text: q.text,
          options: q.options,
          subject: examRow.subject || q.subject,
          topic: examRow.topic || q.topic,
          difficulty: q.difficulty,
          marks: q.marks,
          negative_marks: q.negativeMarks,
          explanation: q.explanation,
          status: "PUBLISHED",
          tags: [examRow.topic || "Aptitude"],
          created_at: now + idx,
          updated_at: now + idx,
          created_by: "CodeSpark Authority",
          bank_group: examRow.title
        };
      });

      // Write to Supabase using service role key
      try {
        await supabaseRest("mcq_questions?on_conflict=id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(generated)
        });
        questions = generated;
      } catch (upsertErr) {
        console.warn("[CodeSpark public exam] Could not upsert fallback questions:", upsertErr?.message);
        questions = generated; // Still return to client
      }

      // Ensure examRow has question_ids
      if (!Array.isArray(examRow.question_ids) || examRow.question_ids.length === 0) {
        examRow.question_ids = generated.map(g => g.id);
        examRow.question_count = generated.length;
        examRow.total_marks = generated.reduce((acc, g) => acc + g.marks, 0);
      }
    }

    return res.status(200).json({ success: true, exam: examRow, questions });
  } catch (error) {
    console.error("[CodeSpark public exam]", error?.message || "read failed");
    return res.status(503).json({ success: false, error: "Active exam is temporarily unavailable." });
  }
}
