export type ThemeMode = 'light' | 'dark';

export type ExamCategory =
  | 'Aptitude'
  | 'ISE'
  | 'Internal Assessment (CIE)'
  | 'External University Practical (SEE)'
  | 'Semester End Exam (SEE)'
  | 'Weekly Lab Practical'
  | 'College Coding Competition'
  | 'Coding Hackathon / Contest'
  | 'Project Viva & Defense'
  | 'Lab Practical Evaluation'
  | 'Multiple Choice Question (MCQ) Examination';

export type IntegrityStatus =
  | 'Verified Original Work'
  | 'Suspicious Activity / Moderate AI'
  | 'High Cheating Risk / Plagiarized';

export type CheatingRiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export type AiToolDetected =
  | 'ChatGPT'
  | 'GitHub Copilot'
  | 'Google Gemini'
  | 'Human Written'
  | 'Mixed / Unconfirmed';

export interface StudentInfo {
  name: string;
  rollNumber: string; // USN / Roll No / Hall Ticket
  course: string; // Subject / Lab Name
  department: string; // Branch / Dept (e.g. CSE, IT, ECE)
  semester: string; // Semester (e.g. Sem 3, Sem 5)
  division?: string; // Section / Division (e.g. Div A, Div B)
  examType: ExamCategory;
  assignmentTitle: string; // Problem Statement / Question
  labId?: string; // e.g. "LAB-01"
  labName?: string; // e.g. "Lab 01: Turing Computing Lab"
  stationNumber?: string; // e.g. "Station #14"
  invigilatorName?: string;
  examDurationMinutes?: number; // e.g. 90, 60, 45, 120, 180 (0 for unlimited)
  sessionStartTime?: number; // Epoch milliseconds when session began
  examMode?: 'CODING' | 'MCQ';
  mcqExamId?: string;
}

export interface CollegeLabInfo {
  labId: string;
  labCode: string;
  labName: string;
  department: string;
  block: string;
  totalStations: number;
  invigilatorName: string;
}

export interface CodeMetrics {
  typingSpeed: number; // Words Per Minute (WPM)
  timeSpent: number; // In seconds
  pasteCount: number; // How many times paste was used
  deleteCount: number;
  editCount: number;
  undoCount: number;
  pasteRatio: number; // 0-100%
  pastedLines: number;
  pastedChars?: number;
  totalLines: number;
  keystrokes: number;
  pauseDuration: number; // Idle seconds
  pasteLockViolations?: number; // Attempts to paste when blocked
  tabSwitchViolations?: number; // Number of times candidate left/switched window or tab
  unfocusedTimeSeconds?: number; // Total seconds spent outside the examination window
}

export interface KeystrokeSnapshot {
  id: number;
  timestamp: number;
  code: string;
  label: string;
}

export interface CodeSubmission {
  code: string;
  language: string;
  student: StudentInfo;
  metrics: CodeMetrics;
  snapshots: KeystrokeSnapshot[];
}

export interface ExecutionHistoryItem {
  type: 'output' | 'input' | 'error' | 'system' | 'success';
  text: string;
  timestamp?: string;
}

export interface CompilerExecutionResult {
  stdout: string;
  stderr: string | null;
  compileOutput: string | null;
  exitCode: number;
  time: string; // e.g. "0.02s"
  memory: number; // e.g. 3400 KB
  statusDescription: string;
  isError: boolean;
  engineUsed: string;
}

export interface CodeObservation {
  title: string;
  note: string;
  flag: 'normal' | 'warning' | 'alert';
}

export interface MarksBreakdown {
  executionMarks: number; // out of 20
  logicMarks: number; // out of 10
  vivaMarks: number; // out of 10
  integrityMarks: number; // out of 10
  totalMarks: number; // out of 50
  maxMarks: number; // 50
}

export interface InvigilatorForensics {
  pasteVerdict: string;
  typingSpeedVerdict: string;
  aiSignatureVerdict: string;
  vivaDefenseVerdict: string;
  keystrokeIntegrity: 'High' | 'Questionable' | 'Compromised';
  cheatingEvidenceList: string[];
}

export interface AnalysisReport {
  language: string;
  integrityScore: number; // 0-100% (High = Honest, Low = Cheated)
  similarityScore: number; // 0-100% (Match with online code)
  aiPercentage: number; // 0-100% (Probability of AI generation)
  understandingScore: number; // 0-100% (Based on typing & viva)
  algorithmName: string;
  conceptName: string;
  codingStyle: string;
  status: IntegrityStatus;
  cheatingRisk: CheatingRiskLevel;
  detectedSource: AiToolDetected;
  summary: string;
  timeComplexity: string;
  spaceComplexity: string;
  observations: CodeObservation[];
  marks: MarksBreakdown;
  forensics: InvigilatorForensics;
  executionMetrics?: {
    exitCode: number;
    time: string;
    memory: string;
    passed: boolean;
  };
  timestamp: string;
}

export interface VivaQuestion {
  id: number;
  question: string;
  topic: string;
  hint?: string;
}

export interface VivaAnswer {
  questionId: number;
  question: string;
  studentAnswer: string;
}

export interface VivaEvaluation {
  score: number; // 0-100
  verdict: 'Good Understanding' | 'Average Understanding' | 'Needs Review';
  teacherFeedback: string;
  breakdown: {
    logicGrasp: number;
    efficiencyAwareness: number;
    edgeCaseHandling: number;
  };
  goodPoints: string[];
  missingPoints: string[];
}

export interface CandidateStation {
  id: string;
  labId: string; // e.g. "LAB-01"
  labName: string; // e.g. "Lab 01: Turing Computing Lab"
  stationNumber: string; // e.g. "Station #14"
  ipAddress: string; // e.g. "10.50.1.14"
  student: StudentInfo;
  language: string;
  code: string;
  metrics: CodeMetrics;
  status: 'In Progress' | 'Compiled & Testing' | 'Submitted & Done';
  integrityStatus: IntegrityStatus;
  cheatingRisk: CheatingRiskLevel;
  marks?: MarksBreakdown;
  lastActive: string;
  compilerResult?: CompilerExecutionResult;
  analysisReport?: AnalysisReport;
  screenImageData?: string; // Live captured screen video frame
  hasLiveScreenStream?: boolean;
  activeLineNumber?: number;
  lastTerminalOutput?: string;
  isLockedByProctor?: boolean;
  proctorWarningMessage?: string;
  tabSwitchViolations?: number;
  unfocusedTimeSeconds?: number;
  audioViolations?: number;
  aiAssistanceAlerts?: number;
  infractionHistory?: Array<{ timestamp: string; event: string; duration?: number }>;
  lastUpdatedTimestamp?: number;
  examMode?: 'CODING' | 'MCQ';
  mcqProgress?: MCQStationProgress;
}

export interface MCQStationProgress {
  examId: string;
  examTitle: string;
  answeredCount: number;
  totalQuestions: number;
  currentQuestionIndex: number;
  currentScore?: number;
  maxScore: number;
  tabSwitches: number;
}

