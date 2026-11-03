---
title: "Parallel integration runs need one worktree each; the test runner picks a free port, start stays on 5001"
modules: ["platform"]
areas: ["testing", "ai-workflow"]
topics: ["integration-tests", "parallel-agents", "ports", "worktrees"]
---

# Parallel integration runs need one worktree each; the test runner picks a free port, start stays on 5001

**Context**: Before piloting parallel agents (Cezar, 2026-11-03), two `yarn test:integration:vereino` runs were started at the same time to check that they no longer collide on port 5001.

**Problem**: The ports no longer collided (the runner now takes a free port), but the second run in the same worktree still failed: the platform refuses a second production server for the same app directory ("Another Open Mercato production server is already running for …\packages\app"). Two runs in one worktree also share its `.mercato` build.

**Rule**: Run parallel integration tests from separate worktrees, one agent per worktree. `yarn test:integration:vereino` without `--port` takes a free port in 5001–5999; `yarn test:integration:vereino:start` keeps 5001, which CI and `BACKWARD_COMPATIBILITY.md` rely on. Never pass a fixed `--port` from parallel agents.

**Applies to**: `packages/app/scripts/vereino-ephemeral.mjs`, orchestrated or parallel agent runs, CI.
