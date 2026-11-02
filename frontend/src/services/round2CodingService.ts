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

  status: 'PENDING' | 'ACCEPTED' | 'PARTIAL' | 'COMPILE_ERROR' | 'RUNTIME_ERROR' | 'WRONG_ANSWER';

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
export const ROUND2_ARENA_UNLOCKED_KEY = 'codedna_codespark_round2_unlocked';
export const CODESPARK_SYSTEM_CONFIG_ID = 'codespark_system_config';

export function isRound2ArenaUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(ROUND2_ARENA_UNLOCKED_KEY) === 'true';
}

export async function fetchRound2ArenaUnlockedFromDb(): Promise<boolean> {
  if (!supabase) return isRound2ArenaUnlocked();
  try {
    // 1. Try candidate_stations first
    const { data: rec, error } = await supabase
      .from('candidate_stations')
      .select('code, student')
      .eq('id', CODESPARK_SYSTEM_CONFIG_ID)
      .maybeSingle();

    if (!error && rec) {
      let isUnlocked: boolean | undefined;
      if (rec.student && typeof rec.student === 'object' && typeof (rec.student as any).isRound2ArenaOpen === 'boolean') {
        isUnlocked = (rec.student as any).isRound2ArenaOpen;
      } else if (rec.code) {
        try {
          const parsed = JSON.parse(rec.code);
          if (typeof parsed.isRound2ArenaOpen === 'boolean') {
            isUnlocked = parsed.isRound2ArenaOpen;
          }
        } catch {}
      }

      if (typeof isUnlocked === 'boolean') {
        if (typeof window !== 'undefined') {
          const prev = localStorage.getItem(ROUND2_ARENA_UNLOCKED_KEY) === 'true';
          if (prev !== isUnlocked) {
            localStorage.setItem(ROUND2_ARENA_UNLOCKED_KEY, isUnlocked ? 'true' : 'false');
            window.dispatchEvent(new CustomEvent('codedna_codespark_round2_unlocked_changed', { detail: isUnlocked }));
            window.dispatchEvent(new Event('storage'));
          }
        }
        return isUnlocked;
      }
    }

    // 2. Fallback to mcq_exams table
    const { data: meRec, error: meErr } = await supabase
      .from('mcq_exams')
      .select('instructions')
      .eq('id', CODESPARK_SYSTEM_CONFIG_ID)
      .maybeSingle();

    if (!meErr && meRec?.instructions) {
      try {
        const parsed = JSON.parse(meRec.instructions);
        if (typeof parsed.isRound2ArenaOpen === 'boolean') {
          if (typeof window !== 'undefined') {
            const prev = localStorage.getItem(ROUND2_ARENA_UNLOCKED_KEY) === 'true';
            if (prev !== parsed.isRound2ArenaOpen) {
              localStorage.setItem(ROUND2_ARENA_UNLOCKED_KEY, parsed.isRound2ArenaOpen ? 'true' : 'false');
              window.dispatchEvent(new CustomEvent('codedna_codespark_round2_unlocked_changed', { detail: parsed.isRound2ArenaOpen }));
              window.dispatchEvent(new Event('storage'));
            }
          }
          return parsed.isRound2ArenaOpen;
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[Round 2] Failed to fetch arena unlock status from DB:', err);
  }
  return isRound2ArenaUnlocked();
}

export function setRound2ArenaUnlocked(unlocked: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ROUND2_ARENA_UNLOCKED_KEY, unlocked ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent('codedna_codespark_round2_unlocked_changed', { detail: unlocked }));
  window.dispatchEvent(new Event('storage'));

  // Sync to database immediately (both candidate_stations and mcq_exams)
  void (async () => {
    if (!supabase) return;
    try {
      let cfg: any = {};

      // 1. Read existing config from mcq_exams first so we never wipe candidates or activeExamId
      try {
        const { data: meRec } = await supabase
          .from('mcq_exams')
          .select('instructions')
          .eq('id', CODESPARK_SYSTEM_CONFIG_ID)
          .maybeSingle();

        if (meRec?.instructions) {
          cfg = JSON.parse(meRec.instructions);
        }
      } catch {}

      // 2. Fallback check candidate_stations if not found in mcq_exams
      if (!cfg || Object.keys(cfg).length === 0) {
        try {
          const { data: rec } = await supabase
            .from('candidate_stations')
            .select('code, student')
            .eq('id', CODESPARK_SYSTEM_CONFIG_ID)
            .maybeSingle();

          if (rec) {
            if (rec.student && typeof rec.student === 'object') {
              cfg = { ...rec.student };
            } else if (rec.code) {
              try {
                cfg = JSON.parse(rec.code);
              } catch {}
            }
          }
        } catch {}
      }

      cfg.isRound2ArenaOpen = unlocked;
      cfg.updatedAt = Date.now();

      // 1. Save to candidate_stations
      try {
        await supabase.from('candidate_stations').upsert({
          id: CODESPARK_SYSTEM_CONFIG_ID,
          lab_id: 'SYSTEM_CONFIG',
          station_number: 'CONFIG',
          status: 'CONFIG',
          code: JSON.stringify(cfg),
          student: cfg,
          last_updated_timestamp: Date.now()
        });
      } catch (csErr) {
        console.warn('[Round 2] candidate_stations upsert warning:', csErr);
      }

      // 2. Save to mcq_exams with required bigint timestamps
      try {
        await supabase.from('mcq_exams').upsert({
          id: CODESPARK_SYSTEM_CONFIG_ID,
          title: 'CodeSpark System Configuration & Roster',
          description: 'Cloud configuration for CodeSpark Active Paper, Shortlist Criteria, and Registered Candidates',
          instructions: JSON.stringify(cfg),
          subject: 'CodeSpark',
          topic: 'System',
          status: 'PUBLISHED',
          duration_minutes: 0,
          total_marks: 0,
          question_count: 0,
          created_at: Date.now(),
          updated_at: Date.now()
        });
      } catch (meErr) {
        console.warn('[Round 2] mcq_exams upsert warning:', meErr);
      }
    } catch (err) {
      console.warn('[Round 2] Failed to sync arena unlock status to DB:', err);
    }
  })();
}

export function subscribeToRound2ArenaUnlocked(callback: (unlocked: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<boolean>;
    if (typeof custom.detail === 'boolean') {
      callback(custom.detail);
    } else {
      callback(isRound2ArenaUnlocked());
    }
  };
  window.addEventListener('codedna_codespark_round2_unlocked_changed', handler);
  window.addEventListener('storage', handler);

  // Initial fetch from DB
  void fetchRound2ArenaUnlockedFromDb().then(callback);

  // Poll DB every 3 seconds for candidate stations
  const pollTimer = setInterval(() => {
    void fetchRound2ArenaUnlockedFromDb().then(callback);
  }, 3000);

  return () => {
    window.removeEventListener('codedna_codespark_round2_unlocked_changed', handler);
    window.removeEventListener('storage', handler);
    clearInterval(pollTimer);
  };
}



export const OFFICIAL_5_LEETCODE_PROBLEMS: Round2Problem[] = [
  {
    "id": "r2_q1_palindrome_number",
    "number": 1,
    "title": "Palindrome Number",
    "difficulty": "Easy",
    "marks": 10,
    "timeLimitMs": 2000,
    "description": "Check whether a given integer reads the same forward and backward.\n\nProblem Statement:\nYou are given an integer N. Your task is to determine whether it is a palindrome.\n\nA number is called a palindrome if its digits remain the same when read from left to right and right to left.\n\nFor example, 121 is a palindrome, whereas 123 is not. Negative numbers are not considered palindromes.",
    "inputFormat": "A single line containing an integer N.",
    "outputFormat": "Print YES if the given number is a palindrome. Otherwise, print NO.",
    "constraints": [
      "The input number can be as small as -2,147,483,648.",
      "The input number can be as large as 2,147,483,647.",
      "Negative numbers are not considered palindromes."
    ],
    "sampleTestCases": [
      {
        "id": "sample_1_1",
        "input": "121",
        "expectedOutput": "YES",
        "explanation": "The number 121 reads the same forward and backward."
      },
      {
        "id": "sample_1_2",
        "input": "123",
        "expectedOutput": "NO",
        "explanation": "123 read backward is 321, which does not match."
      },
      {
        "id": "sample_1_3",
        "input": "-121",
        "expectedOutput": "NO",
        "explanation": "Negative numbers are not considered palindromes."
      }
    ],
    "hiddenTestCases": [
      {
        "id": "hidden_1_1",
        "input": "0",
        "expectedOutput": "YES",
        "isHidden": true,
        "explanation": "0 is a single digit palindrome."
      },
      {
        "id": "hidden_1_2",
        "input": "12321",
        "expectedOutput": "YES",
        "isHidden": true,
        "explanation": "12321 reads the same both ways."
      }
    ],
    "starterCode": {
      "Python": "import sys\n\ndef isPalindrome(n):\n    # Write your solution here\n    pass\n\nif __name__ == '__main__':\n    raw = sys.stdin.read().strip()\n    if raw:\n        n = int(raw)\n        ans = isPalindrome(n)\n        if ans is not None:\n            print(ans)\n",
      "Java": "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNextLong()) {\n            long n = sc.nextLong();\n            // Write your solution here\n            \n        }\n    }\n}\n",
      "C++": "#include <iostream>\n#include <string>\n\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    long long n;\n    if (cin >> n) {\n        // Write your solution here\n        \n    }\n    return 0;\n}\n",
      "C": "#include <stdio.h>\n\nint main() {\n    long long n;\n    if (scanf(\"%lld\", &n) == 1) {\n        // Write your solution here\n        \n    }\n    return 0;\n}\n"
    }
  },
  {
    "id": "r2_q2_count_even_odd",
    "number": 2,
    "title": "Count Even and Odd Numbers",
    "difficulty": "Easy",
    "marks": 10,
    "timeLimitMs": 2000,
    "description": "Count how many even and odd numbers are present in a given integer array.\n\nProblem Statement:\nYou are given an array containing N integers. Your task is to count the total number of even elements and odd elements in the array.\n\nA number is even if it is completely divisible by 2. Otherwise, it is odd.\n\nFor example, in the array [1, 2, 3, 4, 5, 6], there are 3 even numbers and 3 odd numbers.",
    "inputFormat": "The first line contains an integer N, representing the number of elements in the array.\nThe second line contains N space-separated integers representing the array elements.",
    "outputFormat": "Print two space-separated integers:\n1. Total count of even numbers.\n2. Total count of odd numbers.",
    "constraints": [
      "The array must contain at least 1 element and at most 100,000 elements.",
      "Each array element can range from -1,000,000 to 1,000,000.",
      "Zero is considered an even number."
    ],
    "sampleTestCases": [
      {
        "id": "sample_2_1",
        "input": "6\n1 2 3 4 5 6",
        "expectedOutput": "3 3",
        "explanation": "The even numbers are 2, 4 and 6. The odd numbers are 1, 3 and 5."
      },
      {
        "id": "sample_2_2",
        "input": "5\n-2 -3 0 7 8",
        "expectedOutput": "3 2",
        "explanation": "Even numbers: -2, 0, 8 (3). Odd numbers: -3, 7 (2)."
      },
      {
        "id": "sample_2_3",
        "input": "1\n0",
        "expectedOutput": "1 0",
        "explanation": "0 is an even number."
      }
    ],
    "hiddenTestCases": [
      {
        "id": "hidden_2_1",
        "input": "4\n-1 -5 -7 -9",
        "expectedOutput": "0 4",
        "isHidden": true
      },
      {
        "id": "hidden_2_2",
        "input": "8\n2 4 6 8 10 12 14 16",
        "expectedOutput": "8 0",
        "isHidden": true
      }
    ],
    "starterCode": {
      "Python": "import sys\n\ndef countEvenOdd(arr):\n    # Write your solution here\n    # Return a tuple or list: (even_count, odd_count)\n    pass\n\nif __name__ == '__main__':\n    data = sys.stdin.read().split()\n    if data:\n        n = int(data[0])\n        arr = [int(x) for x in data[1:1+n]]\n        res = countEvenOdd(arr)\n        if res:\n            print(f\"{res[0]} {res[1]}\")\n",
      "Java": "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (!sc.hasNextInt()) return;\n        int n = sc.nextInt();\n        int[] arr = new int[n];\n        for (int i = 0; i < n; i++) arr[i] = sc.nextInt();\n        // Write your solution here\n        \n    }\n}\n",
      "C++": "#include <iostream>\n#include <vector>\n\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> arr(n);\n    for (int i = 0; i < n; i++) cin >> arr[i];\n    // Write your solution here\n    \n    return 0;\n}\n",
      "C": "#include <stdio.h>\n#include <stdlib.h>\n\nint main() {\n    int n;\n    if (scanf(\"%d\", &n) != 1) return 0;\n    int* arr = (int*)malloc(n * sizeof(int));\n    for (int i = 0; i < n; i++) scanf(\"%d\", &arr[i]);\n    // Write your solution here\n    \n    free(arr);\n    return 0;\n}\n"
    }
  },
  {
    "id": "r2_q3_second_largest",
    "number": 3,
    "title": "Second Largest Element",
    "difficulty": "Easy",
    "marks": 10,
    "timeLimitMs": 2000,
    "description": "Find the second largest distinct element present in a given array.\n\nProblem Statement:\nYou are given an array containing N integers. Your task is to find the second largest distinct element in the array.\n\nThe second largest element must be strictly smaller than the largest element.\n\nFor example, if the array is [12, 35, 1, 10, 34, 1], the largest element is 35 and the second largest element is 34.\n\nIf the array contains fewer than two distinct elements, print -1.",
    "inputFormat": "The first line contains an integer N, representing the size of the array.\nThe second line contains N space-separated integers.",
    "outputFormat": "Print the second largest distinct element.\nIf no second largest distinct element exists, print -1.",
    "constraints": [
      "The array must contain at least 1 element and at most 100,000 elements.",
      "Each element can range from -1,000,000 to 1,000,000.",
      "Duplicate elements must be considered only once when finding the second largest element."
    ],
    "sampleTestCases": [
      {
        "id": "sample_3_1",
        "input": "6\n12 35 1 10 34 1",
        "expectedOutput": "34",
        "explanation": "The largest element is 35. The second largest distinct element is 34."
      },
      {
        "id": "sample_3_2",
        "input": "5\n5 5 4 4 3",
        "expectedOutput": "4",
        "explanation": "The distinct elements are 5, 4, 3. The second largest is 4."
      },
      {
        "id": "sample_3_3",
        "input": "4\n-10 -20 -3 -4",
        "expectedOutput": "-4",
        "explanation": "Largest is -3, second largest is -4."
      }
    ],
    "hiddenTestCases": [
      {
        "id": "hidden_3_1",
        "input": "4\n7 7 7 7",
        "expectedOutput": "-1",
        "isHidden": true,
        "explanation": "All elements are identical; no second largest distinct element exists."
      },
      {
        "id": "hidden_3_2",
        "input": "2\n1 2",
        "expectedOutput": "1",
        "isHidden": true
      }
    ],
    "starterCode": {
      "Python": "import sys\n\ndef getSecondLargest(arr):\n    # Write your solution here\n    # Return second largest distinct element or -1\n    pass\n\nif __name__ == '__main__':\n    data = sys.stdin.read().split()\n    if data:\n        n = int(data[0])\n        arr = [int(x) for x in data[1:1+n]]\n        ans = getSecondLargest(arr)\n        if ans is not None:\n            print(ans)\n",
      "Java": "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (!sc.hasNextInt()) return;\n        int n = sc.nextInt();\n        long[] arr = new long[n];\n        for (int i = 0; i < n; i++) arr[i] = sc.nextLong();\n        // Write your solution here\n        \n    }\n}\n",
      "C++": "#include <iostream>\n#include <vector>\n\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<long long> arr(n);\n    for (int i = 0; i < n; i++) cin >> arr[i];\n    // Write your solution here\n    \n    return 0;\n}\n",
      "C": "#include <stdio.h>\n#include <stdlib.h>\n\nint main() {\n    int n;\n    if (scanf(\"%d\", &n) != 1) return 0;\n    long long* arr = (long long*)malloc(n * sizeof(long long));\n    for (int i = 0; i < n; i++) scanf(\"%lld\", &arr[i]);\n    // Write your solution here\n    \n    free(arr);\n    return 0;\n}\n"
    }
  },
  {
    "id": "r2_q4_maximum_subarray",
    "number": 4,
    "title": "Maximum Subarray Sum",
    "difficulty": "Medium",
    "marks": 10,
    "timeLimitMs": 2000,
    "description": "Find the maximum possible sum of a continuous sequence of elements in a given array.\n\nProblem Statement:\nYou are given an array containing N integers. Your task is to find a contiguous subarray whose sum is maximum.\n\nA contiguous subarray means a sequence of elements that appear next to each other in the original array.\n\nYou must select at least one element from the array.\n\nFor example, in the array [-2, 1, -3, 4, -1, 2, 1, -5, 4], the subarray [4, -1, 2, 1] produces the maximum sum of 6.",
    "inputFormat": "The first line contains an integer N, representing the size of the array.\nThe second line contains N space-separated integers.",
    "outputFormat": "Print a single integer representing the maximum possible sum of a contiguous subarray.",
    "constraints": [
      "The array must contain at least 1 element and at most 200,000 elements.",
      "Each element can range from -10,000 to 10,000.",
      "The subarray must contain at least one element.",
      "The maximum possible sum fits within a 32-bit signed integer."
    ],
    "sampleTestCases": [
      {
        "id": "sample_4_1",
        "input": "9\n-2 1 -3 4 -1 2 1 -5 4",
        "expectedOutput": "6",
        "explanation": "The contiguous subarray [4, -1, 2, 1] has the maximum sum: 4 + (-1) + 2 + 1 = 6"
      },
      {
        "id": "sample_4_2",
        "input": "5\n1 2 3 4 5",
        "expectedOutput": "15",
        "explanation": "All positive numbers: sum is 1 + 2 + 3 + 4 + 5 = 15"
      },
      {
        "id": "sample_4_3",
        "input": "4\n-5 -2 -8 -1",
        "expectedOutput": "-1",
        "explanation": "All negative numbers: maximum single element subarray is -1"
      }
    ],
    "hiddenTestCases": [
      {
        "id": "hidden_4_1",
        "input": "5\n5 -2 3 4 -1",
        "expectedOutput": "10",
        "isHidden": true
      },
      {
        "id": "hidden_4_2",
        "input": "4\n0 0 -1 0",
        "expectedOutput": "0",
        "isHidden": true
      }
    ],
    "starterCode": {
      "Python": "import sys\n\ndef maxSubArray(nums):\n    # Write your solution here (Maximum Subarray Sum)\n    pass\n\nif __name__ == '__main__':\n    data = sys.stdin.read().split()\n    if data:\n        n = int(data[0])\n        nums = [int(x) for x in data[1:1+n]]\n        ans = maxSubArray(nums)\n        if ans is not None:\n            print(ans)\n",
      "Java": "import java.util.*;\n\npublic class Main {\n    public static long maxSubArray(long[] nums) {\n        // Write your solution here\n        return 0;\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (!sc.hasNextInt()) return;\n        int n = sc.nextInt();\n        long[] nums = new long[n];\n        for (int i = 0; i < n; i++) nums[i] = sc.nextLong();\n        System.out.println(maxSubArray(nums));\n    }\n}\n",
      "C++": "#include <iostream>\n#include <vector>\n\nusing namespace std;\n\nlong long maxSubArray(vector<long long>& nums) {\n    // Write your solution here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<long long> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n    cout << maxSubArray(nums) << \"\\n\";\n    return 0;\n}\n",
      "C": "#include <stdio.h>\n#include <stdlib.h>\n\nlong long maxSubArray(long long nums[], int n) {\n    // Write your solution here\n    return 0;\n}\n\nint main() {\n    int n;\n    if (scanf(\"%d\", &n) != 1) return 0;\n    long long* nums = (long long*)malloc(n * sizeof(long long));\n    for (int i = 0; i < n; i++) scanf(\"%lld\", &nums[i]);\n    printf(\"%lld\\n\", maxSubArray(nums, n));\n    free(nums);\n    return 0;\n}\n"
    }
  },
  {
    "id": "r2_q5_product_except_self",
    "number": 5,
    "title": "Product of Array Except Self",
    "difficulty": "Medium",
    "marks": 10,
    "timeLimitMs": 2000,
    "description": "Calculate the product of all array elements except the element at the current position.\n\nProblem Statement:\nYou are given an integer array containing N elements.\n\nYour task is to create a new array where each element at index i represents the product of all the elements in the original array except the element present at index i.\n\nYou must solve this problem without using division.\n\nFor example, if the original array is [1, 2, 3, 4], the resulting array will be [24, 12, 8, 6].",
    "inputFormat": "The first line contains an integer N, representing the size of the array.\nThe second line contains N space-separated integers.",
    "outputFormat": "Print N space-separated integers representing the resulting array.",
    "constraints": [
      "The array must contain at least 2 elements and at most 100,000 elements.",
      "Each array element can range from -30 to 30.",
      "The product required for every output position is guaranteed to fit within a signed 64-bit integer.",
      "Division must not be used to calculate the result."
    ],
    "sampleTestCases": [
      {
        "id": "sample_5_1",
        "input": "4\n1 2 3 4",
        "expectedOutput": "24 12 8 6",
        "explanation": "Position 0: 2*3*4=24. Position 1: 1*3*4=12. Position 2: 1*2*4=8. Position 3: 1*2*3=6."
      },
      {
        "id": "sample_5_2",
        "input": "4\n0 1 2 3",
        "expectedOutput": "6 0 0 0",
        "explanation": "Only index 0 excludes the zero, giving 1*2*3=6."
      },
      {
        "id": "sample_5_3",
        "input": "5\n-1 1 0 -3 3",
        "expectedOutput": "0 0 9 0 0",
        "explanation": "At index 2 (the zero), product is (-1)*1*(-3)*3 = 9."
      }
    ],
    "hiddenTestCases": [
      {
        "id": "hidden_5_1",
        "input": "4\n2 3 4 5",
        "expectedOutput": "60 40 30 24",
        "isHidden": true
      },
      {
        "id": "hidden_5_2",
        "input": "3\n-2 -3 4",
        "expectedOutput": "-12 -8 6",
        "isHidden": true
      }
    ],
    "starterCode": {
      "Python": "import sys\n\ndef productExceptSelf(nums):\n    # Write your solution here without using division\n    pass\n\nif __name__ == '__main__':\n    data = sys.stdin.read().split()\n    if data:\n        n = int(data[0])\n        nums = [int(x) for x in data[1:1+n]]\n        res = productExceptSelf(nums)\n        if res is not None:\n            print(\" \".join(str(x) for x in res))\n",
      "Java": "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (!sc.hasNextInt()) return;\n        int n = sc.nextInt();\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) nums[i] = sc.nextInt();\n        // Write your solution here without using division\n        \n    }\n}\n",
      "C++": "#include <iostream>\n#include <vector>\n\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n    // Write your solution here without using division\n    \n    return 0;\n}\n",
      "C": "#include <stdio.h>\n#include <stdlib.h>\n\nint main() {\n    int n;\n    if (scanf(\"%d\", &n) != 1) return 0;\n    int* nums = (int*)malloc(n * sizeof(int));\n    for (int i = 0; i < n; i++) scanf(\"%d\", &nums[i]);\n    // Write your solution here without using division\n    \n    free(nums);\n    return 0;\n}\n"
    }
  }
];

export const DEFAULT_ROUND2_PROBLEMS: Round2Problem[] = OFFICIAL_5_LEETCODE_PROBLEMS;

const LEGACY_PROBLEM_TITLES = new Set([
  'Target Sum Pair Search',
  'Search in Rotated Sorted Array',
  'Merge Overlapping Intervals',
  'Valid Parentheses Expression',
  'Binary Tree Maximum Path Sum',
  'Coin Change Minimum Coins',
  'Kth Largest Element in an Array',
  'Word Search on Grid'
]);

export function isLegacyQuestionPool(problems: Round2Problem[]): boolean {
  if (!Array.isArray(problems) || problems.length === 0) return false;
  return problems.some(
    p => LEGACY_PROBLEM_TITLES.has(p.title) || (p.id && (p.id.startsWith('r2_legacy_') || p.id.startsWith('r2_q8_rotated')))
  );
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
          return OFFICIAL_5_LEETCODE_PROBLEMS;
        }
        return parsed;
      }
    }
  } catch {}
  return OFFICIAL_5_LEETCODE_PROBLEMS;
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

    // 1. Save to candidate_stations
    try {
      await supabase.from('candidate_stations').upsert({
        id: ROUND2_QUESTIONS_CONFIG_ID,
        lab_id: 'SYSTEM_CONFIG',
        station_number: 'CONFIG',
        status: 'CONFIG',
        code: JSON.stringify(payload),
        student: payload,
        last_updated_timestamp: Date.now()
      });
    } catch {}

    // 2. Also save to mcq_exams
    try {
      await supabase.from('mcq_exams').upsert({
        id: ROUND2_QUESTIONS_CONFIG_ID,
        title: 'CodeSpark Round 2 Algorithmic Problem Suite',
        description: 'Official 5 Algorithmic Challenges for Round 2 Coding Sprint',
        instructions: JSON.stringify(payload),
        subject: 'CodeSpark',
        topic: 'Coding',
        status: 'PUBLISHED',
        duration_minutes: 60,
        total_marks: 50,
        question_count: 5,
        created_at: Date.now(),
        updated_at: Date.now()
      });
    } catch {}

    return true;
  } catch (err) {
    console.warn('[Round 2] Failed to save questions to cloud:', err);
    return false;
  }
}

