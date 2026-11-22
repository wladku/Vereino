# Run log — issue #596: TEST-R09 proves the renter's expiry e-mail and the partly paid rental on the unpaid list

- **Trigger:** Cezar run 6dc75229 (`om-auto-fix-issue`), queued by the `cezar` label on #596.
- **Issue:** #596 (epic #565). **Spec:** `.ai/specs/2026-11-14-vereino-parity-facilities.md`, AC-R05.
- **Branch:** `test/issue-596-renter-expiry-email`. **Route:** `direct` (test only) + `testing`.

## Steps

1. Claimed #596 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Read TEST-R09, the lifecycle command `facilities.rentals.advance_lifecycle` (emits `facilities.rental.cancelled` with the reason `unpaid_after_deadline` per expired rental), the subscriber `facilities:rental-cancelled-email` (`sendCancelledMail`, dispatch key `facilities:rental:<id>:<status>`, nothing without `contactEmail`) and the B-24 `unpaid` view filter (`lib/rental-record.ts`: a `requested` rental whose payment deadline has passed — against the real clock).
3. Extended `packages/app/.ai/qa/tests/facilities/TEST-R09-agreement-terms-and-expiry.spec.ts`:
   - the expiring and the partly paid rental carry a renter address (`uniqueAddress`);
   - after both lifecycle runs the expiring rental's renter has exactly one e-mail with the Polish `rentalCancelled.subject` whose text holds `rentalCancelled.unpaid`; at the end of the test (long after the second run) still one, and the partly paid rental's renter none;
   - the partly paid rental now starts within a day (`soonStart()`), so its deadline is the entry and the `unpaid` view lists it; the view now asserts it contains the partly paid rental too. The second owner's overdue rental starts at least three hours later (`soonStart(notBefore)`), and the lifecycle clock is derived from the first rental's deadline.
4. Ticked AC-R05 in the spec with the evidence; changelog file `.ai/specs/changelog/2026-11-14-vereino-parity-facilities/2026-11-22-issue-596-ac-r05.md`.

## Decisions

- **Move the partly paid rental's start instead of adding a fourth rental:** the `unpaid` view compares the payment deadline with the real clock, while the lifecycle job takes `--now`; a start next week has its deadline days ahead, so only a start within a day makes the partly paid rental "unpaid after the deadline" now. Reusing the same rental keeps the AC's sentence in one actor: the partly paid rental stays `requested` and is on the unpaid list.
- **"None on a second run" checked at the end:** the e-mail goes through a persistent subscriber, so an immediate count after the second run would prove nothing; the count is repeated after the browser part, when any second send would have arrived.
- **Spec status line untouched:** AC-R14 is still open, so the state stays `In progress` (AGENTS.md *Spec status line*).

## Commands and results

- `yarn test:integration:vereino --filter TEST-R09` → `1 passed (44.2s)`, exit 0.

## Open problems / next steps

- AC-R14 of the same spec remains open (separate issue).

## Follow-up run 2026-11-22 — merge-train conflict (om-auto-fix-pr, cezar run 9a2fdce9)

- **Trigger:** PR #615 labelled `merge-train-conflict` (DIRTY) after #608 (close-out III, #568) landed on `main`.
- **Steps:** detached HEAD at `origin/test/issue-596-renter-expiry-email`; `git merge origin/main`; one conflict in `.ai/specs/2026-11-14-vereino-parity-facilities.md` (AC-R05: this PR ticks it, `main` marked it `gap: #596`).
- **Decision:** took `main`'s file and re-applied only this PR's ticked AC-R05 line, so `main`'s `gap: #597` on AC-R14 stays (taking the PR's whole file would have dropped it). The status line stays as `main` wrote it (AGENTS.md *Spec status line*).
- **Tests:** `main` changed only docs and two module READMEs since this PR's base, and the conflict was in a spec, so no integration test was rerun; TEST-R09 is unchanged by the merge.
