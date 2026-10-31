# CodeSpark Round 2 grading configuration

Round 2 test data is stored in the protected server-side problem configuration. Candidate problem responses contain the statement and starter code only; sample, hidden, performance and robustness inputs/expected outputs are stripped from candidate responses.

## Rubric

The default rubric is:

| Category | Weight | What is measured |
| --- | ---: | --- |
| Correctness | 80% | Exact normalized stdout match for hidden correctness cases |
| Efficiency | 10% | Runtime and optional peak-memory thresholds for performance cases |
| Robustness | 10% | Exact output match for robustness cases |

If a problem does not define performance or robustness cases, that unused category's weight is added to correctness. Sample cases never contribute marks. Test-level `weight` values distribute points within their category.

## Problem JSON

A problem can define these arrays:

- `sampleTestCases`: optional author examples; never scored and never returned to candidates.
- `hiddenTestCases`: required hidden correctness cases. A case may set `category: "robustness"` or `category: "performance"` instead of being a correctness case.
- `performanceTestCases`: optional benchmark cases. Each must include `input`, `expectedOutput`, and a positive `maxTimeMs`. `maxMemoryKb` is optional.
- `robustnessTestCases`: optional edge-case and adversarial-input cases.

Example:

```json
{
  "id": "r2-array-scale",
  "number": 1,
  "title": "Large Array Aggregation",
  "marks": 20,
  "timeLimitMs": 2000,
  "description": "Read N integers and print their sum.",
  "inputFormat": "N followed by N integers",
  "outputFormat": "One integer",
  "constraints": ["1 <= N <= 100000"],
  "sampleTestCases": [
    { "id": "sample-1", "input": "3\n1 2 3", "expectedOutput": "6" }
  ],
  "hiddenTestCases": [
    { "id": "hidden-small", "input": "4\n2 3 4 5", "expectedOutput": "14", "weight": 1 },
    { "id": "hidden-negative", "input": "3\n-2 5 -1", "expectedOutput": "2", "weight": 1 }
  ],
  "performanceTestCases": [
    {
      "id": "perf-1k",
      "input": "1000\n...",
      "expectedOutput": "1000",
      "inputSize": 1000,
      "maxTimeMs": 250,
      "maxMemoryKb": 32768
    },
    {
      "id": "perf-100k",
      "input": "100000\n...",
      "expectedOutput": "100000",
      "inputSize": 100000,
      "maxTimeMs": 1000,
      "maxMemoryKb": 65536
    }
  ],
  "robustnessTestCases": [
    { "id": "robust-empty", "input": "0\n", "expectedOutput": "0" }
  ]
}
```

The abbreviated `...` values above are illustrative placeholders, not valid benchmark input. Replace them with complete input data before publishing.

## Judge telemetry and failure handling

Each executed hidden case records its category, pass/fail result, runtime in milliseconds, peak resident memory in KiB, and configured input size. The admin dossier shows these measurements and the category score breakdown. Candidate APIs omit per-test records and test identifiers.

The production grader must use the dedicated Axent runner configured with `CODE_RUNNER_URL` and `CODE_RUNNER_SECRET`. A runner timeout, unavailable runner, authentication error, capacity rejection, or database finalization failure is retryable and must not become a candidate zero. The finalization RPC seals a candidate once and returns the same sealed result for duplicate requests.

## Before a live exam

1. Configure and redeploy the dedicated runner and its sandbox image.
2. Run `python runner/smoke_test.py` against staging with eight concurrent candidate-style requests.
3. Test a complete set of five assigned questions using the actual languages and test sizes.
4. Simulate runner unavailability and confirm that no candidate is finalized and local progress can be retried.
5. Verify candidate API responses contain no test input, expected output, hidden test IDs, or per-test pass results.
