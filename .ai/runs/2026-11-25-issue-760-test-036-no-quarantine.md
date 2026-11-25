# Run: issue #760 — TEST-036 fails in CI runs that share no PR

- **Trigger**: Cezar run `om-auto-fix-issue 760` (the `cezar` label on the CI failure ledger issue, 2026-11-25).
- **Issue**: #760 (the ledger asks to quarantine `TEST-036`).
- **Branch**: `docs/issue-760-test-036-no-quarantine`.

## Steps

1. Read both failing runs (`gh run view 45616729085|45616841827 --log-failed`). Run 45616729085 ran on #746 (`docs/privacy-move-research-anonymise-club`), run 45616841827 on #750 (`docs/mockup-current-app`), whose branch merged #746's branch. In both, TEST-036 failed at `TEST-036-request-security.spec.ts:128` inside `createStaff` (`_fixtures/club.ts:268`): `create account {"error":"Validation failed",…"path":["email"],"message":"Invalid email address"}`, `Expected: 201 Received: 400`. The same error failed many other tests in those shards (E08-S03, TEST-026, TEST-033, TEST-T02, TEST-T04, TEST-T11).
2. Cause: #746 renames the coach `Wojtek` to `Rafał` in line 128 of TEST-036, and `createStaff` built the email from the lowercased first name (`rafał-…@example.org`), which the account API rejects. On `main` the test still uses `Wojtek`.
3. Checked for an existing fix: #746 now builds the email with `testEmailFor` (ASCII-folded) on its own branch, and the open PR #772 (#754) folds the name to ASCII in `createStaff` on `main`. The same cause was already reported for TEST-T02 (#754) and TEST-T11 (#756, docs PR #773).
4. Ran TEST-036 locally on `main` (`d4caa260`) to confirm it is green there.
5. Decision: no quarantine. The test is green on `main` and the failure belongs to #746, which already fixes it; the issue's own instruction is to comment the link instead. The lesson `ci-ledger-quarantine-check-each-run-first` already gets this case and rule from #772, so this run edits no lesson (it would only conflict with #772 and #773).

## Files changed

- this log

## Commands and results

- `yarn test:integration:vereino --filter TEST-036` on `main` (`d4caa260`): `1 passed (47.8s)`.

## Open problems / next steps

- The owner closes #760 once #746 (and #772) merge; nothing else to do for TEST-036.
