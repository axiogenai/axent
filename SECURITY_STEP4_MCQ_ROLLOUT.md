# Step 4 — Secure MCQ ticket flow

## Included

- `/admin/mcq-tickets` is protected by the trusted Supabase administrator role and is linked from the Admin Dashboard.
- Admins can issue candidate-specific tickets for published exams and revoke a ticket while the link is still in the issuer screen.
- Candidate links use a URL fragment (`/mcq#ticket=...`) so the bearer token is not sent in HTTP requests or referrer headers. The candidate page removes it from the visible URL after validation.
- `/mcq` no longer accepts manual identity forms or decoded Base64/JSON strings as credentials. A trusted ticket is required.
- Candidate start, answer saves, and submission use Supabase RPCs. The database creates the attempt, enforces the schedule/deadline/attempt limit, and grades answers.
- Answer keys and explanations are stripped from active-attempt responses.
- Direct anonymous access is revoked for `mcq_questions`, `mcq_exams`, and `mcq_attempts`. Trusted `app_metadata.role` policies protect authority access.
- The existing coding workspace, compiler, submission archival, lab setup, and candidate-station tables are not modified by this step.

## Before production

1. Apply `frontend/supabase_migrations/20261016_mcq_server_authority.sql` to a **staging** Supabase project first.
2. Verify the actual deployed schema and data: `mcq_questions.options` must use `id`, `text`, and boolean `isCorrect`; exam timestamps must be epoch milliseconds; IDs/status values must match the existing schema.
3. Ensure the first administrator and paper-setter users have trusted `app_metadata.role` values provisioned through Supabase's trusted admin controls. User-editable `user_metadata` does not grant access.
4. Test the full path: publish an exam → issue candidate link → start/resume → save answers → submit/timeout → verify score from the database → revoke a ticket.
5. Test rejected cases: malformed, expired and revoked tickets; wrong ticket/attempt pair; invalid question/option IDs; before/after exam window; max attempts; duplicate submit; attempts to query MCQ tables as anon.
6. Verify admin and paper-setter exam authoring still works under the new policies. Verify coding workspace, compilation, code submission archival, CCTV/station telemetry and lab setup are unchanged.
7. Only then apply to production. Do not modify any `.env` or `.env.example` files for this step.

## Remaining boundary

This migration secures the **MCQ tables and new ticket-based MCQ flow**. The existing RLS policies on `candidate_stations`, `college_labs`, and `code_submissions` are deliberately unchanged because the current coding workflow relies on them. Those tables need a separate identity/authorization migration before Axent can be described as fully secure. Never claim the entire product is secure solely because this MCQ step is deployed.


## Additional release blockers

- The secure MCQ candidate screen currently does not port every feature from the legacy MCQ proctoring screen. Audit and restore required anti-cheat/monitoring behavior before production use; passing TypeScript/build checks does not prove feature parity.
- Staging-test the SQL migration against the actual Supabase schema. Verify result-release mode, WhatsApp result-group fields, negative-marking settings, attempt limits, RLS policies, ticket issue/revoke, and server-side grading.
- For exams configured to announce results later, the submit RPC must not return scores or answer explanations. Answer explanations are released only after submission when immediate results and the exam setting allow them.
- Do not modify any .env or .env.example files as part of this rollout.


## Proctoring safeguards in the secure candidate flow

- Focus loss, right-click attempts, restricted keyboard shortcuts, fullscreen exits, and screen-share start/stop are recorded through a ticket-bound server RPC.
- Three tab/window focus-loss events lock further answer saves on the server, not only in the UI. An administrator can unlock an in-progress attempt from the ticket console; the original infraction history remains intact.
- Screen capture is available only when the local workstation profile matches the ticket candidate and includes a lab/station identifier. Frames are sent through the existing MCQ station telemetry path, and the live-stream flag is cleared when sharing stops or the page unmounts.
- These browser-side controls are deterrents, not a guarantee against a compromised client. Validate screen-share telemetry, lock/unlock, and station identity in a controlled environment before production use.
