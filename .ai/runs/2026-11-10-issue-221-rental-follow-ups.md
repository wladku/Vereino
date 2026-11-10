# Run — issue #221: E08-S02 follow-ups from PR #210 (closure replay locking, rental nits)

- **Goal and trigger:** cezar task e0e78147 (`om-auto-fix-issue 221`), unattended. Issue #221 lists the non-blocking review findings of PR #210 (E08-S02 staff rentals).
- **Spec / issue / branch:** facilities spec `.ai/specs/2026-10-27-vereino-facilities.md` (no change); #221; `fix/issue-221-rental-follow-ups`.
- **Approval:** nothing Ask First was done — no migration, dependency, module, contract or foundation API change.

## Steps

1. Concurrency check: #221 was assigned to `wladku` with no `in-progress` label, no claim comment and no PR referencing it. Claimed it (`in-progress` + `🤖` claim comment naming the worktree, branch and start time).
2. Triage: every item is still present on `main` (`ebeea88`).
3. Fixed the code-level items (below), added an integration case to TEST-027, extended a lesson.
4. `yarn verify`, then `yarn test:integration:vereino --filter TEST-027`.

## Items of #221 and what this run did

| Item | Outcome |
|---|---|
| Low: closure undo does not take the occupancy lock; redo of create skips `flagUnderClosure` | **Fixed.** The undo of `facilities.closures.update` and `.delete` takes the occupancy lock first, like execute. An undo that puts a closure back (undo of delete, undo of an update that moved it) and a redo of create or of a moving update flag the entries under it once the replay transaction commits, via `onTransactionLifetimeComplete` (`flagAfterReplayCommit`). A rolled-back replay flags nothing. |
| Nit: lifecycle job writes `--now` into `updatedAt` | **Fixed.** `advanceWhere` sets `updatedAt: new Date()`; `--now` still decides which rentals ended. |
| Nit: dead `row.chargeId == null` check on rental create | **Fixed.** Removed (a new row never has a charge). |
| Nit: `lockSchedule` moved from `activities.schedule:` to `vereino.occupancy:` | **No change.** It matters only while old and new instances run side by side, during the first rolling deploy that ships #210. A code change now cannot help that window, and going back to the old key would split the lock again. If needed, the operator deploys that release without overlap (stop, then start). |
| M1: occupancy provider reads on a forked EntityManager under the lock | **Left open.** Adding `em` to the foundation `OccupancyContext` is a contract change (Ask First) with no recorded approval. |
| L2: a move does not update a future charge's due date | **Left open.** Waits for `payments` DD-19, as the issue says. |
| L3: rental dialog converts wall times in the browser's zone | **Left open.** The facilities admin screens (rental dialog, week preview, rentals table) all use browser-local times through `rentals-client.ts`; a fix needs the club time zone on the client for all of them, which is a slice of its own (see #231 for the same class of bug on member pages). |
| L4: existing clubs get `facilities:rental-lifecycle` only when setup re-runs | **Left open.** It applies to every module schedule registered from `seedDefaults` (`expire-requests`, `maintenance-reminders`, activities, people), so the fix is a generic backfill (foundation or ops), not a facilities change. |
| L5: week preview lists only rentals of the exact place | **Left open.** Needs a rentals list filter over the place family (an API change) plus the place tree on the client. |
| Nit / product: a move to another place keeps the old amount | **Left open.** Product owner decision. |

## Decisions

- **Flags after the replay commit, not inside it.** The flags run in transactions of their own (DD-43) and the replay still holds the occupancy lock; running them inside the handler would also flag on a replay that later rolls back. The hook follows the lesson `undo-event-waits-for-replay-commit`, which this run extends to post-commit effects.
- **The replay result counts no flags.** The flag counts are known only after the commit; the audit undo/redo response does not show them, so `flagged` stays zero for a replay.
- **Undo of create takes no lock.** It only removes occupancy.

## Files changed

- `packages/app/src/modules/facilities/commands/closures.ts`
- `packages/app/src/modules/facilities/commands/rentals.ts`
- `packages/app/.ai/qa/tests/facilities/TEST-027-rental-occupancy.spec.ts` — new case: undo of delete, undo of update and redo of create each flag a rental entered on the freed slot.
- `.ai/lessons/undo-event-waits-for-replay-commit.md`
- this log

## Commands and results

- `yarn verify` (final, full, after every change) — `all 14 step(s) passed`, exit 0.
- `yarn verify` (first run) — failed at `lint`: `TEST-027-rental-occupancy.spec.ts 166:21 error ... @typescript-eslint/no-unnecessary-type-assertion` (a cast on the action log entry). Fixed by adding `id` to the `actionLogEntries` item type in `_fixtures/people.ts`; `yarn verify --from lint` — `all 10 step(s) passed`.
- `yarn test:integration:vereino --filter TEST-027` (first run) — `1 failed, 3 passed`: both undo cases passed; the redo answered `403 {"error":"Forbidden","requiredFeatures":["audit_logs.redo_self"]}` because no Vereino role grants redo. The case now gives the administrator's platform role `audit_logs.redo_self` before the redo, as TEST-F01 does.
- `yarn test:integration:vereino --filter TEST-027` (second run) — `4 passed (3.3m)`.

## Open problems / next steps

M1, L2, L3, L4, L5 and the product question stay open on #221 (or in split issues), as listed above.
