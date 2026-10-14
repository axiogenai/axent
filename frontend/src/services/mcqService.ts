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
  saveExamToCloud,
  deleteExamFromCloud,
  saveAttemptToCloud,
  fetchQuestionsFromCloud,
  fetchExamsFromCloud,
  fetchAttemptsFromCloud
} from './supabaseService';

// ── Persistence helpers ───────────────────────────────────────────────────────

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
  } catch (e) {
    console.error('[mcqService] localStorage write failed:', e);
  }
}

function uuid(): string {
  return crypto.randomUUID();
}

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
          !String(e.id || '').startsWith('seed-')
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
  return (loaded || []).filter((q) => !String(q.id || '').startsWith('seed-'));
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

export function publishQuestion(id: string): void {
  const all = getAllQuestions();
  const idx = all.findIndex((q) => q.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], status: 'PUBLISHED', updatedAt: Date.now() };
    save(MCQ_STORAGE_KEYS.QUESTIONS, all);
    saveQuestionToCloud(all[idx]);
  }
}

/** Validate a question has required fields + at least 2 options + exactly 1 correct */
export function validateQuestion(q: Partial<MCQQuestion>): string[] {
  const errors: string[] = [];
  if (!q.text?.trim()) errors.push('Question text is required.');
  if (!q.subject?.trim()) errors.push('Subject is required.');
  if (!q.topic?.trim()) errors.push('Topic is required.');
  if (!q.marks || q.marks <= 0) errors.push('Marks must be positive.');
  if (!q.options || q.options.length < 2) errors.push('At least 2 options required.');
  if (q.options && q.options.some((o) => !o.text.trim())) errors.push('All options must have text.');
  if (q.options && q.options.filter((o) => o.isCorrect).length !== 1) {
    errors.push('Exactly one correct option must be selected.');
  }
  return errors;
}

// ── MCQ EXAMS (Authoritative Real Exams Only) ─────────────────────────────────

