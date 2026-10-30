import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileEdit,
  BookOpen,
  BarChart2,
  GraduationCap,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Database,
  Bot,
  ExternalLink,
  Award,
  Code2,
  Key
} from 'lucide-react';
import { CodeSparkCandidateImportModal } from './codespark/CodeSparkCandidateImportModal';
import { MCQQuestionBank } from './MCQQuestionBank';
import { MCQCreateExam } from './MCQCreateExam';
import { MCQResults } from './MCQResults';
import { AIPaperGeneratorModal } from './AIPaperGeneratorModal';
import { CodingQuestionsTab } from './coding/CodingQuestionsTab';
import { getAllCodingQuestions, onCodingDataChanged } from '../services/codingQuestionService';
import {
  WatermelonStatCard,
  ContinuousTabs,
  MetricTag
} from './watermelon-ui';
import {
  getAllExams,
  getAllQuestions,
  getAllAttempts,
  onMcqDataChanged,
  onExamsChanged,
  syncFromSupabase
} from '../services/mcqService';
import { isAuthorityAdmin } from '../services/authService';
import { playSound } from '../utils/sounds';
import { MCQExamConfig, MCQQuestion, MCQAttempt } from '../types/mcq';
import { AIPaperGenerationResult } from '../services/groqService';

type PaperSetterTab = 'exams' | 'bank' | 'results' | 'coding';

