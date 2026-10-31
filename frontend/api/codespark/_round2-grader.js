import { createHash, createHmac, randomUUID } from "node:crypto";
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
          if (!response.ok) throw new Error("Compiler registry is temporarily unavailable.");
          const entries = await response.json();
          if (!Array.isArray(entries)) throw new Error("Compiler registry returned an invalid response.");
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
  if (!matches.length) throw new Error("No supported Wandbox compiler is currently available for " + language + ".");

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

async function execute(code, language, stdin, candidateKey = "", problemId = "") {
  const runnerUrl = String(process.env.CODE_RUNNER_URL || "").replace(/\\/+$/, "");
  const runnerSecret = String(process.env.CODE_RUNNER_SECRET || "");
  if (runnerUrl && runnerSecret) {
    const encoded = Buffer.from(JSON.stringify({
      candidate_hash: createHash("sha256").update(normalizeRound2Key(candidateKey)).digest("hex"),
      problem_id: String(problemId),
      language,
      code_sha256: createHash("sha256").update(code).digest("hex"),
      exp: Math.floor(Date.now() / 1000) + 30,
      nonce: randomUUID()
    })).toString("base64url");
    const signature = createHmac("sha256", runnerSecret).update(encoded).digest("base64url");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(runnerUrl + "/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: encoded + "." + signature, code, language, stdin: String(stdin || "") }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.detail || payload.error || "The isolated judge is temporarily unavailable.");
        // A runner-side authentication, capacity, or host failure is never a candidate failure.
        error.statusCode = 503;
        throw error;
      }
      const runtimeMs = payload.runtimeMs == null ? null : Number(payload.runtimeMs);
      return {
        stdout: String(payload.stdout || ""),
        stderr: payload.stderr || null,
        compileOutput: payload.compileError ? String(payload.stderr || "Compilation failed.") : null,
        compileError: Boolean(payload.compileError),
        isError: Number(payload.exitCode) !== 0,
        exitCode: Number(payload.exitCode) || 0,
        time: runtimeMs == null ? "" : String(runtimeMs / 1000) + "s",
        memory: payload.memoryKb == null ? null : Number(payload.memoryKb),
        statusDescription: String(payload.statusDescription || "Completed"),
        engineUsed: "Axent Isolated Runner"
      };
    } finally {
      clearTimeout(timer);
    }
  }
  if (process.env.VERCEL_ENV === "production") {
    const error = new Error("The private Axent judge is not configured. Contact the exam administrator; no marks were changed.");
    error.statusCode = 503;
    throw error;
  }

  // Public Wandbox is retained only as a local/development fallback.
  const compiler = await getWandboxCompiler(language);
  const processedCode = language === "Java" ? code.replace(/\bpublic\s+class\b/g, "class ") : code;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch("https://wandbox.org/api/compile.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ compiler: compiler.name, code: processedCode, stdin: String(stdin || "") }),
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error("Compiler request failed (" + response.status + "). " + detail.slice(0, 300));
    }
    const result = await response.json();
    const status = Number.parseInt(result.status || "0", 10);
    const compilerError = String(result.compiler_error || "");
    const compilerOutput = String(result.compiler_output || "");
    const compileOutput = compilerError || (status !== 0 && !result.program_output ? compilerOutput : "");
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
      time: result.time ? (String(result.time).endsWith("s") ? String(result.time) : String(result.time) + "s") : "",
      memory: result.memory == null || result.memory === "" ? null : Number(result.memory),
      statusDescription,
      engineUsed: "Wandbox " + String(compiler.version || compiler.name)
    };
  } finally {
    clearTimeout(timer);
  }
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
  return execute(code, language, stdin, key, problemId);
}

export async function gradeRound2Code(keyInput, problemIdInput, codeInput, languageInput, allowLocked = false, customStdin = "") {
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
  const allTests = [...correctnessTests, ...robustnessTests, ...performanceTests];
  const maxScore = Number(problem.marks) || 20;

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
      !Object.prototype.hasOwnProperty.call(test, "expectedOutput"))) {
    const error = new Error("This question has incomplete hidden test configuration. Ask the exam administrator to fix it before submitting.");
    error.statusCode = 422; throw error;
  }
  if (performanceTests.some((test) => !Number.isFinite(Number(test.maxTimeMs)) ||
      Number(test.maxTimeMs) <= 0 ||
      (test.maxMemoryKb != null && (!Number.isFinite(Number(test.maxMemoryKb)) || Number(test.maxMemoryKb) <= 0)))) {
    const error = new Error("Performance tests require a positive maxTimeMs and, optionally, a positive maxMemoryKb threshold.");
    error.statusCode = 422; throw error;
  }

  let runResult = null;
  if (customStdin !== undefined && customStdin !== null && String(customStdin).length > 0) {
    runResult = await execute(code, language, String(customStdin), key, problemId);
  }

  const testResults = [];
  let compileFailed = false;
  let runtimeFailed = false;
  for (const [category, tests] of [
    ["correctness", correctnessTests],
    ["robustness", robustnessTests],
    ["performance", performanceTests]
  ]) {
    for (const test of tests) {
      // Infrastructure failures throw from execute and abort grading. They are
      // deliberately not converted into failed tests or zero marks.
      const result = await execute(code, language, String(test.input || ""), key, problemId);
      if (!runResult) runResult = result;
      const runtimeMs = parseRuntimeMs(result.time);
      const memoryKb = Number.isFinite(Number(result.memory)) ? Number(result.memory) : null;
      const passed = !result.isError &&
        normalizeOutput(result.stdout) === normalizeOutput(test.expectedOutput);
      if (result.compileOutput) compileFailed = true;
      else if (result.isError) runtimeFailed = true;
      testResults.push({
        testCaseId: String(test.id || ""),
        category,
        passed,
        runtimeMs,
        memoryKb,
        inputSize: Number(test.inputSize ?? test.size) || String(test.input || "").length,
        ...(category === "performance" ? {
          maxTimeMs: Number(test.maxTimeMs),
          maxMemoryKb: test.maxMemoryKb == null ? null : Number(test.maxMemoryKb)
        } : {}),
        error: result.compileOutput || result.stderr || undefined
      });
    }
  }

  const byCategory = (category) => testResults.filter((item) => item.category === category);
  const correctnessResults = byCategory("correctness");
  const robustnessResults = byCategory("robustness");
  const performanceResults = byCategory("performance");
  const rubric = scoreRound2Rubric({
    maxScore,
    correctnessTests: correctnessResults,
    robustnessTests: robustnessResults,
    performanceTests: performanceResults
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