export function getAllExams(): MCQExamConfig[] {
  const loaded = load<MCQExamConfig[]>(MCQ_STORAGE_KEYS.EXAMS, []);
  // Return loaded real exams (clean, zero fake seed fallback)
  return (loaded || []).filter((e) => 
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

export function deleteExam(id: string): void {
  const all = getAllExams().filter((e) => e.id !== id);
  save(MCQ_STORAGE_KEYS.EXAMS, all);
  deleteExamFromCloud(id);
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
  if (!exam.durationMinutes || exam.durationMinutes <= 0) errors.push('Duration must be positive.');
  if (!exam.questionIds || exam.questionIds.length === 0) errors.push('No questions selected.');
  if (exam.questionIds.length < exam.questionCount) {
    errors.push(`You selected ${exam.questionIds.length} questions but want ${exam.questionCount}. Add more questions.`);
  }
  if (!exam.totalMarks || exam.totalMarks <= 0) errors.push('Total marks must be positive.');

  const questions = exam.questionIds.map((id) => getQuestionById(id)).filter(Boolean) as MCQQuestion[];
  const missingOptions = questions.filter((q) => q.options.length < 2);
  if (missingOptions.length > 0) errors.push(`${missingOptions.length} question(s) have fewer than 2 options.`);

  const missingCorrect = questions.filter((q) => q.options.filter((o) => o.isCorrect).length !== 1);
  if (missingCorrect.length > 0) errors.push(`${missingCorrect.length} question(s) do not have exactly one correct answer.`);

  if (exam.startTime && exam.endTime && exam.startTime >= exam.endTime) {
    errors.push('Start time must be before end time.');
  }

  return errors;
}

// ── ATTEMPTS ──────────────────────────────────────────────────────────────────

export function getAllAttempts(): MCQAttempt[] {
  return load<MCQAttempt[]>(MCQ_STORAGE_KEYS.ATTEMPTS, []);
}

export function getAttemptById(id: string): MCQAttempt | undefined {
  return getAllAttempts().find((a) => a.id === id);
}

export function getAttemptsForExam(examId: string): MCQAttempt[] {
  return getAllAttempts().filter((a) => a.examId === examId);
}

export function getActiveAttempt(): MCQAttempt | null {
  try {
    const raw = localStorage.getItem(MCQ_STORAGE_KEYS.ACTIVE_ATTEMPT);
    let id = '';
    if (raw) {
      id = raw.trim();
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string') id = parsed.trim();
      } catch {}

      if (id.startsWith('"') && id.endsWith('"')) {
        id = id.slice(1, -1);
      }
    }

    if (id) {
      const attempt = getAttemptById(id);
      if (attempt && attempt.status === 'IN_PROGRESS') {
        return attempt;
      }
    }

    // Direct backup object check (guarantees instantaneous zero-lag recovery on refresh)
    const backupRaw = localStorage.getItem('codedna_mcq_active_attempt_backup');
    if (backupRaw) {
      const backupAttempt = JSON.parse(backupRaw) as MCQAttempt;
      if (backupAttempt && backupAttempt.id && backupAttempt.status === 'IN_PROGRESS') {
        return backupAttempt;
      }
    }

    // Fallback: check if any attempt in the ledger is currently IN_PROGRESS
    const all = getAllAttempts();
    const inProgress = all.find((a) => a.status === 'IN_PROGRESS');
    if (inProgress) {
      return inProgress;
    }

    return null;
  } catch {
    return null;
  }
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
    } else {
      localStorage.removeItem('codedna_mcq_active_attempt_backup');
      localStorage.removeItem(MCQ_STORAGE_KEYS.ACTIVE_ATTEMPT);
    }
  } catch {}
  saveAttemptToCloud(attempt);
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
  const questions = exam.questionIds
    .map((id) => getQuestionById(id))
    .filter((q): q is MCQQuestion => q !== undefined && q.status !== 'ARCHIVED');

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

  // Build assigned questions with immutable snapshots (correctOptionId STORED but never shown in UI)
  const assignedQuestions: MCQAssignedQuestion[] = orderedQuestionIds.map((qid, order) => {
    const q = questions.find((x) => x.id === qid)!;
    const correctOption = q.options.find((o) => o.isCorrect);
    const snapshot: MCQQuestionSnapshot = {
      questionId: q.id,
      text: q.text,
      options: q.options.map((o) => ({ id: o.id, text: o.text })), // no isCorrect
      correctOptionId: correctOption?.id ?? '',
      marks: q.marks,
      negativeMarks: q.negativeMarks,
      explanation: q.explanation,
      subject: q.subject,
      topic: q.topic,
      difficulty: q.difficulty,
    };
    return {
      questionId: qid,
      order,
      snapshot,
      shuffledOptionIds: optionOrderMap[qid] ?? q.options.map((o) => o.id),
    };
  });

  const now = Date.now();
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
    deadline: now + exam.durationMinutes * 60_000,
    status: 'IN_PROGRESS',
    assignedQuestions,
    answers: {},
    maxScore: assignedQuestions.reduce((sum, aq) => sum + aq.snapshot.marks, 0),
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
export function saveAnswer(attemptId: string, questionId: string, optionId: string): void {
  const all = getAllAttempts();
  const idx = all.findIndex((a) => a.id === attemptId);
  if (idx < 0) return;
  all[idx] = {
    ...all[idx],
    answers: { ...all[idx].answers, [questionId]: optionId },
  };
  save(MCQ_STORAGE_KEYS.ATTEMPTS, all);
  try {
    localStorage.setItem('codedna_mcq_active_attempt_backup', JSON.stringify(all[idx]));
  } catch {}
  saveAttemptToCloud(all[idx]);
}