export const PaperSetterPortal: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<PaperSetterTab>('exams');
  const [exams, setExams] = useState<MCQExamConfig[]>(() => getAllExams());
  const [questions, setQuestions] = useState<MCQQuestion[]>(() => getAllQuestions());
  const [attempts, setAttempts] = useState<MCQAttempt[]>(() => getAllAttempts());
  const [codingCount, setCodingCount] = useState<number>(() => getAllCodingQuestions().length);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);

  const isAdmin = isAuthorityAdmin();

  // Load and subscribe to live data changes
  const loadData = () => {
    setExams(getAllExams());
    setQuestions(getAllQuestions());
    setAttempts(getAllAttempts());
    setCodingCount(getAllCodingQuestions().length);
    const now = new Date();
    setLastRefreshed(
      now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
  };

  useEffect(() => {
    loadData();
    const unsubData = onMcqDataChanged(loadData);
    const unsubExams = onExamsChanged(loadData);
    const unsubCoding = onCodingDataChanged(loadData);
    window.addEventListener('storage', loadData);

    return () => {
      unsubData();
      unsubExams();
      unsubCoding();
      window.removeEventListener('storage', loadData);
    };
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    playSound('click');
    try {
      await syncFromSupabase();
      loadData();
      playSound('success');
    } catch {
      playSound('warning');
    } finally {
      setIsSyncing(false);
    }
  };

  // Ã¢â€â‚¬Ã¢â€â‚¬ Metrics Calculations Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const publishedCount = useMemo(
    () => exams.filter((e) => e.status === 'PUBLISHED').length,
    [exams]
  );
  const draftCount = useMemo(
    () => exams.filter((e) => e.status === 'DRAFT').length,
    [exams]
  );

  const easyQuestions = useMemo(
    () => questions.filter((q) => q.difficulty === 'EASY').length,
    [questions]
  );
  const medQuestions = useMemo(
    () => questions.filter((q) => q.difficulty === 'MEDIUM').length,
    [questions]
  );
  const hardQuestions = useMemo(
    () => questions.filter((q) => q.difficulty === 'HARD').length,
    [questions]
  );

  const submittedAttempts = useMemo(
    () => attempts.filter((a) => a.status === 'SUBMITTED' || a.status === 'TIMED_OUT').length,
    [attempts]
  );
  const liveSittingAttempts = useMemo(
    () => attempts.filter((a) => a.status === 'IN_PROGRESS').length,
    [attempts]
  );

  const averageScorePct = useMemo(() => {
    const scored = attempts.filter((a) => a.percentageScore !== undefined && a.percentageScore !== null);
    if (scored.length === 0) return 0;
    const sum = scored.reduce((acc, a) => acc + (a.percentageScore || 0), 0);
    return Math.round(sum / scored.length);
  }, [attempts]);

  const cleanCompliancePct = useMemo(() => {
    if (attempts.length === 0) return 100;
    const clean = attempts.filter((a) => (a.tabSwitchCount || 0) === 0 && (!a.infractionLog || a.infractionLog.length === 0));
    return Math.round((clean.length / attempts.length) * 100);
  }, [attempts]);

  return (
    <div
      className="paper-setter-portal-layout"
      style={{
        minHeight: 'calc(100vh - 52px)',
        background: 'var(--bg-main)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: 'clamp(14px, 2.5vw, 24px)',
        boxSizing: 'border-box'
      }}
    >
      {/* Ã¢â€â‚¬Ã¢â€â‚¬ 1. TOP FACULTY KPI METRICS RIBBON (Watermelon Stat Cards) Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
          gap: '12px'
        }}
      >
        <WatermelonStatCard
          label="EXAM PAPERS"
          value={exams.length}
          subtext={`${publishedCount} Published · ${draftCount} Drafts`}
          icon={<FileEdit size={14} />}
          iconColor="var(--accent)"
          badgeBg="var(--bg-surface)"
          footerDotColor={publishedCount > 0 ? 'var(--success)' : 'var(--text-muted)'}
          onClick={() => setActiveTab('exams')}
        />

        <WatermelonStatCard
          label="QUESTION REPOSITORY"
          value={questions.length}
          subtext={`${easyQuestions} Easy · ${medQuestions} Med · ${hardQuestions} Hard`}
          icon={<BookOpen size={14} />}
          iconColor="var(--accent)"
          badgeBg="var(--bg-surface)"
          footerDotColor="var(--accent)"
          onClick={() => setActiveTab('bank')}
        />

        <WatermelonStatCard
          label="STUDENT ATTEMPTS"
          value={attempts.length}
          subtext={`${submittedAttempts} Graded · ${liveSittingAttempts} Live Sitting`}
          icon={<Award size={14} />}
          iconColor="var(--accent)"
          badgeBg="var(--bg-surface)"
          footerDotColor={liveSittingAttempts > 0 ? 'var(--warning)' : 'var(--success)'}
          onClick={() => setActiveTab('results')}
        />

        <WatermelonStatCard
          label="INTEGRITY COMPLIANCE"
          value={`${cleanCompliancePct}%`}
          subtext={`Avg Score: ${averageScorePct}% · Zero Tamper`}
          icon={<ShieldCheck size={14} />}
          iconColor={cleanCompliancePct >= 90 ? 'var(--success)' : 'var(--warning)'}
          badgeBg="var(--bg-surface)"
          footerDotColor={cleanCompliancePct >= 90 ? 'var(--success)' : 'var(--danger)'}
          onClick={() => setActiveTab('results')}
        />
      </div>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ 2. EXECUTIVE COMMAND & ACTION BAR (Matching AdminDashboard) Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div
        className="card-elevated"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          padding: '16px 20px',
          border: '1px solid var(--border)',
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: '100%'
        }}
      >
        <div style={{ maxWidth: '100%', minWidth: 0, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', width: '100%', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: 'var(--accent-subtle)',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--accent)',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  flexShrink: 0
                }}
              >
                <GraduationCap size={11} />
                <span>PAPER SETTER</span>
              </span>
              <span className="hidden sm:inline" style={{ fontSize: '11px', color: 'var(--border-strong)' }}>/</span>
              <span className="hidden sm:inline" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Academic Board Matrix
              </span>
            </div>
            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              Updated: {lastRefreshed || 'Just now'}
            </span>
          </div>

          <h2 style={{ fontSize: 'clamp(16px, 2.5vw, 19px)', fontWeight: 800, margin: '2px 0 3px', color: 'var(--text-primary)', lineHeight: 1.25 }}>
            Faculty Question Matrix
          </h2>
          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Author questions, configure papers, and schedule examination sittings
          </div>
        </div>

        {/* Action Controls Cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* AI Paper Generator Trigger */}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setShowAIModal(true);
              playSound('click');
            }}
            style={{
              gap: '6px',
              fontSize: '11.5px',
              fontWeight: 600,
              padding: '6px 14px'
            }}
            title="Launch autonomous Groq AI paper blueprint generator"
          >
            <Bot size={13} />
            <span>+ AI Paper Generator</span>
          </button>

                    {/* CodeSpark Private Candidates & Keys */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setShowCandidateModal(true);
              playSound('click');
            }}
            style={{
              gap: '6px',
              fontSize: '11.5px',
              fontWeight: 600,
              padding: '6px 14px'
            }}
            title="Import candidates and issue AXNT-XXXX private keys for CodeSpark"
          >
            <Key size={13} color="var(--accent)" />
            <span>CodeSpark Candidates (AXNT-XXXX)</span>
          </button>
          {/* Quick Jump to Student Exam Hall */}
          <a
            href="/mcq"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
            style={{
              textDecoration: 'none',
              gap: '5px',
              fontSize: '11.5px',
              padding: '6px 12px'
            }}
            title="Open Examination Hall in a new browser tab to inspect candidate experience"
          >
            <ExternalLink size={12} />
            <span>Candidate Hall</span>
          </a>

          {/* Cloud Database Connected Pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '5px 10px',
              fontSize: '11px',
              color: 'var(--text-secondary)'
            }}
            title="Supabase cloud database synchronization status"
          >
            <Database size={12} color="var(--accent)" />
            <span>Cloud DB: <strong>Active</strong></span>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--success)',
                display: 'inline-block'
              }}
            />
          </div>

          {/* Sync / Refresh Button */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleManualSync}
            disabled={isSyncing}
            style={{ gap: '5px', fontSize: '11.5px', padding: '6px 12px' }}
            title="Manually trigger cloud sync with Supabase database"
          >
            <RefreshCw size={12} className={isSyncing ? 'spin' : ''} />
            <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
          </button>

          {/* 1-Click to Chief Proctor CCTV Control Room */}
          <button
            type="button"
            onClick={() => {
              playSound('click');
              navigate('/admin');
            }}
            className="btn btn-secondary btn-sm"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11.5px',
              fontWeight: 600,
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              background: 'rgba(239, 68, 68, 0.08)',
              color: '#ef4444',
              cursor: 'pointer'
            }}
            title="Return to Chief Proctor CCTV Live Surveillance Control Room"
          >
            <ShieldAlert size={13} color="#ef4444" />
            <span>Chief Proctor CCTV</span>
          </button>
        </div>
      </div>



      {/* Ã¢â€â‚¬Ã¢â€â‚¬ 4. FILTER TABS & SUB-PORTAL SELECTION (ContinuousTabs) Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          width: '100%',
          maxWidth: '100%'
        }}
      >
        <div className="admin-tabs-scroll-wrapper" style={{ maxWidth: '100%', width: '100%' }}>
          <ContinuousTabs
            className="continuous-tabs-mobile-stack"
            layoutId="paper-setter-portal-tabs"
            size="sm"
            activeId={activeTab}
            onChange={(id: string) => {
              playSound('click');
              setActiveTab(id as PaperSetterTab);
            }}
            tabs={[
              {
                id: 'exams',
                label: 'Manage & Schedule Exams',
                icon: <FileEdit size={12} />,
                badge: exams.length,
                badgeTone: 'accent'
              },
              {
                id: 'bank',
                label: 'Question Bank & Blueprints',
                icon: <BookOpen size={12} />,
                badge: questions.length,
                badgeTone: 'neutral'
              },
              {
                id: 'coding',
                label: 'Coding Problems & Test Cases',
                icon: <Code2 size={12} />,
                badge: codingCount,
                badgeTone: 'accent'
              },
              {
                id: 'results',
                label: 'Results, Ledgers & Analytics',
                icon: <BarChart2 size={12} />,
                badge: attempts.length,
                badgeTone: 'success'
              }
            ]}
          />
        </div>
      </div>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ 5. MAIN TAB CONTENT AREA Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div style={{ width: '100%', boxSizing: 'border-box' }}>
        {activeTab === 'exams' && <MCQCreateExam />}
        {activeTab === 'bank' && <MCQQuestionBank />}
        {activeTab === 'coding' && <CodingQuestionsTab createdBy="paper_setter" />}
        {activeTab === 'results' && <MCQResults />}
      </div>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Autonomous AI Paper Generator Modal Ã¢â€â‚¬Ã¢â€â‚¬ */}
            {/* CodeSpark Private Candidate Import & AXNT Key Generator Modal */}
      {showCandidateModal && (
        <CodeSparkCandidateImportModal
          isOpen={showCandidateModal}
          onClose={() => {
            setShowCandidateModal(false);
            loadData();
          }}
        />
      )}
      {showAIModal && (
        <AIPaperGeneratorModal
          isOpen={showAIModal}
          onClose={() => setShowAIModal(false)}
          onPaperGenerated={(_result: AIPaperGenerationResult) => {
            setShowAIModal(false);
            loadData();
            setActiveTab('exams');
            playSound('success');
          }}
        />
      )}
    </div>
  );
};

export default PaperSetterPortal;
