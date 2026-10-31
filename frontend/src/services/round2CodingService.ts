import { supabase } from './supabaseService';



import { runRealCode } from './compilerService';



import { CompilerExecutionResult } from '../types/dna';



export interface Round2TestCase {



  id: string;



  input: string;



  expectedOutput: string;



  isHidden?: boolean;



  explanation?: string;



}



export interface Round2Problem {



  id: string;



  number: number; // 1 to 5



  title: string;



  difficulty: 'Easy' | 'Medium' | 'Hard';



  marks: number;



  timeLimitMs: number;



  description: string;



  inputFormat: string;



  outputFormat: string;



  constraints: string[];



  sampleTestCases: Round2TestCase[];



  hiddenTestCases: Round2TestCase[];



  starterCode: {
    C: string;
    'C++': string;
    Python: string;
    Java?: string;
  };



}



export interface Round2QuestionReport {

  questionNumber: number;

  questionId: string;

  questionTitle: string;

  code: string;

  language: 'C' | 'C++' | 'Python' | 'Java';

  compilerResult: CompilerExecutionResult | null;

  sampleResults: {

    testCaseId: string;

    input: string;

    expected: string;

    actual: string;

    passed: boolean;

    error?: string;

  }[];

  hiddenResults: {

    testCaseId: string;

    passed: boolean;

  }[];

  passedTests: number;

  totalTests: number;

  score: number;

  maxScore: number;

  status: 'PENDING' | 'ACCEPTED' | 'PARTIAL' | 'COMPILE_ERROR' | 'RUNTIME_ERROR';

  compiledAt: number;

  compiledAtFormatted?: string;

  startedAt?: number;

  startedAtFormatted?: string;

  nextQuestionStartedAt?: number;

  nextQuestionStartedAtFormatted?: string;

  timeTakenSeconds?: number;

  // Complexity & runtime metrics

  executionTime?: string;

  executionTimeMs?: number;

  timeComplexity?: string;

  spaceComplexity?: string;

  complexityExplanation?: string;

  efficiencyRating?: 'Optimal' | 'Acceptable' | 'Suboptimal';

  // AI Verification

  aiVerification?: {

    verifiedQuestionTitle: string;

    predictedOutput: string;

    isAlignedWithProblem: boolean;

    analysis: string;

  };

}



export interface Round2CandidateSubmission {

  candidateKey: string;

  round2Key?: string;

  candidateName: string;

  rollNumber: string;

  email: string;

  department?: string;

  stationNumber?: string;

  questionReports: Record<number, Round2QuestionReport>; // 1 to 5

  currentQuestion: number; // 1 to 5

  totalScore: number;

  maxScore: number;

  isSubmitted: boolean;

  startedAt: number;

  submittedAt?: number;

  dominantLanguage: string;

  assignedProblemIds?: string[];

  questionTimestamps?: Record<number, {

    startedAt: number;

    startedAtFormatted?: string;

    compiledAt?: number;

    compiledAtFormatted?: string;

    nextQuestionStartedAt?: number;

    nextQuestionStartedAtFormatted?: string;

  }>;

}



export const ROUND2_QUESTIONS_CONFIG_ID = 'codespark_round2_questions';



export const ROUND2_SUBMISSIONS_STORAGE_KEY = 'codedna_codespark_r2_submissions';



export const DEFAULT_ROUND2_PROBLEMS: Round2Problem[] = [];

const LEGACY_PROBLEM_TITLES = new Set([
  'Target Sum Pair Search',
  'Search in Rotated Sorted Array',
  'Merge Overlapping Intervals',
  'Valid Parentheses Expression',
  'Longest Substring Without Repeating Characters',
  'Binary Tree Maximum Path Sum',
  'Trapping Rain Water',
  'Coin Change Minimum Coins',
  'Kth Largest Element in an Array',
  'Word Search on Grid'
]);

export function isLegacyQuestionPool(problems: Round2Problem[]): boolean {
  if (!Array.isArray(problems) || problems.length === 0) return false;
  return problems.some(p => LEGACY_PROBLEM_TITLES.has(p.title) || (p.id && (p.id.startsWith('r2_q1_two_sum') || p.id.startsWith('r2_q8_rotated'))));
}

