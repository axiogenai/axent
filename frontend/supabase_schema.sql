-- ============================================================================
-- CodeDNA Production Supabase Schema
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/jswcwixeoilxuhbzojee/sql
-- ============================================================================

-- 1. MCQ Questions Table
CREATE TABLE IF NOT EXISTS public.mcq_questions (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
    marks NUMERIC NOT NULL DEFAULT 1,
    negative_marks NUMERIC NOT NULL DEFAULT 0,
    explanation TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    tags TEXT[] DEFAULT '{}',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    created_by TEXT DEFAULT 'admin',
    bank_group TEXT DEFAULT ''
);

-- 2. MCQ Exams Table
CREATE TABLE IF NOT EXISTS public.mcq_exams (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    instructions TEXT DEFAULT '',
    subject TEXT DEFAULT '',
    topic TEXT DEFAULT '',
    exam_category TEXT DEFAULT 'Internal Assessment (CIE)',
    duration_minutes INT NOT NULL DEFAULT 30,
    start_time BIGINT,
    end_time BIGINT,
    total_marks NUMERIC NOT NULL DEFAULT 0,
    question_count INT NOT NULL DEFAULT 10,
    question_ids TEXT[] DEFAULT '{}',
    shuffle_questions BOOLEAN DEFAULT true,
    shuffle_options BOOLEAN DEFAULT true,
    negative_marking_enabled BOOLEAN DEFAULT false,
    allow_review BOOLEAN DEFAULT true,
    show_explanations_after_submit BOOLEAN DEFAULT true,
    result_declaration_mode TEXT NOT NULL DEFAULT 'IMMEDIATE',
    whatsapp_group_name TEXT DEFAULT '',
    whatsapp_group_link TEXT DEFAULT '',
    max_attempts INT DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED')),
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    created_by TEXT DEFAULT 'admin',
    published_at BIGINT
);

-- 3. MCQ Attempts Table
CREATE TABLE IF NOT EXISTS public.mcq_attempts (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES public.mcq_exams(id) ON DELETE CASCADE,
    exam_title TEXT NOT NULL,
    student_name TEXT NOT NULL,
    student_roll TEXT NOT NULL,
    student_dept TEXT DEFAULT '',
    student_sem TEXT DEFAULT '',
    student_div TEXT DEFAULT 'A',
    start_time BIGINT NOT NULL,
    deadline BIGINT NOT NULL,
    last_activity_at BIGINT,
    proctor_lock_override BOOLEAN NOT NULL DEFAULT false,
    submit_time BIGINT,
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'TIMED_OUT', 'ABANDONED')),
    assigned_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    score NUMERIC,
    max_score NUMERIC NOT NULL DEFAULT 0,
    correct_count INT DEFAULT 0,
    wrong_count INT DEFAULT 0,
    unanswered_count INT DEFAULT 0,
    percentage_score NUMERIC DEFAULT 0,
    graded_at BIGINT,
    tab_switch_count INT DEFAULT 0,
    unfocused_seconds NUMERIC DEFAULT 0,
    infraction_log JSONB DEFAULT '[]'::jsonb
);

-- Safe, repeatable upgrades for databases created from earlier versions of this file.
ALTER TABLE public.mcq_exams ADD COLUMN IF NOT EXISTS result_declaration_mode TEXT NOT NULL DEFAULT 'IMMEDIATE';
ALTER TABLE public.mcq_exams ADD COLUMN IF NOT EXISTS whatsapp_group_name TEXT DEFAULT '';
ALTER TABLE public.mcq_exams ADD COLUMN IF NOT EXISTS whatsapp_group_link TEXT DEFAULT '';

ALTER TABLE public.mcq_attempts ADD COLUMN IF NOT EXISTS student_div TEXT DEFAULT 'A';
ALTER TABLE public.mcq_attempts ADD COLUMN IF NOT EXISTS last_activity_at BIGINT;
ALTER TABLE public.mcq_attempts ADD COLUMN IF NOT EXISTS proctor_lock_override BOOLEAN NOT NULL DEFAULT false;

