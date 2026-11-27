# Run: issue #845 — TEST-PW01 covers user creation and every profile refusal; ASVS V6.1.2, V6.2.12

- **Goal and trigger:** Cezar task `09830044`, `om-auto-fix-issue 845` (label `cezar`). Gap found by spec close-out V
  (#842): PW-AC-01 and PW-AC-03 of the password check spec were not fully met.
- **Spec:** `.ai/specs/implemented/2026-11-26-vereino-password-check.md` (moved from `.ai/specs/` in this run).
- **Issue:** #845 · **Branch:** `test/issue-845-test-pw01-profile-refusals`.

## Steps

1. Claimed #845 (assignee, `in-progress`, 🤖 claim comment naming the worktree and branch).
2. Read TEST-PW01, the `foundation.password-check` command interceptor, `services/password-check.ts`, the platform
   users and profile routes (the user list filters by `organizationId` for the super administrator).
3. TEST-PW01 now also:
   - creates a user with `POST /api/auth/users` with each refused password (and one built from the new address):
     422 with its code each time; the organization still lists one user and the address cannot sign in; a good
     passphrase then creates the user (201), who signs in; the user is deleted in `finally`;
   - sends every refused password to `PUT /api/auth/profile` with the right current password: 422 with its code; the
     current password still signs in.
4. `docs/compliance/asvs-requirements.md`: V6.1.2 names TEST-PW01; V6.2.12 names the list file, the check and
   TEST-PW01/TEST-PW02.
5. Spec: PW-AC-01–03 ticked with evidence, status `Implemented`, moved to `implemented/`; links in the foundation
   sources, `docs/ops/deploy.md`, the ASVS table and the #779 run log fixed; changelog file
   `2026-11-26-issue-845-close-out.md`.

## Decisions

- "Nothing stored" on create is shown twice: the organization's user count stays 1 and sign-in with the new address
  fails. No database read from the test.
- On `PUT /api/auth/profile` a password below the policy (`only eleven`) never reaches the Vereino check: the
  platform's profile schema refuses it first with 400 and an issue on `password`. PW-AC-01 names only the common,
  too long, whitespace and context-word codes, so the test asserts that platform refusal instead of changing the
  route (tests-only issue, `risk-low`).
- PW-AC-02 ticked on the evidence of #812 (TEST-PW02 green in its CI); this run does not change TEST-PW02.

## Commands and results

- `yarn test:integration:vereino --filter TEST-PW01`, first run: failed on the profile path only —
  `Error: profile password_policy {"error":"Invalid profile update.","issues":[{"origin":"string","code":"too_small","minimum":12,...,"path":["password"],...}]} Expected: 422 Received: 400`.
  Every `POST /api/auth/users` refusal passed. Fixed the expectation (decision above).
- `yarn test:integration:vereino --filter TEST-PW01`, second run: `1 passed (48.3s)`.
- `yarn verify`: `lint` died with `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript
  heap out of memory` (node default heap; the machine had 104 GB available). Resumed with
  `NODE_OPTIONS=--max-old-space-size=12288 yarn verify --from lint`: lint passed; `format:check` flagged the test file,
  fixed with `yarn format`; `yarn verify --from format:check`: `all 17 step(s) passed` (generate, typecheck,
  typecheck:packages and typecheck:qa had passed in the first run).
- `yarn guard`: `No blocking findings.` · `yarn lessons:check`: valid.
- Lesson added: `profile-route-schema-refuses-before-command-interceptors`.

## Open problems / next steps

- None known.
