import test from "node:test";
import assert from "node:assert/strict";
import { parseRuntimeMs, scoreRound2Rubric } from "./_round2-rubric.js";

test("runtime parsing normalizes seconds and milliseconds", () => {
  assert.equal(parseRuntimeMs("0.025s"), 25);
  assert.equal(parseRuntimeMs("25ms"), 25);
  assert.equal(parseRuntimeMs(""), null);
});

test("correctness receives the full score when no optional categories are configured", () => {
  const result = scoreRound2Rubric({
    maxScore: 20,
    correctnessTests: [{ passed: true }, { passed: true }]
  });
  assert.equal(result.score, 20);
  assert.equal(result.rubric.correctness.weight, 100);
  assert.equal(result.rubric.efficiency.weight, 0);
  assert.equal(result.rubric.robustness.weight, 0);
});

test("correctness is weighted 80/10/10 when all rubric categories exist", () => {
  const result = scoreRound2Rubric({
    maxScore: 20,
    correctnessTests: [{ passed: true }],
    performanceTests: [{ passed: true, runtimeMs: 10, maxTimeMs: 20, memoryKb: 20 }],
    robustnessTests: [{ passed: true }]
  });
  assert.equal(result.score, 20);
  assert.equal(result.rubric.correctness.weight, 80);
  assert.equal(result.rubric.efficiency.weight, 10);
  assert.equal(result.rubric.robustness.weight, 10);
});

test("missing runtime telemetry never earns efficiency marks", () => {
  const result = scoreRound2Rubric({
    maxScore: 100,
    correctnessTests: [{ passed: true }],
    performanceTests: [{ passed: true, runtimeMs: null, maxTimeMs: 100 }]
  });
  assert.equal(result.score, 90);
  assert.equal(result.rubric.efficiency.earned, 0);
  assert.equal(result.allPassed, false);
});

test("performance thresholds can fail efficiency while correctness remains credited", () => {
  const result = scoreRound2Rubric({
    maxScore: 50,
    correctnessTests: [{ passed: true }],
    performanceTests: [{ passed: true, runtimeMs: 120, maxTimeMs: 100, memoryKb: 50, maxMemoryKb: 100 }]
  });
  assert.equal(result.score, 45);
  assert.equal(result.rubric.correctness.earned, 90);
  assert.equal(result.rubric.efficiency.earned, 0);
});
