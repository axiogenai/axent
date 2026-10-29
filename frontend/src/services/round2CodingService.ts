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
  };
}

export interface Round2QuestionReport {
  questionNumber: number;
  questionId: string;
  questionTitle: string;
  code: string;
  language: 'C' | 'C++' | 'Python';
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
}

export const ROUND2_QUESTIONS_CONFIG_ID = 'codespark_round2_questions';
export const ROUND2_SUBMISSIONS_STORAGE_KEY = 'codedna_codespark_r2_submissions';

export const DEFAULT_ROUND2_PROBLEMS: Round2Problem[] = [
  {
    id: 'r2_q1_two_sum',
    number: 1,
    title: 'Target Sum Pair Search',
    difficulty: 'Easy',
    marks: 20,
    timeLimitMs: 2000,
    description:
      'Given an array of integers `nums` and an integer `target`, return the indices of the two numbers such that they add up to `target`. You may assume that each input has exactly one solution, and you may not use the same element twice. Print the indices separated by a single space.',
    inputFormat:
      'First line: integer N (size of array)\nSecond line: N space-separated integers\nThird line: integer target',
    outputFormat: 'Two space-separated indices (0-indexed)',
    constraints: ['2 <= N <= 10^4', '-10^9 <= nums[i] <= 10^9', '-10^9 <= target <= 10^9'],
    sampleTestCases: [
      {
        id: 'tc1_sample_1',
        input: '4\n2 7 11 15\n9',
        expectedOutput: '0 1',
        explanation: 'nums[0] + nums[1] = 2 + 7 = 9'
      },
      {
        id: 'tc1_sample_2',
        input: '3\n3 2 4\n6',
        expectedOutput: '1 2',
        explanation: 'nums[1] + nums[2] = 2 + 4 = 6'
      }
    ],
    hiddenTestCases: [
      {
        id: 'tc1_hidden_1',
        input: '2\n3 3\n6',
        expectedOutput: '0 1',
        isHidden: true
      },
      {
        id: 'tc1_hidden_2',
        input: '5\n-1 -2 -3 -4 -5\n-8',
        expectedOutput: '2 4',
        isHidden: true
      }
    ],
    starterCode: {
      Python: '# CodeSpark 2026 Round 2 — Problem 1\n# Write your code below (Auto-detected: Python)\nimport sys\n\ndef solve():\n    lines = sys.stdin.read().split()\n    if not lines:\n        return\n    n = int(lines[0])\n    nums = [int(x) for x in lines[1:n+1]]\n    target = int(lines[n+1])\n    \n    seen = {}\n    for i, x in enumerate(nums):\n        diff = target - x\n        if diff in seen:\n            print(f"{seen[diff]} {i}")\n            return\n        seen[x] = i\n\nif __name__ == "__main__":\n    solve()\n',
      'C++': '// CodeSpark 2026 Round 2 — Problem 1\n#include <iostream>\n#include <vector>\n#include <unordered_map>\nusing namespace std;\n\nint main() {\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n    int target;\n    cin >> target;\n    \n    unordered_map<int, int> seen;\n    for (int i = 0; i < n; i++) {\n        int diff = target - nums[i];\n        if (seen.count(diff)) {\n            cout << seen[diff] << " " << i << "\\n";\n            return 0;\n        }\n        seen[nums[i]] = i;\n    }\n    return 0;\n}\n',
      C: '// CodeSpark 2026 Round 2 — Problem 1\n#include <stdio.h>\n#include <stdlib.h>\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int *nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n    int target;\n    scanf("%d", &target);\n    \n    for (int i = 0; i < n; i++) {\n        for (int j = i + 1; j < n; j++) {\n            if (nums[i] + nums[j] == target) {\n                printf("%d %d\\n", i, j);\n                free(nums);\n                return 0;\n            }\n        }\n    }\n    free(nums);\n    return 0;\n}\n'
    }
  },
  {
    id: 'r2_q2_palindrome',
    number: 2,
    title: 'Alphanumeric Palindrome Validator',
    difficulty: 'Easy',
    marks: 20,
    timeLimitMs: 2000,
    description:
      'A phrase is a palindrome if, after converting all uppercase letters into lowercase letters and removing all non-alphanumeric characters, it reads the same forward and backward. Print `true` if it is a palindrome, or `false` otherwise.',
    inputFormat: 'A single line containing the string phrase.',
    outputFormat: 'Print `true` or `false` (lowercase).',
    constraints: ['1 <= length(s) <= 10^5', 's consists only of printable ASCII characters.'],
    sampleTestCases: [
      {
        id: 'tc2_sample_1',
        input: 'A man, a plan, a canal: Panama',
        expectedOutput: 'true',
        explanation: '"amanaplanacanalpanama" is a palindrome.'
      },
      {
        id: 'tc2_sample_2',
        input: 'race a car',
        expectedOutput: 'false',
        explanation: '"raceacar" is not a palindrome.'
      }
    ],
    hiddenTestCases: [
      {
        id: 'tc2_hidden_1',
        input: ' ',
        expectedOutput: 'true',
        isHidden: true
      },
      {
        id: 'tc2_hidden_2',
        input: '0P',
        expectedOutput: 'false',
        isHidden: true
      }
    ],
    starterCode: {
      Python: '# CodeSpark 2026 Round 2 — Problem 2\nimport sys\n\ndef solve():\n    s = sys.stdin.read().strip()\n    filtered = [ch.lower() for ch in s if ch.isalnum()]\n    print("true" if filtered == filtered[::-1] else "false")\n\nif __name__ == "__main__":\n    solve()\n',
      'C++': '// CodeSpark 2026 Round 2 — Problem 2\n#include <iostream>\n#include <string>\n#include <cctype>\nusing namespace std;\n\nint main() {\n    string s;\n    getline(cin, s);\n    string filtered = "";\n    for (char c : s) {\n        if (isalnum((unsigned char)c)) filtered += tolower((unsigned char)c);\n    }\n    int l = 0, r = (int)filtered.size() - 1;\n    bool isPal = true;\n    while (l < r) {\n        if (filtered[l++] != filtered[r--]) { isPal = false; break; }\n    }\n    cout << (isPal ? "true" : "false") << "\\n";\n    return 0;\n}\n',
      C: '// CodeSpark 2026 Round 2 — Problem 2\n#include <stdio.h>\n#include <string.h>\n#include <ctype.h>\n\nint main() {\n    char s[200005];\n    if (!fgets(s, sizeof(s), stdin)) return 0;\n    int l = 0, r = strlen(s) - 1;\n    int isPal = 1;\n    while (l < r) {\n        while (l < r && !isalnum((unsigned char)s[l])) l++;\n        while (l < r && !isalnum((unsigned char)s[r])) r--;\n        if (tolower((unsigned char)s[l]) != tolower((unsigned char)s[r])) {\n            isPal = 0;\n            break;\n        }\n        l++; r--;\n    }\n    printf("%s\\n", isPal ? "true" : "false");\n    return 0;\n}\n'
    }
  },
  {
    id: 'r2_q3_kadane',
    number: 3,
    title: 'Maximum Subarray Sum (Kadane)',
    difficulty: 'Medium',
    marks: 20,
    timeLimitMs: 2000,
    description:
      'Given an integer array `nums`, find the subarray with the largest sum, and return its sum. A subarray is a contiguous non-empty sequence of elements within an array.',
    inputFormat:
      'First line: integer N (array length)\nSecond line: N space-separated integers',
    outputFormat: 'Single integer representing maximum contiguous sum.',
    constraints: ['1 <= N <= 10^5', '-10^4 <= nums[i] <= 10^4'],
    sampleTestCases: [
      {
        id: 'tc3_sample_1',
        input: '9\n-2 1 -3 4 -1 2 1 -5 4',
        expectedOutput: '6',
        explanation: 'The subarray [4,-1,2,1] has the largest sum 6.'
      },
      {
        id: 'tc3_sample_2',
        input: '1\n1',
        expectedOutput: '1',
        explanation: 'Subarray [1] has sum 1.'
      }
    ],
    hiddenTestCases: [
      {
        id: 'tc3_hidden_1',
        input: '5\n5 4 -1 7 8',
        expectedOutput: '23',
        isHidden: true
      },
      {
        id: 'tc3_hidden_2',
        input: '4\n-5 -2 -8 -1',
        expectedOutput: '-1',
        isHidden: true
      }
    ],
    starterCode: {
      Python: '# CodeSpark 2026 Round 2 — Problem 3\nimport sys\n\ndef solve():\n    lines = sys.stdin.read().split()\n    if not lines: return\n    n = int(lines[0])\n    nums = [int(x) for x in lines[1:n+1]]\n    cur_sum = max_sum = nums[0]\n    for x in nums[1:]:\n        cur_sum = max(x, cur_sum + x)\n        max_sum = max(max_sum, cur_sum)\n    print(max_sum)\n\nif __name__ == "__main__":\n    solve()\n',
      'C++': '// CodeSpark 2026 Round 2 — Problem 3\n#include <iostream>\n#include <vector>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n    int n;\n    if (!(cin >> n)) return 0;\n    long long cur = 0, ans = -1e18;\n    for (int i = 0; i < n; i++) {\n        long long x;\n        cin >> x;\n        if (i == 0) cur = ans = x;\n        else {\n            cur = max(x, cur + x);\n            ans = max(ans, cur);\n        }\n    }\n    cout << ans << "\\n";\n    return 0;\n}\n',
      C: '// CodeSpark 2026 Round 2 — Problem 3\n#include <stdio.h>\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    long long cur = 0, ans = -1e18;\n    for (int i = 0; i < n; i++) {\n        long long x;\n        scanf("%lld", &x);\n        if (i == 0) { cur = x; ans = x; }\n        else {\n            cur = (x > cur + x) ? x : cur + x;\n            ans = (cur > ans) ? cur : ans;\n        }\n    }\n    printf("%lld\\n", ans);\n    return 0;\n}\n'
    }
  },
  {
    id: 'r2_q4_climbing_stairs',
    number: 4,
    title: 'Distinct Staircase Paths',
    difficulty: 'Medium',
    marks: 20,
    timeLimitMs: 2000,
    description:
      'You are climbing a staircase. It takes `n` steps to reach the top. Each time you can either climb 1 or 2 steps. In how many distinct ways can you climb to the top? Return the total number of distinct paths.',
    inputFormat: 'A single integer N.',
    outputFormat: 'Print single integer count of distinct ways.',
    constraints: ['1 <= N <= 45'],
    sampleTestCases: [
      {
        id: 'tc4_sample_1',
        input: '2',
        expectedOutput: '2',
        explanation: '1. 1 step + 1 step, 2. 2 steps'
      },
      {
        id: 'tc4_sample_2',
        input: '3',
        expectedOutput: '3',
        explanation: '1. 1+1+1, 2. 1+2, 3. 2+1'
      }
    ],
    hiddenTestCases: [
      {
        id: 'tc4_hidden_1',
        input: '5',
        expectedOutput: '8',
        isHidden: true
      },
      {
        id: 'tc4_hidden_2',
        input: '10',
        expectedOutput: '89',
        isHidden: true
      }
    ],
    starterCode: {
      Python: '# CodeSpark 2026 Round 2 — Problem 4\nimport sys\n\ndef solve():\n    raw = sys.stdin.read().strip()\n    if not raw: return\n    n = int(raw)\n    if n <= 2: print(n); return\n    a, b = 1, 2\n    for _ in range(3, n + 1):\n        a, b = b, a + b\n    print(b)\n\nif __name__ == "__main__":\n    solve()\n',
      'C++': '// CodeSpark 2026 Round 2 — Problem 4\n#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    if (!(cin >> n)) return 0;\n    if (n <= 2) { cout << n << "\\n"; return 0; }\n    long long a = 1, b = 2;\n    for (int i = 3; i <= n; i++) {\n        long long next = a + b;\n        a = b;\n        b = next;\n    }\n    cout << b << "\\n";\n    return 0;\n}\n',
      C: '// CodeSpark 2026 Round 2 — Problem 4\n#include <stdio.h>\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    if (n <= 2) { printf("%d\\n", n); return 0; }\n    long long a = 1, b = 2;\n    for (int i = 3; i <= n; i++) {\n        long long next = a + b;\n        a = b;\n        b = next;\n    }\n    printf("%lld\\n", b);\n    return 0;\n}\n'
    }
  },
  {
    id: 'r2_q5_longest_substring',
    number: 5,
    title: 'Longest Unique Character Substring',
    difficulty: 'Hard',
    marks: 20,
    timeLimitMs: 2000,
    description:
      'Given a string `s`, find the length of the longest substring without repeating characters. A substring is a contiguous sequence of characters within a string.',
    inputFormat: 'A single line string s.',
    outputFormat: 'Print the integer maximum length.',
    constraints: ['0 <= length(s) <= 5 * 10^4', 's consists of English letters, digits, symbols and spaces.'],
    sampleTestCases: [
      {
        id: 'tc5_sample_1',
        input: 'abcabcbb',
        expectedOutput: '3',
        explanation: 'The answer is "abc", with the length of 3.'
      },
      {
        id: 'tc5_sample_2',
        input: 'bbbbb',
        expectedOutput: '1',
        explanation: 'The answer is "b", with the length of 1.'
      }
    ],
    hiddenTestCases: [
      {
        id: 'tc5_hidden_1',
        input: 'pwwkew',
        expectedOutput: '3',
        isHidden: true
      },
      {
        id: 'tc5_hidden_2',
        input: '',
        expectedOutput: '0',
        isHidden: true
      }
    ],
    starterCode: {
      Python: '# CodeSpark 2026 Round 2 — Problem 5\nimport sys\n\ndef solve():\n    s = sys.stdin.read().rstrip("\\r\\n")\n    char_index = {}\n    max_len = 0\n    start = 0\n    for end, ch in enumerate(s):\n        if ch in char_index and char_index[ch] >= start:\n            start = char_index[ch] + 1\n        char_index[ch] = end\n        max_len = max(max_len, end - start + 1)\n    print(max_len)\n\nif __name__ == "__main__":\n    solve()\n',
      'C++': '// CodeSpark 2026 Round 2 — Problem 5\n#include <iostream>\n#include <string>\n#include <vector>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n    string s;\n    if (!getline(cin, s)) s = "";\n    vector<int> lastIdx(256, -1);\n    int maxLen = 0, start = 0;\n    for (int i = 0; i < (int)s.size(); i++) {\n        unsigned char c = s[i];\n        if (lastIdx[c] >= start) start = lastIdx[c] + 1;\n        lastIdx[c] = i;\n        maxLen = max(maxLen, i - start + 1);\n    }\n    cout << maxLen << "\\n";\n    return 0;\n}\n',
      C: '// CodeSpark 2026 Round 2 — Problem 5\n#include <stdio.h>\n#include <string.h>\n\nint main() {\n    char s[100005];\n    if (!fgets(s, sizeof(s), stdin)) s[0] = \'\\0\';\n    int len = strlen(s);\n    while (len > 0 && (s[len - 1] == \'\\n\' || s[len - 1] == \'\\r\')) s[--len] = \'\\0\';\n    int last[256];\n    for (int i = 0; i < 256; i++) last[i] = -1;\n    int maxLen = 0, start = 0;\n    for (int i = 0; i < len; i++) {\n        unsigned char c = s[i];\n        if (last[c] >= start) start = last[c] + 1;\n        last[c] = i;\n        int cur = i - start + 1;\n        if (cur > maxLen) maxLen = cur;\n    }\n    printf("%d\\n", maxLen);\n    return 0;\n}\n'
    }
  }
];

