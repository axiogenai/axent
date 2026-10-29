import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  Code2,
  Users,
  Key,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  ChevronRight,
  ChevronLeft,
  Trophy,
  Clock,
  Filter,
  Search,
  Download,
  FileText,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  BarChart2,
  Trash2,
  Eye,
  Check,
  Copy,
  Mail,
  BookOpen,
  X,
  HelpCircle,
  Award,
  Video,
  VideoOff,
  Monitor,
  ListChecks,
  Radio,
  Send,
  Shield,
  EyeOff,
  Plus,
  Cpu
} from 'lucide-react';
import { CandidateStation, CollegeLabInfo } from '../../types/dna';
import {
  getAllExams,
  getAllAttempts,
  getAllQuestions,
  saveExam,
  onExamsChanged,
  onMcqDataChanged,
  deleteSingleAttempt,
  clearAllAttemptsFromEverywhere,
  clearAllQuestions
} from '../../services/mcqService';
import { MCQExamConfig, MCQQuestion } from '../../types/mcq';
import { getAllCodingQuestions } from '../../services/codingQuestionService';
import { playSound } from '../../utils/sounds';
import { sendProctorLockCommand, sendProctorWarning, saveAllStations } from '../../services/adminService';
import {
  getAllCodeSparkCandidates,
  syncCandidatesFromCloud,
  CodeSparkCandidate,
  saveCodeSparkCandidates,
  saveActiveCodeSparkPaper,
  ensureCodeSparkAptitudeExam,
  shortlistCandidateForRound2,
  getShortlistedRolls,
  generateRound2KeyForCandidate,
  generateCodeSparkKey,
  isRound1ConcludedGlobally,
  setRound1ConcludedGlobally,
  concludeRound1AndShortlistUnified,
  getStoredSmtpConfig,
  saveStoredSmtpConfig,
  testSmtpConnection,
  dispatchRound2EmailsViaSmtp,
  SmtpConfig,
  isLabOverflowRetakeEnabledGlobally,
  setLabOverflowRetakeGlobally,
  getRound1RetakeRolls,
  isCandidateAuthorizedForRound1Retake,
  authorizeCandidateForRound1Retake,
  authorizeAllRemainingCandidatesForRetake
} from '../../services/codeSparkService';
import { CodeSparkCandidateImportModal } from '../codespark/CodeSparkCandidateImportModal';
import { AIPaperGeneratorModal } from '../AIPaperGeneratorModal';
import { GoogleFormImportModal } from '../mcq/GoogleFormImportModal';
import { AIPaperGenerationResult } from '../../services/groqService';
import { clearAllStationsFromCloud, clearAllAttemptsFromCloud, clearAllQuestionsFromCloud } from '../../services/supabaseService';

interface AdminCodeSparkViewProps {
  stations: CandidateStation[];
  allLabs: CollegeLabInfo[];
  onInspectStation?: (stationId: string) => void;
  onInspectReport?: (submission: any) => void;
  theme?: string;
}

const SHORTLIST_STORAGE_KEY = 'codedna_codespark_shortlist';

