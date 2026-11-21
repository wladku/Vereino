# Run: PR #509 — required check `integration (shard 6/6)` red

- **Goal / trigger:** cezar task (om-auto-fix-pr) — drive PR #509 (issue #487, E20-S08) green after `integration (shard 6/6)` failed.
- **Branch:** `feat/issue-487-public-club-pages-no-js`, worked on a detached HEAD at `origin/feat/issue-487-public-club-pages-no-js`, pushed with `git push origin HEAD:feat/issue-487-public-club-pages-no-js`.
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md` (REQ-N15, AC-N15, TEST-N16).

## Steps

1. Read the shard 6 log (run 44742716081, job 136310124813): `TEST-N16 member and public pages load with a skeleton…` failed —
   `expect(locator('[data-skeleton="rows"]').first()).toBeVisible()` "element(s) not found" at `/p/<slug>`; retry #1 then
   failed on `route.continue: Route is already handled!`. 51 other tests passed.
2. Root cause: PR #509 renders `/p/[clubSlug]` on the server; `PublicClubView` receives `initial` and disables its browser
   query, so the browser never requests `/api/club_core/public/<slug>` and the skeleton that TEST-N16 waited for under a held
   request cannot appear. Classified as a **test bug** (the test pinned the pre-#487 client-only loading behavior), not a
   product regression — the server-rendered page has no loading state at all, which still satisfies AC-N15 ("no text loading
   message").
3. Merged `origin/main` (one commit, 9c811e6c, #502) into the branch — no conflicts.
4. Updated TEST-N16: the public page step now holds the browser read and asserts the club name is visible, no `[data-skeleton]`
   and no spinner, and that the browser issues no read of the club. Member-page skeleton checks are unchanged.
5. Spec changelog file for the navigation spec records the test change.

## Decisions

- Did not keep a skeleton assertion for the public page: the skeleton remains only in the fallback path (server read failed or
  rate-limited), which an integration test cannot trigger without a seam. The replacement assertions check the new behavior
  more strictly (no browser read at all).

## Files changed

- `packages/app/.ai/qa/tests/people/TEST-N16-member-skeletons-empty-states.spec.ts`
- `.ai/specs/changelog/2026-11-14-vereino-parity-navigation-and-naming/2026-11-20-issue-487-public-page-no-loading-state.md`
- `.ai/runs/2026-11-20-pr-509-test-n16-public-page.md`
- `.ai/lessons/frontend-page-server-data-and-metadata.md`

## Commands and results

- `yarn test:integration:vereino --filter TEST-N16` (after the main merge and the test change): `1 passed (1.1m)`.
- `yarn test:integration:vereino --filter E20-S08` (re-run after the main merge): `1 passed (40.5s)`.
- `yarn verify`: `all 18 step(s) passed`.
- Lesson `frontend-page-server-data-and-metadata` gained the rule to grep tests that hold a page's browser read.

## Open problems / next steps

- PR keeps `needs-qa`; merge stays with the merge train / `om-approve-merge-pr`.
