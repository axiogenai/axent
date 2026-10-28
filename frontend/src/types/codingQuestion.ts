// ============================================================================
// CODING QUESTION TYPE DEFINITIONS — Code Spark Exam Engine
// All state stored in localStorage (frontend-only architecture)
// ============================================================================

export type CodingDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type CodingQuestionStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface TestCase {
  id: string;
  input: string;          // stdin input
  expectedOutput: string; // expected stdout (trimmed)
  isHidden: boolean;      // hidden = not shown to candidate
  isSample: boolean;      // sample = shown as example in problem statement
  explanation?: string;   // shown post-submission if not hidden
  timeoutMs?: number;     // per-test override (default: from question)
}

export interface CodingConstraint {
  label: string;  // e.g. "1 ≤ N ≤ 10^5"
}

export interface AllowedLanguage {
  language: string;   // e.g. "Python 3.8", "C++17", "Java 17"
  timeMultiplier: number; // e.g. 3 for Python (slower than C++)
}

export interface CodingQuestion {
  id: string;                       // UUID
  title: string;                    // e.g. "Two Sum"
  problemStatement: string;         // Full markdown problem description
  inputFormat: string;              // Description of input format
  outputFormat: string;             // Description of output format
  constraints: CodingConstraint[];  // Constraint list
  sampleTestCases: TestCase[];      // Shown to candidates
  hiddenTestCases: TestCase[];      // Not shown — used for grading
  difficulty: CodingDifficulty;
  marks: number;                    // Max marks for this problem
  timeLimitMs: number;              // Default time limit (e.g. 2000ms)
  memoryLimitMb: number;            // Memory limit (e.g. 256MB)
  allowedLanguages: AllowedLanguage[]; // Empty = all languages allowed
  tags: string[];                   // e.g. ["arrays", "hash-map", "dp"]
  topic: string;                    // e.g. "Data Structures", "Algorithms"
  subject: string;                  // e.g. "Computer Science"
  status: CodingQuestionStatus;
  starterCode?: Record<string, string>; // language → starter template
  solutionCode?: Record<string, string>; // language → reference solution (admin only)
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  examId?: string;                  // If tied to a specific exam
}

export interface CodingExam {
  id: string;
  title: string;                    // e.g. "Code Spark — Round 2: Coding"
  description: string;
  round: 1 | 2;                     // Round 1 = Aptitude, Round 2 = Coding
  durationMinutes: number;
  startTime?: number;               // Epoch ms
  endTime?: number;
  questionIds: string[];            // Ordered list of CodingQuestion IDs
  totalMarks: number;
  status: 'DRAFT' | 'PUBLISHED' | 'LIVE' | 'CLOSED';
  labId?: string;                   // Which lab conducts this exam
  shortlistedRollNumbers?: string[]; // Round 2 only: eligible candidates
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export interface CodingSubmission {
  id: string;
  examId: string;
  questionId: string;
  studentRollNumber: string;
  studentName: string;
  code: string;
  language: string;
  submittedAt: number;
  testResults: TestResult[];
  score: number;           // Marks earned
  totalMarks: number;
  status: 'PENDING' | 'ACCEPTED' | 'WRONG_ANSWER' | 'TLE' | 'MLE' | 'RUNTIME_ERROR' | 'COMPILE_ERROR';
}

export interface TestResult {
  testCaseId: string;
  passed: boolean;
  actualOutput?: string;
  timeTakenMs?: number;
  memoryUsedMb?: number;
  error?: string;
}