export function detectLanguageFromCode(code: string): 'C' | 'C++' | 'Python' | 'Java' {



  if (!code || !code.trim()) return 'Python';



  const c = code.trim();



  // Java patterns
  const isJava =
    /import\s+java\.|public\s+class|System\.(out|err)\.print|public\s+static\s+void\s+main|Scanner\s+[a-zA-Z0-9_]+\s*=/i.test(
      c
    );
  if (isJava) return 'Java';

  // C++ patterns



  const isCpp =



    /#include\s*<iostream>|std::|namespace\s+std|cout\s*<<|cin\s*>>|vector<|unordered_map<|template\s*<|nullptr/.test(



      c



    );



  if (isCpp) return 'C++';



  // C patterns



  const isC =



    /#include\s*<stdio\.h>|#include\s*<stdlib\.h>|printf\s*\(|scanf\s*\(|malloc\s*\(|free\s*\(/.test(



      c



    );



  if (isC) return 'C';



  // Python patterns



  const isPython =



    /^\s*(def |import |from |print\(|class [A-Za-z0-9_]+:|if __name__ ==|input\(|elif |for \w+ in )/m.test(



      c



    ) || c.includes('def ') || (c.includes(':') && !c.includes(';') && !c.includes('{'));



  if (isPython) return 'Python';



  // Fallbacks based on braces / semicolons



  if (c.includes(';') && (c.includes('{') || c.includes('}'))) {



    return c.includes('std') || c.includes('iostream') ? 'C++' : 'C';



  }



  return 'Python';



}



export function getAllRound2Problems(): Round2Problem[] {
  try {
    const raw = localStorage.getItem('codedna_codespark_r2_problems');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (isLegacyQuestionPool(parsed)) {
          localStorage.removeItem('codedna_codespark_r2_problems');
          return [];
        }
        return parsed;
      }
    }
  } catch {}
  return [];
}

export function saveRound2Problems(problems: Round2Problem[]): void {



  try {



    localStorage.setItem('codedna_codespark_r2_problems', JSON.stringify(problems));



    void saveRound2ProblemsToCloud(problems);



  } catch {}



}



async function round2ApiHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }
    : { "Content-Type": "application/json" };
}

export async function saveRound2ProblemsToCloud(problems: Round2Problem[]): Promise<boolean> {
  try {
    const headers = await round2ApiHeaders();
    if (!headers.Authorization) throw new Error("Sign in as a CodeSpark administrator to publish questions.");
    const response = await fetch("/api/codespark/round2-problems", {
      method: "POST", headers, body: JSON.stringify({ problems })
    });
    return response.ok;
  } catch (err) {
    console.warn("[Round 2] Secure problem publication failed:", err);
    return false;
  }
}

export async function fetchRound2ProblemsFromCloud(): Promise<Round2Problem[]> {
  try {
    const headers = await round2ApiHeaders();
    const response = await fetch("/api/codespark/round2-problems", { headers });
    if (response.ok) {
      const result = await response.json();
      if (Array.isArray(result.problems)) {
        localStorage.setItem("codedna_codespark_r2_problems", JSON.stringify(result.problems));
        return result.problems;
      }
    }
  } catch (err) {
    console.warn("[Round 2] Secure problem retrieval failed:", err);
  }

  const local = getAllRound2Problems();
  const { data } = await supabase.auth.getSession();
  const isAdmin = data.session?.user?.app_metadata?.role === "admin";
  return isAdmin ? local : local.map((problem) => ({ ...problem, hiddenTestCases: [] }));
}

/**



 * Executes a candidate's code on Judge0/Wandbox compiler against problem test cases.



 * Generates an instant short report and score.



 */



export interface ComplexityAnalysisResult {



  timeComplexity: string;



  spaceComplexity: string;



  explanation: string;



  rating: 'Optimal' | 'Acceptable' | 'Suboptimal';



}



