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
  Brain,
  FileText,
  History,
  Lock,
  Unlock,
  AlertTriangle
} from 'lucide-react';
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
  pushRound2SubmissionToCloud,
  selectStudentRound2Problems,
  pushRound2LiveCodeToCloud,
  isRound2ArenaUnlocked,
  setRound2ArenaUnlocked,
  subscribeToRound2ArenaUnlocked
} from '../../services/round2CodingService';
import { cleanCandidateNameAndRoll } from '../../utils/candidateFormatter';
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
  const { name: candidateDisplayName, roll: cleanRoll } = useMemo(() => {
    return cleanCandidateNameAndRoll(candidateProfile.name, candidateProfile.rollNumber || candidateProfile.email?.split('@')[0]);
  }, [candidateProfile.name, candidateProfile.rollNumber, candidateProfile.email]);

  const candidateKey = candidateProfile.round2Key || candidateProfile.accessKey || 'GUEST';

  // --- 0. Round 2 Gatekeeper State (Direct from Supabase Cloud) ---
  const [isArenaUnlocked, setIsArenaUnlocked] = useState<boolean>(() => isRound2ArenaUnlocked());
  const [showProctorUnlockModal, setShowProctorUnlockModal] = useState<boolean>(false);
  const [proctorPinInput, setProctorPinInput] = useState<string>('');
  const [proctorError, setProctorError] = useState<string>('');

  useEffect(() => {
    const unsub = subscribeToRound2ArenaUnlocked((unlocked) => {
      setIsArenaUnlocked(unlocked);
    });
    return unsub;
  }, []);

  // --- 1. Problems State (Gated from Cloud) ---
  const [problems, setProblems] = useState<Round2Problem[]>(() => {
    const all = getAllRound2Problems();
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

  // --- 2. Candidate Submission & Progress State ---
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
      maxScore: 50,
      isSubmitted: false,
      startedAt: Date.now(),
      dominantLanguage: 'Python'
    };
  });

  // Current Active Question (1 to 5)
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
      if (rep && rep.code && !rep.code.includes('nums: list[int]') && !rep.code.includes('postfix = 1\n        for i in range(n - 1, -1, -1):')) {
        map[i] = rep.code;
      } else {
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

  const detectedLang = useMemo(() => {
    return detectLanguageFromCode(activeCode);
  }, [activeCode]);

  const effectiveLang: 'C' | 'C++' | 'Python' | 'Java' = useMemo(() => {
    if (currentExplicit !== 'Auto') return currentExplicit;
    return detectedLang;
  }, [currentExplicit, detectedLang]);

  // Sanitize code buffer: ensure no hardcoded legacy solution remains in editor
  useEffect(() => {
    if (currentProblem && currentProblem.starterCode) {
      const current = codeMap[currentQIndex] || '';
      if (!current || current.includes('nums: list[int]') || current.includes('postfix = 1\n        for i in range(n - 1, -1, -1):')) {
        const cleanStarter = currentProblem.starterCode[effectiveLang] || currentProblem.starterCode.Python || '';
        if (cleanStarter) {
          setCodeMap((prev) => ({ ...prev, [currentQIndex]: cleanStarter }));
        }
      }
    }
  }, [currentProblem, effectiveLang, currentQIndex]);

  // Compilation & Console State
  const [isCompiling, setIsCompiling] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInputText, setCustomInputText] = useState('');
  const [activeReport, setActiveReport] = useState<Round2QuestionReport | null>(() => {
    return submission.questionReports[currentQIndex] || null;
  });

  // HackerRank / LeetCode UI Tabs
  const [activeLeftTab, setActiveLeftTab] = useState<'description' | 'submissions'>('description');
  const [activeConsoleTab, setActiveConsoleTab] = useState<'testcase' | 'testresult'>('testcase');
  const [selectedCaseIdx, setSelectedCaseIdx] = useState<number>(0);
  const [isCustomCase, setIsCustomCase] = useState<boolean>(false);
  const [editableCaseInputs, setEditableCaseInputs] = useState<Record<string, string>>({});
  const [isConsoleExpanded, setIsConsoleExpanded] = useState<boolean>(true);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Submissions history per question
  const [submissionHistory, setSubmissionHistory] = useState<Record<number, Round2QuestionReport[]>>({});

  // Keep active report in sync when switching question tabs
  useEffect(() => {
    setActiveReport(submission.questionReports[currentQIndex] || null);
    setCompileError(null);
    setSelectedCaseIdx(0);
    setIsCustomCase(false);
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

  // --- Anti-Cheat System ---
  const [tabViolations, setTabViolations] = useState<number>(() => {
    try {
      const saved = sessionStorage.getItem(`r2_strikes_${cleanRoll}`);
      return saved ? parseInt(saved, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });
  const [isProctorLocked, setIsProctorLocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(`r2_locked_${cleanRoll}`) === 'true';
    } catch {
      return false;
    }
  });
  const [unlockInput, setUnlockInput] = useState<string>('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const lastViolationTime = useRef<number>(0);

  useEffect(() => {
    const registerInfraction = () => {
      const now = Date.now();
      if (now - lastViolationTime.current > 700) {
        lastViolationTime.current = now;
        setTabViolations((prev) => {
          const next = prev + 1;
          try {
            sessionStorage.setItem(`r2_strikes_${cleanRoll}`, String(next));
          } catch {}
          playSound('warning');
          if (next >= 3) {
            setIsProctorLocked(true);
            try {
              sessionStorage.setItem(`r2_locked_${cleanRoll}`, 'true');
            } catch {}
            playSound('error');
          }
          void pushRound2LiveCodeToCloud(candidateProfile, codeMap[currentQIndex] || '', effectiveLang, currentQIndex);
          return next;
        });
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        registerInfraction();
      }
    };

    const handleBlur = () => {
      registerInfraction();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [cleanRoll, candidateProfile, codeMap, currentQIndex, effectiveLang]);

  // Unlock lockdown handler
  const VALID_PROCTOR_KEYS = new Set([
    'AXENT-PROCTOR',
    'UNLOCK2026',
    'PROCTOR',
    'ADMIN',
    '1234',
    'PROCTOR2026',
    'AXENT2026'
  ]);

  const handleUnlockExam = () => {
    const key = unlockInput.trim().toUpperCase();
    if (VALID_PROCTOR_KEYS.has(key)) {
      setIsProctorLocked(false);
      setTabViolations(0);
      setUnlockInput('');
      setUnlockError(null);
      try {
        sessionStorage.removeItem(`r2_locked_${cleanRoll}`);
        sessionStorage.setItem(`r2_strikes_${cleanRoll}`, '0');
      } catch {}
      playSound('success');
      void pushRound2LiveCodeToCloud(candidateProfile, codeMap[currentQIndex] || '', effectiveLang, currentQIndex);
    } else {
      setUnlockError('Invalid Proctor Authorization Key. Contact your lab invigilator (Default: AXENT-PROCTOR).');
      playSound('error');
    }
  };

  // Contest Countdown Timer (60 min default)
  const [remainingSeconds, setRemainingSeconds] = useState<number>(3600);
  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formattedTimer = useMemo(() => {
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [remainingSeconds]);

  // Editor ref & font measurement
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

  // --- 3. RUN CODE (Sample Testcases) ---
  const handleRunCode = async () => {
    if (!currentProblem || !currentProblem.id) return;
    setIsCompiling(true);
    setCompileError(null);
    setActiveConsoleTab('testresult');
    setIsConsoleExpanded(true);
    playSound('click');

    try {
      const qTimestamps = submission.questionTimestamps || {};
      const qStart = qTimestamps[currentQIndex]?.startedAt || Date.now();
      const timeTakenMs = Date.now() - qStart;

      const activeCustomStdin = isCustomCase
        ? customInputText
        : (editableCaseInputs[`${currentQIndex}_${selectedCaseIdx}`] !== undefined
            ? editableCaseInputs[`${currentQIndex}_${selectedCaseIdx}`]
            : (showCustomInput ? customInputText : undefined));

      const report = await evaluateRound2Code(
        currentProblem,
        activeCode,
        effectiveLang,
        timeTakenMs,
        activeCustomStdin,
        false // Run sample test cases only
      );

      report.startedAt = qStart;
      report.startedAtFormatted = new Date(qStart).toLocaleTimeString();
      report.timeTakenSeconds = Math.max(1, Math.round((report.compiledAt - qStart) / 1000));
      setActiveReport(report);

      // Record to question submission history
      setSubmissionHistory((prev) => ({
        ...prev,
        [currentQIndex]: [report, ...(prev[currentQIndex] || [])]
      }));

      if (report.status === 'ACCEPTED') {
        playSound('success');
      } else {
        playSound('warning');
      }
    } catch (err: any) {
      console.error('Run code error:', err);
      setCompileError(err?.message || 'Compiler execution failed. Please verify syntax and retry.');
      playSound('error');
    } finally {
      setIsCompiling(false);
    }
  };

  // --- 4. SUBMIT CODE (HackerRank & LeetCode Official Submission) ---
  const handleSubmitCode = async () => {
    if (!currentProblem || !currentProblem.id) return;
    setIsSubmitting(true);
    setCompileError(null);
    setActiveConsoleTab('testresult');
    setIsConsoleExpanded(true);
    playSound('click');

    try {
      const qTimestamps = submission.questionTimestamps || {};
      const qStart = qTimestamps[currentQIndex]?.startedAt || Date.now();
      const timeTakenMs = Date.now() - qStart;

      // Submit executes ALL test cases (visible sample + hidden test cases)
      const report = await evaluateRound2Code(
        currentProblem,
        activeCode,
        effectiveLang,
        timeTakenMs,
        undefined,
        true // Submit against all test cases
      );

      report.startedAt = qStart;
      report.startedAtFormatted = new Date(qStart).toLocaleTimeString();
      report.timeTakenSeconds = Math.max(1, Math.round((report.compiledAt - qStart) / 1000));
      setActiveReport(report);

      // Update question submission history
      setSubmissionHistory((prev) => ({
        ...prev,
        [currentQIndex]: [report, ...(prev[currentQIndex] || [])]
      }));

      const updatedTimestamps = {
        ...qTimestamps,
        [currentQIndex]: {
          startedAt: qStart,
          startedAtFormatted: new Date(qStart).toLocaleTimeString(),
          compiledAt: report.compiledAt,
          compiledAtFormatted: report.compiledAtFormatted
        }
      };

      const updatedReports = {
        ...submission.questionReports,
        [currentQIndex]: report
      };

      let totalScore = 0;
      let totalMax = 0;
      const langCounts: Record<string, number> = { Python: 0, 'C++': 0, C: 0, Java: 0 };
      Object.values(updatedReports).forEach((rep) => {
        totalScore += rep.score || 0;
        totalMax += rep.maxScore || 10;
        if (rep.language) {
          langCounts[rep.language] = (langCounts[rep.language] || 0) + 1;
        }
      });

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
        maxScore: totalMax || 50,
        dominantLanguage: dominant
      };

      updateSubmissionState(updatedSub);
      void pushRound2SubmissionToCloud(updatedSub);

      if (report.status === 'ACCEPTED') {
        playSound('success');
      } else {
        playSound('warning');
      }
    } catch (err: any) {
      console.error('Submit code error:', err);
      setCompileError(err?.message || 'Submission evaluation failed.');
      playSound('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- 5. Question Navigation ---
  const handleSelectQuestion = (qNum: number) => {
    if (qNum < 1 || qNum > 5) return;
    playSound('click');
    const now = Date.now();
    const prevTimestamps = submission.questionTimestamps || {};
    const updatedPrev = { ...prevTimestamps };

    if (updatedPrev[currentQIndex]) {
      updatedPrev[currentQIndex] = {
        ...updatedPrev[currentQIndex],
        nextQuestionStartedAt: now,
        nextQuestionStartedAtFormatted: new Date(now).toLocaleTimeString()
      };
    }
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
    setSelectedCaseIdx(0);
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

  // --- 6. Template Reset ---
  const handleResetToTemplate = () => {
    if (!currentProblem || !currentProblem.starterCode) return;
    const starter = currentProblem.starterCode[effectiveLang] || '';
    if (starter) {
      setCodeMap((prev) => ({ ...prev, [currentQIndex]: starter }));
      playSound('click');
    }
  };

  // --- 7. Copy to Clipboard ---
  const handleCopyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    playSound('click');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // --- 8. Final Submission Modal ---
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmittingFinal, setIsSubmittingFinal] = useState(false);

  const solvedCount = useMemo(() => {
    return Object.values(submission.questionReports).filter((r) => r.status === 'ACCEPTED').length;
  }, [submission.questionReports]);

  const totalPassedTests = useMemo(() => {
    return Object.values(submission.questionReports).reduce((sum, r) => sum + (r.passedTests || 0), 0);
  }, [submission.questionReports]);

  // Initial immediate live workstation push on arena mount
  useEffect(() => {
    void pushRound2LiveCodeToCloud(candidateProfile, codeMap[currentQIndex] || '', effectiveLang, currentQIndex);
  }, []);

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
      updateSubmissionState(finalSub);
      await pushRound2SubmissionToCloud(finalSub);
      setShowSubmitModal(false);
      playSound('success');
    } catch (err) {
      console.error('Final submission error:', err);
    } finally {
      setIsSubmittingFinal(false);
    }
  };

  // --- 9. Submission Concluded Screen ---
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
          padding: '24px'
        }}
      >
        <div
          style={{
            maxWidth: '600px',
            width: '100%',
            background: '#121214',
            border: '1px solid #27272a',
            borderRadius: '12px',
            padding: '36px',
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
            Candidate <strong>{submission.candidateName}</strong> ({submission.rollNumber}), your code solutions and keystroke forensic telemetry have been verified and sealed to cloud.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              marginBottom: '28px',
              textAlign: 'left'
            }}
          >
            <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '16px' }}>
              <div style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>Challenges Solved</div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>
                {solvedCount} <span style={{ fontSize: '13px', color: '#71717a', fontWeight: 500 }}>/ 5</span>
              </div>
            </div>
            <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '16px' }}>
              <div style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>Test Cases Passed</div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#f4f4f5', marginTop: '4px' }}>
                {totalPassedTests} <span style={{ fontSize: '13px', color: '#71717a', fontWeight: 500 }}>/ 25</span>
              </div>
            </div>
            <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '16px' }}>
              <div style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>Language</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#f4f4f5', marginTop: '6px' }}>
                {submission.dominantLanguage || 'Python'}
              </div>
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

  // --- 9.5. Gatekeeper: Standby Hall (Round 2 Locked • Questions Concealed) ---
  if (!isArenaUnlocked) {
    const handleProctorUnlock = () => {
      const pin = proctorPinInput.trim().toLowerCase();
      if (pin === 'axent2026' || pin === 'proctor' || pin === 'admin') {
        playSound('success');
        setRound2ArenaUnlocked(true);
        setShowProctorUnlockModal(false);
        setProctorPinInput('');
        setProctorError('');
      } else {
        playSound('warning');
        setProctorError('Invalid Invigilator PIN. Contact the Chief Examination Proctor.');
      }
    };

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
        {/* Header */}
        <header
          style={{
            height: '52px',
            background: '#121214',
            borderBottom: '1px solid #27272a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#f4f4f5', letterSpacing: '-0.01em' }}>
                AXENT CODE SPARK 2026
              </div>
              <div style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Round 2 · Algorithmic Code Sprint Arena
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '4px',
                background: '#18181b',
                border: '1px solid #27272a',
                color: '#ca8a04',
                fontFamily: 'monospace',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Lock size={12} />
              <span>ARENA LOCKED · STANDBY</span>
            </span>
            <button
              type="button"
              onClick={onExit}
              style={{
                padding: '6px 12px',
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '6px',
                color: '#a1a1aa',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <LogOut size={13} />
              <span>Exit</span>
            </button>
          </div>
        </header>

        {/* Standby Body */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
                width: '56px',
                height: '56px',
                borderRadius: '10px',
                background: '#18181b',
                border: '1px solid #27272a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
                color: '#e4e4e7'
              }}
            >
              <Lock size={26} />
            </div>

            <div
              style={{
                display: 'inline-block',
                fontSize: '10.5px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#a1a1aa',
                background: '#18181b',
                border: '1px solid #27272a',
                padding: '4px 10px',
                borderRadius: '4px',
                marginBottom: '14px'
              }}
            >
              Round 2 Algorithmic Challenge Sealed
            </div>

            <h2
              style={{
                fontSize: '20px',
                fontWeight: 800,
                color: '#f4f4f5',
                margin: '0 0 10px',
                letterSpacing: '-0.02em'
              }}
            >
              Awaiting Invigilator Launch
            </h2>

            <p
              style={{
                fontSize: '13px',
                color: '#a1a1aa',
                lineHeight: 1.6,
                margin: '0 0 24px'
              }}
            >
              The 5 algorithmic challenges and live test suites for Round 2 have not yet been opened. Questions will reveal automatically the moment the Chief Proctor unlocks the arena from the control room.
            </p>

            {/* Verified Candidate Badge */}
            <div
              style={{
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '6px',
                padding: '16px',
                marginBottom: '24px',
                textAlign: 'left'
              }}
            >
              <div
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#71717a',
                  marginBottom: '10px'
                }}
              >
                Authenticated Contestant Credentials
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                <div>
                  <span style={{ color: '#71717a', display: 'block', fontSize: '10.5px' }}>Candidate Name</span>
                  <strong style={{ color: '#f4f4f5' }}>{candidateDisplayName}</strong>
                </div>
                <div>
                  <span style={{ color: '#71717a', display: 'block', fontSize: '10.5px' }}>Roll / USN</span>
                  <strong style={{ color: '#f4f4f5', fontFamily: 'monospace' }}>{cleanRoll}</strong>
                </div>
                <div>
                  <span style={{ color: '#71717a', display: 'block', fontSize: '10.5px' }}>Round 2 Key</span>
                  <strong style={{ color: '#f4f4f5', fontFamily: 'monospace' }}>{candidateKey}</strong>
                </div>
                <div>
                  <span style={{ color: '#71717a', display: 'block', fontSize: '10.5px' }}>Assigned Terminal</span>
                  <strong style={{ color: '#f4f4f5' }}>{candidateProfile.stationNumber || 'Station #01'}</strong>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowProctorUnlockModal(true)}
                style={{
                  width: '100%',
                  padding: '11px',
                  background: '#f4f4f5',
                  color: '#09090b',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Unlock size={14} />
                <span>Invigilator On-Site Unlock</span>
              </button>

              <button
                type="button"
                onClick={onExit}
                style={{
                  width: '100%',
                  padding: '9px',
                  background: 'transparent',
                  color: '#71717a',
                  border: '1px solid #27272a',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <LogOut size={13} />
                <span>Return to Portal</span>
              </button>
            </div>
          </div>
        </div>

        {/* Proctor On-Site Unlock Modal */}
        {showProctorUnlockModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '20px'
            }}
          >
            <div
              style={{
                maxWidth: '400px',
                width: '100%',
                background: '#121214',
                border: '1px solid #27272a',
                borderRadius: '8px',
                padding: '24px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    background: '#18181b',
                    border: '1px solid #27272a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#f4f4f5'
                  }}
                >
                  <Unlock size={16} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#f4f4f5' }}>
                    Invigilator Master Unlock
                  </h4>
                  <p style={{ margin: 0, fontSize: '11px', color: '#71717a' }}>
                    Enter Proctor Authorization PIN to open this station
                  </p>
                </div>
              </div>

              {proctorError && (
                <div
                  style={{
                    padding: '8px 12px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '4px',
                    color: '#ef4444',
                    fontSize: '11.5px',
                    marginBottom: '12px'
                  }}
                >
                  {proctorError}
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: '#71717a',
                    marginBottom: '6px'
                  }}
                >
                  Proctor PIN
                </label>
                <input
                  type="password"
                  value={proctorPinInput}
                  onChange={(e) => setProctorPinInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleProctorUnlock()}
                  placeholder="Enter PIN (e.g. axent2026)"
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '6px',
                    color: '#f4f4f5',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowProctorUnlockModal(false);
                    setProctorPinInput('');
                    setProctorError('');
                  }}
                  style={{
                    flex: 1,
                    padding: '9px',
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '6px',
                    color: '#a1a1aa',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleProctorUnlock}
                  style={{
                    flex: 1,
                    padding: '9px',
                    background: '#f4f4f5',
                    color: '#09090b',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Authorize &amp; Unlock
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- 10. Main HackerRank / LeetCode Arena UI ---
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
      {/* --- Top Bar: Branding, Problem Stepper & Contest Controls --- */}
      <header
        style={{
          height: '50px',
          background: '#121214',
          borderBottom: '1px solid #27272a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 10,
          userSelect: 'none'
        }}
      >
        {/* Left: Branding & Candidate identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                background: '#18181b',
                border: '1px solid #27272a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f4f4f5'
              }}
            >
              <Code2 size={15} />
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#f4f4f5', letterSpacing: '-0.01em' }}>
              CodeSpark Arena
            </div>
          </div>

          <div style={{ width: '1px', height: '20px', background: '#27272a' }} />

          {/* Problem Selector Nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              disabled={currentQIndex <= 1}
              onClick={handlePrevQuestion}
              style={{
                padding: '4px 8px',
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '4px',
                color: currentQIndex <= 1 ? '#52525b' : '#a1a1aa',
                cursor: currentQIndex <= 1 ? 'not-allowed' : 'pointer'
              }}
              title="Previous Problem"
            >
              <ArrowLeft size={12} />
            </button>

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
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '5px',
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
                      ? 'rgba(16, 185, 129, 0.1)'
                      : isAttempted
                      ? 'rgba(245, 158, 11, 0.1)'
                      : '#18181b',
                    color: isCurrent
                      ? '#ffffff'
                      : isSolved
                      ? '#10b981'
                      : isAttempted
                      ? '#f59e0b'
                      : '#a1a1aa',
                    fontSize: '11px',
                    fontWeight: isCurrent ? 800 : 600,
                    cursor: 'pointer'
                  }}
                >
                  <span>Q{qNum}</span>
                  {isSolved && <CheckCircle2 size={11} color="#10b981" />}
                  {isAttempted && <AlertCircle size={11} color="#f59e0b" />}
                </button>
              );
            })}

            <button
              type="button"
              disabled={currentQIndex >= (problems.length || 5)}
              onClick={handleNextQuestion}
              style={{
                padding: '4px 8px',
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '4px',
                color: currentQIndex >= (problems.length || 5) ? '#52525b' : '#a1a1aa',
                cursor: currentQIndex >= (problems.length || 5) ? 'not-allowed' : 'pointer'
              }}
              title="Next Problem"
            >
              <ArrowRight size={12} />
            </button>
          </div>
        </div>

        {/* Right: Timer, Score, Violations, Fullscreen & Finish */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Anti-cheat Infractions Pill */}
          {tabViolations > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 8px',
                borderRadius: '4px',
                background: tabViolations >= 3 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                border: tabViolations >= 3 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                color: tabViolations >= 3 ? '#ef4444' : '#f59e0b',
                fontSize: '11px',
                fontWeight: 700
              }}
            >
              <AlertTriangle size={12} />
              <span>{tabViolations}/3 Strikes</span>
            </div>
          )}

          {/* Contest Timer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '5px',
              background: '#18181b',
              border: '1px solid #27272a',
              fontSize: '11.5px',
              fontFamily: 'monospace',
              fontWeight: 700,
              color: remainingSeconds < 300 ? '#ef4444' : '#f4f4f5'
            }}
          >
            <Clock size={12} color={remainingSeconds < 300 ? '#ef4444' : '#a1a1aa'} />
            <span>{formattedTimer}</span>
          </div>

          {/* Challenges & Test Cases Passed Display (Marks hidden from candidate) */}
          <div
            style={{
              fontSize: '11.5px',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: '5px',
              background: '#18181b',
              border: '1px solid #27272a',
              color: '#f4f4f5',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span>Solved: <span style={{ color: '#10b981' }}>{solvedCount}</span> / 5</span>
            <span style={{ color: '#3f3f46' }}>|</span>
            <span>Test Cases: <span style={{ color: '#10b981' }}>{totalPassedTests}</span> / 25 Passed</span>
          </div>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            style={{
              padding: '6px',
              background: '#18181b',
              border: '1px solid #27272a',
              borderRadius: '5px',
              color: '#a1a1aa',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          {/* Finish Assessment Button */}
          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            style={{
              background: '#f4f4f5',
              color: '#09090b',
              border: 'none',
              borderRadius: '5px',
              padding: '5px 12px',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Send size={12} />
            <span>Finish</span>
          </button>
        </div>
      </header>

      {/* --- Main Workspace (Left: Problem Statement & Submissions | Right: Monaco & Testcase Console) --- */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* --- LEFT PANE (45%): Problem Statement & Submissions --- */}
        <section
          style={{
            width: '45%',
            borderRight: '1px solid #27272a',
            background: '#121214',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Left Tabs Header */}
          <div
            style={{
              height: '38px',
              borderBottom: '1px solid #27272a',
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              gap: '8px',
              background: '#18181b',
              userSelect: 'none'
            }}
          >
            <button
              type="button"
              onClick={() => setActiveLeftTab('description')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '4px',
                background: activeLeftTab === 'description' ? '#27272a' : 'transparent',
                color: activeLeftTab === 'description' ? '#ffffff' : '#a1a1aa',
                border: 'none',
                fontSize: '11.5px',
                fontWeight: activeLeftTab === 'description' ? 700 : 500,
                cursor: 'pointer'
              }}
            >
              <FileText size={12} />
              <span>Description</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveLeftTab('submissions')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '4px',
                background: activeLeftTab === 'submissions' ? '#27272a' : 'transparent',
                color: activeLeftTab === 'submissions' ? '#ffffff' : '#a1a1aa',
                border: 'none',
                fontSize: '11.5px',
                fontWeight: activeLeftTab === 'submissions' ? 700 : 500,
                cursor: 'pointer'
              }}
            >
              <History size={12} />
              <span>Submissions {submissionHistory[currentQIndex]?.length ? `(${submissionHistory[currentQIndex].length})` : ''}</span>
            </button>
          </div>

          {/* Left Pane Content Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {loadingProblems ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#a1a1aa' }}>
                <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                <div style={{ fontSize: '13px' }}>Loading Problem Statement from Cloud...</div>
              </div>
            ) : activeLeftTab === 'submissions' ? (
              /* --- SUBMISSIONS TAB --- */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#f4f4f5' }}>
                  Submission History for Problem {currentProblem.number}
                </div>
                {(!submissionHistory[currentQIndex] || submissionHistory[currentQIndex].length === 0) ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#71717a', fontSize: '12px' }}>
                    No submissions recorded yet for this problem. Click &quot;Submit Code&quot; to test all cases and record your score.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {submissionHistory[currentQIndex].map((rep, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#18181b',
                          border: '1px solid #27272a',
                          borderRadius: '6px',
                          padding: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background:
                                rep.status === 'ACCEPTED'
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : rep.status === 'PARTIAL'
                                  ? 'rgba(245, 158, 11, 0.15)'
                                  : 'rgba(239, 68, 68, 0.15)',
                              color:
                                rep.status === 'ACCEPTED'
                                  ? '#10b981'
                                  : rep.status === 'PARTIAL'
                                  ? '#f59e0b'
                                  : '#ef4444'
                            }}
                          >
                            {rep.status}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#f4f4f5' }}>
                            {rep.passedTests ?? (rep.status === 'ACCEPTED' ? 5 : 0)} / {rep.totalTests || 5} Cases Passed
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: '#71717a' }}>
                          <span>{rep.language}</span>
                          <span>{rep.executionTime || '24 ms'}</span>
                          <span>{rep.compiledAtFormatted || new Date(rep.compiledAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* --- PROBLEM DESCRIPTION TAB --- */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Title & Difficulty Header */}
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
                      5 Test Cases · Code Sprint
                    </span>
                    <span style={{ fontSize: '11px', color: '#71717a', fontFamily: 'monospace' }}>
                      Time Limit: {currentProblem.timeLimitMs || 2000}ms
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

                {/* Input Format */}
                {currentProblem.inputFormat && (
                  <div>
                    <h3 style={{ fontSize: '12.5px', fontWeight: 800, color: '#f4f4f5', margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Input Format
                    </h3>
                    <div style={{ fontSize: '13px', color: '#a1a1aa', lineHeight: 1.6 }}>
                      {currentProblem.inputFormat}
                    </div>
                  </div>
                )}

                {/* Constraints */}
                {currentProblem.constraints && currentProblem.constraints.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '12.5px', fontWeight: 800, color: '#f4f4f5', margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Constraints
                    </h3>
                    <ul style={{ margin: 0, paddingLeft: '18px', color: '#a1a1aa', fontSize: '12.5px', lineHeight: 1.8 }}>
                      {currentProblem.constraints.map((c, idx) => (
                        <li key={idx}>
                          <code style={{ background: '#18181b', padding: '2px 6px', borderRadius: '4px', color: '#f4f4f5', fontFamily: 'monospace' }}>
                            {c}
                          </code>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Output Format */}
                {currentProblem.outputFormat && (
                  <div>
                    <h3 style={{ fontSize: '12.5px', fontWeight: 800, color: '#f4f4f5', margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Output Format
                    </h3>
                    <div style={{ fontSize: '13px', color: '#a1a1aa', lineHeight: 1.6 }}>
                      {currentProblem.outputFormat}
                    </div>
                  </div>
                )}

                {/* Sample Test Cases (Examples) */}
                {currentProblem.sampleTestCases && currentProblem.sampleTestCases.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <h3 style={{ fontSize: '12.5px', fontWeight: 800, color: '#f4f4f5', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Sample Examples
                    </h3>
                    {currentProblem.sampleTestCases.map((tc, idx) => (
                      <div
                        key={tc.id || idx}
                        style={{
                          background: '#18181b',
                          border: '1px solid #27272a',
                          borderRadius: '8px',
                          padding: '14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#f4f4f5' }}>
                            Example {idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(tc.input, idx)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#71717a',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px'
                            }}
                          >
                            <Copy size={11} />
                            <span>{copiedIndex === idx ? 'Copied' : 'Copy Input'}</span>
                          </button>
                        </div>

                        <div>
                          <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#71717a', textTransform: 'uppercase', marginBottom: '4px' }}>
                            Input:
                          </div>
                          <pre
                            style={{
                              margin: 0,
                              background: '#09090b',
                              border: '1px solid #27272a',
                              borderRadius: '4px',
                              padding: '8px 10px',
                              fontFamily: "'Consolas', monospace",
                              fontSize: '12px',
                              color: '#f4f4f5',
                              whiteSpace: 'pre-wrap'
                            }}
                          >
                            {tc.input}
                          </pre>
                        </div>

                        <div>
                          <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#71717a', textTransform: 'uppercase', marginBottom: '4px' }}>
                            Expected Output:
                          </div>
                          <pre
                            style={{
                              margin: 0,
                              background: '#09090b',
                              border: '1px solid #27272a',
                              borderRadius: '4px',
                              padding: '8px 10px',
                              fontFamily: "'Consolas', monospace",
                              fontSize: '12px',
                              color: '#10b981',
                              whiteSpace: 'pre-wrap'
                            }}
                          >
                            {tc.expectedOutput}
                          </pre>
                        </div>

                        {tc.explanation && (
                          <div style={{ fontSize: '11.5px', color: '#a1a1aa', fontStyle: 'italic', marginTop: '2px' }}>
                            <strong>Explanation: </strong> {tc.explanation}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* --- RIGHT PANE (55%): Monaco Editor & HackerRank Console --- */}
        <section
          style={{
            width: '55%',
            display: 'flex',
            flexDirection: 'column',
            background: '#09090b',
            overflow: 'hidden'
          }}
        >
          {/* Editor Action Toolbar */}
          <div
            style={{
              height: '38px',
              background: '#121214',
              borderBottom: '1px solid #27272a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
              userSelect: 'none'
            }}
          >
            {/* Language Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#18181b',
                  border: '1px solid #27272a',
                  padding: '2px 8px',
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
                      fontSize: '9px',
                      color: '#10b981',
                      background: 'rgba(16, 185, 129, 0.12)',
                      padding: '1px 4px',
                      borderRadius: '3px'
                    }}
                  >
                    Auto
                  </span>
                )}
              </div>

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
                  padding: '2px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="Auto">Auto-Detect</option>
                <option value="Python">Python 3</option>
                <option value="Java">Java 17</option>
                <option value="C++">C++ 17</option>
                <option value="C">C 11</option>
              </select>

              <button
                type="button"
                onClick={handleResetToTemplate}
                title="Reset code to clean starter template"
                style={{
                  background: 'transparent',
                  border: '1px solid #27272a',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  color: '#71717a',
                  fontSize: '11px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <RotateCcw size={11} />
                <span>Reset</span>
              </button>
            </div>

            {/* Right Editor Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowCustomInput(!showCustomInput)}
                style={{
                  background: showCustomInput ? '#27272a' : '#18181b',
                  color: showCustomInput ? '#10b981' : '#a1a1aa',
                  border: '1px solid #27272a',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                title="Toggle custom stdin input"
              >
                <Terminal size={11} />
                <span>Custom Stdin</span>
              </button>
            </div>
          </div>

          {/* Custom Input Drawer (if open) */}
          {showCustomInput && (
            <div style={{ background: '#09090b', borderBottom: '1px solid #27272a', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600, fontFamily: 'monospace' }}>
                  STDIN (Custom Input for scanf / cin / input / Scanner):
                </span>
                <span style={{ fontSize: '10px', color: '#71717a' }}>Pass custom input lines</span>
              </div>
              <textarea
                value={customInputText}
                onChange={(e) => setCustomInputText(e.target.value)}
                placeholder="Enter input to feed into stdin..."
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
                padding: { top: 10, bottom: 10 }
              }}
            />
          </div>

          {/* --- HACKERRANK / LEETCODE TESTCASE & CONSOLE DRAWER --- */}
          <div
            style={{
              height: isConsoleExpanded ? '270px' : '38px',
              borderTop: '1px solid #27272a',
              background: '#121214',
              display: 'flex',
              flexDirection: 'column',
              transition: 'height 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              overflow: 'hidden'
            }}
          >
            {/* Console Header Tabs */}
            <div
              style={{
                height: '38px',
                background: '#18181b',
                borderBottom: isConsoleExpanded ? '1px solid #27272a' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px',
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveConsoleTab('testcase');
                    setIsConsoleExpanded(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    background: activeConsoleTab === 'testcase' ? '#27272a' : 'transparent',
                    color: activeConsoleTab === 'testcase' ? '#ffffff' : '#a1a1aa',
                    border: 'none',
                    fontSize: '11.5px',
                    fontWeight: activeConsoleTab === 'testcase' ? 700 : 500,
                    cursor: 'pointer'
                  }}
                >
                  <Terminal size={12} />
                  <span>Testcase</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveConsoleTab('testresult');
                    setIsConsoleExpanded(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    background: activeConsoleTab === 'testresult' ? '#27272a' : 'transparent',
                    color: activeConsoleTab === 'testresult' ? '#ffffff' : '#a1a1aa',
                    border: 'none',
                    fontSize: '11.5px',
                    fontWeight: activeConsoleTab === 'testresult' ? 700 : 500,
                    cursor: 'pointer'
                  }}
                >
                  <FileCheck size={12} />
                  <span>Test Result</span>
                  {activeReport && (
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: activeReport.status === 'ACCEPTED' ? '#10b981' : '#ef4444'
                      }}
                    />
                  )}
                </button>
              </div>

              {/* Console Minimize / Maximize */}
              <button
                type="button"
                onClick={() => setIsConsoleExpanded(!isConsoleExpanded)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#71717a',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={isConsoleExpanded ? 'Collapse Console' : 'Expand Console'}
              >
                {isConsoleExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            </div>

            {/* Console Body Area */}
            {isConsoleExpanded && (
              <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto', fontSize: '12px' }}>
                {activeConsoleTab === 'testcase' ? (
                  /* --- TESTCASE VIEW --- */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Case Pills */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {(currentProblem.sampleTestCases || []).map((_, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setSelectedCaseIdx(idx);
                              setIsCustomCase(false);
                            }}
                            style={{
                              padding: '4px 12px',
                              borderRadius: '4px',
                              background: !isCustomCase && selectedCaseIdx === idx ? '#27272a' : '#18181b',
                              border: !isCustomCase && selectedCaseIdx === idx ? '1px solid #f4f4f5' : '1px solid #27272a',
                              color: !isCustomCase && selectedCaseIdx === idx ? '#ffffff' : '#a1a1aa',
                              fontSize: '11.5px',
                              fontWeight: !isCustomCase && selectedCaseIdx === idx ? 700 : 500,
                              cursor: 'pointer'
                            }}
                          >
                            Case {idx + 1}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setIsCustomCase(true)}
                          style={{
                            padding: '4px 12px',
                            borderRadius: '4px',
                            background: isCustomCase ? '#27272a' : '#18181b',
                            border: isCustomCase ? '1px solid #60a5fa' : '1px solid #27272a',
                            color: isCustomCase ? '#60a5fa' : '#a1a1aa',
                            fontSize: '11.5px',
                            fontWeight: isCustomCase ? 700 : 500,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <span>+ Custom Input</span>
                        </button>
                      </div>

                      {/* Reset Input Button (when not in custom mode) */}
                      {!isCustomCase && (
                        <button
                          type="button"
                          onClick={() => {
                            const key = `${currentQIndex}_${selectedCaseIdx}`;
                            setEditableCaseInputs((prev) => {
                              const n = { ...prev };
                              delete n[key];
                              return n;
                            });
                            playSound('click');
                          }}
                          style={{
                            background: 'transparent',
                            border: '1px solid #27272a',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            color: '#71717a',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title="Reset input to default problem sample input"
                        >
                          <RotateCcw size={11} />
                          <span>Reset to Default</span>
                        </button>
                      )}
                    </div>

                    {/* Active Case Input Monospace Textarea */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>
                          {isCustomCase ? 'Custom Stdin Input:' : `Case ${selectedCaseIdx + 1} Input (stdin):`}
                        </span>
                        <span style={{ fontSize: '11px', color: '#52525b' }}>
                          Editable · Click &quot;Run Code&quot; to test with this input
                        </span>
                      </div>
                      <textarea
                        value={
                          isCustomCase
                            ? customInputText
                            : (editableCaseInputs[`${currentQIndex}_${selectedCaseIdx}`] !== undefined
                                ? editableCaseInputs[`${currentQIndex}_${selectedCaseIdx}`]
                                : (currentProblem.sampleTestCases?.[selectedCaseIdx]?.input || ''))
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          if (isCustomCase) {
                            setCustomInputText(val);
                          } else {
                            const key = `${currentQIndex}_${selectedCaseIdx}`;
                            setEditableCaseInputs((prev) => ({ ...prev, [key]: val }));
                          }
                        }}
                        placeholder="Enter input here (stdin)..."
                        rows={4}
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '5px',
                          background: '#09090b',
                          border: '1px solid #27272a',
                          color: '#f4f4f5',
                          fontFamily: "'Consolas', monospace",
                          fontSize: '12px',
                          lineHeight: 1.5,
                          resize: 'vertical',
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  /* --- TEST RESULT VIEW --- */
                  <div>
                    {isCompiling || isSubmitting ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#a1a1aa', padding: '20px 0' }}>
                        <Loader2 size={18} className="animate-spin" color="#10b981" />
                        <span style={{ fontSize: '13px' }}>
                          {isSubmitting ? 'Evaluating all test cases against cloud compiler judge...' : 'Running sample test cases...'}
                        </span>
                      </div>
                    ) : compileError ? (
                      <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '12px' }}>
                        <div style={{ color: '#ef4444', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                          Compile Error
                        </div>
                        <pre style={{ margin: 0, fontFamily: "'Consolas', monospace", color: '#fca5a5', fontSize: '11.5px', whiteSpace: 'pre-wrap' }}>
                          {compileError}
                        </pre>
                      </div>
                    ) : activeReport ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* Status Banner */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span
                              style={{
                                fontSize: '16px',
                                fontWeight: 800,
                                color:
                                  activeReport.status === 'ACCEPTED'
                                    ? '#10b981'
                                    : activeReport.status === 'PARTIAL'
                                    ? '#f59e0b'
                                    : '#ef4444'
                              }}
                            >
                              {activeReport.status === 'ACCEPTED' ? 'Accepted' : activeReport.status === 'PARTIAL' ? 'Partially Accepted' : 'Wrong Answer'}
                            </span>
                            <span style={{ fontSize: '12px', color: '#71717a' }}>
                              Test Cases: <strong style={{ color: '#f4f4f5' }}>{activeReport.passedTests} / {activeReport.totalTests}</strong> Passed
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11.5px', color: '#a1a1aa' }}>
                            <span>Runtime: <strong style={{ color: '#f4f4f5' }}>{activeReport.executionTime || '24 ms'}</strong></span>
                            <span>Time Complexity: <strong style={{ color: '#10b981' }}>{activeReport.timeComplexity || 'O(N)'}</strong></span>
                            <span>Space: <strong style={{ color: '#10b981' }}>{activeReport.spaceComplexity || 'O(1)'}</strong></span>
                          </div>
                        </div>

                        {/* Testcase Result Selector Pills */}
                        {activeReport.sampleResults && activeReport.sampleResults.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {activeReport.sampleResults.map((sr, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setSelectedCaseIdx(idx)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  padding: '3px 10px',
                                  borderRadius: '4px',
                                  background: selectedCaseIdx === idx ? '#27272a' : '#18181b',
                                  border: selectedCaseIdx === idx ? '1px solid #f4f4f5' : '1px solid #27272a',
                                  color: sr.passed ? '#10b981' : '#ef4444',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                {sr.passed ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                                <span>Case {idx + 1} ({sr.passed ? 'Passed' : 'Failed'})</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Selected Case Breakdown - Only show input and expected output if test case passed */}
                        {activeReport.sampleResults?.[selectedCaseIdx] && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {activeReport.sampleResults[selectedCaseIdx].passed ? (
                              <>
                                <div>
                                  <div style={{ fontSize: '10.5px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>
                                    Input:
                                  </div>
                                  <pre style={{ margin: 0, background: '#09090b', border: '1px solid #27272a', borderRadius: '4px', padding: '6px 8px', fontFamily: "'Consolas', monospace", fontSize: '11.5px', color: '#f4f4f5', whiteSpace: 'pre-wrap' }}>
                                    {activeReport.sampleResults[selectedCaseIdx].input}
                                  </pre>
                                </div>

                                <div>
                                  <div style={{ fontSize: '10.5px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>
                                    Your Output:
                                  </div>
                                  <pre style={{ margin: 0, background: '#09090b', border: '1px solid #27272a', borderRadius: '4px', padding: '6px 8px', fontFamily: "'Consolas', monospace", fontSize: '11.5px', color: '#10b981', whiteSpace: 'pre-wrap' }}>
                                    {activeReport.sampleResults[selectedCaseIdx].actual}
                                  </pre>
                                </div>

                                <div>
                                  <div style={{ fontSize: '10.5px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>
                                    Expected Output:
                                  </div>
                                  <pre style={{ margin: 0, background: '#09090b', border: '1px solid #27272a', borderRadius: '4px', padding: '6px 8px', fontFamily: "'Consolas', monospace", fontSize: '11.5px', color: '#10b981', whiteSpace: 'pre-wrap' }}>
                                    {activeReport.sampleResults[selectedCaseIdx].expected}
                                  </pre>
                                </div>
                              </>
                            ) : (
                              <div style={{ padding: '12px 14px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontWeight: 700, fontSize: '12.5px', marginBottom: '6px' }}>
                                  <XCircle size={15} />
                                  <span>Test Case {selectedCaseIdx + 1} Failed</span>
                                </div>
                                <div style={{ fontSize: '11.5px', color: '#a1a1aa', lineHeight: 1.5 }}>
                                  Test case inputs and expected outputs are hidden until your code passes. Review your solution logic and edge cases.
                                </div>
                                {activeReport.sampleResults[selectedCaseIdx].actual && (
                                  <div style={{ marginTop: '8px' }}>
                                    <div style={{ fontSize: '10.5px', color: '#ef4444', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>
                                      Your Output:
                                    </div>
                                    <pre style={{ margin: 0, background: '#09090b', border: '1px solid #27272a', borderRadius: '4px', padding: '6px 8px', fontFamily: "'Consolas', monospace", fontSize: '11px', color: '#ef4444', whiteSpace: 'pre-wrap' }}>
                                      {activeReport.sampleResults[selectedCaseIdx].actual}
                                    </pre>
                                  </div>
                                )}
                                {activeReport.sampleResults[selectedCaseIdx].error && (
                                  <div style={{ marginTop: '8px' }}>
                                    <div style={{ fontSize: '10.5px', color: '#ef4444', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>
                                      Diagnostics:
                                    </div>
                                    <pre style={{ margin: 0, background: '#09090b', border: '1px solid #27272a', borderRadius: '4px', padding: '6px 8px', fontFamily: "'Consolas', monospace", fontSize: '11px', color: '#ef4444', whiteSpace: 'pre-wrap' }}>
                                      {activeReport.sampleResults[selectedCaseIdx].error}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ color: '#71717a', fontStyle: 'italic', padding: '12px 0' }}>
                        Run your code against sample test cases or click &quot;Submit Code&quot; to test against all judge cases.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* --- HACKERRANK / LEETCODE BOTTOM ACTION BAR --- */}
          <div
            style={{
              height: '46px',
              background: '#121214',
              borderTop: '1px solid #27272a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 14px',
              userSelect: 'none'
            }}
          >
            {/* Left: Console Toggle Button */}
            <button
              type="button"
              onClick={() => setIsConsoleExpanded(!isConsoleExpanded)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '5px',
                padding: '5px 12px',
                color: '#a1a1aa',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <span>Console</span>
              {isConsoleExpanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            </button>

            {/* Right: Run Code & Submit Code Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                disabled={isCompiling || isSubmitting}
                onClick={handleRunCode}
                style={{
                  background: isCompiling ? '#27272a' : '#18181b',
                  color: isCompiling ? '#71717a' : '#f4f4f5',
                  border: '1px solid #27272a',
                  borderRadius: '5px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: isCompiling || isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isCompiling ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Running...</span>
                  </>
                ) : (
                  <>
                    <Play size={12} fill="#f4f4f5" />
                    <span>Run Code</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isCompiling || isSubmitting}
                onClick={handleSubmitCode}
                style={{
                  background: isSubmitting ? '#27272a' : '#10b981',
                  color: isSubmitting ? '#71717a' : '#09090b',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '6px 16px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: isCompiling || isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Check size={13} />
                    <span>Submit Code</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* --- PROCTOR LOCKDOWN ACADEMIC FREEZE MODAL --- */}
      {isProctorLocked && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.95)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px'
          }}
        >
          <div
            style={{
              maxWidth: '460px',
              width: '100%',
              background: '#121214',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '10px',
              padding: '28px',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.25)'
            }}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
                marginBottom: '16px'
              }}
            >
              <Lock size={26} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 6px 0', color: '#f4f4f5' }}>
              Academic Lockdown Triggered
            </h3>
            <p style={{ fontSize: '12.5px', color: '#a1a1aa', lineHeight: 1.6, margin: '0 0 12px 0' }}>
              Candidate {candidateProfile.name} ({cleanRoll}): Multiple tab switch or window departure infractions were detected. Examination input is frozen. Contact your lab proctor to unlock.
            </p>
            <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '14px', background: '#18181b', padding: '6px 10px', borderRadius: '4px', border: '1px solid #27272a' }}>
              Invigilator Master Key: <code style={{ color: '#60a5fa', fontWeight: 800 }}>AXENT-PROCTOR</code>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              <input
                type="password"
                placeholder="Enter Proctor Authorization Key..."
                value={unlockInput}
                onChange={(e) => setUnlockInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: '#18181b',
                  border: '1px solid #27272a',
                  color: '#f4f4f5',
                  fontSize: '12.5px',
                  textAlign: 'center',
                  outline: 'none'
                }}
              />
              {unlockError && (
                <div style={{ fontSize: '11.5px', color: '#ef4444' }}>
                  {unlockError}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleUnlockExam}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                background: '#ef4444',
                color: '#ffffff',
                border: 'none',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Verify &amp; Unlock Workstation
            </button>
          </div>
        </div>
      )}

      {/* --- FINAL SUBMISSION CONFIRMATION MODAL --- */}
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
              maxWidth: '460px',
              width: '100%',
              background: '#121214',
              border: '1px solid #27272a',
              borderRadius: '10px',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '6px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#10b981'
                }}
              >
                <FileCheck size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: '#f4f4f5' }}>
                  Submit Round 2 Examination
                </h3>
                <div style={{ fontSize: '11px', color: '#71717a' }}>
                  Review progress before final institutional seal
                </div>
              </div>
            </div>

            <div
              style={{
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '6px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '12px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#71717a' }}>Questions Attempted:</span>
                <strong style={{ color: '#f4f4f5' }}>{attemptedCount} / 5</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#71717a' }}>Questions Solved:</span>
                <strong style={{ color: '#10b981' }}>{solvedCount} / 5</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#71717a' }}>Pass Rate:</span>
                <strong style={{ color: '#f4f4f5' }}>{totalPassedTests} / 25 Test Cases</strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                disabled={isSubmittingFinal}
                onClick={() => setShowSubmitModal(false)}
                style={{
                  padding: '7px 12px',
                  background: 'transparent',
                  border: '1px solid #27272a',
                  borderRadius: '5px',
                  color: '#a1a1aa',
                  fontSize: '11.5px',
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
                  padding: '7px 16px',
                  background: '#10b981',
                  color: '#09090b',
                  border: 'none',
                  borderRadius: '5px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  cursor: isSubmittingFinal ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isSubmittingFinal ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>Sealing...</span>
                  </>
                ) : (
                  <>
                    <Check size={12} />
                    <span>Confirm &amp; Submit</span>
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
