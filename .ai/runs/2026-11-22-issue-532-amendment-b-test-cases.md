# Run: Amendment B test cases TEST-077…TEST-085 (#532)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` on #532 (label `cezar`). Build the club spec's amendment B test cases TEST-077…TEST-085 (research C gaps). These are tests only; a case that fails on `main` is filed as a defect instead of being weakened.
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` (*Integration Coverage* TEST-077…TEST-085, *Amendment B*); #532 (epic #461); `test/issue-532-amendment-b-test-cases`.

## Steps

1. Claimed #532 (assignee, `in-progress`, `🤖` claim comment naming this worktree). Checked that #528 (anonymisation clears order contacts and payer labels), which TEST-078 depends on, is merged (#535).
2. Split the nine cases into four Cezar child tasks. Each had its own worktree and a disjoint set of new files, and was told not to edit any shared fixture:
   - `045a25f6`: TEST-085 (facilities) and the TEST-079 unit test;
   - `7ee55eec`: TEST-083 and TEST-084 (activities);
   - `7f8d9390`: TEST-080, TEST-081 and TEST-082 (payments);
   - `8fc6378a`: TEST-077 (club_core) and TEST-078 (people).
   Each child ran its own tests locally plus `yarn verify` and committed. The parent read each diff and merged the branches one at a time with `--no-ff`.
3. Filed the three defects the tests found and linked them from the `test.fixme` comments:
   - #549: 25 or more concurrent `POST /api/payments/cash` requests exhaust the database pool and return 500. The likely cause is a second pooled connection taken inside `inWriteTransaction`.
   - #547: on the attendance list at 375 px, keyboard focus can land under the sticky action bar (WCAG 2.4.11).
   - #548: the e-mail and phone inputs on the kit order form can only be hit in a 20 px high strip (WCAG 2.5.8).
4. Recorded in the spec changelog where the tests read the spec rows differently (TEST-084, TEST-082, TEST-078, TEST-081).
5. Reran every new integration test locally on the merged branch, then ran `yarn verify`.

## Decisions

- **TEST-080:** the 50-request case is `test.fixme` (#549). A 15-request variant stays active and proves that the receipt numbering is consecutive, with no gaps or repeats.
- **TEST-083:** two cases are active (keyboard check-off and save; target sizes on `/club`, attendance and charges). The other two are `test.fixme` (#547, #548).
- **TEST-084:** the 2026 daylight-saving changes are in the past and the generator never creates past sessions. The test therefore replays the generator before the next changes and checks the same UTC shift. A pure check confirms that the oracle reproduces the spec's 2026 instants.
- **TEST-082:** a booking made by the bank import sends no receipt e-mail (REQ-030), so the precondition "receipt e-mail sent" cannot be set up. The test checks that undo writes a reversing payment and deletes nothing.
- **TEST-078:** asserts that `print_name` stays, as anonymisation does by design (`payments/services/departure-contribution.ts`).
- **Tracker writes:** only the parent run filed issues; the child tasks made no tracker writes.

## Files changed

- `packages/app/.ai/qa/tests/club_core/TEST-077-withdrawn-name-consent-public-page.spec.ts`
- `packages/app/.ai/qa/tests/people/TEST-078-anonymised-guardian-payer.spec.ts`
- `packages/app/src/modules/payments/lib/__tests__/payments-rules.test.ts` (TEST-079)
- `packages/app/.ai/qa/tests/payments/TEST-080-concurrent-cash-receipt-numbers.spec.ts`
- `packages/app/.ai/qa/tests/payments/TEST-081-bank-import-idempotency.spec.ts`
- `packages/app/.ai/qa/tests/payments/TEST-082-undo-automatic-bank-booking.spec.ts`
- `packages/app/.ai/qa/tests/activities/TEST-083-keyboard-attendance-and-target-size.spec.ts`
- `packages/app/.ai/qa/tests/activities/TEST-084-series-across-dst-and-pinned-attendance.spec.ts`
- `packages/app/.ai/qa/tests/facilities/TEST-085-concurrent-internal-bookings.spec.ts`
- `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-22-issue-532-amendment-b-test-cases.md`
- this log

## Commands and results

Child runs (each in its own worktree):
- TEST-085: 1 passed. TEST-079 (`jest -t TEST-079`): 2 passed.
- TEST-084: 2 passed. TEST-083: 2 passed, 2 skipped (fixme). Before the fixme, the focus case failed with `Tab 8: button radio "" at 46,600 20×20 under the bar at 0,595 375×121`, and the order-form case with `input[order-email] "" 317×20`.
- TEST-080: 1 passed (N = 15), 1 skipped (fixme). Before the fixme, the strict N = 50 run failed with `Expected 201 Received 500 {"error":"Internal server error"}`.
- TEST-081: 1 passed. TEST-082: 1 passed.
- TEST-077: 1 passed. TEST-078: 1 passed.
- `yarn verify` was green in every child.

Parent, on the merged branch: the first run built the app (`--filter TEST-077`), and the later runs used `--no-build`, one id per run:
- TEST-077: 1 passed. TEST-078: 1 passed.
- TEST-080: 1 passed, 1 skipped (fixme #549).
- TEST-081: 1 passed. TEST-082: 1 passed.
- TEST-083: 2 passed, 2 skipped (fixme #547, #548).
- TEST-084: 2 passed. TEST-085: 1 passed.
- `yarn verify`: all 18 steps passed.

## Open problems / next steps

- #547, #548 and #549: fix each defect, then remove the `fixme` from its case.
- The `print_name` and e-mail wording of the TEST-078 and TEST-082 rows is clarified in the changelog entry. The spec rows themselves are unchanged.
