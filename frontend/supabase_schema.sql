-- ============================================================================
-- AXENT Autonomous Multi-Tenant SaaS Database Schema
-- Production Supabase PostgreSQL Schema & Tenant Isolation Layer
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/htfjwfwleyljbkftmthd/sql
-- ============================================================================

-- ── 1. TENANT ORGANIZATIONS TABLE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    domain TEXT DEFAULT '',
    logo_url TEXT DEFAULT '',
    plan_id TEXT NOT NULL DEFAULT 'starter',
    subscription_status TEXT NOT NULL DEFAULT 'active' CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled')),
    trial_ends_at BIGINT,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

-- ── 2. SUBSCRIPTION PLANS TABLE ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    badge TEXT DEFAULT '',
    description TEXT DEFAULT '',
    price_inr_monthly NUMERIC NOT NULL DEFAULT 0,
    price_inr_yearly NUMERIC NOT NULL DEFAULT 0,
    max_students INT NOT NULL DEFAULT 500,
    max_exams INT NOT NULL DEFAULT 10,
    max_admins INT NOT NULL DEFAULT 3,
    max_evaluators INT NOT NULL DEFAULT 15,
    max_monthly_submissions INT NOT NULL DEFAULT 5000,
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- ── 3. TENANT SUBSCRIPTIONS TABLE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES public.subscription_plans(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled')),
    billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    current_period_start BIGINT NOT NULL,
    current_period_end BIGINT NOT NULL,
    razorpay_customer_id TEXT,
    razorpay_subscription_id TEXT,
    usage JSONB NOT NULL DEFAULT '{"studentsCount":0,"examsCount":0,"adminsCount":1,"evaluatorsCount":0,"monthlySubmissionsCount":0}'::jsonb,
    updated_at BIGINT NOT NULL
);

-- ── 4. ORGANIZATION MEMBERS TABLE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_members (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'org_admin', 'evaluator', 'candidate')),
    full_name TEXT DEFAULT '',
    department TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended')),
    created_at BIGINT NOT NULL,
    last_active_at BIGINT
);

-- ── 5. FORENSIC AUDIT LOGS TABLE ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_id TEXT,
    user_email TEXT,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at BIGINT NOT NULL
);

