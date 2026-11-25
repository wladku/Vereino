# Run: issue #754 — TEST-T02 fails in CI runs that share no PR

- **Trigger**: Cezar run `om-auto-fix-issue 754` (the `cezar` label was added to the ledger issue, 2026-11-25).
- **Issue**: #754 (CI failure ledger asks to quarantine `TEST-T02`).
- **Branch**: `fix/issue-754-staff-email-ascii`.

## Steps

1. Read both failing runs (`gh run view 45616729085|45616841827 --log-failed`). Both runs came from PR branches, `docs/privacy-move-research-anonymise-club` (#746) and `docs/mockup-current-app` (#750). The only error was in run 45616841827: `create account {"error":"Validation failed",…"path":["email"],"message":"Invalid email address"}`, `Expected: 201 Received: 400`, at `TEST-T02-club-event-parts.spec.ts:63`.
2. Checked `main` and the open PRs. No fix exists, and the test is not changed on `main`.
3. Compared the two branches. Both carry the same anonymisation change, which renames the coordinator to the fictional `Rafał`. `createStaff` in `_fixtures/club.ts` built the email from the lowercased first name (`rafał-…@example.org`), and the API rejected it as an invalid email.
4. Decision: no quarantine, because the test is green on `main` and the failure has a known cause. I fixed the fixture instead. `emailLocalPart` folds the first name to ASCII (`ł` → `l`, NFKD, drops anything that is not `[a-z0-9]`, falls back to `staff`). This fixes every test on those PRs that creates staff with a Polish first name.
5. Lesson `ci-ledger-quarantine-check-each-run-first` gained the #754 case and a rule: diff the failing runs' branches against each other.

## Files changed

- `packages/app/.ai/qa/tests/_fixtures/club.ts`
- `.ai/lessons/ci-ledger-quarantine-check-each-run-first.md`
- this log

## Commands and results

- `yarn test:integration:vereino --filter TEST-T02` with line 64 temporarily changed to `firstName: 'Rafał'` (the PRs' version), then reverted: `1 passed (49.1s)`.
- `yarn test:integration:vereino --filter TEST-T02` on the branch as committed: `1 passed (48.6s)`.
- `yarn verify`: `[verify] all 22 step(s) passed`.

## Open problems / next steps

- After this merges, #746 and #750 pick the fix up when the merge train updates them. They do not need to change their tests.
