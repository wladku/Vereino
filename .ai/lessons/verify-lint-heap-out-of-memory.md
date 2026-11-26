---
title: "A lint heap OOM in yarn verify is the environment: resume with a larger Node heap"
modules: ["platform"]
areas: ["testing"]
topics: ["verify", "lint", "eslint", "memory"]
---

# A lint heap OOM in yarn verify is the environment: resume with a larger Node heap

**Context**: On #832 (2026-11-26) `yarn verify` failed at `lint` with `FATAL ERROR: Ineffective mark-compacts near heap limit ... JavaScript heap out of memory` in `@vereino/app` (`eslint .`, exit 129); the change touched one constant. The machine had over 100 GB free.

**Problem**: The step reports FAIL like a real lint finding, so a run can mistake it for a code problem or stop. ESLint over the whole app outgrows Node's default heap limit, not the machine's memory.

**Rule**: When `lint` fails with a heap OOM and no lint errors, resume with `NODE_OPTIONS=--max-old-space-size=8192 yarn verify --from lint` and report the retry in the PR. Treat it as a code failure only when ESLint prints errors.

**Applies to**: `yarn verify` step `lint` (`packages/app` `eslint .`), local runs on the shared server.
