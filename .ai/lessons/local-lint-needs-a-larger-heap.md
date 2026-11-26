---
title: "A local yarn lint that dies of heap exhaustion is rerun with an 8 GB heap, not treated as a code failure"
modules: ["platform"]
areas: ["testing"]
topics: ["yarn-verify", "eslint", "memory"]
---

# A local yarn lint that dies of heap exhaustion is rerun with an 8 GB heap, not treated as a code failure

**Context**: #819 (2026-11-26): `yarn verify` failed at `lint` twice in a Cezar worktree with `FATAL ERROR: Ineffective mark-compacts near heap limit … JavaScript heap out of memory` in `@vereino/app` (`eslint .`, about 4 GB used), once beside an integration build and once alone. `packages/app/.ai/qa/test-results/` held no `.js` files, so it was not the Playwright report of lesson `local-playwright-report-breaks-lint`. `NODE_OPTIONS=--max-old-space-size=8192 yarn lint` passed with 0 errors.

**Problem**: The app's typed ESLint run grows with the module count and now reaches Node's default heap limit; `build` and `typecheck` already pass `--max-old-space-size=8192`, `lint` does not. A crash reads like a lint failure and can send an agent hunting for a code cause.

**Follow-up**: PR #837 then failed the CI `gate` job the same way (`lint`, 217 s, heap limit; main's gate passed lint in 191 s just before). A local run of `yarn workspace @vereino/app lint` peaked at 6.4 GB resident. The app's `lint` script now runs `cross-env NODE_OPTIONS=--max-old-space-size=8192 eslint .`, matching `typecheck` and `build`, so local and CI runs get the same heap.

**Rule**: The app's `lint` script carries the same 8 GB heap as `typecheck` and `build`; do not remove it. If `lint` still ends in a heap-limit crash (no rule findings), measure the peak (`/usr/bin/time -v yarn workspace @vereino/app lint`), and raise or split the run in a PR that says why — never treat the crash as a code finding.

**Applies to**: `yarn verify` / `yarn lint` runs in any worktree and in CI.
