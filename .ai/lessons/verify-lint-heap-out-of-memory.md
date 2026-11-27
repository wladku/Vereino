---
title: "When `yarn verify` fails at lint with a heap out-of-memory crash, resume with a larger Node heap"
modules: ["platform"]
areas: ["testing", "debugging"]
topics: ["lint", "eslint", "out-of-memory", "verify"]
---

# When `yarn verify` fails at lint with a heap out-of-memory crash, resume with a larger Node heap

**Context**: On 2026-11-26 (run for #870, a docs-only change) `yarn verify` failed at `lint` after 102 s with `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory` in the `@vereino/app` workspace (exit code 129), on a server with plenty of free RAM. The lint step itself reported no errors before the crash. The same crash hit the run for #833 the same day (`eslint .` in `@vereino/app` at about 4 GB, a change of three TypeScript files) and the run for #832 (a one-constant change), so it does not depend on the diff.

**Problem**: The crash looks like a lint failure, but it is Node's default heap limit being reached by ESLint over the whole app workspace; nothing in the change causes it, and retrying with the same settings can fail again.

**Rule**: When `lint` dies with `JavaScript heap out of memory`, resume the gate with a larger heap: `NODE_OPTIONS=--max-old-space-size=8192 yarn verify --from lint`, and report the crash and the rerun in the run log and the PR, and finish with one full green `yarn verify` under the same setting. Never edit the lint configuration or skip the step to get past it. Treat any ESLint error or warning count printed before the crash as real findings; do not raise the heap to hide them.

**Applies to**: `yarn verify` (`lint` step), `yarn lint`, local and Cezar runs on the shared server.
