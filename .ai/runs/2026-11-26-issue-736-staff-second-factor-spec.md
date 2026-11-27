# Run: issue #736 — staff second factor (spec)

- **Goal and trigger:** cezar task 8e3d3743 (`om-auto-fix-issue 736`, label `cezar`). E25-S02: administrators and treasurers sign in with a second factor; the owner decided ENG-Q-09 again on 2026-11-26 (option 1: Google sign-in, fallback password + e-mail code; recovery by an administrator or the operator).
- **Issue:** #736 (epic #734) · **Branch:** `docs/issue-736-staff-second-factor-spec`
- **Route:** feature → no covering spec → spec first (`om-spec-writing --autonomous`), design-only spec PR. Implementation waits for the owner's approval of the spec (status `Ready for implementation` or `phase-ready` on a phase story, SDLC.md → Definition of Ready).

## Steps

1. Claimed #736 (assignee, `in-progress`, 🤖 claim comment naming this worktree and branch); renamed the task branch.
2. Read the social sign-in spec, the engineering standards (S8.2, ADR-023, ENG-Q-09), the ASVS checklist and requirement rows, the Vereino role catalogue and the integration fixtures.
3. Read the installed platform: `core/modules/auth/api/login.ts` (after-interceptors, token swap), `session/refresh.ts`, `shared/lib/auth/{jwt,server,mfaPendingAccess}.ts`, `shared/lib/crud/{api-interceptor,interceptor-runner,interceptor-registry}.ts`, `core/helpers/integration/api.ts`, the existing `people.member-landing` login interceptor.
4. Wrote `.ai/specs/implemented/2026-11-26-vereino-staff-second-factor.md` (Draft): an ACL feature as the requirement, a gate issuing an `mfa_pending` token (first drafted as a login after-interceptor, moved to the login wrapper after step 6), an e-mail code challenge in the platform cache, two completion routes registered with the platform's MFA-pending gate, Google required when connected, reset by an administrator or operator CLI; no table, no migration, no dependency.
5. Recorded the superseding ENG-Q-09 answer (engineering standards row + S8.2 sentence, changelog file); updated the ASVS checklist V6.5–V6.7 rows and the V6.3.3, V6.4.4, V6.5.x, V6.6.2–3, V6.8.4 requirement rows (state unchanged until built).
6. Fresh-context architectural review of the spec by a subagent (staff-engineer persona, spec path and platform sources only). Findings and what changed:
   - C1, confirmed by reading `interceptor-runner.ts` and `login.ts`: an after-interceptor cannot set a status, and a body without `token` leaks the full cookies. The gate moved to the existing login wrapper `src/app/api/auth/login/route.ts` (#738).
   - H1, confirmed in `sessionIntegrity.ts`: a provisional token without `sid` fails canonical auth. The token now keeps the platform session's `sid`, and that session is deleted on success, failure and expiry.
   - H2: the interceptor traps (`features`, timeout) no longer apply; the e-mail send has its own 10 s timeout.
   - H3: the identity callback admits a required user only through Google (Facebook is a bypass).
   - H4: gaining the requirement ends sessions (`syncAuthRoles`).
   - M1: attempts are counted under an advisory lock.
   - M2: at most 5 challenges per user per hour, and a provisional answer does not clear the account counter.
   - M3: a link-free session issuer is extracted from `issueSession`.
   - M4: the reset moved to phase 1.
   - M5: Q-2F02 is marked as an explicit risk acceptance.
   - M6: V-2F02 is the first step of phase 1.
   - Low findings applied (V6.3.3 wording, resend test with an injected clock, 404 instead of `scope_denied`, autologin deploy check, `locked` event in the contract).
7. Lesson `core-auth-ships-an-mfa-pending-gate`.

## Decisions and reasons

- **Spec, not code, in this run:** the issue has no spec; SDLC.md lets a story of a Draft spec start only with `phase-ready`, which only the owner's decision session sets.
- **Installed seam over a login route of our own:** the platform's `mfa_pending` gate already refuses a provisional token on pages, on unregistered API routes and on refresh (fail closed, central).
- **Gate in the login wrapper, not an after-interceptor:** an after-interceptor cannot set a status, and a body without `token` makes `login.ts` set the original full token as the cookie. Found while checking the runner and confirmed by the review; recorded in the lesson.
- **Requirement as a feature** (`foundation.second_factor.required`) rather than role names (AGENTS.md).
- **No bypass switch and no test-mode code:** fixtures read the code from the `OM_TEST_MODE` e-mail capture.

## Files changed

- `.ai/specs/implemented/2026-11-26-vereino-staff-second-factor.md` (new)
- `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (ENG-Q-09 row, S8.2)
- `.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-26-issue-736-eng-q-09-superseded.md`, `.ai/specs/changelog/2026-11-26-vereino-staff-second-factor/2026-11-26-issue-736-draft.md`
- `docs/compliance/asvs-checklist.md`, `docs/compliance/asvs-requirements.md`
- `.ai/lessons/core-auth-ships-an-mfa-pending-gate.md`
- this run log

## Commands and results

See the PR's run summary for the validation output.

## Open problems / next steps

- Owner: answer Q-2F01…Q-2F05 (defaults proposed) and approve the spec; then the phase stories get `phase-ready` and a build run implements phase 1.
- V-2F02 (where an app module registers MFA-pending routes; whether `/login/second-factor` may sit beside the platform `/login`) is checked in phase 1.