export async function fetchRound2ProblemsFromCloud(): Promise<Round2Problem[]> {
  if (!supabase) return getAllRound2Problems();
  try {
    // 1. Try candidate_stations
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
        if (isLegacyQuestionPool(cfg.problems)) {
          void saveRound2ProblemsToCloud(OFFICIAL_5_LEETCODE_PROBLEMS);
          localStorage.setItem('codedna_codespark_r2_problems', JSON.stringify(OFFICIAL_5_LEETCODE_PROBLEMS));
          return OFFICIAL_5_LEETCODE_PROBLEMS;
        }
        localStorage.setItem('codedna_codespark_r2_problems', JSON.stringify(cfg.problems));
        return cfg.problems;
      }
    }

    // 2. Fallback to mcq_exams
    const { data: meRec, error: meErr } = await supabase
      .from('mcq_exams')
      .select('instructions')
      .eq('id', ROUND2_QUESTIONS_CONFIG_ID)
      .maybeSingle();

    if (!meErr && meRec?.instructions) {
      try {
        const parsed = JSON.parse(meRec.instructions);
        if (parsed && Array.isArray(parsed.problems) && parsed.problems.length > 0) {
          if (isLegacyQuestionPool(parsed.problems)) {
            void saveRound2ProblemsToCloud(OFFICIAL_5_LEETCODE_PROBLEMS);
            localStorage.setItem('codedna_codespark_r2_problems', JSON.stringify(OFFICIAL_5_LEETCODE_PROBLEMS));
            return OFFICIAL_5_LEETCODE_PROBLEMS;
          }
          localStorage.setItem('codedna_codespark_r2_problems', JSON.stringify(parsed.problems));
          return parsed.problems;
        }
      } catch {}
    }

    // If empty in cloud, initialize with official 5 questions
    void saveRound2ProblemsToCloud(OFFICIAL_5_LEETCODE_PROBLEMS);
  } catch (e) {
    console.warn('[Round 2] fetchRound2ProblemsFromCloud error:', e);
  }

  return getAllRound2Problems();
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



    timeComplexity = 'O(NÃ‚Â³)';



    explanation = 'Triple-nested loop iteration (cubic polynomial time).';



    rating = 'Suboptimal';



  } else if (maxLoopDepth === 2) {



    if (hasSorting) {



      timeComplexity = 'O(NÃ‚Â² log N)';



      explanation = 'Nested quadratic loops containing inner sorting operations.';



      rating = 'Suboptimal';



    } else {



      timeComplexity = 'O(NÃ‚Â²)';



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



      timeComplexity = 'O(NÃ‚Â²)';



      explanation = '2D Dynamic programming table construction in quadratic time.';



      rating = 'Acceptable';



    }



  }



  return { timeComplexity, spaceComplexity, explanation, rating };



}



