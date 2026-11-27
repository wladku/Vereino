---
title: "Type-aware ESLint in packages/app needs a raised heap; watch its peak, never weaken lint to fit"
modules: ["platform"]
areas: ["testing"]
topics: ["eslint", "yarn-verify", "ci", "memory"]
---

# Type-aware ESLint in packages/app needs a raised heap; watch its peak, never weaken lint to fit

**Context**: On 2026-11-26 `yarn lint` in `packages/app` (`eslint .`) began to fail with `JavaScript heap out of memory` at Node's default heap (~4 GB). It failed in the CI `gate` job on unrelated PRs (#814, #843) and twice in a Cezar run on the factory server (#874). #838 raised the heap in the `lint` script to `cross-env NODE_OPTIONS=--max-old-space-size=8192 eslint .`, the same setting `build` and `typecheck` use. At `ee5ddb2a` the factory server measured 0 errors, 166 warnings, 1:42 wall clock and a peak RSS of 5.95 GB.

**Problem**: `vereinoTypeScriptConfigs` (`eslint.vereino.mjs`) applies `strictTypeChecked` with `parserOptions.projectService` to every Vereino module, so ESLint holds TypeScript programs for the whole app. Its memory grows with every module and test file, with no single change to blame. It stays under the limit, then starts to fail intermittently once main's code reaches the limit. An OOM in `lint` on a PR that does not touch code is this limit, not a fault in the PR.

**Rule**: Keep the `lint` heap in `packages/app/package.json` at or above `typecheck`'s. When lint OOMs again, measure the peak (`/usr/bin/time -v yarn lint` in `packages/app`) and raise the heap in the script, within the runner's memory (GitHub `ubuntu-latest`: 16 GB). Never lower rule severities, drop type-aware rules or exclude source files to save memory: the guard treats a weakened check as a finding. Splitting lint into parallel jobs is #835.

**Applies to**: `packages/app/package.json` `lint`, `eslint.vereino.mjs`, the `lint` step of `yarn verify`, merge-train repair runs that see `heap out of memory`.
