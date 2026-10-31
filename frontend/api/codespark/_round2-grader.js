import { getCodeSparkRosterConfig, supabaseRest } from "./_security.js";
import { parseRuntimeMs, scoreRound2Rubric } from "./_round2-rubric.js";

const LANGUAGE_ALIASES = {
  Python: ["python"],
  C: ["c"],
  "C++": ["c++", "cpp"],
  Java: ["java"]
};
export const normalizeRound2Key = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "").replace(/^(AXENT-R2-|AXENT-|R2-)/, "");
const normalizeOutput = (value) => String(value ?? "").replace(/\r\n/g, "\n").trim();

const MAX_WANDBOX_CONCURRENCY = 4;
let activeWandboxRequests = 0;
const wandboxWaiters = [];

function acquireWandboxSlot(deadlineAt) {
  if (activeWandboxRequests < MAX_WANDBOX_CONCURRENCY) {
    activeWandboxRequests += 1;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const waiter = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const remaining = Math.max(0, deadlineAt - Date.now());
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const index = wandboxWaiters.indexOf(waiter);
      if (index >= 0) wandboxWaiters.splice(index, 1);
      const error = new Error("The compiler is busy. Your code has been saved; retry grading.");
      error.statusCode = 503;
      reject(error);
    }, remaining);
    wandboxWaiters.push(waiter);
  });
}

function releaseWandboxSlot() {
  const next = wandboxWaiters.shift();
  if (next) next();
  else activeWandboxRequests = Math.max(0, activeWandboxRequests - 1);
}

export async function withWandboxSlot(task, deadlineAt = Date.now() + 15000) {
  await acquireWandboxSlot(deadlineAt);
  try {
    return await task();
  } finally {
    releaseWandboxSlot();
  }
}


let compilerListCache = null;
let compilerListFetchedAt = 0;
let compilerListRequest = null;

function compareVersions(left, right) {
  const a = String(left || "").match(/\d+/g)?.map(Number) || [];
  const b = String(right || "").match(/\d+/g)?.map(Number) || [];
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

async function getWandboxCompiler(language) {
  const aliases = LANGUAGE_ALIASES[language];
  if (!aliases) throw new Error("Unsupported language.");

  if (!compilerListCache || Date.now() - compilerListFetchedAt > 5 * 60 * 1000) {
    if (!compilerListRequest) {
      compilerListRequest = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        try {
          const response = await fetch("https://wandbox.org/api/list.json", { signal: controller.signal });
          if (!response.ok) { const error = new Error("Compiler registry is temporarily unavailable."); error.statusCode = 503; throw error; }
          const entries = await response.json();
          if (!Array.isArray(entries)) { const error = new Error("Compiler registry returned an invalid response."); error.statusCode = 503; throw error; }
          compilerListCache = entries;
          compilerListFetchedAt = Date.now();
        } finally {
          clearTimeout(timer);
          compilerListRequest = null;
        }
      })();
    }
    await compilerListRequest;
  }

  const matches = compilerListCache.filter((entry) =>
    aliases.includes(String(entry.language || "").trim().toLowerCase()) &&
    typeof entry.name === "string" &&
    entry.name.length > 0
  );
  if (!matches.length) { const error = new Error("No supported Wandbox compiler is currently available for " + language + "."); error.statusCode = 503; throw error; }

  matches.sort((left, right) => {
    const leftExperimental = /head|experimental|nightly|trunk/i.test(String(left.name) + " " + String(left.version));
    const rightExperimental = /head|experimental|nightly|trunk/i.test(String(right.name) + " " + String(right.version));
    if (leftExperimental !== rightExperimental) return leftExperimental ? 1 : -1;
    return compareVersions(right.version, left.version);
  });
  return matches[0];
}

export function findCandidateInRoster(roster, rawKey) {
  if (!rawKey) return null;
  const clean = String(rawKey || "").trim().toUpperCase();
  const normalized = normalizeRound2Key(clean);
  return roster?.candidates?.find((item) => {
    const r2 = item.round2Key ? normalizeRound2Key(item.round2Key) : "";
    const rawR2 = String(item.round2Key || "").trim().toUpperCase();
    const roll = String(item.rollNumber || "").trim().toUpperCase();
    const acc = String(item.accessKey || "").trim().toUpperCase();
    const email = String(item.email || "").trim().toUpperCase();
    return (
      (r2 && (r2 === normalized || r2 === clean || rawR2 === clean)) ||
      (roll && (roll === clean || roll === normalized)) ||
      (acc && (acc === clean || acc === normalized)) ||
      (email && email === clean)
    );
  }) || null;
}

