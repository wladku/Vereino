# Run: issue #779 — app-owned password check (ASVS V6.2)

- **Goal and trigger:** Cezar task, `om-auto-fix-issue 779`, feature route. The owner decided on #779 (2026-11-26): a
  built-in list of ~100k common passwords, no external service; "write the spec and build it".
- **Spec:** `.ai/specs/2026-11-26-vereino-password-check.md` (new; changelog `2026-11-26-initial-spec.md`).
- **Issue:** #779 · **Branch:** `feat/issue-779-app-password-check` · worktree: Cezar task `465c43e3`.

## Steps

1. Claimed #779 (assignee, `in-progress`, 🤖 claim comment naming the worktree and branch).
2. Read the platform code: `passwordPolicy.ts` (computed `process.env[key]`), the profile, users and reset-confirm
   routes, `commands/users.ts`, the five client pages, the command interceptor contract, the integration runner env.
3. Wrote the spec (`om-spec-writing --autonomous`; resolved assumptions Q1–Q6 in the spec).
4. Built it: `foundation/lib/password-check.ts` (pure rules), `lib/common-passwords.ts` (NCSC top 100k from SecLists,
   MIT, lower-cased and de-duplicated: 97 736 entries), `services/password-check.ts`, `commands/interceptors.ts`
   (`auth.users.create`/`update`), five error codes with en/pl messages, route wrappers
   `src/app/api/auth/reset/confirm/route.ts` and `src/app/api/auth/profile/route.ts`, `PasswordPolicyBridge` in the root
   layout, production policy in `vereino-ephemeral.mjs`.
5. Tests: unit `password-check.test.ts`, `error-codes.test.ts`, `vereino-ephemeral.test.mjs`; integration TEST-PW01,
   TEST-PW02. Fixture `tenant.ts` and TEST-M07 no longer build the password from the e-mail's suffix.
6. Docs: `docs/ops/deploy.md` → *Password policy*; `docs/compliance/asvs-requirements.md` rows V6.1.2, V6.2.1, V6.2.4,
   V6.2.5, V6.2.8, V6.2.9, V6.2.11, V6.2.12 and the V6 summary row. Lesson
   `platform-forms-read-server-env-in-browser`.

## Decisions

- One source for minimum length and classes: the platform `OM_PASSWORD_*` variables; Vereino adds its rules on top.
- Forms: a server-rendered bridge writes the policy into the browser `process.env` instead of copying five platform
  pages (PW-D03). Proven by TEST-PW02 in a production build.
- Context words: refused when fewer than 8 letters/digits remain after removing them; the reset link uses product words
  only (no system-scope token lookup, which would be Ask First).
- The tenant fixture built e-mail and password from the same random suffix; the new rule rightly refuses that, so the
  fixture now uses a UUID for the password.

## Commands and results

- `npx jest src/modules/foundation/lib/__tests__/password-check.test.ts …error-codes.test.ts` — 15 + 2 passed.
- `node --test --experimental-test-module-mocks scripts/__tests__/vereino-ephemeral.test.mjs` — 33 passed.
- `yarn generate`, `yarn typecheck` — pass. ESLint on the new files — clean (after moving the platform import out of
  `lib/`, S4.9).
- `yarn test:integration:vereino --filter TEST-PW02` — first run failed: `expect(link).toBeTruthy()` (another e-mail to
  the address satisfied the wait); fixed to poll for the reset link; rerun passed (`1 passed (46.2s)`).
- `--filter TEST-PW01` — first run failed: `Expected: 400 Received: 422` for `password_policy` (the interceptor runs
  before the platform's validation); test updated; rerun passed (`1 passed (45.5s)`).
- Regression runs of tests that set passwords through the fixtures: see the PR body.

## Open problems / next

- Residual gaps (spec): passwords set before #779 and longer than 72 bytes; no club words on the reset link; the
  platform change form trims new passwords client-side (harmless for passwords that pass the check).
