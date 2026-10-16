-- Axent Step 4: server-authoritative MCQ primitives.
-- STAGED MIGRATION: see comments below before production rollout.
-- This does not alter any .env/.env.example file or the coding-exam runtime.
-- IMPORTANT: current SPA still does direct table CRUD. Do NOT remove existing
-- permissive policies until candidate + authority clients have moved to these RPCs.
-- Until then this is a foundation, not a completed live security cutover.

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
  IF NOT FOUND OR t.revoked_at IS NOT NULL OR t.expires_at<=now() THEN
    RAISE EXCEPTION 'candidate ticket invalid or expired' USING ERRCODE='28000';
  END IF;
  SELECT * INTO e FROM public.mcq_exams WHERE id=t.exam_id FOR SHARE;
  IF NOT FOUND OR e.status<>'PUBLISHED' THEN RAISE EXCEPTION 'exam unavailable' USING ERRCODE='22023'; END IF;
  now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF e.start_time IS NOT NULL AND now_ms<e.start_time THEN RAISE EXCEPTION 'exam has not started' USING ERRCODE='22023'; END IF;
  IF e.end_time IS NOT NULL AND now_ms>=e.end_time THEN RAISE EXCEPTION 'exam window closed' USING ERRCODE='22023'; END IF;

  SELECT * INTO a FROM public.mcq_attempts WHERE exam_id=t.exam_id AND student_roll=t.student_roll AND status='IN_PROGRESS'
    ORDER BY start_time DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('attemptId',a.id,'deadline',a.deadline,'status',a.status,'answers',a.answers,
      'assignedQuestions',(SELECT COALESCE(jsonb_agg(jsonb_build_object('questionId',x->>'questionId','order',x->'order',
        'snapshot',(x->'snapshot')-'correctOptionId'-'explanation','shuffledOptionIds',x->'shuffledOptionIds')
        ORDER BY (x->>'order')::int),'[]'::jsonb) FROM jsonb_array_elements(a.assigned_questions) x));
  END IF;
  IF (SELECT count(*) FROM public.mcq_attempts WHERE exam_id=t.exam_id AND student_roll=t.student_roll
      AND status IN ('IN_PROGRESS','SUBMITTED','TIMED_OUT'))>=GREATEST(COALESCE(e.max_attempts,1),1) THEN
    RAISE EXCEPTION 'maximum attempts reached' USING ERRCODE='22023';
  END IF;
  deadline_ms:=now_ms+e.duration_minutes::bigint*60000;
  IF e.end_time IS NOT NULL THEN deadline_ms:=LEAST(deadline_ms,e.end_time); END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('questionId',q.id,'order',picked.ord-1,
    'snapshot',jsonb_build_object('questionId',q.id,'text',q.text,
      'options',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',o->>'id','text',o->>'text') ORDER BY random()),'[]'::jsonb)
        FROM jsonb_array_elements(q.options) o),
      'correctOptionId',(SELECT o->>'id' FROM jsonb_array_elements(q.options) o WHERE COALESCE((o->>'isCorrect')::boolean,false) LIMIT 1),
      'marks',q.marks,'negativeMarks',CASE WHEN e.negative_marking_enabled THEN q.negative_marks ELSE 0 END,
      'explanation',COALESCE(q.explanation,''),'subject',q.subject,'topic',q.topic,'difficulty',q.difficulty),
    'shuffledOptionIds',(SELECT COALESCE(jsonb_agg(o->>'id' ORDER BY random()),'[]'::jsonb) FROM jsonb_array_elements(q.options) o)
    ) ORDER BY picked.ord),'[]'::jsonb) INTO assignment
  FROM (
    SELECT question_id, row_number() OVER(ORDER BY random()) ord FROM unnest(e.question_ids) question_id
  ) picked JOIN public.mcq_questions q ON q.id=picked.question_id AND q.status='PUBLISHED'
  WHERE (SELECT count(*) FROM jsonb_array_elements(q.options) o WHERE COALESCE((o->>'isCorrect')::boolean,false)=true)=1
  LIMIT GREATEST(1,LEAST(e.question_count,cardinality(e.question_ids)));

  IF jsonb_array_length(assignment)=0 THEN RAISE EXCEPTION 'no valid published questions' USING ERRCODE='22023'; END IF;
  INSERT INTO public.mcq_attempts(id,exam_id,exam_title,student_name,student_roll,student_dept,student_sem,student_div,
    start_time,deadline,last_activity_at,status,assigned_questions,answers,max_score)
  VALUES(gen_random_uuid()::text,t.exam_id,e.title,t.student_name,t.student_roll,t.student_dept,t.student_sem,t.student_div,
    now_ms,deadline_ms,now_ms,'IN_PROGRESS',assignment,'{}'::jsonb,
    (SELECT COALESCE(sum((x->'snapshot'->>'marks')::numeric),0) FROM jsonb_array_elements(assignment) x)) RETURNING * INTO a;
  RETURN jsonb_build_object('attemptId',a.id,'deadline',a.deadline,'status',a.status,'answers',a.answers,
    'assignedQuestions',(SELECT COALESCE(jsonb_agg(jsonb_build_object('questionId',x->>'questionId','order',x->'order',
      'snapshot',(x->'snapshot')-'correctOptionId'-'explanation','shuffledOptionIds',x->'shuffledOptionIds')
      ORDER BY (x->>'order')::int),'[]'::jsonb) FROM jsonb_array_elements(a.assigned_questions) x));
