# Run: PR #425 — integration (shard 2/6) red

- **Goal / trigger:** cezar task (om-auto-fix-pr) — required check `integration (shard 2/6)` on PR #425 (issue #377) concluded FAILURE.
- **Branch:** `feat/issue-377-coordinator-adds-external-place` (worked on a detached HEAD, pushed with `HEAD:<branch>`).

## Steps

1. Read the failed job log (run 44611493911): `TEST-T07` failed at line 111 —
   `expect(eventOptions.body?.places).toContainEqual({ id: hallId, label: HALL.name })`;
   received `{ id, isExternal: true, label: "Hala sportowa w Zielonym Lesie" }`.
2. Root cause: main (#426, activities events through the API) added `isExternal` to each place of
   `GET /api/activities/events/options`; the PR's test asserted the older exact shape. Test bug, not a product bug.
3. Merged `origin/main` into the PR head (clean merge).
4. Tightened the assertion to the current contract: `{ id, label, isExternal: true }` (the coordinator's place is external, so this also checks the flag).

## Commands and results

- `yarn typecheck` — exit 0 (a first run raced a `yarn install` and reported duplicate React types; rerun clean).
- `yarn test:integration:vereino --filter TEST-T07` — `1 passed (35.0s)`.

## Files changed

- `packages/app/.ai/qa/tests/club_core/TEST-T07-external-place.spec.ts`
- this run log

## Open problems / next steps

- None from this run; CI re-runs on push. The PR keeps `needs-qa`; merge stays with the merge train / `om-approve-merge-pr`.
