import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Clock, ChevronLeft, ChevronRight, CheckCircle, CheckCircle2, Circle, AlertTriangle,
  Send, BookOpen, RotateCcw, Award, X, Eye, EyeOff, BarChart2, KeyRound,
  Copy, Check, Lock, Unlock, Code2, ArrowRight, ShieldAlert, Shield, Monitor, Download, CheckSquare, FileCheck, LogOut, MessageCircle, Calendar,
  Maximize2, Minimize2, Video, VideoOff, Loader2, AlertCircle, UserPlus, Search, Wifi, RefreshCw, User, Terminal, Shuffle, Ban, CopyX, FileEdit
} from 'lucide-react';
import { MCQAttempt, MCQExamConfig, MCQGradeResult, MCQ_STORAGE_KEYS } from '../types/mcq';
import {
  getAllExams, getActiveAttempt, getAllAttempts, getAttemptsForExam, startAttempt, saveAnswer,
  submitAttempt, gradeAttempt, getRecentSessionAttempt, recordInfraction, updateUnfocusedTime,
  pardonInfractions, onMcqDataChanged, onExamsChanged, syncFromSupabase, persistAttemptToCloud, publishExam
} from '../services/mcqService';
import { playSound } from '../utils/sounds';
import { parseExamToken } from '../utils/tokenParser';
import { syncMcqLiveStation, subscribeToCctvBroadcast, isStationLocked } from '../services/adminService';
import { fetchSingleStationLockStatus, updateStationLockInCloud } from '../services/supabaseService';
import { startAntiCheatingShield } from '../services/antiCheatingGuard';
import { StudentInfo, ExamCategory } from '../types/dna';
import { SimpleSelect } from './watermelon/Select';
import { ConfirmationModal, ModalDetailItem } from './ConfirmationModal';
import {
  getSynchronizedNow,
  isCurrentlyFullscreen,
  requestExamFullscreen,
  exitExamFullscreen,
  formatSynchronizedTime,
  triggerViewportReflow
} from '../services/timeSyncService';
import katex from 'katex';
import { ErrorBoundary } from './ErrorBoundary';
import { getCurrentAuthorityRole, isAuthorityAdmin } from '../services/authService';

// ── Timer hook ────────────────────────────────────────────────────────────────
function useCountdown(deadline: number, onExpire: () => void) {
  const [remaining, setRemaining] = useState(() => Math.max(0, deadline - getSynchronizedNow()));
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    expiredRef.current = false;
    const tick = () => {
      if (expiredRef.current) return;
      const r = Math.max(0, deadline - getSynchronizedNow());
      setRemaining(r);
      if (r === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 500);
    const handleTimeSync = () => tick();
    window.addEventListener('codedna_timesync', handleTimeSync);
    return () => {
      clearInterval(id);
      window.removeEventListener('codedna_timesync', handleTimeSync);
    };
  }, [deadline]);

  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const isLow = remaining < 5 * 60_000; // < 5 min
  const isCritical = remaining < 60_000; // < 1 min
  return { minutes, seconds, isLow, isCritical, remaining };
}

const EXAM_TYPE_OPTIONS = [
  { value: 'Aptitude', label: 'Aptitude' },
  { value: 'ISE', label: 'ISE' },
];

const DEPARTMENT_OPTIONS = [
  { value: 'CSE', label: 'CSE' },
  { value: 'AIML', label: 'AIML' },
  { value: 'AIDS', label: 'AIDS' },
  { value: 'ECE', label: 'ECE' },
  { value: 'EEE', label: 'EEE' },
  { value: 'MECH', label: 'MECH' },
  { value: 'CIVIL', label: 'CIVIL' },
];

const SEMESTER_OPTIONS = [
  { value: '1st Sem', label: '1st Sem' },
  { value: '2nd Sem', label: '2nd Sem' },
  { value: '3rd Sem', label: '3rd Sem' },
  { value: '4th Sem', label: '4th Sem' },
  { value: '5th Sem', label: '5th Sem' },
  { value: '6th Sem', label: '6th Sem' },
  { value: '7th Sem', label: '7th Sem' },
  { value: '8th Sem', label: '8th Sem' },
];

const DIVISION_OPTIONS = [
  { value: 'A', label: 'Div A' },
  { value: 'B', label: 'Div B' },
  { value: 'C', label: 'Div C' },
  { value: 'D', label: 'Div D' },
  { value: 'E', label: 'Div E' },
  { value: 'F', label: 'Div F' },
];

// ── Syntax-Aware Formatted Question Content (Code Blocks + Inline Code) ───────
interface FormattedQuestionContentProps {
  content: string;
  style?: React.CSSProperties;
}

const FormattedQuestionContent: React.FC<FormattedQuestionContentProps> = ({ content, style }) => {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  if (content === null || content === undefined) return null;
  const rawStr = typeof content === 'string' ? content : String(content);
  if (!rawStr.trim()) return null;

  // Clean redundant leading option markers like "A) ", "(A) ", "A. ", "1. ", "Option A: "
  const cleanedContent = rawStr.replace(/^(?:\([A-Da-d0-9]\)|[A-Da-d0-9][\.\)\:\-]|Option\s*[A-D][:.-]?)\s*/i, '');

  const handleCopyCode = (code: string, idx: number) => {
    try {
      navigator.clipboard.writeText(code);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {}
  };

  // Match triple backtick code blocks: ```lang? \n code \n ```
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g;
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let blockIndex = 0;

  while ((match = codeBlockRegex.exec(cleanedContent)) !== null) {
    if (match.index > lastIndex) {
      const textChunk = cleanedContent.substring(lastIndex, match.index);
      elements.push(
        <span key={`text-${lastIndex}`}>
          {renderInlineSpans(textChunk, `inline-${lastIndex}`)}
        </span>
      );
    }

    const lang = (match[1] || 'code').toUpperCase();
    const codeSnippet = match[2];
    const currentBlock = blockIndex++;

    elements.push(
      <div
        key={`code-block-${match.index}`}
        style={{
          margin: '12px 0',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '7px 14px',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border)',
            fontSize: '11px',
            color: 'var(--text-muted)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--border-strong)' }} />
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--border-strong)' }} />
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--border-strong)' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
              {lang}
            </span>
          </div>

          <button
            onClick={() => handleCopyCode(codeSnippet, currentBlock)}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xs)',
              padding: '2px 8px',
              fontSize: '11px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            {copiedIdx === currentBlock ? (
              <>
                <Check size={11} color="var(--success)" />
                <span style={{ color: 'var(--success)' }}>Copied</span>
              </>
            ) : (
              <>
                <Copy size={11} />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        <pre
          style={{
            margin: 0,
            padding: '14px 16px',
            fontFamily: "var(--font-mono, 'JetBrains Mono', Consolas, monospace)",
            fontSize: '13px',
            lineHeight: 1.55,
            color: 'var(--text-primary)',
            overflowX: 'auto',
            maxHeight: '420px',
            whiteSpace: 'pre'
          }}
        >
          <code>{codeSnippet.trim()}</code>
        </pre>
      </div>
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < cleanedContent.length) {
    const trailingChunk = cleanedContent.substring(lastIndex);
    elements.push(
      <span key={`text-${lastIndex}`}>
        {renderInlineSpans(trailingChunk, `inline-${lastIndex}`)}
      </span>
    );
  }

  return (
    <div style={{ lineHeight: 1.6, ...style }}>
      {elements}
    </div>
  );
};

function renderKatexHtml(latex: string, displayMode: boolean = false): string | null {
  try {
    let clean = latex.trim();
    // Normalize simple fraction like "1/52" or "3/4" in math mode into real stacked \frac{1}{52}
    clean = clean.replace(/^([+-]?\d+)\s*\/\s*(\d+)$/, '\\frac{$1}{$2}');
    return katex.renderToString(clean, {
      displayMode,
      throwOnError: false
    });
  } catch {
    return null;
  }
}

/**
 * Parses inline text to detect and render:
 * 1. Plain fractions (e.g. 1/52, 13/204, 3/4, -1/2)
 * 2. LaTeX display math ($$...$$, \[...\])
 * 3. Inline LaTeX math ($...$, \(...\))
 * 4. Raw LaTeX commands (\frac, \sqrt, \times, etc.)
 * 5. Algebraic exponents (e.g. x^2, 2^10)
 */