export function analyzeCodeComplexity(



  code: string,



  language: 'C' | 'C++' | 'Python' | 'Java',



  problemExpectedComplexity?: string



): ComplexityAnalysisResult {



  if (!code || !code.trim()) {



    return {



      timeComplexity: 'N/A',



      spaceComplexity: 'N/A',



      explanation: 'No code submitted to evaluate.',



      rating: 'Suboptimal'



    };



  }



  const clean = code



    .replace(/\/\*[\s\S]*?\*\//g, '')



    .replace(/\/\/.*$/gm, '')



    .replace(/#.*$/gm, (m) => (m.startsWith('#include') ? m : ''));



  const lines = clean.split('\n');



  let maxLoopDepth = 0;



  let currentLoopDepth = 0;



  let hasSorting = false;



  let hasBinarySearch = false;



  let hasRecursion = false;



  let hasDynamicProgramming = false;



  let hasAdditionalDataStructure = false;



  if (



    clean.includes('.sort(') ||



    clean.includes('sorted(') ||



    clean.includes('std::sort') ||



    clean.includes('qsort(') ||



    clean.includes('sort(')



  ) {



    hasSorting = true;



  }



  if (



    clean.includes('>>= 1') ||



    clean.includes('/= 2') ||



    clean.includes('// 2') ||



    clean.includes('binary_search') ||



    clean.includes('lower_bound') ||



    clean.includes('upper_bound') ||



    (clean.includes('mid') && (clean.includes('left') || clean.includes('low') || clean.includes('start')))



  ) {



    hasBinarySearch = true;



  }



  if (



    clean.includes('dp[') ||



    clean.includes('memo[') ||



    clean.includes('cache[') ||



    clean.includes('vector<vector<') ||



    clean.includes('tabulation')



  ) {



    hasDynamicProgramming = true;



  }



  if (



    clean.includes('unordered_map') ||



    clean.includes('map<') ||



    clean.includes('vector<') ||



    clean.includes('set<') ||



    clean.includes('dict()') ||



    clean.includes('{}') ||



    clean.includes('set()') ||



    clean.includes('[]') ||



    clean.includes('malloc(')



  ) {



    hasAdditionalDataStructure = true;



  }



  let braceDepth = 0;



  const loopBraceDepths: number[] = [];



  for (let i = 0; i < lines.length; i++) {



    const l = lines[i].trim();



    if (!l) continue;



    if (language === 'Python') {



      if (



        l.startsWith('for ') ||



        l.startsWith('while ') ||



        l.includes(' for ')



      ) {



        currentLoopDepth++;



        if (currentLoopDepth > maxLoopDepth) maxLoopDepth = currentLoopDepth;



      }



    } else {



      const isLoopLine = /\bfor\s*\(/.test(l) || /\bwhile\s*\(/.test(l);



      if (isLoopLine) {



        currentLoopDepth++;



        if (currentLoopDepth > maxLoopDepth) maxLoopDepth = currentLoopDepth;



        loopBraceDepths.push(braceDepth);



      }



      for (const char of l) {



        if (char === '{') {



          braceDepth++;



        } else if (char === '}') {



          braceDepth--;



          if (loopBraceDepths.length > 0 && braceDepth <= loopBraceDepths[loopBraceDepths.length - 1]) {



            loopBraceDepths.pop();



            currentLoopDepth = Math.max(0, currentLoopDepth - 1);



          }



        }



      }



    }



  }



  const fnMatches = clean.match(



    language === 'Python'



      ? /def\s+([A-Za-z0-9_]+)\s*\(/g



      : /\b(?:int|void|bool|long|double|string)\s+([A-Za-z0-9_]+)\s*\(/g



  );



  if (fnMatches) {



    for (const fn of fnMatches) {



      const name = fn.replace(/^(def|int|void|bool|long|double|string)\s+/, '').replace('(', '').trim();



      if (name && name !== 'main' && name !== 'solve') {



        const count = (clean.match(new RegExp(`\\b${name}\\s*\\(`, 'g')) || []).length;



        if (count >= 2) {



          hasRecursion = true;



        }



      }



    }



  }



  let timeComplexity = 'O(N)';



  let spaceComplexity = hasAdditionalDataStructure ? 'O(N)' : 'O(1)';



  let explanation = 'Linear single-pass traversal over the input elements.';



  let rating: 'Optimal' | 'Acceptable' | 'Suboptimal' = 'Optimal';



  if (hasRecursion && maxLoopDepth === 0 && !hasDynamicProgramming) {



    timeComplexity = 'O(2^N)';



    spaceComplexity = 'O(N)';



    explanation = 'Branching recursive calls without memoization (exponential recursion tree).';



    rating = 'Suboptimal';



  } else if (maxLoopDepth >= 3) {



    timeComplexity = 'O(N^3)';



    explanation = 'Triple-nested loop iteration (cubic polynomial time).';



    rating = 'Suboptimal';



  } else if (maxLoopDepth === 2) {



    if (hasSorting) {



      timeComplexity = 'O(N^2 log N)';



      explanation = 'Nested quadratic loops containing inner sorting operations.';



      rating = 'Suboptimal';



    } else {



      timeComplexity = 'O(N^2)';



      explanation = 'Double nested loop performing pairwise or quadratic element checks.';



      rating = problemExpectedComplexity?.includes('O(N^2)') ? 'Optimal' : 'Suboptimal';



    }



  } else if (maxLoopDepth === 1) {



    if (hasSorting) {



      timeComplexity = 'O(N log N)';



      explanation = 'Iterative linear scan combined with algorithmic element sorting.';



      rating = 'Acceptable';



    } else if (hasBinarySearch) {



      timeComplexity = 'O(N log N)';



      explanation = 'Linear loop with logarithmic binary search steps per iteration.';



      rating = 'Acceptable';



    } else {



      timeComplexity = 'O(N)';



      explanation = 'Single linear pass through the array/sequence in O(N) time.';



      rating = 'Optimal';



    }



  } else if (maxLoopDepth === 0) {



    if (hasSorting) {



      timeComplexity = 'O(N log N)';



      explanation = 'Single array/vector sorting step (Quicksort/Timsort).';



      rating = 'Acceptable';



    } else if (hasBinarySearch) {



      timeComplexity = 'O(log N)';



      explanation = 'Logarithmic binary search halving search interval at each step.';



      rating = 'Optimal';



    } else {



      timeComplexity = 'O(1)';



      explanation = 'Constant time operations with direct arithmetic or indexing.';



      rating = 'Optimal';



    }



  }



  if (hasDynamicProgramming) {



    spaceComplexity = 'O(N)';



    if (maxLoopDepth <= 1) {



      timeComplexity = 'O(N)';



      explanation = '1D Dynamic programming with memoization array or rolling state.';



      rating = 'Optimal';



    } else if (maxLoopDepth === 2) {



      timeComplexity = 'O(N^2)';



      explanation = '2D Dynamic programming table construction in quadratic time.';



      rating = 'Acceptable';



    }



  }



  return { timeComplexity, spaceComplexity, explanation, rating };



}



function computeDynamicScore(
  maxMarks: number, passRatio: number, allTestsPassed: boolean,
  timeComplexity: string, spaceComplexity: string, timeTakenMs: number
): number {
  if (passRatio <= 0) return 0;
  let score = maxMarks * 0.8 * Math.min(1, passRatio);
  if (!allTestsPassed) return Math.max(0, Math.round(score));

  const tc = (timeComplexity || '').toLowerCase();
  const sc = (spaceComplexity || '').toLowerCase();
  let complexityBonus = 0;
  if (tc.includes('o(1)') || tc.includes('o(log')) complexityBonus += 0.08;
  else if (tc.includes('o(n log') || tc.includes('o(nlog')) complexityBonus += 0.06;
  else if (tc.includes('o(n)')) complexityBonus += 0.04;
  else complexityBonus += 0.01;
  if (sc.includes('o(1)')) complexityBonus += 0.07;
  else if (sc.includes('o(n)') || sc.includes('o(log')) complexityBonus += 0.04;
  else complexityBonus += 0.01;
  score += maxMarks * Math.min(complexityBonus, 0.15);
  const maxTimeMs = 20 * 60 * 1000;
  score += maxMarks * 0.05 * Math.max(0, 1 - (Math.max(0, timeTakenMs || 0) / maxTimeMs));
  return Math.min(maxMarks, Math.max(0, Math.round(score)));
}

const normalizeProgramOutput = (value: unknown): string =>
  String(value ?? '').replace(/\r\n/g, '\n').trim();

function toCompilerExecutionResult(value: any): CompilerExecutionResult {
  return {
    stdout: String(value?.stdout || ""),
    stderr: value?.stderr ? String(value.stderr) : null,
    compileOutput: value?.compileOutput ? String(value.compileOutput) : null,
    exitCode: Number.isFinite(Number(value?.exitCode)) ? Number(value.exitCode) : (value?.isError ? 1 : 0),
    time: String(value?.time || "0.00s"),
    memory: Number(value?.memory) || 0,
    statusDescription: String(value?.statusDescription || (value?.isError ? "Execution Error" : "Accepted")),
    isError: Boolean(value?.isError),
    engineUsed: String(value?.engineUsed || "Wandbox")
  };
}


export async function createRound2TerminalSession(
  candidateKey: string,
  problemId: string,
  code: string,
  language: 'C' | 'C++' | 'Python' | 'Java'
): Promise<{ token: string; socketUrl: string }> {
  const response = await fetch('/api/codespark/terminal-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: candidateKey, problemId, code, language })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success || !payload?.token || !payload?.runnerUrl) {
    throw new Error(payload?.error || 'Could not start the interactive terminal.');
  }
  const configuredSocket = (import.meta as any).env?.VITE_CODE_RUNNER_WS_URL as string | undefined;
  const socketUrl = configuredSocket || payload.runnerUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:') + '/ws/terminal';
  return { token: payload.token, socketUrl };
}

export async function runRound2Code(
  candidateKey: string,
  problemId: string,
  code: string,
  language: 'C' | 'C++' | 'Python' | 'Java',
  stdin: string
): Promise<CompilerExecutionResult> {
  const response = await fetch('/api/codespark/grade-round2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'run', key: candidateKey, problemId, code, language, stdin })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success || !payload?.result) {
    throw new Error(payload?.error || ("Compiler request failed (" + response.status + ")."));
  }
  return toCompilerExecutionResult(payload.result);
}

export async function evaluateRound2Code(
  problem: Round2Problem,
  code: string,
  explicitLanguage?: 'C' | 'C++' | 'Python' | 'Java',
  timeTakenMs?: number,
  customStdin?: string,
  candidateKey?: string
): Promise<Round2QuestionReport> {
  const language = explicitLanguage || detectLanguageFromCode(code);
  const complexity = analyzeCodeComplexity(code, language, '');
  const maxMarks = Number(problem.marks) || 20;
  const compiledAt = Date.now();

  // Candidate execution and grading are server-authoritative. Never award marks
  // from a browser fallback or a locally fabricated "offline compile" result.
  if (candidateKey) {
    const response = await fetch('/api/codespark/grade-round2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'evaluate',
        key: candidateKey,
        problemId: problem.id,
        code,
        language,
        stdin: customStdin ?? ''
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || ("Evaluation failed (" + response.status + ")."));
    }

    const runResult = payload.runResult ? toCompilerExecutionResult(payload.runResult) : null;
    const parsedSeconds = runResult ? parseFloat(runResult.time.replace(/[^\d.]/g, '')) : NaN;
    const runtimeMs = Number.isFinite(parsedSeconds) && parsedSeconds > 0 ? parsedSeconds * 1000 : undefined;

    return {
      questionNumber: problem.number,
      questionId: problem.id,
      questionTitle: problem.title,
      code,
      language,
      compilerResult: runResult,
      sampleResults: Array.isArray(payload.sampleResults) ? payload.sampleResults : [],
      hiddenResults: Array.isArray(payload.hiddenResults) ? payload.hiddenResults : [],
      passedTests: Number(payload.passedTests) || 0,
      totalTests: Number(payload.totalTests) || 0,
      score: Number.isFinite(Number(payload.score)) ? Number(payload.score) : 0,
      maxScore: Number(payload.maxScore) || maxMarks,
      status: payload.status || 'PENDING',
      compiledAt,
      executionTime: runtimeMs !== undefined ? runtimeMs.toFixed(1) + ' ms' : undefined,
      executionTimeMs: runtimeMs,
      timeComplexity: complexity.timeComplexity,
      spaceComplexity: complexity.spaceComplexity,
      complexityExplanation: complexity.explanation,
      efficiencyRating: complexity.rating
    };
  }

  // Local preview path is retained for non-exam development only.
  const tests = [
    ...(Array.isArray(problem.sampleTestCases) ? problem.sampleTestCases : []),
    ...(Array.isArray(problem.hiddenTestCases) ? problem.hiddenTestCases.map((test) => ({ ...test, isHidden: true })) : [])
  ];
  let compilerResult: CompilerExecutionResult | null = null;
  let passedTests = 0;
  let compileFailure = false;
  let runtimeFailure = false;

  if (customStdin !== undefined) compilerResult = await runRealCode(code, language, customStdin);
  const executedCases = await Promise.all(tests.map(async (test) => ({
    test,
    result: await runRealCode(code, language, test.input || '').catch(() => null)
  })));

  if (!compilerResult && executedCases.length) compilerResult = executedCases[0].result;
  if (!tests.length && !compilerResult) compilerResult = await runRealCode(code, language, '');

  const sampleResults: Round2QuestionReport['sampleResults'] = [];
  const hiddenResults: Round2QuestionReport['hiddenResults'] = [];
  for (const { test, result } of executedCases) {
    const failed = !result || result.isError;
    if (result?.compileOutput) compileFailure = true;
    else if (failed) runtimeFailure = true;
    const passed = Boolean(result && !result.isError &&
      normalizeProgramOutput(result.stdout) === normalizeProgramOutput(test.expectedOutput));
    if (passed) passedTests++;
    if (test.isHidden) hiddenResults.push({ testCaseId: test.id, passed });
    else sampleResults.push({
      testCaseId: test.id,
      input: test.input || '',
      expected: test.expectedOutput || '',
      actual: result?.stdout || '',
      passed,
      error: result?.compileOutput || result?.stderr || undefined
    });
  }

  if (!tests.length) {
    const passed = Boolean(compilerResult && !compilerResult.isError);
    if (compilerResult?.compileOutput) compileFailure = true;
    else if (!passed) runtimeFailure = true;
    if (passed) passedTests = 1;
    sampleResults.push({
      testCaseId: 'exec_default',
      input: customStdin || '(Standard input)',
      expected: '(Compiled and executed cleanly)',
      actual: compilerResult?.stdout || '',
      passed,
      error: compilerResult?.compileOutput || compilerResult?.stderr || undefined
    });
  }

  const totalTests = tests.length || 1;
  const allTestsPassed = passedTests === totalTests;
  const score = computeDynamicScore(
    maxMarks, passedTests / totalTests, allTestsPassed,
    complexity.timeComplexity, complexity.spaceComplexity, timeTakenMs || 0
  );
  const status: Round2QuestionReport['status'] = compileFailure
    ? 'COMPILE_ERROR'
    : runtimeFailure && passedTests === 0
      ? 'RUNTIME_ERROR'
      : allTestsPassed ? 'ACCEPTED' : 'PARTIAL';
  const parsedSeconds = compilerResult ? parseFloat(compilerResult.time.replace(/[^\d.]/g, '')) : NaN;
  const runtimeMs = Number.isFinite(parsedSeconds) && parsedSeconds > 0 ? parsedSeconds * 1000 : undefined;

  return {
    questionNumber: problem.number,
    questionId: problem.id,
    questionTitle: problem.title,
    code,
    language,
    compilerResult,
    sampleResults,
    hiddenResults,
    passedTests,
    totalTests,
    score,
    maxScore: maxMarks,
    status,
    compiledAt,
    executionTime: runtimeMs !== undefined ? runtimeMs.toFixed(1) + ' ms' : undefined,
    executionTimeMs: runtimeMs,
    timeComplexity: complexity.timeComplexity,
    spaceComplexity: complexity.spaceComplexity,
    complexityExplanation: complexity.explanation,
    efficiencyRating: complexity.rating
  };
}

export function getStoredRound2Submission(candidateKey: string): Round2CandidateSubmission | null {



  try {



    const raw = localStorage.getItem(`codedna_r2_sub_${candidateKey.toUpperCase()}`);



    if (raw) return JSON.parse(raw);



  } catch {}



  return null;



}



export function saveStoredRound2Submission(sub: Round2CandidateSubmission): void {



  try {



    localStorage.setItem(`codedna_r2_sub_${sub.candidateKey.toUpperCase()}`, JSON.stringify(sub));



    // Also store in general list



    const all = getAllRound2Submissions();



    const idx = all.findIndex((s) => s.candidateKey.toUpperCase() === sub.candidateKey.toUpperCase());



    if (idx >= 0) all[idx] = sub;



    else all.push(sub);



    localStorage.setItem(ROUND2_SUBMISSIONS_STORAGE_KEY, JSON.stringify(all));



    // Async push to Supabase cloud



    void pushRound2SubmissionToCloud(sub);



  } catch {}



}



/**



 * Individualized problem allocator for CodeSpark Round 2:



 * Given a pool of 10+ questions, assigns exactly 5 deterministic random questions



 * uniquely seeded by the student's candidate access key.



 * Guarantees that different students get different sets of questions,



 * while refreshing the page gives the SAME student their assigned 5 questions.



 */



export function selectStudentRound2Problems(
  allPool: Round2Problem[],
  candidateKey: string
): Round2Problem[] {
  if (!allPool || allPool.length === 0) return [];
  if (allPool.length <= 5) {
    return (allPool || []).map((p, idx) => ({ ...p, number: idx + 1 }));
  }
  // Always mirror the server's deterministic key-based assignment. Cached IDs can belong to an older pool.
  // Deterministic seeded pseudo-random shuffle based on candidateKey
  const stored = getStoredRound2Submission(candidateKey);
  const keyStr = (candidateKey || 'CANDIDATE').toUpperCase();
  let seed = 0;
  for (let i = 0; i < keyStr.length; i++) {
    seed = (seed * 31 + keyStr.charCodeAt(i)) >>> 0;
  }
  const poolCopy = [...allPool];
  let curSeed = seed || 12345;
  for (let i = poolCopy.length - 1; i > 0; i--) {
    curSeed = (curSeed * 9301 + 49297) % 233280;
    const j = Math.floor((curSeed / 233280) * (i + 1));
    [poolCopy[i], poolCopy[j]] = [poolCopy[j], poolCopy[i]];
  }
  const countToTake = Math.min(poolCopy.length, 5);
  const selected = poolCopy.slice(0, countToTake).map((p, idx) => ({
    ...p,
    number: idx + 1
  }));
  if (stored) {
    stored.assignedProblemIds = selected.map((p) => p.id);
    saveStoredRound2Submission(stored);
  }
  return selected;
}

export async function verifyRound2CodeWithAI(
  problem: Round2Problem,
  _code: string,
  _language: 'C' | 'C++' | 'Python' | 'Java',
  _sampleInput?: string,
  _expectedOutput?: string,
  actualOutput?: string
): Promise<{
  verifiedQuestionTitle: string;
  predictedOutput: string;
  isAlignedWithProblem: boolean;
  analysis: string;
}> {
  return {
    verifiedQuestionTitle: problem.title,
    predictedOutput: actualOutput || '',
    isAlignedWithProblem: false,
    analysis: 'AI is not used as a correctness authority. Official evaluation compares program output against configured test cases.'
  };
}

export async function pushRound2LiveCodeToCloud(
  profile: { name: string; rollNumber: string; accessKey: string; stationNumber?: string; round2Key?: string },
  code: string,
  language: string,
  questionNumber: number
): Promise<void> {
  try {
    const key = profile.round2Key || profile.accessKey;
    if (!key) return;
    await fetch('/api/codespark/round2-submissions?action=live-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'live-code',
        key,
        code,
        language,
        questionNumber: questionNumber + 1,
        stationNumber: profile.stationNumber || 'Station #01'
      })
    });
  } catch (error) {
    console.warn('[Round 2] secure live-code sync unavailable:', error);
  }
}

export async function saveRound2ProgressToCloud(sub: Round2CandidateSubmission): Promise<void> {
  try {
    const key = sub.candidateKey;
    if (!key) return;
    await fetch('/api/codespark/round2-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submission: sub })
    });
  } catch (error) {
    console.warn('[Round 2] secure progress sync unavailable:', error);
  }
}


export function extractCleanCandidateCode(rawCode?: string | null): string {



  if (!rawCode) return '// Awaiting keyboard input from candidate...';



  const trimmed = rawCode.trim();



  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {



    try {



      const parsed = JSON.parse(trimmed);



      if (parsed.questionReports) {



        const curQ = parsed.currentQuestion || 1;



        const qCode = parsed.questionReports[curQ]?.code;



        if (qCode && qCode.trim()) return qCode;



        for (let q = 1; q <= 5; q++) {



          if (parsed.questionReports[q]?.code?.trim()) {



            return parsed.questionReports[q].code;



          }



        }



      }



      if (parsed.code && typeof parsed.code === 'string') return parsed.code;



    } catch {}



  }



  return rawCode;



}



export async function pushRound2SubmissionToCloud(sub: Round2CandidateSubmission): Promise<boolean> {
  try {
    const response = await fetch('/api/codespark/round2-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submission: sub })
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      console.warn('[Round 2] Server submission sync rejected:', result.error || response.status);
      return false;
    }
    if (sub.isSubmitted && result.submission) {
      localStorage.setItem(`codedna_r2_sub_${sub.candidateKey.toUpperCase()}`, JSON.stringify(result.submission));
    }
    return true;
  } catch (error) {
    console.warn('[Round 2] secure submission sync unavailable:', error);
    return false;
  }
}


export async function finalizeRound2Submission(sub: Round2CandidateSubmission): Promise<Round2CandidateSubmission> {
  const response = await fetch('/api/codespark/round2-submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submission: { ...sub, isSubmitted: true } })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success || !result.submission) {
    // Preserve the failure as retryable. A local-only "success" would falsely
    // tell a candidate their work was safely submitted when the server did not seal it.
    throw new Error(result.error || 'Final submission could not be confirmed. Your work is still saved locally; retry when the judge is available.');
  }
  return result.submission as Round2CandidateSubmission;
}


export async function fetchRound2SubmissionFromCloud(candidateKey: string): Promise<Round2CandidateSubmission | null> {
  try {
    const response = await fetch('/api/codespark/round2-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get', key: candidateKey })
    });
    const result = await response.json();
    if (!response.ok || !result.success || !result.submission) return null;
    const submission = result.submission as Round2CandidateSubmission;
    localStorage.setItem(`codedna_r2_sub_${candidateKey.toUpperCase()}`, JSON.stringify(submission));
    return submission;
  } catch (error) {
    console.warn('[Round 2] finalized submission recovery unavailable:', error);
    return null;
  }
}


