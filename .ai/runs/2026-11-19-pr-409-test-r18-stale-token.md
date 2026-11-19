# Run: PR #409 — TEST-R18 failed with 401 on the moved-closure step

- **Goal and trigger**: unattended cezar task (om-auto-fix-pr) for PR #409 (issue #394): the required checks `integration (shard 4/6)` and `integration` concluded FAILURE.
- **Issue / PR / branch**: #394 / #409 / `refactor/issue-394-reschedule-notice-batch-reads` (worked on a detached HEAD at its origin tip, pushed with `git push origin HEAD:<branch>`).

## Steps

1. Read the failed job log (run 44449903619, job 135311011603): 45 passed, 1 failed — `TEST-R18 … once each`, `GET /api/notifications {"error":"Unauthorized"}` (401) at `TEST-R18-reschedule-notices.spec.ts:267`, on the first try and on the retry.
2. Root cause: the step this PR appended (closure moved to 09:00–19:00) polls `expectNotices(request, academyCoordinator.token, …)`. The test signs that coordinator in with `signInBrowser` at line 214, which resets the password and ends the earlier token; the test already keeps the fresh `coordinatorToken`. Known trap (lesson `sign-in-browser-ends-the-api-token`, AGENTS.md → Validation). Not a product bug.
3. Merged `origin/main` into the branch (no conflicts).
4. Fix: the moved-closure step reads the coordinator's notices with `coordinatorToken`; a comment says why.
5. Reviewed the PR's code diff (directory batch read, `holdersBySectionDay`, renter decryption read): additive `PersonDirectory` method, the removed facilities helper `sectionCoordinatorIds` has no other caller; no finding.
6. Recorded the recurrence in the lesson `sign-in-browser-ends-the-api-token`.

## Decisions

- Fixed the test, not the fixture: making `signInBrowser` return a fresh token changes a shared fixture used by many tests, out of scope for this PR (the lesson already names it as a candidate).

## Files changed

- `packages/app/.ai/qa/tests/facilities/TEST-R18-reschedule-notices.spec.ts`
- `.ai/lessons/sign-in-browser-ends-the-api-token.md`
- `.ai/runs/2026-11-19-pr-409-test-r18-stale-token.md`

## Commands and results

- `yarn lessons:check` — valid.
- `yarn test:integration:vereino --filter TEST-R18` — could not run on this host: headless Chromium fails to start (`libatk-1.0.so.0: cannot open shared object file`), a host library this unattended run may not install; CI is the evidence. `yarn typecheck:qa`, `yarn lint`, `yarn format:check`, `yarn qa-texts:check`, `yarn lessons:check` — all pass (lint after removing the local Playwright report under `.ai/qa/test-results/`, which it otherwise lints).

## Open problems / next steps

- CI re-runs on the push; the merge train takes the PR when green.