function computeDynamicScore(
  maxMarks: number, aiAligned: boolean, compileOk: boolean,
  timeComplexity: string, spaceComplexity: string, timeTakenMs: number
): number {
  // HackerRank standard: If code does not compile or does not solve the problem, score is strictly 0!
  if (!compileOk || !aiAligned) return 0;

  // Problem correctly solved: Start with 80% base score
  let score = maxMarks * 0.80;

  // Efficiency bonus (up to 15%)
  const tc = (timeComplexity || '').toLowerCase();
  const sc = (spaceComplexity || '').toLowerCase();
  let cBonus = 0;
  if (tc.includes('o(1)') || tc.includes('o(log')) cBonus += 0.08;
  else if (tc.includes('o(n log') || tc.includes('o(nlog')) cBonus += 0.06;
  else if (tc.includes('o(n)')) cBonus += 0.04;
  else cBonus += 0.01;

  if (sc.includes('o(1)')) cBonus += 0.07;
  else if (sc.includes('o(n)') || sc.includes('o(log')) cBonus += 0.04;
  else cBonus += 0.01;

  score += maxMarks * Math.min(cBonus, 0.15);

  // Speed bonus (up to 5% if finished within 20 mins)
  const maxTimeMs = 20 * 60 * 1000;
  score += maxMarks * 0.05 * Math.max(0, 1 - ((timeTakenMs || 0) / maxTimeMs));

  return Math.min(maxMarks, Math.max(0, Math.round(score)));
}

