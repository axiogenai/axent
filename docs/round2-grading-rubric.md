# Round 2 grading rubric

Axent Round 2 grading uses the existing server-side Wandbox compiler integration. No separate compiler or runner service is required.

## Mark allocation

- Correctness: 80%.
- Efficiency / scalability: 10%.
- Robustness: 10%.
- If a problem does not define a performance or robustness suite, its unused weight is redistributed to correctness.
- Sample tests are feedback only and never contribute marks.
- At least one hidden correctness test is required before a question can be finalized.

Within each category, optional per-test \`weight\` values distribute that category's marks. The default weight is 1.

## Test suites

A problem may contain:

- \`hiddenTestCases\`: correctness cases. A case may set \`category: "performance"\` or \`category: "robustness"\` to place it in an optional category.
- \`performanceTestCases\`: admin-authored large-input scalability cases.
- \`robustnessTestCases\`: edge-case and unusual-input cases.

Every grading case must include \`input\` and \`expectedOutput\`. Candidate problem responses strip all test arrays; the complete suites are available only to verified administrators and server-side grading.

## Existing compiler telemetry limitation

The Wandbox \`/api/compile.json\` response schema exposes the exit status and program/compiler output. It does **not** expose per-program CPU runtime or memory usage. Axent therefore:

- records the byte size of each benchmark input;
- records the elapsed time for the server's Wandbox HTTP request as \`compilerElapsedMs\`;
- leaves program runtime and memory as unavailable (\`null\`);
- never treats missing metrics as zero;
- never uses HTTP/network/queue latency as program runtime or as a marks threshold.

The efficiency category is consequently a large-input scalability check: a solution must produce the expected output on admin-authored larger cases within Wandbox's own sandbox limits. This is not a precise CPU-time or memory benchmark, and the admin dossier labels it accordingly.

## Failure and retry behavior

- Compiler HTTP errors, timeouts, malformed responses and unavailable compiler registries are infrastructure errors (HTTP 503), not candidate test failures.
- A compiler response with a non-zero program status is a candidate compile/runtime failure.
- Final submission code is persisted as retryable progress before grading starts.
- If grading fails, the submission is not finalized and the candidate can retry.
- The finalization RPC remains the authoritative atomic seal; candidate responses omit hidden test IDs, per-test results and rubric internals.

## Operational limits

- At most 230 grading cases are accepted per question, with a maximum of 30 samples, 200 hidden correctness cases, 100 performance cases and 100 robustness cases.
- The grader runs at most three Wandbox requests concurrently within a question and uses one 45-second deadline for the candidate's complete final submission.
- This bounds load within one Vercel request; it does not guarantee a global concurrency cap across separately scaled serverless instances.
