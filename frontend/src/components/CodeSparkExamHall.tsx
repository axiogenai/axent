import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Code2,
  CheckCircle2,
  Maximize2,
  Minimize2,
  ShieldAlert,
  AlertCircle,
  Lock,
  ArrowRight,
  LogOut,
  Shield
} from 'lucide-react';
import {
  CodeSparkCandidate,
  getActiveCodeSparkCandidate,
  getAllCodeSparkCandidates,
  ensureCodeSparkAptitudeExam,
  prepareCandidateForRound1Retake,
  authorizeCandidateForRound1Retake
} from '../services/codeSparkService';
import {
  getAllExams,
  getAllAttempts,
  onExamsChanged,
  onMcqDataChanged
} from '../services/mcqService';
import { MCQExamConfig } from '../types/mcq';
import { MCQExamScreen } from './MCQExamScreen';
import { Workspace } from './Workspace';
import { CodeSparkRound2Arena } from './codespark/CodeSparkRound2Arena';
import { ErrorBoundary } from './ErrorBoundary';
import { playSound } from '../utils/sounds';
import { requestExamFullscreen, isCurrentlyFullscreen, exitExamFullscreen } from '../services/timeSyncService';
import {
  CodeSubmission,
  AnalysisReport,
  ExecutionHistoryItem,
  CompilerExecutionResult,
  VivaEvaluation,
  ThemeMode
} from '../types/dna';

interface CodeSparkExamHallProps {
  theme?: ThemeMode;
  codeData: CodeSubmission;
  onRunCode: (
    data: CodeSubmission,
    stdin?: string
  ) => Promise<{ report?: AnalysisReport; execResult?: CompilerExecutionResult } | void>;
  onCodeChange: (data: CodeSubmission) => void;
  executionHistory: ExecutionHistoryItem[];
  isExecuting: boolean;
  compilerResult: CompilerExecutionResult | null;
  analysisResults: AnalysisReport | null;
  onClearTerminal: () => void;
  vivaEvaluation: VivaEvaluation | null;
  onVivaComplete: (evaluation: VivaEvaluation) => void;
  onReset: () => void;
}

