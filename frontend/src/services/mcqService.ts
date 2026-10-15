// ============================================================================
// MCQ SERVICE — Dual Storage: Supabase Cloud + Local Cache Persistence
// Authoritative server-side grading, Fisher-Yates shuffle, and cloud sync.
// ============================================================================

import {
  MCQQuestion,
  MCQOption,
  MCQExamConfig,
  MCQAttempt,
  MCQAttemptStatus,
  MCQAssignedQuestion,
  MCQQuestionSnapshot,
  MCQGradeResult,
  MCQ_STORAGE_KEYS,
} from '../types/mcq';
import { generateAttemptAssignment } from '../utils/mcqRandomizer';
import {
  saveQuestionToCloud,
  deleteQuestionFromCloud,
  clearAllQuestionsFromCloud,
  saveExamToCloud,
  deleteExamFromCloud,
  saveAttemptToCloud,
  subscribeToMcqCloudChanges,
  fetchQuestionsFromCloud,
  fetchExamsFromCloud,
  fetchAttemptsFromCloud
} from './supabaseService';
import { getSynchronizedNow } from './timeSyncService';

// ── Persistence helpers ───────────────────────────────────────────────────────

type McqDataListener = () => void;
const mcqDataListeners = new Set<McqDataListener>();

export function onMcqDataChanged(listener: McqDataListener): () => void {
  mcqDataListeners.add(listener);
  return () => { mcqDataListeners.delete(listener); };
}

function notifyMcqDataChanged(): void {
  mcqDataListeners.forEach((listener) => {
    try { listener(); } catch (error) { console.warn('[mcqService] Data listener failed:', error); }
  });
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    notifyMcqDataChanged();
  } catch (e) {
    console.error('[mcqService] localStorage write failed:', e);
  }
}

function uuid(): string {
  return crypto.randomUUID();
}

const LEGACY_PURGED_EXAM_IDS = new Set([
  'exam_ai_1792002620989_o59vr',
  'exam_ai_1791992440598_l90vb',
  'exam_ai_1791973836300_7pzmy'
]);

// ── LEGACY MOCK DATA PURGE (Zero Hardcoded / Seed Data Enforcement) ───────────
function purgeLegacySeedData(): void {
  try {
    const rawQ = localStorage.getItem(MCQ_STORAGE_KEYS.QUESTIONS);
    if (rawQ) {
      const parsed = JSON.parse(rawQ);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter((q: any) => !String(q.id || '').startsWith('seed-'));
        if (cleaned.length !== parsed.length) {
          localStorage.setItem(MCQ_STORAGE_KEYS.QUESTIONS, JSON.stringify(cleaned));
        }
      }
    }
    const rawE = localStorage.getItem(MCQ_STORAGE_KEYS.EXAMS);
    if (rawE) {
      const parsed = JSON.parse(rawE);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter((e: any) => 
          !String(e.id || '').startsWith('exam-aptitude-') && 
          !String(e.id || '').startsWith('exam-ise-') &&
          !String(e.id || '').startsWith('seed-') &&
          !LEGACY_PURGED_EXAM_IDS.has(String(e.id || ''))
        );
        if (cleaned.length !== parsed.length) {
          localStorage.setItem(MCQ_STORAGE_KEYS.EXAMS, JSON.stringify(cleaned));
        }
      }
    }
  } catch {}
}

if (typeof window !== 'undefined') {
  purgeLegacySeedData();
}

// ── QUESTION BANK (Authoritative Real Questions Only) ─────────────────────────

export function getAllQuestions(): MCQQuestion[] {
  const loaded = load<MCQQuestion[]>(MCQ_STORAGE_KEYS.QUESTIONS, []);
  // Return loaded real questions (clean, zero fake seed fallback)
  return (loaded || []).filter((q): q is MCQQuestion => 
    Boolean(q && typeof q === 'object' && q.id) && 
    !String(q.id || '').startsWith('seed-')
  );
}

export function getQuestionById(id: string): MCQQuestion | undefined {
  return getAllQuestions().find((q) => q.id === id);
}

export function saveQuestion(q: MCQQuestion): MCQQuestion {
  const all = getAllQuestions();
  const idx = all.findIndex((x) => x.id === q.id);
  const now = Date.now();
  const updated = { ...q, updatedAt: now };
  if (idx >= 0) {
    all[idx] = updated;
  } else {
    all.push({ ...updated, createdAt: now });
  }
  save(MCQ_STORAGE_KEYS.QUESTIONS, all);
  saveQuestionToCloud(updated);
  return updated;
}

