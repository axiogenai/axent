-- Axent Step 4: server-authoritative MCQ primitives.
-- STAGED MIGRATION: see comments below before production rollout.
-- This does not alter any .env/.env.example file or the coding-exam runtime.
-- The candidate MCQ route now uses the RPCs below; authority CRUD remains role-protected.
-- Apply this migration in staging first. It is not automatically applied to live Supabase.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.mcq_candidate_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  exam_id text NOT NULL REFERENCES public.mcq_exams(id) ON DELETE CASCADE,
  student_name text NOT NULL,
  student_roll text NOT NULL,
  student_dept text NOT NULL DEFAULT '',
  student_sem text NOT NULL DEFAULT '',
  student_div text NOT NULL DEFAULT 'A',
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcq_candidate_tickets_exam_roll
  ON public.mcq_candidate_tickets(exam_id, student_roll);
ALTER TABLE public.mcq_candidate_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcq_candidate_tickets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcq_candidate_tickets TO service_role;

ALTER TABLE public.mcq_attempts ADD COLUMN IF NOT EXISTS student_div text DEFAULT 'A';
ALTER TABLE public.mcq_attempts ADD COLUMN IF NOT EXISTS last_activity_at bigint;
ALTER TABLE public.mcq_attempts ADD COLUMN IF NOT EXISTS candidate_ticket_id uuid
  REFERENCES public.mcq_candidate_tickets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_mcq_attempts_candidate_ticket
  ON public.mcq_attempts(candidate_ticket_id);

