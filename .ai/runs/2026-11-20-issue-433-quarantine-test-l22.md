# Run: quarantine TEST-L22 (#433)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` on #433, filed by the CI failure ledger: TEST-L22 failed in CI runs that share no PR (runs 44646659366, 44642262124). SDLC.md "Validation gate": quarantine with `test.fixme` in a `priority-high` PR that references the issue with `Refs #`.
- **Issue / branch:** #433, `test/issue-433-quarantine-test-l22-ci`.

## Steps

1. Checked `main` and the open PRs (#419, #422, #430, #431, #432) for an existing fix: none touches TEST-L22.
2. Claimed #433 (assignee, `in-progress`, `🤖` claim comment naming this worktree).
3. Read the failed CI logs. Both runs fail at the final `expect(violations).toEqual({})` (`TEST-L22-move-children-ui.spec.ts:214`): axe reports 1–2 serious `color-contrast` nodes on "panel dialog", in a different locale/theme on each attempt (en light, en dark, pl dark). Because the failure moves around, the scan probably runs while colours are still blending (lesson `axe-after-color-scheme-and-react-query-error-refetch`, points 1 and 4), not on a real contrast defect.
4. Marked the test `test.fixme` with a comment linking #433.

## Decisions

- Quarantine only, as the issue asks; the real fix (wait for transitions before the dialog scan, or use `switchColorScheme`) stays on #433.

## Files changed

- `packages/app/.ai/qa/tests/groups/TEST-L22-move-children-ui.spec.ts`: `test` → `test.fixme` plus comment.
- `.ai/runs/2026-11-20-issue-433-quarantine-test-l22.md`: this log.

## Commands and results

- `yarn verify`: all 18 steps passed (exit 0).
- `sg docker -c "yarn test:integration:vereino --filter TEST-L22"`: `1 skipped`, exit 0 (the test is reported as fixme, not run).

## Open problems / next steps

- #433 stays open: find the cause of the varying contrast nodes, fix it, remove the `fixme`.
