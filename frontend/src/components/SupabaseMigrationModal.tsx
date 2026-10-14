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
  Terminal
} from 'lucide-react';
import {
  checkSupabaseHealth,
  SupabaseHealthReport,
  syncAllLocalToCloud
} from '../services/supabaseService';
import { getAllQuestions, getAllExams } from '../services/mcqService';
import { getAllCollegeLabs } from '../services/adminService';
import { playSound } from '../utils/sounds';

interface SupabaseMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseMigrationModal: React.FC<SupabaseMigrationModalProps> = ({ isOpen, onClose }) => {
  const [report, setReport] = useState<SupabaseHealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);

  const sqlSchema = `-- ============================================================================
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
    start_time BIGINT NOT NULL,
    deadline BIGINT NOT NULL,
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
CREATE POLICY "Allow public read-write for code_submissions" ON public.code_submissions FOR ALL USING (true) WITH CHECK (true);`;

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
        padding: '20px'
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '820px',
          maxHeight: '90vh',
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
              The central cloud database gateway enforces strict schema security and prevents automated <code style={{ color: 'var(--accent)' }}>CREATE TABLE</code> execution over anonymous HTTP. To provision or verify tables:
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
                href="https://supabase.com/dashboard/project/jswcwixeoilxuhbzojee/sql"
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
                <span>2. Open Database SQL Console & Run</span>
              </a>

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
                <span>{syncing ? 'Syncing...' : '3. Bulk Sync Local Data to Cloud'}</span>
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
