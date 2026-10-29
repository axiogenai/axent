import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Key,
  Lock,
  ArrowRight,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  Clock,
  Check,
  Search,
  Users,
  Trophy,
  Sparkles,
  ExternalLink,
  RefreshCw,
  X,
  Code2
} from 'lucide-react';
import {
  CodeSparkCandidate,
  lookupCandidateByKey,
  lookupCandidateAny,
  asyncLookupCandidateByKey,
  asyncLookupCandidateAny,
  syncCandidatesFromCloud,
  isCandidateInShortlistStorage,
  getAllCodeSparkCandidates,
  setActiveCodeSparkCandidate,
  importCodeSparkCandidates,
  generateCodeSparkKey,
  saveCodeSparkCandidates,
  ensureCodeSparkAptitudeExam,
  getCodeSparkActiveExam,
  asyncGetCodeSparkActiveExam,
  isRound1ConcludedGlobally,
  isLabOverflowRetakeEnabledGlobally,
  isCandidateAuthorizedForRound1Retake,
  authorizeCandidateForRound1Retake,
  prepareCandidateForRound1Retake
} from '../services/codeSparkService';
import { getAllAttempts, getAllExams } from '../services/mcqService';
import { MCQExamConfig } from '../types/mcq';
import { getAllCodingQuestions, getAllCodingExams } from '../services/codingQuestionService';
import { CodeSparkCandidateImportModal } from './codespark/CodeSparkCandidateImportModal';
import { playSound } from '../utils/sounds';
import { requestExamFullscreen } from '../services/timeSyncService';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

interface CodeSparkPortalProps {
  theme?: string;
}

