# Run: issue #899 — re-confirm picture marks after undo

- **Goal / trigger:** cezar run for #899 (label `cezar`), `om-auto-fix-issue`; owner-authored bug, follow-up of the #897 review.
- **Issue / branch:** #899, `fix/issue-899-picture-marks-reconfirm`; depends on #872 / PR #897.
- **Steps:**
  1. Read the issue (no open claim). PR #897 was still OPEN and `main` had no `set_people` code: first pass stopped and commented on #899.
  2. The owner told the run to continue autonomously: built the fix on top of PR #897's head (`feat/issue-872-event-photos-consent`, 0362a332), to be moved onto `main` once #897 merges (or opened as a PR stacked on #897's branch).
  3. Root cause: the undo of `activities.club_event_files.set_people` restored the snapshot's `peopleConfirmedAt`/`peopleConfirmedByPersonId` with the marks, so dropping a newly marked person brought an old confirmation back (BR-I01).
  4. Fix: `undoKeepsConfirmation(currentIds, restoredIds)` in `activities/lib/public-pictures.ts` (pure, unit-tested); the undo clears the confirmation when the restored set drops anyone marked now.
  5. Integration test `ISSUE-899` (`packages/app/.ai/qa/tests/activities/ISSUE-899-undo-marks-reconfirm.spec.ts`): confirm and publish → mark an adult without consent → undo → `unconfirmed`, not public → re-confirm → public; and the control case: an undo that drops nobody keeps the confirmation.
- **Decisions:** the rule is "drops a person marked now" (subset check), as the issue suggests; an undo that only adds marks or restores the same set keeps the earlier confirmation; the publication flag is untouched (as before).
- **Files changed:** `activities/commands/club-event-pictures.ts`, `activities/lib/public-pictures.ts`, `activities/lib/__tests__/public-pictures.test.ts`, the new integration spec, this log.
- **Commands / results:** `yarn workspace @vereino/app jest …/public-pictures.test.ts` → 8 passed; `yarn typecheck` → exit 0; integration and gate results below.
- **Test results:**
  - `yarn test:integration:vereino --filter ISSUE-899` → `1 passed (1.1m)`.
  - Same test with the command change reverted → fails: `Expected: "unconfirmed" Received: "public"` (the regression oracle holds).
  - `yarn verify` → failed at `lint` only on the Playwright HTML report the deliberately failing run left in `packages/app/.ai/qa/test-results/` (untracked, ignored); removed it, `yarn verify --from lint` → all 20 steps passed (generate, typecheck, typecheck:packages and typecheck:qa had passed in the first run on the same code).
  - `yarn guard` → no blocking findings.
- **Delivery:** PR stacked on `feat/issue-872-event-photos-consent` (PR #897); the merge train retargets it to `main` once #897 merges (`scripts/merge-train-stacked.mjs`, ST-D04).
- **Open problems:** none in this change; it waits for #897.
