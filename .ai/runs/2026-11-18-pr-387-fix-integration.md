# Run: PR #387 — fix the failing integration shard 3/3

- **Trigger:** cezar `om-auto-fix-pr 387` (label `merge-train-failed`; required checks `integration (shard 3/3)` and `integration` concluded FAILURE on head `fcc6e4f9`, CI run 44346430368).
- **Issue / PR / branch:** #287 / #387 / `feat/issue-287-reschedule-notices` (worked on a detached HEAD, pushed with `git push origin HEAD:feat/issue-287-reschedule-notices`).
- **Date:** 2026-11-18

## Goal

Bring the PR up to date with `main` and make the required integration checks green without weakening a test.

## Steps

1. Claimed the PR (assignee + `in-progress` + claim comment).
2. `main` was already merged into the head (`git log HEAD..origin/main` empty), so no base merge was needed.
3. Read the shard 3 job log: one failure, `TEST-L03-departure` (85 passed), on both attempts:
   `Error: {"error":"Declarations for this session are closed.","code":"declaration_closed"}` at `TEST-L03-departure.spec.ts:141` (the declaration on the session "before the last day").
4. Classified as a **test bug** that depends on the time of day. The test's series runs on Wednesdays 17:00–18:00. It picked the session "before the last day" with `occurrenceDate >= today`. On Wednesday 2026-11-18 at 17:22 club time (the CI run), that was today's session, which had already started, so `POST /api/activities/attendance/declare` answered 409 `declaration_closed` (`activities/lib/policy.ts`: declarations change until `start_at`). This is not related to the PR's facilities change.
5. Fix: pick the session from tomorrow (`> today`). Days 1–10 always hold one Wednesday, so the session is now asserted and the conditional `if (before)` branches became unconditional. The test keeps all its checks and now always exercises the "kept declaration" path.
6. Added the third shape to lesson `integration-tests-must-not-depend-on-the-clock`.

## Decisions

- No product change. The 409 is the documented rule.
- The local reproduction was impossible: the user running the session is not in the `docker` group (`permission denied … /var/run/docker.sock`), so Testcontainers cannot start, and system settings are out of scope. The proof is the CI run on the pushed head, which runs on Wednesday after 17:00 club time, the window that failed before.

## Files changed

- `packages/app/.ai/qa/tests/people/TEST-L03-departure.spec.ts`
- `.ai/lessons/integration-tests-must-not-depend-on-the-clock.md`
- `.ai/runs/2026-11-18-pr-387-fix-integration.md`

## Commands and results

- `yarn test:integration:vereino --filter TEST-L03` — not run: `[ephemeral] … Could not find a working container runtime strategy` (no Docker access).
- See the PR comment for the type, text, lesson and format checks and the CI result on the new head.

## Open problems / next steps

- Wait for the CI on the new head. The merge train picks the PR up again once its required checks are green.
