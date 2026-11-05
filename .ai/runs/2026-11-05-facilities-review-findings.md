# Facilities spec: resolve the 2026-10-26 architectural-review findings (#167)

- **Date:** 2026-11-05
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` (documentation route), cezar worktree `145c8ae5`
- **Trigger:** cezar task "167"
- **Issue / branch:** #167, `docs/issue-167-facilities-review-findings` from `main` at `75d999a`
- **Spec:** `.ai/specs/2026-10-27-vereino-facilities.md` (phase 5, E08 #119)
- **Status:** completed, PR open for review

## Goal

Resolve every facilities-related finding of the 2026-10-26 architectural review (`.ai/runs/2026-10-26-spec-architectural-review.md`) in the facilities spec, by design or with evidence that merged work already resolves it, and mark the spec `Ready for implementation` when nothing blocking remains.

## Steps

1. Concurrency check: no assignee, no `in-progress`, no open PR referencing #167. Claimed the issue (assignee, `in-progress`, `🤖` comment); branch renamed from `cez/167`.
2. Read the review summary (the detailed report was never saved), the facilities spec, foundations I–III and the code on `main`:
   - `foundation/services/dispatch.ts` and `dispatch-worker.ts` (#71): `secrets` on enqueue go to the encrypted `secret_params` of the e-mail delivery; the worker renders with them and logs ids only; `foundation_dispatches_org_key_unique` makes the idempotency key unique per organization; TEST-M03 exists in `.ai/qa/tests/foundation/messaging/`.
   - `activities/data/queries.ts` `lockSchedule` (#31): a `pg_advisory_xact_lock` per organization around every session write (series, move, one-off event, generator, undo); `activities/services/schedule.ts` consults `vereino.occupancyProvider` and fails closed on save; `activities/commands/jobs.ts`: the generator checks conflicts in `save` mode and flags `needs_reschedule`.
   - `foundation/services/transitions.ts` (`advanceWhere`, `a73ab3a`), `activities/cli.ts` (`expire-guardian-confirmations --now`, #32), `club_core/api/public-shared.ts` (`PUBLIC_CACHE_CONTROL = 'public, s-maxage=60'`, #29).
   - Foundation I P-10 (token link service) is issue #157, still open.
3. Wrote the designs into the spec: the DD-19 transaction contract; DD-43 (occupancy lock); DD-44 (request-link e-mail); DD-45 (public calendar cache); DD-46 (transitions, idempotency keys, test clock); a TypeScript and DI contracts table and `requires`; vocabulary, data model (encrypted free text, `facilities_logs` unique key), API (verify token in the body), events, security, TEST-058 and additions to TEST-023 and TEST-035, phase dependency on foundation I phase C, deliverables, step 3, traceability, rollback, a risk row; the *Architectural Review Resolution* table; compliance, verdict, phase readiness, status and Changelog.
4. Payments spec: the `payments.chargeService` sentence points to the DD-19 contract, with a Changelog row. Review run log: a pointer under *Open problems*.

## Decisions and reasons

- **Occupancy race → one advisory lock per organization shared with `activities` (DD-43).** `activities` already serializes session writes this way; sharing the lock (moved to `foundation` as `lockOccupancy`, `lockSchedule` delegating) makes the check-then-write atomic across both modules without a migration. A place row lock misses the place tree; an exclusion constraint cannot span sessions and four `facilities` tables or express `capacity_groups`; `SERIALIZABLE` needs retry loops. Lock order (occupancy lock before any row lock) plus post-commit flagging of sessions avoids deadlocks.
- **Request link → P-10 + `dispatch` secret (DD-44).** Foundation III already carries link secrets safely; the remaining risks were the API path and the referrer, so the verify API takes the token in the body and the page sends no referrer. This changes the planned verify route path; it is not built or deployed, so no compatibility surface moves.
- **DD-19 idempotency through `charge_id IS NULL` under the row lock**, not a new unique key in `payments`, so no payments migration is needed.
- **Public cache: none on the server (DD-45)**, matching the public club pages; the write path re-checks under the lock.
- **Reminder markers are dispatch keys (DD-46)**, so no marker column.
- DD-43…DD-46 are autonomous defaults the product owner may override; none needs a migration, module or dependency. The Ask First items of the build (the `facilities` module and its migration, the `club_core` `opening_hours` migration) are unchanged and listed in the compliance report.
- Q18 and Q04 are treated as non-blocking by D30 (product owner, 2026-11-04, stated in #167; the decision record is in PR #158). That PR edits the same status line, verdict and Changelog of the facilities spec; whichever PR merges second resolves those lines.
- The backlog's E08 rows were not touched: their last column is *Adopted*, not readiness.

## Not reconstructable

- The detailed report was not saved. Every severity bucket of the summary was mapped; no further facilities finding can be recovered, which the resolution table says in its last row.
- Retention of requester contact data stays with the owner's GDPR decision (club spec Q-019); recorded as non-blocking.

## Files changed

- `.ai/specs/2026-10-27-vereino-facilities.md`
- `.ai/specs/2026-10-27-vereino-club-payments.md`
- `.ai/runs/2026-10-26-spec-architectural-review.md`
- `.ai/runs/2026-11-05-facilities-review-findings.md` (this log)

## Commands and results

- `yarn format:check` and `yarn lessons:check`: see the PR description (run before the commit).

## Next steps

1. Review and merge; then merge or rebase PR #158 on the shared lines.
2. Build phase 5 after #157 (P-10); the `lockOccupancy` move ships with E08-S02 (#122), which re-runs `activities`' TEST-007, TEST-012 and TEST-034.
