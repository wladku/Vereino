---
title: "scanInColorSchemes reloads the page, so a multi-step form or an open sheet needs a ready callback that walks back; app lint needs an 8 GB heap"
modules: ["enrolment", "platform"]
areas: ["testing"]
topics: ["axe", "integration-tests", "multi-step-forms", "sheets", "eslint", "heap"]
---

# scanInColorSchemes reloads the page, so a multi-step form or an open sheet needs a ready callback that walks back; app lint needs an 8 GB heap

**Context**: #799 (2026-11-26) scanned step 2 of the public sign-up form (P-J2) with `scanInColorSchemes`, and `yarn verify` ran `lint` after the new `enrolment` module was added.

**Problem**: (1) `scanInColorSchemes` (`_fixtures/axe.ts`) reloads the page for each colour scheme, so client state of a multi-step form is lost and a ready callback that only waits for a step-2 element times out. (2) `eslint .` in `packages/app` hit the default ~4 GB V8 heap ("JavaScript heap out of memory", exit 134) once the module was added; `typecheck` and `build` already set `--max-old-space-size=8192`, `lint` did not.

**Rule**: Pass a ready callback that re-enters the state to scan (fill step 1, choose the option; or click the button that opens the sheet, as TEST-J08 does for the accept sheet of #800 — the sheet is closed after each reload) and use the same function before the scan. `packages/app` `lint` runs with `NODE_OPTIONS=--max-old-space-size=8192` like `typecheck` and `build`; an OOM in lint is a heap limit, not a lint finding.

**Applies to**: integration tests of multi-step or stateful pages (`packages/app/.ai/qa/tests/**`); `packages/app/package.json` scripts.
