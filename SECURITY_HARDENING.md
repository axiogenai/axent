# CodeSpark security hardening — deployment notes

This branch intentionally preserves the existing CodeSpark UI and candidate/admin workflow. The changes below harden authority authentication and email dispatch without changing the exam screens.

## Required Vercel environment variables

Set these in the Vercel project that deploys the `frontend` directory. Use **server-side variables only**; do not prefix secrets with `VITE_`.

- `SUPABASE_URL`: the project URL (server-side copy).
- `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`): public/publishable Supabase key used only to verify the bearer session with Supabase Auth.
- `SUPABASE_SERVICE_ROLE_KEY`: secret server-only key used by protected CodeSpark APIs to access protected roster, questions and submissions. Never expose it to the browser or prefix it with `VITE_`.
- `SMTP_USER`: dedicated sender mailbox.
- `SMTP_PASSWORD`: newly rotated Gmail App Password or SMTP credential.
- `SMTP_HOST`: optional; defaults to `smtp.gmail.com`.
- `SMTP_PORT`: optional; must be `587` (STARTTLS) or `465` (TLS).
- `SMTP_FROM_NAME`: optional display name.
- `APP_ALLOWED_ORIGINS`: optional comma-separated list of exact HTTPS origins. Defaults to `https://axent.axiogen.in`; Vercel's deployment origin is also allowed via `VERCEL_URL`.
- `APP_PUBLIC_URL`: optional canonical HTTPS production URL used in Round 2 invitation links. Set this to the actual public Axent domain.

The legacy Render/Django SMTP routes now return HTTP 410 and no longer accept caller-supplied SMTP credentials. The frontend calls only the authenticated Vercel routes.

## Trusted Supabase roles

Privileged role claims must be stored in Supabase `auth.users.raw_app_meta_data` (`app_metadata`), never `user_metadata`. A user must not be able to grant themselves admin by signing up or editing profile metadata.

Provision roles from a trusted Supabase Dashboard/admin process:
- Admin: `app_metadata.role = admin`
- Paper setter: `app_metadata.role = paper_setter`

The Admin Portal requires `app_metadata.role = admin`. The Paper Setter Portal accepts `paper_setter` and `admin`. After changing app metadata, have the user sign out and sign in again so the JWT contains the updated claim.

## Credential incident response

A credential was previously present in repository source and frontend configuration. Treat it as compromised:
1. Revoke the exposed Gmail App Password in Google Account security.
2. Create a new sender-specific App Password.
3. Configure it only as Vercel `SMTP_PASSWORD` (and any separately secured backend secret store if a future backend mailer is introduced).
4. Remove legacy `VITE_SMTP_PASSWORD` variables from Vercel and local deployment settings.
5. Review Google account recent security activity and SMTP delivery logs.

Do not paste credentials into GitHub issues, commits, chat, or frontend environment variables.

## Important scope and release gates

- This branch does not modify production, apply migrations, or alter existing candidate data.
- A verified Supabase administrator session is required for email testing and dispatch.
- The email endpoints validate recipients and constrain exam links to the official Axent HTTPS host. SMTP host, port, sender and password are controlled by server environment variables.
- Existing candidate roster storage, shortlist authority, and Round 2 grading still need a server-authoritative migration before the platform can be described as secure against candidate-side tampering. Do not treat client-side scores or local shortlist state as trusted evidence.
- Run the frontend typecheck, lint, production build, staging smoke tests, and Supabase security advisors before merging. Test with one internal recipient before enabling bulk dispatch.
- No software can honestly guarantee zero bugs or zero vulnerabilities. Production readiness requires staging and live-environment verification.

## CodeSpark protected API routes added in this branch

- `/api/codespark/roster`: administrator-only roster and shortlist configuration.
- `/api/codespark/candidate-lookup`: exact candidate-key lookup; returns only the matching candidate record and throttles failed guesses.
- `/api/codespark/round2-problems`: publishes public problem statements and sample cases; hidden cases are returned only to a verified administrator.
- `/api/codespark/grade-round2`: server-side evaluation against all configured tests, including hidden cases.
- `/api/codespark/round2-live-code`: validates the candidate's Round 2 key before syncing live code.
- `/api/codespark/round2-submissions`: server-authoritative final grading, persistence, leaderboard retrieval and administrator reset.
- `/api/codespark/public-exam`: exposes only the configured active exam's safe metadata.

The service-role API routes require `SUPABASE_SERVICE_ROLE_KEY`. The persistent failed-key throttling requires the new migration table.
