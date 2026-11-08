# Run — issue #188: direct-thread refusals coverage and limit-count robustness (follow-up of #177)

- **Goal and trigger:** cezar task a636d699 (`om-auto-fix-issue 188`), unattended. Close the three non-blocking review items of #177 (#138, member direct threads): integration coverage of 422 `direct_no_recipients` and of the parallel daily-limit path, a limit count that does not rely on a side effect, and one shared definition of the text limits.
- **Spec / issue / branch:** foundation III (REQ-M12, DD-M18) — no spec change; #188 (`refactor`, `priority-low`, `risk-low`); `test/issue-188-direct-thread-refusals`.
- **Approval:** no Ask First item — no migration, dependency, new module or contract change.

## Steps

1. Claimed #188 (assignee, `in-progress`, claim comment); renamed the task branch.
2. Text limits: `SUBJECT_MAX` / `BODY_MAX` moved to `lib/thread-rules.ts` (pure, client-safe); `data/validators.ts` imports and re-exports them, `ClubNewMessagePage.tsx` imports them instead of re-declaring.
3. Limit count: `countDirectThreadsSince` now tells a member's direct thread by `scope_id is not null` instead of `section_id is not null`. `scope_id` is set only by `threads.start_direct` (the household member the thread is about, #187) and is documented on the entity as null for a staff-started thread, so it is a deliberate marker rather than a side effect of `services/targets.ts`. The coupling is documented in the query, at the `scopeId` assignment of `startDirectCommand` and on the entity column.
4. TEST-M12: Hania joins Orliki (no coach) → 422 `direct_no_recipients`; the daily limit now runs 3…19 sequentially, then three parallel POSTs for the 20th place → exactly one 201 and two 429 `direct_thread_limit`, then a 23rd → 429.

## Decisions

- **Marker without a migration:** a dedicated column would be a migration (Ask First). `scope_id` already distinguishes the two kinds since #187 and is the column the ward filter reads for the same purpose. Rows of member direct threads from before #187 have a null `scope_id`; the count only looks back 24 hours, so this cannot matter after one day.
- **422 case:** "a group with no coach today" (the issue's first option) — the simpler fixture; the author-as-only-coach case is covered by the unit tests of `addressedStaffIds`.

## Files changed

`packages/app/src/modules/communication/{lib/thread-rules.ts,data/validators.ts,data/queries.ts,data/entities.ts,commands/threads.ts,components/club/ClubNewMessagePage.tsx}`, `packages/app/.ai/qa/tests/communication/TEST-M12-member-direct-thread.spec.ts`, this log.

## Commands and results

- `yarn format` — 0 reformatted.
- `yarn test:integration:vereino --filter TEST-M12` — could not start: `Could not find a working container runtime strategy` (no running Docker on this machine; the run may not start Docker Desktop). CI runs it on the PR.
- `yarn verify` — all 14 steps passed (jest 65 suites, 761 tests).

## Open problems / next steps

- TEST-M12 is verified only by CI on the PR.
