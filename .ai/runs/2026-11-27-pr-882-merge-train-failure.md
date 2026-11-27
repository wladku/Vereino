# Run: PR #882 merge-train failure (E31-S01 sign-in after the staff second factor)

- **Trigger:** the merge train marked PR #882 `merge-train-failed` at 2026-11-27T08:39Z (`merge-train/verdict` = failure on head `1bd2f226`: it broke a batch on its own). Unattended cezar task.
- **Issue / PR / branch:** #873 / #882 / `feat/issue-873-installable-web-app` (worked on a detached HEAD, pushed with `git push origin HEAD:feat/issue-873-installable-web-app`).

## Steps

1. Found the batch run: CI run 45959015829 (`merge-train: batch #882`, head `b68968b8`, PR #882 alone on main `aeade41f`). Failed jobs: `integration (shard 2/6)` and the aggregate `integration`.
2. Read the shard log and the Playwright report artifact (`playwright-report-shard-2`): `E31-S01 installable in Chromium, Install in the menu, the offline page and nothing personal cached` failed on both attempts at `signInAtClub` (`getByTestId('club-bottom-bar')` not found); the page snapshot showed the `/login` form at `/club`, i.e. the member was not signed in.
3. Root cause: #831 (staff second factor, #736) landed on main after this PR's last merge of main. A club administrator now gets a provisional token and an e-mailed code; the test's own `signInAtClub` typed the password, accepted the 200 of `/api/auth/login` and went to `/club` without completing `/login/second-factor`. Not a flake: deterministic, both attempts, and caused by the interaction of this PR's new test with main.
4. Merged `origin/main` (`aeade41f`) into the branch: no conflicts.
5. Fix: `signInAtClub` takes `capturedCount` before submitting and calls `finishSignInOnPage` from `_fixtures/auth` (as main's `signInThroughForm` does since #831), then opens `/club`. The second app process inherits `OM_TEST_EMAIL_CAPTURE_PATH`, so the code is read from the same capture.

## Decisions

- Fixed the test, not the app: the second factor for staff is intended behaviour (DD-2F01); the test signs in as the club administrator, so it must complete the challenge like every other spec.
- No CI failure ledger (#410) entry: the failure is caused by this PR's test, not a flake.

## Files changed

- `packages/app/.ai/qa/tests/club_core/E31-S01-installable-web-app.spec.ts`
- `.ai/runs/2026-11-27-pr-882-merge-train-failure.md`

## Commands and results

- `yarn test:integration:vereino --filter E31-S01` (after the fix, on the main merge): 4 passed (1.0m).
- `yarn verify`: all 24 steps passed.

## Open problems / next steps

- The merge train picks the PR up again on the new head; `merge-train-failed` is left to the train.
