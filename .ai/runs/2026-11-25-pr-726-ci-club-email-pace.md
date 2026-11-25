# Run: PR #726 CI fix — club e-mail pace held in the worker (TEST-M08)

- **Goal and trigger:** cezar task (om-auto-fix-pr) to fix the failed required check `integration (shard 2/6)` on
  PR #726 (issue #633, many-clubs spec phase 5) and merge `main` in. Never merge, never force-push.
- **Branch:** `feat/issue-633-capacity-test-and-limits` (worked on a detached HEAD, pushed with `HEAD:<branch>`).

## Steps

1. Merged `origin/main` into the PR head (no conflicts).
2. Read the shard log: only `TEST-M08-club-limits` failed, on both attempts, at
   `expect(maxSendsPerWindow(floodSends, 999)).toBeLessThanOrEqual(3)` — received 4.
3. Root cause: club A's pace (2 per second, DD-M10) was set only by enqueue delays (`paceClubEmails` →
   `delayMs`). A delay is a "not before" time; on the slower CI runner jobs ran late and the next drain round took
   several due jobs at once, so 4 of club A's e-mails left within one second. Not a test bug: DD-M10 asks for a
   per-club bucket inside the worker, and the worker had none.
4. Fix: `createClubSendRateLimiter` in `foundation/lib/dispatch-rules.ts` (one sliding-window limiter per club, at most
   2 per 1000 ms, idle clubs forgotten above 100 held clubs, never one with a caller waiting); the dispatch worker
   takes the club's slot before the process's 8-per-second slot, so a waiting club holds no process slot.
5. Lesson `queue-delays-do-not-cap-a-rate`.

## Decisions

- Kept the test's assertion as written: it states the pace the spec promises; the code now guarantees it.
- Club slot before the process slot: taking the process slot first would let one waiting club block others' sends.

## Files changed

- `packages/app/src/modules/foundation/lib/dispatch-rules.ts`, its unit test
- `packages/app/src/modules/foundation/services/dispatch-worker.ts`
- `packages/app/src/modules/foundation/lib/club-limits.ts` (comment)
- `.ai/lessons/queue-delays-do-not-cap-a-rate.md`, this log

## Commands and results

- `npx jest src/modules/foundation/lib/__tests__/dispatch-rules.test.ts --coverage` — 21 passed, 100 % on
  `dispatch-rules.ts`.
- `yarn typecheck` — exit 0.
- `yarn test:integration:vereino --filter TEST-M08` — 2 passed (club limits 1.8 min, share text).
- `--no-build` reruns: TEST-M02-dispatch 1 passed (1.5m), TEST-M03-secrets 1 passed (45s),
  TEST-M07-session-cancellation 1 passed (54s).
- `yarn verify` — format:check failed once on the new code (fixed with prettier); then all steps passed.
- `yarn guard` — no blocking findings.

## Open problems / next steps

- None from this run; CI result is reported on the PR.