-- Trusted administrators issue a random ticket once; only its hash is persisted.
CREATE OR REPLACE FUNCTION public.issue_mcq_candidate_ticket(
  p_exam_id text, p_student_name text, p_student_roll text,
  p_student_dept text DEFAULT '', p_student_sem text DEFAULT '',
  p_student_div text DEFAULT 'A', p_ttl_hours integer DEFAULT 24
) RETURNS TABLE(ticket_token text, ticket_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_token text; v_exam public.mcq_exams%ROWTYPE; v_expires timestamptz;
BEGIN
  IF COALESCE(auth.jwt()->'app_metadata'->>'role','') <> 'admin' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'trusted administrator role required' USING ERRCODE='42501';
  END IF;
  IF length(trim(COALESCE(p_student_name,'')))=0 OR length(trim(COALESCE(p_student_roll,'')))=0 THEN
    RAISE EXCEPTION 'candidate name and roll number are required' USING ERRCODE='22023';
  END IF;
  IF p_ttl_hours IS NULL OR p_ttl_hours < 1 OR p_ttl_hours > 168 THEN
    RAISE EXCEPTION 'ticket lifetime must be 1..168 hours' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_exam FROM public.mcq_exams WHERE id=p_exam_id FOR SHARE;
  IF NOT FOUND OR v_exam.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'published exam not found' USING ERRCODE='22023';
  END IF;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  v_expires := now()+make_interval(hours=>p_ttl_hours);
  INSERT INTO public.mcq_candidate_tickets(token_hash,exam_id,student_name,student_roll,student_dept,student_sem,student_div,expires_at,created_by)
  VALUES(encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex'),p_exam_id,trim(p_student_name),trim(p_student_roll),
    COALESCE(trim(p_student_dept),''),COALESCE(trim(p_student_sem),''),COALESCE(NULLIF(trim(p_student_div),''),'A'),v_expires,auth.uid());
  RETURN QUERY SELECT v_token,v_expires;
END $$;

-- Starts/resumes an attempt; answer keys remain only in the server-side assignment.
CREATE OR REPLACE FUNCTION public.start_mcq_attempt(p_ticket_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE
  t public.mcq_candidate_tickets%ROWTYPE; e public.mcq_exams%ROWTYPE;
  a public.mcq_attempts%ROWTYPE; assignment jsonb; now_ms bigint; deadline_ms bigint;
BEGIN
  IF length(COALESCE(p_ticket_token,''))<32 OR length(p_ticket_token)>256 THEN
    RAISE EXCEPTION 'invalid candidate ticket' USING ERRCODE='28000';
  END IF;
  SELECT * INTO t FROM public.mcq_candidate_tickets
   WHERE token_hash=encode(extensions.digest(convert_to(p_ticket_token,'UTF8'),'sha256'),'hex')
   FOR UPDATE;
  IF NOT FOUND OR t.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'candidate ticket invalid or revoked' USING ERRCODE='28000';
  END IF;
  SELECT * INTO e FROM public.mcq_exams WHERE id=t.exam_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exam unavailable' USING ERRCODE='22023'; END IF;
  now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;

  SELECT * INTO a FROM public.mcq_attempts WHERE exam_id=t.exam_id AND lower(trim(student_roll))=lower(trim(t.student_roll)) AND candidate_ticket_id=t.id AND status='IN_PROGRESS'
    ORDER BY start_time DESC LIMIT 1 FOR UPDATE;
  IF FOUND AND now_ms<a.deadline THEN
    RETURN jsonb_build_object('examId',e.id,'examTitle',e.title,'instructions',e.instructions,'allowReview',e.allow_review,'durationMinutes',e.duration_minutes,
      'candidate',jsonb_build_object('name',a.student_name,'rollNumber',a.student_roll,'department',a.student_dept,'semester',a.student_sem,'division',a.student_div),
      'attemptId',a.id,'deadline',a.deadline,'serverTime',now_ms,'status',a.status,'answers',a.answers,
      'assignedQuestions',(SELECT COALESCE(jsonb_agg(jsonb_build_object('questionId',x->>'questionId','order',x->'order',
        'snapshot',(x->'snapshot')-'correctOptionId'-'explanation','shuffledOptionIds',x->'shuffledOptionIds')
        ORDER BY (x->>'order')::int),'[]'::jsonb) FROM jsonb_array_elements(a.assigned_questions) x));
  ELSIF FOUND THEN
    -- Finalize stale attempts when a candidate returns after the deadline.
    PERFORM public.submit_mcq_attempt(p_ticket_token,a.id);
  END IF;

  -- Ticket expiry blocks new attempts, but does not interrupt an attempt started while valid.
  IF t.expires_at<=now() THEN RAISE EXCEPTION 'candidate ticket expired' USING ERRCODE='28000'; END IF;
  IF e.status<>'PUBLISHED' THEN RAISE EXCEPTION 'exam unavailable' USING ERRCODE='22023'; END IF;
  IF e.start_time IS NOT NULL AND now_ms<e.start_time THEN RAISE EXCEPTION 'exam has not started' USING ERRCODE='22023'; END IF;
  IF e.end_time IS NOT NULL AND now_ms>=e.end_time THEN RAISE EXCEPTION 'exam window closed' USING ERRCODE='22023'; END IF;
  -- Serialize starts across different tickets for the same candidate and exam.
  PERFORM pg_advisory_xact_lock(hashtext(t.exam_id), hashtext(t.student_roll));
  IF (SELECT count(*) FROM public.mcq_attempts WHERE exam_id=t.exam_id AND lower(trim(student_roll))=lower(trim(t.student_roll))
      AND status IN ('IN_PROGRESS','SUBMITTED','TIMED_OUT','ABANDONED'))>=GREATEST(COALESCE(e.max_attempts,1),1) THEN
    RAISE EXCEPTION 'maximum attempts reached' USING ERRCODE='22023';
  END IF;
  deadline_ms:=now_ms+e.duration_minutes::bigint*60000;
  IF e.end_time IS NOT NULL THEN deadline_ms:=LEAST(deadline_ms,e.end_time); END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('questionId',picked.id,'order',picked.ord-1,
    'snapshot',jsonb_build_object('questionId',picked.id,'text',picked.text,
      'options',picked.safe_options,
      'correctOptionId',picked.correct_id,
      'marks',picked.marks,'negativeMarks',picked.penalty,
      'explanation',picked.explanation,'subject',picked.subject,'topic',picked.topic,'difficulty',picked.difficulty),
    'shuffledOptionIds',picked.shuffled_ids
    ) ORDER BY picked.ord),'[]'::jsonb) INTO assignment
  FROM (
    SELECT q.id, chosen.ord, q.text, q.marks,
      CASE WHEN e.negative_marking_enabled THEN q.negative_marks ELSE 0 END AS penalty,
      COALESCE(q.explanation,'') AS explanation, q.subject, q.topic, q.difficulty,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',o->>'id','text',o->>'text')
          ORDER BY CASE WHEN e.shuffle_options THEN random() ELSE ordinality END),'[]'::jsonb)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY AS option_row(o,ordinality)) AS safe_options,
      (SELECT o->>'id' FROM jsonb_array_elements(q.options) o WHERE COALESCE((o->>'isCorrect')::boolean,false) LIMIT 1) AS correct_id,
      (SELECT COALESCE(jsonb_agg(o->>'id' ORDER BY CASE WHEN e.shuffle_options THEN random() ELSE ordinality END),'[]'::jsonb)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY AS option_row(o,ordinality)) AS shuffled_ids
    FROM (SELECT question_id, row_number() OVER(ORDER BY CASE WHEN e.shuffle_questions THEN random() ELSE ordinality END) ord
      FROM unnest(e.question_ids) WITH ORDINALITY AS selected(question_id, ordinality)) chosen
    JOIN public.mcq_questions q ON q.id=chosen.question_id AND q.status='PUBLISHED'
    WHERE (SELECT count(*) FROM jsonb_array_elements(q.options) o WHERE COALESCE((o->>'isCorrect')::boolean,false)=true)=1
      AND jsonb_array_length(q.options) BETWEEN 2 AND 6 AND q.marks>0 AND q.negative_marks>=0 AND length(trim(q.text))>0
    ORDER BY chosen.ord
    LIMIT GREATEST(1,LEAST(e.question_count,cardinality(e.question_ids)))
  ) picked;

  IF jsonb_array_length(assignment)=0 THEN RAISE EXCEPTION 'no valid published questions' USING ERRCODE='22023'; END IF;
  INSERT INTO public.mcq_attempts(id,exam_id,exam_title,student_name,student_roll,student_dept,student_sem,student_div,
    start_time,deadline,last_activity_at,status,assigned_questions,answers,max_score,candidate_ticket_id)
  VALUES(gen_random_uuid()::text,t.exam_id,e.title,t.student_name,t.student_roll,t.student_dept,t.student_sem,t.student_div,
    now_ms,deadline_ms,now_ms,'IN_PROGRESS',assignment,'{}'::jsonb,
    (SELECT COALESCE(sum((x->'snapshot'->>'marks')::numeric),0) FROM jsonb_array_elements(assignment) x),t.id) RETURNING * INTO a;
  RETURN jsonb_build_object('examId',e.id,'examTitle',e.title,'instructions',e.instructions,'allowReview',e.allow_review,'durationMinutes',e.duration_minutes,
    'candidate',jsonb_build_object('name',a.student_name,'rollNumber',a.student_roll,'department',a.student_dept,'semester',a.student_sem,'division',a.student_div),
    'attemptId',a.id,'deadline',a.deadline,'serverTime',now_ms,'status',a.status,'answers',a.answers,
    'assignedQuestions',(SELECT COALESCE(jsonb_agg(jsonb_build_object('questionId',x->>'questionId','order',x->'order',
      'snapshot',(x->'snapshot')-'correctOptionId'-'explanation','shuffledOptionIds',x->'shuffledOptionIds')
      ORDER BY (x->>'order')::int),'[]'::jsonb) FROM jsonb_array_elements(a.assigned_questions) x));
