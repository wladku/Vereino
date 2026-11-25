# Run: quarantine TEST-A11 (#752)

- **Trigger:** Cezar `om-auto-fix-issue` run, queued by the `cezar` label on #752 (filed by the CI failure ledger).
- **Issue:** https://github.com/wladku/Vereino/issues/752
- **Branch:** `test/issue-752-quarantine-test-a11`
- **Spec:** none (test quarantine, `direct` route).

## Goal

Stop `TEST-A11` from failing unrelated merge-train runs: mark it `test.fixme` with `// quarantine: #752`, as SDLC.md
"Validation gate" prescribes. The issue stays open as the tracking item for the real fix (`Refs #752`).

## Steps

1. Checked `main` (no commit touched the spec since #353) and the open PRs (none mentions TEST-A11): no existing fix.
2. Claimed #752 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
3. Read the failed CI runs 45616729085 and 45616841827 (integration shard 1/6). Both fail the same way, on the first
   try and the retry:
   `Error: create account {"error":"Validation failed","details":[{"origin":"string","code":"invalid_format","format":"email",…` at
   `_fixtures/club.ts:268` (`createStaff`), called from `signedInStaff` at `TEST-A11-coach-sparring-typed-venue.spec.ts:52`
   (the first coach, `Wojtek Trener`). The fixture builds `wojtek-<uniqueSuffix()>@example.org`, which looks valid,
   so the cause is not obvious from the log (the response body is truncated there) and is left to the tracking issue.
4. Changed `test(` to `test.fixme(` with a comment and `// quarantine: #752` on the line above.

## Decisions

- Quarantine only, no attempt at the root cause: the issue asks for the quarantine PR first so the train stops
  failing unrelated PRs; the fix belongs to #752 itself.

## Files changed

- `packages/app/.ai/qa/tests/activities/TEST-A11-coach-sparring-typed-venue.spec.ts`
- `.ai/runs/2026-11-25-issue-752-quarantine-test-a11.md`

## Commands and results

- `yarn guard`: no blocking findings.
- `yarn verify`: all 22 steps passed (build 69 s).
- `yarn test:integration:vereino --filter TEST-A11`: exit 0, `1 skipped` (the quarantined test is collected and not run).

## Open problems / next steps

- #752 stays open: find why the account e-mail is rejected in those runs, fix the fixture or the code, remove the
  `fixme`.
