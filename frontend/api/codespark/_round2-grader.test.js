import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRound2TestCases } from "./_round2-grader.js";

const success = (stdout, extra = {}) => ({
  stdout,
  stderr: null,
  compileOutput: null,
  isError: false,
  time: null,
  memory: null,
  compilerElapsedMs: 18,
  ...extra
});

test("hidden test execution records input bytes and compiler response latency without inventing runtime or memory", async () => {
  const evaluated = await evaluateRound2TestCases({
    code: "print('ok')",
    language: "Python",
    deadlineAt: Date.now() + 5000,
    tests: [
      { id: "h1", category: "correctness", input: "1", expectedOutput: "ok" },
      { id: "p1", category: "performance", input: "large input", expectedOutput: "ok" }
    ],
    executeCode: async (_code, _language, stdin) => success(stdin === "1" ? "ok" : "ok")
  });

  assert.equal(evaluated.testResults.length, 2);
  assert.equal(evaluated.testResults[0].passed, true);
  assert.equal(evaluated.testResults[0].inputSizeBytes, 1);
  assert.equal(evaluated.testResults[0].runtimeMs, null);
  assert.equal(evaluated.testResults[0].memoryValue, null);
  assert.equal(evaluated.testResults[0].compilerElapsedMs, 18);
  assert.equal(evaluated.testResults[1].efficiencyPassed, true);
  assert.equal(evaluated.compileFailed, false);
  assert.equal(evaluated.runtimeFailed, false);
});

test("compiler infrastructure failures reject grading instead of becoming failed tests", async () => {
  const unavailable = new Error("Wandbox unavailable");
  unavailable.statusCode = 503;

  await assert.rejects(
    evaluateRound2TestCases({
      code: "print('ok')",
      language: "Python",
      deadlineAt: Date.now() + 5000,
      tests: [{ id: "h1", category: "correctness", input: "", expectedOutput: "ok" }],
      executeCode: async () => { throw unavailable; }
    }),
    (error) => error.statusCode === 503 && error.message === "Wandbox unavailable"
  );
});

test("candidate compile/runtime failures remain test failures, not infrastructure errors", async () => {
  const evaluated = await evaluateRound2TestCases({
    code: "invalid",
    language: "Python",
    deadlineAt: Date.now() + 5000,
    tests: [{ id: "h1", category: "correctness", input: "", expectedOutput: "ok" }],
    executeCode: async () => success("", {
      isError: true,
      compileError: true,
      compileOutput: "SyntaxError"
    })
  });

  assert.equal(evaluated.testResults[0].passed, false);
  assert.equal(evaluated.compileFailed, true);
});

test("a candidate's concurrent compiler requests are batched in groups of at most three", async () => {
  let active = 0;
  let maxActive = 0;
  const tests = Array.from({ length: 8 }, (_, index) => ({
    id: String(index),
    category: "correctness",
    input: String(index),
    expectedOutput: "ok"
  }));

  await evaluateRound2TestCases({
    code: "print('ok')",
    language: "Python",
    deadlineAt: Date.now() + 5000,
    tests,
    executeCode: async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return success("ok");
    }
  });

  assert.ok(maxActive <= 3);
  assert.equal(active, 0);
});