function assignedProblems(pool, key) {
  if (!Array.isArray(pool) || !pool.length) return [];
  if (pool.length <= 5) return pool;
  let seed = 0;
  for (const character of String(key).toUpperCase()) seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
  const list = [...pool];
  let current = seed || 12345;
  for (let i = list.length - 1; i > 0; i--) {
    current = (current * 9301 + 49297) % 233280;
    const j = Math.floor((current / 233280) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, 5);
}

async function execute(code, language, stdin, deadlineAt = Date.now() + 15000) {
  const compiler = await getWandboxCompiler(language);
  const processedCode = language === "Java" ? code.replace(/\bpublic\s+class\b/g, "class ") : code;
  return withWandboxSlot(async () => {
  const compilerRequestStartedAt = Date.now();
  const controller = new AbortController();
  const requestTimeoutMs = Math.min(15000, Math.max(1, deadlineAt - Date.now()));
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch("https://wandbox.org/api/compile.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ compiler: compiler.name, code: processedCode, stdin: String(stdin || "") }),
      signal: controller.signal
    });
    if (!response.ok) {
      const error = new Error("The existing Wandbox compiler is temporarily unavailable (HTTP " + response.status + ").");
      error.statusCode = 503;
      throw error;
    }
    const result = await response.json();
    if (!result || typeof result !== "object" || result.status === undefined || result.status === null) {
      const error = new Error("The compiler returned an invalid execution response.");
      error.statusCode = 503;
      throw error;
    }
    const status = Number.parseInt(String(result.status), 10);
    if (!Number.isFinite(status)) {
      const error = new Error("The compiler returned an invalid execution status.");
      error.statusCode = 503;
      throw error;
    }
    const compilerError = String(result.compiler_error || "");
    const compilerOutput = String(result.compiler_output || "");
    const compileOutput = status !== 0 ? (compilerError || compilerOutput || "Compilation or execution failed.") : "";
    const stderr = String(result.program_error || "");
    const isError = status !== 0 || Boolean(compileOutput);
    const statusDescription = compileOutput
      ? "Compilation Error"
      : status !== 0
        ? "Runtime Error"
        : "Accepted";
    return {
      stdout: String(result.program_output || ""),
      stderr: stderr || null,
      compileOutput: compileOutput || null,
      compileError: Boolean(compileOutput),
      isError,
      exitCode: Number.isFinite(status) ? status : (isError ? 1 : 0),
      // Preserve missing telemetry as null; never manufacture a zero measurement.
      time: result.time === undefined || result.time === null || result.time === ""
        ? null
        : (String(result.time).endsWith("s") || String(result.time).endsWith("ms") ? String(result.time) : String(result.time) + "s"),
      memory: result.memory === undefined || result.memory === null || result.memory === "" || !Number.isFinite(Number(result.memory))
        ? null
        : Number(result.memory),
      statusDescription,
      // This is the HTTP round-trip time, not the program's CPU/runtime.
      compilerElapsedMs: Date.now() - compilerRequestStartedAt,
      engineUsed: "Wandbox " + String(compiler.version || compiler.name)
    };
  } finally {
    clearTimeout(timer);
  }
  }, deadlineAt);
}

export async function getRound2AssignedProblems(keyInput, allowLocked = false) {
  const rawKey = String(keyInput || "").trim().toUpperCase();
  if (rawKey.length < 3) {
    const error = new Error("This Round 2 key is invalid."); error.statusCode = 403; throw error;
  }
  const roster = await getCodeSparkRosterConfig();
  const candidate = findCandidateInRoster(roster, rawKey);
  if (!candidate) {
    const error = new Error("A valid shortlisted Round 2 key is required."); error.statusCode = 403; throw error;
  }
  const roll = String(candidate.rollNumber || candidate.email || candidate.name || "candidate").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "_").slice(0, 80);
  const proctorRows = await supabaseRest("candidate_stations?id=eq.r2_station_" + roll + "&select=student");
  if (!allowLocked && proctorRows?.[0]?.student?.proctorLocked === true) {
    const error = new Error("This Round 2 workstation is locked after three proctoring violations. Contact the invigilator.");
    error.statusCode = 423;
    throw error;
  }
  const problemRows = await supabaseRest("candidate_stations?id=eq.codespark_round2_questions&select=code,student");
  const problemConfig = problemRows?.[0]?.student && typeof problemRows[0].student === "object"
    ? problemRows[0].student
    : (() => { try { return JSON.parse(problemRows?.[0]?.code || "{}"); } catch { return {}; } })();
  const pool = Array.isArray(problemConfig.problems) ? problemConfig.problems : [];
  // Match the browser assignment seed exactly: use the full presented key, not a potentially stale roster field.
  return { candidate, problems: assignedProblems(pool, rawKey) };
}