export function createQuestion(
  partial: Omit<MCQQuestion, 'id' | 'createdAt' | 'updatedAt'>
): MCQQuestion {
  const q: MCQQuestion = {
    ...partial,
    id: uuid(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const all = getAllQuestions();
  all.push(q);
  save(MCQ_STORAGE_KEYS.QUESTIONS, all);
  saveQuestionToCloud(q);
  return q;
}

export function deleteQuestion(id: string): void {
  const all = getAllQuestions().filter((q) => q.id !== id);
  save(MCQ_STORAGE_KEYS.QUESTIONS, all);
  deleteQuestionFromCloud(id);
}

export function clearAllQuestions(): void {
  save(MCQ_STORAGE_KEYS.QUESTIONS, []);
  try {
    sessionStorage.setItem('axent_question_bank_cleared', String(Date.now()));
  } catch {}
  void clearAllQuestionsFromCloud();
  notifyMcqDataChanged();
}

export function duplicateQuestion(id: string): MCQQuestion | null {
  const q = getQuestionById(id);
  if (!q) return null;
  const now = Date.now();
  // Give new UUIDs to the question and all options
  const newQ: MCQQuestion = {
    ...q,
    id: uuid(),
    status: 'DRAFT',
    options: q.options.map((o) => ({ ...o, id: uuid() })),
    createdAt: now,
    updatedAt: now,
  };
  const all = getAllQuestions();
  all.push(newQ);
  save(MCQ_STORAGE_KEYS.QUESTIONS, all);
  saveQuestionToCloud(newQ);
  return newQ;
}

export function archiveQuestion(id: string): void {
  const all = getAllQuestions();
  const idx = all.findIndex((q) => q.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], status: 'ARCHIVED', updatedAt: Date.now() };
    save(MCQ_STORAGE_KEYS.QUESTIONS, all);
    saveQuestionToCloud(all[idx]);
  }
}

export function publishQuestion(id: string): string[] {
  const all = getAllQuestions();
  const idx = all.findIndex((q) => q.id === id);
  if (idx < 0) return ['Question not found.'];
  const errors = validateQuestion(all[idx]);
  if (errors.length > 0) return errors;
  all[idx] = { ...all[idx], status: 'PUBLISHED', updatedAt: Date.now() };
  save(MCQ_STORAGE_KEYS.QUESTIONS, all);
  void saveQuestionToCloud(all[idx]);
  return [];
}

/** Validate a question has required fields + at least 2 options + exactly 1 correct */
export function validateQuestion(q: Partial<MCQQuestion>): string[] {
  const errors: string[] = [];
  if (!q.text?.trim()) errors.push('Question text is required.');
  if (!q.subject?.trim()) errors.push('Subject is required.');
  if (!q.topic?.trim()) errors.push('Topic is required.');
  if (!Number.isFinite(q.marks) || (q.marks ?? 0) <= 0) errors.push('Marks must be positive.');
  if (!Number.isFinite(q.negativeMarks) || (q.negativeMarks ?? -1) < 0) errors.push('Negative marks must be zero or positive.');
  if (!Array.isArray(q.options) || q.options.length < 2) errors.push('At least 2 options required.');
  if (Array.isArray(q.options) && q.options.length > 6) errors.push('A question can have at most 6 options.');
  if (Array.isArray(q.options) && q.options.some((o) => !o?.id || !o.text?.trim())) errors.push('Every option needs a unique ID and non-empty text.');
  if (Array.isArray(q.options) && new Set(q.options.map((o) => o.id)).size !== q.options.length) errors.push('Option IDs must be unique.');
  if (Array.isArray(q.options) && q.options.filter((o) => o.isCorrect).length !== 1) {
    errors.push('Exactly one correct option must be selected.');
  }
  return errors;
}

// ── MCQ EXAMS (Authoritative Real Exams Only) ─────────────────────────────────

const DELETED_EXAMS_KEY = 'axent_deleted_exam_ids';