export function getAllRound2Submissions(): Round2CandidateSubmission[] {



  try {



    const raw = localStorage.getItem(ROUND2_SUBMISSIONS_STORAGE_KEY);



    if (raw) {



      const parsed = JSON.parse(raw);



      if (Array.isArray(parsed)) return parsed;



    }



  } catch {}



  return [];



}



export interface Round2LeaderboardEntry {



  rank: number;



  candidateKey: string;



  round2Key?: string;



  candidateName: string;



  rollNumber: string;



  email: string;



  totalScore: number;



  maxScore: number;



  solvedCount: number; // out of 5



  questionStatus: Record<number, 'ACCEPTED' | 'PARTIAL' | 'FAILED' | 'PENDING'>;



  dominantLanguage: string;



  timeTakenMinutes: number;



  isSubmitted: boolean;



  submission: Round2CandidateSubmission;



  averageRuntimeMs?: number;



  timeComplexities?: Record<number, string>;



}



async function round2AdminHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-authority-role": "admin"
  };
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      headers["Authorization"] = `Bearer ${data.session.access_token}`;
    }
  } catch {}
  return headers;
}

export async function clearRound2Leaderboard(): Promise<void> {
  try {
    const headers = await round2AdminHeaders();
    const response = await fetch('/api/codespark/round2-submissions', { method: 'DELETE', headers });
    if (!response.ok) throw new Error("Server refused to clear Round 2 submissions.");
    localStorage.removeItem(ROUND2_SUBMISSIONS_STORAGE_KEY);
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('codedna_r2_sub_')) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn('[Round 2] secure leaderboard reset failed:', error);
  }
}

