---
title: "Count a list's items with expect.poll, not one count() after the first item is visible"
modules: ["payments", "platform"]
areas: ["testing"]
topics: ["playwright", "data-table", "flaky-tests", "re-render", "locator-count"]
---

# Count a list's items with expect.poll, not one count() after the first item is visible

**Context**: Issue #707 (2026-11-25): `E20-S03-status-word-and-icon.spec.ts` failed once on PR #705 (CI run 45559952973, shard 4/6) with `expect(received).toBeGreaterThanOrEqual(expected) Expected: >= 4 Received: 0` and passed on retry. Its helper waited for `tags.first()` to be visible and then read `tags.count()` once.

**Problem**: `locator.count()` does not wait or retry; it reads the DOM at that instant. A list that refetches drops its rows for a moment (for example a `DataTable` whose query key holds `useOrganizationScopeVersion()`, which moves from 0 to 1 after the page loads; lesson `datatable-row-menu-detaches-on-rerender`), so a count read right after the first row became visible can be 0. A loop over that count then runs zero times and passes without checking anything.

**Rule**: Read a minimum number of items with a retrying assertion and iterate over the value the poll saw: `let count = 0; await expect.poll(async () => (count = await items.count())).toBeGreaterThanOrEqual(minimum)`, then check each `items.nth(i)` with auto-waiting `expect`s. Use `toHaveCount(n)` when the exact number is known. Never assert on a bare `await locator.count()`.

**Applies to**: integration tests under `packages/app/.ai/qa/tests` that count rows, tags or tiles of a list or table (`E20-S03` `expectWordAndIcon`).
