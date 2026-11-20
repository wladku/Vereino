# Run: quarantine TEST-L21 (#521)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` on #521, filed by the CI failure ledger: TEST-L21 failed in CI runs that share no PR (runs 44822840636, 44822751384). SDLC.md "Validation gate": quarantine with `test.fixme` in a `priority-high` PR that references the issue with `Refs #`.
- **Issue / branch:** #521, `test/issue-521-quarantine-test-l21`.

## Steps

1. Checked `main` and the open PRs for an existing fix: none mentions or touches TEST-L21.
2. Claimed #521 (assignee, `in-progress`, `🤖` claim comment naming this worktree).
3. Read the failed CI logs. Both runs (and their retries) fail at the B-10 history check (`TEST-L21-move-children.spec.ts:251`): Kuba's Żaki membership has `validFrom` 2026-10-21, the test expects `since` = 2026-10-22. Both ran at about 22:08 UTC = 23:08 Warsaw time.
4. Likely cause: the test computes `since = calendarDate(-30)`, which subtracts 30 × 86 400 000 ms. Between 23:00 and 24:00 Warsaw time (CET) that lands after midnight on the far side of the 25 October DST change (CEST), so one day later. The `familyFor` fixture (`_fixtures/attendance.ts:523`) creates Kuba's membership with `addDays(calendarDate(), -30)`, calendar arithmetic, which gives the expected day. So the test only fails in the last hour of the Warsaw day while the 30-day window spans a DST change.
5. Marked the test `test.fixme` with a comment linking #521 and naming the likely cause.

## Decisions

- Quarantine only, as the issue and SDLC.md ask; the real fix (use `addDays(calendarDate(), -30)` in the test, or make `calendarDate` offsets calendar-day based) stays on #521.

## Files changed

- `packages/app/.ai/qa/tests/groups/TEST-L21-move-children.spec.ts`: `test` → `test.fixme` plus comment.
- `.ai/runs/2026-11-20-issue-521-quarantine-test-l21.md`: this log.

## Commands and results

- `node -e` check of `calendarDate(-30)`: at 2026-11-20T22:08Z it returns `2026-10-22`, at 12:00Z `2026-10-21` (confirms the DST off-by-one).
- `yarn verify`: all 18 steps passed (exit 0).
- `yarn test:integration:vereino --filter TEST-L21`: `1 skipped`, exit 0 (the test is reported as fixme, not run).

## Open problems / next steps

- #521 stays open: fix the date arithmetic, remove the `fixme`. Other tests that compare `calendarDate(-N)` with fixture dates built by `addDays` may hit the same last-hour DST mismatch.
