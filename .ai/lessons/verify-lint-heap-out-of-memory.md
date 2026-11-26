---
title: "A lint step that dies of heap exhaustion is the environment, not the change: rerun with a larger heap"
modules: ["platform"]
areas: ["testing"]
topics: ["verify", "lint", "out-of-memory", "node-options"]
---

# A lint step that dies of heap exhaustion is the environment, not the change: rerun with a larger heap

**Context**: On #833 (2026-11-26, Cezar run on the shared Linux server) `yarn verify` failed at `lint`. The output held
no lint error, only `FATAL ERROR: Ineffective mark-compacts near heap limit … JavaScript heap out of memory` from
`eslint .` in `@vereino/app` at about 4 GB, then `The command failed in workspace @vereino/app … exit code 129`. The
change touched three TypeScript files.

**Problem**: The summary only says `FAIL lint`, so the failure reads like a lint finding. Type-aware ESLint over the
whole app grows past Node's default old-space limit, and the run fails regardless of the diff.

**Rule**: When `lint` fails, look for `heap out of memory` before looking for findings. If it is there, rerun the
gate with `NODE_OPTIONS=--max-old-space-size=8192 yarn verify --from lint`, then finish with one full green
`yarn verify` under the same setting. Never edit the lint configuration or skip the step to get past it, and say in the
PR that the larger heap was used.

**Applies to**: `yarn verify` step `lint` (`eslint .` in `packages/app`), local and server runs of autonomous agents.
