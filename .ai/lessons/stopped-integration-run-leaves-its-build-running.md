---
title: "A stopped integration run can leave its next build running; wait for a quiet build directory before the next run"
modules: ["platform"]
areas: ["testing", "debugging"]
topics: ["integration-tests", "next-build", "background-tasks", "host-suspend", "worktrees"]
---

# A stopped integration run can leave its next build running; wait for a quiet build directory before the next run

**Context**: Issue #136 (2026-11-05) ran `yarn test:integration:vereino --filter ISSUE-136` as a background task several times in one worktree. The first run hit the agent's background time limit during `next build`; a later run's log showed "Compiled successfully in 346.6min" (the host had been suspended overnight) and then `[internal] yarn build failed`, yet that run kept going and later reached the test. A run started meanwhile stopped at once with "Another next build process is already running", and the overlapping runs took the server down under a retry ("You appear to be offline").

**Problem**: Stopping or timing out the shell of a background run does not reliably end the Windows `node` children it started (`next build`, the server, the Testcontainers database), and a log line that reads like the end of a run may be followed by more work. Runs that share one log file make this worse: each one truncates or appends to the other's output. The build lock `packages/app/.mercato/next/lock` only exists during parts of the build, so a missing lock does not prove the build has ended.

**Rule**: Give an integration run the longest background limit (2 hours) and its own log file. Before starting another run in the same worktree, wait until nothing under `packages/app/.mercato/next` has been written for 3 minutes and no `lock` file is present. Start the run from that same background command so the two never overlap. Treat a run as finished only when its task reports completion, not when its log looks final. When a duration is far longer than plausible, suspect a host suspend before you suspect the code.

**Applies to**: `yarn test:integration:vereino`, `scripts/vereino-ephemeral.mjs`, agent background tasks on Windows hosts; see also `parallel-integration-runs-need-own-worktree`.
