# Run: PR #422 — CI shard 5/6 red on TEST-046 (toast and history row match one getByText)

- **Goal and trigger:** cezar run (`om-auto-fix-pr`) — drive PR #422 (docs-only lesson update, no issue) back to merge-ready: required check `integration (shard 5/6)` failed and the merge train labelled it `merge-train-failed`.
- **Branch:** `docs/lesson-cezar-host-browser-tests`, worked on a detached HEAD at `origin/docs/lesson-cezar-host-browser-tests` (3744dce8, which already contains `origin/main` 81d53705), pushed with `git push origin HEAD:docs/lesson-cezar-host-browser-tests`.

## Steps

1. Read the failed CI run 44661770663. Only TEST-046 failed (`payments/TEST-046-cash-handover.spec.ts`, from #421, already on `main`), on both attempts: `locator.textContent: strict mode violation: getByText(/RG\/\d{4}\/\d{2}\/001/) resolved to 2 elements` — the toast `Handover RG/2026/11/001 accepted` and the history row `span[data-testid="handover-number"]`. 51 other tests in the shard passed. The PR changes two lesson files only, so the failure is not caused by its diff.
2. Merged `origin/main`: already up to date.
3. Root cause: after the accept, the page refetches the handover history; once the refetch lands while the toast is still up, the page-wide `getByText` regex matches both. On `main` (run 44661705064) the refetch landed after the read, so the test passed there — a timing race, i.e. a test bug.
4. Fix (`packages/app/.ai/qa/tests/payments/TEST-046-cash-handover.spec.ts`): read the number from `getByTestId('handover-number')` (waiting for it with `toHaveText([/RG\/…\/001/])`). The toast is still asserted with its full catalog text (`uiText('payments.cashCustody.accept.done', { params: { number } })`). No assertion was dropped or relaxed.
5. New lesson `toast-text-repeats-the-record-it-announces`.

## Decisions

- Fixed the test on this PR's branch (as in #430 for TEST-L22): it failed on both attempts, so a rerun would likely stop the merge train again.

## Verification

- `sg docker -c "yarn test:integration:vereino --filter TEST-046"` on the fixed head: 1 passed (36.3 s).
- `yarn lessons:check`: valid.
- `yarn verify`: all 18 steps passed.

## Files changed

- `packages/app/.ai/qa/tests/payments/TEST-046-cash-handover.spec.ts`
- `.ai/lessons/toast-text-repeats-the-record-it-announces.md`
- `.ai/runs/2026-11-20-pr-422-ci-test-046-toast-strict-mode.md`

## Open problems / next steps

- CI on the pushed head; the merge train re-takes the PR once `merge-train-failed` is cleared.
