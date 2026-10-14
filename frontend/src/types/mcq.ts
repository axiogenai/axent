// ============================================================================
// MCQ TYPE DEFINITIONS
// CodeDNA MCQ Exam Engine — Full Type System
// All state is stored in localStorage (frontend-only architecture)
// ============================================================================

export type MCQDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type MCQQuestionStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type MCQExamStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED';
export type MCQAttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'TIMED_OUT' | 'ABANDONED';

// ── Answer Option ─────────────────────────────────────────────────────────────
export interface MCQOption {
  id: string;           // UUID – stable, never A/B/C/D
  text: string;         // Option text (plain text)
  isCorrect: boolean;   // Server-authoritative – never sent to student view
}

// ── Question in the Bank ──────────────────────────────────────────────────────
export interface MCQQuestion {
  id: string;                 // UUID
  text: string;               // Question text
  options: MCQOption[];       // 2-6 options
  subject: string;
  topic: string;
  difficulty: MCQDifficulty;
  marks: number;              // Positive marks for correct
  negativeMarks: number;      // Penalty for wrong (e.g. 0.25, 0.5, 1)
  explanation: string;        // Shown post-submission if configured
  status: MCQQuestionStatus;
  tags: string[];
  createdAt: number;          // Epoch ms
  updatedAt: number;
  createdBy: string;          // Admin username / id
  bankGroup?: string;         // Optional question bank group
}

// ── Immutable snapshot embedded in an attempt ─────────────────────────────────
export interface MCQQuestionSnapshot {
  questionId: string;
  text: string;
  options: Array<{ id: string; text: string }>;  // isCorrect OMITTED for student
  correctOptionId: string;   // Stored server-side, not shown to student
  marks: number;
  negativeMarks: number;
  explanation: string;
  subject: string;
  topic: string;
  difficulty: MCQDifficulty;
}

// ── Per-attempt assigned question (snapshot + shuffled option order) ──────────
export interface MCQAssignedQuestion {
  questionId: string;
  order: number;              // Position in this attempt's sequence (0-indexed)
  snapshot: MCQQuestionSnapshot;
  shuffledOptionIds: string[]; // Shuffled order of option IDs for this attempt
}

// ── Exam Configuration ────────────────────────────────────────────────────────
export interface MCQExamConfig {
  id: string;
  title: string;
  description: string;
  instructions: string;
  subject: string;
  topic: string;
  examCategory: string;       // Reuses ExamCategory values from dna.ts
  durationMinutes: number;
  startTime?: number;         // Epoch ms, optional
  endTime?: number;           // Epoch ms, optional
  totalMarks: number;
  questionCount: number;
  questionIds: string[];      // Manually selected questions
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  negativeMarkingEnabled: boolean;
  allowReview: boolean;       // Can revisit previous questions
  showExplanationsAfterSubmit: boolean;
  maxAttempts: number;
  resultDeclarationMode?: MCQResultDeclarationMode; // 'IMMEDIATE' (default) or 'WHATSAPP_GROUP'
  whatsappGroupName?: string;                       // e.g. "TE Computer Div A - 2026 Batch"
  whatsappGroupLink?: string;                       // e.g. "https://chat.whatsapp.com/..."
  resultsDeclaredAt?: number;                       // Timestamp when results were declared/dispatched
  status: MCQExamStatus;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  publishedAt?: number;
}

export type MCQResultDeclarationMode = 'IMMEDIATE' | 'WHATSAPP_GROUP';

// ── Student Attempt ───────────────────────────────────────────────────────────
export interface MCQAttempt {
  id: string;                  // UUID
  examId: string;
  examTitle: string;
  studentName: string;
  studentRoll: string;
  studentDept: string;
  studentSem: string;
  studentDiv?: string;
  startTime: number;           // Epoch ms
  deadline: number;            // Epoch ms (startTime + durationMs)
  lastActivityAt?: number;     // Epoch ms; used to reconcile cross-device sync safely
  submitTime?: number;
  status: MCQAttemptStatus;

  // The shuffled, immutable assignment for this attempt
  assignedQuestions: MCQAssignedQuestion[];

  // Student answers: questionId → selectedOptionId ('' means unanswered)
  answers: Record<string, string>;

  // Grading (computed at submission, never during attempt)
  score?: number;
  maxScore: number;
  correctCount?: number;
  wrongCount?: number;
  unansweredCount?: number;
  percentageScore?: number;
  gradedAt?: number;

  // Anti-cheat
  tabSwitchCount: number;
  unfocusedSeconds: number;
  infractionLog: Array<{ timestamp: number; event: string; details?: string }>;
}

// ── Grade result returned by grader ──────────────────────────────────────────
export interface MCQGradeResult {
  score: number;
  maxScore: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  percentageScore: number;
  perQuestion: Array<{
    questionId: string;
    selectedOptionId: string;
    correctOptionId: string;
    isCorrect: boolean;
    marksAwarded: number;
    question: string;
    selectedText: string;
    correctText: string;
    explanation: string;
  }>;
}

// ── localStorage storage contract ────────────────────────────────────────────
export const MCQ_STORAGE_KEYS = {
  QUESTIONS: 'codedna_mcq_bank',
  EXAMS: 'codedna_mcq_exams',
  ATTEMPTS: 'codedna_mcq_attempts',
  ACTIVE_ATTEMPT: 'codedna_mcq_active_attempt',
} as const;