export const CodeSparkPortal: React.FC<CodeSparkPortalProps> = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const lenisRef = useRef<Lenis | null>(null);

  // Initialize Lenis Smooth Scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.5
    });
    lenisRef.current = lenis;

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Scroll Progress and active section
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeSection, setActiveSection] = useState<'hero' | 'phases' | 'forensics' | 'terminal'>('hero');

  // Key & Candidate State
  const [accessKey, setAccessKey] = useState('');
  const [keyDigits, setKeyDigits] = useState('');
  const [activeCandidate, setActiveCandidate] = useState<CodeSparkCandidate | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  // Candidate Details
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [department, setDepartment] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [terminalStep, setTerminalStep] = useState<1 | 2 | 3>(1);

  // Bypass & Filter
  const [proctorBypassRound2, setProctorBypassRound2] = useState(false);

  // Live Candidates Roster
  const [registeredCandidates, setRegisteredCandidates] = useState<CodeSparkCandidate[]>(() =>
    getAllCodeSparkCandidates()
  );

  useEffect(() => {
    const syncCandidates = () => {
      setRegisteredCandidates(getAllCodeSparkCandidates());
    };
    window.addEventListener('codedna_codespark_candidates_updated', syncCandidates);
    window.addEventListener('storage', syncCandidates);
    return () => {
      window.removeEventListener('codedna_codespark_candidates_updated', syncCandidates);
      window.removeEventListener('storage', syncCandidates);
    };
  }, []);

  // Shortlisted rolls for Stage 02
  const [shortlistedRolls, setShortlistedRolls] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('codedna_codespark_shortlist');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const syncShortlist = () => {
      try {
        const raw = localStorage.getItem('codedna_codespark_shortlist');
        setShortlistedRolls(raw ? JSON.parse(raw) : []);
      } catch {}
    };
    window.addEventListener('storage', syncShortlist);
    return () => window.removeEventListener('storage', syncShortlist);
  }, []);

  // Global Round 1 Concluded state
  const [isRound1Concluded, setIsRound1Concluded] = useState(() => isRound1ConcludedGlobally());

  useEffect(() => {
    const syncConcluded = () => {
      setIsRound1Concluded(isRound1ConcludedGlobally());
    };
    window.addEventListener('codedna_codespark_concluded_updated', syncConcluded);
    window.addEventListener('storage', syncConcluded);
    return () => {
      window.removeEventListener('codedna_codespark_concluded_updated', syncConcluded);
      window.removeEventListener('storage', syncConcluded);
    };
  }, []);

  // Exam Countdown to scheduled contest or upcoming exam
  const targetDate = useMemo(() => {
    try {
      const assignedId = localStorage.getItem('codedna_codespark_round1_exam_id');
      const exams = getAllExams();
      const csExam = assignedId
        ? exams.find((e) => e.id === assignedId)
        : exams.find((e) => e.isCodeSpark);
      if (csExam && csExam.startTime && csExam.startTime > Date.now()) {
        return csExam.startTime;
      }
    } catch {}
    return new Date('2026-11-03T09:00:00+05:30').getTime();
  }, []);
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number }>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  });

  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const diff = Math.max(0, targetDate - now);
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft({ days, hours, minutes, seconds });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  // CRITICAL: Ensure ancestors do not block position: sticky & inject mobile overrides
  useEffect(() => {
    const mobileStyle = document.createElement('style');
    mobileStyle.id = 'codespark-mobile-overrides';
    mobileStyle.textContent = `
      @media (max-width: 768px) {
        #p1, #p2 {
          height: auto !important;
          margin-top: 0 !important;
          overflow: hidden !important;
        }
        #p1 > div, #p2 > div {
          position: relative !important;
          width: 100% !important;
          aspect-ratio: 1536 / 1024 !important;
          height: auto !important;
          min-height: 0 !important;
          overflow: hidden !important;
          background: #eeece8 !important;
        }
        #p1 > div > svg, #p2 > div > svg {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          display: block !important;
          overflow: hidden !important;
        }
        #gl { display: none !important; }
        #candidate-terminal { padding-top: 2rem !important; padding-bottom: 3rem !important; }
        .cs-terminal-grid { display: flex !important; flex-direction: column !important; }
      }
    `;
    if (!document.getElementById('codespark-mobile-overrides')) {
      document.head.appendChild(mobileStyle);
    }
    const origHtmlHeight = document.documentElement.style.height;
    const origBodyHeight = document.body.style.height;
    const origHtmlOverflowX = document.documentElement.style.overflowX;
    const origBodyOverflowX = document.body.style.overflowX;

    document.documentElement.style.height = 'auto';
    document.body.style.height = 'auto';
    document.documentElement.style.overflowX = 'clip';
    document.body.style.overflowX = 'clip';

    const rootEl = document.getElementById('root');
    const appRootEl = document.getElementById('app-root');
    if (rootEl) {
      rootEl.style.height = 'auto';
      rootEl.style.overflow = 'visible';
    }
    if (appRootEl) {
      appRootEl.style.height = 'auto';
      appRootEl.style.overflow = 'visible';
    }

    return () => {
      document.documentElement.style.height = origHtmlHeight;
      document.body.style.height = origBodyHeight;
      document.documentElement.style.overflowX = origHtmlOverflowX;
      document.body.style.overflowX = origBodyOverflowX;
    };
  }, []);

  // Synchronize candidate roster from cloud on mount
  useEffect(() => {
    void syncCandidatesFromCloud().then((synced) => {
      if (synced && synced.length > 0) {
        setRegisteredCandidates(synced);
      }
    });
  }, []);

  // Direct Key Authentication & One-Click Exam Launch
  const handleDigitsInput = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    setKeyDigits(digits);
    setKeyError(null);

    const fullKey = digits ? `AXENT-${digits}` : '';
    setAccessKey(fullKey);

    if (digits.length === 4) {
      const candidate = lookupCandidateByKey(fullKey);
      if (candidate) {
        setActiveCandidate(candidate);
        setCandidateName(candidate.name || '');
        setCandidateEmail(candidate.email || '');
        setRollNumber(candidate.rollNumber || candidate.email.split('@')[0].toUpperCase());
        setDepartment(candidate.department || 'Axent Candidate');
        playSound('success');
      } else {
        // Asynchronously check Supabase cloud roster
        void asyncLookupCandidateByKey(fullKey).then((cloudCand) => {
          if (cloudCand) {
            setActiveCandidate(cloudCand);
            setCandidateName(cloudCand.name || '');
            setCandidateEmail(cloudCand.email || '');
            setRollNumber(cloudCand.rollNumber || cloudCand.email.split('@')[0].toUpperCase());
            setDepartment(cloudCand.department || 'Axent Candidate');
            playSound('success');
          } else {
            setActiveCandidate(null);
          }
        });
      }
    } else {
      setActiveCandidate(null);
    }
  };

  const handleDirectExamLaunch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const digits = keyDigits.trim();
    if (!digits) {
      playSound('warning');
      setKeyError('Please enter your 4-digit key number (e.g. 1234).');
      return;
    }

    if (digits.length < 4) {
      playSound('warning');
      setKeyError('Please enter all 4 digits of your key number.');
      return;
    }

    const fullKey = `AXENT-${digits}`;
    let anyLookup = lookupCandidateAny(fullKey) || lookupCandidateAny(digits);
    if (!anyLookup) {
      anyLookup = (await asyncLookupCandidateAny(fullKey)) || (await asyncLookupCandidateAny(digits));
    }

    // Check if CodeSpark exam paper is active/scheduled in Supabase cloud
    let targetExam = getCodeSparkActiveExam();
    if (!targetExam) {
      targetExam = await asyncGetCodeSparkActiveExam();
    }

    if (!targetExam) {
      playSound('warning');
      setActiveCandidate(null);
      setKeyError(
        'The CodeSpark examination is not yet scheduled or paper has not been assigned by the proctor. Please wait for the event administrator to launch the session.'
      );
      return;
    }

    if (targetExam.status === 'DRAFT') {
      playSound('warning');
      setKeyError(
        'The CodeSpark examination paper is in draft state and has not been launched yet. Please wait for the event administrator.'
      );
      return;
    }

    if (targetExam.startTime && Date.now() < targetExam.startTime) {
      playSound('warning');
      setKeyError(
        `This examination is scheduled for ${new Date(targetExam.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Early entry is strictly prohibited.`
      );
      return;
    }

    if (!anyLookup) {
      playSound('warning');
      setActiveCandidate(null);
      setKeyError(`Candidate key "${fullKey}" is not registered for this event. Please verify your 4-digit code provided by the proctor.`);
      return;
    }

    const cand = anyLookup.candidate;
    const isCandidateShortlisted = Boolean(
      anyLookup.isShortlisted ||
      cand.isShortlisted ||
      cand.status === 'SHORTLISTED' ||
      isCandidateInShortlistStorage(cand.rollNumber || cand.accessKey)
    );

    // Update candidate status
    const allCandidates = getAllCodeSparkCandidates();
    const storedCand = allCandidates.find((c) => c.accessKey.toUpperCase() === cand.accessKey.toUpperCase()) || cand;
    storedCand.status = isCandidateShortlisted ? 'SHORTLISTED' : 'CHECKED_IN';
    storedCand.lastActiveAt = Date.now();
    saveCodeSparkCandidates(allCandidates);
    setRegisteredCandidates(allCandidates);
    setActiveCandidate(storedCand);

    const safeExam: MCQExamConfig = targetExam;
    const derivedRoll = cand.rollNumber || cand.email.split('@')[0].toUpperCase();

    // Check if candidate already completed Round 1
    const attempts = getAllAttempts();
    const priorAttempt = attempts.find(
      (a) =>
        (a.studentRoll || '').trim().toUpperCase() === derivedRoll &&
        a.examId === safeExam.id &&
        (a.status === 'SUBMITTED' || a.status === 'TIMED_OUT' || a.score !== undefined)
    );

    // If student entered a Round 2 Key OR is attempting to launch Round 2:
    if (anyLookup.targetRound === 'round2') {
      if (!isCandidateShortlisted) {
        playSound('warning');
        setKeyError('Access Denied: Round 2 is restricted to shortlisted candidates only. Check your registered email.');
        return;
      }

      const codingProfile = {
        name: cand.name.trim(),
        email: cand.email.trim().toLowerCase(),
        rollNumber: derivedRoll,
        department: cand.department || 'Axent Candidate',
        course: 'Code Spark 2026',
        examType: 'Code Sprint',
        assignmentTitle: 'Code Spark 2026: Algorithmic Code Sprint Arena',
        examMode: 'CODING',
        accessKey: cand.round2Key || cand.accessKey,
        isShortlisted: true,
        sessionStartTime: Date.now()
      };
      try {
        localStorage.setItem('codedna_student_profile', JSON.stringify(codingProfile));
        localStorage.setItem('codedna_active_exam_mode', 'CODING');
        setActiveCodeSparkCandidate(cand);
      } catch {}

      playSound('success');
      try {
        await requestExamFullscreen();
      } catch {}
      navigate('/codespark-exams?round=2');
      return;
    }

    // Candidate entered standard Round 1 code:
    if (priorAttempt) {
      if (isCandidateShortlisted) {
        const codingProfile = {
          name: cand.name.trim(),
          email: cand.email.trim().toLowerCase(),
          rollNumber: derivedRoll,
          department: cand.department || 'Axent Candidate',
          course: 'Code Spark 2026',
          examType: 'Code Sprint',
          assignmentTitle: 'Code Spark 2026: Algorithmic Code Sprint Arena',
          examMode: 'CODING',
          accessKey: cand.round2Key || cand.accessKey,
          isShortlisted: true,
          sessionStartTime: Date.now()
        };
        try {
          localStorage.setItem('codedna_student_profile', JSON.stringify(codingProfile));
          localStorage.setItem('codedna_active_exam_mode', 'CODING');
          setActiveCodeSparkCandidate(cand);
        } catch {}

        playSound('success');
        try {
          await requestExamFullscreen();
        } catch {}
        navigate('/codespark-exams?round=2');
        return;
      } else {
        const isRetakeAllowed =
          isCandidateAuthorizedForRound1Retake(cand.rollNumber || cand.accessKey) ||
          isCandidateAuthorizedForRound1Retake(cand.email) ||
          isLabOverflowRetakeEnabledGlobally();

        if (isRetakeAllowed) {
          prepareCandidateForRound1Retake(derivedRoll, safeExam.id);
          const profile = {
            name: cand.name.trim(),
            email: cand.email.trim().toLowerCase(),
            rollNumber: derivedRoll,
            department: cand.department || 'Axent Candidate',
            course: 'Code Spark 2026',
            examType: 'Aptitude',
            assignmentTitle: safeExam.title,
            examMode: 'MCQ',
            mcqExamId: safeExam.id,
            accessKey: cand.accessKey,
            sessionStartTime: Date.now(),
            batch: 2,
            isRetake: true
          };
          try {
            localStorage.setItem('codedna_student_profile', JSON.stringify(profile));
            localStorage.setItem('codedna_active_exam_mode', 'MCQ');
            localStorage.setItem('codedna_codespark_round1_exam_id', safeExam.id);
            setActiveCodeSparkCandidate(cand);
          } catch {}

          playSound('success');
          try {
            await requestExamFullscreen();
          } catch {}
          navigate(`/codespark-exams?examId=${safeExam.id}&round=1&batch=2&retake=true&autoStart=true`);
          return;
        }

        playSound('warning');
        if (!isRound1ConcludedGlobally()) {
          setKeyError(
            `Round 1 attempt logged (Score: ${priorAttempt.score ?? 0}/${priorAttempt.maxScore || safeExam.totalMarks}). Testing is currently ongoing across all competition terminals. The Chief Proctor will conclude Round 1 and announce the finalists once all candidates finish. Shortlisted candidates will receive their Round 2 key via email.`
          );
        } else {
          setKeyError(
            `Round 1 assessment has concluded across all laboratories (Score: ${priorAttempt.score ?? 0}/${priorAttempt.maxScore || safeExam.totalMarks}). Minimum qualifying cutoff was not met.`
          );
        }
        return;
      }
    }

    // New candidate attempt: Ensure Round 1 is still open
    if (isRound1ConcludedGlobally()) {
      playSound('warning');
      setKeyError('Round 1 examination has concluded and sealed across all terminals. New registrations/attempts are closed.');
      return;
    }

    // Launch Round 1 Aptitude Exam!
    const profile = {
      name: cand.name.trim(),
      email: cand.email.trim().toLowerCase(),
      rollNumber: derivedRoll,
      department: cand.department || 'Axent Candidate',
      course: 'Code Spark 2026',
      examType: 'Aptitude',
      assignmentTitle: safeExam.title,
      examMode: 'MCQ',
      mcqExamId: safeExam.id,
      accessKey: cand.accessKey,
      sessionStartTime: Date.now()
    };

    try {
      localStorage.setItem('codedna_student_profile', JSON.stringify(profile));
      localStorage.setItem('codedna_active_exam_mode', 'MCQ');
      localStorage.setItem('codedna_codespark_round1_exam_id', safeExam.id);
      setActiveCodeSparkCandidate(cand);
    } catch {}

    playSound('success');
    try {
      await requestExamFullscreen();
    } catch {}
    navigate(`/codespark-exams?examId=${safeExam.id}&round=1&autoStart=true`);
  };

  const handleLaunchBatch2 = async () => {
    playSound('click');
    let targetExam = getCodeSparkActiveExam();
    if (!targetExam) {
      targetExam = await asyncGetCodeSparkActiveExam();
    }
    if (!targetExam) {
      playSound('warning');
      setKeyError(
        'The CodeSpark examination is not yet scheduled or paper has not been assigned by the proctor. Please wait for the event administrator to launch the session.'
      );
      return;
    }
    const safeExam: MCQExamConfig = targetExam;
    const cand = activeCandidate || (keyDigits.trim() ? (lookupCandidateByKey(`AXENT-${keyDigits.trim()}`) || lookupCandidateAny(keyDigits.trim())?.candidate) : null);
    if (!cand) {
      playSound('warning');
      setKeyError('Please enter your 4-digit key before starting Batch 2.');
      return;
    }
    const derivedRoll = cand.rollNumber || cand.email.split('@')[0].toUpperCase();
    authorizeCandidateForRound1Retake(cand.accessKey, true);
    prepareCandidateForRound1Retake(derivedRoll, safeExam.id);

    const profile = {
      name: cand.name.trim(),
      email: cand.email.trim().toLowerCase(),
      rollNumber: derivedRoll,
      department: cand.department || 'Axent Candidate',
      course: 'Code Spark 2026',
      examType: 'Aptitude',
      assignmentTitle: safeExam.title,
      examMode: 'MCQ',
      mcqExamId: safeExam.id,
      accessKey: cand.accessKey,
      sessionStartTime: Date.now(),
      batch: 2,
      isRetake: true
    };
    try {
      localStorage.setItem('codedna_student_profile', JSON.stringify(profile));
      localStorage.setItem('codedna_active_exam_mode', 'MCQ');
      localStorage.setItem('codedna_codespark_round1_exam_id', safeExam.id);
      setActiveCodeSparkCandidate(cand);
    } catch {}

    playSound('success');
    try {
      await requestExamFullscreen();
    } catch {}
    navigate(`/codespark-exams?examId=${safeExam.id}&round=1&batch=2&retake=true&autoStart=true`);
  };

  const cleanRoll = useMemo(() => {
    if (activeCandidate?.rollNumber) return activeCandidate.rollNumber.toUpperCase();
    if (candidateEmail.trim()) {
      return candidateEmail.trim().split('@')[0].toUpperCase();
    }
    return candidateName.trim().replace(/\s+/g, '_').toUpperCase() || 'CANDIDATE';
  }, [activeCandidate, candidateEmail, candidateName]);

  const handleConfirmLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCandidate) {
      playSound('warning');
      setKeyError('Access denied: Candidate seat not authenticated.');
      setTerminalStep(1);
      return;
    }

    const allCandidates = getAllCodeSparkCandidates();
    const cand = allCandidates.find(
      (c) => c.accessKey.toUpperCase() === activeCandidate.accessKey.toUpperCase()
    );

    if (!cand) {
      playSound('warning');
      setKeyError('Candidate record not found in registered roster.');
      setTerminalStep(1);
      return;
    }

    // Mark as checked in
    cand.status = 'CHECKED_IN';
    cand.lastActiveAt = Date.now();
    saveCodeSparkCandidates(allCandidates);
    setRegisteredCandidates(allCandidates);
    setActiveCandidate(cand);

    const assignedExamId = localStorage.getItem('codedna_codespark_round1_exam_id') || undefined;
    const exams = getAllExams();
    const targetExam = assignedExamId ? exams.find((e) => e.id === assignedExamId) : exams.find((e) => e.isCodeSpark);

    const derivedRoll = cand.rollNumber || cand.email.split('@')[0].toUpperCase();

    const profile = {
      name: cand.name.trim(),
      email: cand.email.trim().toLowerCase(),
      rollNumber: derivedRoll,
      department: cand.department || 'Axent Candidate',
      course: 'Code Spark 2026',
      examType: 'Aptitude',
      assignmentTitle: targetExam ? targetExam.title : 'Code Spark 2026: General Aptitude & Reasoning',
      examMode: 'MCQ',
      mcqExamId: targetExam?.id,
      accessKey: cand.accessKey,
      sessionStartTime: Date.now()
    };

    try {
      localStorage.setItem('codedna_student_profile', JSON.stringify(profile));
      localStorage.setItem('codedna_active_exam_mode', 'MCQ');
      setActiveCodeSparkCandidate(cand);
    } catch {}

    playSound('success');
    setIsAuthenticated(true);
    setTerminalStep(3);
  };

  // Round 1 Attempt from Live Assessment Engine
  const candidateAttempt = useMemo(() => {
    if (!cleanRoll) return null;
    const attempts = getAllAttempts();
    return (
      attempts.find(
        (a) => (a.studentRoll || '').trim().toUpperCase() === cleanRoll
      ) || null
    );
  }, [cleanRoll]);

  const isRound1Completed = Boolean(
    candidateAttempt && (candidateAttempt.status === 'SUBMITTED' || candidateAttempt.score !== undefined)
  );

  const assignedCodeSparkExam = useMemo(() => {
    try {
      const assignedId = typeof window !== 'undefined' ? localStorage.getItem('codedna_codespark_round1_exam_id') : null;
      const exams = getAllExams();
      if (assignedId) {
        const found = exams.find((e) => e.id === assignedId);
        if (found) return found;
      }
      return exams.find((e) => e.isCodeSpark) || null;
    } catch {
      return null;
    }
  }, []);

  const dynamicTotalMarks = useMemo(() => {
    if (candidateAttempt?.maxScore && candidateAttempt.maxScore > 0) {
      return candidateAttempt.maxScore;
    }
    if (assignedCodeSparkExam?.totalMarks && assignedCodeSparkExam.totalMarks > 0) {
      return assignedCodeSparkExam.totalMarks;
    }
    if (activeCandidate?.round1MaxScore && activeCandidate.round1MaxScore > 0) {
      return activeCandidate.round1MaxScore;
    }
    return 0;
  }, [candidateAttempt, assignedCodeSparkExam, activeCandidate]);

  const round1Pct = useMemo(() => {
    if (!candidateAttempt || candidateAttempt.score === undefined) return 0;
    if (dynamicTotalMarks <= 0) return 100;
    return Math.round(((candidateAttempt.score ?? 0) / dynamicTotalMarks) * 100);
  }, [candidateAttempt, dynamicTotalMarks]);

  // Dynamic qualification for Round 2: Exclusively for shortlisted candidates with email keys
  const isRound2Unlocked = useMemo(() => {
    if (proctorBypassRound2) return true;
    if (!cleanRoll) return false;
    if (shortlistedRolls.includes(cleanRoll) || activeCandidate?.isShortlisted || activeCandidate?.status === 'SHORTLISTED') {
      return true;
    }
    return false;
  }, [proctorBypassRound2, cleanRoll, shortlistedRolls, activeCandidate]);

  const scrollToTerminal = () => {
    playSound('click');
    if (lenisRef.current && terminalRef.current) {
      lenisRef.current.scrollTo(terminalRef.current, { offset: 0, duration: 1.4 });
    } else {
      terminalRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToPhases = () => {
    playSound('click');
    if (lenisRef.current) {
      lenisRef.current.scrollTo(window.innerHeight * 1.4, { duration: 1.2 });
    } else {
      window.scrollTo({ top: window.innerHeight * 1.4, behavior: 'smooth' });
    }
  };

  const scrollToForensics = () => {
    playSound('click');
    const el = document.getElementById('forensics-section');
    if (lenisRef.current && el) {
      lenisRef.current.scrollTo(el, { duration: 1.2 });
    } else {
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Launch Stage 01 (General Aptitude MCQ)
  const handleLaunchRound1 = async () => {
    playSound('click');
    try {
      localStorage.setItem('codedna_active_exam_mode', 'MCQ');
      let targetExam = getCodeSparkActiveExam();
      if (!targetExam) {
        targetExam = await asyncGetCodeSparkActiveExam();
      }
      if (!targetExam) {
        setKeyError(
          'The CodeSpark examination is not yet scheduled or paper has not been assigned by the proctor. Please wait for the event administrator to launch the session.'
        );
        return;
      }
      const safeExam: MCQExamConfig = targetExam;
      const cleanEmail = candidateEmail.trim().toLowerCase();
      const profile = {
        name: candidateName.trim(),
        email: cleanEmail,
        rollNumber: cleanRoll,
        department: 'Axent Candidate',
        course: 'Code Spark 2026',
        examType: 'Aptitude',
        assignmentTitle: safeExam.title,
        examMode: 'MCQ',
        mcqExamId: safeExam.id,
        accessKey: accessKey.trim(),
        sessionStartTime: Date.now()
      };
      localStorage.setItem('codedna_student_profile', JSON.stringify(profile));
      localStorage.setItem('codedna_codespark_round1_exam_id', safeExam.id);

      try {
        await requestExamFullscreen();
      } catch {}
      navigate(`/codespark-exams?examId=${safeExam.id}&round=1&autoStart=true`);
    } catch {
      navigate('/codespark-exams');
    }
  };

  // Launch Stage 02 (Algorithmic Code Sprint Arena)
  const handleLaunchRound2 = async () => {
    playSound('click');
    try {
      localStorage.setItem('codedna_active_exam_mode', 'CODING');
      const codingExams = getAllCodingExams();
      const targetCodingExam =
        codingExams.find(
          (e) =>
            e.title.toLowerCase().includes('spark') ||
            e.title.toLowerCase().includes('sprint')
        ) || codingExams[0];

      const profile = {
        name: candidateName.trim(),
        email: candidateEmail.trim().toLowerCase(),
        rollNumber: cleanRoll,
        department: 'Axent Candidate',
        course: 'Code Spark 2026',
        examType: 'Code Sprint',
        assignmentTitle: targetCodingExam
          ? targetCodingExam.title
          : 'Code Spark 2026: Algorithmic Code Sprint Arena',
        examMode: 'CODING',
        accessKey: accessKey.trim(),
        sessionStartTime: Date.now()
      };
      localStorage.setItem('codedna_student_profile', JSON.stringify(profile));
      try {
        await requestExamFullscreen();
      } catch {}
      navigate('/codespark-exams?round=2');
    } catch {
      navigate('/codespark-exams?round=2');
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // WEBGL 2 LIQUID CHROMIUM SHADER & SCROLL DISPLACEMENT LOOP
  // ══════════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const gl = cv.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
    const FS = `#version 300 es
precision highp float;
uniform vec2 u_res;uniform float u_k,u_s,u_t,u_sc;out vec4 o;
const vec3 A1[10]=vec3[10](vec3(-.72,-1.07,.07),vec3(-.41,-.855,.12),vec3(-.016,-.62,.16),vec3(.375,-.387,.185),vec3(.746,-.23,.175),vec3(1.039,-.168,.165),vec3(1.225,-.22,.12),vec3(1.195,-.406,.11),vec3(1.078,-.66,.1),vec3(1.02,-1.07,.09));
const vec3 B1[10]=vec3[10](vec3(-1.61,-1.07,.09),vec3(-.914,-.875,.1),vec3(-.406,-.719,.11),vec3(.023,-.5625,.12),vec3(.453,-.406,.14),vec3(.844,-.348,.15),vec3(1.234,-.328,.14),vec3(1.43,-.172,.12),vec3(1.51,.0625,.1),vec3(1.55,.219,.08));
const vec3 A2[5]=vec3[5](vec3(.61,1.08,.05),vec3(.805,.8,.07),vec3(1.04,.59,.08),vec3(1.27,.48,.08),vec3(1.55,.41,.07));
const vec3 B2[5]=vec3[5](vec3(.805,-.66,.07),vec3(.96,-.484,.07),vec3(1.195,-.543,.07),vec3(1.234,-.758,.07),vec3(1.04,-.914,.07));
const vec3 A3[5]=vec3[5](vec3(-.406,-2.5,.07),vec3(-.289,-2.3,.07),vec3(-.016,-2.26,.07),vec3(.258,-2.37,.07),vec3(.336,-2.5,.07));
const vec3 B3[5]=vec3[5](vec3(-.406,-1.03,.07),vec3(-.289,-.816,.07),vec3(-.016,-.758,.07),vec3(.258,-.875,.07),vec3(.336,-1.07,.07));
float smn(float a,float b,float k){float h=max(k-abs(a-b),0.)/k;return min(a,b)-h*h*k*.25;}
float cap(vec3 p,vec3 a,vec3 b,float ra,float rb){vec3 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h)-mix(ra,rb,h);}
vec3 P(vec3 a,vec3 b,int i,float ph){vec3 m=mix(a,b,u_s);float f=float(i)+ph;
 m.x+=sin(u_t*.7+f*.9)*.03+sin(u_sc*9.+f)*.04;m.y+=cos(u_t*.6+f*1.1)*.035+cos(u_sc*7.+f*.8)*.05;
 m.r*=1.+.12*sin(u_t*.9+f*1.3+u_sc*6.);return m;}
float map(vec3 p){p.z*=1.6;float d=9.;
 vec3 q=P(A1[0],B1[0],0,0.);
 for(int i=1;i<10;i++){vec3 r=P(A1[i],B1[i],i,0.);float z0=.1*sin(float(i)+u_t*.5),z1=.1*sin(float(i-1)+u_t*.5);d=smn(d,cap(p,vec3(q.xy,z1),vec3(r.xy,z0),q.z,r.z),.1);q=r;}
 q=P(A2[0],B2[0],0,3.);
 for(int i=1;i<5;i++){vec3 r=P(A2[i],B2[i],i,3.);d=smn(d,cap(p,vec3(q.xy,0.),vec3(r.xy,.05),q.z,r.z),.1);q=r;}
 q=P(A3[0],B3[0],0,6.);
 for(int i=1;i<5;i++){vec3 r=P(A3[i],B3[i],i,6.);d=smn(d,cap(p,vec3(q.xy,0.),vec3(r.xy,.04),q.z,r.z),.1);q=r;}
 return d;}
vec3 env(vec3 r){float a=r.y*.5+.5,x=r.x+u_sc*1.5;
 vec3 c=mix(vec3(.015),vec3(.62),smoothstep(.15,.95,a));
 c+=smoothstep(.78,.82,sin(x*5.+r.y*3.+u_t*.15))*vec3(1.1);
 c*=1.-.92*smoothstep(.82,.9,sin(x*3.-r.y*6.+1.7));
 c=mix(c,vec3(.92,.04,.07),smoothstep(.92,.97,sin(x*2.+r.y*7.-u_sc*5.+2.))*.85);
 c+=pow(max(r.z,0.),5.)*.7;return c;}
void main(){vec2 w=(gl_FragCoord.xy-.5*u_res)/u_k;vec3 ro=vec3(w,2.5),rd=vec3(0,0,-1);
 float t=0.,dm=9.;bool hit=false;
 for(int i=0;i<70;i++){vec3 p=ro+rd*t;float d=map(p);dm=min(dm,d);if(d<.0015){hit=true;break;}t+=d*.8;if(t>5.)break;}
 float px=1.6/u_k;
 if(!hit){float a=1.-smoothstep(0.,px,dm);o=vec4(vec3(.5)*a,a);return;}
 vec3 p=ro+rd*t;vec2 e=vec2(.004,0);
 vec3 n=normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),(map(p+e.yyx)-map(p-e.yyx))/1.6));
 vec3 r=reflect(rd,n);float f=pow(1.-max(n.z,0.),2.);
 vec3 c=env(r)*(.6+.6*f);c=pow(c,vec3(1.15));c*=mix(.35,1.,smoothstep(0.,.5,n.z));
 o=vec4(clamp(c,0.,1.),1.);}`;

    const VS = `#version 300 es
void main(){vec2 v=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(v*2.-1.,0,1);}`;

    let ok = !!gl;
    const U: Record<string, WebGLUniformLocation | null> = {};

    if (ok && gl) {
      const sh = (t: number, s: string) => {
        const h = gl.createShader(t);
        if (!h) return null;
        gl.shaderSource(h, s);
        gl.compileShader(h);
        if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) {
          console.error('[CodeSpark Shader]', gl.getShaderInfoLog(h));
          ok = false;
        }
        return h;
      };

      const vs = sh(gl.VERTEX_SHADER, VS);
      const fs = sh(gl.FRAGMENT_SHADER, FS);
      if (vs && fs) {
        const pr = gl.createProgram();
        if (pr) {
          gl.attachShader(pr, vs);
          gl.attachShader(pr, fs);
          gl.linkProgram(pr);
          if (gl.getProgramParameter(pr, gl.LINK_STATUS)) {
            gl.useProgram(pr);
            ['u_res', 'u_k', 'u_s', 'u_t', 'u_sc'].forEach((n) => {
              U[n] = gl.getUniformLocation(pr, n);
            });
            gl.clearColor(0, 0, 0, 0);
          } else {
            ok = false;
          }
        }
      }
    }

    if (!ok && cv) {
      cv.style.display = 'none';
      return;
    }

    let rs = 1;
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

    const size = () => {
      rs = Math.min(window.devicePixelRatio || 1, 1.5) * (window.innerWidth > 900 ? 0.7 : 0.8);
      cv.width = Math.floor(window.innerWidth * rs);
      cv.height = Math.floor(window.innerHeight * rs);
      if (ok && gl) gl.viewport(0, 0, cv.width, cv.height);
    };

    window.addEventListener('resize', size);
    size();

    const cl = (v: number) => Math.max(0, Math.min(1, v));
    const sm = (t: number) => {
      t = cl(t);
      return t * t * (3 - 2 * t);
    };

    let cur = 0;
    let tgt = 0;
    const t0 = performance.now();
    let animId: number;

    const onScroll = () => {
      tgt = lenisRef.current ? lenisRef.current.scroll : (window.scrollY || document.documentElement.scrollTop);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    const unsubLenis = lenisRef.current?.on('scroll', (e: { scroll: number }) => {
      tgt = e.scroll;
    });
    onScroll();
    cur = tgt;

    const frame = (now: number) => {
      cur += (tgt - cur) * (reduce ? 1 : 0.09);
      const vh = window.innerHeight;
      const y = cur;
      const e = sm(y / vh);
      const mx = Math.max(1, document.documentElement.scrollHeight - vh);
      const sc = mx > 0 ? y / mx : 0;

      // Update Top Scroll Progress Readout
      setScrollProgress(Math.min(100, Math.round(sc * 100)));

      // Section Track
      const termTop = terminalRef.current?.offsetTop || 3500;
      const foreTop = document.getElementById('forensics-section')?.offsetTop || 2800;
      const p2Top = document.getElementById('p2')?.offsetTop || 1200;

      if (y >= termTop - 300) {
        setActiveSection('terminal');
      } else if (y >= foreTop - 300) {
        setActiveSection('forensics');
      } else if (y >= p2Top - 300) {
        setActiveSection('phases');
      } else {
        setActiveSection('hero');
      }

      // Smoothly fade WebGL canvas when entering terminal section
      if (cv) {
        if (y > vh * 2.3) {
          const fade = Math.max(0, 1 - (y - vh * 2.3) / (vh * 0.4));
          cv.style.opacity = `${fade}`;
        } else {
          cv.style.opacity = '1';
        }
      }

      // Page 1 SVG Elements
      const a1 = document.getElementById('a1');
      const a2 = document.getElementById('a2');
      const st1 = document.getElementById('st1');
      const pn1 = document.getElementById('pn1');

      if (a1) a1.style.transform = `translateY(${-e * 140}px)`;
      if (a2) a2.style.transform = `translateX(${e * 220}px)`;
      if (st1) {
        st1.style.transformOrigin = '1170px 285px';
        st1.style.transform = `rotate(${e * 540}deg) scale(${1 + e * 0.8})`;
      }
      if (pn1) pn1.style.transform = `translateX(${-e * 90}px)`;

      // Page 2 SVG Elements
      const h1 = document.getElementById('h1');
      const h2 = document.getElementById('h2');
      const row = document.getElementById('row');
      const foot = document.getElementById('foot');
      const s2 = document.getElementById('s2');

      const r = sm((y - vh * 0.35) / (vh * 1.0));
      if (h1) h1.style.transform = `translateX(${(1 - r) * -700}px)`;
      if (h2) h2.style.transform = `translateX(${(1 - r) * 700}px)`;

      const r2 = sm((y - vh * 0.9) / (vh * 0.7));
      if (row) {
        row.style.opacity = `${r2}`;
        row.style.transform = `translateY(${(1 - r2) * 40}px)`;
      }

      const r3 = sm((y - vh * 1.1) / (vh * 0.7));
      if (foot) foot.style.opacity = `${r3}`;

      if (s2) {
        s2.style.transformOrigin = '712px 762px';
        s2.style.transform = `rotate(${y * 0.25}deg)`;
      }

      // WebGL Frame Draw
      if (ok && gl) {
        const k = Math.min(window.innerWidth / 1536, window.innerHeight / 1024) * 512 * rs;
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (U.u_res) gl.uniform2f(U.u_res, cv.width, cv.height);
        if (U.u_k) gl.uniform1f(U.u_k, k);
        if (U.u_s) gl.uniform1f(U.u_s, e);
        if (U.u_t) gl.uniform1f(U.u_t, reduce ? 0 : (now - t0) / 1000);
        if (U.u_sc) gl.uniform1f(U.u_sc, sc);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      animId = requestAnimationFrame(frame);
    };

    animId = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener('resize', size);
      window.removeEventListener('scroll', onScroll);
      if (unsubLenis) unsubLenis();
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div
      className="relative min-h-screen w-full bg-[#eeece8] text-[#0A0A0C] font-sans selection:bg-[#ea1a1c] selection:text-white"
      style={{ overflow: 'visible' }}
    >
      {/* ── WebGL 2 Liquid Chrome Mercury Raymarching Canvas (Fixed at z-5) ── */}
      <canvas
        ref={canvasRef}
        id="gl"
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 5,
          pointerEvents: 'none'
        }}
      />

      {/* ── Film Grain Noise Overlay (Fixed at z-6) ── */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 6,
          pointerEvents: 'none',
          mixBlendMode: 'multiply',
          opacity: 0.16,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .6 0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E")`
        }}
      />

      {/* ══════════════════════════════════════════════════════════════════════════
          PAGE 1: CODE SPARK ON AXENT (EXACT CODE RECREATION & SCROLL PINNED)
      ══════════════════════════════════════════════════════════════════════════ */}
      <section
        className="relative"
        id="p1"
        style={{
          position: 'relative',
          height: '200vh',
          zIndex: 1
        }}
      >
        <div
          style={{
            position: 'sticky',
            top: 0,
            height: '100vh',
            width: '100%',
            overflow: 'hidden',
            background: '#eeece8'
          }}
        >
          <svg
            viewBox="0 0 1536 1024"
            preserveAspectRatio="xMidYMid meet"
            aria-label="Code Spark on Axent"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              overflow: 'visible'
            }}
          >
            <defs>
              <linearGradient id="gl1" x1="0" x2="1">
                <stop offset="0" stopColor="#ea1a1c" stopOpacity="0" />
                <stop offset="1" stopColor="#ea1a1c" stopOpacity=".9" />
              </linearGradient>
              <linearGradient id="fr" x1="0" y1="0" x2="0" y2="1">
                <stop offset=".7" stopColor="#ea1a1c" />
                <stop offset="1" stopColor="#f06c6c" />
              </linearGradient>
              <pattern id="bc" width="7" height="34" patternUnits="userSpaceOnUse">
                <rect width="3" height="34" fill="#000" />
              </pattern>
              <filter id="gr" x="0" y="0" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" />
                <feColorMatrix values="0 0 0 0 .55 0 0 0 0 .55 0 0 0 0 .55 3 0 0 0 -.9" />
              </filter>
            </defs>

            <g id="pn1">
              <rect x="-3000" width="3118" height="795" fill="#050505" />
              <rect x="-3000" width="3118" height="205" fill="#6e6e6e" />
              <rect x="-3000" width="3118" height="205" filter="url(#gr)" />
              <rect x="-3000" y="685" width="3118" height="110" fill="#444" />
              <rect x="-3000" y="685" width="3118" height="110" filter="url(#gr)" />
              <rect x="86" y="320" width="32" height="190" fill="url(#gl1)" />
              <g stroke="#fff" fill="none" opacity=".75">
                <path d="M0 330L118 560" strokeWidth="2" />
                <path d="M0 395L90 600" />
                <path d="M0 470C40 520 70 600 118 700" strokeWidth="5" opacity=".6" />
                <path d="M40 205L100 640" strokeWidth=".6" />
              </g>
            </g>

            <path
              stroke="#0006"
              strokeWidth=".8"
              d="M118 205H380M0 688H200M181 827V1024M-3000 827H4500M948 0V570M1372 827V1024M948 650V1024"
            />
            <path
              stroke="#00000014"
              strokeWidth="1"
              d="M300 0V1024M556 0V1024M812 0V1024M1068 0V1024M1324 0V1024"
            />

            <g fontFamily="'Inter Tight','Helvetica Neue',Helvetica,Arial,sans-serif" fontWeight="800">
              <g id="a1">
                <text x="180" y="395" fontSize="410" textLength="895" lengthAdjust="spacingAndGlyphs" fill="#000">
                  Code
                </text>
              </g>
              <g id="a2">
                <text x="180" y="652" fontSize="372" textLength="1045" lengthAdjust="spacingAndGlyphs" fill="#ea1a1c">
                  Spark
                </text>
                <path
                  d="M775 530Q775 582 835 582Q775 582 775 634Q775 582 715 582Q775 582 775 530Z"
                  fill="#eeece8"
                />
                <rect x="1422" y="402" width="40" height="241" fill="url(#fr)" />
              </g>
              <g id="st1">
                <path
                  d="M1170 135Q1170 285 1315 285Q1170 285 1170 425Q1170 285 1080 285Q1170 285 1170 135Z"
                  fill="#ea1a1c"
                />
                <path d="M1170 135V425M1080 285H1315" stroke="#222" strokeWidth=".8" />
              </g>
              {/* 'ON' mark - Outlined Swiss corner typography (aligned after P of Spark) */}
              <text
                x="785"
                y="702"
                fontSize="32"
                fontWeight="300"
                textLength="72"
                fill="none"
                stroke="#000"
                strokeWidth="1.2"
              >
                ON
              </text>

              {/* Official AXENT Logo from /axent-lightmode.png (starts after P of Spark, shifted right & resized) */}
              <image
                href="/axent-lightmode.png"
                x="780"
                y="722"
                width="400"
                height="72"
                preserveAspectRatio="xMinYMid meet"
              />

              <g fontSize="11" fontWeight="400" letterSpacing="3" fill="#000">
                <text x="164" y="72" fontSize="26" fontWeight="300">//</text>
                <rect x="164" y="90" width="30" height="3" fill="#ea1a1c" />
                <rect x="258" y="52" width="334" height="2" fill="#000" />
                <rect x="592" y="50" width="92" height="7" fill="#000" />
                <text x="1416" y="70">CODE</text>
                <text x="1416" y="87">CREATE</text>
                <text x="1416" y="104">COMPETE</text>
                <text x="1416" y="121">LEARN</text>
                <rect x="1416" y="134" width="30" height="3" fill="#ea1a1c" />
                <text x="54" y="863">IDEAS</text>
                <text x="54" y="880">LOGIC</text>
                <text x="54" y="897">INNOVATION</text>
                <text x="54" y="914">TOGETHER</text>
                <rect x="54" y="928" width="30" height="3" fill="#ea1a1c" />
                <text x="1420" y="722">A</text>
                <text x="1420" y="739">PLATFORM</text>
                <text x="1420" y="756">FOR</text>
                <text x="1420" y="773">BRIGHT</text>
                <text x="1420" y="790">MINDS</text>
                <rect x="1420" y="808" width="30" height="3" fill="#ea1a1c" />
                <rect x="1420" y="868" width="70" height="34" fill="url(#bc)" />
              </g>

              <path
                stroke="#000"
                strokeWidth=".9"
                d="M1008 50V90M988 68H1028M1315 480V516M1295 497H1335M1372 767V803M1354 785H1390M239 920V958M219 938H259"
              />
            </g>
          </svg>

          {/* Floating Departure Countdown Matrix on Page 1 (Docked on Right to prevent overlapping 'ON AXENT') */}
          <div
            style={{ position: 'absolute', right: '2rem', bottom: '2rem', zIndex: 12 }}
            className="hidden sm:block bg-black text-white p-4 font-mono border-2 border-black max-w-sm w-full shadow-[6px_6px_0px_#ea1a1c]"
          >
            <div className="flex items-center justify-between text-[11px] border-b border-zinc-800 pb-2 mb-3">
              <span className="text-[#ea1a1c] font-black uppercase tracking-widest flex items-center gap-1.5">
                <Clock size={12} />
                <span>EXAM COUNTDOWN</span>
              </span>
              <span className="text-zinc-400">03 NOV 2026 &bull; 09:00 IST</span>
            </div>

            <div className="grid grid-cols-4 divide-x divide-zinc-800 text-center">
              <div className="px-1">
                <div className="text-2xl font-black text-white">{timeLeft.days}</div>
                <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-0.5">DAYS</div>
              </div>
              <div className="px-1">
                <div className="text-2xl font-black text-white">{timeLeft.hours}</div>
                <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-0.5">HOURS</div>
              </div>
              <div className="px-1">
                <div className="text-2xl font-black text-white">{timeLeft.minutes}</div>
                <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-0.5">MINS</div>
              </div>
              <div className="px-1">
                <div className="text-2xl font-black text-[#ea1a1c]">{timeLeft.seconds}</div>
                <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-0.5">SECS</div>
              </div>
            </div>

            <button
              type="button"
              onClick={scrollToTerminal}
              className="mt-3 w-full py-2 bg-[#ea1a1c] hover:bg-[#c81e1b] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>ENTER CANDIDATE TERMINAL</span>
              <ArrowDown size={13} />
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
          PAGE 2: TWO PHASES. ONE MIND. (EXACT CODE RECREATION & SCROLL PINNED)
      ══════════════════════════════════════════════════════════════════════════ */}
      <section
        className="relative"
        id="p2"
        style={{
          position: 'relative',
          height: '230vh',
          marginTop: '-100vh',
          zIndex: 2
        }}
      >
        <div
          style={{
            position: 'sticky',
            top: 0,
            height: '100vh',
            width: '100%',
            overflow: 'hidden',
            background: '#eeece8'
          }}
        >
          <svg
            viewBox="0 0 1536 1024"
            preserveAspectRatio="xMidYMid meet"
            aria-label="Two phases. One mind."
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              overflow: 'visible'
            }}
          >
            <defs>
              <linearGradient id="gy" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2a2a2a" />
                <stop offset=".5" stopColor="#8a8a86" />
                <stop offset="1" stopColor="#4a4a48" />
              </linearGradient>
              <filter id="g2" x="0" y="0" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="9" />
                <feColorMatrix values="0 0 0 0 .6 0 0 0 0 .6 0 0 0 0 .6 3 0 0 0 -1" />
              </filter>
              <pattern id="bc2" width="5" height="24" patternUnits="userSpaceOnUse">
                <rect width="2" height="24" fill="#000" />
              </pattern>
            </defs>

            <rect x="-3000" y="-1000" width="7000" height="3000" fill="#eeece8" />

            <g id="pn2">
              <rect x="-3000" y="212" width="3067" height="285" fill="url(#gy)" />
              <rect x="-3000" y="212" width="3067" height="285" filter="url(#g2)" />
              <rect x="-3000" y="855" width="3067" height="200" fill="#222" />
              <rect x="-3000" y="855" width="3067" height="200" filter="url(#g2)" opacity=".8" />
              <rect x="-3000" y="797" width="3012" height="4" fill="#000" />
            </g>

            <rect x="-3000" y="513" width="3067" height="14" fill="#ea1a1c" />
            <path
              stroke="#0005"
              strokeWidth=".8"
              fill="none"
              d="M40 44H93M67 463H1410M765 463V690M-3000 655H1410M1410 -1000V2000M1410 820H3000M67 0V212"
            />

            <g fontFamily="'Archivo Black','Arial Black',Impact,sans-serif">
              <g id="h1">
                <text x="93" y="258" fontSize="243" textLength="1297" lengthAdjust="spacingAndGlyphs" fill="#000">
                  TWO PHASES.
                </text>
              </g>
              <g id="h2">
                <text x="93" y="450" fontSize="255" textLength="1219" lengthAdjust="spacingAndGlyphs" fill="#e90d12">
                  ONE MIND.
                </text>
              </g>
            </g>

            <rect x="93" y="40" width="89" height="5" fill="#000" />
            <rect x="182" y="40" width="61" height="3" fill="#ea1a1c" />

            <g id="row" fontFamily="Anton,Impact,'Arial Narrow',sans-serif">
              <text x="98" y="606" fontSize="150" textLength="119" lengthAdjust="spacingAndGlyphs" fill="#000">
                01
              </text>
              <path d="M275 498L231 607" stroke="#000" strokeWidth="1.2" />
              <text x="292" y="560" fontSize="66" textLength="261" lengthAdjust="spacingAndGlyphs" fill="#000">
                APTITUDE
              </text>
              <text
                x="292"
                y="590"
                fontSize="17"
                fontFamily="'Space Mono',monospace"
                textLength="323"
                letterSpacing="3.4"
                fill="#000"
              >
                THINK FAST. THINK CLEAR.
              </text>
              <rect x="292" y="623" width="49" height="8" fill="#ea1a1c" />

              <path d="M665 549H745M707 519L746 549L707 583" fill="none" stroke="#ea1a1c" strokeWidth="8" />

              <text x="793" y="606" fontSize="150" textLength="149" lengthAdjust="spacingAndGlyphs" fill="#000">
                02
              </text>
              <path d="M1010 498L967 607" stroke="#000" strokeWidth="1.2" />
              <text x="1033" y="560" fontSize="66" textLength="358" lengthAdjust="spacingAndGlyphs" fill="#000">
                CODE SPRINT
              </text>
              <text
                x="1034"
                y="592"
                fontSize="17"
                fontFamily="'Space Mono',monospace"
                textLength="351"
                letterSpacing="3.4"
                fill="#000"
              >
                TURN LOGIC INTO EXECUTION.
              </text>
              <rect x="1034" y="624" width="48" height="8" fill="#ea1a1c" />
            </g>

            <g id="foot" fontFamily="'Space Mono',monospace" fill="#000">
              <text x="99" y="744" fontSize="17" textLength="367" letterSpacing="4">
                QUALIFY → BUILD → COMPETE
              </text>
              <rect x="99" y="810" width="49" height="24" fill="url(#bc2)" />
              <path d="M184 817H655" stroke="#000" strokeWidth=".8" />
              <text x="99" y="863" fontSize="12" textLength="296" letterSpacing="3">
                AXENT / THE CODING CHALLENGE
              </text>
              <rect x="100" y="881" width="41" height="4" fill="#ea1a1c" />

              <g fontSize="10" letterSpacing="2.6">
                <text x="1435" y="56">IDEAS</text>
                <text x="1435" y="70">LOGIC</text>
                <text x="1435" y="84">SKILLS</text>
                <text x="1435" y="98">RESULTS</text>
              </g>

              <rect x="1435" y="111" width="30" height="3" fill="#ea1a1c" />
              <rect x="1456" y="370" width="39" height="3" fill="#ea1a1c" />
              <path
                d="M1468 350L1480 322M1478 350L1490 322M1488 350L1500 322"
                stroke="#000"
                strokeWidth="1.4"
              />

              <g id="s2">
                <path
                  d="M712 710Q712 762 765 762Q712 762 712 815Q712 762 660 762Q712 762 712 710Z"
                  fill="#ea1a1c"
                />
              </g>

              <path
                stroke="#000"
                strokeWidth=".9"
                d="M27 140V176M9 158H45M110 672V708M92 690H128M1458 165V201M1440 183H1476M1449 860V896M1431 878H1467"
              />
            </g>
          </svg>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
          PAGE 3: FORENSIC ARCHITECTURE & KIOSK INTEGRITY MATRIX (Layered at z-10)
      ══════════════════════════════════════════════════════════════════════════ */}
      <section
        id="forensics-section"
        style={{ position: 'relative', zIndex: 10, background: '#ffffff' }}
        className="w-full border-t-2 border-b-2 border-black py-20 font-mono"
      >
        <div className="max-w-[1536px] mx-auto px-4 sm:px-8">
          <div className="flex flex-col gap-2 mb-10">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-zinc-500 font-bold">
              <span>// SPECIFICATION 03</span>
              <span>&bull;</span>
              <span>AUTONOMOUS FORENSIC TELEMETRY</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-black uppercase text-black tracking-tight font-sans">
              HIGH-ASSURANCE EXAMINATION SECURITY
            </h2>
            <p className="text-xs sm:text-sm text-zinc-600 max-w-2xl leading-relaxed">
              Engineered to replace traditional test platforms with autonomous zero-trust invigilation, client write-ahead caching, and deterministic evaluation.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-black/15 border-2 border-black bg-[#eeece8]">
            <div className="p-6 flex flex-col justify-between gap-4">
              <div>
                <span className="text-3xl font-black text-[#ea1a1c] block mb-2 font-sans">01</span>
                <h4 className="text-sm font-black uppercase text-black mb-2">3-STRIKE AUTONOMOUS FREEZE</h4>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Tab switches, devtools inspection, and multi-window departures are stamped into a tamper-evident audit ledger. 3 infractions trigger instant workstation freeze.
                </p>
              </div>
              <div className="h-1 w-8 bg-black" />
            </div>

            <div className="p-6 flex flex-col justify-between gap-4">
              <div>
                <span className="text-3xl font-black text-[#ea1a1c] block mb-2 font-sans">02</span>
                <h4 className="text-sm font-black uppercase text-black mb-2">DUAL CAMERA INVIGILATION</h4>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Webcam face-mesh gaze tracking combined with secondary overhead desk angle feeds into the Chief Proctor CCTV room in real-time.
                </p>
              </div>
              <div className="h-1 w-8 bg-black" />
            </div>

            <div className="p-6 flex flex-col justify-between gap-4">
              <div>
                <span className="text-3xl font-black text-[#ea1a1c] block mb-2 font-sans">03</span>
                <h4 className="text-sm font-black uppercase text-black mb-2">CRYPTOGRAPHIC WRITE LEDGER</h4>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Candidate keystrokes and code snapshots are buffered locally in write-ahead cache, eliminating any risk of lost exam progress during network latency.
                </p>
              </div>
              <div className="h-1 w-8 bg-black" />
            </div>

            <div className="p-6 flex flex-col justify-between gap-4">
              <div>
                <span className="text-3xl font-black text-[#ea1a1c] block mb-2 font-sans">04</span>
                <h4 className="text-sm font-black uppercase text-black mb-2">CHIEF PROCTOR PARDON ONLY</h4>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Locked candidate kiosks cannot be refreshed or bypassed. Unlocking requires dynamic supervisory key clearance from the Admin console.
                </p>
              </div>
              <div className="h-1 w-8 bg-[#ea1a1c]" />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
          PAGE 4: THE MONOLITHIC SWISS CANDIDATE TERMINAL (Layered at z-10)
      ══════════════════════════════════════════════════════════════════════════ */}
      <section
        ref={terminalRef}
        id="candidate-terminal"
        style={{ position: 'relative', zIndex: 10, background: '#eeece8' }}
        className="w-full py-24 font-mono border-b-2 border-black"
      >
        <div className="max-w-[1536px] mx-auto px-4 sm:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* Column A: Editorial Protocol Dossier & Instructions (5 Cols) */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-zinc-600 font-bold">
                <span>// GATEWAY ACCESS</span>
                <span>&bull;</span>
                <span className="text-[#ea1a1c]">SECTION 04</span>
              </div>

              <h2 className="text-4xl sm:text-6xl font-black uppercase text-black tracking-tight leading-none font-sans">
                CANDIDATE
                <br />
                AUTHENTICATION
                <br />
                <span className="text-[#ea1a1c]">TERMINAL</span>
              </h2>

              <p className="text-xs sm:text-sm text-zinc-700 leading-relaxed">
                CodeSpark is a private, provisioned examination. Enter your exam-issued <strong>AXENT-XXXX</strong> alphanumeric access key to authenticate your candidate seat and unlock Stage 01.
              </p>

              {/* Roster & System Stats Box */}
              <div className="p-5 bg-white border-2 border-black flex flex-col gap-3 shadow-[6px_6px_0px_#0A0A0C]">
                <div className="flex items-center justify-between text-xs border-b border-black/10 pb-2">
                  <span className="text-zinc-500 uppercase">PROVISIONED SEATS</span>
                  <strong className="text-black font-black">{registeredCandidates.length} CANDIDATES</strong>
                </div>
                <div className="flex items-center justify-between text-xs border-b border-black/10 pb-2">
                  <span className="text-zinc-500 uppercase">STAGE 01 STATUS</span>
                  <strong className="text-[#ea1a1c] font-black">ACTIVE NOW (MCQ)</strong>
                </div>
                <div className="flex items-center justify-between text-xs border-b border-black/10 pb-2">
                  <span className="text-zinc-500 uppercase">STAGE 02 STATUS</span>
                  {isRound2Unlocked ? (
                    <strong className="text-[#ea1a1c] font-black flex items-center gap-1">
                      <Check size={12} />
                      <span>UNLOCKED // SHORTLISTED</span>
                    </strong>
                  ) : isRound1Completed ? (
                    <strong className="text-zinc-700 font-bold">
                      ROUND 1 COMPLETE ({round1Pct}%)
                    </strong>
                  ) : (
                    <strong className="text-zinc-500">GATE-LOCKED</strong>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500 uppercase">INVIGILATION ENGINE</span>
                  <strong className="text-black">AUTONOMOUS CCTV ACTIVE</strong>
                </div>
              </div>
            </div>

            {/* Column B: High-Contrast Monolithic Stepped Terminal Box (7 Cols) */}
            <div className="lg:col-span-7 bg-white border-4 border-black p-6 sm:p-10 flex flex-col gap-6 shadow-[12px_12px_0px_#0A0A0C]">
              {/* Terminal Topline Bar */}
              <div className="flex items-center justify-between border-b-2 border-black pb-4 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-[#ea1a1c] inline-block" />
                  <span className="font-black text-black uppercase tracking-wider text-sm font-sans">
                    NODE // TERMINAL-01 &bull; CODESPARK
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  <span>AXENT-SEC-V2</span>
                </div>
              </div>

              {/* Direct Single-Step Terminal: Enter 4 digits and launch directly */}
              <div className="flex flex-col gap-5 border-2 border-black p-6 bg-[#eeece8]/40">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-1.5 font-mono">
                    <Key size={13} className="text-[#ea1a1c]" />
                    <span>ENTER 4-DIGIT ACCESS KEY</span>
                  </label>
                  {activeCandidate && (
                    <span className="text-[10px] text-[#ea1a1c] font-black uppercase tracking-widest flex items-center gap-1 font-mono">
                      <Check size={12} />
                      <span>SEAT VERIFIED</span>
                    </span>
                  )}
                </div>

                {/* Seamless Single Input Box with Static AXENT- Prefix */}
                <div
                  onClick={() => keyInputRef.current?.focus()}
                  className={`w-full bg-white border-2 ${
                    keyError ? 'border-[#ea1a1c]' : 'border-black focus-within:border-[#ea1a1c]'
                  } px-3 sm:px-5 py-3 sm:py-4 flex items-center transition-colors cursor-text overflow-hidden`}
                >
                  <span className="font-mono text-xl sm:text-2xl font-black text-black select-none tracking-[0.1em] sm:tracking-[0.25em] shrink-0">
                    AXENT-
                  </span>
                  <input
                    ref={keyInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={keyDigits}
                    onChange={(e) => handleDigitsInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleDirectExamLaunch();
                      }
                    }}
                    placeholder="XXXX"
                    autoFocus
                    className="flex-1 min-w-0 bg-transparent border-none outline-none font-mono text-xl sm:text-2xl font-black tracking-[0.1em] sm:tracking-[0.25em] text-black placeholder-zinc-300 p-0 m-0"
                  />
                  {activeCandidate && (
                    <div className="ml-1 sm:ml-2 flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 bg-[#ea1a1c] text-white text-[10px] sm:text-xs font-black uppercase font-mono shrink-0">
                      <Check size={12} className="sm:w-3.5 sm:h-3.5" />
                      <span className="hidden sm:inline">KEY RESOLVED</span>
                      <span className="sm:hidden">OK</span>
                    </div>
                  )}
                </div>

                {/* Verified Candidate Card (Automatically Populated from Registry) */}
                {activeCandidate && (
                  <div className="p-4 bg-white border-2 border-black flex items-center justify-between gap-3 text-xs font-mono shadow-[3px_3px_0px_#0A0A0C]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-black text-white flex items-center justify-center font-black">
                        <Check size={16} className="text-[#ea1a1c]" />
                      </div>
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Candidate Identified</div>
                        <strong className="text-sm font-black text-black">{activeCandidate.name}</strong>
                        <span className="text-zinc-500 ml-2 font-mono text-xs">({activeCandidate.email})</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-black uppercase px-2 py-1 bg-green-100 text-green-800 border border-green-300">
                      Ready
                    </span>
                  </div>
                )}

                {keyError && (
                  <div className="text-xs text-[#ea1a1c] font-bold flex items-center gap-2 font-mono p-3 bg-red-50 border border-[#ea1a1c]/30">
                    <AlertCircle size={15} className="shrink-0 text-[#ea1a1c]" />
                    <span>{keyError}</span>
                  </div>
                )}

                {/* One-Click Direct Exam Launch Button */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleDirectExamLaunch}
                    disabled={!keyDigits.trim()}
                    className={`w-full py-4 px-6 font-mono font-black text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
                      keyDigits.trim()
                        ? 'bg-black hover:bg-[#ea1a1c] text-white shadow-[4px_4px_0px_#ea1a1c] cursor-pointer'
                        : 'bg-zinc-200 text-zinc-400 cursor-not-allowed border border-zinc-300'
                    }`}
                  >
                    <span>START EXAMINATION NOW</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>

              {/* Candidate Attempt Status & Round 2 Access Card */}
              {candidateAttempt && (
                <div className="mt-2">
                  {!isRound1Concluded ? (
                    <div className="p-4 bg-zinc-100 border-2 border-black flex flex-col gap-2.5 text-xs font-mono shadow-[3px_3px_0px_#000]">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">
                          Round 1 Examination Record
                        </div>
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black uppercase">
                          Tech Fest Arena Active
                        </span>
                      </div>
                      <div className="text-sm font-black text-black">
                        Score Logged: {candidateAttempt.score ?? 0}{dynamicTotalMarks > 0 ? ` / ${dynamicTotalMarks} Marks` : ' Marks'} ({round1Pct}%)
                      </div>
                      <p className="text-[11.5px] text-zinc-600 leading-relaxed border-t border-zinc-300 pt-2 mt-1">
                        Examinations are ongoing across campus laboratories (Lab A, Lab B &amp; overflow sessions). The Chief Proctor will conclude Round 1 and calculate the combined institutional shortlist once all laboratory sittings finish. Shortlisted candidates will receive their Round 2 key via email.
                      </p>
                    </div>
                  ) : isRound2Unlocked ? (
                    <div className="p-4 bg-zinc-950 text-white border-2 border-[#ea1a1c] flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-mono shadow-[4px_4px_0px_#ea1a1c]">
                      <div>
                        <div className="text-[10px] text-emerald-400 uppercase font-black tracking-wider">
                          ★ Shortlist Cleared
                        </div>
                        <div className="text-sm font-black text-white mt-0.5">
                          Cleared for Round 2: Algorithmic Code Sprint Arena
                        </div>
                        <div className="text-[11.5px] text-zinc-300 mt-1">
                          Round 2 Key: <span className="text-[#ea1a1c] font-black px-1.5 py-0.5 bg-black border border-[#ea1a1c]">{activeCandidate?.round2Key || 'AXENT-R2-KEY'}</span> (also delivered via Gmail)
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleLaunchRound2}
                        className="px-5 py-3 bg-[#ea1a1c] hover:bg-white hover:text-black text-white font-mono font-black text-xs uppercase cursor-pointer shrink-0 transition-colors shadow-[2px_2px_0px_#000] flex items-center justify-center gap-2"
                      >
                        <span>Enter Round 2 Coding Sprint</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 bg-zinc-100 border-2 border-zinc-300 text-xs font-mono">
                      <div className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">
                        Round 1 Examination Concluded
                      </div>
                      <div className="text-xs text-zinc-700 mt-1">
                        Score Logged: {candidateAttempt.score ?? 0}{dynamicTotalMarks > 0 ? ` / ${dynamicTotalMarks} Marks` : ' Marks'}. Institutional cutoff was not met. Thank you for participating in CodeSpark 2026.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Swiss Editorial Master Footer ── */}
      <footer
        style={{ position: 'relative', zIndex: 10 }}
        className="w-full bg-[#050505] text-white border-t-2 border-black px-4 sm:px-8 py-12 font-mono text-xs"
      >
        <div className="max-w-[1536px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="text-white font-black uppercase tracking-wider text-base mb-1 flex items-center gap-2 font-sans">
              <span>AXENT // CODESPARK</span>
              <span className="text-[#ea1a1c]">&bull;</span>
              <span className="text-xs font-mono font-normal text-zinc-400">AUTONOMOUS EXAMINATION PLATFORM</span>
            </div>
            <div className="text-zinc-500 text-[11px]">
              &copy; 2026 AXENT ACADEMIC PLATFORM &bull; ALL RIGHTS RESERVED &bull; ISO-27001 AUDIT COMPLIANT
            </div>
          </div>

          <div className="flex items-center gap-6 uppercase text-xs">
            <button
              type="button"
              onClick={() => navigate('/mcq')}
              className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              Universal Exam Hall
            </button>
            <span className="text-zinc-700">/</span>
            <button
              type="button"
              onClick={() => navigate('/paper-setter')}
              className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              Paper Setter Portal
            </button>
            <span className="text-zinc-700">/</span>
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              Chief Proctor CCTV
            </button>
          </div>
        </div>
      </footer>

      {/* Mobile Floating Action Button: Quick Jump to Terminal */}
      <div className="sm:hidden fixed bottom-4 right-4 z-50">
        <button
          type="button"
          onClick={scrollToTerminal}
          className="px-4 py-2.5 bg-[#ea1a1c] text-white font-mono font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-[3px_3px_0px_#000] border-2 border-black cursor-pointer active:scale-95 transition-transform"
        >
          <Key size={13} />
          <span>Enter Key</span>
        </button>
      </div>
      </div>
  );
};

export default CodeSparkPortal;