END $$;

CREATE OR REPLACE FUNCTION public.save_mcq_answer(p_ticket_token text,p_attempt_id text,p_question_id text,p_option_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE t public.mcq_candidate_tickets%ROWTYPE; a public.mcq_attempts%ROWTYPE; now_ms bigint;
BEGIN
  SELECT * INTO t FROM public.mcq_candidate_tickets WHERE token_hash=encode(extensions.digest(convert_to(COALESCE(p_ticket_token,''),'UTF8'),'sha256'),'hex')
    AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid candidate ticket' USING ERRCODE='28000'; END IF;
  SELECT * INTO a FROM public.mcq_attempts WHERE id=p_attempt_id AND exam_id=t.exam_id AND student_roll=t.student_roll AND candidate_ticket_id=t.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt not found' USING ERRCODE='22023'; END IF;
  IF a.status<>'IN_PROGRESS' THEN RAISE EXCEPTION 'attempt is not in progress' USING ERRCODE='22023'; END IF;
  now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF now_ms>=a.deadline THEN
    RETURN jsonb_build_object('saved',false,'status','TIMED_OUT','serverTime',now_ms);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a.assigned_questions) x WHERE x->>'questionId'=p_question_id
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(x->'snapshot'->'options') o WHERE o->>'id'=p_option_id)) THEN
    RAISE EXCEPTION 'question or option is not assigned to this attempt' USING ERRCODE='22023';
  END IF;
  UPDATE public.mcq_attempts SET answers=jsonb_set(COALESCE(answers,'{}'::jsonb),ARRAY[p_question_id],to_jsonb(p_option_id),true),last_activity_at=now_ms WHERE id=a.id;
  RETURN jsonb_build_object('saved',true,'serverTime',now_ms);
