// ============================================================================
// MCQ RANDOMIZER — Fisher-Yates server-side shuffle
// Never sorts by random comparator. Never exposes seed. Never re-shuffles on reload.
// ============================================================================

/**
 * Cryptographically-seeded Fisher-Yates shuffle.
 * Returns a NEW shuffled array, does not mutate input.
 */
function secureRandomInt(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x1_0000_0000) {
    throw new RangeError('maxExclusive must be a positive integer within the uint32 range.');
  }
  const uint32Range = 0x1_0000_0000;
  const limit = Math.floor(uint32Range / maxExclusive) * maxExclusive;
  const sample = new Uint32Array(1);
  do { crypto.getRandomValues(sample); } while (sample[0] >= limit);
  return sample[0] % maxExclusive;
}

export function fisherYatesShuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Deterministic shuffle using a numeric seed (for replay / restore).
 * Uses a simple LCG PRNG — good enough for re-ordering, NOT for security.
 * The actual assignment is stored in localStorage; this is only for unit-testing.
 */
export function seededShuffle<T>(array: T[], seed: number): T[] {
  const arr = [...array];
  let s = seed >>> 0;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate a per-attempt assignment.
 * - Selects questions (already provided as questionIds from the exam).
 * - Applies Fisher-Yates to question order (if shuffle enabled).
 * - Applies Fisher-Yates to each question's option order independently.
 * - Returns assignment data to be persisted — never re-generated on reload.
 */
export interface ShuffleResult {
  orderedQuestionIds: string[];
  optionOrderMap: Record<string, string[]>; // questionId → shuffled option IDs
}

export function generateAttemptAssignment(
  questionIds: string[],
  optionIdsByQuestion: Record<string, string[]>, // questionId → original option IDs
  shuffleQuestions: boolean,
  shuffleOptions: boolean
): ShuffleResult {
  const orderedQuestionIds = shuffleQuestions
    ? fisherYatesShuffle(questionIds)
    : [...questionIds];

  const optionOrderMap: Record<string, string[]> = {};
  for (const qid of orderedQuestionIds) {
    const optIds = optionIdsByQuestion[qid] ?? [];
    optionOrderMap[qid] = shuffleOptions ? fisherYatesShuffle(optIds) : [...optIds];
  }

  return { orderedQuestionIds, optionOrderMap };
}
