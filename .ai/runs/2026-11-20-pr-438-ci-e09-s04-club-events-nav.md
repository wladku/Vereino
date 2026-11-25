# Run: PR #438 — CI integration shard 6/6 red on E09-S04 (club events in the member More menu)

- **Goal and trigger:** cezar task (om-auto-fix-pr) — drive PR #438 (issue #380, E14-S05 club events on the phone) back to green after `integration (shard 6/6)` failed; merge `main` in; no force-push, never merge.
- **Branch:** `feat/issue-380-section-coordinator-club-event`, worked on a detached HEAD at its origin tip `528b172a`, pushed with `git push origin HEAD:feat/issue-380-section-coordinator-club-event`.
- **Spec:** `.ai/specs/implemented/2026-11-18-vereino-club-events-with-parts.md` (REQ-T12) — unchanged by this run.

## Steps

1. Read CI run 44673516593, job `integration (shard 6/6)`: one failure, retried once with the same result:

   ```
   E09-S04-member-bottom-bar.spec.ts:296 › E09-S04 the same bottom bar on every member page and every member page reachable from More
   Error: expect(received).toEqual(expected) // deep equality
   -   StringMatching /^(?:Admin panel|Panel administracyjny)$/,
   +   "Imprezy klubowe",
   +   "Panel administracyjny",
   ```

2. Classified as a **test bug caused by an intended change**: the PR adds `/club/club-events` to `MEMBER_MORE_DESTINATIONS` behind `activities.manage`, which a section coordinator holds. E09-S04 asserts the coach-coordinator's exact More list, written before the entry existed. The PR's own TEST-T12 passed in the same CI run.
3. Merged `origin/main` (`9f036b5c`) into the PR head: no conflicts (lessons, a run log, `TEST-046-cash-handover.spec.ts`; no overlap with the PR).
4. Updated E09-S04: the coach-coordinator's exact More list now expects `people.club.nav.clubEvents` before the admin panel (order of `MEMBER_MORE_DESTINATIONS`), and the administrator's `arrayContaining` check also expects it. No assertion weakened.
5. Ran the test locally: `sg docker -c "yarn test:integration:vereino --filter E09-S04"` — result below.

## Files changed

- `packages/app/.ai/qa/tests/people/E09-S04-member-bottom-bar.spec.ts`
- `.ai/runs/2026-11-20-pr-438-ci-e09-s04-club-events-nav.md` (this log)

## Results

- Local `E09-S04`: `1 passed (57.2s)` — `✓ E09-S04 the same bottom bar on every member page and every member page reachable from More (28.9s)`, Chromium, Testcontainers PostgreSQL, under `sg docker`.

## Open problems / next steps

- PR keeps `needs-qa`; the merge train and a QA reviewer own the rest.