export async function runRound2Code(keyInput, problemIdInput, codeInput, languageInput, stdinInput = "", allowLocked = false) {
  const key = String(keyInput || "").trim().toUpperCase();
  const code = String(codeInput || "");
  const language = String(languageInput || "");
  const problemId = String(problemIdInput || "");
  const stdin = String(stdinInput ?? "");
  if (key.length < 3 || code.length > 100000 || stdin.length > 20000 ||
      !LANGUAGE_ALIASES[language] || !problemId) {
    const error = new Error("Invalid compiler request."); error.statusCode = 400; throw error;
  }
  const { problems } = await getRound2AssignedProblems(key, allowLocked);
  if (!problems.some((problem) => String(problem.id) === problemId)) {
    const error = new Error("This problem is not assigned to this candidate."); error.statusCode = 403; throw error;
  }
  return execute(code, language, stdin, Date.now() + 15000);
}

export async function evaluateRound2TestCases({
  code,
  language,
  tests,
  deadlineAt = Date.now() + 50000,
  executeCode = execute
}) {
  const testResults = [];
  let runResult = null;
  let compileFailed = false;
  let runtimeFailed = false;

  // Three requests per batch bounds pressure on the existing shared compiler.
  for (let offset = 0; offset < tests.length; offset += 3) {
    if (Date.now() + 1000 >= deadlineAt) {
      const error = new Error("Grading exceeded its safe execution window. Your code has been saved; retry grading.");
      error.statusCode = 503;
      throw error;
    }
    const batch = tests.slice(offset, offset + 3);
    const batchResults = await Promise.all(batch.map(async (test) => {
      const result = await executeCode(code, language, String(test.input ?? ""), deadlineAt);
      const runtimeMs = parseRuntimeMs(result.time);
      const memoryValue = result.memory == null ? null : Number(result.memory);
      const outputPassed = !result.isError &&
        normalizeOutput(result.stdout) === normalizeOutput(test.expectedOutput);
      // Large-input benchmark success is the available efficiency signal with Wandbox.
      // compilerElapsedMs is diagnostic only; it includes network/queue time.
      const efficiencyPassed = test.category !== "performance" ? undefined : outputPassed;
      return {
        testCaseId: String(test.id || ""),
        category: test.category,
        passed: outputPassed,
        ...(test.category === "performance" ? {
          efficiencyPassed,
          runtimeMs,
          memoryValue,
          compilerElapsedMs: result.compilerElapsedMs ?? null
        } : {
          runtimeMs,
          memoryValue,
          compilerElapsedMs: result.compilerElapsedMs ?? null
        }),
        inputSizeBytes: Buffer.byteLength(String(test.input ?? ""), "utf8"),
        error: result.compileOutput || result.stderr || undefined,
        _runResult: result
      };
    }));

    for (const item of batchResults) {
      if (!runResult) runResult = item._runResult;
      if (item._runResult.compileOutput) compileFailed = true;
      else if (item._runResult.isError) runtimeFailed = true;
      const { _runResult, ...safeResult } = item;
      testResults.push(safeResult);
    }
  }

  return { testResults, runResult, compileFailed, runtimeFailed };
}

