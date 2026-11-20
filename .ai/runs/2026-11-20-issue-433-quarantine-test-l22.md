# Run: quarantine TEST-L22 (#433)

- **Goal and trigger:** Cezar run started by the `cezar` label on issue #433 (opened by the CI failure ledger): `TEST-L22` failed in CI runs of unrelated PRs, so per `SDLC.md` ("Validation gate") it is quarantined with `test.fixme` in its own `priority-high` PR.
- **Issue / branch:** #433, `test/issue-433-quarantine-test-l22`. The PR uses `Refs #433`; the issue stays open to track the real fix.

## Steps

1. Claimed #433 (assignee, `in-progress`, 🤖 claim comment).
2. Checked `main` and the open PRs (#419, #422, #430, #431, #432) for a fix of TEST-L22: none.
3. Read the failed CI logs (runs 44646659366 on `feat/issue-307-coach-departure-handover` and 44642262124 on `feat/issue-378-admin-club-events-panel`, both integration shard 4/6). Both fail on the axe assertion `expect(...).toEqual({})`: a `color-contrast` (serious) violation in the move dialog / phone sheet, in a different set of variants per run (en light + pl light; en dark; en dark + en light + pl dark; pl dark). A violation that changes variant from run to run points at timing (for example a scan during an open/theme transition) rather than at a fixed token pair. Not investigated further: the quarantine is the order of this run.
4. Changed `test(` to `test.fixme(` in `packages/app/.ai/qa/tests/groups/TEST-L22-move-children-ui.spec.ts` with a comment that links #433. The body stays, so it is still type-checked.

## Decisions

- `test.fixme(title, fn)` instead of deleting or skipping assertions: the whole test is reported as skipped, the code keeps compiling, and lifting the quarantine changes one word back.

## Files changed

- `packages/app/.ai/qa/tests/groups/TEST-L22-move-children-ui.spec.ts`
- `.ai/runs/2026-11-20-issue-433-quarantine-test-l22.md`

## Commands and results

- `yarn verify`: `[verify] all 18 step(s) passed`.
- `yarn test:integration:vereino --filter TEST-L22`: `1 skipped`, exit 0 (the trailing "Next.js production server exited unexpectedly with exit code 143" line is the SIGTERM at shutdown).

## Open problems / next steps

- #433 stays open: find why the dialog/sheet axe scan sees a color-contrast violation in varying variants, fix the test or the UI, and turn `test.fixme(` back into `test(`.