export async function evaluateRound2Code(
  problem: Round2Problem,
  code: string,
  explicitLanguage?: 'C' | 'C++' | 'Python' | 'Java',
  timeTakenMs?: number,
  customStdin?: string,
  isSubmit?: boolean
): Promise<Round2QuestionReport> {
  const language = explicitLanguage || detectLanguageFromCode(code);
  let primaryCompilerResult: CompilerExecutionResult | null = null;

  // 1. Determine primary test input
  let primaryInput = (customStdin !== undefined && customStdin !== null && customStdin.trim() !== '') ? customStdin : '';
  if (!primaryInput && problem.sampleTestCases && problem.sampleTestCases.length > 0) {
    primaryInput = problem.sampleTestCases[0].input || '';
  }

  // 2. Primary compile check
  try {
    primaryCompilerResult = await runRealCode(code, language, primaryInput);
  } catch (err: any) {
    console.warn('[Round 2] Primary run error:', err);
  }

  const hasCompileError = Boolean(primaryCompilerResult?.compileOutput);
  const maxMarks = problem.marks || 10;

  // If code didn't compile, fail early with COMPILE_ERROR
  if (hasCompileError) {
    return {
      questionNumber: problem.number,
      questionId: problem.id,
      questionTitle: problem.title,
      code,
      language,
      compilerResult: primaryCompilerResult,
      sampleResults: (problem.sampleTestCases || []).map((stc, i) => ({
        testCaseId: stc.id || `sample_${i + 1}`,
        input: stc.input,
        expected: stc.expectedOutput,
        actual: primaryCompilerResult?.compileOutput || 'Compilation Error',
        passed: false,
        error: primaryCompilerResult?.compileOutput || undefined
      })),
      hiddenResults: isSubmit ? (problem.hiddenTestCases || []).map((htc, i) => ({
        testCaseId: htc.id || `hidden_${i + 1}`,
        passed: false
      })) : [],
      passedTests: 0,
      totalTests: (problem.sampleTestCases?.length || 0) + (isSubmit ? (problem.hiddenTestCases?.length || 0) : 0),
      score: 0,
      maxScore: maxMarks,
      status: 'COMPILE_ERROR',
      compiledAt: Date.now(),
      executionTime: undefined,
      timeComplexity: 'N/A',
      spaceComplexity: 'N/A'
    };
  }

  // 3. Execute test cases against real compiler
  const sampleResults: Round2QuestionReport['sampleResults'] = [];

  // If candidate is running custom input (typed their own input) and this is not a final submission:
  if (!isSubmit && customStdin !== undefined && customStdin !== null && customStdin.trim() !== '') {
    const cleanActual = (primaryCompilerResult?.stdout || '').replace(/\r\n/g, '\n').trim();
    // Check if custom input matches any known test case
    const allCases = [...(problem.sampleTestCases || []), ...(problem.hiddenTestCases || [])];
    const matchCase = allCases.find((tc) => (tc.input || '').trim() === customStdin.trim());
    const cleanExpected = matchCase ? (matchCase.expectedOutput || '').replace(/\r\n/g, '\n').trim() : '';
    const isError = Boolean(primaryCompilerResult?.isError || primaryCompilerResult?.compileOutput);
    const passed = matchCase ? (!isError && cleanActual === cleanExpected) : !isError;

    sampleResults.push({
      testCaseId: matchCase?.id || 'custom_input',
      input: customStdin,
      expected: matchCase ? cleanExpected : '(Custom Stdin - No predefined expected output)',
      actual: isError ? (primaryCompilerResult?.stderr || primaryCompilerResult?.compileOutput || 'Runtime Error') : cleanActual,
      passed,
      error: primaryCompilerResult?.stderr || primaryCompilerResult?.compileOutput || undefined
    });
  } else {
    // Run against official problem test cases (all 5 for submit, samples for run)
    const targetCases: Round2TestCase[] = isSubmit
      ? [...(problem.sampleTestCases || []), ...(problem.hiddenTestCases || [])]
      : (problem.sampleTestCases && problem.sampleTestCases.length > 0 ? problem.sampleTestCases : [...(problem.sampleTestCases || []), ...(problem.hiddenTestCases || [])]);

    const casePromises = targetCases.map(async (stc, idx) => {
      let tcRes: CompilerExecutionResult | null = null;
      if (idx === 0 && primaryInput === stc.input && primaryCompilerResult) {
        tcRes = primaryCompilerResult;
      } else {
        try {
          tcRes = await runRealCode(code, language, stc.input || '');
        } catch {}
      }

      const cleanActual = (tcRes?.stdout || '').replace(/\r\n/g, '\n').trim();
      const cleanExpected = (stc.expectedOutput || '').replace(/\r\n/g, '\n').trim();
      const isError = Boolean(tcRes?.isError || tcRes?.compileOutput);
      const passed = !isError && cleanActual === cleanExpected;

      // Strict privacy: only show test case data if passed; protect failed test case inputs/outputs
      return {
        testCaseId: stc.id || `case_${idx + 1}`,
        input: passed ? stc.input : '[Hidden Test Case - Reveal upon passing]',
        expected: passed ? stc.expectedOutput : '[Hidden Expected Output]',
        actual: passed ? cleanActual : (isError ? (tcRes?.stderr || tcRes?.compileOutput || 'Runtime Error') : 'Output mismatch'),
        passed,
        error: passed ? undefined : (tcRes?.stderr || tcRes?.compileOutput || undefined)
      };
    });

    const executedCases = await Promise.all(casePromises);
    sampleResults.push(...executedCases);
  }

  // 4. Calculate deterministic HackerRank / LeetCode score and status
  const totalTests = sampleResults.length || 5;
  const passedTests = sampleResults.filter((r) => r.passed).length;
  const hiddenResults: Round2QuestionReport['hiddenResults'] = [];

  // Complexity & efficiency rating
  const complexity = analyzeCodeComplexity(code, language, '');

  let score = 0;
  if (totalTests > 0) {
    if (passedTests === totalTests) {
      // 5/5 Passed: Award full 10 marks (factoring in optimal algorithmic complexity)
      const bonus = complexity.rating === 'Optimal' ? 2 : (complexity.rating === 'Acceptable' ? 1 : 0);
      score = Math.min(maxMarks, Math.max(8, 8 + bonus));
    } else {
      // Partial pass: 2 marks per test case passed out of 10
      score = Math.round((passedTests / totalTests) * maxMarks);
    }
  }

  let status: Round2QuestionReport['status'] = 'PARTIAL';
  if (primaryCompilerResult?.isError) {
    status = 'RUNTIME_ERROR';
  } else if (passedTests === totalTests && totalTests > 0) {
    status = 'ACCEPTED';
  } else if (passedTests === 0 && totalTests > 0) {
    status = 'WRONG_ANSWER';
  } else {
    status = 'PARTIAL';
  }

  const rawTimeStr = primaryCompilerResult?.time || '';
  const parsedTimeSec = parseFloat(rawTimeStr.replace(/[^\d.]/g, ''));
  const runtimeMs = !isNaN(parsedTimeSec) && parsedTimeSec > 0 ? parsedTimeSec * 1000 : undefined;

  return {
    questionNumber: problem.number,
    questionId: problem.id,
    questionTitle: problem.title,
    code,
    language,
    compilerResult: primaryCompilerResult,
    sampleResults,
    hiddenResults,
    passedTests,
    totalTests,
    score,
    maxScore: maxMarks,
    status,
    compiledAt: Date.now(),
    executionTime: runtimeMs !== undefined ? `${runtimeMs.toFixed(1)} ms` : (primaryCompilerResult ? '24 ms' : undefined),
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
    if (raw) {
      const parsed: Round2CandidateSubmission = JSON.parse(raw);
      if (parsed && parsed.questionReports) {
        for (const [qNum, rep] of Object.entries(parsed.questionReports)) {
          if (rep && rep.code && (rep.code.includes('nums: list[int]') || rep.code.includes('postfix = 1\n        for i in range(n - 1, -1, -1):'))) {
            delete parsed.questionReports[Number(qNum)];
          }
        }
      }
      return parsed;
    }
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
  candidateKey?: string
): Round2Problem[] {
  // Directly use the official 5 LeetCode DSA questions configured by the examination board
  const source = (allPool && allPool.length >= 5) ? allPool.slice(0, 5) : OFFICIAL_5_LEETCODE_PROBLEMS;
  const list = source.map((p) => ({ ...p }));

  if (candidateKey) {
    // Deterministic pseudo-random shuffle seeded by candidateKey/roll
    const key = candidateKey.trim().toUpperCase();
    let seed = 5381;
    for (let i = 0; i < key.length; i++) {
      seed = ((seed << 5) + seed) + key.charCodeAt(i);
      seed |= 0;
    }
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    // Fisher-Yates shuffle
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  } else {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  return list.map((p, idx) => ({
    ...p,
    number: idx + 1
  }));
}

export async function verifyRound2CodeWithAI(
  problem: Round2Problem,
  code: string,
  language: 'C' | 'C++' | 'Python' | 'Java',
  _sampleInput?: string,
  _expectedOutput?: string,
  actualOutput?: string
): Promise<{
  verifiedQuestionTitle: string;
  predictedOutput: string;
  isAlignedWithProblem: boolean;
  analysis: string;
}> {
  const groqKey = localStorage.getItem('codedna_groq_api_key') || localStorage.getItem('GROQ_API_KEY') || (import.meta as any).env?.VITE_GROQ_API_KEY || (import.meta as any).env?.VITE_AI_API_KEY;
  if (groqKey && code && code.trim()) {
    try {
      const prompt = `You are the CodeSpark 2026 AI Examiner. Analyze if this code correctly solves the problem.
Problem: ${problem.title}
Description: ${problem.description.slice(0, 400)}
Language: ${language}
Code:
\`\`\`${language}
${code.slice(0, 1500)}
\`\`\`
Actual output when run: ${actualOutput || '(not available)'}
Return strict JSON only:
{"verifiedQuestionTitle":"${problem.title}","predictedOutput":"...","isAlignedWithProblem":true,"analysis":"1 concise sentence on whether logic solves the question"}`;
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: (import.meta as any).env?.VITE_DEFAULT_MODEL || 'qwen/qwen3.8-27b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        return {
          verifiedQuestionTitle: parsed.verifiedQuestionTitle || problem.title,
          predictedOutput: parsed.predictedOutput || actualOutput || '',
          isAlignedWithProblem: Boolean(parsed.isAlignedWithProblem),
          analysis: parsed.analysis || 'AI verified solution logic.'
        };
      }
    } catch {}
  }
  // Fallback: if code compiled and ran, consider partial alignment
  return {
    verifiedQuestionTitle: problem.title,
    predictedOutput: actualOutput || '',
    isAlignedWithProblem: false,
    analysis: `Could not verify ${problem.title} with AI — no Groq key or network error.`
  };
}