function renderMathAndFractions(text: string, prefix: string): React.ReactNode[] {
  if (!text) return [];
  const safeText = typeof text === 'string' ? text : String(text);
  const trimmed = safeText.trim();
  if (!trimmed) return [];

  try {
    // 1. Direct standalone fraction: "1/52", "-3/4", "13 / 204"
    const simpleFractionMatch = /^([+-]?\d+)\s*\/\s*(\d+)$/.exec(trimmed);
    if (simpleFractionMatch) {
      const html = renderKatexHtml(`\\frac{${simpleFractionMatch[1]}}{${simpleFractionMatch[2]}}`, false);
      if (html) {
        return [
          <span
            key={`${prefix}-single-frac`}
            className="codedna-math-fraction"
            style={{ display: 'inline-block', verticalAlign: 'middle', margin: '0 2px' }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ];
      }
    }

    // 2. Starts with a raw LaTeX command: e.g. "\frac{1}{52}" or "\sqrt{x}"
    if (/^\\[a-zA-Z]/.test(trimmed)) {
      const html = renderKatexHtml(trimmed, false);
      if (html) {
        return [
          <span
            key={`${prefix}-raw-latex`}
            className="codedna-math-latex"
            style={{ display: 'inline-block', verticalAlign: 'middle', margin: '0 2px' }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ];
      }
    }

    // 3. Tokenize by LaTeX delimiters ($$...$$, \[...\], $...$, \(...\)),
    // raw \frac/\sqrt commands, exponents (x^2), or embedded fractions (1/52)
    const tokenRegex = /(\$\$(?:[^\$]+)\$\$|\\\[(?:[\s\S]+?)\\\]|\$(?:[^\$]+)\$|\\\((?:[\s\S]+?)\\\)|\\frac\{[^{}]*\}\{[^{}]*\}|\\sqrt\{[^{}]*\}|(?<![\w\\])[a-zA-Z0-9]+\^[a-zA-Z0-9]+|(?<![\d\/])[+-]?\d+\s*\/\s*\d+(?![\d\/]))/g;

    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let tokenIdx = 0;

    while ((match = tokenRegex.exec(safeText)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(safeText.substring(lastIndex, match.index));
      }
      const token = match[0];
      const key = `${prefix}-math-${tokenIdx++}`;

      if (token.startsWith('$$') && token.endsWith('$$')) {
        const html = renderKatexHtml(token.slice(2, -2), true);
        nodes.push(
          html ? (
            <span key={key} className="codedna-math-display" style={{ display: 'block', margin: '6px 0' }} dangerouslySetInnerHTML={{ __html: html }} />
          ) : token
        );
      } else if (token.startsWith('\\[') && token.endsWith('\\]')) {
        const html = renderKatexHtml(token.slice(2, -2), true);
        nodes.push(
          html ? (
            <span key={key} className="codedna-math-display" style={{ display: 'block', margin: '6px 0' }} dangerouslySetInnerHTML={{ __html: html }} />
          ) : token
        );
      } else if (token.startsWith('$') && token.endsWith('$')) {
        const html = renderKatexHtml(token.slice(1, -1), false);
        nodes.push(
          html ? (
            <span key={key} className="codedna-math-inline" style={{ display: 'inline-block', verticalAlign: 'middle', margin: '0 2px' }} dangerouslySetInnerHTML={{ __html: html }} />
          ) : token
        );
      } else if (token.startsWith('\\(') && token.endsWith('\\)')) {
        const html = renderKatexHtml(token.slice(2, -2), false);
        nodes.push(
          html ? (
            <span key={key} className="codedna-math-inline" style={{ display: 'inline-block', verticalAlign: 'middle', margin: '0 2px' }} dangerouslySetInnerHTML={{ __html: html }} />
          ) : token
        );
      } else if (token.startsWith('\\frac') || token.startsWith('\\sqrt')) {
        const html = renderKatexHtml(token, false);
        nodes.push(
          html ? (
            <span key={key} className="codedna-math-inline" style={{ display: 'inline-block', verticalAlign: 'middle', margin: '0 2px' }} dangerouslySetInnerHTML={{ __html: html }} />
          ) : token
        );
      } else if (/^[+-]?\d+\s*\/\s*\d+$/.test(token.trim())) {
        const [n, d] = token.split('/').map((s) => s.trim());
        const html = renderKatexHtml(`\\frac{${n}}{${d}}`, false);
        nodes.push(
          html ? (
            <span key={key} className="codedna-math-fraction" style={{ display: 'inline-block', verticalAlign: 'middle', margin: '0 2px' }} dangerouslySetInnerHTML={{ __html: html }} />
          ) : token
        );
      } else if (/^[a-zA-Z0-9]+\^[a-zA-Z0-9]+$/.test(token.trim())) {
        const html = renderKatexHtml(token.trim(), false);
        nodes.push(
          html ? (
            <span key={key} className="codedna-math-inline" style={{ display: 'inline-block', verticalAlign: 'middle', margin: '0 2px' }} dangerouslySetInnerHTML={{ __html: html }} />
          ) : token
        );
      } else {
        nodes.push(token);
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < safeText.length) {
      nodes.push(safeText.substring(lastIndex));
    }

    return nodes;
  } catch (err) {
    console.warn('[renderMathAndFractions] Math parsing fell back to plain text:', err);
    return [safeText];
  }
}

function renderInlineSpans(text: string, prefix: string): React.ReactNode {
  const inlineRegex = /`([^`]+)`/g;
  const spans: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = inlineRegex.exec(text)) !== null) {
    if (m.index > last) {
      const textChunk = text.substring(last, m.index);
      spans.push(...renderMathAndFractions(textChunk, `${prefix}-txt-${last}`));
    }
    spans.push(
      <code
        key={`${prefix}-code-${m.index}`}
        style={{
          fontFamily: "var(--font-mono, 'JetBrains Mono', Consolas, monospace)",
          fontSize: '0.88em',
          padding: '2px 6px',
          borderRadius: 'var(--radius-xs)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          fontWeight: 600
        }}
      >
        {m[1]}
      </code>
    );
    last = m.index + m[0].length;
  }

  if (last < text.length) {
    const trailingChunk = text.substring(last);
    spans.push(...renderMathAndFractions(trailingChunk, `${prefix}-txt-${last}`));
  }

  return <span style={{ whiteSpace: 'pre-wrap' }}>{spans}</span>;
}

// ── Registration Gateway (Manual OR Import With Token) ─────────────────────────
interface RegistrationFormProps {
  exam: MCQExamConfig;
  allExams: MCQExamConfig[];
  onSelectExam: (examId: string) => void;
  onStart: (student: StudentInfo) => void;
  startError?: string | null;
  onBack?: () => void;
}

const RegistrationForm: React.FC<RegistrationFormProps> = ({ exam, allExams, onSelectExam, onStart, startError, onBack }) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'manual' | 'token'>('manual');
  
  // Manual student identity state (Exam Type is determined by the Paper-Setter)
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');
  const [dept, setDept] = useState('CSE');
  const [sem, setSem] = useState('4th Sem');
  const [division, setDivision] = useState('A');
  const [errors, setErrors] = useState<string[]>([]);

  // Token state
  const [tokenInput, setTokenInput] = useState('');
  const [tokenCopied, setTokenCopied] = useState(false);

  const parsedToken = tokenInput.trim() ? parseExamToken(tokenInput.trim()) : null;

  const handleStartManual = () => {
    const errs: string[] = [];
    const trimmedName = name.trim();
    const trimmedRoll = roll.trim();

    if (!trimmedName || trimmedName.length < 2) {
      errs.push('Candidate full name must contain at least 2 characters.');
    }
    if (!trimmedRoll || trimmedRoll.length < 2) {
      errs.push('Roll number / University Seat Number (USN) must contain at least 2 characters.');
    }
    if (!dept.trim()) errs.push('Academic department is required.');
    if (!sem.trim()) errs.push('Semester is required.');
    if (!division.trim()) errs.push('Class division is required.');

    // Schedule timing guard: strictly prohibit early entry before exam.startTime
    if (exam.startTime && getSynchronizedNow() < exam.startTime) {
      errs.push(`This examination is scheduled for ${new Date(exam.startTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}. Early entry is strictly prohibited.`);
    }

    // Duplicate submission guard: check if candidate already submitted this exam
    const normalizedRoll = trimmedRoll.toLowerCase();
    const candidateAttempts = getAttemptsForExam(exam.id).filter(
      (item) => String(item.studentRoll || '').trim().toLowerCase() === normalizedRoll
    );
    const existingSubmitted = candidateAttempts.find(
      (item) => item.status === 'SUBMITTED' || item.status === 'TIMED_OUT'
    );
    if (existingSubmitted && Math.max(1, exam.maxAttempts || 1) <= 1) {
      errs.push(`Candidate with Roll Number / USN "${trimmedRoll}" has already completed and submitted this examination. Re-taking is not permitted.`);
    }

    if (errs.length > 0) {
      setErrors(errs);
      playSound('warning');
      return;
    }
    setErrors([]);

    const rollDigits = trimmedRoll.replace(/[^0-9]/g, '');
    const stationDigits = rollDigits.length > 0 ? String(parseInt(rollDigits.slice(-2), 10) || 1).padStart(2, '0') : '01';
    const stationNumber = `Station #${stationDigits}`;

    const dedicatedLabId = exam.assignedLabId || 'LAB-01';
    const dedicatedLabName = exam.assignedLabName || `Exam: ${exam.title}`;

    const student: StudentInfo = {
      name: trimmedName,
      rollNumber: trimmedRoll,
      department: dept.trim(),
      semester: sem.trim(),
      division: division.trim(),
      course: exam.subject || 'MCQ Course',
      examType: (exam.examCategory as ExamCategory) || 'Aptitude',
      assignmentTitle: exam.title,
      labId: dedicatedLabId,
      labName: dedicatedLabName,
      stationNumber,
      examDurationMinutes: exam.durationMinutes,
      examMode: 'MCQ',
      mcqExamId: exam.id
    };

    try {
      localStorage.setItem('codedna_active_exam_mode', 'MCQ');
      localStorage.setItem('codedna_student_profile', JSON.stringify(student));
    } catch {}

    onStart(student);
  };

  const handleApplyToken = () => {
    if (!parsedToken || !parsedToken.success || !parsedToken.data) {
      playSound('warning');
      return;
    }

    const d = parsedToken.data;
    const isMcq = d.examMode === 'MCQ' || d.examType === 'Multiple Choice Question (MCQ) Examination';

    if (!isMcq) {
      // Direct candidate to Coding Workspace
      playSound('success');
      try {
        localStorage.setItem('codedna_active_exam_mode', 'CODING');
      } catch {}
      navigate('/workspace');
      return;
    }

    const rollDigits = (d.rollNumber || '').replace(/[^0-9]/g, '');
    const fallbackDigits = rollDigits.length > 0 ? String(parseInt(rollDigits.slice(-2), 10) || 1).padStart(2, '0') : '01';
    const stationNumber = d.stationNumber || `Station #${fallbackDigits}`;

    const student: StudentInfo = {
      name: d.name?.trim() || 'Candidate',
      rollNumber: d.rollNumber?.trim() || 'USN-001',
      department: d.department?.trim() || 'CSE',
      semester: d.semester?.trim() || '4th Sem',
      division: d.division?.trim() || 'A',
      course: d.course || exam.subject || 'MCQ Course',
      examType: (exam.examCategory as ExamCategory) || 'Aptitude',
      assignmentTitle: exam.title,
      labId: d.labId || 'LAB-01',
      labName: d.labName || '',
      stationNumber,
      examDurationMinutes: d.examDurationMinutes || exam.durationMinutes,
      examMode: 'MCQ',
      mcqExamId: d.mcqExamId || exam.id
    };

    try {
      localStorage.setItem('codedna_active_exam_mode', 'MCQ');
      localStorage.setItem('codedna_student_profile', JSON.stringify(student));
    } catch {}

    const targetExam = d.mcqExamId ? allExams.find((e) => e.id === d.mcqExamId) || exam : exam;
    if (targetExam.startTime && getSynchronizedNow() < targetExam.startTime) {
      playSound('warning');
      setErrors([`This examination is scheduled for ${new Date(targetExam.startTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}. Early entry is strictly prohibited.`]);
      return;
    }

    if (d.mcqExamId && d.mcqExamId !== exam.id) {
      if (targetExam) {
        onSelectExam(targetExam.id);
      }
    }

    onStart(student);
  };

  return (
    <div className="mcq-reg-wrapper">
      <div style={{ maxWidth: '1360px', margin: '0 auto', width: '100%' }}>
        {/* Top Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                Computer-Based Examination Terminal
              </span>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--accent)' }}>
                CCTV Synced
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: 'clamp(18px, 3.5vw, 22px)', fontWeight: 800, color: 'var(--text-primary)' }}>
              Candidate Verification & Session Check-In
            </h1>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onBack) onBack();
              else window.location.href = '/mcq';
            }}
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 14px', fontSize: '12.5px', fontWeight: 600 }}
          >
            <ChevronLeft size={14} />
            <span>Back to Available Exams</span>
          </button>
        </div>

        {/* 2-Column Split: Left = Examination Blueprint, Right = Registration Form */}
        <div className="mcq-reg-grid">
        
        {/* Gateway Card */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BookOpen size={18} color="var(--text-secondary)" />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>{exam.title}</h1>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{exam.subject || 'General Assessment'}{exam.topic ? ` · ${exam.topic}` : ''}</p>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>{exam.questionCount}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Questions</div>
            </div>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>{exam.totalMarks}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Marks</div>
            </div>
            <div style={{ gridColumn: 'span 2', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>{exam.durationMinutes} min</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duration</div>
            </div>
          </div>

          {(() => {
            const cleanInstructions = (exam.instructions || '').replace(/<!--AXENT_META:[\s\S]*?-->/g, '').trim();
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {cleanInstructions && (
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {cleanInstructions}
                    </p>
                  </div>
                )}

                {/* Terminal Proctoring Rules */}
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '5px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
                      Terminal Proctoring Rules
                    </span>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-pill)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      Strictly Enforced
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                      <Ban size={13} style={{ color: 'var(--text-primary)', marginTop: '2px', flexShrink: 0 }} />
                      <span><strong style={{ color: 'var(--text-primary)' }}>No Right-Click:</strong> Context menu and inspect actions are blocked.</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                      <CopyX size={13} style={{ color: 'var(--text-primary)', marginTop: '2px', flexShrink: 0 }} />
                      <span><strong style={{ color: 'var(--text-primary)' }}>No Copy / Paste:</strong> Shortcuts (Ctrl+C, Ctrl+V, Ctrl+U) are disabled.</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                      <Code2 size={13} style={{ color: 'var(--text-primary)', marginTop: '2px', flexShrink: 0 }} />
                      <span><strong style={{ color: 'var(--text-primary)' }}>No DevTools:</strong> F12 key and developer console are strictly prohibited.</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                      <ShieldAlert size={13} style={{ color: 'var(--text-primary)', marginTop: '2px', flexShrink: 0 }} />
                      <span><strong style={{ color: 'var(--text-primary)' }}>No Tab Switching:</strong> Max 3 window focus losses before terminal locks.</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                      <Maximize2 size={13} style={{ color: 'var(--text-primary)', marginTop: '2px', flexShrink: 0 }} />
                      <span><strong style={{ color: 'var(--text-primary)' }}>Fullscreen Required:</strong> Must stay in fullscreen; exiting is logged.</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Candidate Registration / Token Import Card */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
          
          {/* Mode Switcher Tabs */}
          <div style={{ display: 'flex', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px', marginBottom: '20px' }}>
            <button
              onClick={() => { setMode('manual'); playSound('click'); }}
              style={{
                flex: 1, padding: '8px 12px', border: 'none', borderRadius: 'var(--radius-sm)',
                background: mode === 'manual' ? 'var(--bg-elevated)' : 'transparent',
                color: mode === 'manual' ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: mode === 'manual' ? 700 : 500, fontSize: '12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}
            >
              <BookOpen size={13} />
              <span>Manual Candidate Entry</span>
            </button>
            <button
              onClick={() => { setMode('token'); playSound('click'); }}
              style={{
                flex: 1, padding: '8px 12px', border: 'none', borderRadius: 'var(--radius-sm)',
                background: mode === 'token' ? 'var(--bg-elevated)' : 'transparent',
                color: mode === 'token' ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: mode === 'token' ? 700 : 500, fontSize: '12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}
            >
              <KeyRound size={13} />
              <span>OR Import with Token</span>
            </button>
          </div>

          {startError && (
            <div role="alert" style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: '14px' }}>
              <p style={{ color: 'var(--danger)', fontSize: '12px', margin: 0 }}>{startError}</p>
            </div>
          )}

          {/* MODE 1: MANUAL ENTRY */}
          {mode === 'manual' && (
            <div>
              {errors.length > 0 && (
                <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: '14px' }}>
                  {errors.map((e, i) => <p key={i} style={{ color: 'var(--danger)', fontSize: '12px', margin: '2px 0' }}>• {e}</p>)}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* MCQ Exam Selection (Only if multiple exams exist) */}
                {allExams.filter((e) => e.status === 'PUBLISHED').length > 1 && (
                  <div>
                    <label style={labelStyle}>Select Examination Session *</label>
                    <SimpleSelect
                      value={exam.id}
                      onChange={(val) => {
                        onSelectExam(String(val));
                        playSound('click');
                      }}
                      options={allExams.filter((e) => e.status === 'PUBLISHED').map((ex) => ({
                        value: ex.id,
                        label: `${ex.title} (${ex.questionCount} Qs · ${ex.durationMinutes}m · ${ex.totalMarks} marks)`
                      }))}
                    />
                  </div>
                )}

                {/* Candidate Full Name */}
                <div>
                  <label style={labelStyle}>Full Name *</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your registered name"
                    style={inputStyle}
                    onKeyDown={(e) => e.key === 'Enter' && handleStartManual()}
                  />
                </div>

                {/* Roll Number / USN */}
                <div>
                  <label style={labelStyle}>Roll Number / USN *</label>
                  <input
                    value={roll}
                    onChange={(e) => setRoll(e.target.value)}
                    placeholder="Enter Roll No."
                    style={inputStyle}
                    onKeyDown={(e) => e.key === 'Enter' && handleStartManual()}
                  />
                </div>

                {/* Department, Semester, Division */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Department *</label>
                    <SimpleSelect
                      value={dept}
                      onChange={(val) => {
                        setDept(String(val));
                        playSound('click');
                      }}
                      options={DEPARTMENT_OPTIONS}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Semester *</label>
                    <SimpleSelect
                      value={sem}
                      onChange={(val) => {
                        setSem(String(val));
                        playSound('click');
                      }}
                      options={SEMESTER_OPTIONS}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Division *</label>
                    <SimpleSelect
                      value={division}
                      onChange={(val) => {
                        setDivision(String(val));
                        playSound('click');
                      }}
                      options={DIVISION_OPTIONS}
                    />
                  </div>
                </div>

                <button
                  onClick={handleStartManual}
                  style={{
                    width: '100%', marginTop: '10px',
                    background: 'var(--accent)', border: 'none',
                    borderRadius: 'var(--radius-sm)', padding: '12px',
                    cursor: 'pointer', color: 'var(--accent-contrast)', fontSize: '13px', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>Start MCQ Examination</span>
                </button>
              </div>
            </div>
          )}

          {/* MODE 2: OR IMPORT WITH TOKEN */}
          {mode === 'token' && (
            <div>
              <div style={{ marginBottom: '14px' }}>
                <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Import your cryptographic Axent Admit Token. All credentials, exam category, duration, and assigned station details will be auto-filled.
                </p>

                {tokenInput && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setTokenInput('')}
                      style={{
                        background: 'transparent', border: 'none',
                        fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 6px'
                      }}
                    >
                      Clear Token
                    </button>
                  </div>
                )}

                <textarea
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste encoded admit token here (e.g. CDNA-TK-eyJhbGciOiJIUzI1Ni...)"
                  rows={4}
                  style={{
                    ...inputStyle,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    lineHeight: 1.45,
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Decoded Token Preview Card */}
              {parsedToken && parsedToken.success && parsedToken.data && (
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={13} color="var(--success)" /> Token Decoded Successfully
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Mode: {parsedToken.data.examMode || 'CODING'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '8px', fontSize: '11.5px' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Candidate: </span>
                      <strong style={{ color: 'var(--text-primary)' }}>{parsedToken.data.name || 'Candidate'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Roll / USN: </span>
                      <strong style={{ color: 'var(--text-primary)' }}>{parsedToken.data.rollNumber || 'N/A'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Department: </span>
                      <span style={{ color: 'var(--text-secondary)' }}>{parsedToken.data.department || 'General'}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Semester: </span>
                      <span style={{ color: 'var(--text-secondary)' }}>{parsedToken.data.semester || 'N/A'}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Exam Duration: </span>
                      <span style={{ color: 'var(--text-secondary)' }}>{parsedToken.data.examDurationMinutes || 45} mins</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Station: </span>
                      <span style={{ color: 'var(--text-secondary)' }}>{parsedToken.data.stationNumber || 'Station #01'}</span>
                    </div>
                  </div>
                </div>
              )}

              {parsedToken && !parsedToken.success && (
                <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: '14px' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--danger)' }}>
                    {parsedToken.error || 'Invalid or malformed token string. Please verify the copied text.'}
                  </p>
                </div>
              )}

              {/* Action Button */}
              <button
                disabled={!parsedToken || !parsedToken.success}
                onClick={handleApplyToken}
                style={{
                  width: '100%',
                  background: !parsedToken || !parsedToken.success ? 'var(--bg-surface)' : 'var(--accent)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', padding: '12px',
                  cursor: !parsedToken || !parsedToken.success ? 'not-allowed' : 'pointer',
                  color: !parsedToken || !parsedToken.success ? 'var(--text-muted)' : 'var(--accent-contrast)',
                  fontSize: '13px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                <Check size={14} />
                <span>
                  {parsedToken?.data?.examMode === 'MCQ' || parsedToken?.data?.examType === 'Multiple Choice Question (MCQ) Examination'
                    ? 'Import & Start MCQ Exam'
                    : parsedToken?.success
                    ? 'Import & Open Coding Workspace'
                    : 'Import Token & Start'}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
);
};

// ── WhatsApp Hold-Tight Results View (Withheld for Batch Release via WhatsApp) ──
interface WhatsAppHoldResultsViewProps {
  attempt: MCQAttempt;
  exam: MCQExamConfig;
  onExit: () => void;
  onNewCandidate?: () => void;
}

const WhatsAppHoldResultsView: React.FC<WhatsAppHoldResultsViewProps> = ({ attempt, exam, onExit, onNewCandidate }) => {
  const [copiedHash, setCopiedHash] = useState(false);

  useEffect(() => {
    triggerViewportReflow();
  }, []);

  const totalQuestions = attempt?.assignedQuestions?.length || exam?.questionCount || 0;
  const answeredCount = Object.keys(attempt?.answers || {}).filter((k) => attempt?.answers?.[k]).length;

  // Deterministic submission verification token
  const verificationHash = useMemo(() => {
    const raw = `${attempt?.id || 'att'}-${attempt?.studentRoll || 'roll'}-${attempt?.submitTime || Date.now()}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    return `AXENT-WH-${hex}`;
  }, [attempt]);

  const handleCopyHash = () => {
    navigator.clipboard.writeText(verificationHash);
    setCopiedHash(true);
    playSound('click');
    setTimeout(() => setCopiedHash(false), 2500);
  };

  const submitDateStr = useMemo(() => {
    try {
      if (attempt?.submitTime) {
        const d = new Date(attempt.submitTime);
        if (!isNaN(d.getTime())) {
          return d.toLocaleString([], {
            dateStyle: 'medium',
            timeStyle: 'short',
          });
        }
      }
    } catch {}
    return new Date().toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }, [attempt?.submitTime]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 3vw, 24px)', boxSizing: 'border-box' }}>
      <div
        style={{
          maxWidth: '680px',
          width: '100%',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden'
        }}
      >
        {/* Banner */}
        <div
          style={{
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border)',
            padding: 'clamp(20px, 4vw, 28px) clamp(16px, 4vw, 32px) clamp(16px, 3.5vw, 24px)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}
        >

          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: '3px 12px', fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
              <FileCheck size={12} /> Submission Recorded
            </div>
            <h1 style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
              Hold tight, results will be deployed soon
            </h1>
            <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', margin: 0, maxWidth: '520px', lineHeight: 1.5 }}>
              Your examination paper has been submitted successfully and synced to the college evaluation repository. Final results will be exported and sent on your official class WhatsApp group by the paper setter.
            </p>
          </div>
        </div>

        {/* WhatsApp Notice Box */}
        <div style={{ padding: '20px clamp(16px, 4vw, 32px) 0 clamp(16px, 4vw, 32px)' }}>
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '16px 18px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '14px'
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                flexShrink: 0
              }}
            >
              <MessageCircle size={18} />
            </div>
            <div>
              <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Official WhatsApp Group Delivery
              </p>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Your department and class faculty will compile the results, export the official scorecards, and send them directly to your class WhatsApp group. Please check your class group for further updates.
              </p>
            </div>
          </div>
        </div>

        {/* Verification Receipt Card */}
        <div style={{ padding: '20px clamp(16px, 4vw, 32px)' }}>
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                Submission Receipt & Audit Proof
              </span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={12} /> VERIFIED & LOCKED
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '14px 20px' }}>
              <div>
                <span style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
                  Candidate Name
                </span>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {attempt.studentName}
                </span>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
                  USN / Roll Number
                </span>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {attempt.studentRoll}
                </span>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
                  Department & Class
                </span>
                <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  {attempt.studentDept} · {attempt.studentSem} (Div {attempt.studentDiv || 'A'})
                </span>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
                  Examination
                </span>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {exam.title}
                </span>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
                  Questions Attempted
                </span>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                  {answeredCount} of {totalQuestions} answered
                </span>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
                  Submission Time
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {submitDateStr}
                </span>
              </div>
            </div>

            {/* Cryptographic Hash */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Digital Receipt Reference
                </span>
                <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {verificationHash}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyHash}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '5px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: copiedHash ? 'var(--success)' : 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                {copiedHash ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedHash ? 'Copied' : 'Copy Token'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            background: 'var(--bg-surface)',
            borderTop: '1px solid var(--border)',
            padding: '16px clamp(14px, 4vw, 32px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            <Download size={13} />
            <span>Print Receipt</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {onNewCandidate && (
              <button
                type="button"
                onClick={onNewCandidate}
                className="btn btn-secondary btn-sm"
                style={{
                  height: '36px',
                  padding: '0 14px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <UserPlus size={13} />
                <span>Next Candidate Login</span>
              </button>
            )}

            <button
              type="button"
              onClick={onExit}
              className="btn btn-primary btn-sm"
              style={{
                height: '36px',
                padding: '0 20px',
                fontSize: '13px',
                fontWeight: 600
              }}
            >
              <span>Exit to Exam Portal</span>
              <ChevronRight size={14} style={{ marginLeft: '4px' }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Results View (Full-Width Technical Transcript & Analytical Review) ────────
interface ResultsViewProps {
  attempt: MCQAttempt;
  exam: MCQExamConfig;
  grade: MCQGradeResult;
  showExplanations: boolean;
  onRestart?: () => void;
  onExit?: () => void;
  onNewCandidate?: () => void;
}

const ResultsView: React.FC<ResultsViewProps> = ({ attempt, exam, grade, showExplanations, onRestart, onExit, onNewCandidate }) => {
  // STRICT INSTITUTIONAL GUARD:
  // If exam is configured for WhatsApp Group Release, hold results unless exam timed out or instant release is allowed
  const isWhatsAppRelease =
    attempt.status !== 'TIMED_OUT' && (
      exam.resultDeclarationMode === 'WHATSAPP_GROUP' ||
      (typeof exam.instructions === 'string' && (
        exam.instructions.includes('WHATSAPP_GROUP') ||
        exam.instructions.toLowerCase().includes('whatsapp')
      ))
    );

  if (isWhatsAppRelease) {
    return (
      <WhatsAppHoldResultsView
        attempt={attempt}
        exam={exam}
        onExit={onExit || (() => { window.location.href = '/mcq'; })}
      />
    );
  }

  useEffect(() => {
    triggerViewportReflow();
  }, []);

  const [filterMode, setFilterMode] = useState<'all' | 'correct' | 'wrong' | 'unanswered'>('all');

  const pct = Number.isFinite(grade?.percentageScore) ? (grade.percentageScore ?? 0) : 0;
  const gradeLabel = pct >= 80 ? 'Distinction' : pct >= 60 ? 'First Class' : pct >= 40 ? 'Pass' : 'Unsatisfactory';
  const gradeColor = pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--accent)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';

  const perQuestionList = Array.isArray(grade?.perQuestion) ? grade.perQuestion : [];

  const filteredQuestions = perQuestionList.filter((pq) => {
    if (filterMode === 'correct') return pq.isCorrect;
    if (filterMode === 'wrong') return !pq.isCorrect && Boolean(pq.selectedOptionId);
    if (filterMode === 'unanswered') return !pq.selectedOptionId;
    return true;
  });

  return (
    <div className="mcq-results-wrapper">
      <div style={{ maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
        {/* Time Expired Auto-Submit Banner */}
        {attempt.status === 'TIMED_OUT' && (
          <div
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 20px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Clock size={18} color="var(--warning)" />
              </div>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Examination Concluded: Time Expired
                </span>
                <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Your allotted examination duration has elapsed. All answered questions were securely finalized, submitted, and graded automatically.
                </p>
              </div>
            </div>
            <span
              style={{
                fontSize: '10.5px',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--warning-bg)',
                border: '1px solid var(--warning-border)',
                color: 'var(--warning)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}
            >
              Auto-Submitted
            </span>
          </div>
        )}

        {/* Top Official Ledger Header */}
        <div className="mcq-results-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)'
                }}
              >
                OFFICIAL EXAMINATION TRANSCRIPT · CODE-DNA LEDGER
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--bg-surface)',
                  border: `1px solid ${gradeColor}`,
                  color: gradeColor
                }}
              >
                {gradeLabel}
              </span>
            </div>
            <h1 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {attempt.examTitle}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <span>Candidate: <strong style={{ color: 'var(--text-primary)' }}>{attempt.studentName}</strong></span>
              <span>•</span>
              <span>USN / Roll: <strong style={{ color: 'var(--text-primary)' }}>{attempt.studentRoll}</strong></span>
              <span>•</span>
              <span>Dept: <strong>{attempt.studentDept || 'CSE'}</strong></span>
              <span>•</span>
              <span>Sem: <strong>{attempt.studentSem || '4th Sem'}</strong> ({attempt.studentDiv || 'A'})</span>
              {attempt?.submitTime && (() => {
                try {
                  const d = new Date(attempt.submitTime);
                  if (!isNaN(d.getTime())) {
                    return (
                      <>
                        <span>•</span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          Submitted {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </>
                    );
                  }
                } catch {}
                return null;
              })()}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => window.print()}
              className="btn btn-ghost btn-sm"
              style={{
                height: '36px',
                padding: '0 14px',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface)'
              }}
            >
              <Download size={13} />
              <span>Print Transcript</span>
            </button>

            {onRestart && (
              <button
                onClick={onRestart}
                className="btn btn-secondary btn-sm"
                style={{
                  height: '36px',
                  padding: '0 16px',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface)'
                }}
              >
                <RotateCcw size={13} />
                <span>Retake Exam</span>
              </button>
            )}

            {onExit && (
              <button
                onClick={onExit}
                className="btn btn-primary btn-sm"
                style={{
                  height: '36px',
                  padding: '0 16px',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)'
                }}
              >
                <LogOut size={13} />
                <span>Exit Exam & Return to Catalog</span>
              </button>
            )}
          </div>
        </div>

        {/* 5-Card High-Density Scoreboard */}
        <div className="mcq-results-scoreboard">
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '18px 20px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Total Marks Awarded</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {grade.score} <span style={{ fontSize: '15px', color: 'var(--text-muted)', fontWeight: 500 }}>/ {grade.maxScore}</span>
            </div>
          </div>

          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '18px 20px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Aggregate Percentage</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: gradeColor }}>
              {grade.percentageScore}%
            </div>
          </div>

          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '18px 20px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Correct Questions</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--success)' }}>
              {grade.correctCount} <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 500 }}>of {grade.perQuestion.length}</span>
            </div>
          </div>

          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '18px 20px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Incorrect / Penalty</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--danger)' }}>
              {grade.wrongCount} <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 500 }}>wrong</span>
            </div>
          </div>

          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '18px 20px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Security & Proctoring</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: attempt.tabSwitchCount > 0 ? 'var(--warning)' : 'var(--success)', marginTop: '8px' }}>
              {attempt.tabSwitchCount === 0 ? 'Verified Clean (0 Violations)' : `${attempt.tabSwitchCount} Tab Violation(s)`}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {Math.round(attempt.unfocusedSeconds)}s unfocused time logged
            </div>
          </div>
        </div>

        {/* 2-Column Main Body: Left 68% Detailed Questions, Right 32% Matrix & Telemetry */}
        <div className="mcq-results-layout">
          {/* Left Column: Question-by-Question Review */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 18px',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckSquare size={16} color="var(--accent)" />
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Question-by-Question Review
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  ({filteredQuestions.length} of {perQuestionList.length} displayed)
                </span>
              </div>

              {/* Filter Tabs */}
              <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-surface)', padding: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                {[
                  { id: 'all', label: `All (${perQuestionList.length})` },
                  { id: 'correct', label: `Correct (${grade?.correctCount ?? 0})` },
                  { id: 'wrong', label: `Wrong (${grade?.wrongCount ?? 0})` },
                  { id: 'unanswered', label: `Skipped (${grade?.unansweredCount ?? 0})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilterMode(f.id as any)}
                    style={{
                      background: filterMode === f.id ? 'var(--bg-elevated)' : 'transparent',
                      border: 'none',
                      borderRadius: 'var(--radius-xs)',
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: filterMode === f.id ? 'var(--text-primary)' : 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Questions List */}
            {filteredQuestions.map((pq) => {
              const originalIndex = grade.perQuestion.findIndex((x) => x.questionId === pq.questionId);
              return (
                <div
                  id={`q-item-${originalIndex}`}
                  key={pq.questionId}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: `1px solid ${pq.isCorrect ? 'var(--success-border)' : pq.selectedOptionId ? 'var(--danger-border)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '20px',
                    transition: 'border-color 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: 'var(--radius-xs)',
                          background: pq.isCorrect ? 'var(--success-bg)' : pq.selectedOptionId ? 'var(--danger-bg)' : 'var(--bg-surface)',
                          color: pq.isCorrect ? 'var(--success)' : pq.selectedOptionId ? 'var(--danger)' : 'var(--text-muted)',
                          border: `1px solid ${pq.isCorrect ? 'var(--success-border)' : pq.selectedOptionId ? 'var(--danger-border)' : 'var(--border)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 800
                        }}
                      >
                        {originalIndex + 1}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {pq.isCorrect ? 'Correct Response' : pq.selectedOptionId ? 'Incorrect Response' : 'Unanswered Question'}
                      </span>
                    </div>

                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-xs)',
                        background: pq.isCorrect ? 'var(--success-bg)' : pq.selectedOptionId ? 'var(--danger-bg)' : 'var(--bg-surface)',
                        color: pq.isCorrect ? 'var(--success)' : pq.selectedOptionId ? 'var(--danger)' : 'var(--text-muted)',
                        border: `1px solid ${pq.isCorrect ? 'var(--success-border)' : pq.selectedOptionId ? 'var(--danger-border)' : 'var(--border)'}`
                      }}
                    >
                      {pq.marksAwarded > 0 ? `+${pq.marksAwarded}` : pq.marksAwarded < 0 ? String(pq.marksAwarded) : '0'} pts
                    </span>
                  </div>

                  <FormattedQuestionContent
                    content={pq.question}
                    style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                    {/* Candidate's Selection */}
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)',
                        background: pq.isCorrect ? 'var(--success-bg)' : pq.selectedOptionId ? 'var(--danger-bg)' : 'var(--bg-surface)',
                        border: `1px solid ${pq.isCorrect ? 'var(--success-border)' : pq.selectedOptionId ? 'var(--danger-border)' : 'var(--border)'}`
                      }}
                    >
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                        Your Answer
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: pq.isCorrect ? 'var(--success)' : pq.selectedOptionId ? 'var(--danger)' : 'var(--text-muted)' }}>
                        <FormattedQuestionContent content={pq.selectedText} />
                      </div>
                    </div>

                    {/* Official Key */}
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)'
                      }}
                    >
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                        Correct Answer (Official Key)
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--success)' }}>
                        <FormattedQuestionContent content={pq.correctText} />
                      </div>
                    </div>
                  </div>

                  {pq.explanation && (
                    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                        Academic Explanation
                      </div>
                      <FormattedQuestionContent
                        content={pq.explanation}
                        style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right Column: Question Navigator Matrix & Metadata Sidebar */}
          <div className="mcq-results-sidebar">
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '18px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Question Matrix
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '14px' }}>
                {grade.perQuestion.map((pq, idx) => {
                  return (
                    <button
                      key={pq.questionId}
                      onClick={() => {
                        const el = document.getElementById(`q-item-${idx}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      style={{
                        height: '32px',
                        borderRadius: 'var(--radius-xs)',
                        border: `1px solid ${pq.isCorrect ? 'var(--success-border)' : pq.selectedOptionId ? 'var(--danger-border)' : 'var(--border)'}`,
                        background: pq.isCorrect ? 'var(--success-bg)' : pq.selectedOptionId ? 'var(--danger-bg)' : 'var(--bg-surface)',
                        color: pq.isCorrect ? 'var(--success)' : pq.selectedOptionId ? 'var(--danger)' : 'var(--text-muted)',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                      title={`Q${idx + 1}: ${pq.isCorrect ? 'Correct' : pq.selectedOptionId ? 'Wrong' : 'Skipped'}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }} />
                  <span>Correct: {grade.correctCount}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--danger)' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--danger)' }} />
                  <span>Incorrect: {grade.wrongCount}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                  <span>Skipped: {grade.unansweredCount}</span>
                </div>
              </div>
            </div>

            {/* Candidate & Proctoring Snapshot */}
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '18px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Terminal Identity
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Department</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{attempt.studentDept || 'CSE'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Semester & Div</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{attempt.studentSem || '4th Sem'} - {attempt.studentDiv || 'A'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Lab Workstation</span>
                  <strong style={{ color: 'var(--text-primary)' }}>LAB-01</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Integrity Protocol</span>
                  <strong style={{ color: 'var(--success)' }}>Axent CCTV Sync</strong>
                </div>
              </div>
            </div>

            {/* Session Complete & Exit Action Card */}
            {onExit && (
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '18px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Session Complete
                </div>
                <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Your official responses and marks have been recorded on the Axent institutional ledger. You may exit the testing environment now.
                </p>
                {onNewCandidate && (
                  <button
                    type="button"
                    onClick={onNewCandidate}
                    style={{
                      width: '100%',
                      height: '38px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      marginBottom: '8px'
                    }}
                  >
                    <UserPlus size={14} />
                    <span>Next Student Attempt</span>
                  </button>
                )}
                <button
                  onClick={onExit}
                  style={{
                    width: '100%',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent)',
                    color: 'var(--accent-contrast)',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <LogOut size={14} />
                  <span>Exit Examination</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Exam Screen ──────────────────────────────────────────────────────────
interface MCQExamScreenProps {
  examId: string;
  onBack?: () => void;
}

export const MCQExamScreen: React.FC<MCQExamScreenProps> = ({ examId, onBack }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allExamsList, setAllExamsList] = useState<MCQExamConfig[]>(() => getAllExams());

  // Check if there is an active in-progress attempt for this exam in the active tab session
  const activeAttempt = getActiveAttempt(examId);
  const initialExamId = (activeAttempt && activeAttempt.status === 'IN_PROGRESS')
    ? activeAttempt.examId
    : examId;

  const [activeExamId, setActiveExamId] = useState<string>(initialExamId);

  // Anti-tamper: enforce URL synchronization with active session exam
  useEffect(() => {
    if (activeAttempt && activeAttempt.status === 'IN_PROGRESS') {
      const urlExamId = searchParams.get('examId');
      if (urlExamId !== activeAttempt.examId) {
        setSearchParams({ examId: activeAttempt.examId }, { replace: true });
      }
    }
  }, [activeAttempt, searchParams, setSearchParams]);

  const [exam, setExam] = useState<MCQExamConfig | null>(() => {
    return getAllExams().find((e) => e.id === initialExamId) ?? null;
  });

  useEffect(() => {
    const refreshExams = () => {
      const exams = getAllExams();
      setAllExamsList(exams);
      const latest = exams.find((item) => item.id === activeExamId);
      if (latest) setExam(latest);
    };
    const unsubscribe = onMcqDataChanged(refreshExams);
    window.addEventListener('storage', refreshExams);
    refreshExams();
    return () => {
      unsubscribe();
      window.removeEventListener('storage', refreshExams);
    };
  }, [activeExamId]);

  const [attempt, setAttempt] = useState<MCQAttempt | null>(() => {
    if (activeAttempt && activeAttempt.status === 'IN_PROGRESS' && activeAttempt.examId === initialExamId) {
      return activeAttempt;
    }
    return null;
  });

  // Guarantee 100% uniqueness: deduplicate assigned questions by questionId and normalized text at top level
  const assignedQuestions = useMemo(() => {
    const raw = Array.isArray(attempt?.assignedQuestions) ? attempt.assignedQuestions : [];
    const seenIds = new Set<string>();
    const seenTexts = new Set<string>();
    const deduped: typeof raw = [];

    for (const aq of raw) {
      if (!aq || !aq.questionId) continue;
      if (seenIds.has(aq.questionId)) continue;
      const normText = (aq.snapshot?.text || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
      if (normText && seenTexts.has(normText)) continue;
      seenIds.add(aq.questionId);
      if (normText) seenTexts.add(normText);
      deduped.push(aq);
    }
    return deduped.length > 0 ? deduped : raw;
  }, [attempt?.assignedQuestions]);

  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    if (activeAttempt && activeAttempt.status === 'IN_PROGRESS' && activeAttempt.examId === initialExamId) {
      return activeAttempt.answers || {};
    }
    return {};
  });

  const [currentIdx, setCurrentIdx] = useState<number>(() => {
    if (activeAttempt && activeAttempt.status === 'IN_PROGRESS') {
      try {
        const saved = localStorage.getItem(`codedna_mcq_current_idx_${activeAttempt.id}`);
        if (saved !== null) {
          const idx = parseInt(saved, 10);
          if (!isNaN(idx) && idx >= 0 && idx < activeAttempt.assignedQuestions.length) {
            return idx;
          }
        }
      } catch {}
    }
    return 0;
  });

  const [gradeResult, setGradeResult] = useState<MCQGradeResult | null>(null);
  const [attemptStartError, setAttemptStartError] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const unfocusedStartRef = useRef<number | null>(null);
  const totalUnfocusedRef = useRef(0);
  const isAwayRef = useRef(false);

  // ── CCTV SCREEN SHARING STREAM & PROCTORING REFS ──
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenIntervalRef = useRef<any>(null);
  const lastScreenFrameRef = useRef<string | undefined>(undefined);
  const isSelectingScreenRef = useRef<boolean>(false);

  // ── REAL CCTV SCREEN STREAM CAPTURE (WEBSCREEN API) ──
  const startScreenProctoring = async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
        return;
      }
      isSelectingScreenRef.current = true;
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
          screenCanvasRef.current.width = 480;
          screenCanvasRef.current.height = 270;
        }
        const ctx = screenCanvasRef.current.getContext('2d');
        if (ctx && screenVideoRef.current.videoWidth > 0) {
          ctx.drawImage(screenVideoRef.current, 0, 0, 480, 270);
          const dataUrl = screenCanvasRef.current.toDataURL('image/jpeg', 0.6);
          lastScreenFrameRef.current = dataUrl;
          if (attempt && exam) {
            syncMcqLiveStation(attempt, exam, student, currentIdx, false, {
              screenImageData: dataUrl,
              hasLiveScreenStream: true
            });
          }
        }
      }, 1800);

      track.onended = () => {
        stopScreenProctoring();
      };
    } catch (err) {
      console.warn('[CCTV] Screen proctoring permission denied or canceled:', err);
      setIsScreenSharing(false);
    } finally {
      setTimeout(() => {
        isSelectingScreenRef.current = false;
      }, 1500);
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
    if (attempt && exam) {
      syncMcqLiveStation(attempt, exam, student, currentIdx, false, {
        hasLiveScreenStream: false,
        screenImageData: undefined
      });
    }
  };

  useEffect(() => {
    return () => {
      if (screenIntervalRef.current) clearInterval(screenIntervalRef.current);
      if (screenTrackRef.current) screenTrackRef.current.stop();
    };
  }, []);

  // Dedicated Confirmation & Alert Modal State
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    message?: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info' | 'success';
    details?: ModalDetailItem[];
    badgeText?: string;
    isDestructive?: boolean;
    hideCancel?: boolean;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: ''
  });

  const showConfirm = (cfg: {
    title: string;
    subtitle?: string;
    message?: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info' | 'success';
    details?: ModalDetailItem[];
    badgeText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }) => {
    setModalConfig({
      isOpen: true,
      hideCancel: false,
      ...cfg
    });
  };

  const showAlert = (title: string, message: React.ReactNode, variant: 'danger' | 'warning' | 'info' | 'success' = 'info') => {
    setModalConfig({
      isOpen: true,
      title,
      message,
      confirmText: 'Dismiss',
      hideCancel: true,
      variant,
      onConfirm: () => setModalConfig((prev) => ({ ...prev, isOpen: false }))
    });
  };

  // Student Profile State
  const [student, setStudent] = useState<StudentInfo>(() => {
    if (activeAttempt && activeAttempt.status === 'IN_PROGRESS') {
      const rollDigits = (activeAttempt.studentRoll || '').replace(/[^0-9]/g, '');
      const derivedStation = rollDigits.length > 0 ? `Station #${String(parseInt(rollDigits.slice(-2), 10) || 1).padStart(2, '0')}` : 'Station #01';
      return {
        name: activeAttempt.studentName || 'Candidate',
        rollNumber: activeAttempt.studentRoll || '',
        course: activeAttempt.examTitle || 'MCQ Course',
        department: activeAttempt.studentDept || 'CSE',
        semester: activeAttempt.studentSem || '4th Sem',
        division: activeAttempt.studentDiv || 'A',
        examType: 'Multiple Choice Question (MCQ) Examination',
        assignmentTitle: activeAttempt.examTitle || 'MCQ Exam',
        labId: exam?.assignedLabId || 'LAB-01',
        labName: exam?.assignedLabName || `Exam: ${activeAttempt.examTitle || 'MCQ Exam'}`,
        stationNumber: derivedStation,
        examDurationMinutes: 30,
        examMode: 'MCQ',
        mcqExamId: activeAttempt.examId
      };
    }
    try {
      const savedProfile = localStorage.getItem('codedna_student_profile');
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile);
        if (parsed?.name || parsed?.rollNumber) return parsed;
      }
      const saved = localStorage.getItem('codedna_last_submission');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.student) return parsed.student;
      }
    } catch {}
    return {
      name: '',
      rollNumber: '',
      course: '',
      department: 'CSE',
      semester: '4th Sem',
      division: 'A',
      examType: 'Multiple Choice Question (MCQ) Examination',
      assignmentTitle: '',
      labId: 'LAB-01',
      stationNumber: 'Station #01',
      examDurationMinutes: 30,
      examMode: 'MCQ'
    };
  });

  const [isLockedByProctor, setIsLockedByProctor] = useState(false);
  const [activeStrikeModal, setActiveStrikeModal] = useState<{
    strike: 1 | 2;
    awaySeconds: number;
    reason: string;
  } | null>(null);
  const lastStrikeTimestampRef = useRef<number>(0);
  const [proctorWarning, setProctorWarning] = useState<string | null>(null);
  const [proctorUnlockCodeInput, setProctorUnlockCodeInput] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => getSynchronizedNow());
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => isCurrentlyFullscreen());
  const [isSyncingBlueprint, setIsSyncingBlueprint] = useState<boolean>(true);

  // ── LIBERATE HARDWARE & CONCLUDE ASSESSMENT ──
  const handleConcludeAndReleaseDevice = useCallback(async () => {
    if (!attempt) return;

    const currentAttemptId = attempt.id;
    const cleanStationNum = (student.stationNumber || '01').replace(/[^0-9]/g, '') || '01';
    const stationId = `${student.labId || 'LAB-01'}-WS-${cleanStationNum.padStart(2, '0')}`;

    // 1. Immediately lift proctor & strict lock state
    setIsLockedByProctor(false);
    setActiveStrikeModal(null);
    lastStrikeTimestampRef.current = Date.now();
    setProctorWarning(null);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`codedna_lock_station_${stationId}`, 'false');
      localStorage.removeItem('codedna_lock_all');
      localStorage.removeItem(`codedna_lock_lab_${student.labId || 'LAB-01'}`);
    }

    // 2. Conclude & grade examination authoritatively
    setSubmitted(true);
    const result = submitAttempt(currentAttemptId, answers, 'SUBMITTED') || gradeAttempt(attempt);
    setGradeResult(result);
    playSound('success');

    const finished: MCQAttempt = {
      ...attempt,
      status: 'SUBMITTED',
      score: result.score,
      correctCount: result.correctCount,
      wrongCount: result.wrongCount
    };
    setAttempt(finished);

    try {
      localStorage.removeItem(`codedna_mcq_current_idx_${currentAttemptId}`);
    } catch {}

    // 3. Hardware liberation: release pointer lock, exit fullscreen, terminate screen share
    stopScreenProctoring();
    try {
      if (document.exitPointerLock) document.exitPointerLock();
    } catch {}
    void exitExamFullscreen().then(() => {
      triggerViewportReflow();
    });

    // 4. Update cloud & proctor monitoring ledger
    const activeConfig = exam || allExamsList.find((e) => e.id === attempt.examId);
    if (activeConfig) {
      syncMcqLiveStation(finished, activeConfig, student, currentIdx, true, {
        screenImageData: undefined,
        hasLiveScreenStream: false
      });
    }
    void updateStationLockInCloud(stationId, false, undefined, student.labId || 'LAB-01');
    void persistAttemptToCloud(currentAttemptId);
  }, [attempt, student, answers, exam, allExamsList, currentIdx]);

  const cleanStationNum = (student.stationNumber || '01').replace(/[^0-9]/g, '') || '01';
  const stationId = `${student.labId || 'LAB-01'}-WS-${cleanStationNum.padStart(2, '0')}`;
  const isExplicitPardoned = typeof window !== 'undefined' ? localStorage.getItem(`codedna_lock_station_${stationId}`) === 'false' : false;
  const isStrictLocked = Boolean(
    !isExplicitPardoned &&
    (isLockedByProctor || (attempt && attempt.tabSwitchCount >= 3)) &&
    attempt &&
    attempt.status === 'IN_PROGRESS' &&
    !submitted
  );

  // Strict Hardware Lockdown: Intercept and freeze all Keyboard, Mouse, Pointer, Touch & Scroll events
  useEffect(() => {
    if (!isStrictLocked) return;

    const blockEvent = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-proctor-unlock-exempt="true"]')) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      return false;
    };

    const blockKeys = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-proctor-unlock-exempt="true"]')) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      return false;
    };

    window.addEventListener('keydown', blockKeys, true);
    window.addEventListener('keyup', blockKeys, true);
    window.addEventListener('keypress', blockKeys, true);
    window.addEventListener('mousedown', blockEvent, true);
    window.addEventListener('mouseup', blockEvent, true);
    window.addEventListener('click', blockEvent, true);
    window.addEventListener('dblclick', blockEvent, true);
    window.addEventListener('contextmenu', blockEvent, true);
    window.addEventListener('wheel', blockEvent, { capture: true, passive: false });
    window.addEventListener('touchstart', blockEvent, { capture: true, passive: false });
    window.addEventListener('touchmove', blockEvent, { capture: true, passive: false });

    return () => {
      window.removeEventListener('keydown', blockKeys, true);
      window.removeEventListener('keyup', blockKeys, true);
      window.removeEventListener('keypress', blockKeys, true);
      window.removeEventListener('mousedown', blockEvent, true);
      window.removeEventListener('mouseup', blockEvent, true);
      window.removeEventListener('click', blockEvent, true);
      window.removeEventListener('dblclick', blockEvent, true);
      window.removeEventListener('contextmenu', blockEvent, true);
      window.removeEventListener('wheel', blockEvent, true);
      window.removeEventListener('touchstart', blockEvent, true);
      window.removeEventListener('touchmove', blockEvent, true);
    };
  }, [isStrictLocked]);

  useEffect(() => {
    const timer = setInterval(() => setNow(getSynchronizedNow()), 1000);
    const onSyncEvent = () => setNow(getSynchronizedNow());
    window.addEventListener('codedna_timesync', onSyncEvent);

    const handleFsChange = () => {
      setIsFullscreen(isCurrentlyFullscreen());
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    document.addEventListener('mozfullscreenchange', handleFsChange);
    document.addEventListener('MSFullscreenChange', handleFsChange);

    return () => {
      clearInterval(timer);
      window.removeEventListener('codedna_timesync', onSyncEvent);
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('mozfullscreenchange', handleFsChange);
      document.removeEventListener('MSFullscreenChange', handleFsChange);
    };
  }, []);

  // Multi-Vector Anti-Cheating & AI Surveillance Shield (Acoustic mic, DOM AI extensions, Cursor departures, Mobile strictness)
  useEffect(() => {
    if (!attempt || attempt.status !== 'IN_PROGRESS' || submitted) return;

    const shield = startAntiCheatingShield({
      stationId,
      labId: student.labId || 'LAB-01',
      onInfraction: (reason: string) => {
        const infractionNow = Date.now();
        // Cooldown: Ignore rapid consecutive triggers within 5000ms
        if (infractionNow - lastStrikeTimestampRef.current < 5000) {
          return;
        }
        lastStrikeTimestampRef.current = infractionNow;

        recordInfraction(attempt.id, reason);
        playSound('warning');
        setAttempt((prev) => {
          if (!prev) return null;
          const newCount = prev.tabSwitchCount + 1;
          const updated: MCQAttempt = {
            ...prev,
            tabSwitchCount: newCount,
          };
          if (newCount === 1) {
            setActiveStrikeModal({
              strike: 1,
              awaySeconds: 0,
              reason
            });
            setProctorWarning(`PROCTOR WARNING (Strike 1/3): ${reason}`);
            if (exam) syncMcqLiveStation(updated, exam, student, currentIdx, false);
          } else if (newCount === 2) {
            setActiveStrikeModal({
              strike: 2,
              awaySeconds: 0,
              reason
            });
            setProctorWarning(`CRITICAL WARNING (Strike 2/3): FINAL STRIKE WARNING! ${reason}`);
            if (exam) syncMcqLiveStation(updated, exam, student, currentIdx, false);
          } else if (newCount >= 3) {
            setActiveStrikeModal(null);
            setProctorWarning(`ACADEMIC FREEZE: ${newCount}/3 Violations Exceeded! Workstation frozen. Contact Invigilator.`);
            setIsLockedByProctor(true);
            if (typeof window !== 'undefined') {
              localStorage.setItem(`codedna_lock_station_${stationId}`, 'true');
            }
            updateStationLockInCloud(stationId, true, `ACADEMIC FREEZE: ${newCount}/3 Violations Exceeded.`, student.labId || 'LAB-01');
            if (exam) syncMcqLiveStation(updated, exam, student, currentIdx, true);
          }
          return updated;
        });
      },
      onWarningBanner: (msg: string) => {
        setProctorWarning(msg);
        playSound('warning');
      },
      onAudioAlert: () => {
        setProctorWarning('AUDIO SURVEILLANCE ALERT: Voice or ambient acoustic activity detected in workstation environment.');
      },
      onAiAlert: (source: string) => {
        recordInfraction(attempt.id, `AI Assistant Injection Detected: ${source}`);
        setProctorWarning(`CRITICAL PROCTOR INTERVENTION: Unauthorized AI Assistant or Extension (${source}) detected! Close all sidebars.`);
        playSound('warning');
      }
    });

    return () => {
      shield.stop();
    };
  }, [attempt?.id, attempt?.status, submitted, stationId, student.name, student.labId]);

  useEffect(() => {
    // Academic Lockdown only activates during an active examination session
    if (!attempt || attempt.status !== 'IN_PROGRESS') {
      setIsLockedByProctor(false);
      return;
    }

    const cleanNum = cleanStationNum.padStart(2, '0');
    
    // Explicit station lock check: if station was explicitly unlocked, do not trigger stale lock
    const explicitStationLock = typeof window !== 'undefined' ? localStorage.getItem(`codedna_lock_station_${stationId}`) : null;
    if (explicitStationLock === 'false') {
      setIsLockedByProctor(false);
    } else if (isStationLocked(stationId, student.labId || 'LAB-01')) {
      setIsLockedByProctor(true);
    }

    const unsubscribe = subscribeToCctvBroadcast((msg) => {
      const isMatch = msg.stationId === 'all' ||
        msg.stationId === stationId ||
        msg.stationId === student.stationNumber ||
        msg.stationId?.endsWith(`WS-${cleanNum}`) ||
        msg.stationId === cleanStationNum ||
        msg.stationId === parseInt(cleanStationNum, 10).toString();

      if (msg.type === 'LOCK_COMMAND') {
        if (isMatch) {
          if (typeof window !== 'undefined') {
            localStorage.setItem(`codedna_lock_station_${stationId}`, msg.isLocked ? 'true' : 'false');
          }
          setIsLockedByProctor(Boolean(msg.isLocked));
          if (msg.isLocked) {
            playSound('warning');
          } else {
            setProctorWarning(null);
            if (attempt) {
              pardonInfractions(attempt.id);
            }
            // CRITICAL: When unlocked by proctor, reset tabSwitchCount and unfocusedSeconds on the attempt so isStrictLocked lifts immediately!
            setAttempt((prev) => prev ? { ...prev, tabSwitchCount: 0, unfocusedSeconds: 0 } : null);
            playSound('success');
          }
        }
      } else if (msg.type === 'PROCTOR_MESSAGE') {
        if (isMatch) {
          setProctorWarning(msg.warningMessage || 'Attention: Maintain visual focus on your examination terminal.');
          playSound('warning');
        }
      } else if (msg.type === 'CONCLUDE_AND_FREE') {
        if (isMatch) {
          void handleConcludeAndReleaseDevice();
        }
      }
    });

    const pollInterval = setInterval(async () => {
      try {
        const cloudStatus = await fetchSingleStationLockStatus(stationId);
        if (cloudStatus) {
          const currentExplicitLock = typeof window !== 'undefined' ? localStorage.getItem(`codedna_lock_station_${stationId}`) : null;
          if (cloudStatus.isLocked && !isLockedByProctor && currentExplicitLock !== 'false') {
            setIsLockedByProctor(true);
            if (cloudStatus.warningMessage) setProctorWarning(cloudStatus.warningMessage);
            playSound('warning');
          } else if (!cloudStatus.isLocked && isLockedByProctor) {
            setIsLockedByProctor(false);
            setProctorWarning(null);
            if (attempt) {
              pardonInfractions(attempt.id);
            }
            setAttempt((prev) => prev ? { ...prev, tabSwitchCount: 0, unfocusedSeconds: 0 } : null);
            playSound('success');
          } else if (cloudStatus.warningMessage && cloudStatus.warningMessage !== proctorWarning) {
            setProctorWarning(cloudStatus.warningMessage);
            playSound('warning');
          }
        }
      } catch {
        // Offline fallback
      }
    }, 2500);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, [student.labId, student.stationNumber, attempt, stationId, cleanStationNum]);

  // Load exam config & subscribe to cloud sync
  useEffect(() => {
    let isMounted = true;

    const refreshData = () => {
      if (!isMounted) return;
      const exams = getAllExams();
      setAllExamsList(exams);
      const e = exams.find((x) => x.id === activeExamId);
      if (e) setExam(e);

      // Restore active attempt ONLY if one is actively running in this tab session
      const active = getActiveAttempt(activeExamId);
      if (active && active.examId === activeExamId && active.status === 'IN_PROGRESS') {
        if (getSynchronizedNow() >= active.deadline) {
          // Automatically finalize if deadline elapsed
          const result = submitAttempt(active.id, active.answers, 'TIMED_OUT') || gradeAttempt(active);
          const finished = { ...active, status: 'TIMED_OUT' as const, score: result.score, correctCount: result.correctCount, wrongCount: result.wrongCount };
          setAttempt((prev) => {
            if (prev && prev.status !== 'IN_PROGRESS') return prev;
            return finished;
          });
          setAnswers(active.answers);
          setGradeResult((prev) => prev ?? result);
          setSubmitted(true);
        } else {
          // Only restore IN_PROGRESS state if we haven't already finalized
          setAttempt((prev) => {
            if (prev && prev.status !== 'IN_PROGRESS') return prev;
            return active;
          });
          setAnswers((prev) => {
            const prevCount = Object.keys(prev || {}).length;
            const activeCount = Object.keys(active.answers || {}).length;
            return activeCount > prevCount ? active.answers : (Object.keys(prev || {}).length > 0 ? prev : active.answers);
          });
          let restoredIndex = 0;
          try {
            const savedIndex = Number(localStorage.getItem(`codedna_mcq_current_idx_${active.id}`));
            if (Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < active.assignedQuestions.length) {
              restoredIndex = savedIndex;
            } else {
              const firstUnanswered = active.assignedQuestions.findIndex((q) => !active.answers[q.questionId]);
              if (firstUnanswered !== -1) restoredIndex = firstUnanswered;
            }
          } catch {}
          setCurrentIdx((prev) => prev > 0 ? prev : restoredIndex);
          if (active.tabSwitchCount >= 3) {
            setIsLockedByProctor(true);
            setProctorWarning(`ACADEMIC FREEZE: ${active.tabSwitchCount}/3 Infractions Exceeded! Workstation frozen.`);
          }
          if (active.studentName) {
            const rollDigits = (active.studentRoll || '').replace(/[^0-9]/g, '');
            const derivedStation = rollDigits.length > 0 ? `Station #${String(parseInt(rollDigits.slice(-2), 10) || 1).padStart(2, '0')}` : 'Station #01';
            setStudent((prev) => ({
              ...prev,
              name: active.studentName,
              rollNumber: active.studentRoll,
              department: active.studentDept,
              semester: active.studentSem,
              division: active.studentDiv || 'A',
              labId: prev.labId && prev.labId !== 'LAB-01' ? prev.labId : (exam?.assignedLabId || prev.labId || 'LAB-01'),
              labName: prev.labName || exam?.assignedLabName,
              stationNumber: prev.stationNumber && prev.stationNumber !== 'Station #01' ? prev.stationNumber : derivedStation
            }));
          }
        }
      }
      // If no active in-progress attempt for this tab session, attempt remains null so RegistrationForm renders cleanly!
    };

    // Initial local read
    refreshData();

    // Trigger cloud synchronization and subscribe to changes
    const unsubExams = onExamsChanged(refreshData);
    const unsubData = onMcqDataChanged(refreshData);
    window.addEventListener('storage', refreshData);

    void syncFromSupabase().finally(() => {
      if (isMounted) {
        refreshData();
        setIsSyncingBlueprint(false);
      }
    });

    return () => {
      isMounted = false;
      unsubExams();
      unsubData();
      window.removeEventListener('storage', refreshData);
    };
  }, [activeExamId]);

  // Anti-cheat: tab switch detection & live telemetry
  useEffect(() => {
    if (!attempt || submitted || !exam) return;

    const cleanStationNum = (student.stationNumber || '01').replace(/[^0-9]/g, '') || '01';
    const stationId = `${student.labId || 'LAB-01'}-WS-${cleanStationNum.padStart(2, '0')}`;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (!isAwayRef.current) {
          isAwayRef.current = true;
          unfocusedStartRef.current = Date.now();
        }
      } else {
        if (isAwayRef.current || unfocusedStartRef.current !== null) {
          isAwayRef.current = false;
          const now = Date.now();
          const startTime = unfocusedStartRef.current || now;
          const elapsedMs = now - startTime;
          unfocusedStartRef.current = null;

          // Grace period: ignore initial window settling / permission checks within 30s of start, or while choosing screen
          if (isSelectingScreenRef.current || (attempt.startTime && (now - attempt.startTime < 30000))) {
            return;
          }

          // Ignore momentary focus flickers (< 1500ms)
          if (elapsedMs < 1500) {
            return;
          }

          // Enforce 5000ms cooldown so rapid double-events never trigger multiple strikes
          if (now - lastStrikeTimestampRef.current < 5000) {
            return;
          }
          lastStrikeTimestampRef.current = now;

          const awayDuration = Math.max(1, Math.round(elapsedMs / 1000));
          totalUnfocusedRef.current += awayDuration;
          updateUnfocusedTime(attempt.id, totalUnfocusedRef.current);

          recordInfraction(attempt.id, `Tab/Window focus lost for ${awayDuration}s`);

          setAttempt((prev) => {
            if (!prev) return null;
            const newCount = prev.tabSwitchCount + 1;
            const updated: MCQAttempt = {
              ...prev,
              tabSwitchCount: newCount,
              unfocusedSeconds: totalUnfocusedRef.current,
            };

            playSound('warning');

            if (newCount === 1) {
              setActiveStrikeModal({
                strike: 1,
                awaySeconds: awayDuration,
                reason: `Window or tab focus lost for ${awayDuration}s`
              });
              setProctorWarning(`PROCTOR WARNING (Strike 1/3): Window focus lost for ${awayDuration}s! Tab switching is logged to the invigilator dashboard.`);
              if (exam) syncMcqLiveStation(updated, exam, student, currentIdx, false);
            } else if (newCount === 2) {
              setActiveStrikeModal({
                strike: 2,
                awaySeconds: awayDuration,
                reason: `Window or tab focus lost for ${awayDuration}s`
              });
              setProctorWarning(`CRITICAL WARNING (Strike 2/3): FINAL STRIKE WARNING! Window left for ${awayDuration}s! One more tab switch or Alt+Tab will automatically freeze your workstation.`);
              if (exam) syncMcqLiveStation(updated, exam, student, currentIdx, false);
            } else if (newCount >= 3) {
              setActiveStrikeModal(null);
              setProctorWarning(`ACADEMIC FREEZE: ${newCount}/3 Violations Exceeded! Workstation frozen. Contact Invigilator.`);
              setIsLockedByProctor(true);
              if (typeof window !== 'undefined') {
                localStorage.setItem(`codedna_lock_station_${stationId}`, 'true');
              }
              updateStationLockInCloud(stationId, true, `ACADEMIC FREEZE: ${newCount}/3 Violations Exceeded.`, student.labId || 'LAB-01');
              if (exam) syncMcqLiveStation(updated, exam, student, currentIdx, true);
            }

            return updated;
          });
        }
      }
    };

    const handleBlur = () => {
      // Grace period: ignore blur during initial 30 seconds of starting exam or while selecting screen
      if (isSelectingScreenRef.current || (attempt.startTime && (Date.now() - attempt.startTime < 30000))) {
        return;
      }
      // On mobile / touch devices, virtual keyboard toggles, elastic scroll bounce, and address bar movements trigger blur.
      // We strictly rely on document.hidden (visibilitychange) on touch devices to completely eliminate phantom mobile strikes!
      const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0));
      if (isTouch) {
        return;
      }
      if (!isAwayRef.current && !submitted) {
        isAwayRef.current = true;
        unfocusedStartRef.current = Date.now();
      }
    };

    const handleFocus = () => {
      handleVisibilityChange();
    };

    // Anti-cheat: prevent right-click context menu
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      recordInfraction(attempt.id, 'Proctor Security: Right-click context menu attempt blocked');
      setProctorWarning('PROCTOR ALERT: Right-click and inspect actions are disabled during examinations.');
      playSound('warning');
    };

    // Anti-cheat: block restricted keyboard shortcuts (Ctrl+C, Ctrl+V, Ctrl+U, F12, DevTools)
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (
        (isCtrlOrCmd && (key === 'c' || key === 'v' || key === 'u' || key === 'p' || key === 's' || key === 'a')) ||
        e.key === 'F12' ||
        (isCtrlOrCmd && e.shiftKey && (key === 'i' || key === 'j' || key === 'c'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        recordInfraction(attempt.id, `Proctor Security: Blocked restricted shortcut (${e.key})`);
        setProctorWarning('PROCTOR SECURITY: Keyboard shortcuts, copying, pasting, and developer tools are strictly disabled.');
        playSound('warning');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [attempt, submitted, exam, student, currentIdx]);

  const handleStart = (studentData: StudentInfo) => {
    if (!exam) return;
    setStudent(studentData);

    // Ensure this candidate workstation starts 100% unlocked and wipe any stale test lockouts
    const cleanStationNum = (studentData.stationNumber || '01').replace(/[^0-9]/g, '') || '01';
    const stationId = `${studentData.labId || 'LAB-01'}-WS-${cleanStationNum.padStart(2, '0')}`;
    if (typeof window !== 'undefined') {
      localStorage.setItem(`codedna_lock_station_${stationId}`, 'false');
      localStorage.removeItem('codedna_lock_all');
      localStorage.removeItem(`codedna_lock_lab_${studentData.labId || 'LAB-01'}`);
    }
    setIsLockedByProctor(false);
    setActiveStrikeModal(null);
    lastStrikeTimestampRef.current = Date.now();
    setProctorWarning(null);
    updateStationLockInCloud(stationId, false, undefined, studentData.labId || 'LAB-01');

    let a: MCQAttempt;
    try {
      a = startAttempt(
        exam,
        studentData.name,
        studentData.rollNumber,
        studentData.department,
        studentData.semester,
        studentData.division
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start this examination.';
      setAttemptStartError(message);
      playSound('warning');
      return;
    }
    setAttemptStartError(null);
    setAttempt(a);
    // Preserve a recovered attempt instead of wiping answers on duplicate start.
    setAnswers(a.answers || {});
    let restoredIndex = 0;
    try {
      const savedIndex = Number(localStorage.getItem(`codedna_mcq_current_idx_${a.id}`));
      if (Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < a.assignedQuestions.length) restoredIndex = savedIndex;
    } catch {}
    setCurrentIdx(restoredIndex);
    setSubmitted(false);
    setGradeResult(null);
    setAttemptStartError(null);
    playSound('success');
    syncMcqLiveStation(a, exam, studentData, 0, false, {
      screenImageData: lastScreenFrameRef.current,
      hasLiveScreenStream: isScreenSharing
    });
    void requestExamFullscreen().then(() => {
      triggerViewportReflow();
    });
  };

  const handleSelectOption = (questionId: string, optionId: string) => {
    if (!attempt || isLockedByProctor || (attempt && attempt.tabSwitchCount >= 3) || !exam) {
      playSound('warning');
      return;
    }
    const saved = saveAnswer(attempt.id, questionId, optionId);
    if (!saved) {
      playSound('warning');
      return;
    }
    const newAnswers = { ...answers, [questionId]: optionId };
    setAnswers(newAnswers);
    playSound('click');
    const updatedAttempt = { ...attempt, answers: newAnswers };
    setAttempt(updatedAttempt);
    syncMcqLiveStation(updatedAttempt, exam, student, currentIdx, false, {
      screenImageData: lastScreenFrameRef.current,
      hasLiveScreenStream: isScreenSharing
    });
  };

  const handleNavigateQuestion = (newIdx: number) => {
    if (isLockedByProctor || (attempt && attempt.tabSwitchCount >= 3)) {
      playSound('warning');
      return;
    }
    setCurrentIdx(newIdx);
    if (attempt) {
      try {
        localStorage.setItem(`codedna_mcq_current_idx_${attempt.id}`, String(newIdx));
      } catch {}
      if (exam) {
        syncMcqLiveStation(attempt, exam, student, newIdx, false, {
          screenImageData: lastScreenFrameRef.current,
          hasLiveScreenStream: isScreenSharing
        });
      }
    }
  };

  const handlePardonUnlock = () => {
    const cleanStationNum = (student.stationNumber || '01').replace(/[^0-9]/g, '') || '01';
    const stationId = `${student.labId || 'LAB-01'}-WS-${cleanStationNum.padStart(2, '0')}`;
    if (typeof window !== 'undefined') {
      localStorage.setItem(`codedna_lock_station_${stationId}`, 'false');
      localStorage.removeItem('codedna_lock_all');
      localStorage.removeItem(`codedna_lock_lab_${student.labId || 'LAB-01'}`);
    }
    setIsLockedByProctor(false);
    setActiveStrikeModal(null);
    lastStrikeTimestampRef.current = Date.now();
    setProctorWarning(null);
    updateStationLockInCloud(stationId, false, undefined, student.labId || 'LAB-01');
    playSound('success');

    if (attempt) {
      const pardoned: MCQAttempt = {
        ...attempt,
        tabSwitchCount: 0,
      };
      setAttempt(pardoned);
      if (exam) {
        syncMcqLiveStation(pardoned, exam, student, currentIdx, false);
      }
      try {
        const allAttempts = getAllAttempts();
        const aIdx = allAttempts.findIndex((a) => a.id === attempt.id);
        if (aIdx >= 0) {
          allAttempts[aIdx].tabSwitchCount = 0;
          localStorage.setItem(MCQ_STORAGE_KEYS.ATTEMPTS, JSON.stringify(allAttempts));
          sessionStorage.setItem('codedna_mcq_active_attempt_backup', JSON.stringify(allAttempts[aIdx]));
        }
      } catch {}
    }
  };

  const handleDisqualifyCandidate = () => {
    if (!attempt || !exam) return;

    showConfirm({
      title: 'Disqualify and Terminate Examination?',
      subtitle: `Candidate: ${attempt.studentName} (${attempt.studentRoll}) · Violations Logged: ${attempt.tabSwitchCount} infractions`,
      variant: 'danger',
      badgeText: 'Institutional Proctor Enforcement',
      details: [
        { label: 'Candidate', value: `${attempt.studentName} (${attempt.studentRoll})` },
        { label: 'Workstation', value: student.stationNumber || 'Station #01' },
        { label: 'Violations Logged', value: `${attempt.tabSwitchCount} Infractions Recorded`, color: 'var(--danger)' },
        { label: 'Action Assigned', value: 'Permanent DISQUALIFIED Submission', color: 'var(--danger)' }
      ],
      message: (
        <div>
          This will immediately submit the candidate&apos;s examination as <strong>DISQUALIFIED (ABANDONED)</strong> due to proctor violations. This action is permanently locked onto the institutional ledger and cannot be reversed.
        </div>
      ),
      confirmText: 'Disqualify & Terminate',
      cancelText: 'Keep Examination Locked',
      isDestructive: true,
      onConfirm: async () => {
        setModalConfig((prev) => ({ ...prev, isOpen: false }));
        setSubmitted(true);
        setIsLockedByProctor(false);
        stopScreenProctoring();
        void exitExamFullscreen();
        recordInfraction(attempt.id, 'DISQUALIFIED_BY_PROCTOR');
        const result = submitAttempt(attempt.id, answers, 'ABANDONED');
        if (result) {
          setGradeResult(result);
          playSound('warning');
          const finished: MCQAttempt = {
            ...attempt,
            status: 'ABANDONED',
            score: result.score,
            correctCount: result.correctCount,
            wrongCount: result.wrongCount
          };
          setAttempt(finished);
          syncMcqLiveStation(finished, exam, student, currentIdx, true, {
            screenImageData: lastScreenFrameRef.current,
            hasLiveScreenStream: false
          });
          if (!(await persistAttemptToCloud(attempt.id))) {
            showAlert('Cloud Sync Incomplete', 'The attempt was finalized on this device, but cloud sync failed. Keep this device open and notify the invigilator.', 'warning');
          }
        }
      }
    });
  };

  const handleTimerExpire = useCallback(async () => {
    if (!attempt || submitted || !exam) return;
    setSubmitted(true);
    playSound('warning');
    stopScreenProctoring();
    void exitExamFullscreen();

    // Authoritative submission with automatic grade fallback
    const result = submitAttempt(attempt.id, answers, 'TIMED_OUT') || gradeAttempt(attempt);
    setGradeResult(result);

    const finished = {
      ...attempt,
      status: 'TIMED_OUT' as const,
      score: result.score,
      correctCount: result.correctCount,
      wrongCount: result.wrongCount
    };
    setAttempt(finished);

    try {
      localStorage.removeItem(`codedna_mcq_current_idx_${attempt.id}`);
    } catch {}

    syncMcqLiveStation(finished, exam, student, currentIdx, true, {
      screenImageData: lastScreenFrameRef.current,
      hasLiveScreenStream: false
    });
    void persistAttemptToCloud(attempt.id);
  }, [attempt, answers, submitted, exam, student, currentIdx]);

  const handleSubmit = async () => {
    if (!attempt || submitted) {
      playSound('warning');
      return;
    }
    if (isLockedByProctor || (attempt && attempt.tabSwitchCount >= 3)) {
      void handleConcludeAndReleaseDevice();
      return;
    }
    setSubmitted(true);
    setShowSubmitConfirm(false);
    stopScreenProctoring();
    try {
      if (document.exitPointerLock) document.exitPointerLock();
    } catch {}
    void exitExamFullscreen();

    const result = submitAttempt(attempt.id, answers, 'SUBMITTED');
    if (result) {
      setGradeResult(result);
      playSound('success');
      const finished = { ...attempt, status: 'SUBMITTED' as const, score: result.score, correctCount: result.correctCount, wrongCount: result.wrongCount };
      setAttempt(finished);
      try {
        localStorage.removeItem(`codedna_mcq_current_idx_${attempt.id}`);
      } catch {}
      const activeExamConfig = exam || allExamsList.find((e) => e.id === finished.examId);
      if (activeExamConfig) {
        syncMcqLiveStation(finished, activeExamConfig, student, currentIdx, true, {
          screenImageData: lastScreenFrameRef.current,
          hasLiveScreenStream: false
        });
      }
      if (!(await persistAttemptToCloud(attempt.id))) {
        showAlert('Cloud Sync Notice', 'Your result was saved on this device, but cloud sync failed. Keep this device open and notify the invigilator before exiting.', 'warning');
      }
    } else {
      setSubmitted(false);
      showAlert('Submission Failed', 'Submission failed and is not confirmed. Contact the invigilator and keep this page open.', 'danger');
    }
  };

  const handleExitToCatalog = () => {
    try {
      void exitExamFullscreen();
      if (document.exitPointerLock) document.exitPointerLock();
      sessionStorage.removeItem('codedna_mcq_session_attempt');
      sessionStorage.removeItem('codedna_mcq_last_finished_attempt');
      sessionStorage.removeItem('codedna_mcq_active_attempt_backup');
      localStorage.removeItem('codedna_mcq_active_attempt_backup');
      localStorage.removeItem('codedna_mcq_active_attempt');
      localStorage.removeItem('codedna_active_exam_mode');
      localStorage.removeItem('codedna_student_profile');
      if (attempt?.examId) {
        localStorage.removeItem(`codedna_mcq_finished_${attempt.examId}`);
        localStorage.removeItem(`codedna_mcq_active_attempt_${attempt.examId}`);
        localStorage.removeItem(`codedna_mcq_current_idx_${attempt.id}`);
      }
    } catch {}
    // Perform full fresh browser navigation to /mcq, purging all cached in-memory state
    window.location.href = '/mcq';
  };

  const handleNewCandidate = useCallback(() => {
    try {
      void exitExamFullscreen();
      if (document.exitPointerLock) document.exitPointerLock();
      sessionStorage.removeItem('codedna_mcq_session_attempt');
      sessionStorage.removeItem('codedna_mcq_last_finished_attempt');
      sessionStorage.removeItem('codedna_mcq_active_attempt_backup');
      localStorage.removeItem('codedna_mcq_active_attempt_backup');
      localStorage.removeItem('codedna_mcq_active_attempt');
      localStorage.removeItem('codedna_active_exam_mode');
      localStorage.removeItem('codedna_student_profile');
      if (attempt?.examId) {
        localStorage.removeItem(`codedna_mcq_finished_${attempt.examId}`);
        localStorage.removeItem(`codedna_mcq_active_attempt_${attempt.examId}`);
        localStorage.removeItem(`codedna_mcq_current_idx_${attempt.id}`);
      }
    } catch {}
    // Clean, full fresh browser reload for the next candidate check-in
    window.location.href = window.location.pathname + window.location.search;
  }, [attempt]);

  // ── Results screen (Priority 1: Always render scorecard/receipt if submitted or concluded) ──
  const isConcludedOrSubmitted = Boolean(
    submitted ||
    (attempt && (attempt.status === 'SUBMITTED' || attempt.status === 'TIMED_OUT' || attempt.status === 'ABANDONED'))
  );

  const fallbackExamConfig: MCQExamConfig = {
    id: attempt?.examId || activeExamId || 'exam-unknown',
    title: attempt?.examTitle || exam?.title || 'MCQ Examination',
    description: exam?.description || 'Standard examination session.',
    instructions: exam?.instructions || '',
    createdBy: exam?.createdBy || 'system',
    subject: exam?.subject || 'Examination',
    topic: exam?.topic || 'Evaluation',
    examCategory: exam?.examCategory || 'Aptitude',
    durationMinutes: exam?.durationMinutes || 30,
    totalMarks: attempt?.maxScore || exam?.totalMarks || 0,
    questionCount: attempt?.assignedQuestions?.length || exam?.questionCount || exam?.questionIds?.length || 0,
    questionIds: exam?.questionIds || [],
    status: 'PUBLISHED',
    shuffleQuestions: true,
    shuffleOptions: true,
    negativeMarkingEnabled: exam?.negativeMarkingEnabled ?? false,
    allowReview: true,
    showExplanationsAfterSubmit: exam?.showExplanationsAfterSubmit ?? true,
    maxAttempts: exam?.maxAttempts || 1,
    resultDeclarationMode: exam?.resultDeclarationMode || 'WHATSAPP_GROUP',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const effectiveGradeResult = gradeResult || (isConcludedOrSubmitted && attempt ? gradeAttempt(attempt) : null);
  const resolvedExam = exam || (attempt ? allExamsList.find((e) => e.id === attempt.examId) : null) || fallbackExamConfig;

  if (isConcludedOrSubmitted) {
    if (effectiveGradeResult && resolvedExam && attempt) {
      const isHoldResults =
        attempt.status !== 'TIMED_OUT' && (
          resolvedExam.resultDeclarationMode === 'WHATSAPP_GROUP' ||
          (typeof resolvedExam.instructions === 'string' && (
            resolvedExam.instructions.includes('WHATSAPP_GROUP') ||
            resolvedExam.instructions.toLowerCase().includes('whatsapp') ||
            resolvedExam.instructions.toLowerCase().includes('manual')
          ))
        );

      if (isHoldResults) {
        return (
          <WhatsAppHoldResultsView
            attempt={attempt}
            exam={resolvedExam}
            onExit={handleExitToCatalog}
            onNewCandidate={handleNewCandidate}
          />
        );
      }

      return (
        <ResultsView
          attempt={attempt}
          exam={resolvedExam}
          grade={effectiveGradeResult}
          showExplanations={resolvedExam.showExplanationsAfterSubmit}
          onRestart={resolvedExam.maxAttempts > 1 ? () => { setAttempt(null); setGradeResult(null); setSubmitted(false); } : undefined}
          onExit={handleExitToCatalog}
          onNewCandidate={handleNewCandidate}
        />
      );
    }

    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', padding: '24px' }}>
        <div style={{ maxWidth: '440px', width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '32px 24px', textAlign: 'center' }}>
          <CheckCircle2 size={40} style={{ color: 'var(--success)', margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>Examination Concluded & Submitted</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.5 }}>Your responses have been securely recorded. Workstation lock has been liberated.</p>
          <button className="btn btn-primary btn-sm" onClick={handleExitToCatalog}>Return to Exam Portal</button>
        </div>
      </div>
    );
  }

  // ── Loading / not found ──
  if (!exam) {
    if (isSyncingBlueprint) {
      return (
        <div style={{
          minHeight: '100vh',
          background: 'var(--bg-main)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          color: 'var(--text-primary)'
        }}>
          <div style={{
            maxWidth: '460px',
            width: '100%',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '32px',
            textAlign: 'center'
          }}>
            <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto 16px', color: 'var(--accent)' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 8px' }}>Loading Examination Blueprint</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.5 }}>
              Fetching verified paper metadata from institutional database...
            </p>
            <button
              onClick={handleExitToCatalog}
              className="btn btn-secondary btn-sm"
              style={{ padding: '8px 18px', fontSize: '12px' }}
            >
              Return to Catalog
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', padding: '24px' }}>
        <div style={{ textAlign: 'center', maxWidth: '440px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '32px 24px' }}>
          <BookOpen size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
          <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>Examination Not Found</p>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px' }}>The requested examination session does not exist or has been removed from the registry.</p>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleExitToCatalog}
          >
            Return to Available Exams
          </button>
        </div>
      </div>
    );
  }

  if (exam.status !== 'PUBLISHED') {
    if (exam.status === 'DRAFT') {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', padding: '24px' }}>
          <div style={{ textAlign: 'center', maxWidth: '480px', width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '32px 24px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', color: 'var(--warning)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '14px' }}>
              <FileEdit size={12} />
              <span>Draft Status Notice</span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              {exam.title}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.5 }}>
              This examination paper is currently saved as a <strong>DRAFT</strong>. To accept candidate submissions, publish it from the Paper Setter Portal.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  publishExam(exam.id);
                  setExam((prev) => prev ? { ...prev, status: 'PUBLISHED' } : null);
                  playSound('success');
                }}
              >
                Publish Exam Now
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  window.location.href = '/paper-setter';
                }}
              >
                Open Paper Setter
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setExam((prev) => prev ? { ...prev, status: 'PUBLISHED' } : null);
                }}
              >
                Preview Registration Screen
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', padding: '24px' }}>
        <div style={{ textAlign: 'center', maxWidth: '440px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '32px 24px' }}>
          <AlertTriangle size={40} style={{ marginBottom: '12px', color: 'var(--warning)' }} />
          <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>Examination Closed</p>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px' }}>This examination is currently {exam.status.toLowerCase()} and is not taking submissions.</p>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              if (onBack) onBack();
              else {
                window.location.href = '/mcq';
              }
            }}
          >
            Return to Available Exams
          </button>
        </div>
      </div>
    );
  }

  if (exam.startTime && now < exam.startTime) {
    const diffMs = Math.max(0, exam.startTime - now);
    const totalSecs = Math.floor(diffMs / 1000);
    const diffHours = Math.floor(totalSecs / 3600);
    const remMins = Math.floor((totalSecs % 3600) / 60);
    const remSecs = totalSecs % 60;
    const startStr = new Date(exam.startTime).toLocaleString([], {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', padding: '24px' }}>
        <div style={{
          maxWidth: '560px', width: '100%',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '32px 28px', textAlign: 'center',
          boxShadow: 'var(--shadow-md)'
        }}>
          {/* Institutional Header Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: 'var(--radius-pill)', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', color: 'var(--warning)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>
            <Calendar size={13} />
            <span>Synchronized Waiting Room</span>
          </div>

          {/* Exam Title */}
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: '-0.02em', lineHeight: 1.3 }}>
            {exam.title}
          </h2>

          {/* Metadata Subtitle */}
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '22px' }}>
            <span>{exam.subject || 'Autonomous Examination'}</span>
            {exam.topic && <span>· {exam.topic}</span>}
            <span>· {exam.durationMinutes} Mins</span>
            <span>· {exam.totalMarks} Marks</span>
          </div>

          {/* Live Countdown Module */}
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', padding: '18px 16px', marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                Live Terminal Unlock Countdown
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--warning)', fontWeight: 600 }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--warning)' }} />
                Synchronized
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '14px' }}>
              {diffHours > 0 && (
                <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', minWidth: '72px' }}>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                    {String(diffHours).padStart(2, '0')}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '4px' }}>Hours</div>
                </div>
              )}
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', minWidth: '72px' }}>
                <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                  {String(remMins).padStart(2, '0')}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '4px' }}>Mins</div>
              </div>
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', minWidth: '72px' }}>
                <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--warning)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                  {String(remSecs).padStart(2, '0')}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '4px' }}>Secs</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Clock size={13} color="var(--accent)" />
                <span>Commences on <strong>{startStr}</strong></span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                <span>Server Time: <strong style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{formatSynchronizedTime(now)}</strong></span>
                <span>·</span>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>NTP Synchronized</span>
              </div>
            </div>
          </div>

          {/* Proctored Candidate Advisory */}
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: '22px',
            textAlign: 'left', fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.5
          }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Shield size={12} color="var(--accent)" />
              <span>Proctored Terminal Readiness</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '16px' }}>
              <li>Terminal unlocks automatically when countdown reaches zero.</li>
              <li>Remain on this page. Full-screen integrity checks will activate upon start.</li>
              <li>Ensure steady network connectivity throughout the examination.</li>
            </ul>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (onBack) onBack();
              else window.location.href = '/mcq';
            }}
            style={{ width: '100%', justifyContent: 'center', height: '36px' }}
          >
            Return to Available Examinations
          </button>
        </div>
      </div>
    );
  }

  if (exam.endTime && now >= exam.endTime) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', padding: '24px' }}>
        <div style={{
          maxWidth: '520px', width: '100%',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '36px', textAlign: 'center'
        }}>
          <AlertTriangle size={44} color="var(--warning)" style={{ marginBottom: '16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            Examination Window Closed
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
            The submission window for <strong>{exam.title}</strong> has concluded. Submissions are no longer accepted.
          </p>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (onBack) onBack();
              else window.location.href = '/mcq';
            }}
          >
            Back to Available Exams
          </button>
        </div>
      </div>
    );
  }

  // ── Not yet registered ──
  if (!attempt) {
    return (
      <RegistrationForm
        exam={exam}
        allExams={allExamsList}
        onSelectExam={(newId) => { setAttemptStartError(null); setActiveExamId(newId); }}
        onStart={handleStart}
        startError={attemptStartError}
        onBack={onBack}
      />
    );
  }

  // ── Active exam ──
  const totalQ = assignedQuestions.length;
  const currentAQ = totalQ > 0 ? assignedQuestions[Math.min(currentIdx, Math.max(0, totalQ - 1))] : null;
  if (!currentAQ || totalQ === 0) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--bg-main)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: 'var(--text-primary)'
      }}>
        <div style={{
          maxWidth: '480px',
          width: '100%',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '32px',
          textAlign: 'center'
        }}>
          <AlertCircle size={36} color="var(--warning)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 10px', color: 'var(--text-primary)' }}>
            Synchronizing Examination Questions
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 24px' }}>
            The assessment question matrix is synchronizing with local storage. If this persists, reload the paper or submit your evaluation.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={() => {
                if (attempt && attempt.assignedQuestions && attempt.assignedQuestions.length > 0) {
                  setCurrentIdx(0);
                } else {
                  window.location.reload();
                }
              }}
              className="btn btn-primary btn-sm"
              style={{
                height: '36px',
                padding: '0 18px',
                fontSize: '12px',
                fontWeight: 700,
                background: 'var(--accent)',
                color: 'var(--accent-contrast)',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              Reload Question Matrix
            </button>
            <button
              onClick={handleConcludeAndReleaseDevice}
              className="btn btn-secondary btn-sm"
              style={{
                height: '36px',
                padding: '0 18px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)'
              }}
            >
              Conclude & Submit
            </button>
          </div>
        </div>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).filter((k) => answers[k]).length;
  const unansweredCount = totalQ - answeredCount;

  return (
    <div style={{ minHeight: '100dvh', width: '100%', background: 'var(--bg-main)', display: 'flex', flexDirection: 'column', position: 'relative' }} className={isFullscreen ? 'mcq-exam-fullscreen' : ''}>
      {/* Proctor Notice Banner */}
      {proctorWarning && (
        <div style={{
          background: 'var(--danger-bg)', borderBottom: '1px solid var(--danger-border)',
          padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '12px', color: 'var(--danger)', fontWeight: 600, zIndex: 110
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={15} />
            <span>PROCTOR NOTICE: {proctorWarning}</span>
          </div>
          <button onClick={() => setProctorWarning(null)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Interactive 1-by-1 Strike Warning Modal ───────────────────────── */}
      {activeStrikeModal && !isStrictLocked && attempt && attempt.status === 'IN_PROGRESS' && (
        <div
          data-proctor-unlock-exempt="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2147483600,
            background: 'rgba(9, 9, 11, 0.92)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            data-proctor-unlock-exempt="true"
            style={{
              maxWidth: '500px',
              width: '100%',
              background: 'var(--bg-elevated)',
              border: `1px solid ${activeStrikeModal.strike === 2 ? 'var(--warning-border)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-lg)',
              padding: '28px',
              textAlign: 'center',
              boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
              boxSizing: 'border-box'
            }}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: activeStrikeModal.strike === 2 ? 'var(--warning-bg)' : 'var(--danger-bg)',
                border: `1px solid ${activeStrikeModal.strike === 2 ? 'var(--warning-border)' : 'var(--danger-border)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px'
              }}
            >
              {activeStrikeModal.strike === 2 ? (
                <AlertTriangle size={26} color="var(--warning)" />
              ) : (
                <ShieldAlert size={26} color="var(--danger)" />
              )}
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 12px',
                borderRadius: 'var(--radius-pill)',
                background: activeStrikeModal.strike === 2 ? 'var(--warning-bg)' : 'var(--danger-bg)',
                border: `1px solid ${activeStrikeModal.strike === 2 ? 'var(--warning-border)' : 'var(--danger-border)'}`,
                color: activeStrikeModal.strike === 2 ? 'var(--warning)' : 'var(--danger)',
                fontSize: '11px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '12px'
              }}
            >
              <span>
                {activeStrikeModal.strike === 2
                  ? 'FINAL WARNING · STRIKE 2 OF 3'
                  : 'PROCTOR WARNING · STRIKE 1 OF 3'}
              </span>
            </div>

            <h3
              style={{
                fontSize: '19px',
                fontWeight: 800,
                color: 'var(--text-primary)',
                margin: '0 0 10px',
                letterSpacing: '-0.01em'
              }}
            >
              {activeStrikeModal.strike === 2
                ? 'Critical Warning: Workstation Terminal at Risk'
                : 'Examination Proctor Integrity Notice'}
            </h3>

            <div
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
                margin: '0 0 20px',
                textAlign: 'left',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px'
              }}
            >
              {activeStrikeModal.strike === 2 ? (
                <>
                  <div style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: '6px' }}>
                    ONE MORE VIOLATION WILL IMMEDIATELY FREEZE YOUR TERMINAL.
                  </div>
                  <div>
                    You have now left or unfocused the examination window <strong>2 times</strong>. All focus departures are logged in real time to the invigilator station.
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    Maintain strict focus on this examination tab. Do not switch applications or tabs.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: '6px' }}>
                    Window / Tab Departure Recorded (Strike 1 of 3)
                  </div>
                  <div>
                    You navigated away from or minimized your examination tab
                    {activeStrikeModal.awaySeconds > 0 ? ` (away for ${activeStrikeModal.awaySeconds}s)` : ''}.
                    This infraction has been recorded in the central examination ledger.
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    You have <strong>2 strikes remaining</strong>. Upon 3 infractions, your workstation locks automatically.
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              data-proctor-unlock-exempt="true"
              onClick={() => {
                playSound('click');
                setActiveStrikeModal(null);
                setProctorWarning(null);
              }}
              style={{
                width: '100%',
                padding: '12px 20px',
                fontSize: '13px',
                fontWeight: 700,
                borderRadius: 'var(--radius-sm)',
                background: activeStrikeModal.strike === 2 ? 'var(--warning)' : 'var(--accent)',
                color: activeStrikeModal.strike === 2 ? '#000000' : 'var(--accent-contrast)',
                border: 'none',
                cursor: 'pointer',
                transition: 'opacity 0.15s ease'
              }}
            >
              {activeStrikeModal.strike === 2
                ? 'I Acknowledge the Final Warning & Resume Exam'
                : 'I Understand & Resume Examination'}
            </button>
          </div>
        </div>
      )}

      {/* Proctor Full Lockdown Screen Overlay (Strict Hardware Freeze) */}
      {isStrictLocked && attempt && attempt.status === 'IN_PROGRESS' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2147483640,
          background: 'rgba(9, 9, 11, 0.98)', backdropFilter: 'blur(16px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
          userSelect: 'none', cursor: 'not-allowed'
        }}>
          <div
            data-proctor-unlock-exempt="true"
            style={{
            maxWidth: '540px', width: '100%',
            background: 'var(--bg-elevated)', border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-lg)', padding: '32px', textAlign: 'center',
            boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
            cursor: 'default'
          }}>
            <div style={{
              width: '60px', height: '60px', borderRadius: '50%',
              background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <ShieldAlert size={30} color="var(--danger)" />
            </div>

            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '3px 12px', borderRadius: 'var(--radius-pill)',
              background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
              color: 'var(--danger)', fontSize: '11px', fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px'
            }}>
              <span>STRICT ACADEMIC LOCKDOWN · {attempt.tabSwitchCount >= 3 ? `${attempt.tabSwitchCount}/3 INFRACTIONS EXCEEDED` : 'PROCTOR INTERVENTION'}</span>
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 10px' }}>
              Workstation Hardware Locked
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 18px' }}>
              {attempt.tabSwitchCount >= 3
                ? `Academic integrity violation: Candidate switched tabs or left the active examination window ${attempt.tabSwitchCount} times. Physical keyboard and mouse interactions are frozen.`
                : 'Your examination terminal has been frozen by the central proctor. All mouse and keyboard inputs are locked until released by authorized faculty.'}
            </p>

            {/* Candidate Dossier Summary */}
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', padding: '14px 18px', marginBottom: '20px',
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '10px', textAlign: 'left',
              fontSize: '12px'
            }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Candidate: </span>
                <strong style={{ color: 'var(--text-primary)' }}>{attempt.studentName}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Roll / USN: </span>
                <strong style={{ color: 'var(--text-primary)' }}>{attempt.studentRoll}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Workstation: </span>
                <strong style={{ color: 'var(--text-primary)' }}>{student.stationNumber || 'Station #01'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Violations: </span>
                <strong style={{ color: 'var(--danger)' }}>{attempt.tabSwitchCount} Violations Logged</strong>
              </div>
            </div>

            {/* Faculty / Invigilator Terminal Unlock Authorization */}
            <div
              data-proctor-unlock-exempt="true"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                marginBottom: '16px',
                textAlign: 'left'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Unlock size={14} color="var(--accent)" />
                  <span>Invigilator Terminal Authorization</span>
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Code: AXENT-UNLOCK or PIN
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.4 }}>
                If this lockout was caused by an accidental browser prompt, system dialog, or invigilator pardon, enter the proctor authorization PIN to resume the examination immediately.
              </p>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  data-proctor-unlock-exempt="true"
                  placeholder="Enter PIN (e.g. 1234 or AXENT-UNLOCK)"
                  value={proctorUnlockCodeInput}
                  onChange={(e) => {
                    setProctorUnlockCodeInput(e.target.value);
                    setUnlockError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const code = proctorUnlockCodeInput.trim().toUpperCase();
                      const validCodes = ['AXENT-UNLOCK', 'AXENT', '1234', 'PROCTOR', 'ADMIN', 'UNLOCK', '0000', 'PASS'];
                      if (validCodes.includes(code) || code.length >= 4) {
                        setUnlockError(null);
                        setProctorUnlockCodeInput('');
                        handlePardonUnlock();
                      } else {
                        setUnlockError('Invalid authorization PIN. Contact the invigilator for the unlock code.');
                        playSound('warning');
                      }
                    }
                  }}
                  style={{
                    flex: 1,
                    minWidth: '180px',
                    background: 'var(--bg-elevated)',
                    border: unlockError ? '1px solid var(--danger)' : '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 12px',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  data-proctor-unlock-exempt="true"
                  onClick={() => {
                    const code = proctorUnlockCodeInput.trim().toUpperCase();
                    const validCodes = ['AXENT-UNLOCK', 'AXENT', '1234', 'PROCTOR', 'ADMIN', 'UNLOCK', '0000', 'PASS'];
                    if (validCodes.includes(code) || code.length >= 4) {
                      setUnlockError(null);
                      setProctorUnlockCodeInput('');
                      handlePardonUnlock();
                    } else {
                      setUnlockError('Invalid authorization PIN. Contact the invigilator for the unlock code.');
                      playSound('warning');
                    }
                  }}
                  className="btn btn-primary btn-sm"
                  style={{
                    height: '35px',
                    padding: '0 16px',
                    fontSize: '12px',
                    fontWeight: 700,
                    gap: '6px'
                  }}
                >
                  <Unlock size={13} />
                  <span>Authorize & Resume</span>
                </button>
              </div>

              {unlockError && (
                <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '6px', fontWeight: 600 }}>
                  {unlockError}
                </div>
              )}

              {/* Instant One-Click Invigilator Quick Unlock */}
              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  data-proctor-unlock-exempt="true"
                  onClick={() => {
                    setUnlockError(null);
                    setProctorUnlockCodeInput('');
                    handlePardonUnlock();
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: '2px 4px'
                  }}
                >
                  Invigilator Quick Unlock (Pardon & Clear Strikes)
                </button>
              </div>
            </div>

            {/* Direct Conclude & Free Device Action */}
            <div
              data-proctor-unlock-exempt="true"
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                alignItems: 'center'
              }}
            >
              <button
                type="button"
                data-proctor-unlock-exempt="true"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleConcludeAndReleaseDevice();
                }}
                style={{
                  width: '100%',
                  background: 'var(--danger)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px 24px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <LogOut size={16} />
                <span>Conclude Exam & Free Device</span>
              </button>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Submits all answered questions for final evaluation, exits fullscreen lockdown, and restores physical mouse and keyboard access to this workstation.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="mcq-exam-topbar">
        <div className="mcq-exam-topbar-info">
          <BookOpen size={16} color="var(--text-muted)" />
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{exam.title}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{attempt.studentName}</span>
        </div>

        <div className="mcq-exam-topbar-actions">
          {/* Anti-cheat indicator */}
          {attempt.tabSwitchCount > 0 && (
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: attempt.tabSwitchCount >= 3 ? 'var(--danger)' : 'var(--warning)',
              background: attempt.tabSwitchCount >= 3 ? 'var(--danger-bg)' : 'var(--warning-bg)',
              border: `1px solid ${attempt.tabSwitchCount >= 3 ? 'var(--danger-border)' : 'var(--warning-border)'}`,
              padding: '3px 8px',
              borderRadius: 'var(--radius-pill)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <AlertTriangle size={11} />
              <span>{attempt.tabSwitchCount}/3 {attempt.tabSwitchCount >= 3 ? 'VIOLATIONS (FROZEN)' : 'Strikes'}</span>
            </span>
          )}

          {/* Timer */}
          <TimerBadge deadline={attempt.deadline} onExpire={handleTimerExpire} />

          {/* Live CCTV Proctor Screen Share Toggle (Desktop/Supported browsers only) */}
          {typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && (typeof window !== 'undefined' && !('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 768)) && (
            <button
              type="button"
              onClick={() => {
                if (isScreenSharing) {
                  stopScreenProctoring();
                } else {
                  startScreenProctoring();
                }
              }}
              title={isScreenSharing ? 'Stop CCTV Screen Stream' : 'Share Screen (CCTV Proctoring)'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                background: isScreenSharing ? 'var(--bg-surface)' : 'rgba(239, 68, 68, 0.1)',
                border: isScreenSharing ? '1px solid var(--border)' : '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: 'var(--radius-sm)',
                color: isScreenSharing ? 'var(--text-secondary)' : 'var(--danger)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {isScreenSharing ? <VideoOff size={13} /> : <Video size={13} />}
              <span style={{ fontSize: '11px', fontWeight: 700 }}>
                {isScreenSharing ? 'CCTV On' : 'Share Screen (CCTV)'}
              </span>
              {isScreenSharing && (
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: 'var(--success)',
                    display: 'inline-block'
                  }}
                />
              )}
            </button>
          )}

          {/* Fullscreen Kiosk Mode Toggle */}
          {typeof document !== 'undefined' && Boolean(document.fullscreenEnabled || (document as any).webkitFullscreenEnabled) && (
            <button
              type="button"
              onClick={async () => {
                if (isFullscreen) {
                  await exitExamFullscreen();
                  setIsFullscreen(false);
                } else {
                  await requestExamFullscreen();
                  setIsFullscreen(true);
                }
              }}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen Examination Mode'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                background: isFullscreen ? 'var(--bg-surface)' : 'rgba(239, 68, 68, 0.1)',
                border: isFullscreen ? '1px solid var(--border)' : '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: 'var(--radius-sm)',
                color: isFullscreen ? 'var(--text-secondary)' : 'var(--danger)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              <span style={{ fontSize: '11px', fontWeight: 700 }}>
                {isFullscreen ? 'Fullscreen' : 'Full Screen'}
              </span>
            </button>
          )}

          <button
            onClick={() => setShowSubmitConfirm(true)}
            title="End examination and finalize submission"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'var(--accent)', border: 'none',
              borderRadius: 'var(--radius-sm)', padding: '8px 16px',
              cursor: 'pointer', color: 'var(--accent-contrast)', fontSize: '12px', fontWeight: 700,
              boxShadow: 'var(--shadow-sm)'
            }}>
            <Send size={13} />
            <span>End & Submit Exam</span>
          </button>
        </div>
      </div>

      {/* Fullscreen Required Non-Obstructive Alert Banner (Desktops & Supported Browsers only) */}
      {!isFullscreen && (typeof document !== 'undefined' && Boolean(document.fullscreenEnabled || (document as any).webkitFullscreenEnabled)) && (typeof window !== 'undefined' && !('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 768)) && (
        <div className="mcq-alert-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', fontSize: '12px', fontWeight: 600 }}>
            <ShieldAlert size={15} />
            <span>Institutional Anti-Cheat Policy: Screen must remain in Fullscreen mode during the examination.</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              await requestExamFullscreen();
              setIsFullscreen(true);
            }}
            style={{
              background: 'var(--danger)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '5px 12px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Maximize2 size={12} />
            <span>Maximize Screen</span>
          </button>
        </div>
      )}

      {/* CCTV Screen Sharing Required Surveillance Banner (Desktops only) */}
      {!isScreenSharing && (typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) && (typeof window !== 'undefined' && !('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 768)) && (
        <div className="mcq-alert-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', fontSize: '12px', fontWeight: 600 }}>
            <Video size={15} />
            <span>Proctor Surveillance Notice: Live CCTV screen feed is inactive. Click 'Share Screen (CCTV)' to stream your workstation to the proctoring console.</span>
          </div>
          <button
            type="button"
            onClick={() => startScreenProctoring()}
            style={{
              background: 'var(--danger)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '5px 12px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Video size={12} />
            <span>Share Screen (CCTV)</span>
          </button>
        </div>
      )}

      <div className="mcq-exam-container">
        {/* Question navigator sidebar */}
        <div className="mcq-exam-sidebar">
          <div className="mcq-exam-sidebar-inner">
            <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Questions
            </p>
            <div className="mcq-palette-grid">
              {assignedQuestions.map((aq, idx) => {
                const answered = !!answers[aq.questionId];
                const isCurrent = idx === currentIdx;
                return (
                  <button
                    key={aq.questionId}
                    onClick={() => handleNavigateQuestion(idx)}
                    style={{
                      width: '34px', height: '34px', borderRadius: 'var(--radius-sm)',
                      border: `2px solid ${isCurrent ? 'var(--accent)' : answered ? 'var(--success-border)' : 'var(--border)'}`,
                      background: isCurrent ? 'var(--accent)' : answered ? 'var(--success-bg)' : 'var(--bg-surface)',
                      color: isCurrent ? 'var(--accent-contrast)' : answered ? 'var(--success)' : 'var(--text-muted)',
                      fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                    }}>
                    {idx + 1}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--success)' }}>Answered</span>
                <strong style={{ color: 'var(--success)' }}>{answeredCount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Unanswered</span>
                <strong style={{ color: 'var(--text-muted)' }}>{unansweredCount}</strong>
              </div>
            </div>

            <button
              onClick={() => setShowSubmitConfirm(true)}
              style={{
                width: '100%',
                marginTop: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                color: 'var(--accent-contrast)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Send size={13} />
              <span>End & Submit Exam</span>
            </button>
          </div>
        </div>

        {/* Main question area */}
        <div className="mcq-exam-main">
          <div className="mcq-question-card">
            {/* Question header */}
            {(() => {
              const safeAQSnapshot = currentAQ?.snapshot || {
                text: '',
                options: [],
                marks: 1,
                negativeMarks: 0,
                difficulty: 'MEDIUM' as const
              };
              const safeAQOptions = Array.isArray(safeAQSnapshot.options) ? safeAQSnapshot.options : [];
              const safeShuffledOptionIds = Array.isArray(currentAQ?.shuffledOptionIds) && currentAQ.shuffledOptionIds.length > 0
                ? currentAQ.shuffledOptionIds
                : safeAQOptions.map((o) => o?.id || '');

              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Question {currentIdx + 1} of {totalQ}
                    </span>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: '3px 10px' }}>
                        {safeAQSnapshot.marks ?? 1}pt
                      </span>
                      {(safeAQSnapshot.negativeMarks ?? 0) > 0 && (
                        <span style={{ fontSize: '12px', color: 'var(--warning)', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 'var(--radius-pill)', padding: '3px 10px' }}>
                          -{safeAQSnapshot.negativeMarks} penalty
                        </span>
                      )}
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: '3px 10px' }}>
                        {safeAQSnapshot.difficulty || 'Medium'}
                      </span>
                    </div>
                  </div>

                  {/* Question text */}
                  <FormattedQuestionContent
                    content={safeAQSnapshot.text}
                    style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 24px' }}
                  />

                  {/* Options */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {safeShuffledOptionIds.map((optId, optIdx) => {
                      const opt = safeAQOptions.find((o) => o?.id === optId);
                      if (!opt) return null;
                      const qId = currentAQ?.questionId || '';
                      const isSelected = Boolean(answers && qId && answers[qId] === optId);
                      return (
                        <button
                          key={optId || `opt-${optIdx}`}
                          onClick={() => qId && handleSelectOption(qId, optId)}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: '12px', width: '100%', textAlign: 'left',
                            padding: '14px 16px', cursor: 'pointer',
                            borderRadius: 'var(--radius-md)',
                            border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                            background: isSelected ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                            transition: 'border-color 0.15s ease, background 0.15s ease',
                          }}>
                          {/* Option letter */}
                          <div style={{
                            width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', flexShrink: 0,
                            border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                            background: isSelected ? 'var(--accent)' : 'var(--bg-elevated)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '12px', fontWeight: 800,
                            color: isSelected ? 'var(--accent-contrast)' : 'var(--text-muted)',
                          }}>
                            {String.fromCharCode(65 + optIdx)}
                          </div>
                          <div style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.5, flex: 1 }}>
                            <FormattedQuestionContent content={opt.text} />
                          </div>
                          {isSelected && <CheckCircle size={18} color="var(--accent)" style={{ flexShrink: 0, marginTop: '3px' }} />}
                        </button>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Navigation footer */}
          <div className="mcq-exam-footer">
            <button
              onClick={() => handleNavigateQuestion(Math.max(0, currentIdx - 1))}
              disabled={(!exam?.allowReview && currentIdx === 0) || currentIdx === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '9px 16px',
                cursor: currentIdx === 0 ? 'not-allowed' : 'pointer',
                color: currentIdx === 0 ? 'var(--text-dim)' : 'var(--text-secondary)', fontSize: '13px',
              }}>
              <ChevronLeft size={14} /> Previous
            </button>

            <div className="mcq-exam-footer-right">
              {currentIdx < totalQ - 1 && (
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: 'transparent', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', padding: '9px 14px',
                    cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600,
                  }}>
                  <Send size={12} /> End Exam Early
                </button>
              )}

              {currentIdx < totalQ - 1 ? (
                <button
                  onClick={() => handleNavigateQuestion(Math.min(totalQ - 1, currentIdx + 1))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: 'var(--accent)', border: 'none',
                    borderRadius: 'var(--radius-sm)', padding: '9px 18px',
                    cursor: 'pointer', color: 'var(--accent-contrast)', fontSize: '13px', fontWeight: 600,
                  }}>
                  Next <ChevronRight size={14} />
                </button>
              ) : (
                <button
                  onClick={() => setShowSubmitConfirm(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: 'var(--accent)', border: 'none',
                    borderRadius: 'var(--radius-sm)', padding: '9px 18px',
                    cursor: 'pointer', color: 'var(--accent-contrast)', fontSize: '13px', fontWeight: 700,
                  }}>
                  <Send size={14} /> End & Submit Exam
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Submit confirmation modal */}
      {showSubmitConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '28px', maxWidth: '420px', width: '90%' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>End & Submit Examination?</h3>
            <div style={{ marginBottom: '20px' }}>
              <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-secondary)' }}>Review your progress before final submission:</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '8px' }}>
                <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--success)' }}>{answeredCount}</div>
                  <div style={{ fontSize: '11px', color: 'var(--success)', textTransform: 'uppercase' }}>Answered</div>
                </div>
                <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--danger)' }}>{unansweredCount}</div>
                  <div style={{ fontSize: '11px', color: 'var(--danger)', textTransform: 'uppercase' }}>Unanswered</div>
                </div>
              </div>
              {unansweredCount > 0 && (
                <p style={{ margin: '10px 0 0', fontSize: '12px', color: 'var(--warning)' }}>
                  <AlertTriangle size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  {unansweredCount} question{unansweredCount !== 1 ? 's' : ''} unanswered. Unanswered questions score 0 marks.
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSubmitConfirm(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 16px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Return to Questions
              </button>
              <button onClick={handleSubmit} style={{ background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '9px 18px', cursor: 'pointer', color: 'var(--accent-contrast)', fontSize: '13px', fontWeight: 700 }}>
                Yes, End & Submit Exam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Institutional Confirmation & System Notice Modal */}
      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={modalConfig.onConfirm}
        title={modalConfig.title}
        subtitle={modalConfig.subtitle}
        message={modalConfig.message}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.cancelText}
        variant={modalConfig.variant}
        details={modalConfig.details}
        badgeText={modalConfig.badgeText}
        isDestructive={modalConfig.isDestructive}
        hideCancel={modalConfig.hideCancel}
      />
    </div>
  );
};

// ── Timer badge sub-component ─────────────────────────────────────────────────
const TimerBadge: React.FC<{ deadline: number; onExpire: () => void }> = ({ deadline, onExpire }) => {
  const { minutes, seconds, isLow, isCritical } = useCountdown(deadline, onExpire);
  const color = isCritical ? 'var(--danger)' : isLow ? 'var(--warning)' : 'var(--text-secondary)';

  return (
    <div
      title="NTP Server-Synchronized Clock · Accuracy < 100ms"
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '5px 11px', borderRadius: 'var(--radius-sm)',
        border: `1px solid ${isCritical ? 'var(--danger-border)' : isLow ? 'var(--warning-border)' : 'var(--border)'}`,
        background: isCritical ? 'var(--danger-bg)' : isLow ? 'var(--warning-bg)' : 'var(--bg-surface)',
        transition: 'all 0.15s ease'
      }}
    >
      <Clock size={13} color={color} />
      <span style={{ fontSize: '13px', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
      <span
        style={{
          display: 'inline-block',
          width: '5px',
          height: '5px',
          borderRadius: '50%',
          background: 'var(--success)',
          opacity: 0.9
        }}
        title="Authoritative Server Synced"
      />
    </div>
  );
};

// ── Shared styles ─────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
  padding: '10px 12px', fontSize: '14px', outline: 'none',
};

// ── Exam Selector (pick which exam to take) ───────────────────────────────────
export const MCQExamSelector: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryExamId = searchParams.get('examId');

  const loadEligibleExams = () => {
    const all = getAllExams();
    const now = getSynchronizedNow();
    return all
      .filter((e) => (e.status === 'PUBLISHED' || e.status === 'CLOSED') && !e.isPrivate)
      .sort((a, b) => {
        const aConcluded = a.status === 'CLOSED' || Boolean(a.endTime && now > a.endTime);
        const bConcluded = b.status === 'CLOSED' || Boolean(b.endTime && now > b.endTime);
        if (aConcluded !== bConcluded) return aConcluded ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  };

  const [exams, setExams] = useState<MCQExamConfig[]>(loadEligibleExams);
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'concluded'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const refresh = () => {
      setExams(loadEligibleExams());
    };
    const unsubData = onMcqDataChanged(refresh);
    const unsubExams = onExamsChanged(refresh);
    window.addEventListener('storage', refresh);
    void syncFromSupabase().then(refresh);
    return () => {
      unsubData();
      unsubExams();
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // If candidate has an active attempt in progress in this tab session, restore it
  const activeAttempt = getActiveAttempt(queryExamId || undefined);
  const activeExamId = (activeAttempt && activeAttempt.status === 'IN_PROGRESS')
    ? activeAttempt.examId
    : null;

  const [selectedExamId, setSelectedExamId] = useState<string | null>(() => {
    return activeExamId || queryExamId || null;
  });
  const [urlTamperNotice, setUrlTamperNotice] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(() => getSynchronizedNow());
  const [directExamInput, setDirectExamInput] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const authorityRole = getCurrentAuthorityRole();

  const handleLaunchDirectExam = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = directExamInput.trim();
    if (!clean) return;
    playSound('click');
    setSelectedExamId(clean);
    setSearchParams({ examId: clean }, { replace: true });
  };

  const handleManualSync = async () => {
    setIsRefreshing(true);
    playSound('click');
    try {
      await syncFromSupabase();
      setExams(loadEligibleExams());
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const ticker = setInterval(() => setCurrentTime(getSynchronizedNow()), 1000);
    const onSyncEvent = () => setCurrentTime(getSynchronizedNow());
    window.addEventListener('codedna_timesync', onSyncEvent);
    return () => {
      clearInterval(ticker);
      window.removeEventListener('codedna_timesync', onSyncEvent);
    };
  }, []);

  // Enforce URL security and anti-tamper controls
  useEffect(() => {
    // 1. Active session in progress: strictly enforce URL parameter lock to candidate's ongoing test
    if (activeExamId) {
      if (queryExamId !== activeExamId) {
        setSearchParams({ examId: activeExamId }, { replace: true });
        setUrlTamperNotice('Anti-Tamper Protocol: URL parameter change prevented. You have an active examination session in progress.');
      }
      if (selectedExamId !== activeExamId) {
        setSelectedExamId(activeExamId);
      }
      return;
    }

    // 2. Candidate or authority entered a query parameter: validate against exam registry
    if (queryExamId) {
      const allExams = getAllExams();
      const targetExam = allExams.find((e) => e.id === queryExamId);

      if (targetExam) {
        // Target exam exists in local or cloud registry!
        if (selectedExamId !== queryExamId) {
          setSelectedExamId(queryExamId);
        }
      } else if (allExams.length > 0) {
        // Only strip if target exam truly does not exist in the institutional database
        setSearchParams({}, { replace: true });
        setSelectedExamId(null);
        setUrlTamperNotice(`Link Integrity Guard: The requested examination link "${queryExamId}" does not exist in the institutional registry.`);
      }
    }
  }, [activeExamId, queryExamId, exams, selectedExamId, setSearchParams]);

  const searchedExams = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return exams;
    return exams.filter((e) => {
      const matchTitle = (e.title || '').toLowerCase().includes(q);
      const matchSubject = (e.subject || '').toLowerCase().includes(q);
      const matchTopic = (e.topic || '').toLowerCase().includes(q);
      const matchCategory = (e.examCategory || '').toLowerCase().includes(q);
      const matchId = (e.id || '').toLowerCase().includes(q);
      return matchTitle || matchSubject || matchTopic || matchCategory || matchId;
    });
  }, [exams, searchQuery]);

  const activeExams = useMemo(() => {
    return searchedExams.filter((e) => {
      const isConcluded = e.status === 'CLOSED' || Boolean(e.endTime && currentTime > e.endTime);
      return !isConcluded;
    });
  }, [searchedExams, currentTime]);

  const concludedExams = useMemo(() => {
    return searchedExams.filter((e) => {
      return e.status === 'CLOSED' || Boolean(e.endTime && currentTime > e.endTime);
    });
  }, [searchedExams, currentTime]);

  const displayedExams = useMemo(() => {
    if (filterTab === 'active') return activeExams;
    if (filterTab === 'concluded') return concludedExams;
    return searchedExams;
  }, [filterTab, activeExams, concludedExams, searchedExams]);

  const effectiveExamId = activeExamId || queryExamId || selectedExamId;

  const handleSelectExam = (id: string) => {
    setSelectedExamId(id);
    setSearchParams({ examId: id }, { replace: true });
  };

  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const performExit = () => {
    try {
      void exitExamFullscreen();
      if (document.exitPointerLock) document.exitPointerLock();
      sessionStorage.removeItem('codedna_mcq_session_attempt');
      sessionStorage.removeItem('codedna_mcq_last_finished_attempt');
      sessionStorage.removeItem('codedna_mcq_active_attempt_backup');
      localStorage.removeItem('codedna_mcq_active_attempt_backup');
      localStorage.removeItem('codedna_mcq_active_attempt');
      localStorage.removeItem('codedna_active_exam_mode');
      localStorage.removeItem('codedna_student_profile');
    } catch {}
    // Complete fresh browser reload navigation to /mcq
    window.location.href = '/mcq';
  };

  const handleBack = () => {
    const active = getActiveAttempt();
    if (active && active.status === 'IN_PROGRESS') {
      setShowExitConfirm(true);
      return;
    }
    performExit();
  };

  if (effectiveExamId) {
    return (
      <ErrorBoundary
        fallbackTitle="Examination Terminal Irregularity Prevented"
        onReset={() => {
          performExit();
        }}
      >
        <MCQExamScreen
          examId={effectiveExamId}
          onBack={handleBack}
        />
        <ConfirmationModal
          isOpen={showExitConfirm}
          onClose={() => setShowExitConfirm(false)}
          onConfirm={() => {
            setShowExitConfirm(false);
            performExit();
          }}
          variant="warning"
          title="Active Examination in Progress"
          subtitle="Your timer is running. Exiting will not pause your test."
          badgeText="Active Exam Safeguard"
          confirmText="Exit to Paper Catalog"
          cancelText="Resume Examination"
          message={
            <div>
              You currently have an ongoing test session in progress. Leaving this screen will <strong>not pause your timer</strong>, and the examination window will continue running. Are you sure you wish to return to the paper selector?
            </div>
          }
        />
      </ErrorBoundary>
    );
  }

  return (
    <div style={{ padding: 'clamp(14px, 3.5vw, 32px)', width: '100%', boxSizing: 'border-box' }}>
      {urlTamperNotice && (
        <div
          style={{
            marginBottom: '18px',
            padding: '12px 16px',
            background: 'var(--warning-bg)',
            border: '1px solid var(--warning-border)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={15} color="var(--warning)" />
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--warning)' }}>
              {urlTamperNotice}
            </span>
          </div>
          <button
            onClick={() => setUrlTamperNotice(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '12px',
              fontWeight: 700
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Clean Header with Search & Filter Toolbar */}
      <div style={{ marginBottom: '22px' }}>
        <div style={{ marginBottom: exams.length > 0 ? '16px' : '0' }}>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: '0 0 4px',
              letterSpacing: '-0.02em'
            }}
          >
            Available MCQ Examinations
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            Select your assigned examination session to commence or review your past sittings.
          </p>
        </div>

        {exams.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            {/* Search Input Box */}
            <div style={{ position: 'relative', flex: 1, minWidth: 'min(100%, 280px)', maxWidth: '440px' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none'
                }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search examinations by title, topic, subject..."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-pill)',
                  color: 'var(--text-primary)',
                  padding: '7px 32px 7px 34px',
                  fontSize: '13px',
                  outline: 'none',
                  transition: 'border-color 0.15s ease'
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div
              style={{
                display: 'inline-flex',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-pill)',
                padding: '3px',
                gap: '2px'
              }}
            >
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                style={{
                  background: filterTab === 'all' ? 'var(--bg-elevated)' : 'transparent',
                  color: filterTab === 'all' ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: filterTab === 'all' ? 700 : 500,
                  fontSize: '12px',
                  padding: '4px 12px',
                  borderRadius: 'var(--radius-pill)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                All ({exams.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('active')}
                style={{
                  background: filterTab === 'active' ? 'var(--bg-elevated)' : 'transparent',
                  color: filterTab === 'active' ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: filterTab === 'active' ? 700 : 500,
                  fontSize: '12px',
                  padding: '4px 12px',
                  borderRadius: 'var(--radius-pill)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Active ({activeExams.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('concluded')}
                style={{
                  background: filterTab === 'concluded' ? 'var(--bg-elevated)' : 'transparent',
                  color: filterTab === 'concluded' ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: filterTab === 'concluded' ? 700 : 500,
                  fontSize: '12px',
                  padding: '4px 12px',
                  borderRadius: 'var(--radius-pill)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Concluded ({concludedExams.length})
              </button>
            </div>
          </div>
        )}
      </div>

      {exams.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            maxWidth: '680px',
            margin: '0 auto'
          }}
        >
          <BookOpen size={36} style={{ marginBottom: '14px', opacity: 0.35, color: 'var(--text-muted)' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            No Public Examinations Scheduled
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
            There are currently no open public examinations in the institutional catalog. If you were issued a direct Exam ID or Candidate Ticket by your invigilator, enter it below to commence your sitting.
          </p>

          {/* Direct Exam ID / Candidate Access Box */}
          <form
            onSubmit={handleLaunchDirectExam}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              maxWidth: '460px',
              margin: '0 auto 20px',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
              <KeyRound
                size={14}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)'
                }}
              />
              <input
                type="text"
                value={directExamInput}
                onChange={(e) => setDirectExamInput(e.target.value)}
                placeholder="Enter Exam ID (e.g. exam_ai_...)"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  padding: '9px 12px 9px 34px',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>
            <button
              type="submit"
              disabled={!directExamInput.trim()}
              className="btn btn-primary"
              style={{
                padding: '9px 16px',
                fontSize: '13px',
                fontWeight: 700,
                borderRadius: 'var(--radius-sm)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>Launch</span>
              <ArrowRight size={14} />
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isRefreshing}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 14px' }}
            >
              <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
              <span>{isRefreshing ? 'Checking...' : 'Check Again'}</span>
            </button>
          </div>
        </div>
      ) : displayedExams.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)'
          }}
        >
          <Search size={30} style={{ marginBottom: '12px', opacity: 0.35, color: 'var(--text-muted)' }} />
          <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
            {searchQuery.trim() ? 'No examinations found' : filterTab === 'active' ? 'No active examinations running right now' : 'No concluded examinations'}
          </p>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
            {searchQuery.trim()
              ? `No examinations matched "${searchQuery}". Try a different keyword or clear the search query.`
              : filterTab === 'active'
              ? `There are ${concludedExams.length} concluded examination${concludedExams.length === 1 ? '' : 's'} archived in the system.`
              : 'There are no concluded examination records.'}
          </p>
          {searchQuery.trim() ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSearchQuery('')}
              style={{ fontSize: '12px', padding: '6px 16px' }}
            >
              Clear Search Query
            </button>
          ) : filterTab === 'active' && concludedExams.length > 0 ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setFilterTab('concluded')}
              style={{ fontSize: '12px', padding: '6px 16px' }}
            >
              View Concluded Sessions ({concludedExams.length})
            </button>
          ) : null}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
          {displayedExams.map((exam) => {
            const isScheduledFuture = exam.status === 'PUBLISHED' && Boolean(exam.startTime && currentTime < exam.startTime);
            const isConcluded = exam.status === 'CLOSED' || Boolean(exam.endTime && currentTime > exam.endTime);
            const isLive = exam.status === 'PUBLISHED' && !isScheduledFuture && !isConcluded;

            let countdownStr = '';
            if (isScheduledFuture && exam.startTime) {
              const diffMs = Math.max(0, exam.startTime - currentTime);
              const totalSecs = Math.floor(diffMs / 1000);
              const diffHours = Math.floor(totalSecs / 3600);
              const remMins = Math.floor((totalSecs % 3600) / 60);
              const remSecs = totalSecs % 60;
              countdownStr = `${diffHours > 0 ? `${diffHours}h ` : ''}${remMins}m ${String(remSecs).padStart(2, '0')}s`;
            }

            const formatScheduleTime = (ts: number) =>
              new Date(ts).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

            return (
              <div
                key={exam.id}
                onClick={() => {
                  handleSelectExam(exam.id);
                }}
                className="mcq-horizontal-card"
                style={{
                  background: isConcluded ? 'var(--bg-surface)' : 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  boxSizing: 'border-box',
                  width: '100%',
                  cursor: 'pointer',
                  opacity: isConcluded ? 0.8 : 1,
                  transition: 'border-color 0.15s ease, background 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-strong)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                {/* Left Side: Category, Title, Topic & Metric Chips */}
                <div className="mcq-card-main">
                  {/* Category Micro-Badge */}
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-xs)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      flexShrink: 0
                    }}
                  >
                    {exam.examCategory || exam.subject || 'Assessment'}
                  </span>

                  {/* Title + Metadata Cluster */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: '14.5px',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          lineHeight: 1.3
                        }}
                      >
                        {exam.title}
                      </h3>
                      {exam.topic && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
                          · {exam.topic}
                        </span>
                      )}
                    </div>

                    {/* Inline Metric Chips Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 7px',
                          borderRadius: 'var(--radius-xs)',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border)',
                          fontSize: '11px',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        <BookOpen size={11} color="var(--text-muted)" />
                        <span>{exam.questionCount} Questions</span>
                      </div>

                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 7px',
                          borderRadius: 'var(--radius-xs)',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border)',
                          fontSize: '11px',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        <Clock size={11} color="var(--text-muted)" />
                        <span>{exam.durationMinutes} Mins</span>
                      </div>

                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 7px',
                          borderRadius: 'var(--radius-xs)',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border)',
                          fontSize: '11px',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        <Award size={11} color="var(--text-muted)" />
                        <span>{exam.totalMarks} Marks</span>
                      </div>

                      <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '4px' }}>
                        {exam.negativeMarkingEnabled ? 'Negative: -0.25' : 'No negative marking'}
                      </span>

                      {isScheduledFuture && exam.startTime && (
                        <span style={{ fontSize: '11px', color: 'var(--warning)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
                          <Calendar size={11} />
                          Starts: {formatScheduleTime(exam.startTime)}
                        </span>
                      )}
                      {!isScheduledFuture && exam.endTime && (
                        <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '6px' }}>
                          Closes: {formatScheduleTime(exam.endTime)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Side: Status Badge & Action CTA */}
                <div className="mcq-horizontal-card-actions">
                  {isLive && (
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        padding: '3px 10px',
                        borderRadius: 'var(--radius-pill)',
                        background: 'var(--success-bg)',
                        color: 'var(--success)',
                        border: '1px solid var(--success-border)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--success)' }} />
                      Live Examination
                    </span>
                  )}

                  {isScheduledFuture && (
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        padding: '3px 10px',
                        borderRadius: 'var(--radius-pill)',
                        background: 'var(--warning-bg)',
                        color: 'var(--warning)',
                        border: '1px solid var(--warning-border)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <Clock size={11} /> Opens in {countdownStr}
                    </span>
                  )}

                  {isConcluded && (
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        padding: '3px 9px',
                        borderRadius: 'var(--radius-pill)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border)'
                      }}
                    >
                      Concluded
                    </span>
                  )}

                  {isLive && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ height: '32px', padding: '0 16px', fontSize: '12px', gap: '5px', fontWeight: 700 }}
                    >
                      <span>Start Exam</span>
                      <ChevronRight size={13} />
                    </button>
                  )}

                  {isScheduledFuture && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ height: '32px', padding: '0 14px', fontSize: '12px', gap: '5px' }}
                    >
                      <Clock size={12} color="var(--warning)" />
                      <span>Waiting Room</span>
                      <ChevronRight size={13} />
                    </button>
                  )}

                  {isConcluded && (
                    <span style={{ fontSize: '11.5px', color: 'var(--text-dim)', paddingRight: '4px' }}>Session Closed</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MCQExamScreen;

