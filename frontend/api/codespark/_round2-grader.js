import { getCodeSparkRosterConfig, supabaseRest } from "./_security.js";

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

async function execute(code, language, stdin) {
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
      time: result.time ? String(result.time).endsWith("s") ? String(result.time) : String(result.time) + "s" : "0.00s",
      memory: Number(result.memory) || 0,
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
  return execute(code, language, stdin);
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

  const tests = [
    ...(Array.isArray(problem.sampleTestCases) ? problem.sampleTestCases.map((test) => ({ ...test, hidden: false })) : []),
    ...(Array.isArray(problem.hiddenTestCases) ? problem.hiddenTestCases.map((test) => ({ ...test, hidden: true })) : [])
  ];
  if (tests.length > 230) { const error = new Error("Too many test cases for evaluation."); error.statusCode = 422; throw error; }
  const maxScore = Number(problem.marks) || 20;

  if (!code.trim()) {
    const sampleResults = tests.filter((test) => !test.hidden).map((test) => ({
      testCaseId: String(test.id || ""), input: String(test.input || ""),
      expected: String(test.expectedOutput || ""), actual: "", passed: false
    }));
    const hiddenResults = tests.filter((test) => test.hidden).map((test) => ({
      testCaseId: String(test.id || ""), passed: false
    }));
    return { questionId: problem.id, sampleResults, hiddenResults, passedTests: 0, totalTests: tests.length || 1, score: 0, maxScore, status: "PENDING", runResult: null };
  }

  let runResult = null;
  if (customStdin !== undefined && customStdin !== null && String(customStdin).length > 0) {
    runResult = await execute(code, language, String(customStdin));
  }

  if (!tests.length) {
    const error = new Error("This problem is not configured for automatic grading: no sample or hidden test cases are available.");
    error.statusCode = 422;
    throw error;
  }

  const hiddenTests = tests.filter((test) => test.hidden);
  if (!hiddenTests.length) {
    const error = new Error("This question needs at least one hidden test case before it can be graded. Ask the exam administrator to complete its test data.");
    error.statusCode = 422;
    throw error;
  }
  if (tests.some((test) => !test || typeof test !== "object" ||
      !Object.prototype.hasOwnProperty.call(test, "expectedOutput"))) {
    const error = new Error("This question has incomplete test-case configuration. Ask the exam administrator to fix it before submitting.");
    error.statusCode = 422;
    throw error;
  }

  const sampleResults = [];
  const hiddenResults = [];
  let passed = 0;
  let hiddenPassed = 0;
  let hiddenTotalWeight = 0;
  let hiddenPassedWeight = 0;
  let compileFailed = false;
  let runtimeFailed = false;
  for (const test of tests) {
    const result = await execute(code, language, String(test.input || ""));
    if (!runResult) runResult = result;
    const success = !result.isError && normalizeOutput(result.stdout) === normalizeOutput(test.expectedOutput);
    if (success) passed++;
    if (result.compileOutput) compileFailed = true;
    else if (result.isError) runtimeFailed = true;
    if (test.hidden) {
      const configuredWeight = Number(test.weight);
      const weight = Number.isFinite(configuredWeight) && configuredWeight > 0 ? configuredWeight : 1;
      hiddenTotalWeight += weight;
      if (success) {
        hiddenPassed++;
        hiddenPassedWeight += weight;
      }
      hiddenResults.push({ testCaseId: String(test.id || ""), passed: success });
    } else sampleResults.push({
      testCaseId: String(test.id || ""), input: String(test.input || ""),
      expected: String(test.expectedOutput ?? ""), actual: result.stdout,
      passed: success, error: result.compileOutput || result.stderr || undefined
    });
  }
  const total = tests.length;
  // Visible examples are feedback only; marks come from hidden tests.
  const score = hiddenTotalWeight > 0 ? Math.round(maxScore * hiddenPassedWeight / hiddenTotalWeight) : 0;
  const status = compileFailed ? "COMPILE_ERROR" : runtimeFailed && passed === 0 ? "RUNTIME_ERROR" : hiddenPassed === hiddenTests.length ? "ACCEPTED" : "PARTIAL";
  return {
    questionId: problem.id, sampleResults, hiddenResults,
    passedTests: passed, totalTests: total,
    hiddenPassedTests: hiddenPassed, hiddenTotalTests: hiddenTests.length,
    score, maxScore, status, runResult
  };
}
