# Run: PR #883 merge-train failure (issue #847)

- **Goal / trigger:** cezar task — PR #883 carries `merge-train-failed` (`merge-train/verdict` = failure on 1f2cc774, "broke a batch on its own"); find why the train failed and fix it on the PR's branch, merge `main` in, never merge.
- **Branch:** detached HEAD at `origin/feat/issue-847-back-office-outline-pages`, pushed with `git push origin HEAD:feat/issue-847-back-office-outline-pages`.

## Steps

1. Read the failed batch run 46002401088 (`merge-train/batch`), job `integration (shard 6/6)` (140517161889): `ISSUE-847-backend-outlines-and-part-filter.spec.ts:163` failed on both attempts with `Expected: 200 / Received: 401` — the administrator's `GET /api/training/outlines/{id}` after the back-office save.
2. Root cause: `main` gained the staff second factor (#736 phase 1, #831): a club administrator's password sign-in now returns a challenge and needs the e-mailed code. The spec took the administrator's API token from the platform `getAuthToken` (`@open-mercato/core/helpers/integration/api`), which does not complete the code, so the token it got is refused. `main` moved every other spec to `getAuthToken` of `_fixtures/auth.ts`, which completes the second factor; this PR's new spec was written before that and was not moved. Classified as a **real test bug** surfaced by the merge with `main` (deterministic, not a flake).
3. Merged `origin/main` (b7334b9f) into the PR head without conflicts (merge commit signed off).
4. Switched the spec's import to `getAuthToken` from `../_fixtures/auth`. No other file of the PR used the platform helper or a raw `/api/auth/login`.
5. `yarn generate`, `yarn typecheck` (exit 0), `yarn guard`, and the integration tests `ISSUE-847-backend-outlines-and-part-filter` and `TEST-N01` locally (results below).

## Decisions

- The fix is in the test fixture import only; the feature code is unchanged. The assertion is kept as is (no weakening): the token now comes from a completed sign-in.

## Commands and results

- `yarn typecheck` — exit 0.
- `yarn guard` — "No blocking findings." (compared with b7334b9f).
- `yarn lessons:check` — catalog valid.
- `yarn test:integration:vereino --filter ISSUE-847-backend-outlines-and-part-filter` — 1 passed (it failed with 401 in the train batch).
- `yarn test:integration:vereino --filter TEST-N01` — 2 passed.
- Lesson `qa-tests-take-get-auth-token-from-the-auth-fixture` updated with this recurrence.

## Open problems / next steps

- After the push the train picks the PR up again (new head); `needs-qa` still waits for a human QA sign-off.
