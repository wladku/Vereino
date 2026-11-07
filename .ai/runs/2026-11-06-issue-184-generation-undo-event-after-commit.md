# Issue #184 — the generation undo emits `payments.charge.cancelled` only after the replay commits

- **Date:** 2026-11-06
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` via the cezar orchestrator (run 7d7322d4)
- **Trigger:** cezar task "184" (unattended)
- **Spec / issue / branch:** [#184](https://github.com/wladku/Vereino/issues/184) (found by the review of PR #183, issue #108); branch `fix/issue-184-generation-undo-post-commit-event`; spec `.ai/specs/2026-10-27-vereino-club-payments.md` (unchanged: timing only, the event contract stays)
- **Status:** completed

## Goal

The `payments.charges.generate` undo emitted the persistent `payments.charge.cancelled` inside the command bus's replay transaction. The bus writes the audit entry (`markUndone`) after the handler, in the same transaction, so a failing audit write rolled the cancellation back after the event had gone out. Done when the event is emitted only after the undo's transaction commits, with an integration case.

## Steps

1. Claimed #184 (assignee, `in-progress`, `🤖` claim comment naming the worktree and branch); renamed the task branch `cez/184` to `fix/issue-184-generation-undo-post-commit-event`.
2. Root cause: `commands/generate.ts` undo called `emitAfterCommit` at the end of the handler; with `atomicReplay: true` the handler never sees the commit (`command-bus.js` `undo` → `withAtomicFlush(replayEm, [… finishUndo …], { transaction: true })`, where `finishUndo` runs `handler.undo` then `service.markUndone`).
3. Found the bus's post-commit hook: `onTransactionLifetimeComplete(em, outcome => …)` exported from `@open-mercato/shared/lib/commands`; `withAtomicFlush` begins a transaction lifetime and completes it with `committed` or `rolled_back`, and the bus uses the same hook for an ambient outer transaction.
4. Added `emitAfterReplayCommit` to `payments/commands/shared.ts` (emits through `emitAfterCommit` only on `committed`) and used it in the generation undo.
5. Integration case in TEST-018: a QA-only probe (`.ai/qa/tests/_fixtures/payments-undo-probe/probe.mjs`, the token-link/messaging probe pattern) replays the undo token through the real command bus, records every bus emit, and with `failAuditWrite` makes `actionLogService.markUndone` throw. Asserted: the rolled-back undo returns the error, emits no `payments.charge.cancelled` and leaves the 5 charges open; the HTTP undo then still succeeds; a committed probe undo of the second generation emits the event exactly once with its generation id, scope and charge ids.
6. Lesson `undo-event-waits-for-replay-commit` + catalog row.

## Decisions

- Post-commit hook instead of a spec exception — the command bus has one (`onTransactionLifetimeComplete`), so the issue's first option applies.
- A probe process instead of reading the app's queue — the integration app does not enable the `example` module's QA event capture, and its local queue is drained by workers; the probe records emits in its own process with a private `QUEUE_BASE_DIR`, as the messaging probe does.
- Failure injected at `markUndone` — it is exactly the write the issue names ("the audit write fails") and runs after the handler inside the replay transaction.
- Other modules' undo handlers that emit custom events directly (e.g. `activities/commands/events.ts`, `occurrences.ts`) were left alone: outside #184's scope; noted as a follow-up in the PR.

## Files changed

- `packages/app/src/modules/payments/commands/shared.ts` — `emitAfterReplayCommit`
- `packages/app/src/modules/payments/commands/generate.ts` — the undo uses it
- `packages/app/.ai/qa/tests/_fixtures/payments-undo-probe/probe.mjs` — new QA probe
- `packages/app/.ai/qa/tests/_fixtures/payments.ts` — `undoInProbe`
- `packages/app/.ai/qa/tests/payments/TEST-018-fee-schedules-and-generation.spec.ts` — rolled-back and committed undo cases
- `.ai/lessons/undo-event-waits-for-replay-commit.md`, `.ai/lessons.md`

## Commands and results

- `node scripts/check-lessons.mjs` — valid.
- `yarn typecheck`, `yarn typecheck:qa`, `yarn format:check` — exit 0 (970 files, 0 unformatted).
- `yarn test:integration:vereino --filter TEST-018` with the fix — `1 passed (2.3m)`.
- Negative oracle: the same run with the old in-handler `await emitAfterCommit(…)` restored — `1 failed`:
  `expect(received).not.toContain(expected)` / `Expected value: not "payments.charge.cancelled"` / `Received array: ["payments.charge.cancelled"]` at `TEST-018-fee-schedules-and-generation.spec.ts:276`. Fix restored afterwards.
- `yarn verify` — `generate`, `typecheck`, `typecheck:packages`, `typecheck:qa` passed; `lint` failed on the gitignored Playwright HTML report (`packages/app/.ai/qa/test-results/html/trace/*.js`, minified `react-hooks/rules-of-hooks`) left by the negative-oracle run. Removed the report; `yarn verify --from lint` — `all 10 step(s) passed` (lint, format:check, ds:check, i18n:check-hardcoded, contracts:check, lessons:check, spec-changelogs:check, test, test:scripts, build). No source changed between the two runs.

## Open problems

- Other modules' undo handlers emit custom events directly inside the replay transaction (for example `activities/commands/events.ts` and `occurrences.ts`); they may have the same rollback leak. Out of scope for #184; noted in the PR as a follow-up.

## Next steps

- Review and merge the PR; decide on the follow-up for the other modules.

## Lessons recorded

- [`.ai/lessons/undo-event-waits-for-replay-commit.md`](../lessons/undo-event-waits-for-replay-commit.md)
