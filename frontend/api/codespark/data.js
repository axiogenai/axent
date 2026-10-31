import { getSupabaseAdmin, setApiHeaders, requireAdmin, readBody, invalidateRosterCache } from "./_security.js";

const CONFIG_ID = "codespark_system_config";

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const adminSb = getSupabaseAdmin();

  // ── GET REQUESTS: CLOUD-AS-SOURCE-OF-TRUTH DATA ACCESS ──
  if (req.method === "GET") {
    const entity = req.query?.entity || "all";
    try {
      if (entity === "exams") {
        const { data, error } = await adminSb
          .from("mcq_exams")
          .select("*")
          .neq("id", CONFIG_ID)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return res.status(200).json({ success: true, exams: data || [] });
      }

      if (entity === "questions") {
        const examId = req.query?.examId;
        let query = adminSb.from("mcq_questions").select("*");
        if (examId) {
          const { data: ex } = await adminSb.from("mcq_exams").select("question_ids").eq("id", examId).maybeSingle();
          const qIds = Array.isArray(ex?.question_ids) ? ex.question_ids : [];
          if (qIds.length > 0) {
            query = query.in("id", qIds);
          } else {
            return res.status(200).json({ success: true, questions: [] });
          }
        }
        const { data, error } = await query;
        if (error) throw error;
        return res.status(200).json({ success: true, questions: data || [] });
      }

      if (entity === "attempts") {
        const examId = req.query?.examId;
        let query = adminSb.from("mcq_attempts").select("*").order("start_time", { ascending: false });
        if (examId) query = query.eq("exam_id", examId);
        const { data, error } = await query;
        if (error) throw error;
        return res.status(200).json({ success: true, attempts: data || [] });
      }

      if (entity === "stations") {
        const { data, error } = await adminSb
          .from("candidate_stations")
          .select("*")
          .neq("id", CONFIG_ID);
        if (error) throw error;
        return res.status(200).json({ success: true, stations: data || [] });
      }

      // Default: fetch unified state in one single payload
      const [examsRes, questionsRes, attemptsRes, stationsRes, configRes] = await Promise.all([
        adminSb.from("mcq_exams").select("*").neq("id", CONFIG_ID).order("created_at", { ascending: false }),
        adminSb.from("mcq_questions").select("*"),
        adminSb.from("mcq_attempts").select("*").order("start_time", { ascending: false }),
        adminSb.from("candidate_stations").select("*").neq("id", CONFIG_ID),
        adminSb.from("candidate_stations").select("*").eq("id", CONFIG_ID).maybeSingle()
      ]);

      let config = null;
      if (configRes.data) {
        config = configRes.data.student || null;
        if (!config && configRes.data.code) {
          try { config = JSON.parse(configRes.data.code); } catch {}
        }
      }

      return res.status(200).json({
        success: true,
        exams: examsRes.data || [],
        questions: questionsRes.data || [],
        attempts: attemptsRes.data || [],
        stations: stationsRes.data || [],
        config
      });
    } catch (err) {
      console.error("[data.js GET error]", err);
      return res.status(500).json({ success: false, error: err.message || "Failed to fetch cloud data" });
    }
  }

  // ── POST / DELETE MUTATIONS ──
  if (req.method === "POST" || req.method === "DELETE") {
    let body = {};
    try { body = readBody(req); } catch {}
    const action = req.query?.action || body.action || (req.method === "DELETE" ? "wipe_everything" : "");

    // ── 1. WIPE EVERYTHING: Factory Reset Cloud Database ──
    if (action === "wipe_everything" || action === "factory_reset_all_database") {
      try {
        await Promise.allSettled([
          adminSb.from("mcq_attempts").delete().neq("id", "___NONE___"),
          adminSb.from("mcq_questions").delete().neq("id", "___NONE___"),
          adminSb.from("mcq_exams").delete().neq("id", "___NONE___"),
          adminSb.from("candidate_stations").delete().neq("id", "___NONE___"),
          adminSb.from("codespark_round2_finalizations").delete().neq("station_id", "___NONE___"),
          adminSb.from("code_submissions").delete().neq("id", "___NONE___")
        ]);

        // Reset pristine empty config
        const pristineConfig = {
          updatedAt: Date.now(),
          candidates: [],
          attempts: [],
          usedAccessKeys: [],
          manualShortlistRolls: [],
          isConcluded: false,
          activeExamId: null
        };

        await adminSb.from("candidate_stations").upsert([{
          id: CONFIG_ID,
          lab_id: "SYSTEM_CONFIG",
          station_number: "CONFIG",
          status: "CONFIG",
          code: JSON.stringify(pristineConfig),
          student: pristineConfig,
          last_updated_timestamp: Date.now()
        }]);

        invalidateRosterCache();
        return res.status(200).json({
          success: true,
          message: "Entire cloud database successfully wiped clean (all exams, questions, attempts, stations, and submissions permanently deleted)."
        });
      } catch (err) {
        console.error("[data.js wipe error]", err);
        return res.status(500).json({ success: false, error: err.message || "Failed to wipe database" });
      }
    }

    // ── 2. PURGE ATTEMPTS & RESET WALL (Preserves exams and questions) ──
    if (action === "purge_attempts" || action === "purge_all" || action === "reset_wall") {
      try {
        await Promise.allSettled([
          adminSb.from("mcq_attempts").delete().neq("id", "___NONE___"),
          adminSb.from("candidate_stations").delete().neq("id", CONFIG_ID),
          adminSb.from("codespark_round2_finalizations").delete().neq("station_id", "___NONE___"),
          adminSb.from("code_submissions").delete().neq("id", "___NONE___")
        ]);

        const { data: cfgRow } = await adminSb.from("candidate_stations").select("*").eq("id", CONFIG_ID).maybeSingle();
        let existingCfg = cfgRow?.student || null;
        if (!existingCfg && cfgRow?.code) {
          try { existingCfg = JSON.parse(cfgRow.code); } catch {}
        }
        const updatedCfg = {
          ...(existingCfg || {}),
          attempts: [],
          isConcluded: false,
          usedAccessKeys: [],
          manualShortlistRolls: [],
          updatedAt: Date.now()
        };

        await adminSb.from("candidate_stations").upsert([{
          id: CONFIG_ID,
          lab_id: "SYSTEM_CONFIG",
          station_number: "CONFIG",
          status: "CONFIG",
          code: JSON.stringify(updatedCfg),
          student: updatedCfg,
          last_updated_timestamp: Date.now()
        }]);

        invalidateRosterCache();
        return res.status(200).json({ success: true, message: "Attempts and workstations purged clean." });
      } catch (err) {
        console.error("[data.js purge error]", err);
        return res.status(500).json({ success: false, error: err.message || "Failed to purge attempts" });
      }
    }

    // ── 3. DELETE EXAM (Cascade deletes attached questions & attempts) ──
    if (action === "delete_exam" || action === "delete_paper") {
      const examId = req.query?.examId || req.query?.id || body.examId || body.id;
      if (!examId) {
        return res.status(400).json({ success: false, error: "Exam ID required." });
      }

      try {
        const { data: examRow } = await adminSb.from("mcq_exams").select("question_ids").eq("id", examId).maybeSingle();
        const qIds = Array.isArray(examRow?.question_ids) ? examRow.question_ids : [];

        if (qIds.length > 0) {
          await adminSb.from("mcq_questions").delete().in("id", qIds);
        }
        await adminSb.from("mcq_attempts").delete().eq("exam_id", examId);
        await adminSb.from("mcq_exams").delete().eq("id", examId);

        // If it was the active exam in config, unset it
        const { data: cfgRow } = await adminSb.from("candidate_stations").select("*").eq("id", CONFIG_ID).maybeSingle();
        let cfg = cfgRow?.student || null;
        if (!cfg && cfgRow?.code) {
          try { cfg = JSON.parse(cfgRow.code); } catch {}
        }
        if (cfg && cfg.activeExamId === examId) {
          cfg.activeExamId = null;
          cfg.updatedAt = Date.now();
          await adminSb.from("candidate_stations").upsert([{
            id: CONFIG_ID, lab_id: "SYSTEM_CONFIG", station_number: "CONFIG",
            status: "CONFIG", code: JSON.stringify(cfg), student: cfg,
            last_updated_timestamp: Date.now()
          }]);
        }

        invalidateRosterCache();
        return res.status(200).json({ success: true, message: `Exam ${examId} permanently deleted from cloud.` });
      } catch (err) {
        console.error("[data.js delete_exam error]", err);
        return res.status(500).json({ success: false, error: err.message || "Failed to delete exam" });
      }
    }

    // ── 4. DELETE CANDIDATE ──
    if (action === "delete_candidate") {
      const roll = req.query?.roll || req.query?.key || body.roll || body.key;
      if (!roll) {
        return res.status(400).json({ success: false, error: "Candidate roll or key required." });
      }
      const clean = String(roll).trim().toUpperCase();

      try {
        await Promise.allSettled([
          adminSb.from("mcq_attempts").delete().ilike("student_roll", clean),
          adminSb.from("mcq_attempts").delete().ilike("student_name", clean),
          adminSb.from("mcq_attempts").delete().eq("id", clean)
        ]);

        // Also delete matching stations from candidate_stations
        const { data: stRows } = await adminSb.from("candidate_stations").select("id, student").neq("id", CONFIG_ID);
        if (stRows && stRows.length > 0) {
          const matchIds = stRows.filter(s => {
            const sRoll = String(s.student?.rollNumber || "").trim().toUpperCase();
            const sKey = String(s.student?.accessKey || "").trim().toUpperCase();
            const sName = String(s.student?.name || "").trim().toUpperCase();
            return sRoll === clean || sKey === clean || sName === clean;
          }).map(s => s.id);
          if (matchIds.length > 0) {
            await adminSb.from("candidate_stations").delete().in("id", matchIds);
          }
        }

        const { data: cfgRow } = await adminSb.from("candidate_stations").select("*").eq("id", CONFIG_ID).maybeSingle();
        let cfg = cfgRow?.student || null;
        if (!cfg && cfgRow?.code) {
          try { cfg = JSON.parse(cfgRow.code); } catch {}
        }
        if (cfg && Array.isArray(cfg.candidates)) {
          cfg.candidates = cfg.candidates.filter(c => {
            const r = String(c.rollNumber || "").trim().toUpperCase();
            const k = String(c.accessKey || "").trim().toUpperCase();
            const n = String(c.name || "").trim().toUpperCase();
            return r !== clean && k !== clean && n !== clean;
          });
          cfg.updatedAt = Date.now();
          await adminSb.from("candidate_stations").upsert([{
            id: CONFIG_ID, lab_id: "SYSTEM_CONFIG", station_number: "CONFIG",
            status: "CONFIG", code: JSON.stringify(cfg), student: cfg,
            last_updated_timestamp: Date.now()
          }]);
        }

        invalidateRosterCache();
        return res.status(200).json({ success: true, message: `Candidate ${clean} deleted from cloud.` });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    // ── 4C. DELETE INDIVIDUAL ATTEMPT ──
    if (action === "delete_attempt") {
      const attemptId = req.query?.attemptId || req.query?.id || body.attemptId || body.id;
      if (attemptId) {
        await adminSb.from("mcq_attempts").delete().eq("id", attemptId);
        return res.status(200).json({ success: true, message: `Attempt ${attemptId} deleted.` });
      }
      return res.status(400).json({ success: false, error: "Attempt ID required." });
    }

    // ── 4D. DELETE QUESTIONS BATCH ──
    if (action === "delete_questions" || action === "delete_question") {
      const ids = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : (req.query?.id ? [req.query.id] : []));
      if (ids.length > 0) {
        await adminSb.from("mcq_questions").delete().in("id", ids);
      }
      return res.status(200).json({ success: true, count: ids.length });
    }

    // ── 4E. DELETE STATION ──
    if (action === "delete_station") {
      const stationId = req.query?.stationId || req.query?.id || body.stationId || body.id;
      if (stationId) {
        await adminSb.from("candidate_stations").delete().eq("id", stationId);
        return res.status(200).json({ success: true, message: `Station ${stationId} deleted.` });
      }
      return res.status(400).json({ success: false, error: "Station ID required." });
    }

    // ── 4B. CONSUME KEY (Single-Use Access Key Invalidation) ──
    if (action === "consume_key") {
      const keyToConsume = String(body.key || body.accessKey || req.query?.key || "").trim().toUpperCase();
      const rollToConsume = String(body.rollNumber || body.roll || req.query?.roll || "").trim().toUpperCase();
      if (!keyToConsume && !rollToConsume) {
        return res.status(400).json({ success: false, error: "Key or roll required." });
      }

      try {
        const { data: cfgRow } = await adminSb.from("candidate_stations").select("*").eq("id", CONFIG_ID).maybeSingle();
        let cfg = cfgRow?.student || null;
        if (!cfg && cfgRow?.code) {
          try { cfg = JSON.parse(cfgRow.code); } catch {}
        }
        cfg = cfg || {};
        const used = new Set(Array.isArray(cfg.usedAccessKeys) ? cfg.usedAccessKeys : []);
        if (keyToConsume) used.add(keyToConsume);
        if (rollToConsume) used.add(rollToConsume);
        cfg.usedAccessKeys = Array.from(used);
        cfg.updatedAt = Date.now();

        await adminSb.from("candidate_stations").upsert([{
          id: CONFIG_ID, lab_id: "SYSTEM_CONFIG", station_number: "CONFIG",
          status: "CONFIG", code: JSON.stringify(cfg), student: cfg,
          last_updated_timestamp: Date.now()
        }]);

        invalidateRosterCache();
        return res.status(200).json({ success: true, message: "Key consumed." });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    // ── 5. SAVE EXAM ──
    if (action === "save_exam") {
      const exam = body.exam || body;
      if (!exam || !exam.id) {
        return res.status(400).json({ success: false, error: "Valid exam object with ID required." });
      }

      const row = {
        id: exam.id,
        title: exam.title || "Examination",
        description: exam.description || "",
        instructions: exam.instructions || "",
        subject: exam.subject || "General Aptitude",
        topic: exam.topic || "Reasoning",
        exam_category: exam.examCategory || "Aptitude",
        duration_minutes: Number(exam.durationMinutes) || 45,
        start_time: exam.startTime ? Number(exam.startTime) : null,
        end_time: exam.endTime ? Number(exam.endTime) : null,
        total_marks: Number(exam.totalMarks) || 0,
        question_count: Array.isArray(exam.questionIds) ? exam.questionIds.length : (Number(exam.questionCount) || 0),
        question_ids: Array.isArray(exam.questionIds) ? exam.questionIds : [],
        shuffle_questions: Boolean(exam.shuffleQuestions),
        shuffle_options: Boolean(exam.shuffleOptions),
        negative_marking_enabled: Boolean(exam.negativeMarkingEnabled),
        allow_review: Boolean(exam.allowReview),
        show_explanations_after_submit: Boolean(exam.showExplanationsAfterSubmit),
        max_attempts: Number(exam.maxAttempts) || 1,
        status: exam.status || "PUBLISHED",
        created_at: Number(exam.createdAt) || Date.now(),
        updated_at: Date.now(),
        created_by: exam.createdBy || "Paper Setter",
        published_at: exam.publishedAt ? Number(exam.publishedAt) : (exam.status === "PUBLISHED" ? Date.now() : null),
        result_declaration_mode: exam.resultDeclarationMode || "IMMEDIATE"
      };

      const { error } = await adminSb.from("mcq_exams").upsert([row]);
      if (error) {
        console.error("[data.js save_exam error]", error);
        return res.status(500).json({ success: false, error: error.message });
      }

      // Also update active exam in config if specified
      if (body.setActive || body.isCodeSpark || exam.isCodeSpark) {
        const { data: cfgRow } = await adminSb.from("candidate_stations").select("*").eq("id", CONFIG_ID).maybeSingle();
        let cfg = cfgRow?.student || null;
        if (!cfg && cfgRow?.code) {
          try { cfg = JSON.parse(cfgRow.code); } catch {}
        }
        cfg = {
          ...(cfg || {}),
          activeExamId: exam.id,
          updatedAt: Date.now()
        };
        await adminSb.from("candidate_stations").upsert([{
          id: CONFIG_ID, lab_id: "SYSTEM_CONFIG", station_number: "CONFIG",
          status: "CONFIG", code: JSON.stringify(cfg), student: cfg,
          last_updated_timestamp: Date.now()
        }]);
      }

      invalidateRosterCache();
      return res.status(200).json({ success: true, message: `Exam ${exam.id} saved to cloud.` });
    }

    // ── 6. SAVE QUESTIONS (Batch) ──
    if (action === "save_questions") {
      const questions = Array.isArray(body.questions) ? body.questions : (body.question ? [body.question] : []);
      if (questions.length === 0) {
        return res.status(400).json({ success: false, error: "Questions array required." });
      }

      const rows = questions.map((q) => {
        let normalizedStatus = String(q.status || "PUBLISHED").toUpperCase().trim();
        if (normalizedStatus === "ACTIVE") normalizedStatus = "PUBLISHED";
        const validStatus = ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(normalizedStatus) ? normalizedStatus : "PUBLISHED";
        const normalizedDiff = String(q.difficulty || "MEDIUM").toUpperCase().trim();
        const validDiff = ["EASY", "MEDIUM", "HARD"].includes(normalizedDiff) ? normalizedDiff : "MEDIUM";
        return {
          id: q.id,
          text: q.text || "",
          options: q.options || [],
          subject: q.subject || "General Aptitude",
          topic: q.topic || "Reasoning",
          difficulty: validDiff,
          marks: Number(q.marks) || 1,
          negative_marks: Number(q.negativeMarks) || 0,
          explanation: q.explanation || "",
          status: validStatus,
          tags: Array.isArray(q.tags) ? q.tags : [],
          created_at: Number(q.createdAt) || Date.now(),
          updated_at: Number(q.updatedAt) || Date.now(),
          created_by: q.createdBy || "Faculty Reviewer",
          reviewed_by: q.reviewedBy || null,
          reviewed_at: q.reviewedAt ? Number(q.reviewedAt) : null,
          quality_score: Number(q.qualityScore) || 90
        };
      });

      const { error } = await adminSb.from("mcq_questions").upsert(rows);
      if (error) {
        console.error("[data.js save_questions error]", error);
        return res.status(500).json({ success: false, error: error.message });
      }

      invalidateRosterCache();
      return res.status(200).json({ success: true, count: rows.length });
    }

    // ── 7. SAVE ATTEMPT ──
    if (action === "save_attempt") {
      const attempt = body.attempt || body;
      if (!attempt || !attempt.id) {
        return res.status(400).json({ success: false, error: "Attempt object with ID required." });
      }

      const row = {
        id: attempt.id,
        exam_id: attempt.examId,
        exam_title: attempt.examTitle || "MCQ Examination",
        student_name: attempt.studentName,
        student_roll: attempt.studentRoll,
        student_dept: attempt.studentDept || "Computer Science & Engineering",
        student_sem: attempt.studentSem || "6th Semester",
        student_div: attempt.studentDiv || "A",
        start_time: Number(attempt.startTime) || Date.now(),
        submit_time: attempt.submitTime ? Number(attempt.submitTime) : null,
        status: attempt.status,
        score: attempt.score !== undefined ? Number(attempt.score) : null,
        max_score: attempt.maxScore !== undefined ? Number(attempt.maxScore) : 0,
        score_percentage: attempt.scorePercentage !== undefined ? Number(attempt.scorePercentage) : null,
        answers: attempt.answers || {},
        time_spent_seconds: Number(attempt.timeSpentSeconds) || 0,
        tab_switch_count: Number(attempt.tabSwitchCount) || 0,
        unfocused_seconds: Number(attempt.unfocusedSeconds) || 0,
        assigned_questions: Array.isArray(attempt.assignedQuestions) ? attempt.assignedQuestions : []
      };

      const { error } = await adminSb.from("mcq_attempts").upsert([row]);
      if (error) {
        console.error("[data.js save_attempt error]", error);
        return res.status(500).json({ success: false, error: error.message });
      }

      return res.status(200).json({ success: true, message: `Attempt ${attempt.id} saved.` });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
  }

  return res.status(405).json({ error: "Method not allowed." });
}