-- ── 6. MCQ QUESTIONS TABLE (Tenant Partitioned) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.mcq_questions (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default_org',
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

-- ── 7. MCQ EXAMINATIONS TABLE (Tenant Partitioned) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.mcq_exams (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default_org',
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

-- ── 8. MCQ ATTEMPTS TABLE (Tenant Partitioned) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.mcq_attempts (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default_org',
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

-- ── 9. CANDIDATE WORKSTATIONS TABLE (Tenant CCTV Proctoring) ─────────────────
CREATE TABLE IF NOT EXISTS public.candidate_stations (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default_org',
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

-- ── 10. COLLEGE LABORATORIES TABLE (Tenant Setup) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.college_labs (
    lab_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default_org',
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

-- ── 11. CODE SUBMISSIONS TABLE (Tenant Coding Archives) ─────────────────────
CREATE TABLE IF NOT EXISTS public.code_submissions (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default_org',
    student JSONB NOT NULL DEFAULT '{}'::jsonb,
    language TEXT NOT NULL DEFAULT 'Python',
    code TEXT NOT NULL DEFAULT '',
    metrics JSONB DEFAULT '{}'::jsonb,
    compiler_result JSONB,
    analysis_report JSONB,
    marks JSONB,
    submitted_at BIGINT NOT NULL
);

-- ── 12. BACKWARD-COMPATIBLE UPGRADE MIGRATIONS (Safe for Existing DB) ─────────
ALTER TABLE public.mcq_questions ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default_org';
ALTER TABLE public.mcq_exams ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default_org';
ALTER TABLE public.mcq_attempts ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default_org';
ALTER TABLE public.candidate_stations ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default_org';
ALTER TABLE public.college_labs ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default_org';
ALTER TABLE public.code_submissions ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default_org';

ALTER TABLE public.mcq_exams ADD COLUMN IF NOT EXISTS result_declaration_mode TEXT NOT NULL DEFAULT 'IMMEDIATE';
ALTER TABLE public.mcq_exams ADD COLUMN IF NOT EXISTS whatsapp_group_name TEXT DEFAULT '';
ALTER TABLE public.mcq_exams ADD COLUMN IF NOT EXISTS whatsapp_group_link TEXT DEFAULT '';

ALTER TABLE public.mcq_attempts ADD COLUMN IF NOT EXISTS student_div TEXT DEFAULT 'A';
ALTER TABLE public.mcq_attempts ADD COLUMN IF NOT EXISTS last_activity_at BIGINT;
ALTER TABLE public.mcq_attempts ADD COLUMN IF NOT EXISTS proctor_lock_override BOOLEAN NOT NULL DEFAULT false;

-- ── 13. INDEXES FOR MULTI-TENANT QUERY ACCELERATION ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON public.subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON public.audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_mcq_questions_org ON public.mcq_questions(org_id);
CREATE INDEX IF NOT EXISTS idx_mcq_exams_org ON public.mcq_exams(org_id);
CREATE INDEX IF NOT EXISTS idx_mcq_attempts_org ON public.mcq_attempts(org_id);
CREATE INDEX IF NOT EXISTS idx_candidate_stations_org ON public.candidate_stations(org_id);
CREATE INDEX IF NOT EXISTS idx_college_labs_org ON public.college_labs(org_id);

-- ── 14. ROW LEVEL SECURITY & PRIVILEGES ─────────────────────────────────────
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcq_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcq_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcq_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.college_labs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_submissions ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;

DROP POLICY IF EXISTS "Allow public read-write for organizations" ON public.organizations;
DROP POLICY IF EXISTS "Allow public read-write for organization_members" ON public.organization_members;
DROP POLICY IF EXISTS "Allow public read-write for subscription_plans" ON public.subscription_plans;
DROP POLICY IF EXISTS "Allow public read-write for subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Allow public read-write for audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow public read-write for mcq_questions" ON public.mcq_questions;
DROP POLICY IF EXISTS "Allow public read-write for mcq_exams" ON public.mcq_exams;
DROP POLICY IF EXISTS "Allow public read-write for mcq_attempts" ON public.mcq_attempts;
DROP POLICY IF EXISTS "Allow public read-write for candidate_stations" ON public.candidate_stations;
DROP POLICY IF EXISTS "Allow public read-write for college_labs" ON public.college_labs;
DROP POLICY IF EXISTS "Allow public read-write for code_submissions" ON public.code_submissions;

CREATE POLICY "Allow public read-write for organizations" ON public.organizations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for organization_members" ON public.organization_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for subscription_plans" ON public.subscription_plans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for subscriptions" ON public.subscriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for audit_logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for mcq_questions" ON public.mcq_questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for mcq_exams" ON public.mcq_exams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for mcq_attempts" ON public.mcq_attempts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for candidate_stations" ON public.candidate_stations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for college_labs" ON public.college_labs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for code_submissions" ON public.code_submissions FOR ALL USING (true) WITH CHECK (true);

-- ── 15. INITIAL SEED DATA (Subscription Plans & Default Campus Org) ──────────
INSERT INTO public.subscription_plans (id, name, badge, description, price_inr_monthly, price_inr_yearly, max_students, max_exams, max_admins, max_evaluators, max_monthly_submissions, features, is_active)
VALUES
  ('free', 'Free Community', 'Open Access', 'For small classrooms, internal trials, and coding clubs.', 0, 0, 50, 2, 1, 2, 200, '["Up to 50 Registered Students","2 Concurrent Examinations","Standard In-Browser Compiler","Basic MCQ Engine"]'::jsonb, true),
  ('starter', 'Starter Campus', 'Popular for Departments', 'Designed for individual college departments and mid-size training institutes.', 4999, 49990, 500, 10, 3, 15, 5000, '["Up to 500 Students","10 Examinations","3 Admins","15 Evaluators","Multi-Language Compiler","Standard CCTV Proctoring"]'::jsonb, true),
  ('professional', 'Professional Institutional', 'Most Popular', 'Comprehensive evaluation platform for engineering colleges and universities.', 14999, 149990, 2500, 50, 10, 50, 30000, '["Up to 2,500 Students","50 Exam Halls","10 Admins","50 Evaluators","HD CCTV Wall","Emergency Unlock Keys","Deep AI Forensics"]'::jsonb, true),
  ('enterprise', 'Enterprise University', 'Custom Scale', 'Autonomous multi-campus governance for major universities and accrediting bodies.', 39999, 399990, -1, -1, -1, -1, -1, '["Unlimited Students & Workstations","Unlimited Simultaneous Examinations","Unlimited Admins","Dedicated Intranet Judge0 Server","Custom Institutional Subdomain"]'::jsonb, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_inr_monthly = EXCLUDED.price_inr_monthly,
  price_inr_yearly = EXCLUDED.price_inr_yearly,
  max_students = EXCLUDED.max_students,
  max_exams = EXCLUDED.max_exams,
  features = EXCLUDED.features;

INSERT INTO public.organizations (id, name, slug, domain, plan_id, subscription_status, settings, created_at, updated_at)
VALUES
  ('default_org', 'AXENT Campus Hub', 'default', 'axent.edu', 'professional', 'active', '{"campusName":"AXENT Autonomous Institute","proctoringStrictness":"standard","defaultResultDeclarationMode":"IMMEDIATE"}'::jsonb, (EXTRACT(EPOCH FROM NOW())*1000)::BIGINT, (EXTRACT(EPOCH FROM NOW())*1000)::BIGINT)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.subscriptions (id, org_id, plan_id, status, billing_cycle, current_period_start, current_period_end, usage, updated_at)
VALUES
  ('sub_default_org', 'default_org', 'professional', 'active', 'monthly', (EXTRACT(EPOCH FROM NOW())*1000)::BIGINT, ((EXTRACT(EPOCH FROM NOW()) + 2592000)*1000)::BIGINT, '{"studentsCount":0,"examsCount":0,"adminsCount":1,"evaluatorsCount":0,"monthlySubmissionsCount":0}'::jsonb, (EXTRACT(EPOCH FROM NOW())*1000)::BIGINT)
ON CONFLICT (id) DO NOTHING;