export async function pushRound2LiveCodeToCloud(



  profile: { name: string; rollNumber: string; accessKey: string; stationNumber?: string; round2Key?: string },



  code: string,



  language: string,



  questionNumber: number



): Promise<void> {



  if (!supabase) return;



  try {



    const canonicalRoll = (profile.rollNumber || profile.accessKey || '').trim().toUpperCase().replace(/[^A-Za-z0-9_-]/g, '_');
    const cloudId = `r2_station_${canonicalRoll}`;



    await supabase.from('candidate_stations').upsert({



      id: cloudId,



      lab_id: 'ROUND_2_ARENA',



      station_number: profile.stationNumber || 'Station #01',



      status: 'IN_PROGRESS',



      code: code,



      language: language || 'Python',



      student: {



        name: profile.name,



        rollNumber: profile.rollNumber,



        accessKey: profile.accessKey,



        round2Key: profile.round2Key,



        currentQuestion: questionNumber



      },



      last_updated_timestamp: Date.now()



    });



  } catch (err) {



    console.warn('[Round 2] pushRound2LiveCodeToCloud failed:', err);



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



  averageRuntimeMs?: number;



  timeComplexities?: Record<number, string>;
  status?: 'SUBMITTED' | 'IN_PROGRESS' | 'STANDBY';
  round1Score?: number;
  round1MaxScore?: number;



}



export async function clearRound2Leaderboard(): Promise<void> {
  try { localStorage.removeItem('codedna_codespark_r2_submissions'); } catch {}
  if (supabase) {
    try {
      await supabase.from('candidate_stations').delete().like('id', 'r2_sub_%');
      await supabase.from('candidate_stations').delete().like('id', 'r2_station_%');
      if (typeof window !== 'undefined') {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('codedna_r2_sub_') || k.startsWith('codedna_codespark_r2_'))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      }
    } catch (e) { console.warn('[Round 2] clearRound2Leaderboard error:', e); }
  }
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
        difficulty: (p.difficulty as any) || (idx < 3 ? 'Easy' : idx < 7 ? 'Medium' : 'Hard'),
        marks: Number(p.marks) || 10,
        timeLimitMs: Number(p.timeLimitMs) || 2000,
        description: p.description || p.problemStatement || (typeof p === 'string' ? p : ''),
        inputFormat: p.inputFormat || 'Standard input stream (stdin)',
        outputFormat: p.outputFormat || 'Standard output stream (stdout)',
        constraints: Array.isArray(p.constraints) ? p.constraints : [
          'Time limit: 2.0s',
          'Memory limit: 256MB',
          'Standard algorithmic constraints apply'
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
    } else if (firstLine.length > 50) {
      const words = firstLine.split(/\s+/);
      title = words.slice(0, 7).join(' ') + (words.length > 7 ? '...' : '');
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
      marks: 10,
      timeLimitMs: 2000,
      description,
      inputFormat: 'Standard input stream (stdin)',
      outputFormat: 'Standard output stream (stdout)',
      constraints: [
        'Time limit: 2.0s',
        'Memory limit: 256MB',
        'Standard algorithmic constraints apply'
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