export function detectLanguageFromCode(code: string): 'C' | 'C++' | 'Python' {
  if (!code || !code.trim()) return 'Python';
  const c = code.trim();

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
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_ROUND2_PROBLEMS;
}

export function saveRound2Problems(problems: Round2Problem[]): void {
  try {
    localStorage.setItem('codedna_codespark_r2_problems', JSON.stringify(problems));
    void saveRound2ProblemsToCloud(problems);
  } catch {}
}

export async function saveRound2ProblemsToCloud(problems: Round2Problem[]): Promise<boolean> {
  if (!supabase) return false;
  try {
    const payload = {
      problems,
      updatedAt: Date.now()
    };
    await supabase.from('candidate_stations').upsert({
      id: ROUND2_QUESTIONS_CONFIG_ID,
      lab_id: 'SYSTEM_CONFIG',
      station_number: 'CONFIG',
      status: 'CONFIG',
      code: JSON.stringify(payload),
      student: payload,
      last_updated_timestamp: Date.now()
    });
    return true;
  } catch (err) {
    console.warn('[Round 2] Failed to save questions to cloud:', err);
    return false;
  }
}

export async function fetchRound2ProblemsFromCloud(): Promise<Round2Problem[]> {
  if (!supabase) return getAllRound2Problems();
  try {
    const { data: rec, error } = await supabase
      .from('candidate_stations')
      .select('code, student')
      .eq('id', ROUND2_QUESTIONS_CONFIG_ID)
      .maybeSingle();

    if (!error && rec) {
      const cfg =
        rec.student && typeof rec.student === 'object' && Array.isArray((rec.student as any).problems)
          ? (rec.student as any)
          : rec.code
          ? JSON.parse(rec.code)
          : null;

      if (cfg && Array.isArray(cfg.problems) && cfg.problems.length > 0) {
        localStorage.setItem('codedna_codespark_r2_problems', JSON.stringify(cfg.problems));
        return cfg.problems;
      }
    }
  } catch (e) {
    console.warn('[Round 2] fetchRound2ProblemsFromCloud error:', e);
  }
  return getAllRound2Problems();
}

