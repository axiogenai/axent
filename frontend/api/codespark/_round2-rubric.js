// Server-only scoring rubric. Samples never contribute to marks.
// Correctness is prioritized (80%), with efficiency (10%) and robustness (10%).
// If a problem does not define a category, its weight is redistributed to correctness.
export const ROUND2_RUBRIC = Object.freeze({
  correctness: 80,
  efficiency: 10,
  robustness: 10
});

export function parseRuntimeMs(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const number = Number.parseFloat(raw);
  if (!Number.isFinite(number)) return null;
  if (raw.endsWith("ms")) return number;
  if (raw.endsWith("s")) return number * 1000;
  return number;
}

export function scoreRound2Rubric({ maxScore, correctnessTests, robustnessTests = [], performanceTests = [] }) {
  const max = Math.max(0, Number(maxScore) || 0);
  const hasCorrectness = correctnessTests.length > 0;
  const hasRobustness = robustnessTests.length > 0;
  const hasEfficiency = performanceTests.length > 0;
  const activeWeight = ROUND2_RUBRIC.correctness +
    (hasRobustness ? ROUND2_RUBRIC.robustness : 0) +
    (hasEfficiency ? ROUND2_RUBRIC.efficiency : 0);
  const correctnessWeight = hasCorrectness ? ROUND2_RUBRIC.correctness : 0;
  const redistributed = ROUND2_RUBRIC.correctness + (hasCorrectness ? 0 : 0) +
    (!hasRobustness ? ROUND2_RUBRIC.robustness : 0) +
    (!hasEfficiency ? ROUND2_RUBRIC.efficiency : 0);
  const correctnessShare = hasCorrectness ? redistributed : 0;
  const categoryScore = (tests, passed, weight) => tests.length
    ? weight * tests.reduce((sum, test, index) => sum + (passed[index] ? (Number(test.weight) > 0 ? Number(test.weight) : 1) : 0), 0) /
      tests.reduce((sum, test) => sum + (Number(test.weight) > 0 ? Number(test.weight) : 1), 0)
    : 0;
  const correctnessPassed = correctnessTests.map(test => Boolean(test.passed));
  const robustnessPassed = robustnessTests.map(test => Boolean(test.passed));
  const efficiencyPassed = performanceTests.map(test => {
    const timeOk = Number.isFinite(Number(test.maxTimeMs)) && Number(test.runtimeMs) <= Number(test.maxTimeMs);
    const memoryOk = test.maxMemoryKb == null ||
      (Number.isFinite(Number(test.maxMemoryKb)) && Number(test.memoryKb) <= Number(test.maxMemoryKb));
    return Boolean(test.passed && timeOk && memoryOk);
  });
  const correctness = categoryScore(correctnessTests, correctnessPassed, hasCorrectness ? correctnessWeight : 0);
  const robustness = categoryScore(robustnessTests, robustnessPassed, hasRobustness ? ROUND2_RUBRIC.robustness : 0);
  const efficiency = categoryScore(performanceTests, efficiencyPassed, hasEfficiency ? ROUND2_RUBRIC.efficiency : 0);
  const earnedWeight = correctness + robustness + efficiency;
  const normalized = activeWeight > 0 ? earnedWeight / activeWeight : 0;
  const score = Math.round(max * normalized * 100) / 100;
  return {
    score,
    maxScore: max,
    rubric: {
      correctness: { weight: hasCorrectness ? correctnessWeight : 0, earned: Math.round(correctness * 100) / 100, passed: correctnessPassed.filter(Boolean).length, total: correctnessTests.length },
      efficiency: { weight: hasEfficiency ? ROUND2_RUBRIC.efficiency : 0, earned: Math.round(efficiency * 100) / 100, passed: efficiencyPassed.filter(Boolean).length, total: performanceTests.length },
      robustness: { weight: hasRobustness ? ROUND2_RUBRIC.robustness : 0, earned: Math.round(robustness * 100) / 100, passed: robustnessPassed.filter(Boolean).length, total: robustnessTests.length }
    },
    allPassed: [...correctnessPassed, ...robustnessPassed, ...efficiencyPassed].every(Boolean)
  };
}
