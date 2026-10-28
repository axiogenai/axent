// ============================================================================
// CODING QUESTION SERVICE — Code Spark Exam Engine
// localStorage-backed, mirrors mcqService.ts pattern
// ============================================================================

import { CodingQuestion, CodingExam, CodingDifficulty, AllowedLanguage, TestCase } from '../types/codingQuestion';

const CODING_QUESTIONS_KEY = 'codedna_coding_questions';
const CODING_EXAMS_KEY = 'codedna_coding_exams';

// ── Change listeners ─────────────────────────────────────────────────────────
type Listener = () => void;
const listeners: Set<Listener> = new Set();

export function onCodingDataChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

// ── Coding Questions ─────────────────────────────────────────────────────────
export function getAllCodingQuestions(): CodingQuestion[] {
  try {
    const raw = localStorage.getItem(CODING_QUESTIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CodingQuestion[];
  } catch {
    return [];
  }
}

function saveCodingQuestions(questions: CodingQuestion[]): void {
  localStorage.setItem(CODING_QUESTIONS_KEY, JSON.stringify(questions));
  notifyListeners();
}

export function getCodingQuestion(id: string): CodingQuestion | null {
  return getAllCodingQuestions().find((q) => q.id === id) ?? null;
}

export function createCodingQuestion(data: Omit<CodingQuestion, 'id' | 'createdAt' | 'updatedAt'>): CodingQuestion {
  const now = Date.now();
  const question: CodingQuestion = {
    ...data,
    id: `cq_${now}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  const questions = getAllCodingQuestions();
  questions.push(question);
  saveCodingQuestions(questions);
  return question;
}

export function updateCodingQuestion(id: string, updates: Partial<CodingQuestion>): CodingQuestion | null {
  const questions = getAllCodingQuestions();
  const idx = questions.findIndex((q) => q.id === id);
  if (idx === -1) return null;
  questions[idx] = { ...questions[idx], ...updates, updatedAt: Date.now() };
  saveCodingQuestions(questions);
  return questions[idx];
}

export function deleteCodingQuestion(id: string): boolean {
  const questions = getAllCodingQuestions();
  const filtered = questions.filter((q) => q.id !== id);
  if (filtered.length === questions.length) return false;
  saveCodingQuestions(filtered);
  return true;
}

export function publishCodingQuestion(id: string): boolean {
  const q = getCodingQuestion(id);
  if (!q) return false;
  updateCodingQuestion(id, { status: 'PUBLISHED' });
  return true;
}

// ── Coding Exams ──────────────────────────────────────────────────────────────
export function getAllCodingExams(): CodingExam[] {
  try {
    const raw = localStorage.getItem(CODING_EXAMS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CodingExam[];
  } catch {
    return [];
  }
}

function saveCodingExams(exams: CodingExam[]): void {
  localStorage.setItem(CODING_EXAMS_KEY, JSON.stringify(exams));
  notifyListeners();
}

export function createCodingExam(data: Omit<CodingExam, 'id' | 'createdAt' | 'updatedAt'>): CodingExam {
  const now = Date.now();
  const exam: CodingExam = {
    ...data,
    id: `ce_${now}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  const exams = getAllCodingExams();
  exams.push(exam);
  saveCodingExams(exams);
  return exam;
}

export function updateCodingExam(id: string, updates: Partial<CodingExam>): CodingExam | null {
  const exams = getAllCodingExams();
  const idx = exams.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  exams[idx] = { ...exams[idx], ...updates, updatedAt: Date.now() };
  saveCodingExams(exams);
  return exams[idx];
}

export function deleteCodingExam(id: string): boolean {
  const exams = getAllCodingExams();
  const filtered = exams.filter((e) => e.id !== id);
  if (filtered.length === exams.length) return false;
  saveCodingExams(filtered);
  return true;
}

// ── Shortlisting ──────────────────────────────────────────────────────────────
export function shortlistCandidates(examId: string, rollNumbers: string[]): boolean {
  return !!updateCodingExam(examId, { shortlistedRollNumbers: rollNumbers });
}

export function isShortlisted(examId: string, rollNumber: string): boolean {
  const exam = getAllCodingExams().find((e) => e.id === examId);
  if (!exam || !exam.shortlistedRollNumbers) return false;
  return exam.shortlistedRollNumbers.includes(rollNumber.trim().toUpperCase());
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function makeTestCase(partial: Partial<TestCase> = {}): TestCase {
  return {
    id: `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    input: '',
    expectedOutput: '',
    isHidden: false,
    isSample: true,
    explanation: '',
    ...partial,
  };
}

export const DEFAULT_ALLOWED_LANGUAGES: AllowedLanguage[] = [
  { language: 'Python 3.8', timeMultiplier: 3 },
  { language: 'C++ 17', timeMultiplier: 1 },
  { language: 'Java 17', timeMultiplier: 2 },
  { language: 'JavaScript (Node)', timeMultiplier: 2 },
  { language: 'C', timeMultiplier: 1 },
];

export const DIFFICULTY_MARKS: Record<CodingDifficulty, number> = {
  EASY: 10,
  MEDIUM: 20,
  HARD: 30,
};
