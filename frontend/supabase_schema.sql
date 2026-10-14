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
ALTER TABLE public.mcq_attempts ADD COLUMN IF NOT EXISTS student_div TEXT DEFAULT 'A';
ALTER TABLE public.mcq_attempts ADD COLUMN IF NOT EXISTS last_activity_at BIGINT;

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

CREATE POLICY "Allow public read-write for mcq_questions" ON public.mcq_questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for mcq_exams" ON public.mcq_exams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for mcq_attempts" ON public.mcq_attempts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for candidate_stations" ON public.candidate_stations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for college_labs" ON public.college_labs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for code_submissions" ON public.code_submissions FOR ALL USING (true) WITH CHECK (true);
