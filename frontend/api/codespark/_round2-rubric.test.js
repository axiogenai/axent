import test from "node:test";
import assert from "node:assert/strict";
import { parseRuntimeMs, scoreRound2Rubric } from "./_round2-rubric.js";

test("runtime parsing preserves real seconds and milliseconds and missing values", () => {
  assert.equal(parseRuntimeMs("0.025s"), 25);
  assert.equal(parseRuntimeMs("25ms"), 25);
  assert.equal(parseRuntimeMs(""), null);
  assert.equal(parseRuntimeMs(null), null);
  assert.equal(parseRuntimeMs("not-a-number"), null);
});

test("correctness receives all marks when optional categories are absent", () => {
  const result = scoreRound2Rubric({
    maxScore: 20,
    correctnessTests: [{ passed: true }, { passed: true }]
  });
  assert.equal(result.score, 20);
  assert.equal(result.rubric.correctness.weight, 100);
  assert.equal(result.rubric.efficiency.weight, 0);
  assert.equal(result.rubric.robustness.weight, 0);
});

test("rubric applies correctness, efficiency and robustness weights", () => {
  const result = scoreRound2Rubric({
    maxScore: 100,
    correctnessTests: [{ passed: true }],
    performanceTests: [{ passed: true, runtimeMs: 10, maxTimeMs: 20 }],
    robustnessTests: [{ passed: true }]
  });
  assert.equal(result.score, 100);
  assert.equal(result.rubric.correctness.weight, 80);
  assert.equal(result.rubric.efficiency.weight, 10);
  assert.equal(result.rubric.robustness.weight, 10);
});

test("large-input benchmark cases can earn efficiency marks without fabricated runtime telemetry", () => {
  const result = scoreRound2Rubric({
    maxScore: 100,
    correctnessTests: [{ passed: true }],
    performanceTests: [{ passed: true, runtimeMs: null, compilerElapsedMs: 240, memoryValue: null }]
  });
  assert.equal(result.score, 100);
  assert.equal(result.rubric.efficiency.earned, 10);
  assert.equal(result.allPassed, true);
});

test("failed large-input benchmark removes efficiency credit but preserves correctness credit", () => {
  const result = scoreRound2Rubric({
    maxScore: 50,
    correctnessTests: [{ passed: true }],
    performanceTests: [{ passed: false, runtimeMs: null, compilerElapsedMs: 250, memoryValue: null }]
  });
  assert.equal(result.score, 45);
  assert.equal(result.rubric.correctness.earned, 90);
  assert.equal(result.rubric.efficiency.earned, 0);
});

test("missing memory is not represented as a fabricated zero", () => {
  const result = scoreRound2Rubric({
    maxScore: 100,
    correctnessTests: [{ passed: true }],
    performanceTests: [{ passed: true, runtimeMs: null, compilerElapsedMs: 250, memoryValue: null }]
  });
  assert.equal(result.score, 100);
  assert.equal(result.rubric.efficiency.earned, 10);
});

test("test weights are respected within a rubric category", () => {
  const result = scoreRound2Rubric({
    maxScore: 100,
    correctnessTests: [{ passed: true, weight: 3 }, { passed: false, weight: 1 }]
  });
  assert.equal(result.score, 75);
});