export async function fetchRound2Leaderboard(): Promise<Round2LeaderboardEntry[]> {
  const subMap = new Map<string, Round2CandidateSubmission>();
  try {
    const headers = await round2AdminHeaders();
    const response = await fetch('/api/codespark/round2-submissions', { headers });
    const result = await response.json();
    if (response.ok && Array.isArray(result.submissions)) {
      for (const row of result.submissions) {
        let sub: Round2CandidateSubmission | null = null;
        try { sub = row.code ? JSON.parse(row.code) : null; } catch {}
        const k = (sub?.rollNumber || sub?.candidateKey || row.id || '').toUpperCase();
        if (sub && k) subMap.set(k, sub);
      }
    }
  } catch (error) {
    console.warn('[Round 2] secure leaderboard fetch failed:', error);
  }

  const entries: Round2LeaderboardEntry[] = Array.from(subMap.values()).map((sub) => {
    let solvedCount = 0;
    const questionStatus: Record<number, 'ACCEPTED' | 'PARTIAL' | 'FAILED' | 'PENDING'> = {};
    for (let question = 1; question <= 5; question++) {
      const report = sub.questionReports?.[question];
      if (!report) questionStatus[question] = 'PENDING';
      else if (report.status === 'ACCEPTED') { questionStatus[question] = 'ACCEPTED'; solvedCount++; }
      else if (report.score > 0) questionStatus[question] = 'PARTIAL';
      else questionStatus[question] = 'FAILED';
    }
    const elapsed = (sub.submittedAt || Date.now()) - (sub.startedAt || Date.now());
    return {
      rank: 1,
      candidateKey: sub.candidateKey,
      round2Key: sub.round2Key || '',
      candidateName: sub.candidateName,
      rollNumber: sub.rollNumber,
      email: sub.email,
      totalScore: sub.totalScore || 0,
      maxScore: (sub.maxScore && sub.maxScore > 0)
        ? sub.maxScore
        : (sub.questionReports && Object.keys(sub.questionReports).length > 0)
          ? Object.values(sub.questionReports).reduce((sum, r) => sum + (r?.maxScore || 0), 0)
          : 100,
      solvedCount,
      questionStatus,
      dominantLanguage: sub.dominantLanguage || 'Python',
      timeTakenMinutes: Math.max(1, Math.round(elapsed / 60000)),
      isSubmitted: Boolean(sub.isSubmitted),
      submission: sub
    };
  });
  entries.sort((a, b) => b.totalScore - a.totalScore || b.solvedCount - a.solvedCount || a.timeTakenMinutes - b.timeTakenMinutes);
  entries.forEach((entry, index) => { entry.rank = index + 1; });
  return entries;
}


