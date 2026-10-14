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
  subscribeToMcqCloudChanges,
  fetchQuestionsFromCloud,
  fetchExamsFromCloud,
  fetchAttemptsFromCloud
} from './supabaseService';

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
    // Recovery is scoped to this browser tab. localStorage is shared by every
    // candidate on a lab workstation, so it must never choose a session alone.
    const sessionAttemptId = sessionStorage.getItem('codedna_mcq_session_attempt');
    if (!sessionAttemptId) return null;

    const attempt = getAttemptById(sessionAttemptId);
    if (attempt && attempt.status === 'IN_PROGRESS') return attempt;

    // Restore the local cache only when the tab-scoped ID matches the backup.
    const backupRaw = localStorage.getItem('codedna_mcq_active_attempt_backup');
    if (backupRaw) {
      const backupAttempt = JSON.parse(backupRaw) as MCQAttempt;
      if (backupAttempt?.id === sessionAttemptId && backupAttempt.status === 'IN_PROGRESS') {
        saveAttempt(backupAttempt);
        return backupAttempt;
      }
    }
    sessionStorage.removeItem('codedna_mcq_session_attempt');
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
      sessionStorage.setItem('codedna_mcq_session_attempt', attempt.id);
    } else {
      localStorage.removeItem('codedna_mcq_active_attempt_backup');
      localStorage.removeItem(MCQ_STORAGE_KEYS.ACTIVE_ATTEMPT);
      sessionStorage.removeItem('codedna_mcq_session_attempt');
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

  const now = Date.now();
  if (exam.status !== 'PUBLISHED') throw new Error('This examination is not published.');
  if (exam.startTime && now < exam.startTime) throw new Error('This examination has not started yet.');
  if (exam.endTime && now >= exam.endTime) throw new Error('The examination submission window has closed.');
  if (candidateAttempts.length >= Math.max(1, exam.maxAttempts || 1)) {
    throw new Error('You have reached the maximum number of attempts for this examination.');
  }
  if (!Array.isArray(exam.questionIds) || exam.questionIds.length < 1) {
    throw new Error('This examination has no assigned questions.');
  }
  if (new Set(exam.questionIds).size !== exam.questionIds.length) {
    throw new Error('This examination contains duplicate question assignments. Contact the paper setter.');
  }

  const questions = exam.questionIds
    .map((id) => getQuestionById(id))
    .filter((q): q is MCQQuestion => q !== undefined);
  if (questions.length !== exam.questionIds.length) {
    throw new Error('One or more assigned questions are missing. Contact the paper setter.');
  }
  if (questions.length < exam.questionCount) {
    throw new Error('The assigned question bank is smaller than the configured question count.');
  }
  if (questions.some((q) => q.status !== 'PUBLISHED')) {
    throw new Error('One or more assigned questions are not published. Contact the paper setter.');
  }
  if (questions.some((q) =>
    !Array.isArray(q.options) ||
    q.options.length < 2 ||
    q.options.some((option) => !option.id || !option.text?.trim()) ||
    q.options.filter((option) => option.isCorrect).length !== 1
  )) {
    throw new Error('This examination contains an invalid question. Contact the paper setter.');
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
      // Respect the exam-level policy; per-question penalties are ignored when
      // negative marking is disabled for this exam.
      negativeMarks: exam.negativeMarkingEnabled ? q.negativeMarks : 0,
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
    // The attempt cannot outlive its personal duration or the examination window.
    deadline: Math.min(
      now + exam.durationMinutes * 60_000,
      Number.isFinite(exam.endTime) ? (exam.endTime as number) : Number.POSITIVE_INFINITY
    ),
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
export function saveAnswer(attemptId: string, questionId: string, optionId: string): boolean {
  const all = getAllAttempts();
  const idx = all.findIndex((a) => a.id === attemptId);
  if (idx < 0) return false;
  const attempt = all[idx];
  if (attempt.status !== 'IN_PROGRESS' || Date.now() >= attempt.deadline) return false;
  const assigned = attempt.assignedQuestions.find((q) => q.questionId === questionId);
  if (!assigned) return false;
  if (optionId !== '' && !assigned.snapshot.options.some((option) => option.id === optionId)) return false;

  all[idx] = { ...attempt, answers: { ...attempt.answers, [questionId]: optionId }, lastActivityAt: Date.now() };
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
  requestedStatus: MCQAttemptStatus = 'SUBMITTED'
): MCQGradeResult | null {
  const all = getAllAttempts();
  const idx = all.findIndex((a) => a.id === attemptId);
  if (idx < 0) return null;
  const existing = all[idx];

  // Finalized attempts are immutable; duplicate submissions return the stored grade.
  if (existing.status !== 'IN_PROGRESS') {
    return existing.score === undefined ? null : gradeAttempt(existing);
  }

  const now = Date.now();
  const finalStatus: MCQAttemptStatus =
    now >= existing.deadline || requestedStatus === 'TIMED_OUT'
      ? 'TIMED_OUT'
      : requestedStatus === 'ABANDONED'
        ? 'ABANDONED'
        : 'SUBMITTED';
  const assignedById = new Map(existing.assignedQuestions.map((q) => [q.questionId, q]));

  for (const [questionId, optionId] of Object.entries(finalAnswers || {})) {
    const assigned = assignedById.get(questionId);
    if (!assigned) return null;
    if (optionId && !assigned.snapshot.options.some((option) => option.id === optionId)) return null;
  }

  // Merge the final UI payload with persisted answers so partial payloads cannot
  // accidentally erase previously saved responses.
  const sanitizedAnswers: Record<string, string> = {};
  for (const assigned of existing.assignedQuestions) {
    const questionId = assigned.questionId;
    const selected = Object.prototype.hasOwnProperty.call(finalAnswers || {}, questionId)
      ? finalAnswers[questionId]
      : existing.answers[questionId];
    if (selected) sanitizedAnswers[questionId] = selected;
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
  void saveAttemptToCloud(finalAttempt);
  try {
    localStorage.removeItem(MCQ_STORAGE_KEYS.ACTIVE_ATTEMPT);
    localStorage.removeItem('codedna_mcq_active_attempt_backup');
    sessionStorage.removeItem('codedna_mcq_session_attempt');
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

    // 1. Reconcile Questions: replace local storage with cloud data, syncing any local-only items up to cloud
    if (cloudQ !== null) {
      const localQ = getAllQuestions();
      const cloudIds = new Set(cloudQ.map((q) => q.id));
      for (const q of localQ) {
        if (!cloudIds.has(q.id)) {
          void saveQuestionToCloud(q);
        }
      }
      save(MCQ_STORAGE_KEYS.QUESTIONS, cloudQ.length > 0 ? cloudQ : mergeUpdatedRecords(localQ, cloudQ));
    }

    // 2. Reconcile Exams: replace local storage with cloud data, syncing any local-only items up to cloud
    if (cloudE !== null) {
      const localE = getAllExams();
      const cloudIds = new Set(cloudE.map((e) => e.id));
      for (const ex of localE) {
        if (!cloudIds.has(ex.id)) {
          void saveExamToCloud(ex);
        }
      }
      const reconciled = cloudE.map((ce) => {
        const localMatch = localE.find((le) => le.id === ce.id);
        if (localMatch) {
          const resultDeclarationMode =
            ce.resultDeclarationMode || localMatch.resultDeclarationMode || 'IMMEDIATE';
          const whatsappGroupName = ce.whatsappGroupName || localMatch.whatsappGroupName || '';
          const whatsappGroupLink = ce.whatsappGroupLink || localMatch.whatsappGroupLink || '';
          return { ...ce, resultDeclarationMode, whatsappGroupName, whatsappGroupLink };
        }
        return ce;
      });
      save(MCQ_STORAGE_KEYS.EXAMS, reconciled.length > 0 ? reconciled : localE);
      notifyExamsChanged();
    }

    // 3. Reconcile Attempts: replace local storage with cloud data, temporarily cached for 1 week
    if (cloudA !== null) {
      const localA = getAllAttempts();
      const cloudIds = new Set(cloudA.map((a) => a.id));
      for (const a of localA) {
        if (!cloudIds.has(a.id)) {
          void saveAttemptToCloud(a);
        }
      }

      const cutoff = Date.now() - ONE_WEEK_MS;
      // Retain active sessions plus concluded attempts from the last 7 days (1 week temp cache)
      const recentCloudAttempts = cloudA.filter(
        (a) => a.status === 'IN_PROGRESS' || (a.submitTime || a.startTime || 0) >= cutoff
      );
      save(MCQ_STORAGE_KEYS.ATTEMPTS, recentCloudAttempts);
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

