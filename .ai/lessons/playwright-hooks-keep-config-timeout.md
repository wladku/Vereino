---
title: "A slow beforeAll sets its own test.setTimeout; describe.configure raises only the tests' timeout"
modules: ["platform"]
areas: ["testing"]
topics: ["integration-tests", "playwright", "timeouts", "flaky-ci"]
---

# A slow beforeAll sets its own test.setTimeout; describe.configure raises only the tests' timeout

**Context**: `TEST-M03-club-address.spec.ts` (#701) declared `test.describe.configure({ mode: 'serial', timeout: 600_000 })`, then started a second `next start` (up to 180 s) and created and published two clubs in `beforeAll`. CI failed with `"beforeAll" hook timeout of 20000ms exceeded` on `main` and on unrelated PRs, retry included; it passed only when the runner was fast.

**Problem**: In Playwright the `timeout` of `describe.configure` applies to the tests. A `beforeAll`/`afterAll` hook gets its own budget, the config's `timeout` (20 s in `packages/app/.ai/qa/tests/playwright.config.ts`). The failure looks like a flaky test, so the CI ledger asks for a quarantine instead of a fix.

**Rule**: Any `beforeAll` or `afterAll` that starts a process, builds, or creates more than a couple of records calls `test.setTimeout(<budget>)` as its first line, sized to the worst case of what it awaits (for example 300 s around `startClubDomainApp()`), and an `afterAll` that stops a process gets enough for the stop plus its cleanups.

**Applies to**: every spec under `packages/app/.ai/qa/tests`, especially those using `_fixtures/club-domain.ts` or other child processes.
