import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import { useNavigate } from 'react-router-dom';

import { CodeEditor } from './CodeEditor';

import { BehaviorPanel } from './BehaviorPanel';

import { AutoViva } from './AutoViva';

import { getAllExams } from '../services/mcqService';

import {

  CodeSubmission,

  ExecutionHistoryItem,

  AnalysisReport,

  VivaEvaluation,

  StudentInfo,

  CompilerExecutionResult,

  ThemeMode,

  ExamCategory

} from '../types/dna';

import {

  Play,

  Terminal,

  Activity,

  MessageSquare,

  FileText,

  Trash2,

  RefreshCw,

  ChevronDown,

  ChevronUp,

  CheckCircle2,

  AlertTriangle,

  Award,

  Code2,

  Monitor,

  Video,

  VideoOff,

  ShieldAlert,

  X,

  Lock,

  EyeOff,

  Maximize2,

  Minimize2,

  User,

  Radio,

  Check,

  UserCheck,

  UserPlus,

  FileEdit,

  ShieldCheck,

  Clock,

  Unlock,

  KeyRound,

  ArrowRight,

  Copy,

  CheckCheck,

  Plus

} from 'lucide-react';

import { playSound } from '../utils/sounds';

import { ConfirmationModal } from './ConfirmationModal';

import { getSynchronizedNow, requestExamFullscreen } from '../services/timeSyncService';

import {

  parseExamToken,

  generateExamToken,

  DecodedTokenResult

} from '../utils/tokenParser';

import {

  syncCurrentLiveStation,

  submitAndMarkDone,

  subscribeToCctvBroadcast,

  isStationLocked,

  isLabLocked,

  isCampusLocked,

  getActiveLabId,

  sendProctorLockCommand,

  buildWorkstationId,

  STATION_LOCK_PREFIX,

  getAllCollegeLabs,

  getLabInfoOrDefault

} from '../services/adminService';

import { validateAndConsumeEmergencyKey, validateAndConsumeEmergencyKeyAsync } from '../services/emergencyKeyService';

import { DEFAULT_LANGUAGE_TEMPLATES } from './CodeEditor';

import { RunActionButton } from './watermelon/RunActionButton';

import { fetchSingleStationLockStatus, supabase } from '../services/supabaseService';

import { ExtendedToolbar } from './watermelon/ExtendedToolbar';

import { SubmitActionButton } from './watermelon/SubmitActionButton';

import { ContinuousTabs, MetricTag, SimpleSelect } from './watermelon-ui';

import { startAntiCheatingShield } from '../services/antiCheatingGuard';
import {
  getDefaultTestCasesForProblem,
  runTestCases,
  TestCaseItem,
  TestCaseExecutionSummary
} from '../services/compilerService';



interface WorkspaceProps {

  initialCode?: string;

  onRunCode: (

    data: CodeSubmission,

    stdin: string

  ) => Promise<{ report?: AnalysisReport; execResult?: CompilerExecutionResult } | void>;

  onCodeChange?: (data: CodeSubmission) => void;

  executionHistory: ExecutionHistoryItem[];

  isExecuting: boolean;

  compilerResult: CompilerExecutionResult | null;

  analysisResults: AnalysisReport | null;

  onViewReport: () => void;

  onClearTerminal: () => void;

  vivaEvaluation: VivaEvaluation | null;

  onVivaComplete: (evaluation: VivaEvaluation) => void;

  theme?: ThemeMode;

}



