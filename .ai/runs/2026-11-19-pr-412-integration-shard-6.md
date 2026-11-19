# Run: PR #412 — integration (shard 6/6) red

- **Goal and trigger**: cezar task (`om-auto-fix-pr 412`): the required check `integration (shard 6/6)` failed on PR #412 (issue #309, E13-S07, adult participant's own consents and the club's consent texts) and the merge train skipped it. Bring main in, make the check green, never merge.
- **Issue / PR / branch**: #309 / #412 / `feat/issue-309-adult-participant-consents` (worked on a detached HEAD at its origin tip, pushed with `git push origin HEAD:feat/issue-309-adult-participant-consents`).

## Steps

1. Read the failed job log (run 44461060678, job 135347791948): 2 failed, 41 passed. Both failures repeated on the retry, so neither is a flake.
   - `TEST-L11-own-consents.spec.ts:324` — `expect(getByRole('dialog')).toContainText(…)`: `element(s) not found` (20 s).
   - `TEST-L12-consent-texts.spec.ts:174` — `updateClubSettings(…, admin, …)`: `Expected: 200, Received: 401 {"error":"Unauthorized"}`.
2. Merged `origin/main` (20e81a5e, #396) into the head; no conflicts.
3. Root causes (both test bugs, the product code is correct):
   - TEST-L11: the withdrawal confirmation comes from the platform `useConfirmDialog`, a native `<dialog role="alertdialog">`; `getByRole('dialog')` never matches it. Switched both lookups to `getByRole('alertdialog')` (as TEST-C05 and TEST-U07 do).
   - TEST-L12 (UI test): `signInBrowser` for the administrator resets the password and ends the token `createClub` returned; the later restore call used it. The test now takes a fresh token from the returned password (lesson `sign-in-browser-ends-the-api-token`).
4. Lessons: new `confirm-dialog-is-an-alertdialog`; recurrence added to `sign-in-browser-ends-the-api-token`. `yarn lessons:check` passes.

5. After the first push `main` advanced (fbd57f7d, #409) and the PR went `DIRTY`, so CI did not run. Merged it again: the only conflict was the import block of `people/services/person-directory.ts` (this PR's `people-rules` consent imports next to main's `section-role-holders` import); kept both. `yarn typecheck`, `yarn typecheck:qa`, `yarn lint` (0 errors), `yarn format:check` and `jest src/modules/people` (13 suites, 239 tests) pass on the merge result.

## Decisions

- Fixed the tests, not the component: the dialog role and the token ending are the platform's documented behaviour; no assertion was weakened.

## Files changed

- `packages/app/.ai/qa/tests/people/TEST-L11-own-consents.spec.ts`
- `packages/app/.ai/qa/tests/people/TEST-L12-consent-texts.spec.ts`
- `.ai/lessons/confirm-dialog-is-an-alertdialog.md` (new), `.ai/lessons/sign-in-browser-ends-the-api-token.md`
- this run log

## Commands and results

- `yarn lessons:check` — valid.
- `yarn test:integration:vereino --filter TEST-L11` — API test `TEST-L11 an adult participant gives and withdraws own consents…` passed (9.6s); the browser test could not start on this host: `chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0` (lesson `cezar-host-integration-runs-without-browser`), so its fix is proven only by CI
- `yarn test:integration:vereino --filter TEST-L12` — API test `TEST-L12 the club changes a consent text…` passed (5.0s); the browser test hit the same `libatk-1.0.so.0` launch failure, CI only
- `yarn typecheck:qa` — exit 0; `yarn qa-texts:check` — 0 problems; `yarn format:check` — 0 unformatted; `yarn lint` — 0 errors (after deleting the local Playwright HTML report in the ignored `test-results/`, which lint otherwise scans)

## Open problems / next steps

- CI on the pushed head decides the merge train; the PR keeps `needs-qa` for the human QA sign-off.
