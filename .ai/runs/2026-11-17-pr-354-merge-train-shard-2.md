# Run: PR #354 — merge train failed on `integration (shard 2/3)`: real failure or flake

- **Goal and trigger:** cezar task (`om-auto-fix-pr 354`): PR #354 (E11-S08, issue #282) carries `merge-train-failed` because the required check `integration (shard 2/3)` concluded FAILURE; decide whether it is real or a flake, fix it, bring `main` in, push without rewriting history, never merge.
- **Spec / issue / branch:** `.ai/specs/implemented/2026-11-14-vereino-parity-facilities.md` (phase 8); issue #282; branch `feat/issue-282-facility-attendant-phone-rentals`, worked on a detached HEAD at its origin tip `db98172d` and pushed with `git push origin HEAD:feat/issue-282-facility-attendant-phone-rentals`.

## Steps

1. Read the failed job of CI run 44109279283 (head `db98172d`): one failure, `.ai/qa/tests/facilities/E08-S06-facility-day.spec.ts:111` — `expect(card.getByTestId('club-facility-entry-no-show')).toHaveCount(0)`, `Expected: 0`, `Received: 1`, on the first attempt and on retry #1. The earlier CI run 44087759693 (head `9a3073bb`) failed on the same line on both attempts.
2. Compared with the PR's diff: `ClubFacilityPage.tsx` now shows "No-show" on every rental that holds its slot (`offersNoShow`), answering `facilities.facility.noShow.tooEarly` before the start without an API call (`noShowTooEarly`). The spec's Today tab behavior requires exactly this ("Nie stawił się" is always present; before the start it answers `action.noShow.tooEarly` without calling the API), and TEST-R13 covers the click.
3. Verdict: **real failure, a stale assertion** in the older E08-S06 test (it asserted the pre-#282 rule that a rental not yet started offers no "No-show"). Not a flake: 4 of 4 attempts failed on the same assertion with the same value.
4. Updated E08-S06 to the new contract: the upcoming rental's card shows "No-show" (`toBeVisible()`); the "too early" answer stays covered by TEST-R13.
5. `origin/main` had no commits beyond the PR head (`git log HEAD..origin/main` empty), so no merge was needed.
6. Lesson `changed-ui-contract-search-older-tests-for-testid`.

## Decisions

- **Update the test, not the code:** the product rule changed on purpose and is written in the spec; reverting the UI would break AC-R09 and TEST-R13. The assertion now checks the new behavior instead of being dropped.
- **No duplicate tooEarly click in E08-S06:** TEST-R13 already proves the click answers "too early" without an API call.

## Files changed

- `packages/app/.ai/qa/tests/facilities/E08-S06-facility-day.spec.ts`
- `.ai/lessons/changed-ui-contract-search-older-tests-for-testid.md`
- `.ai/runs/2026-11-17-pr-354-merge-train-shard-2.md`

## Commands and results

- `gh run view 44109279283 --job 134130144432 --log-failed`: `1 failed` (E08-S06, retry included), `79 passed`.
- `yarn lessons:check`: `Lessons catalog is valid`.
- `yarn test:integration:vereino --filter E08-S06`: `ok 1 … E08-S06 facility day … (47.5s)`, `1 passed (1.8m)`, exit 0 (run at about 17:00 Warsaw on a Tuesday, so the upcoming 20:00 rental and the changed assertion were exercised).

## Open problems / next steps

- CI on the new head must rerun green; the merge train then picks the PR up again. `needs-qa` stays until a QA reviewer signs off.
