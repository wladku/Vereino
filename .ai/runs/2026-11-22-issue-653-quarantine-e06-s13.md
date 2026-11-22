# Run: quarantine E06-S13 (#653)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` on #653, filed by the CI failure ledger: E06-S13 failed in CI runs that share no PR (runs 45065537955, 44848338885). SDLC.md "Validation gate": quarantine with `test.fixme` in a `priority-high` PR that references the issue with `Refs #`.
- **Issue / branch:** #653, `fix/issue-653-quarantine-e06-s13-test`.

## Steps

1. Checked `main` and the open PRs for an existing fix: no PR mentions E06-S13 or #653, and the spec on `main` has no `fixme`.
2. Claimed #653 (assignee, `in-progress`, `🤖` claim comment naming this worktree).
3. Read the failed CI logs. Both runs fail at the same place, on the first attempt and on the retry: `TimeoutError: locator.click: Timeout 30000ms exceeded` at `E06-S13-coach-absence-substitutes.spec.ts:259`, the click on the "Assign substitute" menu item in the row actions of the "Needing a coach" list (`/backend/activities/occurrences?perspective=unassigned`). The `QueryIndexScopeError` lines in the same logs are platform indexer noise seen in passing tests too, not the cause.
4. Marked the test `test.fixme` with `// quarantine: #653` on the line above.

## Decisions

- Quarantine only, as the issue asks; the real fix (why the menu item is not clickable — menu not opened, item missing for this row, or the item detached by a list refetch) stays on #653.

## Files changed

- `packages/app/.ai/qa/tests/activities/E06-S13-coach-absence-substitutes.spec.ts`: `test` → `test.fixme` plus the quarantine comment.
- `.ai/runs/2026-11-22-issue-653-quarantine-e06-s13.md`: this log.

## Commands and results

See the PR body (filled in after the runs below).

## Open problems / next steps

- #653 stays open: find the cause of the click timeout, fix the test or the code, remove the `fixme`.