export const Workspace: React.FC<WorkspaceProps> = ({

  initialCode = '',

  onRunCode,

  onCodeChange,

  executionHistory,

  isExecuting,

  compilerResult,

  analysisResults,

  onViewReport,

  onClearTerminal,

  vivaEvaluation,

  onVivaComplete,

  theme = 'dark'

}) => {

  const navigate = useNavigate();

  const publishedMcqExams = useMemo(() => {

    return getAllExams().filter((e) => e.status === 'PUBLISHED');

  }, []);

  const [selectedMcqExamId, setSelectedMcqExamId] = useState<string>(() => {

    const published = getAllExams().filter((e) => e.status === 'PUBLISHED');

    return published[0]?.id || '';

  });

  const [activeTab, setActiveTab] = useState<'terminal' | 'testcases' | 'telemetry' | 'viva'>('terminal');

  const [stdinInput, setStdinInput] = useState<string>('');

  const [showStdin, setShowStdin] = useState<boolean>(false);

  const [isPasteBlocked, setIsPasteBlocked] = useState<boolean>(false);

  const [isExamSubmitted, setIsExamSubmitted] = useState<boolean>(false);

  const [isLockedByProctor, setIsLockedByProctor] = useState<boolean>(() => {

    let labId = getActiveLabId() || 'LAB-01';

    let stationNumber = 'Station #01';

    if (typeof window !== 'undefined') {

      const params = new URLSearchParams(window.location.search);

      const qLab = params.get('lab');

      const qStation = params.get('station');

      if (qLab) labId = qLab.toUpperCase();

      if (qStation) stationNumber = `Station #${qStation}`;

      try {

        const cleanStation = stationNumber.replace(/[^a-zA-Z0-9]/g, '_');

        const saved = localStorage.getItem(`codedna_student_profile_${cleanStation}`) || localStorage.getItem('codedna_student_profile');

        if (saved) {

          const parsed = JSON.parse(saved);

          if (parsed.stationNumber && !qStation) stationNumber = parsed.stationNumber;

          if (parsed.labId && !qLab) labId = parsed.labId;

        }

      } catch {

        // ignore

      }

    }

    const myStationId = buildWorkstationId(labId, stationNumber);

    const explicit = typeof window !== 'undefined' ? localStorage.getItem(`${STATION_LOCK_PREFIX}${myStationId}`) : null;

    if (explicit === 'false') return false;

    if (explicit === 'true') return true;

    return isStationLocked(myStationId, labId);

  });

  const [proctorNotice, setProctorNotice] = useState<string | null>(null);

  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);

  const [tabSwitchCount, setTabSwitchCount] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const activeLab = getActiveLabId() || 'LAB-01';
        const stNum = localStorage.getItem('codedna_station_number') || 'Station #01';
        const cleanSt = stNum.replace(/[^0-9]/g, '').padStart(2, '0') || '01';
        const stId = `${activeLab}-WS-${cleanSt}`;
        const saved = localStorage.getItem(`codedna_strikes_${stId}`);
        if (saved) return Math.min(3, Math.max(0, parseInt(saved, 10)));
      } catch {}
    }
    return 0;
  });

  const [unfocusedSeconds, setUnfocusedSeconds] = useState<number>(0);

  const [infractionNotice, setInfractionNotice] = useState<{ strike: number; message: string; duration: number } | null>(null);

  const [showEmergencyUnlockPrompt, setShowEmergencyUnlockPrompt] = useState<boolean>(false);

  const [emergencyUnlockCode, setEmergencyUnlockCode] = useState<string>('');

  const [emergencyUnlockError, setEmergencyUnlockError] = useState<string | null>(null);



  const handleEmergencyUnlockSubmit = async () => {

    const code = emergencyUnlockCode.trim().toUpperCase();

    if (!code) {

      setEmergencyUnlockError('Please enter the invigilator emergency key.');

      playSound('warning');

      return;

    }

    const activeLab = student.labId || getActiveLabId() || 'LAB-01';

    const myStationId = buildWorkstationId(activeLab, student.stationNumber);



    const result = await validateAndConsumeEmergencyKeyAsync(code, myStationId, {

      name: student.name,

      roll: student.rollNumber,

      labId: activeLab,

      examTitle: student.examType || 'Coding Examination'

    });



    if (result.valid) {

      setEmergencyUnlockError(null);

      setShowEmergencyUnlockPrompt(false);

      setEmergencyUnlockCode('');

      handleUnlockStation();

      return;

    }



    setEmergencyUnlockError(result.message || 'Invalid Invigilator Security Key. Workstation remains locked.');

    playSound('warning');

  };

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const [showResetCandidateConfirm, setShowResetCandidateConfirm] = useState<boolean>(false);

  const [showFinalSubmitConfirm, setShowFinalSubmitConfirm] = useState<boolean>(false);

  const [workspaceNoticeMessage, setWorkspaceNoticeMessage] = useState<string | null>(null);

  // Right Diagnostics/Terminal pane is STRICTLY HIDDEN until code is executed or user toggles it open

  const [isRightPaneOpen, setIsRightPaneOpen] = useState<boolean>(() => {

    return Boolean(compilerResult || isExecuting);

  });



  // Automatically reveal the right pane when execution starts or new compiler results arrive

  useEffect(() => {

    if (isExecuting || compilerResult) {

      setIsRightPaneOpen(true);

    }

  }, [isExecuting, compilerResult]);

  const blurStartTimestampRef = useRef<number | null>(null);

  const isAwayRef = useRef<boolean>(false);



  const screenVideoRef = useRef<HTMLVideoElement | null>(null);

  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const screenTrackRef = useRef<MediaStreamTrack | null>(null);

  const screenIntervalRef = useRef<any>(null);

  const lastScreenFrameRef = useRef<string | undefined>(undefined);



  // Load registered candidate credentials from localStorage or URL query params

  const [student, setStudent] = useState<StudentInfo>(() => {

    let labId = getActiveLabId() || 'LAB-01';

    let stationNumber = 'Station #01';

    let name = '';

    let rollNumber = '';

    let course = '';

    let department = '';

    let semester = '';

    let examType: ExamCategory = 'Internal Assessment (CIE)';

    let assignmentTitle = '';

    let examDurationMinutes = 90;

    let sessionStartTime = Date.now();



    if (typeof window !== 'undefined') {

      const params = new URLSearchParams(window.location.search);

      const isNewCandidateParam = params.get('newCandidate') === 'true';

      const qLab = params.get('lab');

      const qStation = params.get('station');

      const qName = params.get('name');

      const qRoll = params.get('roll');

      if (qLab) labId = qLab.toUpperCase();

      if (qStation) {

        const num = qStation.replace(/[^0-9]/g, '');

        stationNumber = `Station #${num.padStart(2, '0')}`;

      }

      if (qName) name = qName;

      if (qRoll) rollNumber = qRoll;



      const qToken = params.get('token');

      if (qToken) {

        const decoded = parseExamToken(qToken);

        if (decoded.success && decoded.data) {

          if (decoded.data.name) name = decoded.data.name;

          if (decoded.data.rollNumber) rollNumber = decoded.data.rollNumber;

          if (decoded.data.course) course = decoded.data.course;

          if (decoded.data.department) department = decoded.data.department;

          if (decoded.data.semester) semester = decoded.data.semester;

          if (decoded.data.examType) examType = decoded.data.examType;

          if (decoded.data.assignmentTitle) assignmentTitle = decoded.data.assignmentTitle;

          if (decoded.data.labId) labId = decoded.data.labId;

          if (decoded.data.stationNumber) stationNumber = decoded.data.stationNumber;

          if (decoded.data.examDurationMinutes !== undefined) examDurationMinutes = decoded.data.examDurationMinutes;

        }

      }



      if (isNewCandidateParam && !qToken) {

        name = '';

        rollNumber = '';

        course = '';

        department = '';

        semester = '';

        assignmentTitle = '';

      } else {

        try {

          const cleanStation = stationNumber.replace(/[^a-zA-Z0-9]/g, '_');

          const stationSaved = localStorage.getItem(`codedna_student_profile_${cleanStation}`);

          const globalSaved = !qStation ? localStorage.getItem('codedna_student_profile') : null;

          const saved = stationSaved || globalSaved;

          if (saved) {

            const parsed = JSON.parse(saved);

            if (parsed.name) name = parsed.name;

            if (parsed.rollNumber) rollNumber = parsed.rollNumber;

            if (parsed.course) course = parsed.course;

            if (parsed.department) department = parsed.department;

            if (parsed.semester) semester = parsed.semester;

            if (parsed.examType) examType = parsed.examType;

            if (parsed.assignmentTitle) assignmentTitle = parsed.assignmentTitle;

            if (parsed.examDurationMinutes !== undefined) examDurationMinutes = parsed.examDurationMinutes;

            if (parsed.sessionStartTime) sessionStartTime = parsed.sessionStartTime;

            if (parsed.labId && !qLab) labId = parsed.labId;

            if (parsed.stationNumber && !qStation) stationNumber = parsed.stationNumber;

          }

        } catch {

          // Ignore

        }

      }

    }



    const labInfo = getLabInfoOrDefault(labId);



    return {

      name,

      rollNumber,

      course,

      department,

      semester,

      examType,

      assignmentTitle,

      labId,

      labName: labInfo.labName,

      stationNumber,

      examDurationMinutes,

      sessionStartTime

    };

  });



  // Candidate Registration & Terminal Lock State

  const [isCandidateRegistered, setIsCandidateRegistered] = useState<boolean>(() => {

    if (typeof window !== 'undefined') {

      const params = new URLSearchParams(window.location.search);

      if (params.get('newCandidate') === 'true') return false;

    }

    return Boolean(student.name?.trim() && student.rollNumber?.trim());

  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ TEST CASES STATE FOR CODING EXAMINATIONS Ã¢â€â‚¬Ã¢â€â‚¬
  const [testCases, setTestCases] = useState<TestCaseItem[]>(() => {
    try {
      const saved = localStorage.getItem('codedna_last_testcases');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return getDefaultTestCasesForProblem(student.assignmentTitle || '');
  });
  const [selectedTestCaseIdx, setSelectedTestCaseIdx] = useState<number>(0);
  const [isRunningTests, setIsRunningTests] = useState<boolean>(false);
  const [testCasesSummary, setTestCasesSummary] = useState<TestCaseExecutionSummary | null>(() => {
    try {
      const savedSummary = localStorage.getItem('codedna_last_testcases_summary');
      if (savedSummary) return JSON.parse(savedSummary);
    } catch {}
    return null;
  });

  // Keep test cases updated if student assignment changes
  useEffect(() => {
    if (student.assignmentTitle) {
      setTestCases((prev) => {
        const isFresh = prev.every((tc) => tc.passed === undefined);
        return isFresh ? getDefaultTestCasesForProblem(student.assignmentTitle) : prev;
      });
    }
  }, [student.assignmentTitle]);




  // Bulletproof Exam-Lock Guard:

  // If student registered for MCQ examination attempts to manually navigate to /workspace,

  // immediately intercept and redirect back to /mcq!

  useEffect(() => {
    try {
      // CodeSpark Examination Hall conducts both Round 1 (MCQ) and Round 2 (Coding) seamlessly
      if (typeof window !== 'undefined' && window.location.pathname.includes('/codespark-exams')) {
        return;
      }

      const mode = localStorage.getItem('codedna_active_exam_mode');

      const raw = localStorage.getItem('codedna_student_profile');

      let isMcqRegistered = mode === 'MCQ';

      if (raw) {

        const parsed = JSON.parse(raw);

        if (parsed.name && parsed.rollNumber && (parsed.examMode === 'MCQ' || parsed.examType === 'Multiple Choice Question (MCQ) Examination')) {

          isMcqRegistered = true;

        }

      }

      if (isMcqRegistered || student.examType === 'Multiple Choice Question (MCQ) Examination' || student.examMode === 'MCQ') {

        console.warn('[Exam Guard] MCQ candidate attempted to access /workspace. Redirecting to /mcq.');

        const targetExamId = student.mcqExamId;

        navigate(targetExamId ? `/mcq?examId=${targetExamId}` : '/mcq', { replace: true });

      }

    } catch {}

  }, [student.examType, student.examMode, student.mcqExamId, navigate]);



  const isEffectiveLocked = isLockedByProctor;



  // Profile modal can be triggered by candidate or proctor, or automatically when a new candidate starts

  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(() => {

    if (typeof window !== 'undefined') {

      const params = new URLSearchParams(window.location.search);

      if (params.get('newCandidate') === 'true') return true;

    }

    return !Boolean(student.name?.trim() && student.rollNumber?.trim());

  });



  const [regValidationError, setRegValidationError] = useState<string | null>(null);

  const [regMode, setRegMode] = useState<'manual' | 'token'>('manual');

  const [tokenInput, setTokenInput] = useState<string>('');

  const [tokenParseResult, setTokenParseResult] = useState<DecodedTokenResult | null>(null);

  const [isCopiedSample, setIsCopiedSample] = useState<boolean>(false);



  // Ã¢â€â‚¬Ã¢â€â‚¬ LIVE EXAM SESSION TIMER STATE Ã¢â€â‚¬Ã¢â€â‚¬

  const [examDurationMinutes, setExamDurationMinutes] = useState<number>(() => {

    return student.examDurationMinutes !== undefined ? student.examDurationMinutes : 90;

  });



  const [sessionStartTime, setSessionStartTime] = useState<number>(() => {

    const cleanStation = (student.stationNumber || 'Station #01').replace(/[^a-zA-Z0-9]/g, '_');

    const storageKey = `codedna_session_start_${cleanStation}`;

    if (typeof window !== 'undefined') {

      const params = new URLSearchParams(window.location.search);

      if (params.get('newCandidate') === 'true') {

        const now = Date.now();

        localStorage.setItem(storageKey, String(now));

        return now;

      }

      try {

        const saved = localStorage.getItem(storageKey);

        if (saved) {

          const val = parseInt(saved, 10);

          const maxDurationMs = ((student.examDurationMinutes !== undefined ? student.examDurationMinutes : 90) * 60 + 60) * 1000;

          // If valid and within allowable exam window, resume it; otherwise start fresh

          if (!isNaN(val) && val > 0 && (Date.now() - val) < maxDurationMs) {

            return val;

          }

        }

        const initial = Date.now();

        localStorage.setItem(storageKey, String(initial));

        return initial;

      } catch {}

    }

    return student.sessionStartTime || Date.now();

  });



  const [sessionSecondsElapsed, setSessionSecondsElapsed] = useState<number>(() => {

    return Math.max(0, Math.floor((Date.now() - sessionStartTime) / 1000));

  });



  const [timerDisplayMode, setTimerDisplayMode] = useState<'remaining' | 'elapsed'>('remaining');

  const [hasTimeExpiredAlerted, setHasTimeExpiredAlerted] = useState<boolean>(false);



  const [editorData, setEditorData] = useState<CodeSubmission>({

    code: initialCode,

    language: 'Python',

    student,

    metrics: {

      typingSpeed: 0,

      timeSpent: 0,

      pasteCount: 0,

      deleteCount: 0,

      editCount: 0,

      undoCount: 0,

      pasteRatio: 0,

      pastedLines: 0,

      pastedChars: 0,

      totalLines: 0,

      keystrokes: 0,

      pauseDuration: 0,

      pasteLockViolations: 0,

      tabSwitchViolations: 0,

      unfocusedTimeSeconds: 0

    },

    snapshots: []

  });



  const terminalEndRef = useRef<HTMLDivElement>(null);



  useEffect(() => {

    if (terminalEndRef.current) {

      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });

    }

  }, [executionHistory, isExecuting]);



  // Ã¢â€â‚¬Ã¢â€â‚¬ REMOTE CCTV PROCTORING BUS LISTENER & CONTINUOUS LOCK ENFORCEMENT Ã¢â€â‚¬Ã¢â€â‚¬

  useEffect(() => {

    const activeLab = student.labId || getActiveLabId() || 'LAB-01';

    const myStationId = buildWorkstationId(activeLab, student.stationNumber);



    const checkLockStatus = () => {
      const explicit = typeof window !== 'undefined' ? localStorage.getItem(`${STATION_LOCK_PREFIX}${myStationId}`) : null;
      let locked = false;
      if (explicit === 'false') {
        locked = false;
      } else if (explicit === 'true') {
        locked = true;
      } else {
        locked = isStationLocked(myStationId, activeLab);
      }

      // Check persistent strikes for this station
      const savedStrikes = typeof window !== 'undefined'
        ? parseInt(localStorage.getItem(`codedna_strikes_${myStationId}`) || '0', 10)
        : 0;

      // If candidate has 3 strikes and has not been explicitly unlocked, station is locked!
      if (savedStrikes >= 3 && explicit !== 'false') {
        locked = true;
      }

      setIsLockedByProctor((prev) => {
        if (prev !== locked) {
          playSound(locked ? 'warning' : 'success');
        }
        return locked;
      });

      if (locked) {
        if (savedStrikes >= 3) {
          setProctorNotice('TERMINAL SUSPENDED: 3/3 Infractions Exceeded! Contact Invigilator for Emergency Key.');
        }
      } else {
        setInfractionNotice((prev) => (prev?.strike && prev.strike >= 3 ? null : prev));
        if (explicit === 'false') {
          setTabSwitchCount(0);
          setUnfocusedSeconds(0);
          setInfractionNotice(null);
          setProctorNotice(null);
          if (typeof window !== 'undefined') {
            localStorage.removeItem(`codedna_strikes_${myStationId}`);
          }
          setEditorData((prev) => {
            if (prev.metrics.tabSwitchViolations === 0 && prev.metrics.unfocusedTimeSeconds === 0) return prev;
            return {
              ...prev,
              metrics: {
                ...prev.metrics,
                tabSwitchViolations: 0,
                unfocusedTimeSeconds: 0
              }
            };
          });
        }
      }
    };

    checkLockStatus();

    syncCurrentLiveStation(editorData, {

      screenImageData: lastScreenFrameRef.current,

      hasLiveScreenStream: isScreenSharing

    });



    // Periodic lock check (1s)

    const lockInterval = setInterval(checkLockStatus, 1000);



    // Scalable presence telemetry heartbeat (15s + jitter) to Admin CCTV room for 1000+ candidates

    const jitter = Math.floor(Math.random() * 5000);

    const heartbeatInterval = setInterval(async () => {

      syncCurrentLiveStation(editorData, {

        screenImageData: lastScreenFrameRef.current,

        hasLiveScreenStream: isScreenSharing

      });



      if (myStationId) {

        try {

          const cloudStatus = await fetchSingleStationLockStatus(myStationId);

          if (cloudStatus) {

            if (cloudStatus.isLocked && !isLockedByProctor) {

              setIsLockedByProctor(true);

              if (cloudStatus.warningMessage) setProctorNotice(cloudStatus.warningMessage);

              playSound('warning');

            } else if (!cloudStatus.isLocked && isLockedByProctor) {

              setIsLockedByProctor(false);

              setTabSwitchCount(0);

              setUnfocusedSeconds(0);

              setInfractionNotice(null);

              setProctorNotice(null);

              playSound('success');

            } else if (cloudStatus.warningMessage && cloudStatus.warningMessage !== proctorNotice) {

              setProctorNotice(cloudStatus.warningMessage);

              playSound('warning');

            }

          }

        } catch {

          // Offline fallback

        }

      }

    }, 15000 + jitter);



    const cleanStationNum = (student.stationNumber || '01').replace(/[^0-9]/g, '') || '01';

    const paddedStationNum = cleanStationNum.padStart(2, '0');



    const unsubscribe = subscribeToCctvBroadcast((msg) => {

      const isForMe =

        msg.stationId === myStationId ||

        msg.stationId === 'all' ||

        msg.stationId === student.stationNumber ||

        msg.stationId?.endsWith(`WS-${paddedStationNum}`) ||

        msg.stationId === cleanStationNum ||

        msg.stationId === parseInt(cleanStationNum, 10).toString() ||

        (!msg.stationId && (msg.labId === 'all' || msg.labId === activeLab || !msg.labId));



      if (msg.type === 'LOCK_COMMAND') {

        if (isForMe && msg.isLocked !== undefined) {

          if (typeof window !== 'undefined') {

            localStorage.setItem(`${STATION_LOCK_PREFIX}${myStationId}`, msg.isLocked ? 'true' : 'false');

          }

          setIsLockedByProctor(msg.isLocked);

          if (!msg.isLocked) {

            setTabSwitchCount(0);

            setUnfocusedSeconds(0);

            setInfractionNotice(null);

            setProctorNotice(null);

            setEditorData((prev) => ({

              ...prev,

              metrics: {

                ...prev.metrics,

                tabSwitchViolations: 0,

                unfocusedTimeSeconds: 0

              }

            }));

          }

          playSound(msg.isLocked ? 'warning' : 'success');

        } else {

          checkLockStatus();

        }

      } else if (msg.type === 'PROCTOR_MESSAGE') {

        if (isForMe) {

          setProctorNotice(msg.warningMessage || 'Invigilator Notice Received');

          playSound('warning');

        }

      } else if (msg.type === 'CONCLUDE_AND_FREE') {

        if (isForMe) {

          if (typeof window !== 'undefined') {

            localStorage.setItem(`${STATION_LOCK_PREFIX}${myStationId}`, 'false');
      localStorage.removeItem(`codedna_strikes_${myStationId}`);
    }

    setIsLockedByProctor(false);

          executeStartNewCandidate();

          playSound('success');

        }

      } else if (msg.type === 'RESET_ALL') {

        setIsLockedByProctor(false);

        setTabSwitchCount(0);

        setUnfocusedSeconds(0);

        setInfractionNotice(null);

        setProctorNotice(null);

      }

    });



    const handleVisibilityChange = () => {

      if (!document.hidden) {

        checkLockStatus();

      }

    };



    window.addEventListener('storage', checkLockStatus);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    window.addEventListener('focus', checkLockStatus);



    // Cross-machine realtime unlock via Supabase (works across physical machines unlike BroadcastChannel)
    const myStId = `${student.labId || ''}-WS-${(student.stationNumber || '').replace(/[^0-9]/g, '').padStart(2, '0')}`;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    if (myStId && myStId.length > 5) {
      realtimeChannel = supabase
        .channel(`lock_watch_${myStId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'candidate_stations',
          filter: `id=eq.${myStId}`,
        }, (payload: { new: Record<string, unknown> }) => {
          const updated = payload.new as { is_locked_by_proctor?: boolean; warning_message?: string };
          if (updated.is_locked_by_proctor === false && isLockedByProctor) {
            setIsLockedByProctor(false);
            setTabSwitchCount(0);
            setUnfocusedSeconds(0);
            setInfractionNotice(null);
            setProctorNotice(null);
            playSound('success');
          } else if (updated.is_locked_by_proctor === true && !isLockedByProctor) {
            setIsLockedByProctor(true);
            if (updated.warning_message) setProctorNotice(updated.warning_message as string);
            playSound('warning');
          }
        })
        .subscribe();
    }

    return () => {

      clearInterval(lockInterval);

      clearInterval(heartbeatInterval);

      unsubscribe();

      if (realtimeChannel) supabase.removeChannel(realtimeChannel);

      window.removeEventListener('storage', checkLockStatus);

      document.removeEventListener('visibilitychange', handleVisibilityChange);

      window.removeEventListener('focus', checkLockStatus);

    };

  }, [student.labId, student.stationNumber]);



  // Ã¢â€â‚¬Ã¢â€â‚¬ HARD KEYSTROKE INTERCEPTION: PREVENT ANY TYPING IN WORKSPACE WHEN LOCKED Ã¢â€â‚¬Ã¢â€â‚¬

  useEffect(() => {

    if (!isEffectiveLocked) return;

    const blockAllKeystrokes = (e: KeyboardEvent) => {

      if (e.key === 'F5' || e.key === 'F11' || e.key === 'F12') return;

      const target = e.target as HTMLElement | null;

      // Allow candidate to type inside the registration modal

      if (target && target.closest('.registration-modal-content')) {

        return;

      }

      if (

        target &&

        (target.tagName === 'INPUT' ||

          target.tagName === 'TEXTAREA' ||

          target.isContentEditable ||

          target.closest('.monaco-editor') ||

          target.closest('.view-lines'))

      ) {

        e.preventDefault();

        e.stopPropagation();

        playSound('warning');

      }

    };

    window.addEventListener('keydown', blockAllKeystrokes, true);

    return () => window.removeEventListener('keydown', blockAllKeystrokes, true);

  }, [isEffectiveLocked]);



  // Ã¢â€â‚¬Ã¢â€â‚¬ MULTI-VECTOR ANTI-CHEATING & AI SURVEILLANCE SHIELD (Workspace) Ã¢â€â‚¬Ã¢â€â‚¬

  useEffect(() => {

    if (isExamSubmitted || !isCandidateRegistered) return;



    const activeLab = student.labId || getActiveLabId() || 'LAB-01';

    const myStationId = buildWorkstationId(activeLab, student.stationNumber);



    const shield = startAntiCheatingShield({

      stationId: myStationId,

      labId: activeLab,

      onInfraction: (reason: string) => {
        playSound('warning');
        setTabSwitchCount((prev) => {
          const newCount = Math.min(3, prev + 1);
          if (typeof window !== 'undefined') {
            localStorage.setItem(`codedna_strikes_${myStationId}`, String(newCount));
          }
          setInfractionNotice({
            strike: newCount,
            message: `PROCTOR INFRACTION (${newCount}/3): ${reason}`,
            duration: 6
          });
          if (newCount >= 3) {
            setIsLockedByProctor(true);
            if (typeof window !== 'undefined') {
              localStorage.setItem(`${STATION_LOCK_PREFIX}${myStationId}`, 'true');
            }
            sendProctorLockCommand(myStationId, true, activeLab);
            setProctorNotice('TERMINAL SUSPENDED: 3/3 Infractions Exceeded! Contact Invigilator for Emergency Key.');
          }
          return newCount;
        });
      },
      onWarningBanner: (msg: string) => {

        setProctorNotice(msg);

        playSound('warning');

      },

      onAudioAlert: () => {

        setProctorNotice('AUDIO SURVEILLANCE: Voice/sound detected in exam environment.');

      },

      onAiAlert: (source: string) => {

        playSound('warning');

        setProctorNotice(`CRITICAL SECURITY ALERT: Unauthorized AI Assistant (${source}) detected! Close all extensions.`);

      }

    });



    return () => {

      shield.stop();

    };

  }, [isExamSubmitted, isCandidateRegistered, student.labId, student.stationNumber, student.name]);



  // Ã¢â€â‚¬Ã¢â€â‚¬ ADVANCED KIOSK & TAB-SWITCH / ALT+TAB INFRACTION DETECTOR Ã¢â€â‚¬Ã¢â€â‚¬

  useEffect(() => {

    if (isExamSubmitted) return;



    const activeLab = student.labId || getActiveLabId() || 'LAB-01';

    const myStationId = buildWorkstationId(activeLab, student.stationNumber);



    const handleWindowBlur = () => {

      if (isAwayRef.current || isExamSubmitted) return;

      isAwayRef.current = true;

      blurStartTimestampRef.current = Date.now();

    };



    const handleWindowFocus = () => {

      if (!isAwayRef.current || isExamSubmitted) return;

      isAwayRef.current = false;

      const now = Date.now();

      const startTime = blurStartTimestampRef.current || now;

      const elapsedMs = now - startTime;

      blurStartTimestampRef.current = null;



      // Immediate strike on genuine focus departure (>= 250ms)

      if (elapsedMs < 250) {

        return;

      }



      const awayDuration = Math.max(1, Math.round(elapsedMs / 1000));



      // Check explicit unlock status

      const explicit = typeof window !== 'undefined' ? localStorage.getItem(`${STATION_LOCK_PREFIX}${myStationId}`) : null;

      if (explicit === 'false') {

        // The proctor has explicitly pardoned/unlocked this station!

        // Returning focus from proctor action MUST NOT increment strikes or re-lock!

        setTabSwitchCount(0);

        setUnfocusedSeconds(0);

        setInfractionNotice(null);

        setIsLockedByProctor(false);

        setEditorData((prev) => ({

          ...prev,

          metrics: {

            ...prev.metrics,

            tabSwitchViolations: 0,

            unfocusedTimeSeconds: 0

          }

        }));

        return;

      }



      if (isLockedByProctor) {

        // While workstation is currently locked, do not increment further strikes

        return;

      }



      setTabSwitchCount((prevCount) => {
        const newCount = Math.min(3, prevCount + 1);
        if (typeof window !== 'undefined') {
          localStorage.setItem(`codedna_strikes_${myStationId}`, String(newCount));
        }
        setUnfocusedSeconds((prevSec) => prevSec + awayDuration);

        // Update editorData and broadcast immediately to Admin CCTV room
        setEditorData((prev) => {
          const updatedMetrics = {
            ...prev.metrics,
            tabSwitchViolations: newCount,
            unfocusedTimeSeconds: (prev.metrics.unfocusedTimeSeconds || 0) + awayDuration
          };
          const updated = {
            ...prev,
            metrics: updatedMetrics
          };
          syncCurrentLiveStation(updated, {
            screenImageData: lastScreenFrameRef.current,
            hasLiveScreenStream: isScreenSharing
          });
          return updated;
        });

        playSound('warning');

        if (newCount === 1) {
          setInfractionNotice({
            strike: 1,
            duration: awayDuration,
            message: `INFRACTION STRIKE 1/3: Exam window focus lost for ${awayDuration}s! Tab switching or leaving the screen is recorded in the invigilator log.`
          });
        } else if (newCount === 2) {
          setInfractionNotice({
            strike: 2,
            duration: awayDuration,
            message: `INFRACTION STRIKE 2/3: FINAL WARNING! Window left for ${awayDuration}s! One more tab switch or Alt+Tab will automatically freeze your workstation.`
          });
        } else if (newCount >= 3) {
          setInfractionNotice({
            strike: 3,
            duration: awayDuration,
            message: 'TERMINAL SUSPENDED: 3/3 Infractions Exceeded! You switched tabs or left the practical exam window 3 times. Workstation frozen.'
          });
          setIsLockedByProctor(true);
          if (typeof window !== 'undefined') {
            localStorage.setItem(`${STATION_LOCK_PREFIX}${myStationId}`, 'true');
          }
          sendProctorLockCommand(myStationId, true, activeLab);
          setProctorNotice('TERMINAL SUSPENDED: 3/3 Infractions Exceeded! Contact Invigilator for Emergency Key.');
        }

        return newCount;
      });
    };

    const handleVisibilityChange = () => {

      if (document.hidden) {

        handleWindowBlur();

      } else {

        handleWindowFocus();

      }

    };



    const handleFullscreenChange = () => {

      const isInFullscreen = Boolean(document.fullscreenElement);

      setIsFullscreen(isInFullscreen);

      if (!isInFullscreen && isFullscreen) {

        handleWindowBlur();

        setTimeout(handleWindowFocus, 100);

      }

    };



    window.addEventListener('blur', handleWindowBlur);

    window.addEventListener('focus', handleWindowFocus);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    document.addEventListener('fullscreenchange', handleFullscreenChange);



    return () => {

      window.removeEventListener('blur', handleWindowBlur);

      window.removeEventListener('focus', handleWindowFocus);

      document.removeEventListener('visibilitychange', handleVisibilityChange);

      document.removeEventListener('fullscreenchange', handleFullscreenChange);

    };

  }, [isExamSubmitted, student.labId, student.stationNumber, isFullscreen, isScreenSharing]);



  const toggleFullscreenKiosk = async () => {

    try {

      if (!document.fullscreenElement) {

        await document.documentElement.requestFullscreen();

        setIsFullscreen(true);

        playSound('click');

      } else {

        await document.exitFullscreen();

        setIsFullscreen(false);

      }

    } catch (err) {

      console.warn('Fullscreen request denied:', err);

    }

  };



  // Sync terminal output whenever code compiles and runs

  useEffect(() => {

    if (compilerResult) {

      const outputText = compilerResult.compileOutput || compilerResult.stdout || compilerResult.stderr || '';

      syncCurrentLiveStation(editorData, {

        lastTerminalOutput: outputText,

        screenImageData: lastScreenFrameRef.current,

        hasLiveScreenStream: isScreenSharing

      });

    }

  }, [compilerResult]);



  // Ã¢â€â‚¬Ã¢â€â‚¬ REAL SCREEN PROCTORING CAPTURE (WEBSCREEN API) Ã¢â€â‚¬Ã¢â€â‚¬

  const startScreenProctoring = async () => {

    try {

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {

        setWorkspaceNoticeMessage('Screen Capture API is not supported on this browser.');

        return;

      }

      const stream = await navigator.mediaDevices.getDisplayMedia({

        video: { cursor: 'always' } as any,

        audio: false

      });



      const track = stream.getVideoTracks()[0];

      screenTrackRef.current = track;



      if (!screenVideoRef.current) {

        const vid = document.createElement('video');

        vid.autoplay = true;

        vid.muted = true;

        vid.playsInline = true;

        screenVideoRef.current = vid;

      }

      screenVideoRef.current.srcObject = stream;

      await screenVideoRef.current.play();



      setIsScreenSharing(true);

      playSound('success');



      screenIntervalRef.current = setInterval(() => {

        if (!screenVideoRef.current || !screenTrackRef.current || screenTrackRef.current.readyState !== 'live') {

          stopScreenProctoring();

          return;

        }

        if (!screenCanvasRef.current) {

          screenCanvasRef.current = document.createElement('canvas');

          screenCanvasRef.current.width = 320;

          screenCanvasRef.current.height = 180;

        }

        const ctx = screenCanvasRef.current.getContext('2d');

        if (ctx && screenVideoRef.current.videoWidth > 0) {

          ctx.drawImage(screenVideoRef.current, 0, 0, 320, 180);

          const dataUrl = screenCanvasRef.current.toDataURL('image/jpeg', 0.35);

          lastScreenFrameRef.current = dataUrl;

          syncCurrentLiveStation(editorData, {

            screenImageData: dataUrl,

            hasLiveScreenStream: true

          });

        }

      }, 12000);



      track.onended = () => {

        stopScreenProctoring();

      };

    } catch (err) {

      console.warn('Screen proctoring permission denied or canceled:', err);

      setIsScreenSharing(false);

    }

  };



  const stopScreenProctoring = () => {

    if (screenIntervalRef.current) {

      clearInterval(screenIntervalRef.current);

      screenIntervalRef.current = null;

    }

    if (screenTrackRef.current) {

      screenTrackRef.current.stop();

      screenTrackRef.current = null;

    }

    setIsScreenSharing(false);

    lastScreenFrameRef.current = undefined;

    syncCurrentLiveStation(editorData, { hasLiveScreenStream: false, screenImageData: undefined });

  };



  useEffect(() => {

    return () => {

      if (screenIntervalRef.current) clearInterval(screenIntervalRef.current);

      if (screenTrackRef.current) screenTrackRef.current.stop();

    };

  }, []);



  const handleEditorChange = useCallback((data: CodeSubmission) => {

    setEditorData(data);

    // Broadcast live telemetry to Admin CCTV control room

    syncCurrentLiveStation(data, {

      screenImageData: lastScreenFrameRef.current,

      hasLiveScreenStream: isScreenSharing

    });



    if (onCodeChange) {

      onCodeChange(data);

    }

  }, [onCodeChange, isScreenSharing]);



  const handleUpdateStudent = useCallback((info: StudentInfo) => {

    setStudent(info);

    if (info.examDurationMinutes !== undefined) {

      setExamDurationMinutes(info.examDurationMinutes);

    }

    if (info.sessionStartTime) {

      setSessionStartTime(info.sessionStartTime);

    }

    const registered = Boolean(info.name?.trim() && info.rollNumber?.trim());

    setIsCandidateRegistered(registered);

    if (registered) {

      void requestExamFullscreen();

    }



    if (typeof window !== 'undefined') {

      try {

        const cleanStation = (info.stationNumber || 'Station #01').replace(/[^a-zA-Z0-9]/g, '_');

        localStorage.setItem(`codedna_student_profile_${cleanStation}`, JSON.stringify(info));

        localStorage.setItem('codedna_student_profile', JSON.stringify(info));

      } catch {

        // Ignore

      }

    }

    setEditorData((prev: CodeSubmission) => {

      const updated = { ...prev, student: info };

      syncCurrentLiveStation(updated, {

        screenImageData: lastScreenFrameRef.current,

        hasLiveScreenStream: isScreenSharing

      });

      return updated;

    });

  }, [isScreenSharing]);



  const handleUnlockStation = useCallback(() => {

    const activeLab = student.labId || getActiveLabId() || 'LAB-01';

    const myStationId = buildWorkstationId(activeLab, student.stationNumber);

    sendProctorLockCommand(myStationId, false, activeLab);

    if (typeof window !== 'undefined') {

      localStorage.setItem(`${STATION_LOCK_PREFIX}${myStationId}`, 'false');

    }

    setIsLockedByProctor(false);

    setTabSwitchCount(0);

    setUnfocusedSeconds(0);

    setInfractionNotice(null);

    setProctorNotice(null);

    setEditorData((prev: CodeSubmission) => ({

      ...prev,

      metrics: {

        ...prev.metrics,

        tabSwitchViolations: 0,

        unfocusedTimeSeconds: 0

      }

    }));

    playSound('success');

  }, [student.labId, student.stationNumber]);



  const handleStartNewCandidate = useCallback(() => {

    setShowResetCandidateConfirm(true);

  }, []);



  const executeStartNewCandidate = useCallback(() => {

    const cleanStation = (student.stationNumber || 'Station #01').replace(/[^a-zA-Z0-9]/g, '_');

    try {

      localStorage.removeItem(`codedna_session_start_${cleanStation}`);

      localStorage.removeItem(`codedna_student_profile_${cleanStation}`);

      localStorage.removeItem('codedna_student_profile');

      localStorage.removeItem('codedna_last_report');

      localStorage.removeItem('codedna_last_compiler');

      localStorage.removeItem('codedna_last_history');

      localStorage.removeItem('codedna_last_submission');

      localStorage.removeItem('codedna_last_viva');

    } catch {}



    const now = Date.now();

    setSessionStartTime(now);

    setSessionSecondsElapsed(0);

    setHasTimeExpiredAlerted(false);

    setIsExamSubmitted(false);

    setIsCandidateRegistered(false);

    setIsRightPaneOpen(false);

    setTabSwitchCount(0);

    setUnfocusedSeconds(0);

    setInfractionNotice(null);

    setProctorNotice(null);



    const freshStudent: StudentInfo = {

      ...student,

      name: '',

      rollNumber: '',

      course: '',

      department: '',

      semester: '',

      assignmentTitle: '',

      sessionStartTime: now

    };

    setStudent(freshStudent);



    const freshCode = '';

    const freshSubmission: CodeSubmission = {

      code: freshCode,

      language: editorData.language,

      student: freshStudent,

      metrics: {

        typingSpeed: 0,

        timeSpent: 0,

        pasteCount: 0,

        deleteCount: 0,

        editCount: 0,

        undoCount: 0,

        pasteRatio: 0,

        pastedLines: 0,

        pastedChars: 0,

        totalLines: 0,

        keystrokes: 0,

        pauseDuration: 0,

        pasteLockViolations: 0,

        tabSwitchViolations: 0,

        unfocusedTimeSeconds: 0

      },

      snapshots: []

    };

    setEditorData(freshSubmission);

    if (onCodeChange) onCodeChange(freshSubmission);

    if (onClearTerminal) onClearTerminal();



    setIsProfileModalOpen(true);

    playSound('click');

  }, [student, editorData.language, onCodeChange, onClearTerminal]);



    const handleRunAllTests = useCallback(async () => {
    if (!isCandidateRegistered) {
      playSound('warning');
      setRegValidationError('Candidate registration is mandatory before evaluating test cases.');
      setIsProfileModalOpen(true);
      return;
    }
    if (isLockedByProctor) {
      playSound('warning');
      setWorkspaceNoticeMessage('Access Denied: Terminal is locked by the invigilator.');
      return;
    }
    if (!editorData.code.trim()) {
      playSound('warning');
      setWorkspaceNoticeMessage('Please enter program code in the editor before running test cases.');
      return;
    }

    setIsRunningTests(true);
    setIsRightPaneOpen(true);
    setActiveTab('testcases');
    playSound('click');

    try {
      const summary = await runTestCases(editorData.code, editorData.language, testCases);
      setTestCases(summary.results);
      setTestCasesSummary(summary);
      try {
        localStorage.setItem('codedna_last_testcases', JSON.stringify(summary.results));
        localStorage.setItem('codedna_last_testcases_summary', JSON.stringify(summary));
      } catch {}
      playSound(summary.allPassed ? 'success' : 'warning');
    } catch (err: unknown) {
      console.error('Failed to run test cases:', err);
      playSound('error');
    } finally {
      setIsRunningTests(false);
    }
  }, [isCandidateRegistered, isLockedByProctor, editorData.code, editorData.language, testCases]);

  const handleAddTestCase = useCallback(() => {
    const newCase: TestCaseItem = {
      id: `tc-${Date.now()}`,
      name: `Custom Case ${testCases.length + 1}`,
      input: '',
      expectedOutput: ''
    };
    setTestCases((prev) => [...prev, newCase]);
    setSelectedTestCaseIdx(testCases.length);
    playSound('click');
  }, [testCases.length]);

  const handleDeleteTestCase = useCallback((indexToDelete: number) => {
    if (testCases.length <= 1) return;
    setTestCases((prev) => prev.filter((_, i) => i !== indexToDelete));
    setSelectedTestCaseIdx((prev) => Math.max(0, Math.min(prev, testCases.length - 2)));
    playSound('click');
  }, [testCases.length]);

  const handleUpdateTestCase = useCallback((idx: number, field: 'input' | 'expectedOutput' | 'name', value: string) => {
    setTestCases((prev) => {
      const updated = [...prev];
      if (updated[idx]) {
        updated[idx] = { ...updated[idx], [field]: value, passed: undefined, actualOutput: undefined };
      }
      return updated;
    });
  }, []);

const handleRun = useCallback(() => {

    if (!isCandidateRegistered) {

      playSound('warning');

      setRegValidationError('Candidate registration is mandatory. Enter your Name and USN to unlock the code compiler.');

      setIsProfileModalOpen(true);

      return;

    }

    if (isLockedByProctor) {

      playSound('warning');

      setWorkspaceNoticeMessage('Access Denied: Terminal is locked by the invigilator. Click "Pardon & Unlock" in the banner above to resume.');

      return;

    }

    if (!editorData.code.trim()) {

      playSound('warning');

      setWorkspaceNoticeMessage('Please enter or write your program code in the editor before running.');

      return;

    }

    if (isExecuting) return;

    setIsRightPaneOpen(true);

    playSound('click');

    onRunCode({ ...editorData, student }, stdinInput);

    setActiveTab('terminal');

  }, [isCandidateRegistered, isLockedByProctor, editorData, isExecuting, student, stdinInput, onRunCode]);



  // Global Keyboard Shortcut: Ctrl+Enter / Cmd+Enter to execute program immediately, Ctrl+` to toggle console

  useEffect(() => {

    const handleGlobalShortcuts = (e: KeyboardEvent) => {

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {

        e.preventDefault();

        handleRun();

      } else if ((e.ctrlKey || e.metaKey) && e.key === '`') {

        e.preventDefault();

        setIsRightPaneOpen((prev) => !prev);

      } else if (e.key === 'Escape' && isRightPaneOpen && !isProfileModalOpen) {

        setIsRightPaneOpen(false);

      }

    };

    window.addEventListener('keydown', handleGlobalShortcuts);

    return () => window.removeEventListener('keydown', handleGlobalShortcuts);

  }, [handleRun, isRightPaneOpen, isProfileModalOpen]);



  // Reset exam submission state if analysis is cleared

  useEffect(() => {

    if (!analysisResults) {

      setIsExamSubmitted(false);

    }

  }, [analysisResults]);



  const performFinalSubmit = useCallback(async () => {

    playSound('success');

    setIsExamSubmitted(true);



    // If analysisResults not yet available, compile/evaluate first!

    let finalReport = analysisResults;

    let finalCompiler = compilerResult;

    if (!finalReport) {

      const runRes = await onRunCode({ ...editorData, student }, stdinInput);

      if (runRes && typeof runRes === 'object') {

        if ('report' in runRes && runRes.report) finalReport = runRes.report;

        if ('execResult' in runRes && runRes.execResult) finalCompiler = runRes.execResult;

      }

      if (!finalReport && typeof window !== 'undefined') {

        try {

          const savedRep = localStorage.getItem('codedna_last_report');

          if (savedRep) finalReport = JSON.parse(savedRep);

          const savedComp = localStorage.getItem('codedna_last_compiler');

          if (savedComp) finalCompiler = JSON.parse(savedComp);

        } catch {}

      }

    }



    // Save final submission to Admin Control Room with the real generated report and compiler result!

    submitAndMarkDone(editorData, finalCompiler || undefined, finalReport || undefined);



    onViewReport();

  }, [analysisResults, compilerResult, editorData, onRunCode, student, stdinInput, onViewReport]);



  const handleSubmitExam = useCallback(async (isAutoSubmit: boolean = false) => {

    const auto = isAutoSubmit === true;

    if (!isCandidateRegistered) {

      playSound('warning');

      setRegValidationError('Candidate registration is mandatory before submitting your practical examination.');

      setIsProfileModalOpen(true);

      return;

    }

    // Proctor-locked: still allow submission (student may be auto-suspended at 3 strikes and time is up)
    // Show a warning but DO NOT block submission - exam must be submittable at all times
    if (isLockedByProctor && !auto) {
      playSound('warning');
      setWorkspaceNoticeMessage('Your workstation is locked. Submitting will finalize your exam and notify the invigilator. Continue?');
      setShowFinalSubmitConfirm(true);
      return;
    }

    if (!editorData.code.trim()) {

      setWorkspaceNoticeMessage('Please write or enter your program code before submitting.');

      return;

    }



    if (!auto) {

      setShowFinalSubmitConfirm(true);

      return;

    }



    await performFinalSubmit();

  }, [isCandidateRegistered, isLockedByProctor, editorData.code, performFinalSubmit]);



  // Ã¢â€â‚¬Ã¢â€â‚¬ LIVE EXAM SESSION TIMER TICK & EXPIRATION WATCHDOG Ã¢â€â‚¬Ã¢â€â‚¬

  useEffect(() => {

    if (isExamSubmitted || analysisResults !== null || !isCandidateRegistered) return;



    const interval = setInterval(() => {

      const now = getSynchronizedNow();

      const elapsed = Math.max(0, Math.floor((now - sessionStartTime) / 1000));

      setSessionSecondsElapsed(elapsed);



      // Automatic submission when allocated exam time reaches zero

      if (examDurationMinutes > 0 && isCandidateRegistered) {

        const totalDurationSec = examDurationMinutes * 60;

        const remaining = totalDurationSec - elapsed;

        if (remaining <= 0 && !hasTimeExpiredAlerted && !isExamSubmitted) {

          setHasTimeExpiredAlerted(true);

          playSound('warning');

          void handleSubmitExam(true);

        }

      }

    }, 1000);



    return () => clearInterval(interval);

  }, [sessionStartTime, examDurationMinutes, isExamSubmitted, analysisResults, hasTimeExpiredAlerted, handleSubmitExam, isCandidateRegistered]);



  // Formatting helpers for Exam Session Clock

  const formatSessionTime = (totalSec: number) => {

    const sec = Math.max(0, totalSec);

    const hrs = Math.floor(sec / 3600);

    const mins = Math.floor((sec % 3600) / 60);

    const secs = sec % 60;

    if (hrs > 0) {

      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    }

    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  };



  const totalSessionSec = examDurationMinutes * 60;

  const sessionRemainingSec = examDurationMinutes > 0 ? Math.max(0, totalSessionSec - sessionSecondsElapsed) : 0;

  const isTimeUrgent = examDurationMinutes > 0 && sessionRemainingSec <= 300; // <= 5 minutes left

  const isTimeWarning = examDurationMinutes > 0 && sessionRemainingSec <= 900 && !isTimeUrgent; // <= 15 minutes left



  const handleOpenReport = () => {

    playSound('click');

    if (!analysisResults && editorData.code.trim()) {

      onRunCode({ ...editorData, student }, stdinInput);

    }

    onViewReport();

  };



  return (

    <div

      style={{

        display: 'flex',

        flexDirection: 'column',

        flex: 1,

        height: 'calc(100dvh - 52px)',

        background: 'var(--bg-main)',

        overflow: 'hidden'

      }}

    >

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ UNIFIED FULL-WIDTH WORKSPACE CONTROL BAR Ã¢â€â‚¬Ã¢â€â‚¬ */}

      <div

        className="workspace-toolbar"

        style={{

          height: '46px',

          minHeight: '46px',

          background: 'var(--bg-surface)',

          borderBottom: '1px solid var(--border)',

          display: 'flex',

          alignItems: 'center',

          justifyContent: 'space-between',

          padding: '0 16px',

          flexShrink: 0,

          zIndex: 10,

          gap: '12px',

          overflowX: 'auto',

          overflowY: 'hidden',

          scrollbarWidth: 'none',

          WebkitOverflowScrolling: 'touch'

        }}

      >

        {/* Left Sub-Group: Candidate info, Exam, Language, Station, Strikes */}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>

          {/* 1. Programming Language Selector Dropdown */}

          <div style={{ width: '135px' }}>

            <SimpleSelect<string>

              value={editorData.language}

              disabled={isEffectiveLocked}

              prefixIcon={<Code2 size={12} />}

              onChange={(newLang) => {

                if (isEffectiveLocked) return;

                setEditorData((prev: CodeSubmission) => ({ ...prev, language: newLang }));

              }}

              options={[

                { value: 'Python', label: 'Python 3.8' },

                { value: 'C++', label: 'C++ (GCC 9.2)' },

                { value: 'Java', label: 'Java 13' },

                { value: 'C', label: 'C (GCC 9.2)' },

                { value: 'JavaScript', label: 'JavaScript' },

                { value: 'TypeScript', label: 'TypeScript' },

                { value: 'Go', label: 'Go 1.13' },

                { value: 'Rust', label: 'Rust 1.40' },

                { value: 'C#', label: 'C# (.NET)' },

                { value: 'Kotlin', label: 'Kotlin 1.3' },

                { value: 'Swift', label: 'Swift 5.2' },

                { value: 'PHP', label: 'PHP 7.4' },

                { value: 'Ruby', label: 'Ruby 2.7' },

                { value: 'Bash', label: 'Bash 5.0' }

              ]}

              size="sm"

              style={{

                height: '28px',

                fontSize: '11.5px',

                borderRadius: '6px'

              }}

              title={

                isLockedByProctor

                  ? 'Terminal locked by proctor'

                  : !isCandidateRegistered

                  ? 'Registration required to switch language'

                  : 'Switch practical programming language'

              }

            />

          </div>



          {/* 2. Live Session Countdown / Concluded Clock */}

          {(isExamSubmitted || analysisResults !== null) ? (

            <span

              className="badge badge-neutral"

              style={{

                height: '28px',

                padding: '0 10px',

                gap: '5px',

                fontWeight: 700,

                fontFamily: 'var(--font-mono)',

                fontSize: '11px',

                border: '1px solid var(--success-border)',

                background: 'var(--success-bg)',

                color: 'var(--success)'

              }}

              title="Examination session concluded"

            >

              <CheckCircle2 size={12} color="var(--success)" />

              <span>Concluded</span>

            </span>

          ) : (

            <button

              onClick={() => {

                setTimerDisplayMode((prev) => (prev === 'remaining' ? 'elapsed' : 'remaining'));

                playSound('click');

              }}

              className={`badge ${

                isTimeUrgent ? 'badge-danger' : isTimeWarning ? 'badge-warning' : 'badge-neutral'

              }`}

              style={{

                height: '28px',

                padding: '0 10px',

                gap: '5px',

                fontWeight: 700,

                cursor: 'pointer',

                border: isTimeUrgent

                  ? '1px solid var(--danger)'

                  : isTimeWarning

                  ? '1px solid var(--warning)'

                  : '1px solid var(--border)',

                background: isTimeUrgent

                  ? 'rgba(239, 68, 68, 0.15)'

                  : isTimeWarning

                  ? 'rgba(245, 158, 11, 0.12)'

                  : 'var(--bg-elevated)',

                color: isTimeUrgent ? '#f87171' : isTimeWarning ? 'var(--warning)' : 'var(--text-primary)',

                fontFamily: 'var(--font-mono)',

                fontSize: '11px',

                transition: 'all 0.15s ease'

              }}

              title={

                examDurationMinutes > 0

                  ? `Exam Session Clock: ${

                      timerDisplayMode === 'remaining'

                        ? `${formatSessionTime(sessionRemainingSec)} remaining (Click to view elapsed)`

                        : `${formatSessionTime(sessionSecondsElapsed)} elapsed (Click to view remaining)`

                    } Ã¢â‚¬Â¢ Limit: ${examDurationMinutes}m`

                  : `Exam Session Clock: ${formatSessionTime(sessionSecondsElapsed)} elapsed`

              }

            >

              {isTimeUrgent ? (

                <ShieldAlert size={12} color="var(--danger)" />

              ) : isTimeWarning ? (

                <AlertTriangle size={12} color="var(--warning)" />

              ) : (

                <Clock size={12} color="var(--accent)" />

              )}

              <span>

                {examDurationMinutes > 0

                  ? timerDisplayMode === 'remaining'

                    ? `${formatSessionTime(sessionRemainingSec)} Left`

                    : `${formatSessionTime(sessionSecondsElapsed)} Elapsed`

                  : `${formatSessionTime(sessionSecondsElapsed)} Elapsed`}

              </span>

            </button>

          )}



          {/* 3. Candidate & Workstation Profile Chip */}

          <button

            className={`btn ${!isCandidateRegistered ? 'btn-warning' : 'btn-ghost'} btn-sm`}

            onClick={() => {

              setIsProfileModalOpen(true);

              playSound('click');

            }}

            disabled={isLockedByProctor}

            style={{

              fontSize: '11px',

              padding: '0 10px',

              gap: '6px',

              height: '28px',

              borderColor: !isCandidateRegistered ? 'var(--warning)' : 'var(--border)',

              background: !isCandidateRegistered ? undefined : 'var(--bg-elevated)',

              color: !isCandidateRegistered ? 'var(--warning)' : 'var(--text-secondary)',

              fontWeight: !isCandidateRegistered ? 700 : 500

            }}

            title={

              isCandidateRegistered

                ? `Candidate: ${student.name} | USN: ${student.rollNumber || 'N/A'} | Lab: ${student.labId || 'LAB-01'} (${student.stationNumber || 'St#01'}) | Exam: ${student.examType} (Click to edit)`

                : 'Registration mandatory before compiling code. Click to enter Name and Roll Number.'

            }

          >

            {isCandidateRegistered ? (

              <UserCheck size={12} color="var(--accent)" />

            ) : (

              <AlertTriangle size={12} color="var(--warning)" />

            )}

            <span>

              {isCandidateRegistered

                ? `${student.name || 'Candidate'} Ã‚Â· ${student.stationNumber || 'St#01'}`

                : 'Register Candidate'}

            </span>

          </button>



          {/* 3b. Next Candidate / Reset Station Button */}

          <button

            className="btn btn-secondary btn-sm"

            onClick={handleStartNewCandidate}

            disabled={isLockedByProctor}

            style={{

              fontSize: '11px',

              padding: '0 8px',

              gap: '4px',

              height: '28px',

              color: 'var(--text-secondary)'

            }}

            title="Conclude current session and register next candidate"

          >

            <UserPlus size={12} />

            <span>Next Candidate</span>

          </button>



          {/* 4. Infraction Strikes Pill (Shown ONLY if strikes > 0 or station locked) */}

          {(tabSwitchCount > 0 || isLockedByProctor) && (

            <div

              className={`badge ${tabSwitchCount >= 3 || isLockedByProctor ? 'badge-danger' : 'badge-warning'}`}

              title={

                isLockedByProctor || tabSwitchCount >= 3

                  ? 'Workstation locked due to examination protocol infractions. Invigilator clearance required.'

                  : `Focus Integrity Alert: ${tabSwitchCount}/3 Tab Switch Strikes recorded (${unfocusedSeconds}s total unfocused)`

              }

              style={{

                height: '28px',

                padding: '0 8px',

                gap: '4px',

                fontWeight: 700,

                fontSize: '11px',

                cursor: 'default',

                background: tabSwitchCount >= 3 || isLockedByProctor ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',

                border: tabSwitchCount >= 3 || isLockedByProctor ? '1px solid var(--danger)' : '1px solid var(--warning)',

                color: tabSwitchCount >= 3 || isLockedByProctor ? 'var(--danger)' : 'var(--warning)',

                display: 'inline-flex',

                alignItems: 'center'

              }}

            >

              {tabSwitchCount >= 3 || isLockedByProctor ? <Lock size={11} /> : <AlertTriangle size={11} />}

              <span>

                {tabSwitchCount >= 3 || isLockedByProctor

                  ? 'Station Frozen'

                  : `${tabSwitchCount}/3 Strikes`}

              </span>

            </div>

          )}

        </div>



        {/* Right Sub-Group: Tools & Primary Actions via Watermelon UI Components */}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>

          {/* Watermelon UI: Extended Toolbar for workspace auxiliary actions */}

          <ExtendedToolbar

            showStdin={showStdin}

            onToggleStdin={() => setShowStdin(!showStdin)}

            isFullscreen={isFullscreen}

            onToggleFullscreen={toggleFullscreenKiosk}

            isScreenSharing={isScreenSharing}

            onToggleScreenShare={isScreenSharing ? stopScreenProctoring : startScreenProctoring}

            isLocked={isEffectiveLocked}

            isConsoleOpen={isRightPaneOpen}
            onToggleTestCases={() => {
              setIsRightPaneOpen(true);
              setActiveTab('testcases');
              playSound('click');
            }}
            isTestCasesOpen={isRightPaneOpen && activeTab === 'testcases'}
            testCount={testCasesSummary ? `${testCasesSummary.totalPassed}/${testCasesSummary.totalCount}` : testCases.length}
            testBadgeTone={testCasesSummary ? (testCasesSummary.allPassed ? 'success' : 'warning') : 'neutral'}

            onToggleConsole={() => setIsRightPaneOpen((prev) => !prev)}

            hasOutput={Boolean(compilerResult || executionHistory.length > 0)}

          />



          {/* Divider */}

          <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 2px' }} />



          {/* Watermelon UI: Run Action Button with Animated Multi-Step Execution */}

          <RunActionButton

            onRun={handleRun}

            isExecuting={isExecuting}

            disabled={isExecuting}

            isLocked={isLockedByProctor}

            isRegistered={isCandidateRegistered}

            title={

              isLockedByProctor

                ? 'Terminal locked by invigilator. Click "Pardon & Unlock" in the banner above.'

                : !isCandidateRegistered

                ? 'Registration mandatory to run program (Click to register)'

                : !editorData.code.trim()

                ? 'Enter program code in editor to compile and run'

                : 'Compile and execute code on cloud compiler (Ctrl+Enter)'

            }

          />



          {/* Watermelon UI: Submit Action Button */}

          <SubmitActionButton

            onSubmit={() => handleSubmitExam(false)}

            isSubmitting={isExecuting}

            isSubmitted={isExamSubmitted}

            disabled={isExecuting}

            isLocked={isLockedByProctor}

          />

        </div>

      </div>



      {/* Ã¢â€â‚¬Ã¢â€â‚¬ SPLIT VIEW CONTAINER (Editor on Left, Diagnostics/Terminal on Right) Ã¢â€â‚¬Ã¢â€â‚¬ */}

      <div

        className="workspace-split-container"

        style={{

          display: 'flex',

          flex: 1,

          minHeight: 0,

          overflow: 'hidden'

        }}

      >

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ LEFT PANE: CODE EDITOR Ã¢â€â‚¬Ã¢â€â‚¬ */}

        <div

          className="workspace-editor-pane"

          style={{

            flex: isRightPaneOpen ? 1.25 : 1,

            display: 'flex',

            flexDirection: 'column',

            borderRight: isRightPaneOpen ? '1px solid var(--border)' : 'none',

            minWidth: 0,

            background: 'var(--bg-elevated)',

            overflow: 'hidden'

          }}

        >



        {/* Remote Academic Freeze Banner */}

        {isLockedByProctor && (

          <div

            style={{

              background: 'rgba(239, 68, 68, 0.16)',

              borderBottom: '1px solid var(--danger)',

              color: '#f87171',

              padding: '8px 14px',

              fontSize: '12px',

              fontWeight: 700,

              display: 'flex',

              alignItems: 'center',

              justifyContent: 'space-between',

              gap: '12px'

            }}

          >

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

              <Lock size={14} />

              <span>

                {tabSwitchCount >= 3 || (editorData.metrics?.tabSwitchViolations || 0) >= 3

                  ? 'ACADEMIC FREEZE: Terminal locked due to 3/3 Tab Switch infractions (Alt+Tab / Window blur). Proctor clearance required.'

                  : 'TERMINAL LOCKED BY PROCTOR: Academic freeze active. Editor and code compiler are temporarily frozen.'}

              </span>

            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

              <span className="badge badge-sm badge-danger">FROZEN</span>

              <button

                type="button"

                onClick={() => {

                  playSound('click');

                  setShowEmergencyUnlockPrompt(true);

                  setEmergencyUnlockError(null);

                  setEmergencyUnlockCode('');

                }}

                style={{

                  display: 'inline-flex',

                  alignItems: 'center',

                  gap: '5px',

                  padding: '4px 10px',

                  background: 'var(--bg-elevated)',

                  border: '1px solid var(--border)',

                  borderRadius: '4px',

                  color: 'var(--text-primary)',

                  fontSize: '11px',

                  fontWeight: 600,

                  cursor: 'pointer'

                }}

              >

                <KeyRound size={12} />

                <span>Invigilator Emergency Unlock</span>

              </button>

            </div>

          </div>

        )}



        {/* Registration Mandatory Banner */}

        {!isCandidateRegistered && !isLockedByProctor && (

          <div

            style={{

              background: 'rgba(245, 158, 11, 0.15)',

              borderBottom: '1px solid var(--warning)',

              color: 'var(--warning)',

              padding: '8px 14px',

              fontSize: '12px',

              fontWeight: 700,

              display: 'flex',

              alignItems: 'center',

              justifyContent: 'space-between',

              gap: '8px'

            }}

          >

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

              <AlertTriangle size={14} />

              <span>REGISTRATION MANDATORY: Code editor is locked until you submit your Candidate Full Name and USN.</span>

            </div>

            <button

              className="btn btn-warning btn-sm"

              onClick={() => {

                setIsProfileModalOpen(true);

                playSound('click');

              }}

              style={{ fontSize: '11px', padding: '2px 10px', height: '24px', gap: '5px' }}

            >

              <FileEdit size={12} />

              <span>Complete Registration</span>

            </button>

          </div>

        )}



        {/* Tab-Switch Infraction Escalation Banner */}

        {infractionNotice && (

          <div

            style={{

              background: infractionNotice.strike >= 3 ? 'rgba(239, 68, 68, 0.16)' : 'rgba(245, 158, 11, 0.16)',

              borderBottom: infractionNotice.strike >= 3 ? '1px solid var(--danger)' : '1px solid var(--warning)',

              color: infractionNotice.strike >= 3 ? '#f87171' : 'var(--warning)',

              padding: '8px 14px',

              fontSize: '12px',

              fontWeight: 600,

              display: 'flex',

              alignItems: 'center',

              justifyContent: 'space-between',

              gap: '8px'

            }}

          >

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

              <AlertTriangle size={14} />

              <span>{infractionNotice.message}</span>

            </div>

            {infractionNotice.strike < 3 && (

              <button

                onClick={() => setInfractionNotice(null)}

                style={{

                  background: 'transparent',

                  border: 'none',

                  color: 'inherit',

                  cursor: 'pointer',

                  display: 'flex',

                  alignItems: 'center'

                }}

                title="Acknowledge warning"

              >

                <X size={13} />

              </button>

            )}

          </div>

        )}



        {/* Remote Proctor Warning Notice Banner */}

        {proctorNotice && (

          <div

            style={{

              background: 'var(--danger-bg)',

              borderBottom: '1px solid var(--danger)',

              color: 'var(--danger)',

              padding: '8px 14px',

              fontSize: '12px',

              fontWeight: 600,

              display: 'flex',

              alignItems: 'center',

              justifyContent: 'space-between',

              gap: '8px'

            }}

          >

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

              <ShieldAlert size={14} />

              <span>PROCTOR SURVEILLANCE NOTICE: {proctorNotice}</span>

            </div>

            <button

              onClick={() => setProctorNotice(null)}

              style={{

                background: 'transparent',

                border: 'none',

                color: 'inherit',

                cursor: 'pointer',

                display: 'flex',

                alignItems: 'center'

              }}

              title="Acknowledge alert"

            >

              <X size={13} />

            </button>

          </div>

        )}



        {/* Collapsible Standard Input Drawer */}

        {showStdin && (

          <div

            style={{

              background: 'var(--bg-surface)',

              borderBottom: '1px solid var(--border)',

              padding: '8px 14px',

              display: 'flex',

              flexDirection: 'column',

              gap: '4px'

            }}

          >

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>

                Program Standard Input (stdin)

              </label>

              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>

                Sent to compiler during execution

              </span>

            </div>

            <textarea

              value={stdinInput}

              onChange={(e) => setStdinInput(e.target.value)}

              disabled={isEffectiveLocked}

              placeholder={

                isLockedByProctor

                  ? 'Terminal locked by invigilator - Standard input disabled'

                  : !isCandidateRegistered

                  ? 'Registration mandatory - Standard input disabled'

                  : 'e.g. 5\n10 20 30 40 50'

              }

              rows={2}

              style={{

                width: '100%',

                background: 'var(--bg-elevated)',

                border: '1px solid var(--border)',

                borderRadius: 'var(--radius-sm)',

                padding: '6px 8px',

                color: 'var(--text-primary)',

                fontFamily: 'var(--font-mono)',

                fontSize: '12px',

                outline: 'none',

                resize: isEffectiveLocked ? 'none' : 'vertical',

                opacity: isEffectiveLocked ? 0.6 : 1,

                cursor: isEffectiveLocked ? 'not-allowed' : 'text'

              }}

            />

          </div>

        )}



        {/* Editor Canvas */}

                {/* Practical Problem Statement Banner */}
        {student.assignmentTitle && (
          <div
            style={{
              background: 'var(--bg-surface)',
              borderBottom: '1px solid var(--border)',
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexShrink: 0
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <Code2 size={13} color="var(--accent)" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
                    Practical Problem
                  </span>
                  <span className="badge badge-sm badge-neutral" style={{ fontSize: '10px', padding: '0 5px', height: '18px' }}>
                    {student.course || student.examType}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                  title={student.assignmentTitle}
                >
                  {student.assignmentTitle}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleRunAllTests}
                disabled={isRunningTests || isEffectiveLocked}
                style={{
                  height: '26px',
                  padding: '0 10px',
                  fontSize: '11px',
                  gap: '5px',
                  fontWeight: 600
                }}
                title="Execute code against all problem test cases"
              >
                {isRunningTests ? (
                  <RefreshCw size={11} className="spinner-icon" />
                ) : (
                  <Play size={11} />
                )}
                <span>Run Tests ({testCases.length})</span>
              </button>
            </div>
          </div>
        )}

<div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>

          <CodeEditor

            key={sessionStartTime}

            initialCode={editorData.code}

            initialLanguage={editorData.language}

            selectedLanguage={editorData.language}

            onSelectLanguage={(newLang: string) =>

              setEditorData((prev: CodeSubmission) => ({ ...prev, language: newLang }))

            }

            initialMetrics={editorData.metrics}

            isPasteBlocked={isPasteBlocked}

            isExamSubmitted={isExamSubmitted}

            isLockedByProctor={isLockedByProctor}

            isRegistrationRequired={!isCandidateRegistered}

            onOpenRegistration={() => setIsProfileModalOpen(true)}

            onTogglePasteBlock={() => setIsPasteBlocked(!isPasteBlocked)}

            student={student}

            onUpdateStudent={handleUpdateStudent}

            onChange={handleEditorChange}

            theme={theme}

          />

        </div>



        {/* Ã¢â€â‚¬Ã¢â€â‚¬ RIGHT PANE: CONSOLE OUTPUT, WRITING ACTIVITY, VIVA Ã¢â€â‚¬Ã¢â€â‚¬ */}

      {isRightPaneOpen && (

        <div

          className="workspace-right-pane"

          style={{

            flex: 1,

            display: 'flex',

            flexDirection: 'column',

            minWidth: 0,

            background: 'var(--bg-main)',

            overflow: 'hidden'

          }}

        >

          {/* Tab Controls */}

          <div

            style={{

              height: '44px',

              minHeight: '44px',

              background: 'var(--bg-elevated)',

              borderBottom: '1px solid var(--border)',

              display: 'flex',

              alignItems: 'center',

              justifyContent: 'space-between',

              padding: '0 12px',

              flexShrink: 0

            }}

          >

            <ContinuousTabs

              layoutId="workspace-diagnostic-tabs"

              size="sm"

              activeId={activeTab}

              onChange={(id: string) => {

                playSound('click');

                setActiveTab(id as 'terminal' | 'testcases' | 'telemetry' | 'viva');

              }}

              tabs={[

                {

                  id: 'terminal',

                  label: 'Console & Compiler',

                  icon: <Terminal size={13} />

                },
                {
                  id: 'testcases',
                  label: 'Test Cases',
                  icon: <CheckCircle2 size={13} />,
                  badge: testCasesSummary ? `${testCasesSummary.totalPassed}/${testCasesSummary.totalCount}` : `${testCases.length}`,
                  badgeTone: testCasesSummary ? (testCasesSummary.allPassed ? 'success' : 'warning') : undefined
                },

                {

                  id: 'telemetry',

                  label: 'Typing Forensics',

                  icon: <Activity size={13} />,

                  badge: editorData.metrics.pasteRatio > 0 ? `${editorData.metrics.pasteRatio}%` : undefined,

                  badgeTone: editorData.metrics.pasteRatio >= 50 ? 'danger' : 'warning'

                },

                {

                  id: 'viva',

                  label: 'Viva Oral Defense',

                  icon: <MessageSquare size={13} />,

                  badge: vivaEvaluation ? `${vivaEvaluation.score}/100` : undefined,

                  badgeTone: 'success'

                }

              ]}

            />



            {/* Action buttons: Report (shown ONLY after code is executed), Clear Console, and Close Panel */}

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>

              {(compilerResult || analysisResults) && (

                <button

                  className="btn btn-secondary btn-sm"

                  onClick={handleOpenReport}

                  disabled={isEffectiveLocked}

                  style={{

                    color: isEffectiveLocked ? 'var(--text-muted)' : 'var(--accent)',

                    borderColor: isEffectiveLocked ? 'var(--border)' : 'var(--accent)',

                    fontWeight: 600,

                    opacity: isEffectiveLocked ? 0.6 : 1,

                    cursor: isEffectiveLocked ? 'not-allowed' : 'pointer'

                  }}

                  title={

                    isLockedByProctor

                      ? 'Terminal locked by proctor'

                      : !isCandidateRegistered

                      ? 'Registration mandatory before generating report'

                      : 'Open the official Invigilator Anti-Cheating and Marks Report'

                  }

                >

                  <FileText size={13} />

                  <span>View Report</span>

                </button>

              )}



              <button

                className="btn btn-ghost btn-sm"

                onClick={onClearTerminal}

                disabled={isEffectiveLocked}

                style={{ opacity: isEffectiveLocked ? 0.6 : 1, cursor: isEffectiveLocked ? 'not-allowed' : 'pointer' }}

                title="Clear Console"

              >

                <Trash2 size={13} />

              </button>



              <button

                className="btn btn-ghost btn-sm"

                onClick={() => setIsRightPaneOpen(false)}

                disabled={isEffectiveLocked}

                style={{

                  height: '28px',

                  width: '28px',

                  padding: 0,

                  display: 'inline-flex',

                  alignItems: 'center',

                  justifyContent: 'center',

                  color: 'var(--text-secondary)',

                  borderRadius: 'var(--radius-sm)'

                }}

                title="Hide Console & Diagnostics Panel (Esc or Ctrl+`)"

              >

                <X size={14} />

              </button>

            </div>

          </div>



        {/* Tab 1: Real Console & Compiler Output */}

        {activeTab === 'terminal' && (

          <div

            style={{

              flex: 1,

              display: 'flex',

              flexDirection: 'column',

              background: 'var(--bg-main)',

              overflow: 'hidden'

            }}

          >

            {/* Compiler Stats Bar if executed */}

            {compilerResult && (

              <div

                style={{

                  padding: '6px 14px',

                  background: 'var(--bg-surface)',

                  borderBottom: '1px solid var(--border)',

                  display: 'flex',

                  alignItems: 'center',

                  justifyContent: 'space-between',

                  fontSize: '11px',

                  color: 'var(--text-secondary)'

                }}

              >

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>

                  <MetricTag

                    icon={compilerResult.isError ? <AlertTriangle size={10} /> : <CheckCircle2 size={10} />}

                    value={compilerResult.statusDescription.toUpperCase()}

                    tone={compilerResult.isError ? 'danger' : 'success'}

                  />

                  <MetricTag label="ENGINE" value={compilerResult.engineUsed} tone="neutral" />

                </div>



                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>

                  <MetricTag label="TIME" value={compilerResult.time} tone="neutral" />

                  <MetricTag label="MEM" value={`${compilerResult.memory} KB`} tone="neutral" />

                  <MetricTag

                    label="EXIT"

                    value={compilerResult.exitCode}

                    tone={compilerResult.exitCode === 0 ? 'success' : 'danger'}

                  />

                </div>

              </div>

            )}



            <div

              style={{

                flex: 1,

                overflowY: 'auto',

                padding: '16px',

                fontFamily: 'var(--font-mono)',

                fontSize: '12.5px',

                display: 'flex',

                flexDirection: 'column',

                gap: '4px'

              }}

            >

              {executionHistory.length === 0 && !isExecuting && (

                <div

                  style={{

                    display: 'flex',

                    flexDirection: 'column',

                    alignItems: 'flex-start',

                    color: 'var(--text-muted)',

                    gap: '6px',

                    marginTop: '8px'

                  }}

                >

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>

                    <span style={{ color: 'var(--accent)' }}>&gt;</span>

                    <span>Ready for execution. Click "Run Program" to compile and run.</span>

                  </div>

                  <div style={{ fontSize: '11.5px', color: 'var(--text-dim)' }}>

                    Runs real Python, C++, C, Java, JavaScript, TypeScript, Go, Rust, and more on Judge0 CE cloud compilers.

                  </div>

                </div>

              )}



              {executionHistory.map((item, idx) => (

                <span key={idx} className={`terminal-line ${item.type}`}>

                  {item.text}

                </span>

              ))}



              {/* Running Status */}

              {isExecuting && (

                <div

                  style={{

                    display: 'flex',

                    alignItems: 'center',

                    gap: '8px',

                    color: 'var(--warning)',

                    fontSize: '12px',

                    marginTop: '6px'

                  }}

                >

                  <RefreshCw size={12} className="spinner-icon" />

                  <span>Compiling and executing code on server...</span>

                </div>

              )}



              <div ref={terminalEndRef} />

            </div>

          </div>

        )}



        {/* Tab 2: Typing Activity & Telemetry */}

                {/* Tab: Real Practical Test Cases Runner */}
        {activeTab === 'testcases' && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-main)',
              overflow: 'hidden'
            }}
          >
            {/* Test Cases Top Action Bar */}
            <div
              style={{
                padding: '8px 14px',
                background: 'var(--bg-surface)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                flexShrink: 0
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleRunAllTests}
                  disabled={isRunningTests || isEffectiveLocked}
                  style={{
                    height: '28px',
                    padding: '0 10px',
                    fontSize: '11px',
                    gap: '5px',
                    fontWeight: 600
                  }}
                  title="Run program against all test cases"
                >
                  {isRunningTests ? (
                    <RefreshCw size={12} className="spinner-icon" />
                  ) : (
                    <Play size={12} />
                  )}
                  <span>{isRunningTests ? 'Evaluating...' : 'Run All Tests'}</span>
                </button>

                <div
                  className={`badge ${
                    testCasesSummary
                      ? testCasesSummary.allPassed
                        ? 'badge-success'
                        : 'badge-warning'
                      : 'badge-neutral'
                  }`}
                  style={{
                    height: '26px',
                    padding: '0 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    gap: '4px'
                  }}
                >
                  {testCasesSummary ? (
                    testCasesSummary.allPassed ? (
                      <CheckCircle2 size={11} />
                    ) : (
                      <AlertTriangle size={11} />
                    )
                  ) : (
                    <CheckCircle2 size={11} />
                  )}
                  <span>
                    {testCasesSummary
                      ? `${testCasesSummary.totalPassed}/${testCasesSummary.totalCount} Passed (${testCasesSummary.scorePercentage}%)`
                      : `${testCases.length} Test Cases Ready`}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleAddTestCase}
                  disabled={isEffectiveLocked}
                  style={{
                    height: '28px',
                    padding: '0 8px',
                    fontSize: '11px',
                    gap: '4px'
                  }}
                  title="Add a custom test case"
                >
                  <Plus size={12} />
                  <span>Add Case</span>
                </button>
              </div>
            </div>

            {/* Test Case Tab Pill Selector */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                background: 'var(--bg-elevated)',
                borderBottom: '1px solid var(--border)',
                overflowX: 'auto',
                flexShrink: 0
              }}
            >
              {testCases.map((tc, idx) => {
                const isSelected = selectedTestCaseIdx === idx;
                const isPassed = tc.passed === true;
                const isFailed = tc.passed === false;

                return (
                  <button
                    key={tc.id || idx}
                    onClick={() => {
                      setSelectedTestCaseIdx(idx);
                      playSound('click');
                    }}
                    style={{
                      height: '26px',
                      padding: '0 10px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: isSelected ? 700 : 500,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      border: isSelected ? '1px solid var(--border-strong)' : '1px solid var(--border)',
                      background: isSelected ? 'var(--bg-surface)' : 'transparent',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {isPassed ? (
                      <CheckCircle2 size={11} color="var(--success)" />
                    ) : isFailed ? (
                      <AlertTriangle size={11} color="var(--danger)" />
                    ) : (
                      <div
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: 'var(--text-muted)'
                        }}
                      />
                    )}
                    <span>{tc.name || `Case ${idx + 1}`}</span>
                    {testCases.length > 1 && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTestCase(idx);
                        }}
                        style={{
                          marginLeft: '2px',
                          color: 'var(--text-dim)',
                          cursor: 'pointer',
                          display: 'inline-flex'
                        }}
                        title="Delete test case"
                      >
                        <X size={10} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Test Case Detail Pane */}
            {testCases[selectedTestCaseIdx] && (
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                {/* Result Status Banner if executed */}
                {testCases[selectedTestCaseIdx].passed !== undefined && (
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: testCases[selectedTestCaseIdx].passed
                        ? '1px solid var(--success)'
                        : '1px solid var(--danger)',
                      background: testCases[selectedTestCaseIdx].passed
                        ? 'rgba(34, 197, 94, 0.08)'
                        : 'rgba(239, 68, 68, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11.5px',
                      fontWeight: 600
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {testCases[selectedTestCaseIdx].passed ? (
                        <>
                          <CheckCircle2 size={13} color="var(--success)" />
                          <span style={{ color: 'var(--success)' }}>Test Case Passed</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={13} color="var(--danger)" />
                          <span style={{ color: 'var(--danger)' }}>Test Case Failed Ã¢â‚¬â€ Output Mismatch</span>
                        </>
                      )}
                    </div>
                    {testCases[selectedTestCaseIdx].time && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        Time: {testCases[selectedTestCaseIdx].time}
                      </span>
                    )}
                  </div>
                )}

                {/* Case Name Input */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Test Case Name
                  </label>
                  <input
                    type="text"
                    value={testCases[selectedTestCaseIdx].name || ''}
                    onChange={(e) => handleUpdateTestCase(selectedTestCaseIdx, 'name', e.target.value)}
                    disabled={isEffectiveLocked}
                    className="input input-sm"
                    style={{
                      fontSize: '12px',
                      height: '28px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0 8px',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>

                {/* Input (stdin) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Standard Input (stdin)
                    </label>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      Passed to program input stream
                    </span>
                  </div>
                  <textarea
                    value={testCases[selectedTestCaseIdx].input || ''}
                    onChange={(e) => handleUpdateTestCase(selectedTestCaseIdx, 'input', e.target.value)}
                    disabled={isEffectiveLocked}
                    placeholder="e.g. 5&#10;10 20 30 40 50"
                    rows={3}
                    style={{
                      width: '100%',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11.5px',
                      outline: 'none',
                      resize: 'vertical'
                    }}
                  />
                </div>

                {/* Expected Output */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Expected Output (stdout)
                    </label>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      Required program return
                    </span>
                  </div>
                  <textarea
                    value={testCases[selectedTestCaseIdx].expectedOutput || ''}
                    onChange={(e) => handleUpdateTestCase(selectedTestCaseIdx, 'expectedOutput', e.target.value)}
                    disabled={isEffectiveLocked}
                    placeholder="e.g. 150"
                    rows={2}
                    style={{
                      width: '100%',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11.5px',
                      outline: 'none',
                      resize: 'vertical'
                    }}
                  />
                </div>

                {/* Actual Output */}
                {testCases[selectedTestCaseIdx].actualOutput !== undefined && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Actual Program Output
                    </label>
                    <div
                      style={{
                        padding: '8px 10px',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11.5px',
                        color: testCases[selectedTestCaseIdx].passed ? 'var(--text-primary)' : 'var(--danger)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        minHeight: '36px'
                      }}
                    >
                      {testCases[selectedTestCaseIdx].actualOutput || '(No output produced)'}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

{activeTab === 'telemetry' && (

          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>

            <BehaviorPanel

              metrics={editorData.metrics}

              analysisReport={analysisResults}

              snapshots={editorData.snapshots}

              currentCode={editorData.code}

            />

          </div>

        )}



        {/* Tab 3: Viva Oral Defense */}

        {activeTab === 'viva' && (

          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>

            <AutoViva

              code={editorData.code}

              language={editorData.language}

              analysisReport={analysisResults}

              onVivaComplete={onVivaComplete}

              isLocked={isEffectiveLocked}

            />

          </div>

        )}

      </div>

    )}

      </div>

    </div>



      {/* Ã¢â€â‚¬Ã¢â€â‚¬ CANDIDATE PROFILE & LAB WORKSTATION REGISTRATION MODAL Ã¢â€â‚¬Ã¢â€â‚¬ */}

      {isProfileModalOpen && (

        <div

          style={{

            position: 'fixed',

            inset: 0,

            zIndex: 100000,

            background: 'rgba(0, 0, 0, 0.78)',

            backdropFilter: 'blur(5px)',

            display: 'flex',

            alignItems: 'center',

            justifyContent: 'center',

            padding: '16px'

          }}

          onClick={() => {

            if (isCandidateRegistered) {

              setIsProfileModalOpen(false);

            } else {

              setRegValidationError('Candidate registration is mandatory to unlock the workstation. Please enter your Full Name and USN.');

              playSound('warning');

            }

          }}

        >

          <div

            className="card-elevated registration-modal-content"

            style={{

              width: '100%',

              maxWidth: '640px',

              boxSizing: 'border-box',

              background: 'var(--bg-surface)',

              border: '1px solid var(--border-strong)',

              borderRadius: 'var(--radius-md)',

              padding: '24px',

              display: 'flex',

              flexDirection: 'column',

              gap: '16px',

              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.7)'

            }}

            onClick={(e) => e.stopPropagation()}

          >

            {/* Modal Header */}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>

              <div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>

                  <UserCheck size={18} color="var(--accent)" />

                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>

                    Candidate Examination Registration

                  </h3>

                  {!isCandidateRegistered && (

                    <span className="badge badge-warning badge-sm" style={{ gap: '4px' }}>

                      <Lock size={10} />

                      <span>Registration Required</span>

                    </span>

                  )}

                </div>

                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>

                  {!isCandidateRegistered

                    ? 'Registration is mandatory before beginning the practical exam. Enter your credentials to unlock.'

                    : 'Manage candidate credentials and examination details.'}

                </p>

              </div>



              {isCandidateRegistered && (

                <button

                  className="btn btn-ghost btn-sm"

                  onClick={() => setIsProfileModalOpen(false)}

                  style={{ padding: '4px', height: '26px', width: '26px' }}

                  title="Close modal"

                >

                  <X size={14} />

                </button>

              )}

            </div>



            {/* Validation Error Alert */}

            {regValidationError && (

              <div

                style={{

                  background: 'rgba(239, 68, 68, 0.14)',

                  border: '1px solid var(--danger)',

                  borderRadius: 'var(--radius-xs)',

                  padding: '8px 12px',

                  display: 'flex',

                  alignItems: 'center',

                  gap: '8px',

                  fontSize: '11.5px',

                  color: '#f87171',

                  fontWeight: 600

                }}

              >

                <AlertTriangle size={14} style={{ flexShrink: 0 }} />

                <span>{regValidationError}</span>

              </div>

            )}



            {/* Registration Mode Switcher: Manual vs Token */}

            <div

              style={{

                display: 'flex',

                gap: '4px',

                background: 'var(--bg-elevated)',

                padding: '3px',

                borderRadius: 'var(--radius-sm)',

                border: '1px solid var(--border)'

              }}

            >

              <button

                type="button"

                onClick={() => {

                  setRegMode('manual');

                  setRegValidationError(null);

                  playSound('click');

                }}

                className="btn btn-sm"

                style={{

                  flex: 1,

                  height: '30px',

                  fontSize: '12px',

                  background: regMode === 'manual' ? 'var(--bg-surface)' : 'transparent',

                  border: regMode === 'manual' ? '1px solid var(--border-strong)' : '1px solid transparent',

                  color: regMode === 'manual' ? 'var(--text-primary)' : 'var(--text-muted)',

                  fontWeight: regMode === 'manual' ? 700 : 500,

                  gap: '6px'

                }}

              >

                <UserCheck size={13} />

                <span>Manual Registration</span>

              </button>



              <button

                type="button"

                onClick={() => {

                  setRegMode('token');

                  setRegValidationError(null);

                  playSound('click');

                }}

                className="btn btn-sm"

                style={{

                  flex: 1,

                  height: '30px',

                  fontSize: '12px',

                  background: regMode === 'token' ? 'var(--bg-surface)' : 'transparent',

                  border: regMode === 'token' ? '1px solid var(--border-strong)' : '1px solid transparent',

                  color: regMode === 'token' ? 'var(--text-primary)' : 'var(--text-muted)',

                  fontWeight: regMode === 'token' ? 700 : 500,

                  gap: '6px'

                }}

              >

                <KeyRound size={13} />

                <span>Import with Token</span>

                <span

                  className="badge badge-neutral"

                  style={{

                    fontSize: '9.5px',

                    padding: '1px 6px',

                    fontWeight: 700,

                    letterSpacing: '0.04em'

                  }}

                >

                  Upcoming

                </span>

              </button>

            </div>



            {/* Ã¢â€â‚¬Ã¢â€â‚¬ MODE 1: MANUAL REGISTRATION FORM Ã¢â€â‚¬Ã¢â€â‚¬ */}

            {regMode === 'manual' && (

              <>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', width: '100%' }}>

                  <div style={{ gridColumn: 'span 2', minWidth: 0 }}>

                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>

                      Candidate Full Name *

                    </label>

                    <input

                      type="text"

                      placeholder="Enter Candidate Full Name"

                      value={student.name}

                      onChange={(e) => {

                        setStudent({ ...student, name: e.target.value });

                        if (regValidationError) setRegValidationError(null);

                      }}

                      autoFocus

                      style={{

                        width: '100%',

                        boxSizing: 'border-box',

                        background: 'var(--bg-elevated)',

                        border: regValidationError && !student.name.trim() ? '1.5px solid var(--danger)' : '1px solid var(--border)',

                        borderRadius: 'var(--radius-sm)',

                        padding: '8px 12px',

                        color: 'var(--text-primary)',

                        fontSize: '12.5px',

                        outline: 'none'

                      }}

                    />

                  </div>



                  <div style={{ minWidth: 0 }}>

                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>

                      USN / Roll Number *

                    </label>

                    <input

                      type="text"

                      placeholder="Enter USN / Roll Number"

                      value={student.rollNumber}

                      onChange={(e) => {

                        setStudent({ ...student, rollNumber: e.target.value });

                        if (regValidationError) setRegValidationError(null);

                      }}

                      style={{

                        width: '100%',

                        boxSizing: 'border-box',

                        background: 'var(--bg-elevated)',

                        border: regValidationError && !student.rollNumber.trim() ? '1.5px solid var(--danger)' : '1px solid var(--border)',

                        borderRadius: 'var(--radius-sm)',

                        padding: '8px 12px',

                        color: 'var(--text-primary)',

                        fontSize: '12.5px',

                        fontFamily: 'var(--font-mono)',

                        outline: 'none'

                      }}

                    />

                  </div>



                  <div style={{ minWidth: 0 }}>

                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>

                      Evaluation / Exam Category *

                    </label>

                    <SimpleSelect<ExamCategory>

                      value={student.examType}

                      onChange={(newType) => {

                        const isMcq = newType === 'Multiple Choice Question (MCQ) Examination';

                        const ex = isMcq && publishedMcqExams.length > 0 ? publishedMcqExams.find(e => e.id === selectedMcqExamId) || publishedMcqExams[0] : null;

                        setStudent({

                          ...student,

                          examType: newType,

                          examMode: isMcq ? 'MCQ' : 'CODING',

                          assignmentTitle: ex ? ex.title : student.assignmentTitle,

                          examDurationMinutes: ex ? ex.durationMinutes : student.examDurationMinutes

                        });

                        if (ex) {

                          setSelectedMcqExamId(ex.id);

                        }

                      }}

                      options={[

                        { value: 'Multiple Choice Question (MCQ) Examination', label: 'Multiple Choice Question (MCQ) Examination', badge: 'MCQ' },

                        { value: 'Internal Assessment (CIE)', label: 'Internal Assessment (CIE) - Coding', badge: 'CODING' },

                        { value: 'Semester End Exam (SEE)', label: 'Semester End Exam (SEE) - Coding', badge: 'CODING' },

                        { value: 'Weekly Lab Practical', label: 'Weekly Lab Practical - Coding', badge: 'CODING' },

                        { value: 'Coding Hackathon / Contest', label: 'Coding Hackathon / Contest', badge: 'CONTEST' },

                        { value: 'Project Viva & Defense', label: 'Project Viva & Defense', badge: 'VIVA' }

                      ]}

                      size="md"

                    />

                  </div>



                  {student.examType === 'Multiple Choice Question (MCQ) Examination' && (

                    <div style={{ gridColumn: 'span 2', minWidth: 0 }}>

                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>

                        Select Published MCQ Exam *

                      </label>

                      {publishedMcqExams.length > 0 ? (

                        <SimpleSelect<string>

                          value={selectedMcqExamId}

                          onChange={(id) => {

                            setSelectedMcqExamId(id);

                            const ex = publishedMcqExams.find((e) => e.id === id);

                            if (ex) {

                              setStudent({

                                ...student,

                                assignmentTitle: ex.title,

                                examDurationMinutes: ex.durationMinutes,

                                course: ex.subject || student.course

                              });

                            }

                          }}

                          options={publishedMcqExams.map((ex) => ({

                            value: ex.id,

                            label: `${ex.title} (${ex.questionCount} Questions Ã‚Â· ${ex.durationMinutes} Min Ã‚Â· ${ex.totalMarks} Marks)`,

                            badge: ex.subject || 'MCQ'

                          }))}

                          size="md"

                        />

                      ) : (

                        <div style={{ padding: '8px 12px', background: 'var(--bg-elevated)', border: '1px dashed var(--warning-border)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '8px' }}>

                          <AlertTriangle size={14} />

                          <span>No published MCQ exams yet. You will be redirected to the MCQ Hub to take or create an exam.</span>

                        </div>

                      )}

                    </div>

                  )}



                  <div style={{ minWidth: 0 }}>

                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>

                      Assigned College Laboratory (Room) *

                    </label>

                    <SimpleSelect<string>

                      value={student.labId || 'LAB-01'}

                      onChange={(newLabId) => {

                        const allLabs = getAllCollegeLabs();

                        const lab = allLabs.find((l) => l.labId === newLabId);

                        setStudent({

                          ...student,

                          labId: newLabId,

                          labName: lab?.labName || newLabId,

                          department: lab?.department || student.department

                        });

                      }}

                      options={(() => {

                        const allLabs = getAllCollegeLabs();

                        if (allLabs.length > 0) {

                          return allLabs.map((lab) => ({

                            value: lab.labId,

                            label: `${lab.labId}: ${lab.labName} (${lab.department})`,

                            badge: lab.labCode

                          }));

                        }

                        return [

                          {

                            value: student.labId || 'LAB-01',

                            label: student.labId ? `Laboratory ${student.labId}` : 'Main Computer Laboratory',

                            badge: student.labId || 'LAB-01'

                          }

                        ];

                      })()}

                      searchable

                      size="md"

                    />

                  </div>



                  <div style={{ minWidth: 0 }}>

                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>

                      Exam Session Duration (Timer Limit)

                    </label>

                    <SimpleSelect<number>

                      value={student.examDurationMinutes !== undefined ? student.examDurationMinutes : 90}

                      onChange={(mins) => {

                        setStudent({ ...student, examDurationMinutes: mins });

                        setExamDurationMinutes(mins);

                      }}

                      options={[

                        { value: 90, label: '90 Minutes (Standard Lab CIE Practical)' },

                        { value: 60, label: '60 Minutes (1 Hour Test)' },

                        { value: 45, label: '45 Minutes (Short Quiz / Assessment)' },

                        { value: 120, label: '120 Minutes (2 Hours Assessment)' },

                        { value: 180, label: '180 Minutes (3 Hours SEE Final Exam)' },

                        { value: 0, label: 'Unlimited Time (Practice Mode)' }

                      ]}

                      size="md"

                    />

                  </div>



                  <div style={{ minWidth: 0 }}>

                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>

                      Workstation PC ID *

                    </label>

                    <input

                      type="text"

                      placeholder="e.g. Station #01"

                      value={student.stationNumber || 'Station #01'}

                      onChange={(e) => setStudent({ ...student, stationNumber: e.target.value })}

                      style={{

                        width: '100%',

                        boxSizing: 'border-box',

                        background: 'var(--bg-elevated)',

                        border: '1px solid var(--border)',

                        borderRadius: 'var(--radius-sm)',

                        padding: '8px 12px',

                        color: 'var(--text-primary)',

                        fontSize: '12px',

                        outline: 'none'

                      }}

                    />

                  </div>



                  <div style={{ minWidth: 0 }}>

                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>

                      Department / Branch

                    </label>

                    <input

                      type="text"

                      placeholder="e.g. Computer Science & Eng"

                      value={student.department}

                      onChange={(e) => setStudent({ ...student, department: e.target.value })}

                      style={{

                        width: '100%',

                        boxSizing: 'border-box',

                        background: 'var(--bg-elevated)',

                        border: '1px solid var(--border)',

                        borderRadius: 'var(--radius-sm)',

                        padding: '8px 12px',

                        color: 'var(--text-primary)',

                        fontSize: '12px',

                        outline: 'none'

                      }}

                    />

                  </div>



                  <div style={{ gridColumn: 'span 2', minWidth: 0 }}>

                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>

                      Practical Assignment / Subject Title

                    </label>

                    <input

                      type="text"

                      placeholder="e.g. Data Structures & Algorithms Lab Exam"

                      value={student.assignmentTitle || ''}

                      onChange={(e) => setStudent({ ...student, assignmentTitle: e.target.value })}

                      style={{

                        width: '100%',

                        boxSizing: 'border-box',

                        background: 'var(--bg-elevated)',

                        border: '1px solid var(--border)',

                        borderRadius: 'var(--radius-sm)',

                        padding: '8px 12px',

                        color: 'var(--text-primary)',

                        fontSize: '12px',

                        outline: 'none'

                      }}

                    />

                  </div>

                </div>



                {/* OR Quick Token Import Divider */}

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '2px 0' }}>

                  <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />

                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em' }}>

                    OR QUICK IMPORT WITH TOKEN

                  </span>

                  <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />

                </div>



                <button

                  type="button"

                  onClick={() => {

                    setRegMode('token');

                    setRegValidationError(null);

                    playSound('click');

                  }}

                  className="btn btn-secondary btn-sm"

                  style={{

                    width: '100%',

                    height: '32px',

                    fontSize: '11.5px',

                    justifyContent: 'center',

                    gap: '6px'

                  }}

                >

                  <KeyRound size={12} color="var(--accent)" />

                  <span>Have an Exam Pass Token? Switch to Token Auto-Fill (Upcoming Feature) Ã¢â€ â€™</span>

                </button>



                {/* Modal Actions (Manual Form) */}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>

                  <div>

                    {!isCandidateRegistered && (

                      <span className="badge badge-warning" style={{ fontSize: '11px', gap: '4px' }}>

                        <Lock size={10} />

                        <span>Workstation Locked</span>

                      </span>

                    )}

                  </div>



                  <div style={{ display: 'flex', gap: '8px' }}>

                    {isCandidateRegistered && (

                      <button

                        className="btn btn-ghost btn-sm"

                        onClick={() => setIsProfileModalOpen(false)}

                      >

                        Cancel

                      </button>

                    )}

                    <button

                      className="btn btn-primary btn-sm"

                      onClick={() => {

                        const trimmedName = student.name?.trim();

                        const trimmedRoll = student.rollNumber?.trim();

                        if (!trimmedName || !trimmedRoll) {

                          setRegValidationError('Candidate Full Name and USN / Roll Number are mandatory to unlock.');

                          playSound('warning');

                          return;

                        }

                        setRegValidationError(null);

                        const isMcq = student.examType === 'Multiple Choice Question (MCQ) Examination' || student.examMode === 'MCQ';

                        const updatedInfo: StudentInfo = {

                          ...student,

                          name: trimmedName,

                          rollNumber: trimmedRoll,

                          examDurationMinutes: examDurationMinutes,

                          sessionStartTime: sessionStartTime,

                          examMode: isMcq ? 'MCQ' : 'CODING',

                          mcqExamId: isMcq ? selectedMcqExamId : undefined

                        };

                        handleUpdateStudent(updatedInfo);

                        setIsProfileModalOpen(false);

                        playSound('success');



                        if (isMcq) {

                          try {

                            localStorage.setItem('codedna_active_exam_mode', 'MCQ');

                          } catch {}

                          const targetExamId = selectedMcqExamId || student.mcqExamId;

                          navigate(targetExamId ? `/mcq?examId=${targetExamId}` : '/mcq');

                        } else {

                          try {

                            localStorage.setItem('codedna_active_exam_mode', 'CODING');

                          } catch {}

                        }

                      }}

                      style={{ padding: '6px 18px', gap: '6px' }}

                    >

                      <Check size={13} />

                      <span>{student.examType === 'Multiple Choice Question (MCQ) Examination' ? 'Start MCQ Examination' : 'Save Credentials & Unlock'}</span>

                    </button>

                  </div>

                </div>

              </>

            )}



            {/* Ã¢â€â‚¬Ã¢â€â‚¬ MODE 2: IMPORT WITH TOKEN (UPCOMING FEATURE) Ã¢â€â‚¬Ã¢â€â‚¬ */}

            {regMode === 'token' && (

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%' }}>

                {/* Feature Description Card */}

                <div

                  style={{

                    background: 'var(--bg-elevated)',

                    border: '1px solid var(--border)',

                    borderRadius: 'var(--radius-sm)',

                    padding: '12px 14px',

                    display: 'flex',

                    flexDirection: 'column',

                    gap: '6px'

                  }}

                >

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>

                      <KeyRound size={14} color="var(--accent)" />

                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>

                        Automated Exam Token Ingestion

                      </span>

                    </div>

                    <span className="badge badge-neutral" style={{ fontSize: '9.5px', padding: '1px 6px', fontWeight: 700 }}>

                      Upcoming Feature

                    </span>

                  </div>

                  <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: '1.45' }}>

                    Import an encrypted Axent exam token, department QR payload, or admit string. All candidate fields, assigned room, session duration, and subject will be validated and auto-filled automatically.

                  </p>

                </div>



                {/* Token Input Box */}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>

                      Exam Pass / QR Token Payload *

                    </label>

                    {tokenInput && (

                      <button

                        type="button"

                        onClick={() => {

                          setTokenInput('');

                          setTokenParseResult(null);

                        }}

                        className="btn btn-ghost btn-sm"

                        style={{ height: '22px', padding: '0 8px', fontSize: '10.5px' }}

                      >

                        Clear

                      </button>

                    )}

                  </div>



                  <textarea

                    rows={3}

                    placeholder="Paste token here (e.g. CDNA-TK-eyJhbGciOi... or raw JSON payload)"

                    value={tokenInput}

                    onChange={(e) => {

                      const val = e.target.value;

                      setTokenInput(val);

                      if (val.trim()) {

                        const res = parseExamToken(val);

                        setTokenParseResult(res);

                        if (res.success && regValidationError) {

                          setRegValidationError(null);

                        }

                      } else {

                        setTokenParseResult(null);

                      }

                    }}

                    autoFocus

                    style={{

                      width: '100%',

                      boxSizing: 'border-box',

                      background: 'var(--bg-elevated)',

                      border: tokenInput.trim() && !tokenParseResult?.success

                        ? '1.5px solid var(--danger)'

                        : tokenParseResult?.success

                        ? '1.5px solid var(--success-border)'

                        : '1px solid var(--border)',

                      borderRadius: 'var(--radius-sm)',

                      padding: '8px 12px',

                      color: 'var(--text-primary)',

                      fontSize: '11.5px',

                      fontFamily: 'var(--font-mono)',

                      resize: 'none',

                      outline: 'none',

                      lineHeight: '1.4'

                    }}

                  />

                </div>



                {/* Token Parse Preview Card */}

                {tokenParseResult?.success && tokenParseResult.data && (

                  <div

                    style={{

                      background: 'var(--bg-elevated)',

                      border: '1px solid var(--border-strong)',

                      borderRadius: 'var(--radius-sm)',

                      padding: '12px 14px',

                      display: 'flex',

                      flexDirection: 'column',

                      gap: '8px'

                    }}

                  >

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>

                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '5px' }}>

                        <CheckCircle2 size={13} color="var(--success)" />

                        <span>Verified Token Payload Ã¢â‚¬â€ Ready to Fill</span>

                      </span>

                      <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>

                        {tokenParseResult.meta?.issuer || 'Invigilator Authority'}

                      </span>

                    </div>



                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', fontSize: '11.5px' }}>

                      <div>

                        <span style={{ color: 'var(--text-muted)' }}>Candidate: </span>

                        <strong style={{ color: 'var(--text-primary)' }}>{tokenParseResult.data.name || 'N/A'}</strong>

                      </div>

                      <div>

                        <span style={{ color: 'var(--text-muted)' }}>USN / Roll: </span>

                        <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{tokenParseResult.data.rollNumber || 'N/A'}</strong>

                      </div>

                      <div>

                        <span style={{ color: 'var(--text-muted)' }}>Assigned Lab: </span>

                        <strong style={{ color: 'var(--text-primary)' }}>{tokenParseResult.data.labId || 'LAB-01'}</strong>

                      </div>

                      <div>

                        <span style={{ color: 'var(--text-muted)' }}>Duration: </span>

                        <strong style={{ color: 'var(--text-primary)' }}>{tokenParseResult.data.examDurationMinutes !== undefined ? `${tokenParseResult.data.examDurationMinutes} Mins` : '90 Mins'}</strong>

                      </div>

                      <div style={{ gridColumn: 'span 2' }}>

                        <span style={{ color: 'var(--text-muted)' }}>Assignment / Subject: </span>

                        <strong style={{ color: 'var(--text-primary)' }}>{tokenParseResult.data.assignmentTitle || tokenParseResult.data.course || 'Practical Exam Evaluation'}</strong>

                      </div>

                    </div>

                  </div>

                )}



                {tokenInput.trim() && !tokenParseResult?.success && (

                  <div

                    style={{

                      padding: '8px 12px',

                      background: 'rgba(239, 68, 68, 0.1)',

                      border: '1px solid var(--danger-border)',

                      borderRadius: 'var(--radius-xs)',

                      fontSize: '11px',

                      color: '#f87171',

                      display: 'flex',

                      alignItems: 'center',

                      gap: '6px'

                    }}

                  >

                    <AlertTriangle size={12} style={{ flexShrink: 0 }} />

                    <span>{tokenParseResult?.error || 'Invalid token format. Please check your credentials.'}</span>

                  </div>

                )}



                {/* Modal Actions (Token Mode) */}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>

                  <div>

                    {!isCandidateRegistered && (

                      <span className="badge badge-warning" style={{ fontSize: '11px', gap: '4px' }}>

                        <Lock size={10} />

                        <span>Workstation Locked</span>

                      </span>

                    )}

                  </div>



                  <div style={{ display: 'flex', gap: '8px' }}>

                    <button

                      type="button"

                      className="btn btn-ghost btn-sm"

                      onClick={() => {

                        setRegMode('manual');

                        setRegValidationError(null);

                      }}

                    >

                      Back to Manual

                    </button>



                    <button

                      type="button"

                      className="btn btn-secondary btn-sm"

                      disabled={!tokenParseResult?.success || !tokenParseResult.data}

                      onClick={() => {

                        if (tokenParseResult?.data) {

                          const updated: StudentInfo = {

                            ...student,

                            ...tokenParseResult.data,

                            name: tokenParseResult.data.name || student.name,

                            rollNumber: tokenParseResult.data.rollNumber || student.rollNumber

                          };

                          setStudent(updated);

                          if (tokenParseResult.data.examDurationMinutes !== undefined) {

                            setExamDurationMinutes(tokenParseResult.data.examDurationMinutes);

                          }

                          setRegMode('manual');

                          setRegValidationError(null);

                          playSound('success');

                        }

                      }}

                      style={{ gap: '5px' }}

                      title="Extract credentials into manual form to inspect or edit before saving"

                    >

                      <FileEdit size={12} />

                      <span>Populate & Review Form</span>

                    </button>



                    <button

                      type="button"

                      className="btn btn-primary btn-sm"

                      disabled={!tokenParseResult?.success || !tokenParseResult.data}

                      onClick={() => {

                        if (!tokenParseResult?.success || !tokenParseResult.data) {

                          setRegValidationError('Please enter a valid exam token.');

                          playSound('warning');

                          return;

                        }

                        const trimmedName = tokenParseResult.data.name?.trim() || student.name.trim();

                        const trimmedRoll = tokenParseResult.data.rollNumber?.trim() || student.rollNumber.trim();

                        if (!trimmedName || !trimmedRoll) {

                          setRegValidationError('Decoded token must contain candidate Name and USN / Roll Number.');

                          playSound('warning');

                          return;

                        }

                        setRegValidationError(null);

                        const isTokenMcq = tokenParseResult.data.examMode === 'MCQ' || tokenParseResult.data.examType === 'Multiple Choice Question (MCQ) Examination';

                        const updatedInfo: StudentInfo = {

                          ...student,

                          ...tokenParseResult.data,

                          name: trimmedName,

                          rollNumber: trimmedRoll,

                          examDurationMinutes: tokenParseResult.data.examDurationMinutes !== undefined ? tokenParseResult.data.examDurationMinutes : examDurationMinutes,

                          sessionStartTime: sessionStartTime,

                          examMode: isTokenMcq ? 'MCQ' : 'CODING'

                        };

                        handleUpdateStudent(updatedInfo);

                        setIsProfileModalOpen(false);

                        playSound('success');



                        if (isTokenMcq) {

                          try {

                            localStorage.setItem('codedna_active_exam_mode', 'MCQ');

                          } catch {}

                          const targetExamId = tokenParseResult.data.mcqExamId || selectedMcqExamId;

                          navigate(targetExamId ? `/mcq?examId=${targetExamId}` : '/mcq');

                        } else {

                          try {

                            localStorage.setItem('codedna_active_exam_mode', 'CODING');

                          } catch {}

                        }

                      }}

                      style={{ padding: '6px 18px', gap: '6px' }}

                    >

                      <Check size={13} />

                      <span>{tokenParseResult?.data?.examMode === 'MCQ' || tokenParseResult?.data?.examType === 'Multiple Choice Question (MCQ) Examination' ? 'Import & Start MCQ' : 'Import & Unlock'}</span>

                    </button>

                  </div>

                </div>

              </div>

            )}

          </div>

        </div>

      )}



      {/* Reset Candidate Confirmation Modal */}

      <ConfirmationModal

        isOpen={showResetCandidateConfirm}

        title="Register Next Candidate?"

        message="Are you sure you want to conclude the current examination session? This will reset the countdown timer, wipe candidate drafts, and open the registration window for the next student."

        confirmText="Yes, Next Candidate"

        cancelText="Cancel"

        tone="warning"

        icon="warning"

        onConfirm={executeStartNewCandidate}

        onCancel={() => setShowResetCandidateConfirm(false)}

      />



      {/* Final Submit Confirmation Modal */}

      <ConfirmationModal

        isOpen={showFinalSubmitConfirm}

        title="Finalize & Submit Practical Exam?"

        message="Are you sure you want to finalize and submit your practical exam? Your code will be permanently locked and archived to the invigilator control room, and keystroke forensics will be finalized."

        confirmText="Confirm & Submit Exam"

        cancelText="Review Code"

        tone="danger"

        icon="danger"

        onConfirm={() => {

          setShowFinalSubmitConfirm(false);

          void performFinalSubmit();

        }}

        onCancel={() => setShowFinalSubmitConfirm(false)}

      />



      {/* Workspace Notice Alert Modal */}

      {workspaceNoticeMessage && (

        <ConfirmationModal

          isOpen={Boolean(workspaceNoticeMessage)}

          title="Attention Required"

          message={workspaceNoticeMessage}

          confirmText="Acknowledge"

          cancelText="Close"

          tone="neutral"

          icon="warning"

          onConfirm={() => setWorkspaceNoticeMessage(null)}

          onCancel={() => setWorkspaceNoticeMessage(null)}

        />

      )}

    

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ INVIGILATOR EMERGENCY KEY UNLOCK MODAL Ã¢â€â‚¬Ã¢â€â‚¬ */}

      {showEmergencyUnlockPrompt && (

        <div

          style={{

            position: 'fixed',

            inset: 0,

            zIndex: 999999,

            background: 'rgba(0, 0, 0, 0.75)',

            backdropFilter: 'blur(4px)',

            display: 'flex',

            alignItems: 'center',

            justifyContent: 'center',

            padding: '16px'

          }}

          onClick={(e) => {

            if (e.target === e.currentTarget) {

              setShowEmergencyUnlockPrompt(false);

            }

          }}

        >

          <div

            className="card"

            style={{

              width: '100%',

              maxWidth: '440px',

              background: 'var(--bg-elevated)',

              border: '1px solid var(--border)',

              borderRadius: '12px',

              padding: '20px',

              display: 'flex',

              flexDirection: 'column',

              gap: '14px',

              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'

            }}

          >

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

              <div

                style={{

                  width: '32px',

                  height: '32px',

                  borderRadius: '6px',

                  background: 'rgba(59, 130, 246, 0.12)',

                  border: '1px solid rgba(59, 130, 246, 0.3)',

                  color: '#3b82f6',

                  display: 'flex',

                  alignItems: 'center',

                  justifyContent: 'center'

                }}

              >

                <KeyRound size={16} />

              </div>

              <div>

                <h3 style={{ fontSize: '13.5px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>

                  Invigilator Emergency Authorization

                </h3>

                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>

                  1-Time Daily Key Required Ã‚Â· Expires Immediately Upon Use

                </span>

              </div>

            </div>



            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>

              Enter the 5-character emergency unlock key issued specifically for candidate {student.name} ({student.rollNumber || 'N/A'}) on workstation {buildWorkstationId(student.labId, student.stationNumber)}. Keys cannot be shared.

            </p>



            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

              <input

                type="password"

                placeholder="Enter 5-Character Student Key (e.g. X7K9P)"

                value={emergencyUnlockCode}

                onChange={(e) => {

                  setEmergencyUnlockCode(e.target.value);

                  setEmergencyUnlockError(null);

                }}

                onKeyDown={(e) => {

                  if (e.key === 'Enter') {

                    e.preventDefault();

                    handleEmergencyUnlockSubmit();

                  }

                }}

                style={{

                  width: '100%',

                  padding: '9px 12px',

                  fontSize: '12px',

                  background: 'var(--bg-surface)',

                  border: emergencyUnlockError ? '1px solid var(--danger)' : '1px solid var(--border)',

                  borderRadius: '6px',

                  color: 'var(--text-primary)',

                  fontFamily: 'var(--font-mono)',

                  outline: 'none',

                  boxSizing: 'border-box'

                }}

              />



              {emergencyUnlockError && (

                <div style={{ fontSize: '11px', color: 'var(--danger)', fontWeight: 600 }}>

                  {emergencyUnlockError}

                </div>

              )}

            </div>



            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>

              <button

                type="button"

                onClick={() => setShowEmergencyUnlockPrompt(false)}

                style={{

                  padding: '7px 14px',

                  background: 'transparent',

                  border: '1px solid var(--border)',

                  borderRadius: '6px',

                  fontSize: '11.5px',

                  color: 'var(--text-muted)',

                  cursor: 'pointer'

                }}

              >

                Cancel

              </button>

              <button

                type="button"

                onClick={handleEmergencyUnlockSubmit}

                style={{

                  display: 'inline-flex',

                  alignItems: 'center',

                  gap: '6px',

                  padding: '7px 16px',

                  background: 'var(--accent)',

                  color: 'var(--accent-contrast)',

                  border: 'none',

                  borderRadius: '6px',

                  fontSize: '11.5px',

                  fontWeight: 600,

                  cursor: 'pointer'

                }}

              >

                <Unlock size={13} />

                <span>Authorize & Unlock</span>

              </button>

            </div>

          </div>

        </div>

      )}



    </div>

  );

};



export default Workspace;