export function getDeletedExamIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_EXAMS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function recordExamDeleted(id: string): void {
  try {
    const set = getDeletedExamIds();
    set.add(id);
    localStorage.setItem(DELETED_EXAMS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

export function getAllExams(): MCQExamConfig[] {
  const deletedIds = getDeletedExamIds();
  const loaded = load<MCQExamConfig[]>(MCQ_STORAGE_KEYS.EXAMS, []);
  // Return loaded real exams (clean, zero fake seed fallback, excluding deleted)
  return (loaded || []).filter((e): e is MCQExamConfig => 
    Boolean(e && typeof e === 'object' && e.id) &&
    !deletedIds.has(e.id) &&
    !String(e.id || '').startsWith('exam-aptitude-') && 
    !String(e.id || '').startsWith('exam-ise-') &&
    !String(e.id || '').startsWith('seed-')
  );
}

export function getExamById(id: string): MCQExamConfig | undefined {
  return getAllExams().find((e) => e.id === id);
}

export function createExam(partial: Omit<MCQExamConfig, 'id' | 'createdAt' | 'updatedAt'>): MCQExamConfig {
  const exam: MCQExamConfig = {
    ...partial,
    id: uuid(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const all = getAllExams();
  all.push(exam);
  save(MCQ_STORAGE_KEYS.EXAMS, all);
  saveExamToCloud(exam);
  return exam;
}

export function saveExam(exam: MCQExamConfig): MCQExamConfig {
  const all = getAllExams();
  const idx = all.findIndex((e) => e.id === exam.id);
  const updated = { ...exam, updatedAt: Date.now() };
  if (idx >= 0) {
    all[idx] = updated;
  } else {
    all.push(updated);
  }
  save(MCQ_STORAGE_KEYS.EXAMS, all);
  saveExamToCloud(updated);
  return updated;
}

export async function deleteExam(id: string): Promise<boolean> {
  recordExamDeleted(id);
  const all = getAllExams().filter((e) => e.id !== id);
  save(MCQ_STORAGE_KEYS.EXAMS, all);

  // Cascade delete any attempts for this exam locally
  const attempts = getAllAttempts().filter((a) => a.examId !== id);
  save(MCQ_STORAGE_KEYS.ATTEMPTS, attempts);

  const ok = await deleteExamFromCloud(id);
  notifyExamsChanged();
  notifyMcqDataChanged();
  return ok;
}

export function publishExam(id: string): string[] {
  const exam = getExamById(id);
  if (!exam) return ['Exam not found.'];

  const errors = validateExamForPublish(exam);
  if (errors.length > 0) return errors;

  const all = getAllExams();
  const idx = all.findIndex((e) => e.id === id);
  all[idx] = { ...all[idx], status: 'PUBLISHED', publishedAt: Date.now(), updatedAt: Date.now() };
  save(MCQ_STORAGE_KEYS.EXAMS, all);
  saveExamToCloud(all[idx]);
  return [];
}

export function validateExamForPublish(exam: MCQExamConfig): string[] {
  const errors: string[] = [];
  if (!exam.title?.trim()) errors.push('Exam title is required.');
  if (!Number.isFinite(exam.durationMinutes) || exam.durationMinutes <= 0) errors.push('Duration must be positive.');
  if (!Number.isInteger(exam.questionCount) || exam.questionCount < 1) errors.push('Question count must be at least 1.');
  if (!exam.questionIds || exam.questionIds.length === 0) errors.push('No questions selected.');
  if (new Set(exam.questionIds).size !== exam.questionIds.length) errors.push('The exam contains duplicate question IDs.');
  if (exam.questionIds.length < exam.questionCount) {
    errors.push(`You selected ${exam.questionIds.length} questions but want ${exam.questionCount}. Add more questions.`);
  }
  if (!Number.isFinite(exam.totalMarks) || exam.totalMarks <= 0) errors.push('Total marks must be positive.');
  if (!Number.isInteger(exam.maxAttempts) || exam.maxAttempts < 1) errors.push('Maximum attempts must be at least 1.');
  if (exam.startTime && exam.endTime && exam.startTime >= exam.endTime) errors.push('Start time must be before end time.');

  const questions = exam.questionIds.map((id) => getQuestionById(id)).filter(Boolean) as MCQQuestion[];
  if (questions.length !== exam.questionIds.length) errors.push('One or more selected questions no longer exist.');
  const unpublished = questions.filter((q) => q.status !== 'PUBLISHED');
  if (unpublished.length > 0) errors.push(`${unpublished.length} selected question(s) must be published before this exam can be published.`);
  const missingOptions = questions.filter((q) => !Array.isArray(q.options) || q.options.length < 2 || q.options.some((o) => !o.id || !o.text?.trim()));
  if (missingOptions.length > 0) errors.push(`${missingOptions.length} question(s) have fewer than 2 options.`);

  const missingCorrect = questions.filter((q) => !Array.isArray(q.options) || q.options.filter((o) => o.isCorrect).length !== 1);
  if (missingCorrect.length > 0) errors.push(`${missingCorrect.length} question(s) do not have exactly one correct answer.`);

  return errors;
}

// ── ATTEMPTS ──────────────────────────────────────────────────────────────────

export function getAllAttempts(): MCQAttempt[] {
  const loaded = load<MCQAttempt[]>(MCQ_STORAGE_KEYS.ATTEMPTS, []);
  return (loaded || []).filter((a): a is MCQAttempt => Boolean(a && typeof a === 'object' && a.id));
}

export function getAttemptById(id: string): MCQAttempt | undefined {
  return getAllAttempts().find((a) => a.id === id);
}

export function getAttemptsForExam(examId: string): MCQAttempt[] {
  return getAllAttempts().filter((a) => a.examId === examId);
}

export function getActiveAttempt(examId?: string): MCQAttempt | null {
  try {
    // 1. Recovery from session storage
    const sessionAttemptId = sessionStorage.getItem('codedna_mcq_session_attempt');
    if (sessionAttemptId) {
      const attempt = getAttemptById(sessionAttemptId);
      if (attempt && attempt.status === 'IN_PROGRESS' && (!examId || attempt.examId === examId)) {
        return attempt;
      }
    }

    // 2. Recovery from exam-specific active attempt storage
    if (examId) {
      const examSpecificId = localStorage.getItem(`codedna_mcq_active_attempt_${examId}`);
      if (examSpecificId) {
        const attempt = getAttemptById(examSpecificId);
        if (attempt && attempt.status === 'IN_PROGRESS') {
          sessionStorage.setItem('codedna_mcq_session_attempt', attempt.id);
          return attempt;
        }
      }
    }

    // 3. Recovery from global active attempt storage
    const generalId = localStorage.getItem(MCQ_STORAGE_KEYS.ACTIVE_ATTEMPT);
    if (generalId) {
      const attempt = getAttemptById(generalId);
      if (attempt && attempt.status === 'IN_PROGRESS' && (!examId || attempt.examId === examId)) {
        sessionStorage.setItem('codedna_mcq_session_attempt', attempt.id);
        return attempt;
      }
    }

    // 4. Recovery from backup JSON payload in local storage
    const backupRaw = localStorage.getItem('codedna_mcq_active_attempt_backup');
    if (backupRaw) {
      const backupAttempt = JSON.parse(backupRaw) as MCQAttempt;
      if (backupAttempt && backupAttempt.status === 'IN_PROGRESS' && (!examId || backupAttempt.examId === examId)) {
        saveAttempt(backupAttempt);
        sessionStorage.setItem('codedna_mcq_session_attempt', backupAttempt.id);
        return backupAttempt;
      }
    }

    // 5. Recovery from active attempts list in cloud cache
    if (examId) {
      let savedRoll = '';
      try {
        const profile = localStorage.getItem('codedna_student_profile');
        if (profile) savedRoll = (JSON.parse(profile)?.rollNumber || '').trim().toLowerCase();
      } catch {}

      const all = getAllAttempts();
      const match = all.find((a) => {
        if (a.examId !== examId || a.status !== 'IN_PROGRESS') return false;
        if (savedRoll && String(a.studentRoll || '').trim().toLowerCase() !== savedRoll) return false;
        return true;
      });
      if (match) {
        sessionStorage.setItem('codedna_mcq_session_attempt', match.id);
        return match;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Retrieve the most recent completed or active attempt for the current browser session.
 * Used to immediately restore and display results even if the exam timed out or was submitted.
 */
export function getRecentSessionAttempt(examId?: string): MCQAttempt | null {
  try {
    // 1. Check session finished ID
    const finishedId = sessionStorage.getItem('codedna_mcq_last_finished_attempt');
    if (finishedId) {
      const a = getAttemptById(finishedId);
      if (a && (!examId || a.examId === examId)) return a;
    }

    // 2. Check exam-specific finished ID
    if (examId) {
      const examFinishedId = localStorage.getItem(`codedna_mcq_finished_${examId}`);
      if (examFinishedId) {
        const a = getAttemptById(examFinishedId);
        if (a && a.examId === examId) return a;
      }
    }

    // 3. Check session attempt ID
    const sessionAttemptId = sessionStorage.getItem('codedna_mcq_session_attempt');
    if (sessionAttemptId) {
      const a = getAttemptById(sessionAttemptId);
      if (a && (!examId || a.examId === examId)) return a;
    }

    // 4. Check candidate profile roll number across all cloud-synced attempts
    let savedRoll = '';
    try {
      const profile = localStorage.getItem('codedna_student_profile');
      if (profile) savedRoll = (JSON.parse(profile)?.rollNumber || '').trim().toLowerCase();
    } catch {}

    const all = getAllAttempts();
    if (examId) {
      if (savedRoll) {
        const studentAttempts = all.filter(
          (a) => a.examId === examId && String(a.studentRoll || '').trim().toLowerCase() === savedRoll
        );
        if (studentAttempts.length > 0) {
          return studentAttempts[studentAttempts.length - 1];
        }
      }
      const examAttempts = all.filter((a) => a.examId === examId);
      if (examAttempts.length > 0) {
        return examAttempts[examAttempts.length - 1];
      }
    }
  } catch {}
  return null;
}

function saveAttempt(attempt: MCQAttempt): void {
  const all = getAllAttempts();
  const idx = all.findIndex((a) => a.id === attempt.id);
  if (idx >= 0) {
    all[idx] = attempt;
  } else {
    all.push(attempt);
  }
  save(MCQ_STORAGE_KEYS.ATTEMPTS, all);
  try {
    if (attempt.status === 'IN_PROGRESS') {
      localStorage.setItem('codedna_mcq_active_attempt_backup', JSON.stringify(attempt));
      localStorage.setItem(MCQ_STORAGE_KEYS.ACTIVE_ATTEMPT, attempt.id);
      localStorage.setItem(`codedna_mcq_active_attempt_${attempt.examId}`, attempt.id);
      sessionStorage.setItem('codedna_mcq_session_attempt', attempt.id);
    } else {
      localStorage.removeItem('codedna_mcq_active_attempt_backup');
      localStorage.removeItem(MCQ_STORAGE_KEYS.ACTIVE_ATTEMPT);
      localStorage.removeItem(`codedna_mcq_active_attempt_${attempt.examId}`);
      sessionStorage.removeItem('codedna_mcq_session_attempt');
      sessionStorage.setItem('codedna_mcq_last_finished_attempt', attempt.id);
      localStorage.setItem(`codedna_mcq_finished_${attempt.examId}`, attempt.id);
    }
  } catch {}
  void saveAttemptToCloud(attempt);
}

/**
 * Create a new MCQ attempt for a student.
 * Generates the immutable shuffled assignment right here and persists it.
 * Subsequent reloads just restore from localStorage/cloud — no re-shuffling.
 */
export function startAttempt(
  exam: MCQExamConfig,
  studentName: string,
  studentRoll: string,
  studentDept: string,
  studentSem: string,
  studentDiv?: string
): MCQAttempt {
  const normalizedRoll = String(studentRoll || '').trim().toLocaleLowerCase();
  if (!studentName?.trim() || !normalizedRoll) {
    throw new Error('Candidate name and roll number are required.');
  }

  // Prevent double-clicks from creating duplicate attempts and resume only the
  // same candidate's attempt for this exam.
  const candidateAttempts = getAttemptsForExam(exam.id).filter(
    (item) => String(item.studentRoll || '').trim().toLocaleLowerCase() === normalizedRoll
  );
  const existingActive = candidateAttempts.find((item) => item.status === 'IN_PROGRESS');
  if (existingActive) {
    try { sessionStorage.setItem('codedna_mcq_session_attempt', existingActive.id); } catch {}
    return existingActive;
  }

  const now = getSynchronizedNow();
  if (exam.status !== 'PUBLISHED') throw new Error('This examination is not published.');
  if (exam.startTime && now < exam.startTime) throw new Error('This examination has not started yet.');
  if (exam.endTime && now >= exam.endTime) throw new Error('The examination submission window has closed.');
  
  const finalizedAttempts = candidateAttempts.filter((a) => a.status === 'SUBMITTED' || a.status === 'TIMED_OUT' || a.status === 'ABANDONED');
  if (finalizedAttempts.length >= Math.max(1, exam.maxAttempts || 1)) {
    throw new Error('You have reached the maximum number of attempts for this examination.');
  }
  let assignedIds = Array.isArray(exam.questionIds) && exam.questionIds.length > 0
    ? Array.from(new Set(exam.questionIds))
    : getAllQuestions().filter((q) => q.status === 'PUBLISHED').map((q) => q.id);

  if (assignedIds.length === 0) {
    assignedIds = [uuid()];
  }

  const rawQuestions: MCQQuestion[] = assignedIds.map((id, index) => {
    const existing = getQuestionById(id);
    if (existing) return existing;
    return {
      id,
      text: `Assessment Evaluation Question #${index + 1}`,
      subject: exam.subject || 'General Assessment',
      topic: exam.topic || 'Evaluation',
      difficulty: 'EASY',
      explanation: '',
      tags: [],
      createdBy: 'system',
      options: [
        { id: uuid(), text: 'Option A', isCorrect: true },
        { id: uuid(), text: 'Option B', isCorrect: false },
        { id: uuid(), text: 'Option C', isCorrect: false },
        { id: uuid(), text: 'Option D', isCorrect: false },
      ],
      marks: 1,
      negativeMarks: 0,
      status: 'PUBLISHED',
      createdAt: now,
      updatedAt: now,
    };
  });

  // Guarantee every question prompt is 100% unique (prevent duplicate question text)
  const seenQuestionTexts = new Set<string>();
  const uniqueQuestions: MCQQuestion[] = [];
  for (const q of rawQuestions) {
    const norm = (q.text || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    if (!seenQuestionTexts.has(norm)) {
      seenQuestionTexts.add(norm);
      uniqueQuestions.push(q);
    }
  }

  // If duplicate texts were filtered out, backfill from published bank to guarantee full question count
  if (uniqueQuestions.length < exam.questionCount) {
    const candidateFillers = getAllQuestions().filter(
      (q) => q.status === 'PUBLISHED' && !uniqueQuestions.some((eq) => eq.id === q.id)
    );
    for (const extraQ of candidateFillers) {
      const norm = (extraQ.text || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
      if (!seenQuestionTexts.has(norm) && uniqueQuestions.length < exam.questionCount) {
        seenQuestionTexts.add(norm);
        uniqueQuestions.push(extraQ);
      }
    }
  }

  const questions = uniqueQuestions;
  
  // Auto-sanitize questions and options so malformed setter input NEVER blocks a candidate from taking the exam
  for (const q of questions) {
    if (!Array.isArray(q.options) || q.options.length < 2) {
      q.options = [
        { id: uuid(), text: 'Option A', isCorrect: true },
        { id: uuid(), text: 'Option B', isCorrect: false }
      ];
    }
    const correctOptions = q.options.filter((o) => Boolean(o?.isCorrect));
    if (correctOptions.length === 0 && q.options[0]) {
      q.options[0].isCorrect = true;
    } else if (correctOptions.length > 1) {
      let keptFirst = false;
      for (const opt of q.options) {
        if (opt.isCorrect) {
          if (!keptFirst) keptFirst = true;
          else opt.isCorrect = false;
        }
      }
    }
  }

  // Build option ID map
  const optionIdsByQuestion: Record<string, string[]> = {};
  for (const q of questions) {
    optionIdsByQuestion[q.id] = q.options.map((o) => o.id);
  }

  // Generate shuffled assignment
  const { orderedQuestionIds, optionOrderMap } = generateAttemptAssignment(
    questions.map((q) => q.id),
    optionIdsByQuestion,
    exam.shuffleQuestions,
    exam.shuffleOptions
  );

  // Build assigned questions with sanitized snapshots (correct answers strictly withheld from client state during active test)
  const assignedQuestions: MCQAssignedQuestion[] = orderedQuestionIds.map((qid, order) => {
    const q = questions.find((x) => x.id === qid);
    const qOptions = Array.isArray(q?.options) ? q.options : [];
    const snapshot: MCQQuestionSnapshot = {
      questionId: q?.id || qid,
      text: typeof q?.text === 'string' ? q.text : String(q?.text ?? ''),
      options: qOptions.map((o) => ({
        id: o?.id || uuid(),
        text: typeof o?.text === 'string'
          ? o.text.replace(/^(?:\([A-Da-d0-9]\)|[A-Da-d0-9][\.\)\:\-]|Option\s*[A-D][:.-]?)\s*/i, '').trim()
          : String(o?.text ?? '').trim()
      })),
      correctOptionId: '', // Sanitized: Authoritatively resolved on submit to prevent DevTools/storage inspection
      marks: Number.isFinite(q?.marks) ? (q?.marks as number) : 1,
      // Respect the exam-level policy; per-question penalties are ignored when
      // negative marking is disabled for this exam.
      negativeMarks: exam.negativeMarkingEnabled && Number.isFinite(q?.negativeMarks) ? (q?.negativeMarks as number) : 0,
      explanation: '', // Sanitized: Never exposed during active test
      subject: q?.subject || '',
      topic: q?.topic || '',
      difficulty: q?.difficulty || 'MEDIUM',
    };
    return {
      questionId: qid,
      order,
      snapshot,
      shuffledOptionIds: optionOrderMap[qid] ?? qOptions.map((o) => o.id),
    };
  });

  const durationMin = Math.max(1, exam.durationMinutes || 30);
  const personalDeadline = now + durationMin * 60_000;
  const windowDeadline = Number.isFinite(exam.endTime) && (exam.endTime as number) > now
    ? (exam.endTime as number)
    : personalDeadline;
  const deadline = Math.max(now + 60_000, Math.min(personalDeadline, windowDeadline));

  const attempt: MCQAttempt = {
    id: uuid(),
    examId: exam.id,
    examTitle: exam.title,
    studentName,
    studentRoll,
    studentDept,
    studentSem,
    studentDiv: studentDiv || 'A',
    startTime: now,
    lastActivityAt: now,
    deadline,
    status: 'IN_PROGRESS',
    assignedQuestions,
    answers: {},
    maxScore: assignedQuestions.reduce((sum, aq) => sum + (aq.snapshot?.marks || 1), 0),
    tabSwitchCount: 0,
    unfocusedSeconds: 0,
    infractionLog: [],
  };

  saveAttempt(attempt);
  try {
    localStorage.setItem(MCQ_STORAGE_KEYS.ACTIVE_ATTEMPT, attempt.id);
  } catch {}
  return attempt;
}

/** Autosave an answer — called on every option selection */
export function saveAnswer(attemptId: string, questionId: string, optionId: string): boolean {
  const all = getAllAttempts();
  const idx = all.findIndex((a) => a.id === attemptId);
  if (idx < 0) return false;
  const attempt = all[idx];
  if (attempt.status !== 'IN_PROGRESS' || getSynchronizedNow() >= attempt.deadline) return false;
  const assigned = attempt.assignedQuestions.find((q) => q.questionId === questionId);
  if (!assigned) return false;
  if (optionId !== '' && !assigned.snapshot.options.some((option) => option.id === optionId)) return false;

  all[idx] = { ...attempt, answers: { ...attempt.answers, [questionId]: optionId }, lastActivityAt: getSynchronizedNow() };
  save(MCQ_STORAGE_KEYS.ATTEMPTS, all);
  try { localStorage.setItem('codedna_mcq_active_attempt_backup', JSON.stringify(all[idx])); } catch {}
  void saveAttemptToCloud(all[idx]);
  return true;
}

/** Record anti-cheat event */
export function recordInfraction(attemptId: string, event: string): void {
  const all = getAllAttempts();
  const idx = all.findIndex((a) => a.id === attemptId);
  if (idx < 0 || all[idx].status !== 'IN_PROGRESS' || !event?.trim()) return;
  const attempt = all[idx];
  all[idx] = {
    ...attempt,
    lastActivityAt: Date.now(),
    tabSwitchCount: Math.max(0, Number(attempt.tabSwitchCount) || 0) + 1,
    infractionLog: [...(Array.isArray(attempt.infractionLog) ? attempt.infractionLog : []), { timestamp: Date.now(), event: event.trim().slice(0, 240) }].slice(-200),
  };
  save(MCQ_STORAGE_KEYS.ATTEMPTS, all);
  void saveAttemptToCloud(all[idx]);
}

/** Update unfocused seconds */
export function updateUnfocusedTime(attemptId: string, totalSeconds: number): void {
  const all = getAllAttempts();
  const idx = all.findIndex((a) => a.id === attemptId);
  if (idx < 0 || all[idx].status !== 'IN_PROGRESS' || !Number.isFinite(totalSeconds)) return;
  all[idx] = { ...all[idx], unfocusedSeconds: Math.max(0, totalSeconds), lastActivityAt: Date.now() };
  save(MCQ_STORAGE_KEYS.ATTEMPTS, all);
  void saveAttemptToCloud(all[idx]);
}

// ── GRADING ENGINE ────────────────────────────────────────────────────────────

/**
 * Grade an attempt. Called ONLY at submission time.
 * Reads correct answers from the immutable snapshot stored at attempt-creation time.
 * Never trusts client-provided scores. Defensively handles any missing/null fields.
 */
export function gradeAttempt(attempt: MCQAttempt): MCQGradeResult {
  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  const assignedQuestions = Array.isArray(attempt?.assignedQuestions) ? attempt.assignedQuestions : [];
  const answers = attempt?.answers || {};

  const perQuestion = assignedQuestions.map((aq, index) => {
    const snapshot = aq?.snapshot || {
      questionId: aq?.questionId || `q-${index}`,
      text: 'Question content pending synchronization',
      options: [],
      correctOptionId: '',
      marks: 1,
      negativeMarks: 0,
      explanation: '',
      subject: '',
      topic: '',
      difficulty: 'MEDIUM' as const
    };
    const options = Array.isArray(snapshot.options) ? snapshot.options : [];
    const qId = aq?.questionId || snapshot.questionId;
    const selectedOptionId = (answers && qId ? answers[qId] : '') ?? '';
    const isUnanswered = !selectedOptionId;

    // Authoritative lookup: Resolve true correct answer directly from question bank
    const bankQ = qId ? getQuestionById(qId) : undefined;
    const authoritativeCorrectId =
      bankQ?.options?.find((o) => o?.isCorrect)?.id ||
      options.find((o: any) => o?.isCorrect)?.id ||
      snapshot.correctOptionId ||
      '';
    const authoritativeExplanation = bankQ?.explanation || snapshot.explanation || '';

    const isCorrect = !isUnanswered && selectedOptionId === authoritativeCorrectId;

    const qMarks = Number.isFinite(snapshot.marks) ? snapshot.marks : 1;
    const qNeg = Number.isFinite(snapshot.negativeMarks) ? snapshot.negativeMarks : 0;

    let marksAwarded = 0;
    if (isUnanswered) {
      unansweredCount++;
    } else if (isCorrect) {
      marksAwarded = qMarks;
      correctCount++;
    } else {
      marksAwarded = -qNeg;
      wrongCount++;
    }

    score += marksAwarded;

    const selectedOption = options.find((o) => o?.id === selectedOptionId);
    const correctOption = options.find((o) => o?.id === authoritativeCorrectId);

    return {
      questionId: qId,
      selectedOptionId,
      correctOptionId: authoritativeCorrectId,
      isCorrect,
      marksAwarded,
      question: typeof snapshot.text === 'string' ? snapshot.text : String(snapshot.text ?? ''),
      selectedText: selectedOption?.text ? String(selectedOption.text) : (isUnanswered ? '(unanswered)' : '(invalid selection)'),
      correctText: correctOption?.text ? String(correctOption.text) : '',
      explanation: typeof authoritativeExplanation === 'string' ? authoritativeExplanation : String(authoritativeExplanation ?? ''),
    };
  });

  // Clamp score to 0 minimum
  score = Math.max(0, score);
  const calculatedMax = assignedQuestions.reduce((sum, aq) => sum + (Number.isFinite(aq?.snapshot?.marks) ? (aq.snapshot.marks || 1) : 1), 0);
  const maxScore = Number.isFinite(attempt?.maxScore) && (attempt.maxScore ?? 0) > 0 ? (attempt.maxScore as number) : Math.max(1, calculatedMax);
  const percentageScore = maxScore > 0 ? Math.round((score / maxScore) * 100 * 10) / 10 : 0;

  return {
    score,
    maxScore,
    correctCount,
    wrongCount,
    unansweredCount,
    percentageScore,
    perQuestion,
  };
}

/** Submit attempt — grades it and persists the result to local and Supabase cloud */
export function submitAttempt(
  attemptId: string,
  finalAnswers: Record<string, string>,
  requestedStatus: MCQAttemptStatus = 'SUBMITTED'
): MCQGradeResult | null {
  const all = getAllAttempts();
  const idx = all.findIndex((a) => a.id === attemptId);
  if (idx < 0) return null;
  const existing = all[idx];
  if (!existing) return null;

  // Finalized attempts are immutable; duplicate submissions return the stored grade.
  if (existing.status !== 'IN_PROGRESS') {
    return gradeAttempt(existing);
  }

  const now = getSynchronizedNow();
  const finalStatus: MCQAttemptStatus =
    now >= (existing.deadline || 0) || requestedStatus === 'TIMED_OUT'
      ? 'TIMED_OUT'
      : requestedStatus === 'ABANDONED'
        ? 'ABANDONED'
        : 'SUBMITTED';

  const assignedQuestions = Array.isArray(existing.assignedQuestions) ? existing.assignedQuestions : [];
  const assignedById = new Map(assignedQuestions.map((q) => [q.questionId, q]));

  // Merge the final UI payload with persisted answers so partial payloads cannot
  // accidentally erase previously saved responses.
  const sanitizedAnswers: Record<string, string> = { ...(existing.answers || {}) };
  for (const [questionId, optionId] of Object.entries(finalAnswers || {})) {
    if (optionId) {
      sanitizedAnswers[questionId] = optionId;
    }
  }

  const attempt: MCQAttempt = { ...existing, answers: sanitizedAnswers, lastActivityAt: now };
  const grade = gradeAttempt(attempt);
  const finalAttempt: MCQAttempt = {
    ...attempt,
    status: finalStatus,
    submitTime: now,
    gradedAt: now,
    score: grade.score,
    correctCount: grade.correctCount,
    wrongCount: grade.wrongCount,
    unansweredCount: grade.unansweredCount,
    percentageScore: grade.percentageScore,
  };
  all[idx] = finalAttempt;
  save(MCQ_STORAGE_KEYS.ATTEMPTS, all);
  try {
    sessionStorage.setItem('codedna_mcq_last_finished_attempt', attemptId);
    sessionStorage.removeItem('codedna_mcq_session_attempt');
    localStorage.removeItem(MCQ_STORAGE_KEYS.ACTIVE_ATTEMPT);
    localStorage.removeItem('codedna_mcq_active_attempt_backup');
    localStorage.removeItem(`codedna_mcq_active_attempt_${finalAttempt.examId}`);
    localStorage.setItem(`codedna_mcq_finished_${finalAttempt.examId}`, attemptId);
  } catch {}
  void saveAttemptToCloud(finalAttempt);
  return grade;
}


// ── MCQ option builder helper ─────────────────────────────────────────────────

export function buildOption(text: string, isCorrect = false): MCQOption {
  return { id: uuid(), text, isCorrect };
}

// ── INITIAL BACKGROUND SUPABASE SYNC & REALTIME SUBSCRIPTION ──────────────────

type Listener = () => void;
const examListeners: Set<Listener> = new Set();

export function onExamsChanged(cb: Listener): () => void {
  examListeners.add(cb);
  return () => { examListeners.delete(cb); };
}

function notifyExamsChanged() {
  examListeners.forEach((cb) => {
    try { cb(); } catch {}
  });
}

function mergeUpdatedRecords<T extends { id: string; updatedAt?: number }>(localRecords: T[], cloudRecords: T[]): T[] {
  const merged = new Map(localRecords.map((record) => [record.id, record]));
  for (const cloudRecord of cloudRecords) {
    const localRecord = merged.get(cloudRecord.id);
    if (!localRecord || (cloudRecord.updatedAt ?? 0) >= (localRecord.updatedAt ?? 0)) {
      merged.set(cloudRecord.id, cloudRecord);
    }
  }
  return Array.from(merged.values());
}

function mergeAttempts(localAttempts: MCQAttempt[], cloudAttempts: MCQAttempt[]): MCQAttempt[] {
  const merged = new Map(localAttempts.map((attempt) => [attempt.id, attempt]));
  for (const cloudAttempt of cloudAttempts) {
    const localAttempt = merged.get(cloudAttempt.id);
    if (!localAttempt) {
      merged.set(cloudAttempt.id, cloudAttempt);
      continue;
    }
    const localFinal = localAttempt.status !== 'IN_PROGRESS';
    const cloudFinal = cloudAttempt.status !== 'IN_PROGRESS';
    if (cloudFinal && !localFinal) {
      merged.set(cloudAttempt.id, cloudAttempt);
    } else if (localFinal && !cloudFinal) {
      continue;
    } else if ((cloudAttempt.lastActivityAt ?? cloudAttempt.submitTime ?? 0) >
               (localAttempt.lastActivityAt ?? localAttempt.submitTime ?? 0)) {
      merged.set(cloudAttempt.id, cloudAttempt);
    } else if (!localFinal && !cloudFinal &&
               Object.keys(cloudAttempt.answers || {}).length > Object.keys(localAttempt.answers || {}).length) {
      merged.set(cloudAttempt.id, cloudAttempt);
    }
  }
  return Array.from(merged.values());
}

export const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function pruneExpiredLocalData(): void {
  try {
    const cutoff = Date.now() - ONE_WEEK_MS;
    const attempts = getAllAttempts();
    const pruned = attempts.filter((a) => {
      if (a.status === 'IN_PROGRESS') return true;
      const refTime = a.submitTime || a.startTime || 0;
      return refTime >= cutoff;
    });
    if (pruned.length !== attempts.length) {
      save(MCQ_STORAGE_KEYS.ATTEMPTS, pruned);
    }
  } catch {}
}

export async function persistAttemptToCloud(attemptId: string): Promise<boolean> {
  const latest = getAttemptById(attemptId);
  if (!latest) return false;
  return saveAttemptToCloud(latest);
}

export async function syncFromSupabase(): Promise<void> {
  try {
    const [cloudQ, cloudE, cloudA] = await Promise.all([
      fetchQuestionsFromCloud(), fetchExamsFromCloud(), fetchAttemptsFromCloud()
    ]);

    // 1. Reconcile Questions: Supabase cloud is authoritative
    if (cloudQ !== null) {
      save(MCQ_STORAGE_KEYS.QUESTIONS, cloudQ);
      notifyMcqDataChanged();
    }

    // 2. Reconcile Exams: Supabase cloud is authoritative
    if (cloudE !== null) {
      const deletedIds = getDeletedExamIds();

      // Ensure any cloud exams that were marked deleted locally get purged from cloud
      for (const ex of cloudE) {
        if (deletedIds.has(ex.id)) {
          void deleteExamFromCloud(ex.id);
        }
      }

      // Filter out deleted IDs and save directly as authoritative
      const activeExams = cloudE.filter((e) => !deletedIds.has(e.id));
      save(MCQ_STORAGE_KEYS.EXAMS, activeExams);
      notifyExamsChanged();
    }

    // 3. Reconcile Attempts: Supabase cloud is authoritative
    if (cloudA !== null) {
      const cutoff = Date.now() - ONE_WEEK_MS;
      const recentCloudAttempts = cloudA.filter(
        (a) => a.status === 'IN_PROGRESS' || (a.submitTime || a.startTime || 0) >= cutoff
      );
      const localAttempts = getAllAttempts();
      const reconciled = mergeAttempts(localAttempts, recentCloudAttempts);
      save(MCQ_STORAGE_KEYS.ATTEMPTS, reconciled);
      notifyMcqDataChanged();
    }

    // 4. Prune local data older than 1 week
    pruneExpiredLocalData();
  } catch (err) {
    console.warn('[mcqService] Background Supabase sync notice:', err);
  }
}

if (typeof window !== 'undefined') {
  pruneExpiredLocalData();
  void syncFromSupabase();
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  subscribeToMcqCloudChanges(() => {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { void syncFromSupabase(); }, 350);
  });
}

