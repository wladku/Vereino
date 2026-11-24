# Run: issue #701 — TEST-M03 hook timeouts (instead of a quarantine)

- **Trigger:** Cezar run 25bd7b61 on `issue.labeled` (#701, `bug`, `priority-high`, `cezar`), skill `om-auto-fix-issue`.
- **Issue:** #701 (CI failure ledger asked to quarantine TEST-M03). **Branch:** `test/issue-701-quarantine-test-m03`.

## Goal

Stop `TEST-M03-club-address.spec.ts` failing in CI runs that share no PR.

## Decisions

- Real fix instead of `test.fixme`: the owner's comment on #701 gives the root cause and asks for the fix. `test.describe.configure({ timeout: 600_000 })` raises only the tests' timeout; the `beforeAll` hook kept the config's 20 s while it starts a second `next start` (up to 180 s) and creates two published clubs. CI failed with `"beforeAll" hook timeout of 20000ms exceeded` at line 48 (runs 45374383583, 45367384970).
- `beforeAll` gets `test.setTimeout(300_000)` (180 s app start + club setup), `afterAll` gets `test.setTimeout(120_000)` (`app.stop()` waits at most 10 s, plus two club cleanups).
- PR references the issue with `Fixes #701`, because no quarantine is left to track.

## Files changed

- `packages/app/.ai/qa/tests/club_core/TEST-M03-club-address.spec.ts` — hook timeouts.
- `.ai/lessons/playwright-hooks-keep-config-timeout.md` — new lesson.

## Commands and results

- `yarn test:integration:vereino --filter TEST-M03` — 3 passed (59.5 s): TEST-M03 club address, TEST-M02, TEST-M03 secrets.
- `yarn lessons:check` — catalog valid.
- `yarn verify` — all 22 step(s) passed.

## Open problems / next steps

None.