END $$;

CREATE OR REPLACE FUNCTION public.submit_mcq_attempt(p_ticket_token text,p_attempt_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE t public.mcq_candidate_tickets%ROWTYPE; a public.mcq_attempts%ROWTYPE; x jsonb;
  qid text; correct_id text; selected_id text; marks numeric; penalty numeric;
  v_score numeric:=0; v_max_score numeric:=0; v_correct_count int:=0; v_wrong_count int:=0; v_unanswered_count int:=0; now_ms bigint;
BEGIN
  SELECT * INTO t FROM public.mcq_candidate_tickets WHERE token_hash=encode(extensions.digest(convert_to(COALESCE(p_ticket_token,''),'UTF8'),'sha256'),'hex')
    AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid candidate ticket' USING ERRCODE='28000'; END IF;
  SELECT * INTO a FROM public.mcq_attempts WHERE id=p_attempt_id AND exam_id=t.exam_id AND student_roll=t.student_roll AND candidate_ticket_id=t.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt not found' USING ERRCODE='22023'; END IF;
  IF a.status<>'IN_PROGRESS' THEN RETURN jsonb_build_object('attemptId',a.id,'status',a.status,'score',a.score,'maxScore',a.max_score,
    'correctCount',a.correct_count,'wrongCount',a.wrong_count,'unansweredCount',a.unanswered_count,'percentageScore',a.percentage_score); END IF;
  now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  FOR x IN SELECT value FROM jsonb_array_elements(a.assigned_questions) LOOP
    qid:=x->>'questionId'; correct_id:=x->'snapshot'->>'correctOptionId'; selected_id:=a.answers->>qid;
    marks:=COALESCE((x->'snapshot'->>'marks')::numeric,1); penalty:=COALESCE((x->'snapshot'->>'negativeMarks')::numeric,0);
    v_max_score:=v_max_score+marks;
    IF selected_id IS NULL OR selected_id='' THEN v_unanswered_count:=v_unanswered_count+1;
    ELSIF selected_id=correct_id THEN v_correct_count:=v_correct_count+1; v_score:=v_score+marks;
    ELSE v_wrong_count:=v_wrong_count+1; v_score:=v_score-penalty; END IF;
  END LOOP;
  v_score:=GREATEST(0,v_score);
  UPDATE public.mcq_attempts SET status=CASE WHEN now_ms>=deadline THEN 'TIMED_OUT' ELSE 'SUBMITTED' END,
    submit_time=now_ms,last_activity_at=now_ms,score=v_score,max_score=v_max_score,correct_count=v_correct_count,
    wrong_count=v_wrong_count,unanswered_count=v_unanswered_count,
    percentage_score=CASE WHEN v_max_score>0 THEN round((v_score/v_max_score)*100,2) ELSE 0 END,graded_at=now_ms WHERE id=a.id;
  RETURN jsonb_build_object('attemptId',a.id,'status',CASE WHEN now_ms>=a.deadline THEN 'TIMED_OUT' ELSE 'SUBMITTED' END,
    'score',v_score,'maxScore',v_max_score,'correctCount',v_correct_count,'wrongCount',v_wrong_count,'unansweredCount',v_unanswered_count,
    'percentageScore',CASE WHEN v_max_score>0 THEN round((v_score/v_max_score)*100,2) ELSE 0 END);
END $$;

CREATE OR REPLACE FUNCTION public.revoke_mcq_candidate_ticket(p_ticket_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $
DECLARE affected integer;
BEGIN
  IF COALESCE(auth.jwt()->'app_metadata'->>'role','') <> 'admin' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'trusted administrator role required' USING ERRCODE='42501';
  END IF;
  IF length(COALESCE(p_ticket_token,''))<32 OR length(p_ticket_token)>256 THEN
    RAISE EXCEPTION 'invalid candidate ticket' USING ERRCODE='22023';
  END IF;
  UPDATE public.mcq_candidate_tickets
  SET revoked_at=COALESCE(revoked_at,now())
  WHERE token_hash=encode(extensions.digest(convert_to(p_ticket_token,'UTF8'),'sha256'),'hex');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected=1 THEN
    UPDATE public.mcq_attempts
      SET status='ABANDONED',submit_time=floor(extract(epoch FROM clock_timestamp())*1000)::bigint,
          last_activity_at=floor(extract(epoch FROM clock_timestamp())*1000)::bigint
      WHERE candidate_ticket_id=(SELECT id FROM public.mcq_candidate_tickets
        WHERE token_hash=encode(extensions.digest(convert_to(p_ticket_token,'UTF8'),'sha256'),'hex'))
        AND status='IN_PROGRESS';
  END IF;
  RETURN affected=1;
END $;

REVOKE ALL ON FUNCTION public.issue_mcq_candidate_ticket(text,text,text,text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.issue_mcq_candidate_ticket(text,text,text,text,text,text,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.revoke_mcq_candidate_ticket(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_mcq_candidate_ticket(text) TO authenticated;
REVOKE ALL ON FUNCTION public.start_mcq_attempt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_mcq_attempt(text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.save_mcq_answer(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_mcq_answer(text,text,text,text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.submit_mcq_attempt(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_mcq_attempt(text,text) TO anon,authenticated;


-- Close direct anonymous access to MCQ source, exam configuration, and attempts.
-- Coding exam tables/policies (candidate_stations, code_submissions, college_labs)
-- are intentionally unchanged. Candidate access to MCQ attempts is through the RPCs above.
DROP POLICY IF EXISTS "Allow public read-write for mcq_questions" ON public.mcq_questions;
DROP POLICY IF EXISTS "Allow public read-write for mcq_exams" ON public.mcq_exams;
DROP POLICY IF EXISTS "Allow public read-write for mcq_attempts" ON public.mcq_attempts;
DROP POLICY IF EXISTS "Trusted authorities manage MCQ questions" ON public.mcq_questions;
DROP POLICY IF EXISTS "Trusted authorities manage MCQ exams" ON public.mcq_exams;
DROP POLICY IF EXISTS "Trusted admin manages MCQ attempts" ON public.mcq_attempts;
DROP POLICY IF EXISTS "Trusted authorities read MCQ attempts" ON public.mcq_attempts;
REVOKE ALL ON public.mcq_questions, public.mcq_exams, public.mcq_attempts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcq_questions, public.mcq_exams, public.mcq_attempts TO authenticated;

CREATE POLICY "Trusted authorities manage MCQ questions"
  ON public.mcq_questions FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin','paper_setter'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('admin','paper_setter'));
CREATE POLICY "Trusted authorities manage MCQ exams"
  ON public.mcq_exams FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin','paper_setter'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('admin','paper_setter'));
CREATE POLICY "Trusted admin manages MCQ attempts"
  ON public.mcq_attempts FOR ALL TO authenticated
  USING (auth.jwt()->'app_metadata'->>'role' = 'admin')
  WITH CHECK (auth.jwt()->'app_metadata'->>'role' = 'admin');
CREATE POLICY "Trusted authorities read MCQ attempts"
  ON public.mcq_attempts FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin','paper_setter'));

-- Deployment validation checklist:
-- 1) Apply/test this SQL in a staging Supabase project first; verify options JSON uses isCorrect.
-- 2) Confirm admin and paper-setter users have trusted app_metadata.role values.
-- 3) Test expiry/revocation, max attempts, schedule windows, stale-attempt finalization,
--    cross-ticket access, invalid options, answer-key absence, negative marking and retries.
-- 4) Confirm the MCQ admin/paper-setter screens work under the new role policies.
-- 5) Re-test coding workspace, compiler, submission archival, station telemetry and lab setup.
-- 6) Only deploy after staging checks pass; this migration is not auto-applied to production.
