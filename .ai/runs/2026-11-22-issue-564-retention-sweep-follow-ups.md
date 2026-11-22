# Run: issue #564 — retention sweep follow-ups (from the review of #563)

- **Trigger:** Cezar run (task c431aa6b), `om-auto-fix-issue 564`, issue labelled `cezar`.
- **Issue / spec:** #564; club spec `.ai/specs/2026-10-20-vereino-club-management.md` REQ-041, TEST-086 (built by #563 / #471).
- **Branch:** `feat/issue-564-retention-sweep-follow-ups`, stacked on `feat/issue-471-anonymise-former-participants` (PR #563, still open). The PR targets that branch.
- **Route:** direct (follow-up fixes to code under review, no new contract, no migration).

## Goal

The three findings of #564, each with its acceptance criterion:

1. The sweep closes the person's open erasure request when it anonymises them, in the same transaction.
2. `--today` produces no false failures.
3. Overlapping runs do not count refusals as failures.

Item 4 (the payment checks running twice, cost, low) is left as the issue allows ("merge them if it ever matters").

## Steps

1. Claimed #564. First pass stopped: all the code lives only on the open PR #563, so a fix cut from `main` had nothing to change. I released the claim with a comment.
2. The owner told the run to continue autonomously. I re-claimed the issue and rebased the task branch onto `origin/feat/issue-471-anonymise-former-participants` (`c8c1a1d3`). A PR targeting #563's branch shows only this diff and carries no second copy of #563's migration.
3. `commands/erasure.ts`: for the sweep, `openErasureRequests` (new, `services/erasure.ts`) reads the person's open erasure requests. They are closed as `done` with `decidedAt` in the anonymisation's transaction. The result and the audit `requestId` name the oldest one. `erasure_request_and_decision` is kept in the audit only when the sweep closed a request.
4. `lib/retention-rules.ts`: `isRetentionRefusal(error)` returns true for a 409 with `code: 'anonymize_blocked'`, the rule refusing on the locked row (its reasons include `already_anonymized`). `services/retention-sweep.ts` counts such a refusal as `kept`, with no `onFailure` and so no telemetry error. Unit tests keep 100 % coverage.
5. `data/validators.ts`: `retentionSweepJobSchema` refuses `today` without `dryRun`. `cli.ts` prints the usage and throws (so `mercato` exits 1) for `--today` without `--dry-run`. A schedule that fails to register now also throws.
6. People README and spec changelog file updated.
7. TEST-086 extended:
   - a fifth person, E, with an open erasure request is anonymised; the request becomes `done`, and the audit entry has `requestId` and `erasure_request_and_decision`;
   - the real run is two overlapping CLI runs: each has `failed: 0`, and between them they anonymise exactly 2 people;
   - `--today` without `--dry-run` exits 1.

## Decisions

- **Close every open erasure request of the person, not one.** Each open request is a pending answer to the same person, and after the anonymisation none can be processed (409). The audit names the oldest one.
- **`--today` only with `--dry-run`** (the first option of acceptance 2). The command re-checks candidates against the real club date, so a real run on another day can only produce noise. A dry run is still useful for previewing a future date.
- **Only `anonymize_blocked` counts as kept.** Other 409s (for example a lock conflict) and every other error stay failures and are retried by the next run.

## Files changed

- `packages/app/src/modules/people/commands/erasure.ts`
- `packages/app/src/modules/people/services/erasure.ts`
- `packages/app/src/modules/people/services/retention-sweep.ts`
- `packages/app/src/modules/people/lib/retention-rules.ts`, `lib/__tests__/retention-rules.test.ts`
- `packages/app/src/modules/people/data/validators.ts`, `cli.ts`, `README.md`
- `packages/app/.ai/qa/tests/people/TEST-086-retention-sweep.spec.ts`
- `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-22-issue-564-retention-sweep-follow-ups.md`

## Commands and results

- `yarn install`, `yarn generate`: needed after rebasing the worktree onto #563's branch. The first `yarn typecheck` failed on missing `.mercato/generated` modules.
- `yarn typecheck`: exit 0.
- `jest src/modules/people/lib/__tests__/retention-rules.test.ts`: 9 passed.
- `yarn test:integration:vereino --filter TEST-086`, first run: **failed**:
  ```
  Error: expect(received).toThrow(expected)
  Expected pattern: /exited 1/
  Received function did not throw
  > 283 |     expect(() => mercato(sweepArgs(club, ['--today', calendarDate(200)]))).toThrow(/exited 1/)
  ```
  Cause: `@open-mercato/cli` ends with `process.exit(code ?? 0)` and returns 0 after any command that does not throw, so the `process.exitCode = 1` set by the command was lost. Fix: the retention-sweep command writes its usage to stderr and throws. This is recorded in the lesson `mercato-module-cli-exit-code`.
- First `yarn verify` after that fix failed at `i18n:check-hardcoded`: `throw-error` findings on the two new thrown messages. Fixed with `[internal] ` messages; the usage text stays on stderr.
- `yarn test:integration:vereino --filter TEST-086`: 1 passed (46.8 s, and 45.3 s after the last change).
- `yarn verify`: all 20 steps passed. `yarn guard`: no blocking findings.

## Open problems / next steps

- This PR merges into #563's branch. If #563 is squash-merged into `main` first, retarget this PR to `main` and rebase it onto `main`.
- Item 4 of #564 (the payment checks run twice per anonymisation) is not done, as the issue allows.
- About 30 other `process.exitCode = 1` usage errors in Vereino module CLIs also exit 0. Filed as a follow-up issue (see the PR).
