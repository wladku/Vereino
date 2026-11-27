# Run: merge main into PR #891 (issue #800, phase 3)

- **Goal and trigger:** cezar task bf3637f4 (`om-auto-fix-pr 891`): PR #891 was `CONFLICTING` with `main`; merge `main` in without rewriting history, keep it green, never merge.
- **Issue / PR / branch:** #800 / #891 / `feat/issue-800-accepting-applications-freed-places` (worked on a detached HEAD at its origin tip `64ae3a09`, pushed with `git push origin HEAD:<branch>`).

## Steps

1. `git merge --no-ff origin/main` (main at `1f65dbf3`, #869 group sign-up QR among others). Six conflicts, all two independent additions to the same spot:
   - `.ai/qa/tests/_fixtures/isolation/inventory/enrolment.json`: kept both `POST /api/enrolment/applications/[id]/accept` (this PR) and `GET /api/enrolment/groups/[id]/sign-up-code` (#869).
   - `enrolment/lib/error-codes.ts`: accept codes plus `group_not_found`.
   - `enrolment/i18n/en.json`, `pl.json`: both key sets, sorted.
   - `enrolment/lib/__tests__/misc.test.ts`: both import lists (`clubPagePath`, `groupApplyPath`, `groupSignUpCodeApi`, `linkedGroup`).
   - `enrolment/README.md`: merged rows (accept route, sign-up-code route, `?group=` apply page, QR widget, phase 3 DI/subscribers/jobs).
2. Checked the auto-merged `people/commands/accounts.ts`: main's #868 share-invitation command is additive to this PR's `system_job` job context.
3. No migrations on the PR side; main's people migration comes in unchanged.

## Decisions

- Union resolution everywhere: no hunk changed behaviour on either side.
- No Ask First item touched by the merge (no new migration, dependency or contract beyond what each side already carried).

## Commands and results

- `yarn install --immutable`, `yarn generate`: ok.
- `yarn verify`: all 24 step(s) passed.
- `yarn test:integration:vereino --filter ISSUE-628-cross-club-isolation`: 1 passed (2.6m).
- `yarn test:integration:vereino --filter TEST-J07-accept`: 1 passed (1.0m).
- `yarn test:integration:vereino --filter E29-S02-group-sign-up-qr`: 1 passed (1.1m).

## Open problems / next steps

- CI on the pushed merge; QA gate (`needs-qa`) and the merge stay with the owner and the merge train.