-- 4. Candidate Workstations (CCTV Telemetry)
CREATE TABLE IF NOT EXISTS public.candidate_stations (
    id TEXT PRIMARY KEY,
    lab_id TEXT NOT NULL,
    lab_name TEXT DEFAULT '',
    station_number TEXT NOT NULL,
    ip_address TEXT DEFAULT '',
    student JSONB NOT NULL DEFAULT '{}'::jsonb,
    language TEXT DEFAULT 'Python',
    code TEXT DEFAULT '',
    metrics JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'In Progress',
    integrity_status TEXT DEFAULT 'Verified Original Work',
    cheating_risk TEXT DEFAULT 'Low',
    marks JSONB,
    compiler_result JSONB,
    analysis_report JSONB,
    screen_image_data TEXT,
    has_live_screen_stream BOOLEAN DEFAULT false,
    active_line_number INT,
    last_terminal_output TEXT,
    is_locked_by_proctor BOOLEAN DEFAULT false,
    proctor_warning_message TEXT,
    tab_switch_violations INT DEFAULT 0,
    unfocused_time_seconds NUMERIC DEFAULT 0,
    infraction_history JSONB DEFAULT '[]'::jsonb,
    last_active TEXT DEFAULT 'Just now',
    last_updated_timestamp BIGINT NOT NULL,
    exam_mode TEXT DEFAULT 'CODING',
    mcq_progress JSONB
);

