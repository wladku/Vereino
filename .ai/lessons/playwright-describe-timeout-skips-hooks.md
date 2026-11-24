---
title: "A describe's timeout does not reach beforeAll/afterAll: a slow hook sets its own"
modules: ["platform"]
areas: ["testing"]
topics: ["playwright", "integration-tests", "timeouts", "flaky-tests"]
---

# A describe's timeout does not reach beforeAll/afterAll: a slow hook sets its own

**Context**: TEST-M03 (`club_core/TEST-M03-club-address.spec.ts`) failed on `main` and on unrelated PRs with `"beforeAll" hook timeout of 20000ms exceeded`, retry included (#701). The file sets `test.describe.configure({ mode: 'serial', timeout: 600_000 })`, but its `beforeAll` starts a second `next start` (up to 180 s, `_fixtures/club-domain.ts`) and publishes two clubs.

**Problem**: `test.describe.configure({ timeout })` raises the timeout of the tests only. `beforeAll` and `afterAll` keep the config's `timeout: 20_000` (`playwright.config.ts`). A hook that is usually fast enough on a developer machine passes locally and times out on a loaded CI runner, so the failure looks like a flake shared by unrelated PRs.

**Rule**: A `beforeAll`/`afterAll` that starts a process, waits for a server or creates several records calls `test.setTimeout(<budget>)` as its first line, with a budget above the longest wait it contains (for example 300 s for a hook that waits up to 180 s for an app). Do not rely on the describe's `timeout` for hooks.

**Applies to**: `packages/app/.ai/qa/tests/**` hooks, especially those using `startClubDomainApp()` or other spawned processes.