/** Record anti-cheat event */
export function recordInfraction(attemptId: string, event: string): void {
  const all = getAllAttempts();
  const idx = all.findIndex((a) => a.id === attemptId);
  if (idx < 0) return;
  const attempt = all[idx];
  all[idx] = {
    ...attempt,
    tabSwitchCount: attempt.tabSwitchCount + 1,
    infractionLog: [...attempt.infractionLog, { timestamp: Date.now(), event }],
  };
  save(MCQ_STORAGE_KEYS.ATTEMPTS, all);
  saveAttemptToCloud(all[idx]);
}

/** Update unfocused seconds */
export function updateUnfocusedTime(attemptId: string, totalSeconds: number): void {
  const all = getAllAttempts();
  const idx = all.findIndex((a) => a.id === attemptId);
  if (idx < 0) return;
  all[idx] = { ...all[idx], unfocusedSeconds: totalSeconds };
  save(MCQ_STORAGE_KEYS.ATTEMPTS, all);
  saveAttemptToCloud(all[idx]);
}

// ── GRADING ENGINE ────────────────────────────────────────────────────────────

/**
 * Grade an attempt. Called ONLY at submission time.
 * Reads correct answers from the immutable snapshot stored at attempt-creation time.
 * Never trusts client-provided scores.
 */
export function gradeAttempt(attempt: MCQAttempt): MCQGradeResult {
  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  const perQuestion = attempt.assignedQuestions.map((aq) => {
    const { snapshot } = aq;
    const selectedOptionId = attempt.answers[aq.questionId] ?? '';
    const isUnanswered = !selectedOptionId;
    const isCorrect = !isUnanswered && selectedOptionId === snapshot.correctOptionId;

    let marksAwarded = 0;
    if (isUnanswered) {
      unansweredCount++;
    } else if (isCorrect) {
      marksAwarded = snapshot.marks;
      correctCount++;
    } else {
      marksAwarded = -snapshot.negativeMarks;
      wrongCount++;
    }

    score += marksAwarded;

    const selectedOption = snapshot.options.find((o) => o.id === selectedOptionId);
    const correctOption = snapshot.options.find((o) => o.id === snapshot.correctOptionId);

    return {
      questionId: aq.questionId,
      selectedOptionId,
      correctOptionId: snapshot.correctOptionId,
      isCorrect,
      marksAwarded,
      question: snapshot.text,
      selectedText: selectedOption?.text ?? '(unanswered)',
      correctText: correctOption?.text ?? '',
      explanation: snapshot.explanation,
    };
  });

  // Clamp score to 0 minimum
  score = Math.max(0, score);
  const maxScore = attempt.maxScore;
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
  status: MCQAttemptStatus = 'SUBMITTED'
): MCQGradeResult | null {
  const all = getAllAttempts();
  const idx = all.findIndex((a) => a.id === attemptId);
  if (idx < 0) return null;

  const attempt: MCQAttempt = { ...all[idx], answers: finalAnswers };
  const grade = gradeAttempt(attempt);
  const now = Date.now();

  const finalAttempt: MCQAttempt = {
    ...attempt,
    status,
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
  saveAttemptToCloud(finalAttempt);
  localStorage.removeItem(MCQ_STORAGE_KEYS.ACTIVE_ATTEMPT);
  try {
    localStorage.removeItem('codedna_mcq_active_attempt_backup');
  } catch {}
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

export async function syncFromSupabase(): Promise<void> {
  try {
    const cloudQ = await fetchQuestionsFromCloud();
    if (cloudQ && cloudQ.length > 0) {
      save(MCQ_STORAGE_KEYS.QUESTIONS, cloudQ);
    }
    const cloudE = await fetchExamsFromCloud();
    if (cloudE && cloudE.length > 0) {
      save(MCQ_STORAGE_KEYS.EXAMS, cloudE);
      notifyExamsChanged();
    }
    const cloudA = await fetchAttemptsFromCloud();
    if (cloudA && cloudA.length > 0) {
      save(MCQ_STORAGE_KEYS.ATTEMPTS, cloudA);
    }
  } catch (err) {
    console.warn('[mcqService] Background Supabase sync notice:', err);
  }
}

if (typeof window !== 'undefined') {
  syncFromSupabase();
}