export const AdminCodeSparkView: React.FC<AdminCodeSparkViewProps> = ({
  stations,
  allLabs,
  onInspectStation,
  onInspectReport,
  theme
}) => {
  // Navigation tabs: Round 1 MCQ CCTV, Round 1 Results, Shortlist & Keys, Round 2 Coding, Paper Blueprint, Candidate Roster, Specs
  const [activeTab, setActiveTab] = useState<'mcq_cctv' | 'round1' | 'shortlist' | 'round2' | 'candidates' | 'overview'>('mcq_cctv');
  const [registeredCandidates, setRegisteredCandidates] = useState<CodeSparkCandidate[]>(() => getAllCodeSparkCandidates());
  const [showImportModal, setShowImportModal] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedEmailKey, setCopiedEmailKey] = useState<string | null>(null);

  // CCTV Screen View Modes, Filters & Proctor Locking
  const [cctvFilter, setCctvFilter] = useState<'all' | 'live' | 'submitted' | 'standby'>('all');
  const [cctvSearch, setCctvSearch] = useState<string>('');
  const [stationViewModes, setStationViewModes] = useState<Record<string, 'telemetry' | 'screen' | 'camera'>>({});
  const [lockedStations, setLockedStations] = useState<Record<string, boolean>>({});
  const [proctorWarningSent, setProctorWarningSent] = useState<string | null>(null);

  // Shortlist state
  const [shortlistedRolls, setShortlistedRolls] = useState<string[]>(() => getShortlistedRolls());
  const [cutoffScore, setCutoffScore] = useState<number>(60);
  const [quickCutoffInput, setQuickCutoffInput] = useState<number>(30); // Top N

  // Exam Papers & MCQ Data
  const [allExams, setAllExams] = useState<MCQExamConfig[]>(() => getAllExams());
  const [assignedExamId, setAssignedExamId] = useState<string>(() => {
    try {
      return localStorage.getItem('codedna_codespark_round1_exam_id') || '';
    } catch {
      return '';
    }
  });
  const [selectedExamToAssign, setSelectedExamToAssign] = useState<string>('');
  const [paperSaveSuccess, setPaperSaveSuccess] = useState<string | null>(null);

  // Active Question Inspector in MCQ Screens Tab

  // Candidate Response Screen Modal
  const [selectedCandidateSheet, setSelectedCandidateSheet] = useState<any | null>(null);

  // Email Dispatch Modal
  const [showEmailDispatchModal, setShowEmailDispatchModal] = useState<boolean>(false);

  // Institutional Multi-Lab Status & Conclude State
  const [isRound1Concluded, setIsRound1Concluded] = useState(() => isRound1ConcludedGlobally());
  const [showConcludeModal, setShowConcludeModal] = useState<boolean>(false);
  const [concludeMode, setConcludeMode] = useState<'top_n' | 'cutoff'>('top_n');
  const [concludeValue, setConcludeValue] = useState<number>(10);
  const [concludeSuccessNotice, setConcludeSuccessNotice] = useState<string | null>(null);
  const [showManualOverflowManager, setShowManualOverflowManager] = useState<boolean>(false);

  // Real Gmail SMTP Configuration State
  const [smtpUser, setSmtpUser] = useState<string>(() => getStoredSmtpConfig()?.smtp_user || '');
  const [smtpPassword, setSmtpPassword] = useState<string>(() => getStoredSmtpConfig()?.smtp_password || '');
  const [smtpFromName, setSmtpFromName] = useState<string>(
    () => getStoredSmtpConfig()?.smtp_from_name || 'CodeSpark 2026 Examination Board'
  );
  const [showSmtpPassword, setShowSmtpPassword] = useState<boolean>(false);
  const [smtpTesting, setSmtpTesting] = useState<boolean>(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [smtpSending, setSmtpSending] = useState<boolean>(false);
  const [smtpSendResult, setSmtpSendResult] = useState<{
    success: boolean;
    message: string;
    sent: number;
    total: number;
  } | null>(null);

  // AI Paper Generator & Quick Candidate Key Modal State
  const [showAIPaperModal, setShowAIPaperModal] = useState<boolean>(false);
  const [showGoogleFormModal, setShowGoogleFormModal] = useState<boolean>(false);
  
  const [purgeNotice, setPurgeNotice] = useState<string | null>(null);

  // Lab Overflow / Batch 2 (2nd Sitting) State
  const [labOverflowEnabled, setLabOverflowEnabled] = useState(() => isLabOverflowRetakeEnabledGlobally());
  const [retakeRolls, setRetakeRolls] = useState<string[]>(() => getRound1RetakeRolls());
  const [retakeSuccessNotice, setRetakeSuccessNotice] = useState<string | null>(null);

  const handleToggleLabOverflow = (enabled: boolean) => {
    setLabOverflowRetakeGlobally(enabled);
    setLabOverflowEnabled(enabled);
    setRetakeSuccessNotice(
      enabled
        ? 'Lab Capacity Overflow Active: All remaining candidates are permitted to take Round 1 (Batch 2 / 2nd Sitting).'
        : 'Lab Capacity Overflow Disabled: Standard 1-attempt limit restored.'
    );
    playSound('success');
    setTimeout(() => setRetakeSuccessNotice(null), 6000);
  };

  const handleAuthorizeAllRemaining = () => {
    const count = authorizeAllRemainingCandidatesForRetake();
    setRetakeRolls(getRound1RetakeRolls());
    setRegisteredCandidates(getAllCodeSparkCandidates());
    setRetakeSuccessNotice(`Authorized ${count} candidates for Round 1 (Batch 2 / 2nd Sitting) due to lab station capacity.`);
    playSound('success');
    setTimeout(() => setRetakeSuccessNotice(null), 6000);
  };

  const handleToggleCandidateRetake = (rollOrKey: string, allow: boolean) => {
    authorizeCandidateForRound1Retake(rollOrKey, allow);
    setRetakeRolls(getRound1RetakeRolls());
    setRegisteredCandidates(getAllCodeSparkCandidates());
    setRetakeSuccessNotice(
      allow
        ? `Candidate "${rollOrKey}" granted 2nd sitting in Batch 2 (Lab Overflow).`
        : `Candidate "${rollOrKey}" 2nd sitting revoked.`
    );
    playSound('click');
    setTimeout(() => setRetakeSuccessNotice(null), 4000);
  };

  useEffect(() => {
    const sync = () => {
      setAllExams(getAllExams());
      setAssignedExamId(localStorage.getItem('codedna_codespark_round1_exam_id') || '');
      setShortlistedRolls(getShortlistedRolls());
      setRegisteredCandidates(getAllCodeSparkCandidates());
      setRetakeRolls(getRound1RetakeRolls());
      setLabOverflowEnabled(isLabOverflowRetakeEnabledGlobally());
    };
    void syncCandidatesFromCloud().then((synced) => {
      if (synced && synced.length > 0) setRegisteredCandidates(synced);
    });
    const unsub = onExamsChanged(sync);
    window.addEventListener('storage', sync);
    return () => {
      unsub();
      window.removeEventListener('storage', sync);
    };
  }, []);

  const currentAssignedExam = useMemo(() => {
    if (assignedExamId) {
      const found = allExams.find((e) => e.id === assignedExamId);
      if (found) return found;
    }
    const spark = allExams.find((e) => e.isCodeSpark);
    if (spark) return spark;
    return ensureCodeSparkAptitudeExam();
  }, [assignedExamId, allExams]);

  const mcqQuestions: MCQQuestion[] = useMemo(() => {
    // If no paper is currently assigned to CodeSpark Round 1, question count is 0
    if (!currentAssignedExam) return [];
    if (!currentAssignedExam.questionIds || currentAssignedExam.questionIds.length === 0) {
      return [];
    }
    const all = getAllQuestions();
    const qMap = new Map(all.map((q) => [q.id, q]));
    return currentAssignedExam.questionIds
      .map((id) => qMap.get(id))
      .filter(Boolean) as MCQQuestion[];
  }, [currentAssignedExam]);

  const examTotalMarks = useMemo(() => {
    if (currentAssignedExam?.totalMarks && currentAssignedExam.totalMarks > 0) {
      return currentAssignedExam.totalMarks;
    }
    if (mcqQuestions && mcqQuestions.length > 0) {
      return mcqQuestions.reduce((sum, q) => sum + (q.marks || 1), 0);
    }
    return 0;
  }, [currentAssignedExam, mcqQuestions]);

  // Load Round 1 Aptitude attempts
  const [allAttempts, setAllAttempts] = useState<any[]>(() => getAllAttempts());
  const codingQuestions = useMemo(() => getAllCodingQuestions(), []);

  useEffect(() => {
    const unsub = onMcqDataChanged(() => {
      setAllAttempts(getAllAttempts());
    });
    return unsub;
  }, []);

  // Filter attempts for Code Spark Round 1
  const aptitudeCandidates = useMemo(() => {
    return allAttempts
      .map((att) => {
        const max = att.maxScore || currentAssignedExam?.totalMarks || 1;
        const score = att.score ?? 0;
        const pct = Math.round((score / max) * 100);
        const roll = (att.studentRoll || '').toUpperCase();
        const cand = registeredCandidates.find(
          (c) =>
            (c.rollNumber && c.rollNumber.toUpperCase() === roll) ||
            c.accessKey.toUpperCase() === roll ||
            c.email.toUpperCase() === (att.studentEmail || '').toUpperCase()
        );
        const isShortlisted = shortlistedRolls.includes(roll) || Boolean(cand?.isShortlisted);
        return {
          ...att,
          candidateRecord: cand,
          score,
          totalMarks: max,
          scorePct: pct,
          isShortlisted,
          round2Key: cand?.round2Key
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [allAttempts, shortlistedRolls, registeredCandidates, currentAssignedExam]);

  // AI Paper Generation handler
  const handlePaperGenerated = (result: AIPaperGenerationResult) => {
    try {
      const exam = result.exam;
      exam.isCodeSpark = true;
      saveExam(exam);
      void saveActiveCodeSparkPaper(exam.id);
      localStorage.setItem('codedna_codespark_round1_exam_id', exam.id);
      setAssignedExamId(exam.id);
      setAllExams(getAllExams());
      setShowAIPaperModal(false);
      playSound('success');
      setPaperSaveSuccess(
        `Generated & assigned "${exam.title}" (${result.questions.length} Questions, ${exam.totalMarks} Total Marks) as official CodeSpark Round 1 Paper!`
      );
      setTimeout(() => setPaperSaveSuccess(null), 6000);
    } catch (err: any) {
      console.error('Failed to set AI paper:', err);
    }
  };

    const handleGoogleFormQuestionsImported = (importedQuestions: MCQQuestion[]) => {
    try {
      if (!importedQuestions || importedQuestions.length === 0) return;

      const totalMarks = importedQuestions.reduce((sum, q) => sum + (q.marks || 1), 0);
      const questionIds = importedQuestions.map((q) => q.id);

      const baseExam = currentAssignedExam;
      const updatedExam: MCQExamConfig = {
        id: baseExam?.id || `exam_codespark_r1_${Date.now()}`,
        title: baseExam?.title || 'CodeSpark 2026: Round 1 Aptitude & Logic Assessment',
        description: 'Official CodeSpark Round 1 Examination (Imported from Google Form / Quiz)',
        instructions: baseExam?.instructions || 'Welcome to CodeSpark 2026 Round 1. Answer all questions within the allocated time.',
        subject: importedQuestions[0]?.subject || 'Cognitive Aptitude & Logic',
        topic: importedQuestions[0]?.topic || 'Problem Solving & Reasoning',
        examCategory: baseExam?.examCategory || 'Aptitude',
        durationMinutes: baseExam?.durationMinutes || 30,
        isCodeSpark: true,
        status: 'PUBLISHED',
        questionCount: importedQuestions.length,
        totalMarks: totalMarks,
        questionIds: questionIds,
        shuffleQuestions: baseExam?.shuffleQuestions ?? true,
        shuffleOptions: baseExam?.shuffleOptions ?? true,
        negativeMarkingEnabled: baseExam?.negativeMarkingEnabled ?? true,
        allowReview: baseExam?.allowReview ?? true,
        showExplanationsAfterSubmit: baseExam?.showExplanationsAfterSubmit ?? false,
        maxAttempts: baseExam?.maxAttempts || 1,
        createdBy: baseExam?.createdBy || 'Admin',
        createdAt: baseExam?.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      saveExam(updatedExam);
        void saveActiveCodeSparkPaper(updatedExam.id);
      localStorage.setItem('codedna_codespark_round1_exam_id', updatedExam.id);
      setAssignedExamId(updatedExam.id);
      setAllExams(getAllExams());
      setShowGoogleFormModal(false);
      playSound('success');
      setPaperSaveSuccess(
        `Imported ${importedQuestions.length} Questions (${totalMarks} Total Marks) directly into CodeSpark Round 1!`
      );
      setTimeout(() => setPaperSaveSuccess(null), 6000);
    } catch (err: any) {
      console.error('Failed to import Google Form questions:', err);
    }
  };

  // Cloud & Local Full Data Purge (Nuclear Reset)
  const handlePurgeCloudData = async () => {
    if (!window.confirm('PURGE ALL DATA: This will permanently wipe all candidate stations, test attempts, candidate keys, and shortlist data from both Supabase and your browser cache. The arena will be 100% clean and ready for real contestants. Proceed?')) {
      return;
    }
    playSound('click');
    setPurgeNotice('Purging all candidate workstations, test attempts, and local cache...');
    try {
      await clearAllStationsFromCloud();
      await clearAllAttemptsFromCloud();
      localStorage.removeItem('codedna_mcq_attempts');
      localStorage.removeItem('codedna_mcq_questions');
      localStorage.removeItem('codedna_mcq_exams');
      localStorage.removeItem('codedna_college_stations');
      localStorage.removeItem('codedna_live_stations');
      localStorage.removeItem('codedna_codespark_active_batch');
      localStorage.removeItem('codedna_codespark_candidates');
      localStorage.removeItem('codedna_codespark_round1_shortlist');
      localStorage.removeItem('codedna_codespark_round1_concluded');
      localStorage.removeItem('codedna_codespark_round1_exam_id');
      clearAllQuestions();
      await clearAllQuestionsFromCloud();
      saveAllStations([]);
      saveCodeSparkCandidates([]);
      setAllAttempts([]);
      setRegisteredCandidates([]);
      setShortlistedRolls([]);
      playSound('success');
      setPurgeNotice('Purge complete: 0 workstations, 0 test attempts, 0 phantom candidates. System is 100% clean.');
      setTimeout(() => setPurgeNotice(null), 5000);
      window.dispatchEvent(new Event('codedna_codespark_candidates_updated'));
      window.dispatchEvent(new Event('codedna_cctv_broadcast'));
      window.dispatchEvent(new Event('storage'));
    } catch (err: any) {
      setPurgeNotice(`Purge finished: ${err.message || 'Complete'}`);
      setTimeout(() => setPurgeNotice(null), 5000);
    }
  };

  // Real Gmail SMTP actions
  const handleTestSmtp = async () => {
    if (!smtpUser.trim() || !smtpPassword.trim()) {
      setSmtpTestResult({
        success: false,
        message: 'Please provide both your Gmail address and 16-character Google App Password.'
      });
      return;
    }
    setSmtpTesting(true);
    setSmtpTestResult(null);
    try {
      const res = await testSmtpConnection({
        smtp_user: smtpUser.trim(),
        smtp_password: smtpPassword.trim(),
        smtp_from_name: smtpFromName.trim()
      });
      if (res.success) {
        saveStoredSmtpConfig({
          smtp_user: smtpUser.trim(),
          smtp_password: smtpPassword.trim(),
          smtp_from_name: smtpFromName.trim()
        });
        setSmtpTestResult({
          success: true,
          message: res.message || `Connected to smtp.gmail.com:587 as ${smtpUser.trim()} successfully!`
        });
        playSound('success');
      } else {
        setSmtpTestResult({
          success: false,
          message: res.error || 'SMTP Authentication failed. Verify your 16-character Google App Password.'
        });
        playSound('warning');
      }
    } catch (e: any) {
      setSmtpTestResult({
        success: false,
        message: e.message || 'Connection test failed.'
      });
      playSound('warning');
    } finally {
      setSmtpTesting(false);
    }
  };

  const handleSendEmailsViaSmtp = async () => {
    if (!smtpUser.trim() || !smtpPassword.trim()) {
      setSmtpTestResult({
        success: false,
        message: 'Please enter your Gmail address and 16-character Google App Password first.'
      });
      return;
    }

    if (shortlistedRolls.length === 0) {
      setSmtpSendResult({
        success: false,
        message: 'No candidates are shortlisted yet. Conclude Round 1 to compute the shortlist first.',
        sent: 0,
        total: 0
      });
      return;
    }

    const recipients = shortlistedRolls.map((roll) => {
      const matchAttempt = aptitudeCandidates.find((c) => (c.studentRoll || '').toUpperCase() === roll);
      const matchCand = registeredCandidates.find(
        (c) =>
          (c.rollNumber && c.rollNumber.toUpperCase() === roll) ||
          c.accessKey.toUpperCase() === roll ||
          c.email.toUpperCase() === roll
      );
      const name = matchAttempt?.studentName || matchCand?.name || 'Candidate';
      const email = matchAttempt?.studentEmail || matchCand?.email || '';
      const r2Key = matchCand?.round2Key || `AXENT-R2-${roll.slice(-4) || '9901'}`;
      const score = matchAttempt?.score ?? matchCand?.round1Score ?? 0;
      const maxScore = matchAttempt?.totalMarks || matchAttempt?.maxScore || examTotalMarks || 0;

      return {
        name,
        email,
        rollNumber: roll,
        round2Key: r2Key,
        round1Score: score,
        round1MaxScore: maxScore,
        examUrl: `${window.location.origin}/code-spark`
      };
    }).filter((r) => r.email && r.email.includes('@'));

    setSmtpSending(true);
    setSmtpSendResult(null);

    saveStoredSmtpConfig({
      smtp_user: smtpUser.trim(),
      smtp_password: smtpPassword.trim(),
      smtp_from_name: smtpFromName.trim()
    });

    try {
      const result = await dispatchRound2EmailsViaSmtp(
        {
          smtp_user: smtpUser.trim(),
          smtp_password: smtpPassword.trim(),
          smtp_from_name: smtpFromName.trim()
        },
        recipients
      );

      if (result.success && result.sent_count > 0) {
        setSmtpSendResult({
          success: true,
          message: `Dispatched ${result.sent_count} of ${recipients.length} Round 2 keys via smtp.gmail.com!`,
          sent: result.sent_count,
          total: recipients.length
        });
        playSound('success');
      } else {
        setSmtpSendResult({
          success: false,
          message: result.error || `Dispatch completed with ${result.failed_count || 0} delivery failures. Check recipient email addresses.`,
          sent: result.sent_count || 0,
          total: recipients.length
        });
        playSound('warning');
      }
    } catch (e: any) {
      setSmtpSendResult({
        success: false,
        message: e.message || 'Email dispatch failed over SMTP.',
        sent: 0,
        total: recipients.length
      });
      playSound('warning');
    } finally {
      setSmtpSending(false);
    }
  };

  const handleConcludeRound1AndShortlist = () => {
    const res = concludeRound1AndShortlistUnified({
      mode: concludeMode,
      value: Number(concludeValue) || (concludeMode === 'top_n' ? 10 : Math.round(examTotalMarks * 0.6))
    });
    setShortlistedRolls(res.shortlistedRolls);
    setRegisteredCandidates(res.candidates);
    setIsRound1Concluded(true);
    setShowConcludeModal(false);
    setConcludeSuccessNotice(
      `Round 1 officially concluded! Combined leaderboard calculated across all labs. Shortlisted ${res.shortlistedCount} candidates for Round 2.`
    );
    playSound('success');
    setShowEmailDispatchModal(true);
    setTimeout(() => setConcludeSuccessNotice(null), 8000);
  };

  const handleReopenRound1 = () => {
    setRound1ConcludedGlobally(false);
    setIsRound1Concluded(false);
    setConcludeSuccessNotice('Round 1 re-opened! Students can resume taking the Round 1 assessment across labs.');
    playSound('click');
    setTimeout(() => setConcludeSuccessNotice(null), 6000);
  };

  // Proctor lock & alert actions
  const handleToggleLock = (stationId: string, labId?: string) => {
    playSound('click');
    setLockedStations((prev) => {
      const next = !prev[stationId];
      sendProctorLockCommand(stationId, next, labId || 'LAB-SPARK-01');
      return { ...prev, [stationId]: next };
    });
  };

  const handleSendProctorWarning = (candidateName: string, stationId?: string, roll?: string) => {
    playSound('warning');
    const msg = `PROCTOR WARNING: Suspicious activity detected on your workstation. Keep focus strictly on the examination window.`;
    setProctorWarningSent(`Official proctor warning broadcasted to ${candidateName}'s active screen.`);
    if (stationId) {
      sendProctorWarning(stationId, msg);
    }
    if (roll) {
      try {
        localStorage.setItem(`codedna_candidate_warning_${roll.toUpperCase()}`, msg);
        window.dispatchEvent(new CustomEvent('codedna_proctor_warning', { detail: { roll, message: msg } }));
      } catch {}
    }
    setTimeout(() => setProctorWarningSent(null), 4500);
  };

  // Round 1 MCQ CCTV Stations: Synthesizes registered candidates, live proctoring stations, and all attempts
  const round1Stations = useMemo(() => {
    // Unique map keyed by Candidate Access Key to prevent ANY duplicate terminals
    const candMap = new Map<string, { id: string; defaultStationNumber: string; candidate: CodeSparkCandidate; cleanRoll: string }>();

    // 1. Registered candidates in CodeSpark (Strict deduplication by identity)
    registeredCandidates.forEach((cand, idx) => {
      const accessKey = (cand.accessKey || '').toUpperCase().trim();
      const normName = (cand.name || '').trim().toLowerCase();
      const cleanRoll = (cand.rollNumber || (cand.email ? cand.email.split('@')[0] : accessKey)).toUpperCase().trim();
      if (!cleanRoll && !normName) return;

      const dedupeKey = cleanRoll || normName;
      if (!candMap.has(dedupeKey)) {
        candMap.set(dedupeKey, {
          id: `AXNT-SPARK-WS-${String(candMap.size + 1).padStart(2, '0')}`,
          defaultStationNumber: `Terminal #${String(candMap.size + 1).padStart(2, '0')}`,
          candidate: {
            ...cand,
            rollNumber: cleanRoll
          },
          cleanRoll
        });
      }
    });

    // 2. Only incorporate attempts for candidates taking the CodeSpark exam who aren't already mapped
    allAttempts.forEach((att) => {
      const isSparkExam = !currentAssignedExam?.id || att.examId === currentAssignedExam.id || att.examId === 'codespark-round1-aptitude' || (att as any).isCodeSpark;
      if (!isSparkExam) return;

      const cleanRoll = (att.studentRoll || '').trim().toUpperCase();
      const attName = (att.studentName || '').trim().toLowerCase();
      if (!cleanRoll && !attName) return;

      const alreadyMapped = Array.from(candMap.values()).some(({ candidate }) => {
        const candRoll = (candidate.rollNumber || '').trim().toUpperCase();
        const candKey = (candidate.accessKey || '').trim().toUpperCase();
        const candName = (candidate.name || '').trim().toLowerCase();
        return (
          (cleanRoll && (candRoll === cleanRoll || candKey === cleanRoll)) ||
          (attName && candName && candName === attName)
        );
      });

      if (!alreadyMapped) {
        const dedupeKey = cleanRoll || attName;
        if (!candMap.has(dedupeKey)) {
          candMap.set(dedupeKey, {
            id: `AXNT-SPARK-WS-${String(candMap.size + 1).padStart(2, '0')}`,
            defaultStationNumber: `Terminal #${String(candMap.size + 1).padStart(2, '0')}`,
            candidate: {
              name: att.studentName || cleanRoll,
              email: att.studentEmail || `${(cleanRoll || 'candidate').toLowerCase()}@institution.edu`,
              rollNumber: cleanRoll,
              accessKey: att.accessKey || `AXENT-${cleanRoll.slice(-4) || '9999'}`,
              status: att.status === 'SUBMITTED' ? 'ROUND1_COMPLETED' : 'CHECKED_IN',
              registeredAt: Date.now()
            },
            cleanRoll
          });
        }
      }
    });

    const result: (CandidateStation & { isStandby?: boolean })[] = [];
    let stationIndex = 1;

    candMap.forEach(({ id, defaultStationNumber, candidate, cleanRoll }) => {
      const candKeyUpper = (candidate.accessKey || '').trim().toUpperCase();
      const candEmailLower = (candidate.email || '').trim().toLowerCase();
      const candRollUpper = (candidate.rollNumber || '').trim().toUpperCase();

      // Find matching attempt strictly for this exam session
      const attempt = allAttempts.find((a) => {
        const matchesExam = !currentAssignedExam?.id || a.examId === currentAssignedExam.id || a.examId === 'codespark-round1-aptitude' || (a as any).isCodeSpark;
        if (!matchesExam) return false;
        const attRoll = (a.studentRoll || '').trim().toUpperCase();
        const attEmail = (a.studentEmail || '').trim().toLowerCase();
        return (
          attRoll === candKeyUpper ||
          attRoll === cleanRoll ||
          (candRollUpper && attRoll === candRollUpper) ||
          (candEmailLower && attEmail === candEmailLower)
        );
      });

      // Find matching live station from stations prop if available
      const liveStation = stations.find(
        (s) =>
          (s.student?.rollNumber || '').trim().toUpperCase() === cleanRoll ||
          (s.student?.rollNumber || '').trim().toUpperCase() === candKeyUpper ||
          (s.student?.name || '').trim().toLowerCase() === candidate.name.trim().toLowerCase() ||
          s.id === id
      );

      const isSubmitted =
        Boolean(attempt) &&
        (attempt.status === 'SUBMITTED' ||
         attempt.status === 'TIMED_OUT' ||
         attempt.status === 'DISQUALIFIED');

      const isActive = !isSubmitted && Boolean(
        attempt?.status === 'IN_PROGRESS' ||
        (liveStation && liveStation.status === 'In Progress' && !(liveStation as any).isStandby)
      );

      const isStandby = !isSubmitted && !isActive;

      const answeredKeys = attempt?.answers && !isStandby
        ? Object.keys(attempt.answers).filter(
            (k) => attempt.answers[k] !== undefined && attempt.answers[k] !== null && attempt.answers[k] !== ''
          )
        : [];
      const answeredCount = isStandby ? 0 : answeredKeys.length;
      const totalQ = attempt?.assignedQuestions?.length || currentAssignedExam?.questionCount || mcqQuestions.length || 10;

      // Determine which question the student is on:
      let currentQIdx = 0;
      if (isStandby) {
        currentQIdx = 0;
      } else if (liveStation?.mcqProgress?.currentQuestionIndex !== undefined) {
        currentQIdx = liveStation.mcqProgress.currentQuestionIndex;
      } else if (isActive) {
        currentQIdx = Math.min(answeredCount, totalQ - 1);
      } else if (isSubmitted) {
        currentQIdx = totalQ - 1;
      }

      const isLocked = Boolean(lockedStations[id] || liveStation?.isLockedByProctor);

      const stationObj: CandidateStation & { isStandby?: boolean } = {
        id: liveStation?.id || id,
        labId: 'LAB-SPARK-01',
        labName: 'CodeSpark Enclave 01',
        stationNumber: liveStation?.stationNumber || defaultStationNumber,
        ipAddress: liveStation?.ipAddress || `10.26.3.${10 + stationIndex}`,
        student: {
          name: candidate.name,
          rollNumber: candidate.rollNumber || cleanRoll,
          semester: 'Final',
          examType: 'Aptitude',
          assignmentTitle: 'Code Spark 2026: General Aptitude & Reasoning',
          course: 'Code Spark 2026',
          department: candidate.department || 'Axent Enclave',
          examMode: 'MCQ'
        },
        language: 'MCQ',
        examMode: 'MCQ',
        code: '// Round 1 Cognitive Aptitude MCQ Telemetry',
        screenImageData: liveStation?.screenImageData,
        status: isSubmitted ? 'Submitted & Done' : 'In Progress',
        isStandby,
        isLockedByProctor: isLocked,
        metrics: {
          typingSpeed: 0,
          timeSpent: isStandby ? 0 : (attempt?.timeSpentSeconds || liveStation?.metrics?.timeSpent || 0),
          pasteCount: 0,
          deleteCount: 0,
          editCount: answeredCount,
          undoCount: 0,
          pasteRatio: 0,
          pastedLines: 0,
          totalLines: 0,
          keystrokes: answeredCount,
          pauseDuration: 0,
          tabSwitchViolations: isStandby ? 0 : (attempt?.tabSwitchCount || liveStation?.metrics?.tabSwitchViolations || 0),
          unfocusedTimeSeconds: isStandby ? 0 : (attempt?.unfocusedSeconds || liveStation?.metrics?.unfocusedTimeSeconds || 0)
        },
        mcqProgress: {
          examId: currentAssignedExam?.id || 'codespark-round1-aptitude',
          examTitle: currentAssignedExam?.title || 'Code Spark 2026: General Aptitude & Reasoning',
          currentQuestionIndex: currentQIdx,
          totalQuestions: totalQ,
          answeredCount: answeredCount,
          tabSwitches: isStandby ? 0 : (attempt?.tabSwitchCount || liveStation?.metrics?.tabSwitchViolations || 0),
          score: isStandby ? undefined : attempt?.score,
          maxScore: isStandby ? examTotalMarks : (attempt?.maxScore || examTotalMarks || (attempt?.score !== undefined ? attempt.score : 0))
        },
        marks: (!isStandby && attempt?.score !== undefined) ? {
          totalMarks: attempt.score,
          maxMarks: attempt.maxScore || examTotalMarks || (attempt?.score !== undefined ? attempt.score : 0),
          executionMarks: attempt.score,
          logicMarks: 0,
          vivaMarks: 0,
          integrityMarks: 10
        } : undefined,
        integrityStatus:
          (attempt?.tabSwitchCount || 0) >= 3 ? 'High Cheating Risk / Plagiarized' : 'Verified Original Work',
        cheatingRisk:
          (attempt?.tabSwitchCount || 0) >= 3 ? 'Critical' : (attempt?.tabSwitchCount || 0) >= 1 ? 'Medium' : 'Low',
        lastActive: isStandby ? 'Standby' : 'Just now',
        lastUpdatedTimestamp: Date.now()
      };

      result.push(stationObj);
      stationIndex++;
    });

    return result;
  }, [registeredCandidates, allAttempts, stations, currentAssignedExam, mcqQuestions, examTotalMarks, lockedStations]);

  const displayedCctvStations = useMemo(() => {
    return round1Stations.filter((s) => {
      if (cctvFilter === 'live' && (s.isStandby || s.status !== 'In Progress')) return false;
      if (cctvFilter === 'submitted' && s.status !== 'Submitted & Done') return false;
      if (cctvFilter === 'standby' && !s.isStandby) return false;

      if (!cctvSearch.trim()) return true;
      const q = cctvSearch.toLowerCase().trim();
      return (
        s.student.name.toLowerCase().includes(q) ||
        (s.student.rollNumber || '').toLowerCase().includes(q) ||
        s.stationNumber.toLowerCase().includes(q) ||
        s.ipAddress.toLowerCase().includes(q)
      );
    });
  }, [round1Stations, cctvFilter, cctvSearch]);

  const liveMcqCount = useMemo(() => round1Stations.filter((s) => !s.isStandby && s.status === 'In Progress').length, [round1Stations]);
  const submittedMcqCount = useMemo(() => round1Stations.filter((s) => s.status === 'Submitted & Done').length, [round1Stations]);
  const standbyMcqCount = useMemo(() => round1Stations.filter((s) => s.isStandby).length, [round1Stations]);

  // Round 2 Live Stations
  const round2Stations = useMemo(() => {
    return stations.filter((s) => {
      const title = (s.student?.assignmentTitle || s.student?.course || '').toLowerCase();
      const mode = s.examMode || (s.language === 'MCQ' ? 'MCQ' : 'CODING');
      return mode === 'CODING' || title.includes('spark') || title.includes('coding');
    });
  }, [stations]);

  // Shortlist management
  const toggleCandidateShortlist = (rollNumber: string) => {
    const roll = rollNumber.trim().toUpperCase();
    const isNowShortlisted = !shortlistedRolls.includes(roll);
    shortlistCandidateForRound2(roll, isNowShortlisted);
    setShortlistedRolls(getShortlistedRolls());
    setRegisteredCandidates(getAllCodeSparkCandidates());
    playSound('success');
  };

  const handleShortlistTopN = (n: number) => {
    const topRolls = aptitudeCandidates.slice(0, n).map((c) => (c.studentRoll || '').toUpperCase());
    topRolls.forEach((r) => shortlistCandidateForRound2(r, true));
    setShortlistedRolls(getShortlistedRolls());
    setRegisteredCandidates(getAllCodeSparkCandidates());
    playSound('success');
  };

  const handleShortlistByCutoff = (pct: number) => {
    const eligible = aptitudeCandidates.filter((c) => c.scorePct >= pct).map((c) => (c.studentRoll || '').toUpperCase());
    eligible.forEach((r) => shortlistCandidateForRound2(r, true));
    setShortlistedRolls(getShortlistedRolls());
    setRegisteredCandidates(getAllCodeSparkCandidates());
    playSound('success');
  };

  const handleClearShortlist = () => {
    if (!window.confirm('Clear all candidates from the Round 2 shortlist?')) return;
    try {
      localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify([]));
      const all = getAllCodeSparkCandidates();
      all.forEach((c) => {
        c.isShortlisted = false;
        c.round2Key = undefined;
        if (c.status === 'SHORTLISTED') c.status = 'ROUND1_COMPLETED';
      });
      saveCodeSparkCandidates(all);
      setShortlistedRolls([]);
      setRegisteredCandidates(all);
      playSound('click');
    } catch {}
  };

  const handleAssignPaper = (examId: string) => {
    if (!examId) return;
    playSound('click');
    try {
      localStorage.setItem('codedna_codespark_round1_exam_id', examId);
      setAssignedExamId(examId);

      const target = allExams.find((e) => e.id === examId);
      if (target) {
        const updatedExam: MCQExamConfig = {
          ...target,
          isCodeSpark: true,
          updatedAt: Date.now()
        };
        saveExam(updatedExam);
        void saveActiveCodeSparkPaper(updatedExam.id);
        setAllExams(getAllExams());
      }

      playSound('success');
      setPaperSaveSuccess(`Assigned "${target?.title || examId}" as CodeSpark Round 1 Paper.`);
      setTimeout(() => setPaperSaveSuccess(null), 4000);
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      console.error('Failed to assign CodeSpark paper:', err);
    }
  };

  const handleDeleteCandidate = (key: string) => {
    if (!window.confirm(`Remove candidate with key ${key} from roster?`)) return;
    const remaining = registeredCandidates.filter((c) => c.accessKey !== key);
    saveCodeSparkCandidates(remaining);
    setRegisteredCandidates(remaining);
    playSound('click');
  };

  const handlePurgeAllAttempts = async () => {
    if (!window.confirm('Are you sure you want to purge ALL Round 1 attempts from database and storage?')) return;
    await clearAllAttemptsFromEverywhere();
    clearAllQuestions();
    setAllAttempts([]);
    setShortlistedRolls([]);
    localStorage.removeItem(SHORTLIST_STORAGE_KEY);
    playSound('click');
  };

  const handleExportShortlistCSV = () => {
    const rows = [
      ['Rank', 'Roll Number', 'Candidate Name', 'Email', 'Score', 'Total Marks', 'Score %', 'Shortlisted', 'Round 2 Access Key'],
      ...aptitudeCandidates.map((c, idx) => [
        idx + 1,
        c.studentRoll,
        c.studentName,
        c.studentEmail || c.candidateRecord?.email || '',
        c.score,
        c.totalMarks,
        `${c.scorePct}%`,
        c.isShortlisted ? 'YES' : 'NO',
        c.round2Key || (c.isShortlisted ? 'AXENT-R2-' + c.studentRoll : 'N/A')
      ])
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `CodeSpark_Shortlist_Round2_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    playSound('click');
  };

  // ── Domain-Intelligent Theme Awareness (Dual-Mode Responsive) ──
  const isDark = theme === 'dark' || (theme === undefined && typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark');

  const t = {
    isDark,
    // Surfaces
    bgApp: isDark ? '#09090b' : '#f8fafc',
    bgCard: isDark ? '#121214' : '#ffffff',
    bgCardElevated: isDark ? '#18181b' : '#f8fafc',
    bgSurface: isDark ? '#18181b' : '#f1f5f9',
    bgSubtle: isDark ? '#27272a' : '#e2e8f0',
    bgInput: isDark ? '#09090b' : '#ffffff',
    bgTableHead: isDark ? '#18181b' : '#f8fafc',
    bgHover: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
    // Borders
    border: isDark ? '#27272a' : '#e2e8f0',
    borderStrong: isDark ? '#3f3f46' : '#cbd5e1',
    borderDashed: isDark ? '#27272a' : '#cbd5e1',
    // Text
    textPrimary: isDark ? '#f4f4f5' : '#0f172a',
    textSecondary: isDark ? '#a1a1aa' : '#475569',
    textMuted: isDark ? '#71717a' : '#64748b',
    textDim: isDark ? '#52525b' : '#94a3b8',
    // Badges / Accents
    badgeBg: isDark ? '#18181b' : '#f1f5f9',
    badgeBorder: isDark ? '#3f3f46' : '#e2e8f0',
    badgeText: isDark ? '#e4e4e7' : '#334155',
    // Buttons
    btnPrimaryBg: isDark ? '#f4f4f5' : '#0f172a',
    btnPrimaryColor: isDark ? '#09090b' : '#ffffff',
    btnSecondaryBg: isDark ? '#18181b' : '#ffffff',
    btnSecondaryBorder: isDark ? '#27272a' : '#e2e8f0',
    btnSecondaryColor: isDark ? '#f4f4f5' : '#0f172a',
    // Shadows
    shadowSm: isDark ? 'none' : '0 1px 2px rgba(0, 0, 0, 0.05)',
    shadowMd: isDark ? '0 12px 32px rgba(0, 0, 0, 0.5)' : '0 10px 25px rgba(0, 0, 0, 0.08)',
  };

  const cardStyle: React.CSSProperties = {
    background: t.bgCard,
    border: `1px solid ${t.border}`,
    borderRadius: '8px',
    padding: '16px 20px',
    boxSizing: 'border-box',
    color: t.textPrimary,
    boxShadow: t.shadowSm
  };
  const darkCardStyle = cardStyle;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '100%',
        color: t.textPrimary,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      {/* ── 1. MASTER CODESPARK CONTROL ROOM BANNER ── */}
      <div
        style={{
          ...cardStyle,
          background: t.bgCard,
          borderColor: t.border,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          padding: '20px 24px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '8px',
              background: t.bgSurface,
              border: `1px solid ${t.border}`,
              color: t.textPrimary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Zap size={22} color={t.textPrimary} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: t.textPrimary, letterSpacing: '-0.02em' }}>
                Code Spark 2026 Admin Control
              </h2>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: t.badgeBg,
                  color: t.badgeText,
                  border: `1px solid ${t.badgeBorder}`,
                  fontFamily: 'monospace'
                }}
              >
                DUAL-ROUND INSTITUTIONAL CONTEST
              </span>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: isDark ? 'rgba(16, 185, 129, 0.1)' : '#ecfdf5',
                  color: isDark ? '#10b981' : '#059669',
                  border: isDark ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid #a7f3d0'
                }}
              >
                SEALED SHORTLIST GATEKEEPER
              </span>
            </div>
            <p style={{ fontSize: '12px', color: t.textMuted, margin: '4px 0 0 0' }}>
              Round 1: Cognitive Aptitude MCQ &bull; Automated Shortlist &bull; Round 2: Algorithmic Code Sprint Arena
            </p>
          </div>
        </div>

        {/* Real-Time Contest Metric Badges */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ padding: '8px 14px', borderRadius: '6px', background: t.bgCardElevated, border: `1px solid ${t.border}`, textAlign: 'center' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: t.textPrimary }}>{aptitudeCandidates.length}</div>
            <div style={{ fontSize: '9.5px', color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>R1 Submissions</div>
          </div>
          <div style={{ padding: '8px 14px', borderRadius: '6px', background: isDark ? '#18181b' : '#ecfdf5', border: isDark ? '1px solid #10b981' : '1px solid #a7f3d0', textAlign: 'center' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: isDark ? '#10b981' : '#059669' }}>{shortlistedRolls.length}</div>
            <div style={{ fontSize: '9.5px', color: isDark ? '#10b981' : '#059669', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Shortlisted for R2</div>
          </div>
          <div style={{ padding: '8px 14px', borderRadius: '6px', background: t.bgCardElevated, border: `1px solid ${t.border}`, textAlign: 'center' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: isDark ? '#3b82f6' : '#0284c7' }}>{mcqQuestions.length}</div>
            <div style={{ fontSize: '9.5px', color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>MCQ Questions</div>
          </div>
          <div style={{ padding: '8px 14px', borderRadius: '6px', background: t.bgCardElevated, border: `1px solid ${t.border}`, textAlign: 'center' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: t.textPrimary }}>{codingQuestions.length}</div>
            <div style={{ fontSize: '9.5px', color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Coding Problems</div>
          </div>
        </div>
      </div>

      {/* Active Paper Status or Unscheduled Warning Banner */}
      {!currentAssignedExam ? (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: '8px',
            background: isDark ? 'rgba(234, 26, 28, 0.1)' : '#fef2f2',
            border: isDark ? '1px solid rgba(234, 26, 28, 0.35)' : '1px solid #fecaca',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={18} color="#ea1a1c" />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: isDark ? '#f4f4f5' : '#991b1b' }}>
                Attention Proctor: No Active Paper Assigned to CodeSpark Round 1
              </div>
              <div style={{ fontSize: '12px', color: isDark ? '#a1a1aa' : '#7f1d1d' }}>
                Candidates will see &quot;Exam is not scheduled&quot; until you select a paper from the Paper Config &amp; Specs tab and save configuration.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select
              value={selectedExamToAssign || ''}
              onChange={(e) => setSelectedExamToAssign(e.target.value)}
              style={{
                padding: '7px 10px',
                borderRadius: '6px',
                border: `1px solid ${t.borderStrong}`,
                background: t.bgInput,
                color: t.textPrimary,
                fontSize: '12px',
                colorScheme: isDark ? 'dark' : 'light'
              }}
            >
              <option value="">-- Choose Exam Paper --</option>
              {allExams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} ({e.questionCount} Qs &bull; {e.durationMinutes}m)
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => handleAssignPaper(selectedExamToAssign)}
              disabled={!selectedExamToAssign}
              style={{
                padding: '7px 14px',
                borderRadius: '6px',
                background: t.btnPrimaryBg,
                color: t.btnPrimaryColor,
                fontWeight: 700,
                fontSize: '12px',
                border: 'none',
                cursor: selectedExamToAssign ? 'pointer' : 'not-allowed'
              }}
            >
              Assign Paper Now
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: '6px',
            background: t.bgCardElevated,
            border: `1px solid ${t.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981' }} />
            <span style={{ fontSize: '12px', color: t.textMuted }}>Active CodeSpark Paper:</span>
            <strong style={{ fontSize: '13px', color: t.textPrimary }}>{currentAssignedExam.title}</strong>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: '3px',
                background: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ecfdf5',
                color: isDark ? '#10b981' : '#059669',
                border: isDark ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #a7f3d0'
              }}
            >
              CLOUD SYNCHRONIZED
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              style={{
                background: t.bgCard,
                border: `1px solid ${t.border}`,
                color: t.textSecondary,
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              Change Paper / Settings
            </button>
          </div>
        </div>
      )}

      {/* ── 2. SUB-NAVIGATION TABS (High-Density Dual-Mode Pills) ── */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          borderBottom: `1px solid ${t.border}`,
          paddingBottom: '10px',
          overflowX: 'auto'
        }}
      >
        {[
          { id: 'mcq_cctv', label: `Round 1 MCQ CCTV (${round1Stations.length})`, icon: Video },
          { id: 'round1', label: `Round 1 Results & Sheets (${aptitudeCandidates.length})`, icon: Trophy },
          { id: 'shortlist', label: `Shortlist & Round 2 Keys (${shortlistedRolls.length})`, icon: ShieldCheck },
          { id: 'round2', label: `Round 2 Live Arena (${round2Stations.length})`, icon: Code2 },
          { id: 'candidates', label: `Candidate Roster (${registeredCandidates.length})`, icon: Key },
          { id: 'overview', label: 'Paper Config & Specs', icon: FileText }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id as any);
              playSound('click');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '6px',
              border: activeTab === tab.id
                ? (isDark ? '1px solid #3f3f46' : '1px solid #0f172a')
                : `1px solid ${t.border}`,
              background: activeTab === tab.id
                ? (isDark ? '#18181b' : '#0f172a')
                : t.bgCard,
              color: activeTab === tab.id
                ? '#ffffff'
                : t.textSecondary,
              fontSize: '12px',
              fontWeight: activeTab === tab.id ? 700 : 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: activeTab === tab.id && !isDark ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <tab.icon size={13} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── 3. TAB CONTENT ── */}

      {/* ── TAB: ROUND 1 MCQ CCTV SURVEILLANCE GRID ── */}
      {activeTab === 'mcq_cctv' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Top Control Bar & Live Stats */}
          <div
            style={{
              ...cardStyle,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '6px',
                  background: isDark ? 'rgba(234, 26, 28, 0.12)' : '#fee2e2',
                  color: '#ea1a1c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: isDark ? '1px solid rgba(234, 26, 28, 0.25)' : '1px solid #fecaca'
                }}
              >
                <Video size={18} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: t.textPrimary }}>
                    Round 1 MCQ CCTV Surveillance Wall
                  </h4>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      fontFamily: 'monospace',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: liveMcqCount > 0 ? (isDark ? 'rgba(56, 189, 248, 0.15)' : '#e0f2fe') : t.badgeBg,
                      color: liveMcqCount > 0 ? (isDark ? '#38bdf8' : '#0284c7') : t.textMuted,
                      border: liveMcqCount > 0 ? (isDark ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid #bae6fd') : `1px solid ${t.border}`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: liveMcqCount > 0 ? (isDark ? '#38bdf8' : '#0284c7') : t.textMuted
                      }}
                    />
                    {liveMcqCount} ACTIVE CANDIDATE FEEDS
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '2px' }}>
                  Real-time student question progression telemetry & workstation CCTV monitor
                </div>
              </div>
            </div>

            {/* Filter Pills & Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Status Filter Buttons */}
              <div
                style={{
                  display: 'inline-flex',
                  padding: '3px',
                  background: t.bgSurface,
                  borderRadius: '6px',
                  border: `1px solid ${t.border}`
                }}
              >
                {[
                  { id: 'all', label: `All (${round1Stations.length})` },
                  { id: 'live', label: `Live (${liveMcqCount})` },
                  { id: 'submitted', label: `Submitted (${submittedMcqCount})` },
                  { id: 'standby', label: `Standby (${standbyMcqCount})` }
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setCctvFilter(f.id as any);
                      playSound('click');
                    }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: 'none',
                      background: cctvFilter === f.id ? (isDark ? '#27272a' : '#ffffff') : 'transparent',
                      color: cctvFilter === f.id ? t.textPrimary : t.textSecondary,
                      boxShadow: cctvFilter === f.id && !isDark ? '0 1px 2px rgba(0, 0, 0, 0.06)' : 'none',
                      fontSize: '11px',
                      fontWeight: cctvFilter === f.id ? 700 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div style={{ position: 'relative', width: '220px' }}>
                <Search
                  size={13}
                  style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: t.textMuted }}
                />
                <input
                  type="text"
                  placeholder="Search candidate or terminal..."
                  value={cctvSearch}
                  onChange={(e) => setCctvSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 30px',
                    borderRadius: '6px',
                    border: `1px solid ${t.border}`,
                    background: t.bgInput,
                    color: t.textPrimary,
                    fontSize: '11.5px',
                    outline: 'none'
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => window.open('/codespark-exams?round=1', '_blank')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: t.btnSecondaryBg,
                  border: `1px solid ${t.btnSecondaryBorder}`,
                  color: t.btnSecondaryColor,
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Eye size={12} />
                <span>Open Exam Hall</span>
              </button>
            </div>
          </div>

          {/* Alert notice if proctor warning was sent */}
          {proctorWarningSent && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                background: 'rgba(234, 26, 28, 0.12)',
                border: '1px solid rgba(234, 26, 28, 0.3)',
                color: '#fca5a5',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <AlertTriangle size={14} color="#ea1a1c" />
              <span>{proctorWarningSent}</span>
            </div>
          )}

          {/* Institutional Multi-Lab Status & Conclude Controller */}
          <div
            style={{
              ...cardStyle,
              background: isRound1Concluded ? (isDark ? 'rgba(16, 185, 129, 0.04)' : '#f0fdf4') : t.bgCard,
              borderColor: isRound1Concluded ? (isDark ? 'rgba(16, 185, 129, 0.4)' : '#86efac') : t.border,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              padding: '16px 20px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '6px',
                  background: isRound1Concluded ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#dcfce7') : (isDark ? 'rgba(234, 26, 28, 0.12)' : '#fee2e2'),
                  color: isRound1Concluded ? '#10b981' : '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: isRound1Concluded ? (isDark ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #86efac') : (isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #fecaca')
                }}
              >
                {isRound1Concluded ? <CheckCircle2 size={18} color="#10b981" /> : <Shield size={18} color={isDark ? '#f4f4f5' : '#dc2626'} />}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 800, color: t.textPrimary }}>
                    Institutional Multi-Lab Examination Status
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      fontFamily: 'monospace',
                      padding: '2.5px 7px',
                      borderRadius: '4px',
                      background: isRound1Concluded ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5') : t.badgeBg,
                      color: isRound1Concluded ? (isDark ? '#10b981' : '#059669') : (isDark ? '#fbbf24' : '#d97706'),
                      border: isRound1Concluded ? (isDark ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #a7f3d0') : `1px solid ${t.badgeBorder}`
                    }}
                  >
                    {isRound1Concluded
                      ? '✓ ROUND 1 CONCLUDED & SEALED'
                      : '● ROUND 1 LIVE ACROSS ALL LABS — SHORTLIST PENDING'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '3px' }}>
                  {isRound1Concluded
                    ? `Round 1 is officially concluded. All lab records merged into unified leaderboard. ${shortlistedRolls.length} candidates shortlisted for Round 2.`
                    : 'Lab A, Lab B & Waiting Sittings Active. Candidates attend exam when workstations become free. Shortlisting will combine scores across all labs when testing concludes.'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {!isRound1Concluded ? (
                <button
                  type="button"
                  onClick={() => setShowConcludeModal(true)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    background: t.btnPrimaryBg,
                    border: 'none',
                    color: t.btnPrimaryColor,
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: isDark ? '0 2px 8px rgba(255,255,255,0.1)' : '0 2px 6px rgba(0,0,0,0.1)'
                  }}
                >
                  <Trophy size={13} color={t.btnPrimaryColor} />
                  <span>Conclude Round 1 &amp; Shortlist Across All Labs</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowEmailDispatchModal(true)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      background: '#10b981',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Mail size={13} color="#ffffff" />
                    <span>Send Round 2 Codes via Gmail</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleReopenRound1}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: t.btnSecondaryBg,
                      border: `1px solid ${t.btnSecondaryBorder}`,
                      color: t.btnSecondaryColor,
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <RefreshCw size={12} />
                    <span>Re-open Round 1</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => setShowAIPaperModal(true)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: t.btnSecondaryBg,
                  border: `1px solid ${t.btnSecondaryBorder}`,
                  color: t.btnSecondaryColor,
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Generate fresh exam paper with any number of questions and marks"
              >
                <Cpu size={12} color={t.textMuted} />
                <span>AI Paper Gen</span>
              </button>

              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: t.btnSecondaryBg,
                  border: `1px solid ${t.btnSecondaryBorder}`,
                  color: t.btnSecondaryColor,
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Manage and issue CodeSpark candidate keys (AXENT-XXXX)"
              >
                <Key size={12} />
                <span>Candidate Keys</span>
              </button>

              <button
                type="button"
                onClick={() => setShowGoogleFormModal(true)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: t.btnSecondaryBg,
                  border: `1px solid ${t.btnSecondaryBorder}`,
                  color: t.btnSecondaryColor,
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Import questions directly from Google Form, Docs, or Text"
              >
                <FileText size={12} color={t.textMuted} />
                <span>Import Google Form</span>
              </button>

              <button
                type="button"
                onClick={handlePurgeCloudData}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: t.btnSecondaryBg,
                  border: `1px solid ${t.btnSecondaryBorder}`,
                  color: t.textSecondary,
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Purge demo stations and test attempts from Supabase & local cache"
              >
                <Trash2 size={12} />
                <span>Purge Demo Data</span>
              </button>
            </div>
          </div>

          {/* Purge / Conclude / Retake Notifications */}
          {purgeNotice && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.12)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#93c5fd',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <CheckCircle2 size={14} color="#60a5fa" />
              <span>{purgeNotice}</span>
            </div>
          )}

          {concludeSuccessNotice && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#6ee7b7',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <CheckCircle2 size={14} color="#10b981" />
              <span>{concludeSuccessNotice}</span>
            </div>
          )}

          {/* CCTV Workstation Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: '14px'
            }}
          >
            {displayedCctvStations.length === 0 ? (
              <div
                style={{
                  gridColumn: '1 / -1',
                  padding: '48px 24px',
                  textAlign: 'center',
                  border: `1px dashed ${t.borderDashed}`,
                  borderRadius: '8px',
                  background: t.bgCard
                }}
              >
                <VideoOff size={32} color={t.textMuted} style={{ marginBottom: '10px' }} />
                <div style={{ fontSize: '14px', fontWeight: 700, color: t.textPrimary }}>
                  No candidate workstations match filter &quot;{cctvFilter}&quot;
                </div>
                <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '4px' }}>
                  Candidates appear here in real-time as they authenticate and take Round 1.
                </div>
              </div>
            ) : (
              displayedCctvStations.map((station) => {
                const totalQ = station.mcqProgress?.totalQuestions || currentAssignedExam?.questionCount || mcqQuestions.length || 0;
                const answeredCount = station.mcqProgress?.answeredCount || 0;
                const currentIdx = station.mcqProgress?.currentQuestionIndex ?? 0;
                const pct = Math.min(100, Math.round((answeredCount / Math.max(1, totalQ)) * 100));
                const view = stationViewModes[station.id] || 'telemetry';
                const candKey = registeredCandidates.find(
                  (c) =>
                    (c.rollNumber && c.rollNumber.toUpperCase() === (station.student?.rollNumber || '').toUpperCase()) ||
                    c.name.trim().toLowerCase() === (station.student?.name || '').trim().toLowerCase()
                )?.accessKey || `AXENT-${(station.student?.rollNumber || '5278').slice(-4)}`;

                return (
                  <div
                    key={station.id}
                    style={{
                      ...darkCardStyle,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    {/* Station Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Monitor size={15} color="#ea1a1c" />
                        <span style={{ fontWeight: 800, fontSize: '14px', color: t.textPrimary }}>
                          {station.stationNumber}
                        </span>
                        <span style={{ fontSize: '11px', color: '#71717a', fontFamily: 'monospace' }}>
                          {station.ipAddress}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {station.isLockedByProctor ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid rgba(239, 68, 68, 0.4)',
                              color: '#ef4444',
                              fontSize: '10.5px',
                              fontWeight: 700
                            }}
                          >
                            <Lock size={10} />
                            <span>LOCKED</span>
                          </span>
                        ) : station.status === 'Submitted & Done' ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: 'rgba(16, 185, 129, 0.15)',
                              border: '1px solid rgba(16, 185, 129, 0.4)',
                              color: '#10b981',
                              fontSize: '10.5px',
                              fontWeight: 700
                            }}
                          >
                            <CheckCircle2 size={10} />
                            <span>SUBMITTED</span>
                          </span>
                        ) : station.status === 'In Progress' && !station.isStandby ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: 'rgba(56, 189, 248, 0.15)',
                              border: '1px solid rgba(56, 189, 248, 0.4)',
                              color: '#38bdf8',
                              fontSize: '10.5px',
                              fontWeight: 700
                            }}
                          >
                            <span
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: '#38bdf8'
                              }}
                            />
                            <span>LIVE ON Q{currentIdx + 1}</span>
                          </span>
                        ) : (
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              color: '#71717a',
                              fontSize: '10.5px',
                              fontWeight: 700
                            }}
                          >
                            STANDBY
                          </span>
                        )}
                      </div>
                    </div>

                    {/* CCTV / Screen Stream Window */}
                    <div
                      style={{
                        height: '195px',
                        minHeight: '195px',
                        background: isDark ? '#040508' : '#f1f5f9',
                        borderRadius: '6px',
                        border: `1px solid ${t.border}`,
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxSizing: 'border-box',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                    >
                      {/* View Mode Toggle Button in Top Right */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStationViewModes((prev) => ({
                            ...prev,
                            [station.id]: view === 'telemetry' ? 'screen' : 'telemetry'
                          }));
                          playSound('click');
                        }}
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.14)',
                          borderRadius: '4px',
                          color: '#a1a1aa',
                          fontSize: '9.5px',
                          padding: '2px 6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          zIndex: 5
                        }}
                        title={view === 'telemetry' ? 'Switch to screen stream' : 'Switch to live MCQ answering telemetry'}
                      >
                        {view === 'telemetry' ? <Monitor size={10} /> : <ListChecks size={10} />}
                        <span>{view === 'telemetry' ? 'Screen' : 'MCQ Live'}</span>
                      </button>

                      {view === 'screen' && station.screenImageData ? (
                        <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <img
                            src={station.screenImageData}
                            alt={`Screen ${station.stationNumber}`}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          />
                          <span
                            style={{
                              position: 'absolute',
                              bottom: '6px',
                              left: '6px',
                              fontSize: '9.5px',
                              fontWeight: 700,
                              background: 'rgba(234, 26, 28, 0.85)',
                              color: '#fff',
                              borderRadius: '3px',
                              padding: '1px 6px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Radio size={9} />
                            <span>SCREEN BROADCAST</span>
                          </span>
                        </div>
                      ) : (
                        /* MCQ Telemetry Mode (Showing which student is on which question) */
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <ListChecks size={13} color="#ea1a1c" />
                              <span style={{ fontSize: '10.5px', fontWeight: 800, color: t.textPrimary, letterSpacing: '0.04em' }}>
                                MCQ TELEMETRY
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', paddingRight: '60px' }}>
                              <span
                                style={{
                                  fontSize: '9.5px',
                                  fontWeight: 700,
                                  background: 'rgba(56, 189, 248, 0.15)',
                                  color: '#38bdf8',
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                Active Q {currentIdx + 1} / {totalQ}
                              </span>
                            </div>
                          </div>

                          {/* Grid of 10 Numbered Question Indicators (5x2 Matrix) */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(5, 1fr)',
                              gap: '4px',
                              margin: '6px 0'
                            }}
                          >
                            {Array.from({ length: totalQ }).map((_, idx) => {
                              const isAnswered = idx < answeredCount;
                              const isCurrent = idx === currentIdx;
                              return (
                                <div
                                  key={idx}
                                  style={{
                                    height: '22px',
                                    borderRadius: '3px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '2px',
                                    fontSize: '9.5px',
                                    fontWeight: 800,
                                    fontFamily: 'monospace',
                                    background: isCurrent
                                      ? 'rgba(56, 189, 248, 0.28)'
                                      : isAnswered
                                      ? 'rgba(34, 197, 94, 0.2)'
                                      : 'rgba(255, 255, 255, 0.04)',
                                    border: isCurrent
                                      ? '1px solid #38bdf8'
                                      : isAnswered
                                      ? '1px solid rgba(34, 197, 94, 0.5)'
                                      : '1px solid rgba(255, 255, 255, 0.08)',
                                    color: isCurrent ? '#38bdf8' : isAnswered ? '#4ade80' : '#71717a'
                                  }}
                                  title={`Question ${idx + 1}: ${isCurrent ? 'Current Active Solving' : isAnswered ? 'Answered' : 'Unanswered'}`}
                                >
                                  <span>{idx + 1}</span>
                                  {isCurrent && (
                                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#38bdf8' }} />
                                  )}
                                  {isAnswered && !isCurrent && (
                                    <span style={{ fontSize: '9px' }}>✓</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Progress bar + Answered summary */}
                          <div>
                            <div
                              style={{
                                width: '100%',
                                height: '4px',
                                background: 'rgba(255, 255, 255, 0.08)',
                                borderRadius: '2px',
                                overflow: 'hidden',
                                marginBottom: '6px'
                              }}
                            >
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  background: '#22c55e',
                                  transition: 'width 0.3s ease'
                                }}
                              />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#a1a1aa' }}>
                              <span>{answeredCount}/{totalQ} Answered ({pct}%)</span>
                              <span style={{ fontWeight: 700, color: '#f4f4f5' }}>
                                {station.mcqProgress?.score !== undefined
                                  ? `${station.mcqProgress.score} pts`
                                  : station.isStandby
                                  ? '—'
                                  : 'In Progress'}
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Candidate Details */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: t.textPrimary }}>
                            {station.student.name}
                          </h4>
                          {isCandidateAuthorizedForRound1Retake(station.student.rollNumber || candKey) ? (
                            <span
                              style={{
                                fontSize: '9px',
                                fontWeight: 800,
                                padding: '1px 5px',
                                borderRadius: '3px',
                                background: 'rgba(245, 158, 11, 0.15)',
                                color: '#f59e0b',
                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                fontFamily: 'monospace'
                              }}
                            >
                              BATCH 2 (2ND SITTING)
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: '9px',
                                fontWeight: 700,
                                padding: '1px 5px',
                                borderRadius: '3px',
                                background: t.badgeBg,
                                color: t.textMuted,
                                border: `1px solid ${t.border}`, 
                                fontFamily: 'monospace'
                              }}
                            >
                              BATCH 1
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '11px', color: '#71717a', fontFamily: 'monospace' }}>
                          {station.student.rollNumber}
                        </span>
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#a1a1aa', marginTop: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Access Key: <strong style={{ color: t.textPrimary, fontFamily: 'monospace' }}>{candKey}</strong></span>
                        {(station.metrics?.tabSwitchViolations || 0) > 0 ? (
                          <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '10.5px' }}>
                            {station.metrics?.tabSwitchViolations} Tab Violations
                          </span>
                        ) : (
                          <span style={{ color: '#10b981', fontSize: '10.5px' }}>0 Infractions</span>
                        )}
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div style={{ display: 'flex', gap: '6px', paddingTop: '8px', borderTop: `1px solid ${t.border}`, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => {
                          const att = allAttempts.find(
                            (a) => (a.studentRoll || '').trim().toUpperCase() === (station.student.rollNumber || '').trim().toUpperCase()
                          );
                          setSelectedCandidateSheet(
                            att || {
                              studentRoll: station.student.rollNumber,
                              studentName: station.student.name,
                              score: station.mcqProgress?.score ?? 0,
                              maxScore: examTotalMarks || totalQ,
                              answers: {},
                              status: station.status === 'Submitted & Done' ? 'SUBMITTED' : (station.status === 'In Progress' ? 'IN_PROGRESS' : 'STANDBY')
                            }
                          );
                          playSound('click');
                        }}
                        style={{
                          flex: 1,
                          minWidth: '85px',
                          padding: '7px 8px',
                          borderRadius: '4px',
                          background: t.btnSecondaryBg,
                          border: `1px solid ${t.btnSecondaryBorder}`,
                          color: t.btnSecondaryColor,
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        <Eye size={12} />
                        <span>Inspect Sheet</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const candId = station.student.rollNumber || candKey;
                          const currentlyAllowed = isCandidateAuthorizedForRound1Retake(candId);
                          handleToggleCandidateRetake(candId, !currentlyAllowed);
                        }}
                        style={{
                          padding: '7px 9px',
                          borderRadius: '4px',
                          background: isCandidateAuthorizedForRound1Retake(station.student.rollNumber || candKey)
                            ? (isDark ? 'rgba(245, 158, 11, 0.15)' : '#fef3c7')
                            : t.btnSecondaryBg,
                          border: isCandidateAuthorizedForRound1Retake(station.student.rollNumber || candKey)
                            ? (isDark ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid #fde68a')
                            : `1px solid ${t.btnSecondaryBorder}`,
                          color: isCandidateAuthorizedForRound1Retake(station.student.rollNumber || candKey)
                            ? '#f59e0b'
                            : t.btnSecondaryColor,
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Authorize or toggle Round 1 (Batch 2 / 2nd Sitting) if lab had no space"
                      >
                        <Zap size={11} color={isCandidateAuthorizedForRound1Retake(station.student.rollNumber || candKey) ? '#f59e0b' : '#a1a1aa'} />
                        <span>
                          {isCandidateAuthorizedForRound1Retake(station.student.rollNumber || candKey)
                            ? 'Batch 2'
                            : '+ 2nd Sit'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleLock(station.id, station.labId)}
                        style={{
                          padding: '7px 10px',
                          borderRadius: '4px',
                          background: station.isLockedByProctor ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          border: station.isLockedByProctor ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                          color: station.isLockedByProctor ? '#10b981' : '#ef4444',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {station.isLockedByProctor ? <Unlock size={12} /> : <Lock size={12} />}
                        <span>{station.isLockedByProctor ? 'Unlock' : 'Lock'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendProctorWarning(station.student.name, station.id, station.student.rollNumber)}
                        style={{
                          padding: '7px 8px',
                          borderRadius: '4px',
                          background: t.btnSecondaryBg,
                          border: `1px solid ${t.btnSecondaryBorder}`,
                          color: '#f59e0b',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Broadcast warning to candidate screen"
                      >
                        <Send size={11} />
                        <span>Warn</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── TAB: MCQ PAPER & BLUEPRINT SOLUTIONS ── */}
            {/* ── TAB: ROUND 1 RESULTS & CANDIDATE MCQ ANSWER SHEETS ── */}
      {activeTab === 'round1' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Action Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleShortlistTopN(quickCutoffInput)}
                style={{ padding: '7px 12px', borderRadius: '6px', background: t.btnSecondaryBg, border: `1px solid ${t.btnSecondaryBorder}`, color: t.btnSecondaryColor, fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <Trophy size={13} color="#eab308" /> Shortlist Top {quickCutoffInput} Candidates
              </button>
              <button
                type="button"
                onClick={() => handleShortlistByCutoff(cutoffScore)}
                style={{ padding: '7px 12px', borderRadius: '6px', background: t.btnSecondaryBg, border: `1px solid ${t.btnSecondaryBorder}`, color: t.btnSecondaryColor, fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <Filter size={13} /> Shortlist &ge; {cutoffScore}% Score
              </button>
              <button
                type="button"
                onClick={handleAuthorizeAllRemaining}
                style={{ padding: '7px 12px', borderRadius: '6px', background: t.btnSecondaryBg, border: '1px solid rgba(245, 158, 11, 0.4)', color: '#f59e0b', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                title="If lab was full during slot 1, authorize all remaining candidates to take Round 1 in Batch 2"
              >
                <Zap size={13} color="#f59e0b" /> Authorize Remaining for Batch 2 (Lab Overflow)
              </button>
              <button
                type="button"
                onClick={handleClearShortlist}
                style={{ padding: '7px 12px', borderRadius: '6px', background: t.btnSecondaryBg, border: `1px solid ${t.btnSecondaryBorder}`, color: t.textMuted, fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}
              >
                Clear Shortlist
              </button>
              <button
                type="button"
                onClick={handlePurgeAllAttempts}
                style={{ padding: '7px 12px', borderRadius: '6px', background: isDark ? '#18181b' : '#fef2f2', border: isDark ? '1px solid rgba(239,68,68,0.4)' : '1px solid #fecaca', color: '#ef4444', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <Trash2 size={13} /> Purge Attempts
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleExportShortlistCSV}
                style={{ padding: '7px 14px', borderRadius: '6px', background: t.btnPrimaryBg, border: 'none', color: t.btnPrimaryColor, fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={13} /> Export CSV
              </button>
            </div>
          </div>

          {/* Table */}
          <div style={{ ...darkCardStyle, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: t.bgTableHead, borderBottom: `1px solid ${t.border}`, color: t.textMuted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '10px 14px' }}>Rank</th>
                  <th style={{ padding: '10px 14px' }}>Roll / Key</th>
                  <th style={{ padding: '10px 14px' }}>Candidate Name</th>
                  <th style={{ padding: '10px 14px' }}>Marks</th>
                  <th style={{ padding: '10px 14px' }}>Score %</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>Lab Batch / 2nd Sitting</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>MCQ Answer Sheet</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>Round 2 Clearance</th>
                </tr>
              </thead>
              <tbody>
                {aptitudeCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '36px', textAlign: 'center', color: '#71717a' }}>
                      No Round 1 Aptitude attempts recorded yet. Student attempts will appear here in real-time as they complete Round 1.
                    </td>
                  </tr>
                ) : (
                  aptitudeCandidates.map((c, idx) => (
                    <tr
                      key={c.id || idx}
                      style={{
                        borderBottom: `1px solid ${t.border}`,
                        background: c.isShortlisted ? (isDark ? 'rgba(16, 185, 129, 0.04)' : '#f0fdf4') : 'transparent',
                        transition: 'background 0.1s'
                      }}
                    >
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: idx < 3 ? '#eab308' : '#71717a' }}>
                        #{idx + 1}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '12px', color: t.textPrimary }}>
                        {c.studentRoll || c.studentEmail || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: t.textPrimary, fontWeight: 600 }}>
                        {c.studentName || 'Candidate'}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: t.textPrimary }}>
                        {c.score} / {c.totalMarks}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontWeight: 700, color: c.scorePct >= 70 ? '#10b981' : c.scorePct >= 50 ? '#eab308' : '#ef4444' }}>
                          {c.scorePct}%
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: '10.5px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                          Completed
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const candId = c.studentRoll || c.studentEmail;
                            const isAllowed = isCandidateAuthorizedForRound1Retake(candId);
                            handleToggleCandidateRetake(candId, !isAllowed);
                          }}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            border: isCandidateAuthorizedForRound1Retake(c.studentRoll || c.studentEmail)
                              ? (isDark ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid #fde68a')
                              : `1px solid ${t.border}`,
                            background: isCandidateAuthorizedForRound1Retake(c.studentRoll || c.studentEmail)
                              ? (isDark ? 'rgba(245, 158, 11, 0.12)' : '#fef3c7')
                              : t.btnSecondaryBg,
                            color: isCandidateAuthorizedForRound1Retake(c.studentRoll || c.studentEmail)
                              ? '#f59e0b'
                              : t.textSecondary,
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title="If candidate had no seat in the lab during slot 1, grant 2nd sitting in Batch 2"
                        >
                          <Zap size={11} color={isCandidateAuthorizedForRound1Retake(c.studentRoll || c.studentEmail) ? '#f59e0b' : '#71717a'} />
                          <span>
                            {isCandidateAuthorizedForRound1Retake(c.studentRoll || c.studentEmail)
                              ? 'Batch 2 (Granted)'
                              : '+ Grant 2nd Sit'}
                          </span>
                        </button>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCandidateSheet(c);
                            playSound('click');
                          }}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            border: `1px solid ${t.border}`,
                            background: t.btnSecondaryBg,
                            color: t.btnSecondaryColor,
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Eye size={12} />
                          <span>Inspect Sheet</span>
                        </button>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => toggleCandidateShortlist(c.studentRoll)}
                          style={{
                            padding: '4px 12px',
                            borderRadius: '4px',
                            border: c.isShortlisted ? (isDark ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid #86efac') : `1px solid ${t.border}`,
                            background: c.isShortlisted ? (isDark ? 'rgba(16, 185, 129, 0.12)' : '#ecfdf5') : t.btnSecondaryBg,
                            color: c.isShortlisted ? (isDark ? '#10b981' : '#059669') : t.textSecondary,
                            fontSize: '11.5px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {c.isShortlisted ? '✓ SHORTLISTED' : '+ Shortlist'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: SHORTLIST GATEKEEPER & ROUND 2 KEY DISPATCH ── */}
      {activeTab === 'shortlist' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ ...darkCardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 700, color: t.textPrimary }}>
                Round 2 Shortlist Registry &amp; Email Key Dispatch
              </h4>
              <p style={{ margin: 0, fontSize: '12px', color: t.textMuted }}>
                Candidates in this list are cleared for Round 2. Each has a provisioned Round 2 Access Key to enter the Coding Sprint.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowEmailDispatchModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  background: t.btnPrimaryBg,
                  color: t.btnPrimaryColor,
                  fontSize: '12px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <Mail size={13} />
                <span>Generate Email Keys Dispatch</span>
              </button>
            </div>
          </div>

          <div style={{ ...darkCardStyle, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: t.bgTableHead, borderBottom: `1px solid ${t.border}`, color: t.textMuted, fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 14px' }}>Candidate Name</th>
                  <th style={{ padding: '10px 14px' }}>Roll / USN</th>
                  <th style={{ padding: '10px 14px' }}>Email Address</th>
                  <th style={{ padding: '10px 14px' }}>Aptitude Score</th>
                  <th style={{ padding: '10px 14px' }}>Round 2 Email Key</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shortlistedRolls.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: '#71717a' }}>
                      No candidates currently shortlisted. Switch to the &quot;Round 1 Results&quot; tab to shortlist candidates by top percentile or cutoff marks.
                    </td>
                  </tr>
                ) : (
                  shortlistedRolls.map((roll) => {
                    const matchAttempt = aptitudeCandidates.find((c) => (c.studentRoll || '').toUpperCase() === roll);
                    const matchCand = registeredCandidates.find((c) => (c.rollNumber && c.rollNumber.toUpperCase() === roll) || c.accessKey.toUpperCase() === roll);
                    const name = matchAttempt?.studentName || matchCand?.name || 'Candidate';
                    const email = matchAttempt?.studentEmail || matchCand?.email || '—';
                    const score = matchAttempt?.score !== undefined ? `${matchAttempt.score}/${matchAttempt.totalMarks}` : 'N/A';
                    const r2Key = matchCand?.round2Key || `AXENT-R2-${roll.slice(-4) || '9901'}`;

                    return (
                      <tr key={roll} style={{ borderBottom: `1px solid ${t.border}` }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: t.textPrimary }}>{name}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: t.textSecondary }}>{roll}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: t.textMuted }}>{email}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#10b981' }}>{score}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)', fontFamily: 'monospace', fontWeight: 800, color: '#60a5fa' }}>
                            {r2Key}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(r2Key);
                              setCopiedKey(r2Key);
                              playSound('click');
                              setTimeout(() => setCopiedKey(null), 2000);
                            }}
                            style={{
                              padding: '3px 8px',
                              borderRadius: '4px',
                              border: `1px solid ${t.border}`,
                              background: t.btnSecondaryBg,
                              color: copiedKey === r2Key ? '#10b981' : t.textSecondary,
                              fontSize: '11px',
                              cursor: 'pointer',
                              marginRight: '6px'
                            }}
                          >
                            {copiedKey === r2Key ? 'Copied' : 'Copy Key'}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleCandidateShortlist(roll)}
                            style={{
                              padding: '3px 8px',
                              borderRadius: '4px',
                              border: isDark ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #fecaca',
                              background: isDark ? '#18181b' : '#fef2f2',
                              color: isDark ? '#ef4444' : '#dc2626',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: ROUND 2 CODING ARENA LIVE STREAM ── */}
      {activeTab === 'round2' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: t.textPrimary }}>Round 2: Live Coding Workstations</h4>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#71717a' }}>Real-time code stream and keystroke telemetry for candidates in the coding phase</p>
            </div>
            <div style={{ fontSize: '12px', color: '#a1a1aa' }}>
              Active Coding Terminals: <strong style={{ color: t.textPrimary }}>{round2Stations.length}</strong>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '14px' }}>
            {round2Stations.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', padding: '48px 24px', textAlign: 'center', border: `1px dashed ${t.borderDashed}`, borderRadius: '8px', background: t.bgCard }}>
                <Code2 size={28} color={t.textMuted} style={{ marginBottom: '8px' }} />
                <div style={{ fontSize: '13px', fontWeight: 600, color: t.textPrimary }}>No active coding workstations</div>
                <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '4px' }}>
                  When shortlisted candidates start Round 2 at /codespark-exams?round=2, their live telemetry and code stream will stream here.
                </div>
              </div>
            ) : (
              round2Stations.map((station) => (
                <div key={station.id} style={{ ...darkCardStyle, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: t.textPrimary }}>{station.student?.name || 'Candidate'}</span>
                      <span style={{ fontSize: '11px', color: '#71717a', fontFamily: 'monospace' }}>({station.student?.rollNumber || 'N/A'})</span>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: t.badgeBg, border: `1px solid ${t.badgeBorder}`, color: t.badgeText }}>
                      {station.stationNumber} ({station.labId})
                    </span>
                  </div>

                  {/* Live Code Stream Panel */}
                  <div style={{ borderRadius: '6px', border: `1px solid ${t.border}`, background: isDark ? '#09090b' : '#0f172a', padding: '10px', height: '140px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Code2 size={11} color="#60a5fa" />
                        <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#a1a1aa', letterSpacing: '0.05em' }}>LIVE CODE STREAM</span>
                      </div>
                      <span style={{ fontSize: '9px', color: '#71717a', fontFamily: 'monospace' }}>{station.language || 'Python'}</span>
                    </div>
                    <pre style={{ margin: 0, flex: 1, fontFamily: 'monospace', fontSize: '10.5px', color: '#e4e4e7', whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflow: 'hidden' }}>
                      {station.code?.trim() || '// Awaiting keyboard input from candidate...'}
                    </pre>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
                    <div style={{ fontSize: '11px', color: '#71717a' }}>
                      WPM: {station.metrics?.typingSpeed || 0} &bull; Keystrokes: {station.metrics?.keystrokes || 0}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => sendProctorLockCommand(station.id, !station.isLockedByProctor, station.labId)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: station.isLockedByProctor ? '1px solid #10b981' : '1px solid #ef4444',
                          background: 'transparent',
                          color: station.isLockedByProctor ? '#10b981' : '#ef4444',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {station.isLockedByProctor ? 'Unlock' : 'Lock'}
                      </button>
                      {onInspectStation && (
                        <button
                          type="button"
                          onClick={() => onInspectStation(station.id)}
                          style={{ padding: '4px 8px', borderRadius: '4px', border: `1px solid ${t.border}`, background: t.btnSecondaryBg, color: t.btnSecondaryColor, fontSize: '11px', cursor: 'pointer' }}
                        >
                          Inspect
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── TAB: CANDIDATE ROSTER & AXENT KEYS ── */}
      {activeTab === 'candidates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ ...darkCardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 700, color: t.textPrimary }}>
                CodeSpark Private Candidate Registry &amp; Access Keys
              </h4>
              <p style={{ margin: 0, fontSize: '12px', color: t.textMuted }}>
                Each candidate is provisioned a unique <strong>AXENT-XXXX</strong> key for authenticating on the /code-spark candidate portal.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleAuthorizeAllRemaining}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: t.btnSecondaryBg,
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  color: '#f59e0b',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                title="Authorize remaining candidates for Round 1 (Batch 2 / 2nd Sitting) if lab was full"
              >
                <Zap size={13} color="#f59e0b" />
                <span>Authorize All for Batch 2 (Lab Overflow)</span>
              </button>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  background: t.btnPrimaryBg,
                  color: t.btnPrimaryColor,
                  fontSize: '12px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <Key size={13} />
                <span>+ Import Candidates &amp; Issue Keys</span>
              </button>
            </div>
          </div>

          <div style={{ ...darkCardStyle, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: t.bgTableHead, borderBottom: `1px solid ${t.border}`, color: t.textMuted, fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 14px' }}>AXENT Key</th>
                  <th style={{ padding: '10px 14px' }}>Candidate Name</th>
                  <th style={{ padding: '10px 14px' }}>Email Address</th>
                  <th style={{ padding: '10px 14px' }}>Round 2 Email Key</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>Lab Batch / 2nd Sitting</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {registeredCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#71717a' }}>
                      No candidates registered yet. Click &quot;+ Import Candidates &amp; Issue Keys&quot; to import candidates with Name and Email.
                    </td>
                  </tr>
                ) : (
                  registeredCandidates.map((c) => (
                    <tr key={c.accessKey} style={{ borderBottom: `1px solid ${t.border}`, color: t.textPrimary }}>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '4px', background: t.badgeBg, border: `1px solid ${t.badgeBorder}`, fontFamily: 'monospace', fontWeight: 800, color: t.textPrimary }}>
                          {c.accessKey}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#a1a1aa' }}>{c.email || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {c.round2Key ? (
                          <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', fontFamily: 'monospace', fontWeight: 700, border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                            {c.round2Key}
                          </span>
                        ) : (
                          <span style={{ color: '#52525b', fontSize: '11px' }}>Not Shortlisted</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '3px', background: t.badgeBg, border: `1px solid ${t.border}`, color: t.textSecondary }}>
                          {c.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const isAllowed = isCandidateAuthorizedForRound1Retake(c.rollNumber || c.accessKey);
                            handleToggleCandidateRetake(c.rollNumber || c.accessKey, !isAllowed);
                          }}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            border: isCandidateAuthorizedForRound1Retake(c.rollNumber || c.accessKey)
                              ? (isDark ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid #fde68a')
                              : `1px solid ${t.border}`,
                            background: isCandidateAuthorizedForRound1Retake(c.rollNumber || c.accessKey)
                              ? (isDark ? 'rgba(245, 158, 11, 0.12)' : '#fef3c7')
                              : t.btnSecondaryBg,
                            color: isCandidateAuthorizedForRound1Retake(c.rollNumber || c.accessKey)
                              ? '#f59e0b'
                              : t.textSecondary,
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Zap size={11} color={isCandidateAuthorizedForRound1Retake(c.rollNumber || c.accessKey) ? '#f59e0b' : '#71717a'} />
                          <span>
                            {isCandidateAuthorizedForRound1Retake(c.rollNumber || c.accessKey)
                              ? 'Batch 2 (Granted)'
                              : '+ Grant 2nd Sit'}
                          </span>
                        </button>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(c.accessKey);
                              setCopiedKey(c.accessKey);
                              playSound('click');
                              setTimeout(() => setCopiedKey(null), 2000);
                            }}
                            style={{
                              padding: '3px 8px',
                              borderRadius: '4px',
                              border: `1px solid ${t.border}`,
                              background: t.btnSecondaryBg,
                              color: copiedKey === c.accessKey ? '#10b981' : t.textSecondary,
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            {copiedKey === c.accessKey ? 'Copied' : 'Copy Key'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCandidate(c.accessKey)}
                            title="Delete Candidate"
                            style={{
                              padding: '3px 6px',
                              borderRadius: '4px',
                              border: isDark ? '1px solid #27272a' : '1px solid #fecaca',
                              background: isDark ? '#18181b' : '#fef2f2',
                              color: isDark ? '#ef4444' : '#dc2626',
                              fontSize: '11px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center'
                            }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: OVERVIEW & PAPER CONFIGURATION ── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={darkCardStyle}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700, color: t.textPrimary }}>
              Assign CodeSpark Round 1 Aptitude Paper
            </h4>
            <div style={{ display: 'flex', gap: '8px', maxWidth: '600px' }}>
              <select
                value={selectedExamToAssign || (currentAssignedExam?.id || '')}
                onChange={(e) => setSelectedExamToAssign(e.target.value)}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${t.borderStrong}`,
                  background: t.bgInput,
                  color: t.textPrimary,
                  fontSize: '12.5px',
                  outline: 'none',
                  colorScheme: isDark ? 'dark' : 'light'
                }}
              >
                <option value="">-- Choose Exam Paper from Question Bank --</option>
                {allExams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.title} ({exam.questionCount} Questions &bull; {exam.durationMinutes}m)
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleAssignPaper(selectedExamToAssign || (currentAssignedExam?.id || ''))}
                disabled={!selectedExamToAssign && !currentAssignedExam?.id}
                style={{
                  padding: '9px 16px',
                  borderRadius: '6px',
                  background: t.btnPrimaryBg,
                  color: t.btnPrimaryColor,
                  fontSize: '12px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Save Paper
              </button>
            </div>
            {paperSaveSuccess && (
              <div style={{ marginTop: '10px', color: '#10b981', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={13} />
                <span>{paperSaveSuccess}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL 1: CANDIDATE MCQ ANSWER SHEET INSPECTOR ── */}
      {selectedCandidateSheet && (
        <div
          onClick={() => setSelectedCandidateSheet(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: isDark ? 'rgba(9, 9, 11, 0.85)' : 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(6px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: t.textPrimary }}>
                    Candidate MCQ Answer Sheet &bull; {selectedCandidateSheet.studentName}
                  </h3>
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#60a5fa' }}>
                    [{selectedCandidateSheet.studentRoll}]
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '2px' }}>
                  Score: <strong style={{ color: '#10b981' }}>{selectedCandidateSheet.score ?? 0} / {selectedCandidateSheet.totalMarks || selectedCandidateSheet.maxScore || examTotalMarks}</strong> &bull; Completed {new Date(selectedCandidateSheet.endTime || selectedCandidateSheet.submittedAt || Date.now()).toLocaleTimeString()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCandidateSheet(null)}
                style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Questions Answered List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {mcqQuestions.map((q, qIdx) => {
                const candidateChoice = selectedCandidateSheet.answers?.[q.id];
                const correctOption = q.options.find((o) => o.isCorrect);
                const isCorrect = candidateChoice !== undefined && q.options[candidateChoice]?.isCorrect;
                const isSkipped = candidateChoice === undefined || candidateChoice === null;

                return (
                  <div
                    key={q.id || qIdx}
                    style={{
                      background: t.bgCardElevated,
                      border: `1px solid ${t.border}`,
                      borderRadius: '6px',
                      padding: '14px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11.5px', fontFamily: 'monospace', fontWeight: 800, color: '#a1a1aa' }}>
                        QUESTION {qIdx + 1} ({q.marks || 1} MARKS)
                      </span>
                      {isSkipped ? (
                        <span style={{ fontSize: '10.5px', padding: '2px 6px', borderRadius: '3px', background: t.badgeBg, color: t.textMuted }}>
                          SKIPPED / UNANSWERED
                        </span>
                      ) : isCorrect ? (
                        <span style={{ fontSize: '10.5px', padding: '2px 6px', borderRadius: '3px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: 700 }}>
                          ✓ CORRECT (+{q.marks || 1})
                        </span>
                      ) : (
                        <span style={{ fontSize: '10.5px', padding: '2px 6px', borderRadius: '3px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', fontWeight: 700 }}>
                          ✗ INCORRECT ({q.negativeMarks ? `-${q.negativeMarks}` : '0.0'})
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: 600, color: t.textPrimary, marginBottom: '10px' }}>
                      {q.text}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px', fontSize: '12px' }}>
                      {q.options.map((opt, oIdx) => {
                        const isStudentPick = candidateChoice === oIdx;
                        const isRightAnswer = opt.isCorrect;
                        let bg = t.bgCard;
                        let borderColor = t.border;
                        let textColor = t.textPrimary;

                        if (isRightAnswer) {
                          bg = 'rgba(16, 185, 129, 0.08)';
                          borderColor = 'rgba(16, 185, 129, 0.35)';
                          textColor = '#10b981';
                        }
                        if (isStudentPick && !isRightAnswer) {
                          bg = 'rgba(239, 68, 68, 0.08)';
                          borderColor = 'rgba(239, 68, 68, 0.35)';
                          textColor = '#ef4444';
                        }

                        return (
                          <div
                            key={oIdx}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '4px',
                              background: bg,
                              border: `1px solid ${borderColor}`,
                              color: textColor,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between'
                            }}
                          >
                            <span>{String.fromCharCode(65 + oIdx)}. {opt.text}</span>
                            {isStudentPick && (
                              <span style={{ fontSize: '9.5px', fontWeight: 800, padding: '1px 4px', borderRadius: '2px', background: isDark ? '#27272a' : '#e2e8f0', color: t.textPrimary }}>
                                CANDIDATE PICK
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 20px', borderTop: `1px solid ${t.border}`, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setSelectedCandidateSheet(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: t.btnPrimaryBg,
                  color: t.btnPrimaryColor,
                  fontSize: '12px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Close Answer Sheet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: SHORTLIST EMAIL INVITATION & REAL GMAIL SMTP DISPATCH ENGINE ── */}
      {showEmailDispatchModal && (
        <div
          onClick={() => setShowEmailDispatchModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: isDark ? 'rgba(9, 9, 11, 0.85)' : 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(6px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              maxWidth: '820px',
              width: '100%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={16} color={t.textPrimary} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: t.textPrimary }}>
                    Round 2 Shortlist Notification &amp; Gmail SMTP Dispatcher
                  </h3>
                  <div style={{ fontSize: '11.5px', color: '#a1a1aa', marginTop: '2px' }}>
                    {shortlistedRolls.length} Shortlisted Candidates Cleared for Round 2: Algorithmic Code Sprint
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEmailDispatchModal(false)}
                style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* SMTP Credentials & Dispatch Control Box */}
              <div style={{ background: t.bgCardElevated, border: `1px solid ${t.border}`, borderRadius: '6px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield size={14} color="#60a5fa" />
                    <strong style={{ fontSize: '13px', color: t.textPrimary }}>Gmail SMTP Dispatch Settings</strong>
                  </div>
                  <span style={{ fontSize: '10.5px', fontFamily: 'monospace', color: t.textMuted, background: t.bgInput, padding: '2px 8px', borderRadius: '4px', border: `1px solid ${t.border}` }}>
                    smtp.gmail.com:587 (TLS)
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', marginBottom: '4px' }}>
                      Gmail Account Address
                    </label>
                    <input
                      type="email"
                      value={smtpUser}
                      onChange={(e) => setSmtpUser(e.target.value)}
                      placeholder="e.g. exam.chairperson@gmail.com"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: t.bgInput,
                        border: `1px solid ${t.borderStrong}`,
                        borderRadius: '4px',
                        color: t.textPrimary,
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', marginBottom: '4px' }}>
                      16-Digit Google App Password
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showSmtpPassword ? 'text' : 'password'}
                        value={smtpPassword}
                        onChange={(e) => setSmtpPassword(e.target.value)}
                        placeholder="xxxx xxxx xxxx xxxx"
                        style={{
                          width: '100%',
                          padding: '8px 36px 8px 10px',
                          background: t.bgInput,
                          border: `1px solid ${t.borderStrong}`,
                          borderRadius: '4px',
                          color: t.textPrimary,
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          outline: 'none'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: '#71717a',
                          cursor: 'pointer',
                          padding: '2px'
                        }}
                      >
                        {showSmtpPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '10px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', marginBottom: '4px' }}>
                    Sender Display Name
                  </label>
                  <input
                    type="text"
                    value={smtpFromName}
                    onChange={(e) => setSmtpFromName(e.target.value)}
                    placeholder="e.g. CodeSpark 2026 Examination Board"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: t.bgInput,
                      border: `1px solid ${t.borderStrong}`,
                      borderRadius: '4px',
                      color: t.textPrimary,
                      fontSize: '12px',
                      outline: 'none'
                    }}
                  />
                  <div style={{ fontSize: '10.5px', color: '#71717a', marginTop: '4px' }}>
                    Tip: Use your 16-character App Password generated from Google Account &gt; Security &gt; 2-Step Verification &gt; App Passwords.
                  </div>
                </div>

                {/* SMTP Test Connection Button & Result */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleTestSmtp}
                    disabled={smtpTesting || !smtpUser.trim() || !smtpPassword.trim()}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '4px',
                      background: t.btnSecondaryBg,
                      border: `1px solid ${t.btnSecondaryBorder}`,
                      color: t.btnSecondaryColor,
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: smtpTesting || !smtpUser.trim() || !smtpPassword.trim() ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <RefreshCw size={12} className={smtpTesting ? 'animate-spin' : ''} />
                    <span>{smtpTesting ? 'Testing SMTP TLS...' : 'Test Gmail SMTP Connection'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSendEmailsViaSmtp}
                    disabled={smtpSending || shortlistedRolls.length === 0 || !smtpUser.trim() || !smtpPassword.trim()}
                    style={{
                      padding: '7px 16px',
                      borderRadius: '4px',
                      background: '#10b981',
                      border: 'none',
                      color: '#09090b',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      cursor: smtpSending || shortlistedRolls.length === 0 || !smtpUser.trim() || !smtpPassword.trim() ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 8px rgba(16, 185, 129, 0.2)'
                    }}
                  >
                    <Send size={12} color="#09090b" className={smtpSending ? 'animate-pulse' : ''} />
                    <span>{smtpSending ? 'Dispatching via Gmail...' : `Dispatch Round 2 Codes to ${shortlistedRolls.length} Shortlisted Candidates`}</span>
                  </button>
                </div>

                {/* SMTP Feedback */}
                {smtpTestResult && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      background: smtpTestResult.success ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      border: smtpTestResult.success ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                      color: smtpTestResult.success ? '#10b981' : '#fca5a5',
                      fontSize: '11.5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {smtpTestResult.success ? <CheckCircle2 size={13} color="#10b981" /> : <AlertTriangle size={13} color="#ef4444" />}
                    <span>{smtpTestResult.message}</span>
                  </div>
                )}

                {smtpSendResult && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      background: smtpSendResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      border: smtpSendResult.success ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
                      color: smtpSendResult.success ? '#6ee7b7' : '#fca5a5',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {smtpSendResult.success ? <CheckCircle2 size={14} color="#10b981" /> : <AlertTriangle size={14} color="#ef4444" />}
                    <span>{smtpSendResult.message}</span>
                  </div>
                )}
              </div>

              {/* Candidates List Preview */}
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 700, color: t.textPrimary }}>
                  Recipients &amp; Invitation Dispatch Preview ({shortlistedRolls.length})
                </h4>

                {shortlistedRolls.map((roll) => {
                  const matchAttempt = aptitudeCandidates.find((c) => (c.studentRoll || '').toUpperCase() === roll);
                  const matchCand = registeredCandidates.find(
                    (c) =>
                      (c.rollNumber && c.rollNumber.toUpperCase() === roll) ||
                      c.accessKey.toUpperCase() === roll ||
                      c.email.toUpperCase() === roll
                  );
                  const name = matchAttempt?.studentName || matchCand?.name || 'Candidate';
                  const email = matchAttempt?.studentEmail || matchCand?.email || 'student@domain.com';
                  const r2Key = matchCand?.round2Key || `AXENT-R2-${roll.slice(-4) || '9901'}`;
                  const score = matchAttempt?.score ?? matchCand?.round1Score ?? 0;
                  const maxScore = matchAttempt?.totalMarks || matchAttempt?.maxScore || examTotalMarks || 0;

                  const emailBody = `Subject: Code Spark 2026: You are Shortlisted for Round 2 (Coding Contest)!\n\nDear ${name},\n\nCongratulations! Based on your performance in the Round 1 General Aptitude Assessment (Score: ${score}/${maxScore}), you have successfully cleared the institutional cutoff and have been shortlisted for Round 2: Algorithmic Code Sprint Arena.\n\nYour Exclusive Round 2 Access Code: ${r2Key}\n\nHow to Start Round 2:\n1. Visit the portal at: ${window.location.origin}/code-spark\n2. Scroll down to candidate check-in.\n3. Enter your Round 2 code: ${r2Key}\n4. Enter the Secure Fullscreen Coding Arena.\n\nBest regards,\n${smtpFromName || 'Code Spark 2026 Examination Board'}`;

                  return (
                    <div key={roll} style={{ background: t.bgCardElevated, border: `1px solid ${t.border}`, borderRadius: '6px', padding: '12px', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div>
                          <strong style={{ color: t.textPrimary, fontSize: '13px' }}>{name}</strong>
                          <span style={{ color: t.textMuted, fontSize: '11px', marginLeft: '6px' }}>&lt;{email}&gt;</span>
                          <span style={{ marginLeft: '10px', fontSize: '11px', color: '#10b981', fontFamily: 'monospace', fontWeight: 700 }}>
                            Score: {score}/{maxScore}
                          </span>
                          <span style={{ marginLeft: '8px', fontSize: '11px', padding: '1px 6px', background: t.badgeBg, border: `1px solid ${t.badgeBorder}`, color: isDark ? '#60a5fa' : '#2563eb', fontFamily: 'monospace', fontWeight: 800, borderRadius: '3px' }}>
                            {r2Key}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(emailBody);
                            setCopiedEmailKey(roll);
                            playSound('click');
                            setTimeout(() => setCopiedEmailKey(null), 2000);
                          }}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            background: copiedEmailKey === roll ? '#10b981' : t.btnSecondaryBg,
                            color: copiedEmailKey === roll ? '#ffffff' : t.btnSecondaryColor,
                            border: `1px solid ${t.btnSecondaryBorder}`,
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Copy size={11} />
                          <span>{copiedEmailKey === roll ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '11px', color: t.textSecondary, background: isDark ? '#09090b' : '#f8fafc', border: `1px solid ${t.border}`, padding: '10px', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
                        {emailBody}
                      </pre>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderTop: `1px solid ${t.border}`, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowEmailDispatchModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: t.btnPrimaryBg,
                  color: t.btnPrimaryColor,
                  fontSize: '12px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Close Dispatcher
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: CONCLUDE ROUND 1 & MULTI-LAB COMBINED SHORTLIST ── */}
      {showConcludeModal && (
        <div
          onClick={() => setShowConcludeModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: isDark ? 'rgba(9, 9, 11, 0.85)' : 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(6px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              maxWidth: '560px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trophy size={16} color="#fbbf24" />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: t.textPrimary }}>
                  Conclude Round 1 &amp; Compute Combined Shortlist
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConcludeModal(false)}
                style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#a1a1aa', lineHeight: 1.5 }}>
                This will officially conclude Round 1 across <strong>Lab A, Lab B, and all waiting/overflow sessions</strong>. All candidate attempts will be aggregated into a unified institutional leaderboard to determine the Round 2 qualifiers.
              </p>

              {/* Shortlist Mode Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: t.textPrimary }}>
                  Shortlisting Method
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setConcludeMode('top_n');
                      setConcludeValue(10);
                    }}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      background: concludeMode === 'top_n' ? (isDark ? '#18181b' : '#0f172a') : t.bgCard,
                      border: concludeMode === 'top_n' ? (isDark ? '2px solid #f4f4f5' : '2px solid #0f172a') : `1px solid ${t.border}`,
                      color: concludeMode === 'top_n' ? '#ffffff' : t.textPrimary,
                      textAlign: 'left',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontSize: '12.5px', fontWeight: 800 }}>Top N Candidates</div>
                    <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '2px' }}>
                      Highest scorers across all labs
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setConcludeMode('cutoff');
                      setConcludeValue(Math.max(1, Math.round((examTotalMarks || 100) * 0.6)));
                    }}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      background: concludeMode === 'cutoff' ? (isDark ? '#18181b' : '#0f172a') : t.bgCard,
                      border: concludeMode === 'cutoff' ? (isDark ? '2px solid #f4f4f5' : '2px solid #0f172a') : `1px solid ${t.border}`,
                      color: concludeMode === 'cutoff' ? '#ffffff' : t.textPrimary,
                      textAlign: 'left',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontSize: '12.5px', fontWeight: 800 }}>Cutoff Score</div>
                    <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '2px' }}>
                      Score threshold out of {examTotalMarks || 'Total'} marks
                    </div>
                  </button>
                </div>

                <div style={{ marginTop: '8px' }}>
                  <label style={{ display: 'block', fontSize: '11.5px', color: '#a1a1aa', marginBottom: '4px' }}>
                    {concludeMode === 'top_n'
                      ? 'Number of top candidates to qualify:'
                      : `Minimum qualifying score (out of ${examTotalMarks || 'Total'} marks):`}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={concludeMode === 'cutoff' ? (examTotalMarks || 100) : 500}
                    value={concludeValue}
                    onChange={(e) => setConcludeValue(Math.max(1, Number(e.target.value) || 1))}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      background: t.bgInput,
                      border: `1px solid ${t.borderStrong}`,
                      borderRadius: '4px',
                      color: t.textPrimary,
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div style={{ padding: '12px', background: t.bgCardElevated, border: `1px solid ${t.border}`, borderRadius: '6px', fontSize: '11.5px', color: t.textMuted }}>
                <div>Total Candidates in Registry: <strong style={{ color: t.textPrimary }}>{registeredCandidates.length}</strong></div>
                <div>Completed Attempts Logged: <strong style={{ color: '#10b981' }}>{allAttempts.length}</strong></div>
                <div style={{ marginTop: '4px', color: '#60a5fa' }}>
                  ✓ Shortlisted candidates will immediately have dedicated <span style={{ fontFamily: 'monospace', fontWeight: 800 }}>AXENT-R2-XXXX</span> keys provisioned.
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderTop: `1px solid ${t.border}`, display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowConcludeModal(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  background: 'none',
                  border: `1px solid ${t.border}`,
                  color: t.textSecondary,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConcludeRound1AndShortlist}
                style={{
                  padding: '8px 18px',
                  borderRadius: '6px',
                  background: t.btnPrimaryBg,
                  border: 'none',
                  color: t.btnPrimaryColor,
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Trophy size={13} color={t.btnPrimaryColor} />
                <span>Confirm &amp; Generate Combined Shortlist</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── GOOGLE FORM / TEXT / QUIZ DIRECT IMPORTER ── */}
      {showGoogleFormModal && (
        <GoogleFormImportModal
          isOpen={showGoogleFormModal}
          onClose={() => setShowGoogleFormModal(false)}
          onQuestionsImported={handleGoogleFormQuestionsImported}
          defaultSubject="Cognitive Aptitude & Logic"
          defaultTopic="Problem Solving & Reasoning"
        />
      )}

      {/* ── MODAL 5: AI PAPER GENERATOR ── */}
      {showAIPaperModal && (
        <AIPaperGeneratorModal
          isOpen={showAIPaperModal}
          onClose={() => setShowAIPaperModal(false)}
          onPaperGenerated={handlePaperGenerated}
        />
      )}

      {/* ── MODAL 6: BULK CANDIDATE IMPORT ── */}
      {showImportModal && (
        <CodeSparkCandidateImportModal
          isOpen={showImportModal}
          onClose={() => {
            setShowImportModal(false);
            setRegisteredCandidates(getAllCodeSparkCandidates());
          }}
        />
      )}
    </div>
  );
};

export default AdminCodeSparkView;
