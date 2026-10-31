// Server-only scoring rubric. Sample tests never contribute to marks.
// Optional categories are redistributed to correctness when they are not configured.
export const ROUND2_RUBRIC = Object.freeze({
  correctness: 80,
  efficiency: 10,
  robustness: 10
});

export function parseRuntimeMs(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const raw = String(value).trim().toLowerCase();
  const number = Number.parseFloat(raw);
  if (!Number.isFinite(number) || number < 0) return null;
  if (raw.endsWith("ms")) return number;
  if (raw.endsWith("s")) return number * 1000;
  return number;
}

function weightedPassRate(tests, predicate = (test) => Boolean(test.passed)) {
  if (!tests.length) return 0;
  let totalWeight = 0;
  let earnedWeight = 0;
  for (const test of tests) {
    const configuredWeight = Number(test.weight);
    const weight = Number.isFinite(configuredWeight) && configuredWeight > 0 ? configuredWeight : 1;
    totalWeight += weight;
    if (predicate(test)) earnedWeight += weight;
  }
  return totalWeight > 0 ? earnedWeight / totalWeight : 0;
}

export function scoreRound2Rubric({ maxScore, correctnessTests = [], robustnessTests = [], performanceTests = [] }) {
  const max = Math.max(0, Number(maxScore) || 0);
  const hasCorrectness = correctnessTests.length > 0;
  const hasRobustness = robustnessTests.length > 0;
  const hasEfficiency = performanceTests.length > 0;

  const correctnessWeight = hasCorrectness
    ? ROUND2_RUBRIC.correctness +
      (!hasRobustness ? ROUND2_RUBRIC.robustness : 0) +
      (!hasEfficiency ? ROUND2_RUBRIC.efficiency : 0)
    : 0;

  const correctness = correctnessWeight * weightedPassRate(correctnessTests);
  const robustness = hasRobustness
    ? ROUND2_RUBRIC.robustness * weightedPassRate(robustnessTests)
    : 0;
  const efficiency = hasEfficiency
    ? ROUND2_RUBRIC.efficiency * weightedPassRate(performanceTests, (test) => {
        const runtime = test.runtimeMs == null ? null : Number(test.runtimeMs);
        const runtimeLimit = Number(test.maxTimeMs);
        const runtimeOk = runtime !== null && Number.isFinite(runtime) &&
          Number.isFinite(runtimeLimit) && runtime <= runtimeLimit;
        const memoryLimit = test.maxMemoryValue == null ? null : Number(test.maxMemoryValue);
        const memory = test.memoryValue == null ? null : Number(test.memoryValue);
        const memoryOk = memoryLimit === null ||
          (memory !== null && Number.isFinite(memory) && Number.isFinite(memoryLimit) && memory <= memoryLimit);
        return Boolean(test.passed && runtimeOk && memoryOk);
      })
    : 0;

  const score = Math.round((max * (correctness + robustness + efficiency) / 100) * 100) / 100;
  const allPassed = hasCorrectness &&
    correctnessTests.every((test) => Boolean(test.passed)) &&
    robustnessTests.every((test) => Boolean(test.passed)) &&
    performanceTests.every((test) => {
      const runtime = test.runtimeMs == null ? null : Number(test.runtimeMs);
      const limit = Number(test.maxTimeMs);
      const memoryLimit = test.maxMemoryValue == null ? null : Number(test.maxMemoryValue);
      const memory = test.memoryValue == null ? null : Number(test.memoryValue);
      return Boolean(test.passed && runtime !== null && Number.isFinite(runtime) &&
        Number.isFinite(limit) && runtime <= limit &&
        (memoryLimit === null || (memory !== null && Number.isFinite(memory) && memory <= memoryLimit)));
    });

  return {
    score,
    maxScore: max,
    rubric: {
      correctness: {
        weight: correctnessWeight,
        earned: Math.round(correctness * 100) / 100,
        passed: correctnessTests.filter((test) => Boolean(test.passed)).length,
        total: correctnessTests.length
      },
      efficiency: {
        weight: hasEfficiency ? ROUND2_RUBRIC.efficiency : 0,
        earned: Math.round(efficiency * 100) / 100,
        passed: performanceTests.filter((test) => {
          const runtime = test.runtimeMs == null ? null : Number(test.runtimeMs);
          const limit = Number(test.maxTimeMs);
          const memoryLimit = test.maxMemoryValue == null ? null : Number(test.maxMemoryValue);
          const memory = test.memoryValue == null ? null : Number(test.memoryValue);
          return Boolean(test.passed && runtime !== null && Number.isFinite(runtime) &&
            Number.isFinite(limit) && runtime <= limit &&
            (memoryLimit === null || (memory !== null && Number.isFinite(memory) && memory <= memoryLimit)));
        }).length,
        total: performanceTests.length
      },
      robustness: {
        weight: hasRobustness ? ROUND2_RUBRIC.robustness : 0,
        earned: Math.round(robustness * 100) / 100,
        passed: robustnessTests.filter((test) => Boolean(test.passed)).length,
        total: robustnessTests.length
      }
    },
    allPassed
  };
}
