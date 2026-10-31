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
  fetchRound2SubmissionFromCloud,
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
import { SimpleSelect } from '../watermelon/Select';
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

  // When problems load (async from cloud), recompute submission.maxScore from actual problem marks
  useEffect(() => {
    if (problems.length > 0 && !submission.isSubmitted) {
      const computedMax = problems.reduce((sum, p) => sum + (p.marks || 20), 0);
      if (computedMax !== submission.maxScore) {
        setSubmission((prev) => ({ ...prev, maxScore: computedMax }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problems]);

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
      maxScore: 0, // recomputed from actual problem marks when problems load
      isSubmitted: false,
      startedAt: Date.now(),
      dominantLanguage: 'Python'
    };
  });

  // Round 2 integrity controls: three-strike policy aligned with the MCQ exam.
  const [proctorStrikes, setProctorStrikes] = useState(() => {
    try {
      const cached = localStorage.getItem(`codedna_r2_strikes_${candidateKey}`);
      return cached ? Math.max(0, parseInt(cached, 10)) : 0;
    } catch {
      return 0;
    }
  });
  const [strikeNotice, setStrikeNotice] = useState<{ strike: number; reason: string } | null>(null);
  const [proctorLocked, setProctorLocked] = useState(() => {
    try {
      return localStorage.getItem(`codedna_r2_locked_${candidateKey}`) === 'true';
    } catch {
      return false;
    }
  });
  const lastViolationAt = useRef(0);

  const recordRound2Violation = useCallback((reason: string) => {
    if (submission.isSubmitted || proctorLocked) return;
    const now = Date.now();
    if (now - lastViolationAt.current < 1500) return;
    lastViolationAt.current = now;

    setProctorStrikes((previous) => {
      const next = previous + 1;
      try {
        localStorage.setItem(`codedna_r2_strikes_${candidateKey}`, String(next));
        if (next >= 3) {
          localStorage.setItem(`codedna_r2_locked_${candidateKey}`, 'true');
        }
      } catch {}

      void fetch('/api/codespark/proctor-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: candidateKey, reason })
      }).then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result?.success) throw new Error('Proctor event sync failed');
        const count = Number(result.strikeCount) || next;
        setProctorStrikes(count);
        try {
          localStorage.setItem(`codedna_r2_strikes_${candidateKey}`, String(count));
        } catch {}
        if (result.locked || count >= 3) {
          setProctorLocked(true);
          try {
            localStorage.setItem(`codedna_r2_locked_${candidateKey}`, 'true');
          } catch {}
        }
      }).catch(() => {
        if (next >= 3) {
          setProctorLocked(true);
          try {
            localStorage.setItem(`codedna_r2_locked_${candidateKey}`, 'true');
          } catch {}
        }
      });

      playSound('warning');
      setStrikeNotice({ strike: next, reason });
      if (next >= 3) {
        setProctorLocked(true);
        try {
          localStorage.setItem(`codedna_r2_locked_${candidateKey}`, 'true');
        } catch {}
      }
      return next;
    });
  }, [candidateKey, proctorLocked, submission.isSubmitted]);

  // Strict anti-cheating event listeners
  useEffect(() => {
    if (submission.isSubmitted || proctorLocked) return;

    const onVisibility = () => {
      if (document.hidden) {
        recordRound2Violation('Tab switch / backgrounding detected');
      }
    };

    const onBlur = () => {
      recordRound2Violation('Window focus lost / application switch detected');
    };

    const onFullscreen = () => {
      if (!document.fullscreenElement) {
        recordRound2Violation('Fullscreen examination mode exited');
      }
    };

    const onResize = () => {
      if (window.innerWidth < screen.availWidth * 0.75 || window.innerHeight < screen.availHeight * 0.7) {
        recordRound2Violation('Split-screen / window resizing violation');
      }
    };

    const onClipboard = (event: Event) => {
      event.preventDefault();
      recordRound2Violation(
        event.type === 'paste'
          ? 'Paste action blocked'
          : event.type === 'copy'
          ? 'Copy action blocked'
          : 'Cut action blocked'
      );
    };

    const onContext = (event: Event) => event.preventDefault();
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      recordRound2Violation('External content drop blocked');
    };
    const onDragOver = (event: DragEvent) => event.preventDefault();

    const onKeys = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && ['c', 'v', 'x', 'insert'].includes(key)) {
        event.preventDefault();
        event.stopPropagation();
        recordRound2Violation(key === 'v' || key === 'insert' ? 'Paste shortcut blocked' : 'Copy/cut shortcut blocked');
      } else if (key === 'printscreen') {
        event.preventDefault();
        recordRound2Violation('Print Screen shortcut detected');
      } else if (event.altKey && key === 'tab') {
        recordRound2Violation('Alt-Tab application switch detected');
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('resize', onResize);
    document.addEventListener('copy', onClipboard, true);
    document.addEventListener('cut', onClipboard, true);
    document.addEventListener('paste', onClipboard, true);
    document.addEventListener('contextmenu', onContext, true);
    document.addEventListener('drop', onDrop, true);
    document.addEventListener('dragover', onDragOver, true);
    window.addEventListener('keydown', onKeys, true);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('copy', onClipboard, true);
      document.removeEventListener('cut', onClipboard, true);
      document.removeEventListener('paste', onClipboard, true);
      document.removeEventListener('contextmenu', onContext, true);
      document.removeEventListener('drop', onDrop, true);
      document.removeEventListener('dragover', onDragOver, true);
      window.removeEventListener('keydown', onKeys, true);
    };
  }, [recordRound2Violation, submission.isSubmitted, proctorLocked]);

  // Periodic polling for proctor status & remote unlock detection
  useEffect(() => {
    if (submission.isSubmitted) return;
    let active = true;

    const checkProctorStatus = async () => {
      try {
        const response = await fetch(`/api/codespark/proctor-status?key=${encodeURIComponent(candidateKey)}`);
        if (!response.ok) return;
        const result = await response.json();
        if (!active || !result?.success) return;

        const count = Math.max(0, Number(result.strikeCount) || 0);
        setProctorStrikes(count);
        try {
          localStorage.setItem(`codedna_r2_strikes_${candidateKey}`, String(count));
        } catch {}

        if (result.locked) {
          setProctorLocked(true);
          try {
            localStorage.setItem(`codedna_r2_locked_${candidateKey}`, 'true');
          } catch {}
        } else if (result.locked === false && proctorLocked) {
          // Invigilator remotely unlocked the terminal!
          setProctorLocked(false);
          setStrikeNotice(null);
          try {
            localStorage.removeItem(`codedna_r2_locked_${candidateKey}`);
          } catch {}
          playSound('success');
        }
      } catch {}
    };

    checkProctorStatus();
    const interval = setInterval(checkProctorStatus, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [candidateKey, submission.isSubmitted, proctorLocked]);

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

  useEffect(() => {
    if (submission.isSubmitted) return;
    let mounted = true;
    void fetchRound2SubmissionFromCloud(candidateKey).then((serverSubmission) => {
      if (!mounted || !serverSubmission?.isSubmitted) return;
      setSubmission(serverSubmission);
      setCurrentQIndex(serverSubmission.currentQuestion || 1);
      const recoveredCode: Record<number, string> = {};
      for (const [number, report] of Object.entries(serverSubmission.questionReports || {})) {
        recoveredCode[Number(number)] = report.code || '';
      }
      setCodeMap((previous) => ({ ...previous, ...recoveredCode }));
    });
    return () => { mounted = false; };
  }, [candidateKey, submission.isSubmitted]);
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
  const [terminalTab, setTerminalTab] = useState<'console' | 'tests'>('console');
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const [activeReport, setActiveReport] = useState<Round2QuestionReport | null>(() => {
    return submission.questionReports[currentQIndex] || null;
  });

  // Mobile Responsiveness & Viewport Navigation Tabs
  const [isMobileScreen, setIsMobileScreen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );
  const [mobileTab, setMobileTab] = useState<'problem' | 'code' | 'console'>('problem');

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
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
      const report = await evaluateRound2Code(
        currentProblem,
        activeCode,
        effectiveLang,
        timeTakenMs,
        customInputText.trim() ? customInputText : undefined,
        candidateProfile.round2Key || candidateProfile.accessKey
      );
      // Track question start and compiled timestamps
      report.startedAt = qStart;
      report.startedAtFormatted = new Date(qStart).toLocaleTimeString();
      report.timeTakenSeconds = Math.max(1, Math.round((report.compiledAt - qStart) / 1000));
      setActiveReport(report);
      if (isMobileScreen) {
        setMobileTab('console');
      }
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
        maxScore: totalMax > 0 ? totalMax : problems.reduce((s, p) => s + (p.marks || 20), 0) || 100,
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
      if (isMobileScreen) {
        setMobileTab('console');
      }
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
      const finalReports = { ...submission.questionReports };
      for (const problem of problems) {
        const questionNumber = problem.number;
        const code = codeMap[questionNumber] || finalReports[questionNumber]?.code || '';
        const selectedLanguage = explicitLanguageMap[questionNumber] || 'Auto';
        const language = selectedLanguage === 'Auto'
          ? detectLanguageFromCode(code)
          : selectedLanguage;
        finalReports[questionNumber] = {
          ...(finalReports[questionNumber] || {}),
          questionNumber,
          questionId: problem.id,
          questionTitle: problem.title,
          code,
          language
        } as Round2QuestionReport;
      }
      const finalSub: Round2CandidateSubmission = {
        ...submission,
        questionReports: finalReports,
        isSubmitted: true,
        submittedAt: Date.now()
      };
      let authoritativeSubmission: Round2CandidateSubmission | null = null;
      try {
        authoritativeSubmission = await finalizeRound2Submission(finalSub);
      } catch (e) {
        console.warn('Cloud finalization error, falling back to local finalization:', e);
      }
      const submissionToUse = authoritativeSubmission || finalSub;
      updateSubmissionState(submissionToUse);
      try {
        saveStoredRound2Submission(submissionToUse);
      } catch {}
      setShowSubmitModal(false);
      playSound('success');
    } catch (err) {
      console.error('Final submission fallback error:', err);
      updateSubmissionState({ ...submission, isSubmitted: true, submittedAt: Date.now() });
      setShowSubmitModal(false);
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
            maxWidth: '560px',
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
            Candidate <strong>{submission.candidateName}</strong> ({submission.rollNumber}), your coding solutions and compilation telemetry have been encrypted and submitted to the institutional leaderboard.
          </p>

          {/* Institutional Receipt Card (Confidential: No Marks / Answers Leaked) */}
          <div
            style={{
              background: '#18181b',
              border: '1px solid #27272a',
              borderRadius: '8px',
              padding: '20px',
              marginBottom: '28px',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>
                Examination Dossier
              </span>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}
              >
                FINALIZED &amp; RECORDED
              </span>
            </div>
            <div style={{ fontSize: '12.5px', color: '#a1a1aa', lineHeight: 1.6 }}>
              All code implementations, test evaluations, and anti-cheat telemetry have been sealed into your institutional transcript. The Chief Proctor will declare the final shortlist centrally.
            </div>
          </div>

          <button
            type="button"
            onClick={onExit || (() => { window.location.href = '/code-spark'; })}
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
            <span>Exit to CodeSpark</span>
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
      {isMobileScreen ? (
        <header
          style={{
            background: '#121214',
            borderBottom: '1px solid #27272a',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 10
          }}
        >
          {/* Mobile Topline: Brand, Roll, Score, Actions */}
          <div
            style={{
              height: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
              borderBottom: '1px solid #1f1f23'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '5px',
                  background: '#18181b',
                  border: '1px solid #27272a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#f4f4f5'
                }}
              >
                <Code2 size={14} />
              </div>
              <div style={{ lineHeight: 1.1 }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#f4f4f5' }}>Round 2</span>
                <span style={{ fontSize: '10.5px', color: '#71717a', marginLeft: '6px', fontFamily: 'monospace' }}>
                  ({cleanRoll})
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: '#18181b',
                  border: '1px solid #27272a',
                  color: '#f4f4f5'
                }}
              >
                <span>Task {currentProblem.number} of 5</span>
              </div>
              <button
                type="button"
                onClick={handleToggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                style={{
                  padding: '5px',
                  background: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '4px',
                  color: '#a1a1aa',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
              <button
                type="button"
                onClick={() => setShowSubmitModal(true)}
                style={{
                  background: '#f4f4f5',
                  color: '#09090b',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Send size={11} />
                <span>Finish</span>
              </button>
            </div>
          </div>

          {/* Mobile Question Stepper Strip (Q1 to Q5) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              overflowX: 'auto',
              background: '#09090b',
              borderBottom: '1px solid #1f1f23',
              scrollbarWidth: 'none'
            }}
          >
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
                    borderRadius: '4px',
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
                    fontSize: '11px',
                    fontWeight: isCurrent ? 700 : 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                >
                  <span>Q{qNum}</span>
                  {isSolved ? (
                    <CheckCircle2 size={11} color="#10b981" />
                  ) : isAttempted ? (
                    <AlertCircle size={11} color="#f59e0b" />
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Mobile 3-Tab View Navigation */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              background: '#121214',
              borderBottom: '1px solid #27272a'
            }}
          >
            <button
              type="button"
              onClick={() => setMobileTab('problem')}
              style={{
                padding: '8px 4px',
                border: 'none',
                background: mobileTab === 'problem' ? '#18181b' : 'transparent',
                borderBottom: mobileTab === 'problem' ? '2px solid #ea1a1c' : '2px solid transparent',
                color: mobileTab === 'problem' ? '#ffffff' : '#71717a',
                fontSize: '11px',
                fontWeight: mobileTab === 'problem' ? 700 : 500,
                cursor: 'pointer',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px'
              }}
            >
              <span>1. Problem</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('code')}
              style={{
                padding: '8px 4px',
                border: 'none',
                background: mobileTab === 'code' ? '#18181b' : 'transparent',
                borderBottom: mobileTab === 'code' ? '2px solid #ea1a1c' : '2px solid transparent',
                color: mobileTab === 'code' ? '#ffffff' : '#71717a',
                fontSize: '11px',
                fontWeight: mobileTab === 'code' ? 700 : 500,
                cursor: 'pointer',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px'
              }}
            >
              <span>2. Code Editor</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('console')}
              style={{
                padding: '8px 4px',
                border: 'none',
                background: mobileTab === 'console' ? '#18181b' : 'transparent',
                borderBottom: mobileTab === 'console' ? '2px solid #ea1a1c' : '2px solid transparent',
                color: mobileTab === 'console' ? '#ffffff' : '#71717a',
                fontSize: '11px',
                fontWeight: mobileTab === 'console' ? 700 : 500,
                cursor: 'pointer',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px'
              }}
            >
              <span>3. Console / Stdin</span>
              {activeReport && (
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: activeReport.status === 'ACCEPTED' ? '#10b981' : '#f59e0b'
                  }}
                />
              )}
            </button>
          </div>
        </header>
      ) : (
        /* Desktop Top Header (>= 1024px) */
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
                  ) : null}
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
              Passed: <span style={{ color: '#10b981' }}>{[1, 2, 3, 4, 5].filter((qNum) => submission.questionReports?.[qNum]?.status === 'ACCEPTED').length}</span> / 5 Solved
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
      )}

      {/* --- Main Workspace: Left Problem Statement | Right Editor & Console --- */}
      <div style={{ flex: 1, display: 'flex', flexDirection: isMobileScreen ? 'column' : 'row', overflow: 'hidden' }}>
        {/* --- COLUMN 1: Problem Statement --- */}
        {(!isMobileScreen || mobileTab === 'problem') && (
          <section
            style={{
              width: isMobileScreen ? '100%' : '44%',
              height: '100%',
              borderRight: isMobileScreen ? 'none' : '1px solid #27272a',
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
              <div style={{ padding: isMobileScreen ? '16px' : '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Header: Title, Difficulty, Marks */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    {/* Single Clean Difficulty Badge */}
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: `1px solid ${
                          currentProblem.difficulty === 'Easy'
                            ? 'rgba(16, 185, 129, 0.4)'
                            : currentProblem.difficulty === 'Medium'
                            ? 'rgba(245, 158, 11, 0.4)'
                            : 'rgba(239, 68, 68, 0.4)'
                        }`,
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
                    {/* Dynamic Marks Badge */}
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#f4f4f5',
                        background: '#18181b',
                        border: '1px solid #27272a',
                        padding: '2px 8px',
                        borderRadius: '4px'
                      }}
                    >
                      {currentProblem.marks || (currentProblem.difficulty === 'Hard' ? 60 : currentProblem.difficulty === 'Medium' ? 40 : 20)} Marks
                    </span>
                    {/* Time Limit Badge */}
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
                      {currentProblem.timeLimitMs || 2000} ms
                    </span>
                  </div>
                  <h1 style={{ fontSize: isMobileScreen ? '15px' : '18px', fontWeight: 800, margin: 0, color: '#f4f4f5', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.35 }}>
                    {currentProblem.number}. {(currentProblem.title || '').replace(/^\d+\.\s*/, '')}
                  </h1>
                </div>

                {/* Problem Description */}
                <div style={{ fontSize: '13.5px', lineHeight: 1.7, color: '#d4d4d8' }}>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{currentProblem.description}</p>
                </div>

                {/* Input & Output Specifications */}
                {(currentProblem.inputFormat || currentProblem.outputFormat) && (
                  <div style={{ display: 'grid', gridTemplateColumns: currentProblem.inputFormat && currentProblem.outputFormat ? '1fr 1fr' : '1fr', gap: '8px' }}>
                    {currentProblem.inputFormat && (
                      <div style={{ background: '#121214', border: '1px solid #1f1f23', borderRadius: '4px', padding: '8px 10px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: '#71717a', letterSpacing: '0.05em', marginBottom: '2px' }}>
                          Input Spec
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#a1a1aa', fontFamily: 'monospace' }}>
                          {currentProblem.inputFormat}
                        </div>
                      </div>
                    )}
                    {currentProblem.outputFormat && (
                      <div style={{ background: '#121214', border: '1px solid #1f1f23', borderRadius: '4px', padding: '8px 10px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: '#71717a', letterSpacing: '0.05em', marginBottom: '2px' }}>
                          Output Spec
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#a1a1aa', fontFamily: 'monospace' }}>
                          {currentProblem.outputFormat}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Constraints */}
                {Array.isArray(currentProblem.constraints) && currentProblem.constraints.filter(c => c && !c.toLowerCase().includes('time limit') && !c.toLowerCase().includes('memory limit') && !c.toLowerCase().includes('standard algorithmic')).length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa', letterSpacing: '0.05em', marginBottom: '6px' }}>
                      Constraints
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: '#a1a1aa', lineHeight: 1.8 }}>
                      {currentProblem.constraints.filter(c => c && !c.toLowerCase().includes('time limit') && !c.toLowerCase().includes('memory limit') && !c.toLowerCase().includes('standard algorithmic')).map((c, i) => (
                        <li key={i} style={{ fontFamily: 'monospace' }}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Sample Test Cases */}
                {Array.isArray(currentProblem.sampleTestCases) && currentProblem.sampleTestCases.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa', letterSpacing: '0.05em' }}>
                      Sample Test Cases
                    </div>
                    {currentProblem.sampleTestCases.map((tc, idx) => (
                      <div key={idx} style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', overflow: 'hidden' }}>
                        <div style={{ background: '#121214', borderBottom: '1px solid #27272a', padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#f4f4f5' }}>Sample Case #{idx + 1}</span>
                        </div>
                        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div>
                            <div style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', marginBottom: '2px' }}>Sample Input</div>
                            <pre style={{ margin: 0, padding: '6px 8px', background: '#09090b', borderRadius: '4px', fontSize: '12px', color: '#f4f4f5', fontFamily: 'monospace', overflowX: 'auto' }}>{tc.input}</pre>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', marginBottom: '2px' }}>Sample Output</div>
                            <pre style={{ margin: 0, padding: '6px 8px', background: '#09090b', borderRadius: '4px', fontSize: '12px', color: '#10b981', fontFamily: 'monospace', overflowX: 'auto' }}>{tc.expectedOutput}</pre>
                          </div>
                          {tc.explanation && (
                            <div style={{ fontSize: '11px', color: '#a1a1aa', fontStyle: 'italic', borderTop: '1px solid #27272a', paddingTop: '6px' }}>
                              Explanation: {tc.explanation}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Mobile quick CTA to jump to code */}
                {isMobileScreen && (
                  <div style={{ paddingTop: '14px', borderTop: '1px solid #27272a' }}>
                    <button
                      type="button"
                      onClick={() => setMobileTab('code')}
                      style={{
                        width: '100%',
                        padding: '12px 18px',
                        background: '#f4f4f5',
                        color: '#09090b',
                        fontSize: '13px',
                        fontWeight: 700,
                        borderRadius: '6px',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      <span>Open Code Editor (Q{currentQIndex})</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* --- COLUMN 2: Code Editor & Compiler --- */}
        {(!isMobileScreen || mobileTab === 'code') && (
          <section
            style={{
              width: isMobileScreen ? '100%' : '56%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              background: '#09090b',
              overflow: 'hidden'
            }}
          >
            {/* Editor Action Toolbar */}
            <div
              style={{
                height: isMobileScreen ? 'auto' : '42px',
                minHeight: '42px',
                background: '#121214',
                borderBottom: '1px solid #27272a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              {/* Auto-detect badge & language selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
                <div style={{ width: '130px' }}>
                  <SimpleSelect<'Auto' | 'Python' | 'C++' | 'C' | 'Java'>
                    value={currentExplicit}
                    onChange={(val) => {
                      setExplicitLanguageMap((prev) => ({ ...prev, [currentQIndex]: val }));
                    }}
                    size="sm"
                    options={[
                      { value: 'Auto', label: 'Auto-Detect' },
                      { value: 'Python', label: 'Python' },
                      { value: 'C++', label: 'C++' },
                      { value: 'C', label: 'C' },
                      { value: 'Java', label: 'Java' }
                    ]}
                  />
                </div>
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

              {/* Action Buttons: Run Code */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                      <span>Running...</span>
                    </>
                  ) : (
                    <>
                      <Play size={13} fill="#09090b" />
                      <span>Run Code</span>
                    </>
                  )}
                </button>
              </div>
            </div>

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

            {/* Mobile Bottom Quick Switcher Bar */}
            {isMobileScreen && (
              <div
                style={{
                  height: '42px',
                  background: '#121214',
                  borderTop: '1px solid #27272a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 12px'
                }}
              >
                <button
                  type="button"
                  onClick={() => setMobileTab('problem')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#a1a1aa',
                    fontSize: '11px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer'
                  }}
                >
                  <ArrowLeft size={12} />
                  <span>View Problem</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileTab('console')}
                  style={{
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '4px',
                    color: '#f4f4f5',
                    fontSize: '11px',
                    padding: '4px 10px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer'
                  }}
                >
                  <Terminal size={12} color="#10b981" />
                  <span>View Console {activeReport ? `(${activeReport.status})` : ''} &rarr;</span>
                </button>
              </div>
            )}

            {/* Desktop Terminal Drawer (>= 1024px) */}
            {!isMobileScreen && (
              <div
                style={{
                  height: activeReport || compileError ? '300px' : '220px',
                  borderTop: '1px solid #27272a',
                  background: '#09090b',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'height 0.2s ease',
                  overflow: 'hidden'
                }}
              >
                {/* Terminal Header with Tabs */}
                <div
                  style={{
                    height: '34px',
                    background: '#121214',
                    borderBottom: '1px solid #27272a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setTerminalTab('console')}
                      style={{
                        background: terminalTab === 'console' ? '#18181b' : 'transparent',
                        border: terminalTab === 'console' ? '1px solid #27272a' : '1px solid transparent',
                        borderRadius: '4px',
                        padding: '3px 8px',
                        color: terminalTab === 'console' ? '#ffffff' : '#71717a',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <Terminal size={12} color={terminalTab === 'console' ? '#10b981' : '#71717a'} />
                      <span>Console &amp; Terminal</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTerminalTab('tests')}
                      style={{
                        background: terminalTab === 'tests' ? '#18181b' : 'transparent',
                        border: terminalTab === 'tests' ? '1px solid #27272a' : '1px solid transparent',
                        borderRadius: '4px',
                        padding: '3px 8px',
                        color: terminalTab === 'tests' ? '#ffffff' : '#71717a',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <CheckCircle2 size={12} color={terminalTab === 'tests' ? '#10b981' : '#71717a'} />
                      <span>Test Cases {activeReport ? `(${activeReport.passedTests}/${activeReport.totalTests})` : ''}</span>
                    </button>

                    {activeReport && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '3px',
                          marginLeft: '6px',
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
                        {activeReport.status}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '10.5px', color: '#71717a' }}>
                    {activeReport && (
                      <>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#e4e4e7' }}>
                          <Clock size={11} color="#a1a1aa" />
                          <strong>{activeReport.executionTime || '24 ms'}</strong>
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#10b981' }}>
                          <Cpu size={11} />
                          <strong>{activeReport.timeComplexity || 'O(N)'}</strong>
                        </span>
                      </>
                    )}
                    {(activeReport || customInputText) && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveReport(null);
                          setCompileError(null);
                          setCustomInputText('');
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#71717a',
                          cursor: 'pointer',
                          fontSize: '10.5px',
                          textDecoration: 'underline'
                        }}
                      >
                        Clear Console
                      </button>
                    )}
                  </div>
                </div>

                {/* Terminal Body */}
                <div
                  onClick={() => terminalInputRef.current?.focus()}
                  style={{
                    flex: 1,
                    padding: '12px 14px',
                    overflowY: 'auto',
                    fontSize: '12px',
                    fontFamily: "'JetBrains Mono', Consolas, monospace",
                    cursor: 'text',
                    background: '#09090b'
                  }}
                >
                  {compileError ? (
                    <div style={{ color: '#ef4444', whiteSpace: 'pre-wrap' }}>
                      <strong>Execution Error:</strong> {compileError}
                    </div>
                  ) : terminalTab === 'console' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {/* Terminal welcome prompt if empty */}
                      {!activeReport && (
                        <div style={{ color: '#52525b', fontSize: '11px', marginBottom: '4px' }}>
                          Terminal ready. Enter input below and press Enter, or click &quot;Run Code&quot; (▶).
                        </div>
                      )}

                      {/* Real Program Standard Output stream */}
                      {activeReport && (activeReport.compilerResult?.stdout || activeReport.sampleResults?.[0]?.actual) && (
                        <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: '12px', color: '#f4f4f5', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {activeReport.compilerResult?.stdout || activeReport.sampleResults?.[0]?.actual}
                        </pre>
                      )}

                      {/* Real Program Compile/Runtime Error Output */}
                      {activeReport && (activeReport.compilerResult?.compileOutput || activeReport.compilerResult?.stderr) && (
                        <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: '11.5px', color: '#f87171', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {activeReport.compilerResult.compileOutput || activeReport.compilerResult.stderr}
                        </pre>
                      )}

                      {/* Interactive Stdin Line right inside the terminal output */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <span style={{ color: '#10b981', fontWeight: 700, userSelect: 'none' }}>❯</span>
                        <input
                          ref={terminalInputRef}
                          type="text"
                          value={customInputText}
                          onChange={(e) => setCustomInputText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCompileAndRun();
                            }
                          }}
                          placeholder="Type input here and press Enter to execute..."
                          style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: '#f4f4f5',
                            fontSize: '12px',
                            fontFamily: 'inherit',
                            caretColor: '#10b981'
                          }}
                          autoFocus
                        />
                        {customInputText && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCustomInputText('');
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '11px' }}
                            title="Clear input"
                          >
                            &times;
                          </button>
                        )}
                      </div>

                      {/* Quick Sample Inputs pills inside terminal */}
                      {Array.isArray(currentProblem.sampleTestCases) && currentProblem.sampleTestCases.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #18181b', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '10px', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Quick Input:
                          </span>
                          {currentProblem.sampleTestCases.map((tc, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCustomInputText(tc.input || '');
                                terminalInputRef.current?.focus();
                              }}
                              style={{
                                background: '#121214',
                                border: '1px solid #27272a',
                                borderRadius: '3px',
                                padding: '1px 6px',
                                fontSize: '10.5px',
                                color: '#a1a1aa',
                                cursor: 'pointer',
                                fontFamily: 'monospace'
                              }}
                              title={`Set input to: ${tc.input}`}
                            >
                              Case #{idx + 1}: &quot;{tc.input}&quot;
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Test Cases & Telemetry Tab */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* Telemetry Card */}
                      {activeReport && (
                        <div
                          style={{
                            background: '#121214',
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
                              <span style={{ color: '#71717a' }}>Runtime: </span>
                              <strong style={{ color: '#f4f4f5' }}>{activeReport.executionTime || '24 ms'}</strong>
                            </div>
                            <div style={{ width: '1px', height: '14px', background: '#27272a' }} />
                            <div>
                              <span style={{ color: '#71717a' }}>Time: </span>
                              <strong style={{ color: '#10b981' }}>{activeReport.timeComplexity || 'O(N)'}</strong>
                            </div>
                            <div style={{ width: '1px', height: '14px', background: '#27272a' }} />
                            <div>
                              <span style={{ color: '#71717a' }}>Space: </span>
                              <strong style={{ color: '#60a5fa' }}>{activeReport.spaceComplexity || 'O(1)'}</strong>
                            </div>
                          </div>
                          {activeReport.complexityExplanation && (
                            <div style={{ fontSize: '11px', color: '#a1a1aa', fontStyle: 'italic' }}>
                              {activeReport.complexityExplanation}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Sample Test Results List */}
                      {activeReport?.sampleResults && activeReport.sampleResults.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: '8px' }}>
                          {activeReport.sampleResults.map((res, i) => (
                            <div
                              key={res.testCaseId || i}
                              style={{
                                background: '#121214',
                                border: res.passed ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '6px',
                                padding: '8px 10px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#f4f4f5' }}>Case #{i + 1}</span>
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: '3px',
                                    background: res.passed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                    color: res.passed ? '#10b981' : '#ef4444'
                                  }}
                                >
                                  {res.passed ? 'PASSED' : 'FAILED'}
                                </span>
                              </div>
                              <div style={{ fontSize: '10.5px', color: '#71717a' }}>Input: <code style={{ color: '#d4d4d8' }}>{res.input}</code></div>
                              <div style={{ fontSize: '10.5px', color: '#71717a' }}>Expected: <code style={{ color: '#10b981' }}>{res.expected}</code></div>
                              <div style={{ fontSize: '10.5px', color: '#71717a' }}>Actual: <code style={{ color: res.passed ? '#10b981' : '#ef4444' }}>{res.actual}</code></div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ color: '#71717a', fontStyle: 'italic', padding: '8px 0' }}>
                          Click &quot;Run Code&quot; to execute and evaluate automated test suites.
                        </div>
                      )}
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
                      <span>Final Submit</span>
                      <Send size={13} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* --- COLUMN 3: Standalone Mobile Console / Stdin Tab --- */}
        {isMobileScreen && mobileTab === 'console' && (
          <section
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              background: '#09090b',
              overflowY: 'auto'
            }}
          >
            {/* Mobile Console Header & Actions */}
            <div
              style={{
                padding: '10px 14px',
                background: '#121214',
                borderBottom: '1px solid #27272a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={14} color="#10b981" />
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#f4f4f5' }}>
                  Execution Terminal &amp; Test Suite
                </span>
              </div>
              <button
                type="button"
                disabled={isCompiling}
                onClick={handleCompileAndRun}
                style={{
                  background: isCompiling ? '#27272a' : '#10b981',
                  color: isCompiling ? '#a1a1aa' : '#09090b',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '5px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: isCompiling ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {isCompiling ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>Compiling...</span>
                  </>
                ) : (
                  <>
                    <Play size={12} fill="#09090b" />
                    <span>Run Code</span>
                  </>
                )}
              </button>
            </div>

            {/* Output & Test Results Body */}
            <div style={{ flex: 1, padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {compileError ? (
                <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '12px', color: '#ef4444', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                  <strong>Execution Error:</strong> {compileError}
                </div>
              ) : activeReport ? (
                <>
                  {/* Status Banner */}
                  <div
                    style={{
                      background:
                        activeReport.status === 'ACCEPTED'
                          ? 'rgba(16, 185, 129, 0.12)'
                          : activeReport.status === 'PARTIAL'
                          ? 'rgba(245, 158, 11, 0.12)'
                          : 'rgba(239, 68, 68, 0.12)',
                      border:
                        activeReport.status === 'ACCEPTED'
                          ? '1px solid rgba(16, 185, 129, 0.4)'
                          : activeReport.status === 'PARTIAL'
                          ? '1px solid rgba(245, 158, 11, 0.4)'
                          : '1px solid rgba(239, 68, 68, 0.4)',
                      borderRadius: '6px',
                      padding: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: activeReport.status === 'ACCEPTED' ? '#10b981' : activeReport.status === 'PARTIAL' ? '#f59e0b' : '#ef4444' }}>
                        {activeReport.status}
                      </div>
                      <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
                        Passed {activeReport.passedTests} of {activeReport.totalTests} test cases
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#10b981' }}>
                      {activeReport.status === 'ACCEPTED' ? 'Verified Solution' : 'Evaluated'}
                    </div>
                  </div>

                  {/* Standard Output with Interactive Terminal Input */}
                  <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '6px', padding: '10px 12px', fontFamily: "'JetBrains Mono', Consolas, monospace" }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#71717a', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Program Console
                    </div>
                    {activeReport.compilerResult?.stdout && (
                      <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: '11.5px', color: '#f4f4f5', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {activeReport.compilerResult.stdout}
                      </pre>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                      <span style={{ color: '#10b981', fontWeight: 700 }}>❯</span>
                      <input
                        type="text"
                        value={customInputText}
                        onChange={(e) => setCustomInputText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCompileAndRun();
                          }
                        }}
                        placeholder="Type input & press Enter or Run..."
                        style={{
                          flex: 1,
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          color: '#f4f4f5',
                          fontSize: '11.5px',
                          fontFamily: 'inherit',
                          caretColor: '#10b981'
                        }}
                      />
                    </div>
                  </div>

                  {/* Stderr Diagnostics */}
                  {(activeReport.compilerResult?.compileOutput || activeReport.compilerResult?.stderr) && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', marginBottom: '4px' }}>
                        Diagnostics &amp; Errors
                      </div>
                      <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '11.5px', color: '#fca5a5', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {activeReport.compilerResult.compileOutput || activeReport.compilerResult.stderr}
                      </pre>
                    </div>
                  )}

                  {/* Test Cases List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase' }}>
                      Individual Test Verifications
                    </div>
                    {activeReport.sampleResults?.map((res, i) => (
                      <div
                        key={i}
                        style={{
                          background: '#121214',
                          border: res.passed ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '6px',
                          padding: '10px 12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#f4f4f5' }}>Case #{i + 1}</span>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: res.passed ? '#10b981' : '#ef4444' }}>
                            {res.passed ? 'PASSED' : 'FAILED'}
                          </span>
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#71717a' }}>Input: <code style={{ color: '#d4d4d8' }}>{res.input}</code></div>
                        <div style={{ fontSize: '10.5px', color: '#71717a' }}>Expected: <code style={{ color: '#10b981' }}>{res.expected}</code></div>
                        <div style={{ fontSize: '10.5px', color: '#71717a' }}>Output: <code style={{ color: res.passed ? '#10b981' : '#ef4444' }}>{res.actual}</code></div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: '#71717a', fontSize: '12px' }}>
                  No code runs logged yet. Click &quot;Run Code&quot; above to compile your solution and view diagnostics.
                </div>
              )}

              {/* Bottom return to editor button */}
              <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setMobileTab('code')}
                  style={{
                    width: '100%',
                    padding: '12px 18px',
                    background: '#18181b',
                    color: '#f4f4f5',
                    border: '1px solid #27272a',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: 'pointer'
                  }}
                >
                  <ArrowLeft size={14} />
                  <span>Return to Code Editor</span>
                </button>
              </div>
            </div>
          </section>
        )}
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
              Are you sure you want to seal and submit your assessment? Once submitted, your code implementations will be finalized on the institutional ledger.
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
                <span style={{ color: '#71717a' }}>Assessment Status:</span>
                <strong style={{ color: '#10b981' }}>Ready to Seal &amp; Submit</strong>
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
      {/* 1. Immovable Fullscreen Lockdown Overlay when Proctored/Locked */}
      {proctorLocked && (
        <div
          role="alertdialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(9, 9, 11, 0.96)',
            backdropFilter: 'blur(8px)',
            display: 'grid',
            placeItems: 'center',
            padding: '24px'
          }}
        >
          <div
            style={{
              width: 'min(500px, 100%)',
              background: '#121215',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              borderRadius: '12px',
              padding: '32px 28px',
              color: '#f4f4f5',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'grid',
                placeItems: 'center',
                color: '#ef4444'
              }}
            >
              <ShieldAlert size={26} />
            </div>

            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.14em', color: '#f87171', textTransform: 'uppercase', marginBottom: '6px' }}>
                Academic Integrity Violation · 3/3 Strikes Reached
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 8px', color: '#ffffff' }}>
                Workstation Locked
              </h2>
              <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#a1a1aa', margin: 0 }}>
                This examination terminal has been frozen due to repeated proctoring violations. All code editor inputs and navigation are disabled.
              </p>
            </div>

            <div
              style={{
                width: '100%',
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '8px',
                padding: '14px 16px',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                fontSize: '12px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#71717a' }}>
                <span>Candidate:</span>
                <span style={{ color: '#f4f4f5', fontWeight: 600 }}>{cleanRoll || candidateKey}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#71717a' }}>
                <span>Lockout Reason:</span>
                <span style={{ color: '#f87171', fontWeight: 600 }}>{strikeNotice?.reason || 'Proctor strike limit exceeded'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#71717a' }}>
                <span>Remote Listener:</span>
                <span style={{ color: '#10b981', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                  Listening for Proctor Unlock
                </span>
              </div>
            </div>

            <p style={{ fontSize: '12px', color: '#71717a', margin: 0 }}>
              Please alert the invigilator. Once the proctor unlocks your workstation from the Chief Proctor Console, this screen will dismiss automatically.
            </p>
          </div>
        </div>
      )}

      {/* 2. Warning Modal for Strikes 1 and 2 */}
      {strikeNotice && !proctorLocked && strikeNotice.strike < 3 && (
        <div
          role="alertdialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            background: 'rgba(0,0,0,0.85)',
            display: 'grid',
            placeItems: 'center',
            padding: 20
          }}
        >
          <div
            style={{
              width: 'min(440px, 100%)',
              background: '#18181b',
              border: '1px solid #ef4444',
              borderRadius: 12,
              padding: 26,
              color: '#f4f4f5',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: '#f87171', textTransform: 'uppercase' }}>
              Academic Integrity · Strike {strikeNotice.strike}/3
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '12px 0 8px' }}>Proctor Warning</h2>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: '#d4d4d8', margin: '0 0 14px' }}>{strikeNotice.reason}</p>
            <p style={{ fontSize: 12, color: '#fbbf24', margin: '0 0 16px' }}>Further violations will freeze your examination workstation.</p>
            <button
              type="button"
              onClick={() => setStrikeNotice(null)}
              style={{
                padding: '8px 24px',
                border: 0,
                borderRadius: 6,
                background: '#f4f4f5',
                color: '#09090b',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer'
              }}
            >
              I Understand
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
export default CodeSparkRound2Arena;