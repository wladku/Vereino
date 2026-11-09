# Run — PR #238 (issue #117): red required checks `integration (shard 3/3)` and `integration`

- **Goal and trigger:** cezar task 4bdfe016 (`om-auto-fix-pr 238`), unattended: drive the failing required checks green, merge `main` in, never force-push, never merge.
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-club-payments.md` (phase 4 step 10); #117; `feat/issue-117-coach-group-payments`, worked on a detached HEAD at its origin tip and pushed with `git push origin HEAD:feat/issue-117-coach-group-payments`.

## Steps

1. Fetched `origin/main` and the PR branch: the branch already contains `main` (0 commits behind), so no merge was needed.
2. Read the failed CI run 42700081008. `integration` is the aggregate job; `integration (shard 3/3)` had:
   - `J-003-cancellation-announcement-case.spec.ts` step 5 — `expect(probe.result.failure).toBeNull()`, `Received: undefined`; it passed on retry #1 (reported as flaky). It is in `communication`/`foundation` dispatch, which the PR does not touch.
   - `E02-S03-member-accounts.spec.ts:135` failed on both attempts: `getByText(/Payments|Płatności/)` `Expected: 0`, `Received: 2`, with `Forbidden - missing required features … path: '/api/payments/group-charges' … requiredFeatures: [ 'payments.groups.view' ]` for the ward user.
3. Root cause: the new "My groups' payments" tile on `vereino:club:today:sections` declares `features: ['payments.groups.view']`, but the member `/club` spot mounts every widget regardless of `features` (the messages tile mounts for wards as well). The tile rendered its title while loading and on any failed read, so a ward saw "My groups' payments" ("Płatności moich grup").
4. Fix in `widgets/injection/club-coach-payments/widget.client.tsx`: the tile renders nothing while the first read is pending and nothing when the API answers 401/403 (status kept on a `CoachTileLoadError`); other failures still keep the link with the plain description, and a caller without groups still sees no tile.
5. Lesson `club-spot-widgets-hide-themselves-when-refused`.

## Decisions

- **Hide while pending** instead of showing a placeholder: non-coach members (parents, wards, adult participants) would otherwise see a coach-only title flash on every visit to `/club`.
- **No change to `J-003`**: it passed on retry, is unrelated to the PR's diff, and `main`'s last CI runs are green; it is not weakened or skipped.

## Files changed

`packages/app/src/modules/payments/widgets/injection/club-coach-payments/widget.client.tsx`, `.ai/lessons/club-spot-widgets-hide-themselves-when-refused.md`, this log.

## Commands and results

- `yarn generate` then `yarn typecheck` — passed (the first `yarn typecheck` failed only because `.mercato/generated` did not exist in the fresh worktree).
- `yarn lessons:check` — valid; `yarn format:check` — 0 unformatted.
- `yarn test:integration:vereino --filter E02-S03` — `7 passed (4.7m)` (the ward test that failed in CI included).
- `yarn test:integration:vereino --filter TEST-045` — `1 passed (1.9m)` (the coach's tile and page unchanged).

## Open problems

- `J-003` step 5 is flaky in CI (probe returned no result once); not in this PR's scope.

## Next steps

- CI re-run on the pushed commit; then the merge train (QA gate `needs-qa` stays).