END $$;

CREATE OR REPLACE FUNCTION public.save_mcq_answer(p_ticket_token text,p_attempt_id text,p_question_id text,p_option_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE t public.mcq_candidate_tickets%ROWTYPE; a public.mcq_attempts%ROWTYPE; now_ms bigint;
BEGIN
  SELECT * INTO t FROM public.mcq_candidate_tickets WHERE token_hash=encode(extensions.digest(convert_to(COALESCE(p_ticket_token,''),'UTF8'),'sha256'),'hex')
    AND revoked_at IS NULL AND expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid candidate ticket' USING ERRCODE='28000'; END IF;
  SELECT * INTO a FROM public.mcq_attempts WHERE id=p_attempt_id AND exam_id=t.exam_id AND student_roll=t.student_roll FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt not found' USING ERRCODE='22023'; END IF;
  IF a.status<>'IN_PROGRESS' THEN RAISE EXCEPTION 'attempt is not in progress' USING ERRCODE='22023'; END IF;
  now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF now_ms>=a.deadline THEN
    UPDATE public.mcq_attempts SET status='TIMED_OUT',submit_time=deadline,last_activity_at=now_ms WHERE id=a.id;
    RAISE EXCEPTION 'exam deadline passed' USING ERRCODE='22023';
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
  score numeric:=0; max_score numeric:=0; correct_count int:=0; wrong_count int:=0; unanswered_count int:=0; now_ms bigint;
BEGIN
  SELECT * INTO t FROM public.mcq_candidate_tickets WHERE token_hash=encode(extensions.digest(convert_to(COALESCE(p_ticket_token,''),'UTF8'),'sha256'),'hex')
    AND revoked_at IS NULL AND expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid candidate ticket' USING ERRCODE='28000'; END IF;
  SELECT * INTO a FROM public.mcq_attempts WHERE id=p_attempt_id AND exam_id=t.exam_id AND student_roll=t.student_roll FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt not found' USING ERRCODE='22023'; END IF;
  IF a.status<>'IN_PROGRESS' THEN RETURN jsonb_build_object('attemptId',a.id,'status',a.status,'score',a.score,'maxScore',a.max_score,
    'correctCount',a.correct_count,'wrongCount',a.wrong_count,'unansweredCount',a.unanswered_count,'percentageScore',a.percentage_score); END IF;
  now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  FOR x IN SELECT value FROM jsonb_array_elements(a.assigned_questions) LOOP
    qid:=x->>'questionId'; correct_id:=x->'snapshot'->>'correctOptionId'; selected_id:=a.answers->>qid;
    marks:=COALESCE((x->'snapshot'->>'marks')::numeric,1); penalty:=COALESCE((x->'snapshot'->>'negativeMarks')::numeric,0);
    max_score:=max_score+marks;
    IF selected_id IS NULL OR selected_id='' THEN unanswered_count:=unanswered_count+1;
    ELSIF selected_id=correct_id THEN correct_count:=correct_count+1; score:=score+marks;
    ELSE wrong_count:=wrong_count+1; score:=score-penalty; END IF;
  END LOOP;
  score:=GREATEST(0,score);
  UPDATE public.mcq_attempts SET status=CASE WHEN now_ms>=deadline THEN 'TIMED_OUT' ELSE 'SUBMITTED' END,
    submit_time=now_ms,last_activity_at=now_ms,score=score,max_score=max_score,correct_count=correct_count,
    wrong_count=wrong_count,unanswered_count=unanswered_count,
    percentage_score=CASE WHEN max_score>0 THEN round((score/max_score)*100,2) ELSE 0 END,graded_at=now_ms WHERE id=a.id;
  RETURN jsonb_build_object('attemptId',a.id,'status',CASE WHEN now_ms>=a.deadline THEN 'TIMED_OUT' ELSE 'SUBMITTED' END,
    'score',score,'maxScore',max_score,'correctCount',correct_count,'wrongCount',wrong_count,'unansweredCount',unanswered_count,
    'percentageScore',CASE WHEN max_score>0 THEN round((score/max_score)*100,2) ELSE 0 END);
END $$;

REVOKE ALL ON FUNCTION public.issue_mcq_candidate_ticket(text,text,text,text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.issue_mcq_candidate_ticket(text,text,text,text,text,text,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.start_mcq_attempt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_mcq_attempt(text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.save_mcq_answer(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_mcq_answer(text,text,text,text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.submit_mcq_attempt(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_mcq_attempt(text,text) TO anon,authenticated;

-- Rollout checklist before production:
-- 1) Apply/test this SQL in staging; verify actual options JSON uses isCorrect.
-- 2) Switch candidate start/save/submit UI to these RPCs and trusted ticket issuance.
-- 3) Switch authority question/exam management off unrestricted anonymous CRUD.
-- 4) Add regression tests for expiry, revocation, attempts, timing, cross-ticket access,
--    invalid options, no answer-key leakage, negative marking and duplicate submissions.
-- 5) Only then replace the six USING(true)/WITH CHECK(true) policies and revoke direct
--    anonymous table access. Do not run that policy lockdown before the client cutover.
-- 6) Re-test MCQ and coding flows end-to-end. No coding runtime files are changed here.
