---
title: "A local yarn lint that dies of heap exhaustion is rerun with an 8 GB heap, not treated as a code failure"
modules: ["platform"]
areas: ["testing"]
topics: ["yarn-verify", "eslint", "memory"]
---

# A local yarn lint that dies of heap exhaustion is rerun with an 8 GB heap, not treated as a code failure

**Context**: #819 (2026-11-26): `yarn verify` failed at `lint` twice in a Cezar worktree with `FATAL ERROR: Ineffective mark-compacts near heap limit … JavaScript heap out of memory` in `@vereino/app` (`eslint .`, about 4 GB used), once beside an integration build and once alone. `packages/app/.ai/qa/test-results/` held no `.js` files, so it was not the Playwright report of lesson `local-playwright-report-breaks-lint`. `NODE_OPTIONS=--max-old-space-size=8192 yarn lint` passed with 0 errors.

**Problem**: The app's typed ESLint run grows with the module count and now reaches Node's default heap limit; `build` and `typecheck` already pass `--max-old-space-size=8192`, `lint` does not. A crash reads like a lint failure and can send an agent hunting for a code cause.

**Rule**: When `lint` ends in a heap-limit crash (no rule findings), rerun `NODE_OPTIONS=--max-old-space-size=8192 yarn lint`, then `yarn verify --from <next step>` with the same variable, and say so in the PR. Raising the heap in the `lint` script itself is a tooling change for the owner to approve.

**Applies to**: local `yarn verify` / `yarn lint` runs in any worktree.
