# Run: PR #515 — integration shard 4/6 red on the `/club` rental page

- **Goal and trigger:** cezar task (om-auto-fix-pr on PR #515, issue #497): the required check `integration (shard 4/6)` failed; merge `main` in and make CI green without weakening a test.
- **Branch:** `fix/issue-497-platform-accessibility-gaps` (worked on a detached HEAD at its origin tip, pushed with `git push origin HEAD:fix/issue-497-platform-accessibility-gaps`).

## Steps

1. Read the failed job log (run 44752023011, job 136346744949): `TEST-R13 the attendant on the phone` failed twice at
   `scanInColorSchemes(page, testInfo, '/club/facility/rentals/[id] (pl)', …, { platformBaseline: true })` with axe
   `label` (critical, 5 nodes) in both color schemes.
2. Root cause: the PR removed the `CrudForm` `label` / `button-name` entries from the axe platform baseline because
   `PlatformA11yRepairs` now names those controls, but the repairs were mounted only in the backend layout
   (`src/app/(backend)/backend/layout.tsx`). The `/club/...` member pages render through the frontend layout
   (`src/app/(frontend)/layout.tsx`), so the rental page's `CrudForm` controls kept no accessible name.
3. Fix: mount `PlatformA11yRepairs` in the frontend layout as well (both the plain member/public branch and the portal
   shell). The test and its baseline stay as the PR left them. Comments in `_fixtures/axe.ts`,
   `packages/ui/src/admin/platform-a11y-repairs.tsx` and lesson `platform-crudform-labels-axe-baseline` now name both layouts.
4. Merged `origin/main` (f68aed41) into the branch; no conflicts.

## Decisions

- Mount the repairs instead of restoring the baseline entries: the lesson's rule says a scan that reports these rules
  again means the repair missed a control — fix the repair, do not restore the baseline.

## Files changed

- `packages/app/src/app/(frontend)/layout.tsx`
- `packages/ui/src/admin/platform-a11y-repairs.tsx` (comment)
- `packages/app/.ai/qa/tests/_fixtures/axe.ts` (comment)
- `.ai/lessons/platform-crudform-labels-axe-baseline.md`

## Commands and results

- `yarn install && yarn generate && yarn typecheck` — exit 0.
- `yarn test:integration:vereino --filter TEST-R13` — `1 passed (52.4s)`, exit 0 (failed in CI before the fix with axe `label`, 5 nodes).

## Open problems / next steps

- Other shards (1, 2, 5, 6) were still running on the old head when this run started; the push re-runs them all.

## Follow-up (same run)

- CI run 44762924667 on f06276e2: every job green, including all six integration shards.
- `main` then advanced (2ea3122b, #485) and the PR became `CONFLICTING`. Merged `origin/main` again; the only conflict was
  the `CONTRIBUTING.md` app-files table (backend layout row): kept both changes and added a row for
  `(frontend)/layout.tsx`. `yarn generate && yarn typecheck` exit 0;
  `yarn test:integration:vereino --filter E20-S18` — `1 passed (1.1m)`, exit 0.