export async function gradeRound2Code(
  keyInput,
  problemIdInput,
  codeInput,
  languageInput,
  allowLocked = false,
  customStdin = "",
  deadlineAt = Date.now() + 50000
) {
  const key = String(keyInput || "").trim().toUpperCase();
  const code = String(codeInput || "");
  const language = String(languageInput || "");
  const problemId = String(problemIdInput || "");
  if (key.length < 3 || code.length > 100000 || !LANGUAGE_ALIASES[language] || !problemId) {
    const error = new Error("Invalid code evaluation request."); error.statusCode = 400; throw error;
  }
  const { problems } = await getRound2AssignedProblems(key, allowLocked);
  const problem = problems.find((item) => String(item.id) === problemId);
  if (!problem) { const error = new Error("This problem is not assigned to this candidate."); error.statusCode = 403; throw error; }

  // Only server-side hidden suites contribute to grading. Samples are never executed here.
  const hidden = Array.isArray(problem.hiddenTestCases) ? problem.hiddenTestCases : [];
  const performance = Array.isArray(problem.performanceTestCases) ? problem.performanceTestCases : [];
  const robustness = Array.isArray(problem.robustnessTestCases) ? problem.robustnessTestCases : [];
  const categorized = hidden.map((test) => ({
    ...test,
    category: String(test.category || (test.isPerformance ? "performance" : test.isRobustness ? "robustness" : "correctness")).toLowerCase()
  }));
  const correctnessTests = categorized.filter((test) => !["performance", "robustness"].includes(test.category));
  const robustnessTests = [
    ...robustness,
    ...categorized.filter((test) => test.category === "robustness")
  ];
  const performanceTests = [
    ...performance,
    ...categorized.filter((test) => test.category === "performance")
  ];
  const allTests = [
    ...correctnessTests.map((test) => ({ ...test, category: "correctness" })),
    ...robustnessTests.map((test) => ({ ...test, category: "robustness" })),
    ...performanceTests.map((test) => ({ ...test, category: "performance" }))
  ];
  const maxScore = Number(problem.marks) > 0 ? Number(problem.marks) : 20;

  if (!code.trim()) {
    return {
      questionId: problem.id, sampleResults: [], hiddenResults: [],
      passedTests: 0, totalTests: allTests.length, score: 0, maxScore,
      status: "PENDING", runResult: null, testResults: [], rubric: null
    };
  }
  if (!allTests.length) {
    const error = new Error("This question has no hidden grading tests configured. Ask the exam administrator to complete its test data.");
    error.statusCode = 422; throw error;
  }
  if (!correctnessTests.length) {
    const error = new Error("This question needs at least one hidden correctness test before it can be graded.");
    error.statusCode = 422; throw error;
  }
  if (allTests.length > 230) {
    const error = new Error("Too many test cases for evaluation."); error.statusCode = 422; throw error;
  }
  if (allTests.some((test) => !test || typeof test !== "object" ||
      !Object.prototype.hasOwnProperty.call(test, "input") ||
      !Object.prototype.hasOwnProperty.call(test, "expectedOutput"))) {
    const error = new Error("This question has incomplete hidden test configuration. Ask the exam administrator to fix it before submitting.");
    error.statusCode = 422; throw error;
  }
  // Wandbox does not expose per-program runtime or memory in its compile JSON schema.
  // Performance cases therefore act as large-input scalability checks, not millisecond/memory gates.

  let runResult = null;
  if (customStdin !== undefined && customStdin !== null && String(customStdin).length > 0) {
    runResult = await execute(code, language, String(customStdin), deadlineAt);
  }

  const evaluated = await evaluateRound2TestCases({
    code,
    language,
    tests: allTests,
    deadlineAt
  });
  if (!runResult) runResult = evaluated.runResult;
  const { testResults, compileFailed, runtimeFailed } = evaluated;

  const byCategory = (category) => testResults.filter((item) => item.category === category);
  const rubric = scoreRound2Rubric({
    maxScore,
    correctnessTests: byCategory("correctness"),
    robustnessTests: byCategory("robustness"),
    performanceTests: byCategory("performance")
  });
  const passedTests = testResults.filter((item) => item.passed).length;
  const status = compileFailed ? "COMPILE_ERROR"
    : runtimeFailed && passedTests === 0 ? "RUNTIME_ERROR"
    : rubric.allPassed ? "ACCEPTED" : "PARTIAL";

  return {
    questionId: problem.id,
    sampleResults: [],
    hiddenResults: testResults.map(({ testCaseId, passed }) => ({ testCaseId, passed })),
    testResults,
    passedTests,
    totalTests: testResults.length,
    score: rubric.score,
    maxScore,
    rubric: rubric.rubric,
    status,
    runResult
  };
}
