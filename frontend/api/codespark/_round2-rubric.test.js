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

test("missing runtime telemetry cannot earn efficiency marks", () => {
  const result = scoreRound2Rubric({
    maxScore: 100,
    correctnessTests: [{ passed: true }],
    performanceTests: [{ passed: true, runtimeMs: null, maxTimeMs: 100 }]
  });
  assert.equal(result.score, 90);
  assert.equal(result.rubric.efficiency.earned, 0);
  assert.equal(result.allPassed, false);
});

test("performance thresholds fail efficiency without removing correctness credit", () => {
  const result = scoreRound2Rubric({
    maxScore: 50,
    correctnessTests: [{ passed: true }],
    performanceTests: [{ passed: true, runtimeMs: 120, maxTimeMs: 100 }]
  });
  assert.equal(result.score, 45);
  assert.equal(result.rubric.correctness.earned, 90);
  assert.equal(result.rubric.efficiency.earned, 0);
});

test("optional memory threshold is checked only against a measured compiler value", () => {
  const result = scoreRound2Rubric({
    maxScore: 100,
    correctnessTests: [{ passed: true }],
    performanceTests: [{ passed: true, runtimeMs: 10, maxTimeMs: 20, memoryValue: null, maxMemoryValue: 50 }]
  });
  assert.equal(result.score, 90);
  assert.equal(result.rubric.efficiency.earned, 0);
});

test("test weights are respected within a rubric category", () => {
  const result = scoreRound2Rubric({
    maxScore: 100,
    correctnessTests: [{ passed: true, weight: 3 }, { passed: false, weight: 1 }]
  });
  assert.equal(result.score, 75);
});
