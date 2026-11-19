# Run — reschedule notices: batch the per-entry reads, cover a moved window (#394)

- **Trigger:** Cezar run 9bef6322 (`om-auto-fix-issue`), issue label `cezar` on #394 (follow-up of the #387 review).
- **Issue:** #394 — labels `refactor`, `priority-low`, `risk-low`.
- **Branch:** `refactor/issue-394-reschedule-notice-batch-reads`.
- **Route:** `module-data` (facilities, people) + `debugging`-free refactor; delivery `direct` (no spec change: behavior unchanged).

## Goal

1. The closure / maintenance save makes a number of reads that does not grow with the number of flagged entries.
2. TEST-R18 covers a moved window: only the added entries are announced, to the right people.

## Steps and decisions

1. Read `facilities/services/reschedule-notice.ts`. Reads that grew with entries: one coordinator lookup per
   (section, day) and one `findOneWithDecryption` per flagged rental.
2. **Coordinators:** added `sectionCoordinatorIdsOnDays(scope, pairs, em)` to `people.personDirectory` (additive DI
   method, BACKWARD_COMPATIBILITY.md §"Prefer additive"): one `RoleAssignment` read over the sections and the span of
   the days, then the pure `holdersBySectionDay` (`people/lib/section-role-holders.ts`, `Validity.isActiveAt`) picks
   each pair's holders. Facilities' `sectionCoordinatorIds` (its only caller was the notice) became
   `sectionCoordinatorIdsOnDays`.
3. **Rentals:** one `findWithDecryption` read of all flagged rentals serves both the entries and the renters' e-mails
   (address and language are encrypted), replacing the plain read plus one decrypting re-read per rental.
4. **Kept per person:** `resolveMembers` and the dispatch transaction stay one per notified person — they grow with
   distinct people (coordinators, coaches, bookers, admins, renters), not with entries; batching `resolveMembers` would
   lose which guardians belong to which minor's notice. Moving the notices to a queued job was not needed for the
   acceptance and would change when messages are sent.
5. **TEST-R18:** a final step moves the closure to 09:00–19:00 (after the browser part, which checks that the 18:00
   session is not "to move" yet): `flagged = { sessions: 1 }`, a second notice of the closure for both academy
   coordinators and the coach, whose third e-mail lists 18:00–19:00 and neither earlier session; still one notice for
   the booker and the administrator, and no new e-mail to the booker or the renter.

## Files changed

- `packages/app/src/modules/people/lib/section-role-holders.ts` (new) + `lib/__tests__/section-role-holders.test.ts`
- `packages/app/src/modules/people/services/person-directory.ts`
- `packages/app/src/modules/facilities/services/directory.ts`
- `packages/app/src/modules/facilities/services/reschedule-notice.ts`
- `packages/app/src/modules/facilities/lib/reschedule-notice.ts` (comment)
- `packages/app/.ai/qa/tests/facilities/TEST-R18-reschedule-notices.spec.ts`

## Commands and results

- `npx jest section-role-holders reschedule-notice` → 2 suites, 13 tests passed.
- `yarn verify` → all 18 steps passed (generate … build).
- `yarn test:integration:vereino --filter TEST-R18` → failed before any step, on the host:
  `chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0: cannot open shared object file`
  (lesson `cezar-host-integration-runs-without-browser`; installing system libraries is out of scope).
- Temporary API-only copy (`TEST-R18API-tmp.spec.ts`, the browser part removed, deleted before the commit):
  `yarn test:integration:vereino --filter TEST-R18API` → 1 passed (7.6s), including the moved-window step.
  The browser steps of TEST-R18 (unchanged by this run) are proven only in CI.

## Open problems / next steps

- None known.