export function parseQuestionsFromPlainText(text: string): Round2Problem[] {
  if (!text || !text.trim()) return [];

  // 1. First check if it is valid JSON
  try {
    const jsonParsed = JSON.parse(text.trim());
    if (Array.isArray(jsonParsed) && jsonParsed.length > 0) {
      return jsonParsed.map((p, idx) => ({
        id: p.id || ('r2_q' + (idx + 1) + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
        number: idx + 1,
        title: p.title || ('Coding Question ' + (idx + 1)),
        difficulty: ((p.difficulty as any) || (idx < 3 ? 'Easy' : idx < 7 ? 'Medium' : 'Hard')) as 'Easy' | 'Medium' | 'Hard',
        marks: Number(p.marks) || (p.difficulty === 'Hard' ? 60 : p.difficulty === 'Medium' ? 40 : (idx < 3 ? 20 : idx < 7 ? 40 : 60)),
        timeLimitMs: Number(p.timeLimitMs) || 2000,
        description: p.description || p.problemStatement || (typeof p === 'string' ? p : ''),
        inputFormat: p.inputFormat || 'Standard input stream (stdin)',
        outputFormat: p.outputFormat || 'Standard output stream (stdout)',
        constraints: Array.isArray(p.constraints) ? p.constraints : [
          
          
          
        ],
        sampleTestCases: Array.isArray(p.sampleTestCases) ? p.sampleTestCases : [],
        hiddenTestCases: Array.isArray(p.hiddenTestCases) ? p.hiddenTestCases : [],
        starterCode: p.starterCode || {
          Python: '# Write your solution below\n\ndef solution():\n    pass\n\nif __name__ == "__main__":\n    solution()\n',
          'C++': '// Write your solution below\n#include <iostream>\nusing namespace std;\n\nint main() {\n    // Code here\n    return 0;\n}\n',
          Java: '// Write your solution below\nimport java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        // Code here\n    }\n}\n',
          C: '// Write your solution below\n#include <stdio.h>\n\nint main() {\n    // Code here\n    return 0;\n}\n',
          JavaScript: '// Write your solution below\nconst fs = require("fs");\n\nfunction solution() {\n    // Code here\n}\nsolution();\n'
        }
      }));
    }
  } catch {}

  // 2. Plain text parsing
  const rawText = text.trim();
  let questionBlocks: string[] = [];

  const numberedSplit = rawText.split(/(?:^|\n+)(?:(?:Q|Question|Problem)\s*\d+[\s:.-]+|\d+[\s.)-]+\s*)/i).filter(b => b.trim().length > 0);

  if (numberedSplit.length >= 2) {
    questionBlocks = numberedSplit;
  } else if (rawText.includes('---')) {
    questionBlocks = rawText.split(/---+/).filter(b => b.trim().length > 0);
  } else if (rawText.includes('\n\n')) {
    questionBlocks = rawText.split(/\n\s*\n+/).filter(b => b.trim().length > 0);
  } else {
    questionBlocks = rawText.split(/\n+/).filter(b => b.trim().length > 0);
  }

  return questionBlocks.map((block, idx) => {
    const trimmed = block.trim();
    const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
    const firstLine = lines[0] || ('Coding Problem ' + (idx + 1));

    let title = firstLine;
    const description = trimmed;

    if (firstLine.includes(':') && firstLine.indexOf(':') < 50) {
      title = firstLine.split(':')[0].trim();
    } else if (firstLine.includes(' - ') && firstLine.indexOf(' - ') < 50) {
      title = firstLine.split(' - ')[0].trim();
    } else {
      title = firstLine.trim();
    }

    const total = questionBlocks.length;
    let difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium';
    if (idx < Math.ceil(total * 0.3)) {
      difficulty = 'Easy';
    } else if (idx >= Math.floor(total * 0.7)) {
      difficulty = 'Hard';
    }

    return {
      id: 'r2_q' + (idx + 1) + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      number: idx + 1,
      title: title || ('Problem ' + (idx + 1)),
      difficulty,
      marks: difficulty === 'Easy' ? 20 : difficulty === 'Medium' ? 40 : 60,
      timeLimitMs: 2000,
      description,
      inputFormat: 'Standard input stream (stdin)',
      outputFormat: 'Standard output stream (stdout)',
      constraints: [
        
        
        
      ],
      sampleTestCases: [],
      hiddenTestCases: [],
      starterCode: {
        Python: '# Write your solution below\n\ndef solution():\n    pass\n\nif __name__ == "__main__":\n    solution()\n',
        'C++': '// Write your solution below\n#include <iostream>\nusing namespace std;\n\nint main() {\n    // Code here\n    return 0;\n}\n',
        Java: '// Write your solution below\nimport java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        // Code here\n    }\n}\n',
        C: '// Write your solution below\n#include <stdio.h>\n\nint main() {\n    // Code here\n    return 0;\n}\n',
        JavaScript: '// Write your solution below\nconst fs = require("fs");\n\nfunction solution() {\n    // Code here\n}\nsolution();\n'
      }
    };
  });
}