export const CodeSparkExamHall: React.FC<CodeSparkExamHallProps> = ({
  theme = 'light',
  codeData,
  onRunCode,
  onCodeChange,
  executionHistory,
  isExecuting,
  compilerResult,
  analysisResults,
  onClearTerminal,
  vivaEvaluation,
  onVivaComplete,
  onReset
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 0. Fullscreen Proctoring State & Global Auto-Enforcement
  const [isFullscreen, setIsFullscreen] = useState(() => isCurrentlyFullscreen());

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(isCurrentlyFullscreen());
    };
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach((evt) => {
      document.addEventListener(evt, handleFsChange);
    });
    return () => {
      ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach((evt) => {
        document.removeEventListener(evt, handleFsChange);
      });
    };
  }, []);

  // Auto-request fullscreen once exam hall mounts
  useEffect(() => {
    let timer: any;
    const attemptFs = async () => {
      if (!isCurrentlyFullscreen()) {
        try {
          await requestExamFullscreen();
          setIsFullscreen(true);
        } catch {}
      }
    };
    timer = setTimeout(attemptFs, 350);
    return () => clearTimeout(timer);
  }, []);

  // 1. Candidate Authentication & Identity Verification
  const [candidateProfile] = useState<any>(() => {
    try {
      const active = getActiveCodeSparkCandidate();
      if (active) return active;
      const raw = localStorage.getItem('codedna_student_profile');
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  });

  const candidateName = candidateProfile?.name || 'Candidate';
  const candidateKey = candidateProfile?.accessKey || '';
  const cleanRoll = useMemo(() => {
    if (candidateProfile?.rollNumber) return candidateProfile.rollNumber.toUpperCase();
    if (candidateProfile?.email) return candidateProfile.email.split('@')[0].toUpperCase();
    return candidateKey ? candidateKey.toUpperCase() : '';
  }, [candidateProfile, candidateKey]);

  // 2. Exam Paper Resolution for Round 1 Aptitude
  const [allExams, setAllExams] = useState<MCQExamConfig[]>(() => getAllExams());
  useEffect(() => {
    const unsub = onExamsChanged(() => setAllExams(getAllExams()));
    return unsub;
  }, []);

  const round1Exam = useMemo(() => {
    const assignedId = typeof window !== 'undefined'
      ? localStorage.getItem('codedna_codespark_round1_exam_id')
      : null;
    if (assignedId) {
      const found = allExams.find((e) => e.id === assignedId);
      if (found) return found;
    }

    const queryExamId = searchParams.get('examId');
    if (queryExamId) {
      const found = allExams.find((e) => e.id === queryExamId);
      if (found) return found;
    }

    const profileExamId = candidateProfile?.mcqExamId || candidateProfile?.examId;
    if (profileExamId) {
      const target = allExams.find((e) => e.id === profileExamId);
      if (target) return target;
    }

    const sparkExam = allExams.find((e) => e.isCodeSpark);
    if (sparkExam) return sparkExam;

    const aptExam = allExams.find(
      (e) =>
        e.title.toLowerCase().includes('spark') ||
        e.title.toLowerCase().includes('aptitude')
    );
    if (aptExam) return aptExam;

    if (allExams.length > 0) return allExams[0];

    return ensureCodeSparkAptitudeExam();
  }, [allExams, searchParams, candidateProfile]);

  const effectiveRound1Exam = useMemo(() => {
    return round1Exam || ensureCodeSparkAptitudeExam();
  }, [round1Exam]);

  // 3. Round 1 MCQ Attempt & Completion State
  const [allAttempts, setAllAttempts] = useState(() => getAllAttempts());
  useEffect(() => {
    const handleSync = () => setAllAttempts(getAllAttempts());
    window.addEventListener('storage', handleSync);
    window.addEventListener('codedna_mcq_data_changed', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('codedna_mcq_data_changed', handleSync);
    };
  }, []);

  const isBatch2OrRetake = useMemo(() => {
    const qBatch = searchParams.get('batch');
    const qRetake = searchParams.get('retake');
    if (qBatch === '2' || qRetake === 'true') return true;
    try {
      const activeBatch = localStorage.getItem('codedna_codespark_active_batch');
      if (activeBatch === '2') return true;
    } catch {}
    return false;
  }, [searchParams]);

  const candidateAttempts = useMemo(() => {
    if (!cleanRoll || !round1Exam) return [];
    return allAttempts.filter(
      (a) =>
        (a.studentRoll || '').trim().toUpperCase() === cleanRoll &&
        a.examId === round1Exam.id
    );
  }, [cleanRoll, round1Exam, allAttempts]);

  const round1Attempt = useMemo(() => {
    if (candidateAttempts.length === 0) return null;
    if (isBatch2OrRetake) {
      // 1. In-progress attempt takes highest priority
      const inProg = candidateAttempts.find((a) => a.status === 'IN_PROGRESS');
      if (inProg) return inProg;
      // 2. If there are multiple attempts, the latest is the 2nd attempt
      if (candidateAttempts.length >= 2) {
        return candidateAttempts[candidateAttempts.length - 1];
      }
      // 3. Candidate requested Batch 2 / retake and only has 1 prior attempt from Batch 1:
      // return null so MCQExamScreen lets them start Attempt #2!
      return null;
    }
    // Default Batch 1: Return in-progress if available, else latest
    const inProg = candidateAttempts.find((a) => a.status === 'IN_PROGRESS');
    if (inProg) return inProg;
    return candidateAttempts[candidateAttempts.length - 1] || null;
  }, [candidateAttempts, isBatch2OrRetake]);

  const isRound1Submitted = Boolean(
    round1Attempt &&
      (round1Attempt.status === 'SUBMITTED' || round1Attempt.status === 'TIMED_OUT' || round1Attempt.score !== undefined)
  );

  const round1Score = round1Attempt?.score ?? 0;
  const round1MaxScore = round1Attempt?.maxScore || round1Exam?.totalMarks || 1;
  const round1Pct = Math.round((round1Score / (round1MaxScore || 1)) * 100);

  // 4. Shortlist Gatekeeper Check for Round 2
  const isCandidateShortlisted = useMemo(() => {
    // The portal must pass the dedicated Round 2 credential into the candidate profile.
    // URL query parameters and a cached shortlist list are not sufficient to unlock the arena.
    const issuedKey = String(candidateProfile?.round2Key || '').trim().toUpperCase();
    const presentedKey = String(candidateProfile?.accessKey || '').trim().toUpperCase();
    return Boolean(
      issuedKey &&
      presentedKey === issuedKey &&
      (candidateProfile?.isShortlisted === true || candidateProfile?.status === 'SHORTLISTED')
    );
  }, [candidateProfile]);

  // Active Stage: derived from searchParams ?round=2
  const roundParam = searchParams.get('round');
  const activeStage: 'round1' | 'round2' = useMemo(() => {
    if (roundParam === '2' || roundParam === 'coding') return 'round2';
    return 'round1';
  }, [roundParam]);

  const handleExitToPortal = () => {
    playSound('click');
    navigate('/code-spark', { replace: true });
  };

  const handleLaunchBatch2Retake = () => {
    playSound('click');
    if (!effectiveRound1Exam) {
      navigate('/codespark');
      return;
    }
    if (cleanRoll) {
      authorizeCandidateForRound1Retake(cleanRoll, true);
      prepareCandidateForRound1Retake(cleanRoll, effectiveRound1Exam.id);
    }
    navigate(`/codespark-exams?examId=${effectiveRound1Exam.id}&round=1&batch=2&retake=true&autoStart=true`);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-main)',
        color: 'var(--text-primary)',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      {/* Fullscreen overlay disabled to prevent student lockout */ null}

      {/* ── Active Stage Area ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {activeStage === 'round1' ? (
          /* Round 1: General Aptitude MCQ Conduction */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {isRound1Submitted ? (
              /* Official Round 1 Concluded & Sealed Screen */
              <div
                style={{
                  minHeight: '100vh',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#09090b',
                  padding: '24px'
                }}
              >
                <div
                  style={{
                    maxWidth: '560px',
                    width: '100%',
                    background: '#121214',
                    border: '1px solid #27272a',
                    borderRadius: '8px',
                    padding: '36px 32px',
                    textAlign: 'center'
                  }}
                >
                  <div
                    style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '8px',
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#10b981',
                      marginBottom: '18px'
                    }}
                  >
                    <CheckCircle2 size={28} />
                  </div>

                  <div
                    style={{
                      display: 'inline-block',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#a1a1aa',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      marginBottom: '6px'
                    }}
                  >
                    CODE SPARK 2026 • ROUND 01 CONCLUDED
                  </div>

                  <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#f4f4f5', margin: '0 0 10px 0' }}>
                    Aptitude Examination Completed
                  </h2>

                  <p style={{ fontSize: '13.5px', color: '#a1a1aa', lineHeight: 1.6, margin: '0 0 24px 0' }}>
                    Your examination session has officially concluded and all answers have been securely sealed into the institutional evaluation ledger.
                  </p>

                  <div
                    style={{
                      background: '#18181b',
                      border: '1px solid #27272a',
                      borderRadius: '6px',
                      padding: '16px',
                      textAlign: 'left',
                      marginBottom: '24px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: '#71717a' }}>Candidate:</span>
                      <strong style={{ color: '#f4f4f5' }}>{candidateName} [{candidateKey || 'VERIFIED'}]</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: '#71717a' }}>Exam Paper:</span>
                      <span style={{ color: '#f4f4f5' }}>{effectiveRound1Exam?.title || 'CodeSpark Round 1 Aptitude'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: '#71717a' }}>Assessment Score:</span>
                      <strong style={{ color: '#10b981' }}>{round1Score} / {round1MaxScore} ({round1Pct}%)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: '#71717a' }}>Session Status:</span>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>SUBMITTED &amp; LIBERATED</span>
                    </div>
                  </div>

                  {/* Crucial Shortlisting Notice */}
                  <div
                    style={{
                      background: 'rgba(59, 130, 246, 0.08)',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      borderRadius: '6px',
                      padding: '14px 16px',
                      textAlign: 'left',
                      marginBottom: '16px',
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'flex-start'
                    }}
                  >
                    <Shield size={18} style={{ color: '#60a5fa', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.5 }}>
                      <strong style={{ color: '#ffffff', display: 'block', marginBottom: '2px' }}>
                        Round 2 Shortlisting Notice:
                      </strong>
                      Round 2 (Algorithmic Coding Sprint Arena) is strictly gated. Only shortlisted candidates based on institutional cutoff will receive their <strong>new Round 2 access code via email</strong>. Please monitor your registered email address for official results.
                    </div>
                  </div>

                  

                  <button
                    type="button"
                    onClick={handleExitToPortal}
                    style={{
                      width: '100%',
                      padding: '12px 24px',
                      borderRadius: '6px',
                      background: '#f4f4f5',
                      color: '#09090b',
                      fontSize: '13px',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <LogOut size={14} />
                    <span>Return to CodeSpark Portal</span>
                  </button>
                </div>
              </div>
            ) : (
              <ErrorBoundary fallbackTitle="CodeSpark Examination Engine Error">
                <MCQExamScreen
                  examId={effectiveRound1Exam?.id || ''}
                  onBack={handleExitToPortal}
                />
              </ErrorBoundary>
            )}
          </div>
        ) : (
          /* Round 2: Algorithmic Code Sprint Arena */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {isCandidateShortlisted ? (
              <ErrorBoundary fallbackTitle="CodeSpark Coding Arena Error">
                <CodeSparkRound2Arena
                  candidateProfile={
                    candidateProfile || {
                      name: candidateName,
                      rollNumber: cleanRoll,
                      accessKey: candidateKey,
                      email: candidateProfile?.email || ''
                    }
                  }
                  onExit={handleExitToPortal}
                  theme={theme}
                />
              </ErrorBoundary>
            ) : (
              /* Gatekeeper Access Denied for Non-Shortlisted */
              <div
                style={{
                  minHeight: '100vh',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#09090b',
                  padding: '24px'
                }}
              >
                <div
                  style={{
                    maxWidth: '520px',
                    width: '100%',
                    background: '#121214',
                    border: '1px solid #27272a',
                    borderRadius: '8px',
                    padding: '36px 32px',
                    textAlign: 'center'
                  }}
                >
                  <div
                    style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '8px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ef4444',
                      marginBottom: '18px'
                    }}
                  >
                    <Lock size={28} />
                  </div>

                  <h2 style={{ fontSize: '19px', fontWeight: 800, color: '#f4f4f5', margin: '0 0 10px 0' }}>
                    Round 2 Access Restricted
                  </h2>

                  <p style={{ fontSize: '13px', color: '#a1a1aa', lineHeight: 1.6, margin: '0 0 24px 0' }}>
                    The Algorithmic Coding Sprint Arena is exclusively reserved for candidates shortlisted from Round 1 General Aptitude. Only shortlisted students receive an email with their new Round 2 access code.
                  </p>

                  <button
                    type="button"
                    onClick={handleExitToPortal}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '6px',
                      background: '#f4f4f5',
                      color: '#09090b',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <LogOut size={14} />
                    <span>Return to CodeSpark Portal</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default CodeSparkExamHall;
