# Run: quarantine TEST-L23 (#545)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` on #545, filed by the CI failure ledger: TEST-L23 failed in CI runs that share no PR (runs 44952205773, 44655962809). SDLC.md "Validation gate": quarantine with `test.fixme` in a `priority-high` PR that references the issue with `Refs #`.
- **Issue / branch:** #545, `test/issue-545-quarantine-test-l23`.

## Steps

1. Checked `main` and the open PRs for an existing fix: none mentions or touches TEST-L23 since it landed in #424.
2. Claimed #545 (assignee, `in-progress`, `🤖` claim comment naming this worktree).
3. Read the failed CI logs. Both runs, and both retries of each, fail in the club administrator's step B-11 (`TEST-L23-age-category-birth-years.spec.ts` lines 243–250): `locator.click` on Save in `age-range-editor-skrzat` times out after 30 s. The call log shows the button "detached from the DOM" and then resolving again as `disabled`: the range editors remounted after the test filled the U-value, so the typed value was dropped and Save stays disabled.
4. Likely cause: the season-switch race the test already comments on (#431) — the season's list loads under a new query key and the table remounts its editors — still happens after `age-categories-reference` shows 2026/27, so waiting for the reference line is not enough on a slow CI runner.
5. Marked the test `test.fixme` with a comment linking #545 and naming the likely cause.

## Decisions

- Quarantine only, as the issue and SDLC.md ask; the real fix (wait for the editors to settle, or keep a typed value across the remount in the UI) stays on #545.

## Files changed

- `packages/app/.ai/qa/tests/groups/TEST-L23-age-category-birth-years.spec.ts`: `test` → `test.fixme` plus comment.
- `.ai/runs/2026-11-21-issue-545-quarantine-test-l23.md`: this log.

## Commands and results

- `gh run view <id> --log-failed` for both runs: the Save-click timeout above at lines 246/247 and 250 (first attempt and retry).
- `yarn verify`: all 18 steps passed (exit 0).
- `yarn test:integration:vereino --filter TEST-L23`: `1 skipped`, exit 0 (the test is reported as fixme, not run).

## Open problems / next steps

- #545 stays open: find why the editors remount after the reference line shows the new season, fix the test or the UI, remove the `fixme`.
