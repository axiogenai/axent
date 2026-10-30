import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import {
  Code2,
  CheckCircle2,
  AlertCircle,
  Play,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Check,
  Send,
  Terminal,
  Maximize2,
  Minimize2,
  Copy,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  Clock,
  ShieldAlert,
  Loader2,
  FileCheck,
  XCircle,
  LogOut,
  Brain} from 'lucide-react';
import {
  Round2Problem,
  Round2QuestionReport,
  Round2CandidateSubmission,
  detectLanguageFromCode,
  evaluateRound2Code,
  fetchRound2ProblemsFromCloud,
  getAllRound2Problems,
  getStoredRound2Submission,
  saveStoredRound2Submission,
  finalizeRound2Submission,
  selectStudentRound2Problems,
  pushRound2LiveCodeToCloud
} from '../../services/round2CodingService';
import { playSound } from '../../utils/sounds';
import { requestExamFullscreen, isCurrentlyFullscreen, exitExamFullscreen } from '../../services/timeSyncService';
import { ThemeMode } from '../../types/dna';
interface CodeSparkRound2ArenaProps {
  candidateProfile: {
    name: string;
    rollNumber: string;
    accessKey: string;
    email: string;
    department?: string;
    stationNumber?: string;
    round2Key?: string;
  };
  onExit: () => void;
  theme?: ThemeMode;
}
const MONACO_LANG_MAP: Record<string, string> = {
  Python: 'python',
  'C++': 'cpp',
  C: 'c',
  Java: 'java'
};
export const CodeSparkRound2Arena: React.FC<CodeSparkRound2ArenaProps> = ({
  candidateProfile,
  onExit,
  theme = 'dark'
}) => {
  // --- 2. Candidate Submission & Progress State |
  const candidateKey = candidateProfile.round2Key || candidateProfile.accessKey || 'GUEST';
  const cleanRoll = candidateProfile.rollNumber || candidateProfile.email.split('@')[0] || 'CANDIDATE';
  // --- 1. Problems State: Individualized 5 randomized questions from 10+ pool |
  const [problems, setProblems] = useState<Round2Problem[]>(() => {
    const all = getAllRound2Problems().map((problem) => ({ ...problem, hiddenTestCases: [] }));
    // Purge any legacy hidden-test cache that may have been downloaded by older builds.
    try { localStorage.setItem('codedna_codespark_r2_problems', JSON.stringify(all)); } catch {}
    return selectStudentRound2Problems(all, candidateKey);
  });
  const [loadingProblems, setLoadingProblems] = useState(true);
  useEffect(() => {
    let mounted = true;
    const loadProblems = async () => {
      try {
        const cloudProblems = await fetchRound2ProblemsFromCloud();
        if (mounted && Array.isArray(cloudProblems) && cloudProblems.length > 0) {
          const student5 = selectStudentRound2Problems(cloudProblems, candidateKey);
          setProblems(student5);
        }
      } catch (err) {
        console.warn('Failed to load cloud problems, using local defaults:', err);
      } finally {
        if (mounted) setLoadingProblems(false);
      }
    };
    void loadProblems();
    return () => {
      mounted = false;
    };
  }, [candidateKey]);
  const [submission, setSubmission] = useState<Round2CandidateSubmission>(() => {
    const existing = getStoredRound2Submission(candidateKey);
    if (existing) return existing;
    return {
      candidateKey,
      round2Key: candidateProfile.round2Key,
      candidateName: candidateProfile.name || 'Candidate',
      rollNumber: cleanRoll,
      email: candidateProfile.email || '',
      department: candidateProfile.department,
      stationNumber: candidateProfile.stationNumber || 'Station #01',
      questionReports: {},
      currentQuestion: 1,
      totalScore: 0,
      maxScore: 100,
      isSubmitted: false,
      startedAt: Date.now(),
      dominantLanguage: 'Python'
    };
  });
  // Current Active Question (1-indexed: 1 to 5)
  const [currentQIndex, setCurrentQIndex] = useState<number>(submission.currentQuestion || 1);
  const currentProblem: Round2Problem = useMemo(() => {
    const found = problems.find((p) => p.number === currentQIndex);
    return found || problems[0] || ({} as Round2Problem);
  }, [problems, currentQIndex]);
  // Code buffer per question
  const [codeMap, setCodeMap] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    for (let i = 1; i <= 5; i++) {
      const rep = submission.questionReports[i];
      if (rep && rep.code) {
        map[i] = rep.code;
      } else {
        // default starter code for Python if available
        const p = problems.find((prob) => prob.number === i);
        map[i] = p?.starterCode?.Python || '';
      }
    }
    return map;
  });
  // Language selection & Auto-detect
  const [explicitLanguageMap, setExplicitLanguageMap] = useState<Record<number, 'Auto' | 'Python' | 'C++' | 'C' | 'Java'>>({
    1: 'Auto',
    2: 'Auto',
    3: 'Auto',
    4: 'Auto',
    5: 'Auto'
  });
  const activeCode = codeMap[currentQIndex] ?? '';
  const currentExplicit = explicitLanguageMap[currentQIndex] || 'Auto';
  // Detected language
  const detectedLang = useMemo(() => {
    return detectLanguageFromCode(activeCode);
  }, [activeCode]);
  const effectiveLang: 'C' | 'C++' | 'Python' | 'Java' = useMemo(() => {
    if (currentExplicit !== 'Auto') return currentExplicit;
    return detectedLang;
  }, [currentExplicit, detectedLang]);
  // Compilation & Output State
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInputText, setCustomInputText] = useState('');
  const [activeReport, setActiveReport] = useState<Round2QuestionReport | null>(() => {
    return submission.questionReports[currentQIndex] || null;
  });
  // Keep active report in sync when switching question tabs
  useEffect(() => {
    setActiveReport(submission.questionReports[currentQIndex] || null);
    setCompileError(null);
  }, [currentQIndex, submission.questionReports]);
  // Sync submission to backend when changes occur
  const updateSubmissionState = useCallback(
    (newSub: Round2CandidateSubmission) => {
      setSubmission(newSub);
      saveStoredRound2Submission(newSub);
    },
    []
  );
  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(() => isCurrentlyFullscreen());
  useEffect(() => {
    const handleFs = () => setIsFullscreen(isCurrentlyFullscreen());
    document.addEventListener('fullscreenchange', handleFs);
    return () => document.removeEventListener('fullscreenchange', handleFs);
  }, []);
  const handleToggleFullscreen = async () => {
    if (isCurrentlyFullscreen()) {
      await exitExamFullscreen();
      setIsFullscreen(false);
    } else {
      await requestExamFullscreen();
      setIsFullscreen(true);
    }
  };
  // Editor ref
  const editorRef = useRef<any>(null);
  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    if (monaco && monaco.editor && typeof monaco.editor.remeasureFonts === 'function') {
      monaco.editor.remeasureFonts();
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          monaco.editor.remeasureFonts();
        });
      }
    }
  };
  const liveSyncTimer = useRef<any>(null);
  const handleCodeChange = (val: string | undefined) => {
    const code = val || '';
    setCodeMap((prev) => ({ ...prev, [currentQIndex]: code }));
    // Debounced live code push to candidate_stations in cloud
    if (liveSyncTimer.current) clearTimeout(liveSyncTimer.current);
    liveSyncTimer.current = setTimeout(() => {
      void pushRound2LiveCodeToCloud(candidateProfile, code, effectiveLang, currentQIndex);
    }, 1000);
  };
  // --- 3. Compile & Test Execution |
  const handleCompileAndRun = async () => {
    if (!currentProblem || !currentProblem.id) return;
    setIsCompiling(true);
    setCompileError(null);
    playSound('click');
    try {
      const qTimestamps = submission.questionTimestamps || {};
      const qStart = qTimestamps[currentQIndex]?.startedAt || Date.now();
      const timeTakenMs = Date.now() - qStart;
      const report = await evaluateRound2Code(currentProblem, activeCode, effectiveLang, timeTakenMs, showCustomInput ? customInputText : undefined, candidateProfile.round2Key || candidateProfile.accessKey);
      // Track question start and compiled timestamps
      report.startedAt = qStart;
      report.startedAtFormatted = new Date(qStart).toLocaleTimeString();
      report.timeTakenSeconds = Math.max(1, Math.round((report.compiledAt - qStart) / 1000));
      setActiveReport(report);
      const updatedTimestamps = {
        ...qTimestamps,
        [currentQIndex]: {
          startedAt: qStart,
          startedAtFormatted: new Date(qStart).toLocaleTimeString(),
          compiledAt: report.compiledAt,
          compiledAtFormatted: report.compiledAtFormatted
        }
      };
      // Recalculate candidate total score
      const updatedReports = {
        ...submission.questionReports,
        [currentQIndex]: report
      };
      let totalScore = 0;
      let totalMax = 0;
      const langCounts: Record<string, number> = { Python: 0, 'C++': 0, C: 0 };
      Object.values(updatedReports).forEach((rep) => {
        totalScore += rep.score || 0;
        totalMax += rep.maxScore || 20;
        if (rep.language) {
          langCounts[rep.language] = (langCounts[rep.language] || 0) + 1;
        }
      });
      // Find dominant language
      let dominant = 'Python';
      let maxCnt = -1;
      Object.entries(langCounts).forEach(([l, cnt]) => {
        if (cnt > maxCnt) {
          maxCnt = cnt;
          dominant = l;
        }
      });
      const updatedSub: Round2CandidateSubmission = {
        ...submission,
        questionReports: updatedReports,
        questionTimestamps: updatedTimestamps,
        currentQuestion: currentQIndex,
        totalScore,
        maxScore: totalMax || 100,
        dominantLanguage: dominant
      };
      updateSubmissionState(updatedSub);
      if (report.status === 'ACCEPTED') {
        playSound('success');
      } else {
        playSound('warning');
      }
    } catch (err: any) {
      console.error('Compilation error:', err);
      setCompileError(err?.message || 'Compiler execution failed. Please verify syntax and retry.');
      playSound('error');
    } finally {
      setIsCompiling(false);
    }
  };
  // --- 4. Question Navigation |
  const handleSelectQuestion = (qNum: number) => {
    if (qNum < 1 || qNum > 5) return;
    playSound('click');
    const now = Date.now();
    const prevTimestamps = submission.questionTimestamps || {};
    const updatedPrev = { ...prevTimestamps };

    // Record transition timestamp on previous question
    if (updatedPrev[currentQIndex]) {
      updatedPrev[currentQIndex] = {
        ...updatedPrev[currentQIndex],
        nextQuestionStartedAt: now,
        nextQuestionStartedAtFormatted: new Date(now).toLocaleTimeString()
      };
    }
    // Initialize startedAt on target question if not yet set
    if (!updatedPrev[qNum]?.startedAt) {
      updatedPrev[qNum] = {
        ...(updatedPrev[qNum] || {}),
        startedAt: now,
        startedAtFormatted: new Date(now).toLocaleTimeString()
      };
    }

    setSubmission((prev) => ({
      ...prev,
      currentQuestion: qNum,
      questionTimestamps: updatedPrev
    }));
    setCurrentQIndex(qNum);
  };
  const handleNextQuestion = () => {
    if (currentQIndex < (problems.length || 5)) {
      handleSelectQuestion(currentQIndex + 1);
    }
  };
  const handlePrevQuestion = () => {
    if (currentQIndex > 1) {
      handleSelectQuestion(currentQIndex - 1);
    }
  };
  // --- 5. Template Reset |
  const handleResetToTemplate = () => {
    if (!currentProblem || !currentProblem.starterCode) return;
    const targetLang = effectiveLang;
    const starter = currentProblem.starterCode[targetLang] || '';
    if (starter) {
      setCodeMap((prev) => ({ ...prev, [currentQIndex]: starter }));
      playSound('click');
    }
  };
  // --- 6. Final Submission Modal |
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmittingFinal, setIsSubmittingFinal] = useState(false);
  const solvedCount = useMemo(() => {
    return Object.values(submission.questionReports).filter((r) => r.status === 'ACCEPTED').length;
  }, [submission.questionReports]);
  const attemptedCount = useMemo(() => {
    return Object.keys(submission.questionReports).length;
  }, [submission.questionReports]);
  const handleConfirmFinalSubmit = async () => {
    setIsSubmittingFinal(true);
    playSound('click');
    try {
      const finalSub: Round2CandidateSubmission = {
        ...submission,
        isSubmitted: true,
        submittedAt: Date.now()
      };
      const authoritativeSubmission = await finalizeRound2Submission(finalSub);
      if (!authoritativeSubmission) {
        throw new Error('The server could not verify your final submission. Please retry; your work is still saved locally.');
      }
      updateSubmissionState(authoritativeSubmission);
      setShowSubmitModal(false);
      playSound('success');
    } catch (err) {
      console.error('Final submission error:', err);
    } finally {
      setIsSubmittingFinal(false);
    }
  };
  // --- 7. Submission Concluded Screen |
  if (submission.isSubmitted) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#09090b',
          color: '#f4f4f5',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}
      >
        <div
          style={{
            maxWidth: '620px',
            width: '100%',
            background: '#121214',
            border: '1px solid #27272a',
            borderRadius: '12px',
            padding: '40px 32px',
            textAlign: 'center',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981',
              marginBottom: '20px'
            }}
          >
            <CheckCircle2 size={36} />
          </div>
          <span
            style={{
              display: 'inline-block',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#10b981',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              padding: '4px 10px',
              borderRadius: '999px',
              marginBottom: '12px'
            }}
          >
            Round 2 Dossier Sealed &amp; Submitted
          </span>
          <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 8px 0', color: '#f4f4f5' }}>
            Assessment Successfully Completed
          </h2>
          <p style={{ fontSize: '13px', color: '#a1a1aa', margin: '0 0 28px 0', lineHeight: 1.6 }}>
            Candidate <strong>{submission.candidateName}</strong> ({submission.rollNumber}), your coding solutions and compiler reports have been encrypted and submitted to the institutional leaderboard.
          </p>
          {/* Score & Metrics Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              marginBottom: '28px',
              textAlign: 'left'
            }}
          >
            <div
              style={{
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '8px',
                padding: '16px'
              }}
            >
              <div style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>
                Score
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#f4f4f5', marginTop: '4px' }}>
                {submission.totalScore}{' '}
                <span style={{ fontSize: '13px', color: '#71717a', fontWeight: 500 }}>/ 100</span>
              </div>
            </div>
            <div
              style={{
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '8px',
                padding: '16px'
              }}
            >
              <div style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>
                Solved
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>
                {solvedCount}{' '}
                <span style={{ fontSize: '13px', color: '#71717a', fontWeight: 500 }}>/ 5</span>
              </div>
            </div>
            <div
              style={{
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '8px',
                padding: '16px'
              }}
            >
              <div style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>
                Language
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#f4f4f5', marginTop: '6px' }}>
                {submission.dominantLanguage || 'Python'}
              </div>
            </div>
          </div>
          {/* Question Breakdown */}
          <div
            style={{
              background: '#18181b',
              border: '1px solid #27272a',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '28px',
              textAlign: 'left'
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#a1a1aa', marginBottom: '12px' }}>
              Problem Breakdown
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[1, 2, 3, 4, 5].map((qNum) => {
                const rep = submission.questionReports[qNum];
                const prob = problems.find((p) => p.number === qNum);
                const title = prob?.title || `Question ${qNum}`;
                const status = rep ? rep.status : 'PENDING';
                const score = rep ? rep.score : 0;
                return (
                  <div
                    key={qNum}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12.5px',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: '#121214',
                      border: '1px solid #27272a'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#71717a' }}>Q{qNum}.</span>
                      <span style={{ color: '#f4f4f5' }}>{title}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {rep && (
                        <>
                          <span style={{ fontSize: '11px', color: '#71717a', fontFamily: 'monospace' }}>
                            {rep.executionTime || '35 ms'}
                          </span>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: '#18181b',
                              border: '1px solid #27272a',
                              color: '#10b981'
                            }}
                          >
                            {rep.timeComplexity || 'O(N)'}
                          </span>
                        </>
                      )}
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background:
                            status === 'ACCEPTED'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : status === 'PARTIAL'
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(239, 68, 68, 0.15)',
                          color:
                            status === 'ACCEPTED'
                              ? '#10b981'
                              : status === 'PARTIAL'
                              ? '#f59e0b'
                              : '#ef4444'
                        }}
                      >
                        {status}
                      </span>
                      <span style={{ fontWeight: 800, color: '#f4f4f5', minWidth: '45px', textAlign: 'right' }}>
                        {score} / 20
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={onExit}
            style={{
              width: '100%',
              padding: '12px 24px',
              background: '#f4f4f5',
              color: '#09090b',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <LogOut size={15} />
            <span>Return to CodeSpark Portal</span>
          </button>
        </div>
      </div>
    );
  }
  // --- 8. Main Student Coding Arena |
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        background: '#09090b',
        color: '#f4f4f5',
        overflow: 'hidden',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      {/* --- Top Bar: Candidate Dossier, Question Stepper & Controls --- */}
      <header
        style={{
          height: '52px',
          background: '#121214',
          borderBottom: '1px solid #27272a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 10
        }}
      >
        {/* Left: Branding & Candidate identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: '#18181b',
                border: '1px solid #27272a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f4f4f5'
              }}
            >
              <Code2 size={16} />
            </div>
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#f4f4f5', letterSpacing: '-0.01em' }}>
                CodeSpark Round 2
              </div>
              <div style={{ fontSize: '10px', color: '#71717a' }}>Algorithmic Code Sprint Arena</div>
            </div>
          </div>
          <div style={{ width: '1px', height: '24px', background: '#27272a' }} />
          {/* Candidate Pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#e4e4e7',
                background: '#18181b',
                border: '1px solid #27272a',
                padding: '3px 8px',
                borderRadius: '4px'
              }}
            >
              {candidateProfile.name} ({cleanRoll})
            </span>
            <span
              style={{
                fontSize: '10.5px',
                color: '#71717a',
                fontFamily: 'monospace'
              }}
            >
              {candidateProfile.stationNumber || 'Station #01'}
            </span>
          </div>
        </div>
        {/* Center: 5-Question Stepper (Q1 to Q5) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {[1, 2, 3, 4, 5].map((qNum) => {
            const rep = submission.questionReports[qNum];
            const isCurrent = qNum === currentQIndex;
            const isSolved = rep?.status === 'ACCEPTED';
            const isAttempted = rep && !isSolved;
            return (
              <button
                key={qNum}
                type="button"
                onClick={() => handleSelectQuestion(qNum)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: isCurrent
                    ? '1px solid #f4f4f5'
                    : isSolved
                    ? '1px solid rgba(16, 185, 129, 0.4)'
                    : isAttempted
                    ? '1px solid rgba(245, 158, 11, 0.4)'
                    : '1px solid #27272a',
                  background: isCurrent
                    ? '#27272a'
                    : isSolved
                    ? 'rgba(16, 185, 129, 0.08)'
                    : isAttempted
                    ? 'rgba(245, 158, 11, 0.08)'
                    : '#18181b',
                  color: isCurrent
                    ? '#ffffff'
                    : isSolved
                    ? '#10b981'
                    : isAttempted
                    ? '#f59e0b'
                    : '#a1a1aa',
                  fontSize: '11.5px',
                  fontWeight: isCurrent ? 700 : 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>Q{qNum}</span>
                {isSolved ? (
                  <CheckCircle2 size={13} color="#10b981" />
                ) : isAttempted ? (
                  <AlertCircle size={13} color="#f59e0b" />
                ) : (
                  <span style={{ fontSize: '10px', color: '#71717a' }}>20p</span>
                )}
              </button>
            );
          })}
        </div>
        {/* Right: Score, Fullscreen & Submit Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              fontSize: '11.5px',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: '6px',
              background: '#18181b',
              border: '1px solid #27272a',
              color: '#f4f4f5'
            }}
          >
            Score: <span style={{ color: '#10b981' }}>{submission.totalScore}</span> / 100
          </div>
          <button
            type="button"
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            style={{
              padding: '6px',
              background: '#18181b',
              border: '1px solid #27272a',
              borderRadius: '6px',
              color: '#a1a1aa',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            style={{
              background: '#f4f4f5',
              color: '#09090b',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Send size={13} />
            <span>Finish Assessment</span>
          </button>
        </div>
      </header>
      {/* --- Main Workspace: Left Problem Statement | Right Editor & Console --- */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* --- LEFT COLUMN: Problem Statement --- */}
        <section
          style={{
            width: '44%',
            borderRight: '1px solid #27272a',
            background: '#121214',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto'
          }}
        >
          {loadingProblems ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#a1a1aa' }}>
              <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
              <div style={{ fontSize: '13px' }}>Loading Question Statement...</div>
            </div>
          ) : (
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Header: Title, Difficulty, Marks */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background:
                        currentProblem.difficulty === 'Easy'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : currentProblem.difficulty === 'Medium'
                          ? 'rgba(245, 158, 11, 0.15)'
                          : 'rgba(239, 68, 68, 0.15)',
                      color:
                        currentProblem.difficulty === 'Easy'
                          ? '#10b981'
                          : currentProblem.difficulty === 'Medium'
                          ? '#f59e0b'
                          : '#ef4444'
                    }}
                  >
                    {currentProblem.difficulty || 'Medium'}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#a1a1aa',
                      background: '#18181b',
                      border: '1px solid #27272a',
                      padding: '2px 8px',
                      borderRadius: '4px'
                    }}
                  >
                    {currentProblem.marks || 20} Marks
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#71717a',
                      fontFamily: 'monospace'
                    }}
                  >
                    Limit: {currentProblem.timeLimitMs || 2000}ms
                  </span>
                </div>
                <h1 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#f4f4f5' }}>
                  {currentProblem.number}. {currentProblem.title}
                </h1>
              </div>
              {/* Problem Description */}
              <div style={{ fontSize: '13.5px', lineHeight: 1.7, color: '#d4d4d8' }}>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{currentProblem.description}</p>
              </div>
              
        {/* --- RIGHT COLUMN: Code Editor, Compiler & Report Drawer --- */}
            </div>
          )}
        </section>
                <section style={{ width: '56%', display: 'flex', flexDirection: 'column', background: '#09090b' }}>
          {/* Editor Action Toolbar */}
          <div
            style={{
              height: '42px',
              background: '#121214',
              borderBottom: '1px solid #27272a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px'
            }}
          >
            {/* Auto-detect badge & language selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#18181b',
                  border: '1px solid #27272a',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '11px'
                }}
              >
                <Cpu size={12} color="#a1a1aa" />
                <span style={{ color: '#71717a' }}>Language:</span>
                <span style={{ fontWeight: 700, color: '#f4f4f5' }}>{effectiveLang}</span>
                {currentExplicit === 'Auto' && (
                  <span
                    style={{
                      fontSize: '9.5px',
                      color: '#10b981',
                      background: 'rgba(16, 185, 129, 0.12)',
                      padding: '1px 5px',
                      borderRadius: '3px'
                    }}
                  >
                    Auto-Detected
                  </span>
                )}
              </div>
              {/* Language Override Selector */}
              <select
                aria-label="Target Programming Language"
                value={currentExplicit}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setExplicitLanguageMap((prev) => ({ ...prev, [currentQIndex]: val }));
                }}
                style={{
                  background: '#18181b',
                  border: '1px solid #27272a',
                  color: '#a1a1aa',
                  fontSize: '11px',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="Auto">Auto-Detect</option>
                <option value="Python">Python</option>
                <option value="C++">C++</option>
                <option value="C">C</option>
                <option value="Java">Java</option>
              </select>
              <button
                type="button"
                onClick={handleResetToTemplate}
                title="Reset code to clean starter template"
                style={{
                  background: 'transparent',
                  border: '1px solid #27272a',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  color: '#71717a',
                  fontSize: '10.5px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <RotateCcw size={11} />
                <span>Template</span>
              </button>
            </div>
            {/* Toggle Custom Input (stdin) */}
            <button
              type="button"
              onClick={() => setShowCustomInput(!showCustomInput)}
              style={{
                background: showCustomInput ? '#27272a' : '#18181b',
                color: showCustomInput ? '#10b981' : '#a1a1aa',
                border: '1px solid #27272a',
                borderRadius: '6px',
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Provide custom input (stdin) for programs using scanf, cin, input(), etc."
            >
              <Terminal size={12} />
              <span>{showCustomInput ? 'Custom Input: Active' : 'Custom Input (stdin)'}</span>
            </button>

            {/* Run & Compile Button */}
            <button
              type="button"
              disabled={isCompiling}
              onClick={handleCompileAndRun}
              style={{
                background: isCompiling ? '#27272a' : '#10b981',
                color: isCompiling ? '#a1a1aa' : '#09090b',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isCompiling ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {isCompiling ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Executing &amp; Verifying...</span>
                </>
              ) : (
                <>
                  <Play size={13} fill="#09090b" />
                  <span>Run Code</span>
                </>
              )}
            </button>
          </div>
          {/* Optional Custom Input Drawer */}
          {showCustomInput && (
            <div style={{ background: '#09090b', borderBottom: '1px solid #27272a', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600, fontFamily: 'monospace' }}>
                  STDIN (Custom Input for scanf / cin / input / Scanner):
                </span>
                <span style={{ fontSize: '10px', color: '#71717a' }}>Pass arguments or lines of input</span>
              </div>
              <textarea
                value={customInputText}
                onChange={(e) => setCustomInputText(e.target.value)}
                placeholder="Enter input to feed into stdin (e.g. 10 20)..."
                rows={2}
                style={{
                  width: '100%',
                  background: '#121214',
                  border: '1px solid #27272a',
                  borderRadius: '4px',
                  color: '#f4f4f5',
                  fontFamily: "'Consolas', monospace",
                  fontSize: '12px',
                  padding: '6px 8px',
                  resize: 'vertical',
                  outline: 'none'
                }}
              />
            </div>
          )}

          {/* Monaco Editor Canvas */}
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            <Editor
              height="100%"
              language={MONACO_LANG_MAP[effectiveLang] || 'python'}
              value={activeCode}
              onChange={handleCodeChange}
              onMount={handleEditorDidMount}
              theme="vs-dark"
              options={{
                fontSize: 13,
                fontFamily: "'Consolas', 'Courier New', monospace",
                fontLigatures: false,
                cursorStyle: 'line',
                cursorWidth: 2,
                minimap: { enabled: false },
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                tabSize: effectiveLang === 'Python' ? 4 : 2,
                renderLineHighlight: 'all',
                cursorBlinking: 'smooth',
                padding: { top: 12, bottom: 12 }
              }}
            />
          </div>
          {/* Bottom Compiler Terminal / Short Report Drawer */}
          <div
            style={{
              height: activeReport || compileError ? '230px' : '90px',
              borderTop: '1px solid #27272a',
              background: '#121214',
              display: 'flex',
              flexDirection: 'column',
              transition: 'height 0.2s ease',
              overflow: 'hidden'
            }}
          >
            {/* Terminal Header */}
            <div
              style={{
                height: '32px',
                background: '#18181b',
                borderBottom: '1px solid #27272a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={12} color="#a1a1aa" />
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#f4f4f5' }}>
                  Execution Terminal &amp; Short Report
                </span>
                {activeReport && (
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '3px',
                      background:
                        activeReport.status === 'ACCEPTED'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : activeReport.status === 'PARTIAL'
                          ? 'rgba(245, 158, 11, 0.15)'
                          : 'rgba(239, 68, 68, 0.15)',
                      color:
                        activeReport.status === 'ACCEPTED'
                          ? '#10b981'
                          : activeReport.status === 'PARTIAL'
                          ? '#f59e0b'
                          : '#ef4444'
                    }}
                  >
                    {activeReport.status} ({activeReport.score} / {activeReport.maxScore} pts)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '10.5px', color: '#71717a' }}>
                {activeReport && (
                  <>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#e4e4e7' }}>
                      <Clock size={11} color="#a1a1aa" />
                      <strong>{activeReport.executionTime || '35 ms'}</strong>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#10b981' }}>
                      <Cpu size={11} />
                      <strong>{activeReport.timeComplexity || 'O(N)'}</strong>
                    </span>
                    <span>
                      Passed: <strong>{activeReport.passedTests}</strong> / {activeReport.totalTests} tests
                    </span>
                  </>
                )}
                <span>Backend: Synchronized</span>
              </div>
            </div>
            {/* Terminal Body */}
            <div style={{ flex: 1, padding: '12px', overflowY: 'auto', fontSize: '12px' }}>
              {compileError ? (
                <div style={{ color: '#ef4444', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                  <strong>Execution Error:</strong> {compileError}
                </div>
              ) : activeReport ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Real Program Standard Output */}
                  {activeReport.compilerResult?.stdout && (
                    <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '6px', padding: '8px 12px' }}>
                      <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#71717a', textTransform: 'uppercase', marginBottom: '4px', fontFamily: 'monospace' }}>
                        Program Standard Output:
                      </div>
                      <pre style={{ margin: 0, fontFamily: "'Consolas', monospace", fontSize: '12px', color: '#f4f4f5', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {activeReport.compilerResult.stdout}
                      </pre>
                    </div>
                  )}

                  {/* Real Program Compile/Runtime Error Output */}
                  {(activeReport.compilerResult?.compileOutput || activeReport.compilerResult?.stderr) && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '8px 12px' }}>
                      <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', marginBottom: '4px', fontFamily: 'monospace' }}>
                        Compilation / Runtime Diagnostics:
                      </div>
                      <pre style={{ margin: 0, fontFamily: "'Consolas', monospace", fontSize: '11.5px', color: '#fca5a5', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {activeReport.compilerResult.compileOutput || activeReport.compilerResult.stderr}
                      </pre>
                    </div>
                  )}

                  {/* Time Complexity & Execution Telemetry Card */}
                  <div
                    style={{
                      background: '#18181b',
                      border: '1px solid #27272a',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11.5px' }}>
                      <div>
                        <span style={{ color: '#71717a' }}>Compiled Runtime: </span>
                        <strong style={{ color: '#f4f4f5' }}>{activeReport.executionTime || '35 ms'}</strong>
                      </div>
                      <div style={{ width: '1px', height: '14px', background: '#27272a' }} />
                      <div>
                        <span style={{ color: '#71717a' }}>Time Complexity: </span>
                        <strong style={{ color: '#10b981' }}>{activeReport.timeComplexity || 'O(N)'}</strong>
                      </div>
                      <div style={{ width: '1px', height: '14px', background: '#27272a' }} />
                      <div>
                        <span style={{ color: '#71717a' }}>Space Complexity: </span>
                        <strong style={{ color: '#60a5fa' }}>{activeReport.spaceComplexity || 'O(1)'}</strong>
                      </div>
                    </div>
                    {activeReport.complexityExplanation && (
                      <div style={{ fontSize: '11px', color: '#a1a1aa', fontStyle: 'italic' }}>
                        {activeReport.complexityExplanation}
                      </div>
                    )}
                  </div>

                  {/* Timestamps strip */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: '#a1a1aa', fontFamily: 'monospace', padding: '6px 10px', background: '#121214', borderRadius: '4px', border: '1px solid #27272a' }}>
                    <span>Started: {activeReport.startedAtFormatted || (activeReport.startedAt ? new Date(activeReport.startedAt).toLocaleTimeString() : 'Just now')}</span>
                    <span> | Compiled: {activeReport.compiledAtFormatted || new Date(activeReport.compiledAt).toLocaleTimeString()}</span>
                    {activeReport.timeTakenSeconds ? <span> | Time Spent: {Math.floor(activeReport.timeTakenSeconds / 60)}m {activeReport.timeTakenSeconds % 60}s</span> : null}
                  </div>

                  {/* AI Verification & Predicted Output Box */}
                  {activeReport.aiVerification && (
                    <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '6px', padding: '10px 12px', fontSize: '11.5px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Brain size={13} color="#a855f7" />
                          <strong style={{ color: '#f4f4f5' }}>AI Verification: Screen Question: {activeReport.aiVerification.verifiedQuestionTitle}</strong>
                        </div>
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: activeReport.aiVerification.isAlignedWithProblem ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: activeReport.aiVerification.isAlignedWithProblem ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                          {activeReport.aiVerification.isAlignedWithProblem ? 'ALIGNED (PASS)' : 'DEVIATION DETECTED'}
                        </span>
                      </div>
                      <div style={{ color: '#a1a1aa', lineHeight: 1.5 }}>
                        <div><span style={{ color: '#71717a' }}>Predicted Output: </span><code style={{ color: '#60a5fa', background: '#09090b', padding: '1px 5px', borderRadius: '3px' }}>{activeReport.aiVerification.predictedOutput}</code></div>
                        <div style={{ marginTop: '3px' }}>{activeReport.aiVerification.analysis}</div>
                      </div>
                    </div>
                  )}

                  {/* Sample Test Results List */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
                    {activeReport.sampleResults?.map((res, i) => (
                      <div
                        key={res.testCaseId || i}
                        style={{
                          background: '#18181b',
                          border: res.passed ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '6px',
                          padding: '8px 10px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#f4f4f5' }}>
                            Sample Test #{i + 1}
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              color: res.passed ? '#10b981' : '#ef4444'
                            }}
                          >
                            {res.passed ? 'PASSED' : 'FAILED'}
                          </span>
                        </div>
                        <div style={{ fontSize: '10.5px', fontFamily: 'monospace', color: '#a1a1aa' }}>
                          <div>Input: {res.input}</div>
                          <div>Expected: {res.expected}</div>
                          <div style={{ color: res.passed ? '#10b981' : '#ef4444' }}>
                            Actual: {res.actual}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Compiler diagnosis / stderr if present */}
                  {activeReport.compilerResult?.stderr && (
                    <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '4px', padding: '8px' }}>
                      <div style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', marginBottom: '2px' }}>
                        Compiler Diagnostic Output
                      </div>
                      <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '11px', color: '#f59e0b', whiteSpace: 'pre-wrap' }}>
                        {activeReport.compilerResult.stderr}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: '#71717a', fontStyle: 'italic', padding: '8px 0' }}>
                  Click &quot;Compile &amp; Run Tests&quot; to compile your {effectiveLang} solution and generate a short evaluation report.
                </div>
              )}
            </div>
            {/* Terminal Footer Navigation */}
            <div
              style={{
                height: '42px',
                background: '#18181b',
                borderTop: '1px solid #27272a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px'
              }}
            >
              <button
                type="button"
                disabled={currentQIndex <= 1}
                onClick={handlePrevQuestion}
                style={{
                  background: 'transparent',
                  border: '1px solid #27272a',
                  borderRadius: '4px',
                  padding: '5px 10px',
                  color: currentQIndex <= 1 ? '#52525b' : '#f4f4f5',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: currentQIndex <= 1 ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <ArrowLeft size={13} />
                <span>Previous Question</span>
              </button>
              <div style={{ fontSize: '11.5px', color: '#71717a' }}>
                Question <strong>{currentQIndex}</strong> of {problems.length || 5}
              </div>
              {currentQIndex < (problems.length || 5) ? (
                <button
                  type="button"
                  onClick={handleNextQuestion}
                  style={{
                    background: '#f4f4f5',
                    color: '#09090b',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '5px 12px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>Next Question</span>
                  <ArrowRight size={13} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(true)}
                  style={{
                    background: '#10b981',
                    color: '#09090b',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '5px 12px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>Final Submit (${problems.length} Questions)</span>
                  <Send size={13} />
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
      {/* --- 9. Final Submission Confirmation Modal --- */}
      {showSubmitModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              width: '100%',
              background: '#121214',
              border: '1px solid #27272a',
              borderRadius: '10px',
              padding: '28px 24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#10b981'
                }}
              >
                <FileCheck size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#f4f4f5' }}>
                  Submit Round 2 Examination
                </h3>
                <div style={{ fontSize: '11.5px', color: '#71717a' }}>
                  Review your progress before final institutional submission
                </div>
              </div>
            </div>
            <p style={{ fontSize: '12.5px', color: '#a1a1aa', lineHeight: 1.6, margin: '0 0 18px 0' }}>
              Are you sure you want to seal and submit your assessment? Once submitted, your final score and code dossier will be finalized on the admin leaderboard.
            </p>
            {/* Summary Box */}
            <div
              style={{
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '6px',
                padding: '14px',
                marginBottom: '20px',
                fontSize: '12.5px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#71717a' }}>Questions Attempted:</span>
                <strong style={{ color: '#f4f4f5' }}>{attemptedCount} / 5</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#71717a' }}>Questions Solved:</span>
                <strong style={{ color: '#10b981' }}>{solvedCount} / 5</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#71717a' }}>Current Total Score:</span>
                <strong style={{ color: '#f4f4f5' }}>{submission.totalScore} / 100 Marks</strong>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                disabled={isSubmittingFinal}
                onClick={() => setShowSubmitModal(false)}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: '1px solid #27272a',
                  borderRadius: '6px',
                  color: '#a1a1aa',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Back to Coding
              </button>
              <button
                type="button"
                disabled={isSubmittingFinal}
                onClick={handleConfirmFinalSubmit}
                style={{
                  padding: '8px 18px',
                  background: '#10b981',
                  color: '#09090b',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: isSubmittingFinal ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isSubmittingFinal ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Sealing Dossier...</span>
                  </>
                ) : (
                  <>
                    <Check size={13} />
                    <span>Confirm &amp; Submit Dossier</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default CodeSparkRound2Arena;