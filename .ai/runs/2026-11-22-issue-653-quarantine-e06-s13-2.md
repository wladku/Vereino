# Run: quarantine E06-S13 (#653)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` on #653, filed by the CI failure ledger: E06-S13 failed in CI runs that share no PR (runs 45065537955, 44848338885). SDLC.md "Validation gate": quarantine with `test.fixme` in a `priority-high` PR that references the issue with `Refs #`.
- **Issue / branch:** #653, `test/issue-653-quarantine-e06-s13-fails-ci`.

## Steps

1. Checked `main` and the open PRs for an existing fix: no open or merged PR mentions E06-S13 or #653, and `main` has no newer commit than this branch's base.
2. Claimed #653 (assignee, `in-progress`, `🤖` claim comment naming this worktree).
3. Read the failed CI logs. Both runs, and the retry of each, fail at the same step (`E06-S13-coach-absence-substitutes.spec.ts` lines 257–259): `locator.click` on the `Assign substitute` menu item (`activities.substitutions.assign.action`) times out after 30 s. The call log shows the item resolved, then "element is not stable" / "element was detached from the DOM, retrying" again and again: the row menu re-renders (likely a list refetch remounting the row) while it is open, so the click never lands.
4. Marked the test `test.fixme` with `// quarantine: #653` on the line above and a comment naming the symptom.

## Decisions

- Quarantine only, as the issue and SDLC.md ask; the real fix (find what re-renders the row menu, then fix the test wait or the UI) stays on #653, which remains open.

## Files changed

- `packages/app/.ai/qa/tests/activities/E06-S13-coach-absence-substitutes.spec.ts`: `test` → `test.fixme` plus comment.
- `.ai/runs/2026-11-22-issue-653-quarantine-e06-s13.md`: this log.

## Commands and results

- `gh run view <id> --log-failed` for both runs: the menu-item click timeout above at line 259 (first attempt and retry).
- `yarn verify`: all 20 steps passed (exit 0).
- `yarn guard`: no blocking findings (compared with `45b924ea`).
- `yarn test:integration:vereino --filter E06-S13`: `1 skipped`, exit 0 (the test is reported as fixme, not run).

## Open problems / next steps

- #653 stays open: find why the substitution row menu detaches while it is open, fix the test or the UI, remove the `fixme`.
