# 2026-11-03: integration runs and the lessons catalog made safe for parallel agents

- **Date:** 2026-11-03
- **Agent / tool:** Claude Code (Opus 5.5), coordinator session
- **Trigger:** the product owner considers running the E06–E08 backlog (#130) through Cezar, a parallel agent orchestrator, and asked to prepare the repository for it ("Yes, prepare it").
- **Branch:** `chore/parallel-safe-integration`
- **Status:** completed, PR open for review.

## Goal

Two agents working in two worktrees at the same time must not collide in the two places where they did before: the integration test port and the lessons catalog.

## What changed

- **`packages/app/scripts/vereino-ephemeral.mjs`:** `test` mode without `--port` takes a free port from 5001–5999, starting at a random port of the range and wrapping around (`findFreePort`, `isPortFree`). `start` mode without `--port` keeps 5001, which CI's browser-smoke and perf jobs and `BACKWARD_COMPATIBILITY.md` rely on. An explicit `--port` wins in both modes. Unit tests cover the search, the wrap-around, a fully taken range, the real port probe and both modes (100 % coverage).
- **`scripts/check-lessons.mjs` and `.ai/lessons.md`:** the hand-kept lesson count is gone (every parallel PR conflicted on it), and catalog rows stay in file-name order within each area section, enforced by `lessons:check`, so parallel branches insert at different lines. The existing rows were sorted once.
- **New lesson** `parallel-integration-runs-need-own-worktree`.

## Installed behaviour found

The platform refuses a second production server for the same app directory ("Another Open Mercato production server is already running for …\packages\app"), so parallel integration runs need one worktree each. Two runs in one worktree failed for that reason, not because of the port.

## Commands and results

- `yarn test:scripts`: 111/111, `vereino-ephemeral.mjs` 100 %.
- `lessons:check`: passes; a copy with two rows swapped fails with the order error.
- Two `yarn test:integration:vereino --no-build` runs started at the same time in two worktrees (TEST-M10 here, ENG-TEST-25 in another worktree with the same runner): ports 5091 and 5389, both passed (1.3 and 1.2 min).
- `yarn verify`: 13/13.

## Next steps

- Owner review of this PR.
- A Cezar pilot on three independent E06 stories (#90, #100, #103), each in its own worktree.
