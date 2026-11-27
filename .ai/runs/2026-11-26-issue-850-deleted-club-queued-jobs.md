# Run: #850 — AC-M06, a deleted club's queued BullMQ jobs (Deletion targets item 4)

- **Goal and trigger:** cezar task (om-auto-fix-issue) for issue #850, filed by the spec close-out of #842. The issue asked the owner to choose between a payload scan that deletes a deleted club's queued BullMQ jobs on the shared Redis and an amendment of *Deletion targets* item 4.
- **Spec / issue / branch:** `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md` (AC-M06, *Deletion targets* item 4, TEST-M07); #850 (epic #626); branch `docs/issue-850-amend-deletion-targets-queued-jobs`.

## Steps

1. Claimed #850 (assignee, `in-progress`, `🤖` claim comment naming this run's worktree and branch).
2. Read the owner's decision on #850 (2026-11-26, `OWNER`): do not build the payload scan; amend item 4; add a TEST-M07 assertion that the club's cache keys are gone while another club's stay if missing; tick AC-M06 (key destruction stays with #740).
3. Checked TEST-M07: it asserted tables, user-keyed rows and the logo file, but no cache entry. `deleteClub` (`club_core/services/club-offboarding.ts`) clears the club's cache scope with `runWithCacheTenant(tenantId, () => cache.clear())` after the commit.
4. Added to TEST-M07: one cache entry per club, written through `createCacheService()` + `runWithCacheTenant` into the store the app and the CLI share (the ephemeral run sets `CACHE_STRATEGY=sqlite` and `CACHE_SQLITE_PATH`, inherited by Playwright and the spawned CLI). The dry run keeps club A's entry; `delete-club` removes it and keeps club B's. The helper fails when `CACHE_STRATEGY` is `memory`, where a per-process store would prove nothing.
5. Amended the spec: item 4 now says pending one-off jobs end on their own (they find no rows), schedules are unregistered and cache entries cleared, no queued job is deleted on the shared Redis; the TEST-M07 row names cache entries instead of Redis/BullMQ keys; AC-M06 ticked with key destruction pointing to #740. Changelog entry `2026-11-26-issue-850-queued-jobs-end-on-their-own.md`.

## Decisions

- `delete-club` does not print `cacheEntriesCleared`; the test checks the store itself instead of widening the CLI output (a contract surface) for one assertion.
- The spec status line stays `In progress`: other ACs of the spec are still open.

## Files changed

- `packages/app/.ai/qa/tests/club_core/TEST-M07-club-export-delete-restore.spec.ts`
- `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md`
- `.ai/specs/changelog/2026-11-22-vereino-many-clubs-one-instance/2026-11-26-issue-850-queued-jobs-end-on-their-own.md`
- this run log

## Commands and results

- `yarn test:integration:vereino --filter TEST-M07` — 2 passed (1.8m): `club_core/TEST-M07-club-export-delete-restore.spec.ts` (51.5s) with the new cache assertions, and `communication/TEST-M07-session-cancellation.spec.ts`, which the filter also matches. The server log shows `QueryIndexScopeError` lines for `directory:organization` and `auth:role` events during club creation and deletion; they existed before this change and fail no assertion.
- `yarn verify` — all 23 steps passed (lint: 1 warning in `packages/ui/src/member/error-summary-model.ts`, pre-existing, not in this diff).
- `yarn guard` — no blocking findings.

## Open problems / next steps

- Key destruction with a key store stays with #740.