-- 5. College Laboratories Table (Dynamic Real-Institute Lab Setup)
CREATE TABLE IF NOT EXISTS public.college_labs (
    lab_id TEXT PRIMARY KEY,
    lab_code TEXT NOT NULL,
    lab_name TEXT NOT NULL,
    department TEXT NOT NULL,
    block TEXT NOT NULL,
    total_stations INT NOT NULL DEFAULT 40,
    invigilator_name TEXT DEFAULT '',
    ip_subnet TEXT DEFAULT '',
    is_custom BOOLEAN DEFAULT false,
    created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- 6. Code Submissions Table (Coding Exam Archival)
CREATE TABLE IF NOT EXISTS public.code_submissions (
    id TEXT PRIMARY KEY,
    student JSONB NOT NULL DEFAULT '{}'::jsonb,
    language TEXT NOT NULL DEFAULT 'Python',
    code TEXT NOT NULL DEFAULT '',
    metrics JSONB DEFAULT '{}'::jsonb,
    compiler_result JSONB,
    analysis_report JSONB,
    marks JSONB,
    submitted_at BIGINT NOT NULL
);

-- Indexes for ultra-fast query performance
CREATE INDEX IF NOT EXISTS idx_mcq_questions_status ON public.mcq_questions(status);
CREATE INDEX IF NOT EXISTS idx_mcq_questions_subject ON public.mcq_questions(subject);
CREATE INDEX IF NOT EXISTS idx_mcq_exams_status ON public.mcq_exams(status);
CREATE INDEX IF NOT EXISTS idx_mcq_attempts_exam ON public.mcq_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_mcq_attempts_student ON public.mcq_attempts(student_roll);
CREATE INDEX IF NOT EXISTS idx_candidate_stations_lab ON public.candidate_stations(lab_id);
CREATE INDEX IF NOT EXISTS idx_college_labs_dept ON public.college_labs(department);

-- Enable Row Level Security (RLS) but allow authenticated & anon operations for testing/classroom
ALTER TABLE public.mcq_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcq_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcq_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.college_labs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_submissions ENABLE ROW LEVEL SECURITY;

-- Remove legacy permissive MCQ policies and make this schema block rerunnable.
DROP POLICY IF EXISTS "Allow public read-write for mcq_questions" ON public.mcq_questions;
DROP POLICY IF EXISTS "Allow public read-write for mcq_exams" ON public.mcq_exams;
DROP POLICY IF EXISTS "Allow public read-write for mcq_attempts" ON public.mcq_attempts;
DROP POLICY IF EXISTS "Trusted authorities manage MCQ questions" ON public.mcq_questions;
DROP POLICY IF EXISTS "Trusted authorities manage MCQ exams" ON public.mcq_exams;
DROP POLICY IF EXISTS "Trusted admin manages MCQ attempts" ON public.mcq_attempts;
DROP POLICY IF EXISTS "Trusted authorities read MCQ attempts" ON public.mcq_attempts;
-- MCQ data is only accessible to users with trusted Supabase app_metadata roles.
-- Candidate attempts are created/graded through the secure RPCs in the Step 4 migration.
REVOKE ALL ON public.mcq_questions, public.mcq_exams, public.mcq_attempts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcq_questions, public.mcq_exams, public.mcq_attempts TO authenticated;

CREATE POLICY "Trusted authorities manage MCQ questions" ON public.mcq_questions FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin','paper_setter'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('admin','paper_setter'));
CREATE POLICY "Trusted authorities manage MCQ exams" ON public.mcq_exams FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin','paper_setter'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('admin','paper_setter'));
CREATE POLICY "Trusted admin manages MCQ attempts" ON public.mcq_attempts FOR ALL TO authenticated
  USING (auth.jwt()->'app_metadata'->>'role' = 'admin')
  WITH CHECK (auth.jwt()->'app_metadata'->>'role' = 'admin');
CREATE POLICY "Trusted authorities read MCQ attempts" ON public.mcq_attempts FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin','paper_setter'));

DROP POLICY IF EXISTS "Allow public read-write for candidate_stations" ON public.candidate_stations;
DROP POLICY IF EXISTS "Allow public read-write for college_labs" ON public.college_labs;
DROP POLICY IF EXISTS "Allow public read-write for code_submissions" ON public.code_submissions;
-- Coding-related tables remain unchanged for compatibility with the current coding workflow.
-- Their public policies require a separate authorization migration.
CREATE POLICY "Allow public read-write for candidate_stations" ON public.candidate_stations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for college_labs" ON public.college_labs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for code_submissions" ON public.code_submissions FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 5. Database Maintenance & Auto-Purge Procedure (2-Day Retention & Cascade)
-- Run this function manually or via pg_cron to prune old attempts & concluded exam questions:
-- SELECT public.cleanup_expired_mcq_data();
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_mcq_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_attempts INT := 0;
  v_deleted_questions INT := 0;
  v_cutoff BIGINT;
  v_now BIGINT;
BEGIN
  -- Current epoch milliseconds and 2 days cutoff (48 hours = 172,800,000 ms)
  v_now := (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT;
  v_cutoff := v_now - 172800000;

  -- 1. Purge non-in-progress attempts older than 2 days
  WITH deleted_att AS (
    DELETE FROM public.mcq_attempts
    WHERE status <> 'IN_PROGRESS'
      AND (
        (submit_time IS NOT NULL AND submit_time < v_cutoff)
        OR (submit_time IS NULL AND start_time < v_cutoff)
      )
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_attempts FROM deleted_att;

  -- 2. Purge questions belonging to exams that are concluded/closed/ended,
  -- provided those questions are not referenced by any still-active exam
  WITH active_q_ids AS (
    SELECT DISTINCT unnest(question_ids) AS q_id
    FROM public.mcq_exams
    WHERE status NOT IN ('CLOSED', 'ARCHIVED')
      AND (end_time IS NULL OR end_time > v_now)
  ),
  concluded_q_ids AS (
    SELECT DISTINCT unnest(question_ids) AS q_id
    FROM public.mcq_exams
    WHERE status IN ('CLOSED', 'ARCHIVED')
       OR (end_time IS NOT NULL AND end_time <= v_now)
  ),
  orphan_concluded_q AS (
    SELECT c.q_id
    FROM concluded_q_ids c
    LEFT JOIN active_q_ids a ON c.q_id = a.q_id
    WHERE a.q_id IS NULL
  ),
  deleted_q AS (
    DELETE FROM public.mcq_questions q
    USING orphan_concluded_q o
    WHERE q.id = o.q_id
    RETURNING q.id
  )
  SELECT count(*) INTO v_deleted_questions FROM deleted_q;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_attempts', v_deleted_attempts,
    'deleted_questions', v_deleted_questions,
    'cutoff_epoch_ms', v_cutoff
  );
END;
$$;

-- ============================================================================
-- 6. Supabase Auth Role Provisioner
-- Run this to grant 'admin' role in app_metadata to all users created via Supabase dashboard:
-- ============================================================================
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb,
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
WHERE raw_app_meta_data->>'role' IS NULL;


