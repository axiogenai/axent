import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  UploadCloud,
  X,
  Layers,
  Terminal,
  ShieldCheck
} from 'lucide-react';
import {
  checkSupabaseHealth,
  SupabaseHealthReport,
  syncAllLocalToCloud
} from '../services/supabaseService';
import { getAllQuestions, getAllExams } from '../services/mcqService';
import { getAllCollegeLabs } from '../services/adminService';
import { playSound } from '../utils/sounds';
import mcqSecurityMigration from '../../supabase_migrations/20261016_mcq_server_authority.sql?raw';

interface SupabaseMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseMigrationModal: React.FC<SupabaseMigrationModalProps> = ({ isOpen, onClose }) => {
  const [report, setReport] = useState<SupabaseHealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedSecurity, setCopiedSecurity] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);

  const sqlSchema = `-- ============================================================================
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
`;

  const runHealthCheck = async () => {
    setLoading(true);
    try {
      const res = await checkSupabaseHealth();
      setReport(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runHealthCheck();
      setSyncSummary(null);
    }
  }, [isOpen]);

  const handleCopySQL = () => {
    navigator.clipboard.writeText(sqlSchema);
    setCopied(true);
    playSound('success');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopySecurityMigration = async () => {
    try {
      await navigator.clipboard.writeText(mcqSecurityMigration);
      setCopiedSecurity(true);
      playSound('success');
      setTimeout(() => setCopiedSecurity(false), 2500);
    } catch {
      playSound('warning');
    }
  };

  const handleSyncData = async () => {
    setSyncing(true);
    setSyncSummary(null);
    try {
      const questions = getAllQuestions();
      const exams = getAllExams();
      const labs = getAllCollegeLabs();
      const res = await syncAllLocalToCloud(questions, exams, labs);
      setSyncSummary(`Synced: ${res.questionsSynced} Questions, ${res.examsSynced} Exams, ${res.labsSynced} Labs to Central Cloud Database!`);
      playSound('success');
      runHealthCheck();
    } catch (err: any) {
      setSyncSummary(`Sync error: ${err?.message || 'Failed to sync'}`);
      playSound('warning');
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(8px, 2vw, 16px)'
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 'min(820px, calc(100vw - 16px))',
          maxHeight: '90vh',
          boxSizing: 'border-box',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Database size={16} color="var(--accent)" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Central Cloud Database & Schema Manager
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                Endpoint: <code style={{ color: 'var(--accent)' }}>Central Dedicated Cluster (Primary Node)</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: 'var(--radius-sm)'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Status Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px'
            }}
          >
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
                REST Connection
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: report?.connected ? 'var(--success)' : 'var(--warning)' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: report?.connected ? 'var(--success)' : 'var(--warning)' }} />
                <span>{report?.connected ? 'PostgREST Gateway Connected' : 'Connecting...'}</span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
                PostgreSQL Schema Status
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: report?.allTablesLive ? 'var(--success)' : 'var(--warning)' }}>
                {report?.allTablesLive ? (
                  <>
                    <CheckCircle2 size={14} color="var(--success)" />
                    <span>All 6 Tables Active in Cloud</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} color="var(--warning)" />
                    <span>Tables Need 1-Click Run in SQL Editor</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Table Verification Matrix */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={13} />
                <span>Live Table Verification Grid</span>
              </div>
              <button
                onClick={runHealthCheck}
                disabled={loading}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 8px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <RefreshCw size={11} className={loading ? 'spin' : ''} />
                <span>{loading ? 'Checking...' : 'Re-verify Tables'}</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[
                { name: 'mcq_questions', label: 'MCQ Question Bank' },
                { name: 'mcq_exams', label: 'MCQ Exam Configs' },
                { name: 'mcq_attempts', label: 'Student Attempts' },
                { name: 'candidate_stations', label: 'CCTV Telemetry Grid' },
                { name: 'college_labs', label: 'Institute Laboratories' },
                { name: 'code_submissions', label: 'Coding Submissions' },
              ].map((tbl) => {
                const isLive = report?.tables[tbl.name as keyof typeof report.tables] ?? false;
                return (
                  <div
                    key={tbl.name}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: `1px solid ${isLive ? 'var(--border)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{tbl.name}</div>
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{tbl.label}</div>
                    </div>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-pill)',
                        background: isLive ? 'rgba(74, 222, 128, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                        color: isLive ? 'var(--success)' : 'var(--warning)',
                        border: `1px solid ${isLive ? 'rgba(74, 222, 128, 0.2)' : 'rgba(234, 179, 8, 0.2)'}`
                      }}
                    >
                      {isLive ? 'ACTIVE' : 'NOT FOUND'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 1-Click Migration Guide */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Terminal size={13} />
              <span>How to Apply the Schema in 5 Seconds</span>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              The baseline schema creates the tables and restricts MCQ tables to trusted authority roles. For existing projects, apply the separate Step 4 migration below to add ticket-based candidate access and server-side grading. Coding-table policies remain unchanged in this step.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={handleCopySQL}
                style={{
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '9px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--accent-contrast)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                <span>{copied ? 'Copied 150-Line Schema!' : '1. Copy Full Schema SQL'}</span>
              </button>

              <a
                href="https://supabase.com/dashboard/project/htfjwfwleyljbkftmthd/sql"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '9px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <ExternalLink size={13} />
                <span>3. Open Database SQL Console & Run</span>
              </a>

              <button
                onClick={handleCopySecurityMigration}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '9px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {copiedSecurity ? <Check size={13} /> : <ShieldCheck size={13} />}
                <span>{copiedSecurity ? 'Copied Step 4 Migration' : '2. Copy Step 4 Security Migration'}</span>
              </button>

              <button
                onClick={handleSyncData}
                disabled={syncing}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '9px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <UploadCloud size={13} />
                <span>{syncing ? 'Syncing...' : '4. Bulk Sync Local Data to Cloud'}</span>
              </button>
            </div>

            {syncSummary && (
              <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                {syncSummary}
              </div>
            )}
          </div>

          {/* SQL Schema Preview */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                production_schema.sql (Ready to Paste)
              </span>
              <button
                onClick={handleCopySQL}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Copy size={11} />
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre
              style={{
                margin: 0,
                maxHeight: '180px',
                overflowY: 'auto',
                background: 'var(--bg-main)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px',
                fontSize: '11px',
                fontFamily: 'monospace',
                color: 'var(--text-secondary)',
                lineHeight: 1.4
              }}
            >
              {sqlSchema}
            </pre>
          </div>

        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            CodeDNA auto-syncs to Central Cloud Database on every question save, attempt submit, and lab change.
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