/**
 * Executes a candidate's code on Judge0/Wandbox compiler against problem test cases.
 * Generates an instant short report and score.
 */
export async function evaluateRound2Code(
  problem: Round2Problem,
  code: string,
  explicitLanguage?: 'C' | 'C++' | 'Python'
): Promise<Round2QuestionReport> {
  const language = explicitLanguage || detectLanguageFromCode(code);
  const sampleResults: Round2QuestionReport['sampleResults'] = [];
  const hiddenResults: Round2QuestionReport['hiddenResults'] = [];

  let primaryCompilerResult: CompilerExecutionResult | null = null;
  let passedCount = 0;
  const allTests = [...problem.sampleTestCases, ...problem.hiddenTestCases];

  // 1. Run against sample test cases
  for (const tc of problem.sampleTestCases) {
    try {
      const exec = await runRealCode(code, language, tc.input);
      if (!primaryCompilerResult) primaryCompilerResult = exec;

      const trimmedActual = (exec.stdout || '').trim();
      const trimmedExpected = tc.expectedOutput.trim();
      const passed = !exec.isError && trimmedActual === trimmedExpected;

      if (passed) passedCount++;

      sampleResults.push({
        testCaseId: tc.id,
        input: tc.input,
        expected: tc.expectedOutput,
        actual: trimmedActual || (exec.stderr ? `Error: ${exec.stderr}` : '(No output)'),
        passed,
        error: (exec.compileOutput || exec.stderr) || undefined
      });
    } catch (err: any) {
      sampleResults.push({
        testCaseId: tc.id,
        input: tc.input,
        expected: tc.expectedOutput,
        actual: 'Execution Error',
        passed: false,
        error: err.message
      });
    }
  }

  // 2. Run against hidden test cases
  for (const tc of problem.hiddenTestCases) {
    try {
      const exec = await runRealCode(code, language, tc.input);
      const trimmedActual = (exec.stdout || '').trim();
      const trimmedExpected = tc.expectedOutput.trim();
      const passed = !exec.isError && trimmedActual === trimmedExpected;

      if (passed) passedCount++;

      hiddenResults.push({
        testCaseId: tc.id,
        passed
      });
    } catch {
      hiddenResults.push({
        testCaseId: tc.id,
        passed: false
      });
    }
  }

  const totalTests = Math.max(1, allTests.length);
  const rawScore = Math.round((passedCount / totalTests) * problem.marks);

  let status: Round2QuestionReport['status'] = 'PARTIAL';
  if (primaryCompilerResult?.compileOutput) {
    status = 'COMPILE_ERROR';
  } else if (passedCount === totalTests) {
    status = 'ACCEPTED';
  } else if (passedCount === 0) {
    status = 'RUNTIME_ERROR';
  }

  const report: Round2QuestionReport = {
    questionNumber: problem.number,
    questionId: problem.id,
    questionTitle: problem.title,
    code,
    language,
    compilerResult: primaryCompilerResult,
    sampleResults,
    hiddenResults,
    passedTests: passedCount,
    totalTests,
    score: rawScore,
    maxScore: problem.marks,
    status,
    compiledAt: Date.now()
  };

  return report;
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

export async function pushRound2SubmissionToCloud(sub: Round2CandidateSubmission): Promise<boolean> {
  if (!supabase) return false;
  try {
    const cloudId = `r2_sub_${sub.candidateKey.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    const payload = {
      ...sub,
      updatedAt: Date.now()
    };

    // 1. Save to candidate_stations for universal instant access
    await supabase.from('candidate_stations').upsert({
      id: cloudId,
      lab_id: 'ROUND_2_ARENA',
      station_number: sub.stationNumber || 'Station #01',
      status: sub.isSubmitted ? 'SUBMITTED' : 'IN_PROGRESS',
      code: JSON.stringify(payload),
      student: {
        name: sub.candidateName,
        rollNumber: sub.rollNumber,
        email: sub.email,
        accessKey: sub.candidateKey,
        round2Key: sub.round2Key,
        score: sub.totalScore,
        maxScore: sub.maxScore,
        isSubmitted: sub.isSubmitted
      },
      last_updated_timestamp: Date.now()
    });

    // 2. Also save to code_submissions table
    try {
      await supabase.from('code_submissions').upsert({
        id: cloudId,
        student: {
          name: sub.candidateName,
          rollNumber: sub.rollNumber,
          email: sub.email,
          accessKey: sub.candidateKey,
          score: sub.totalScore
        },
        language: sub.dominantLanguage || 'Python',
        code: JSON.stringify(sub.questionReports),
        status: sub.isSubmitted ? 'SUBMITTED' : 'IN_PROGRESS',
        created_at: Date.now()
      });
    } catch {}

    return true;
  } catch (err) {
    console.warn('[Round 2] pushRound2SubmissionToCloud failed:', err);
    return false;
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
}

export async function fetchRound2Leaderboard(): Promise<Round2LeaderboardEntry[]> {
  const localList = getAllRound2Submissions();
  const subMap = new Map<string, Round2CandidateSubmission>();

  localList.forEach((s) => subMap.set(s.candidateKey.toUpperCase(), s));

  // Query Supabase candidate_stations for all r2_sub_ records
  if (supabase) {
    try {
      const { data: records, error } = await supabase
        .from('candidate_stations')
        .select('code, student')
        .like('id', 'r2_sub_%');

      if (!error && records) {
        for (const row of records) {
          const sub: Round2CandidateSubmission | null =
            row.code ? JSON.parse(row.code) : null;
          if (sub && sub.candidateKey) {
            const key = sub.candidateKey.toUpperCase();
            const existing = subMap.get(key);
            if (!existing || (sub.totalScore >= existing.totalScore)) {
              subMap.set(key, sub);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Round 2] fetchRound2Leaderboard cloud query error:', e);
    }
  }

  const allSubs = Array.from(subMap.values());

  // Build Leaderboard
  const entries: Round2LeaderboardEntry[] = allSubs.map((sub) => {
    let solvedCount = 0;
    const qStatus: Record<number, 'ACCEPTED' | 'PARTIAL' | 'FAILED' | 'PENDING'> = {};

    for (let q = 1; q <= 5; q++) {
      const report = sub.questionReports?.[q];
      if (!report) {
        qStatus[q] = 'PENDING';
      } else if (report.status === 'ACCEPTED') {
        qStatus[q] = 'ACCEPTED';
        solvedCount++;
      } else if (report.score > 0) {
        qStatus[q] = 'PARTIAL';
      } else {
        qStatus[q] = 'FAILED';
      }
    }

    const elapsedMs = (sub.submittedAt || Date.now()) - (sub.startedAt || Date.now());
    const timeTakenMinutes = Math.max(1, Math.round(elapsedMs / 60000));

    return {
      rank: 1,
      candidateKey: sub.candidateKey,
      round2Key: sub.round2Key,
      candidateName: sub.candidateName,
      rollNumber: sub.rollNumber,
      email: sub.email,
      totalScore: sub.totalScore || 0,
      maxScore: sub.maxScore || 100,
      solvedCount,
      questionStatus: qStatus,
      dominantLanguage: sub.dominantLanguage || 'Python',
      timeTakenMinutes,
      isSubmitted: Boolean(sub.isSubmitted),
      submission: sub
    };
  });

  // Sort by:
  // 1. totalScore desc
  // 2. solvedCount desc
  // 3. timeTakenMinutes asc
  entries.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.solvedCount !== a.solvedCount) return b.solvedCount - a.solvedCount;
    return a.timeTakenMinutes - b.timeTakenMinutes;
  });

  // Assign ranks
  entries.forEach((e, idx) => {
    e.rank = idx + 1;
  });

  return entries;
}
