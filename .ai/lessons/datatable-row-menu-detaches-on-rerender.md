---
title: "A DataTable row-actions menu opened right after page load can detach; open it and pick the item inside one toPass"
modules: ["facilities", "activities", "platform"]
areas: ["testing"]
topics: ["playwright", "data-table", "row-actions", "flaky-tests", "re-render"]
---

# A DataTable row-actions menu opened right after page load can detach; open it and pick the item inside one toPass

**Context**: PR #241 (2026-11-10): `TEST-039-request-ui.spec.ts` failed on CI run 42757613850 at `getByRole('menuitem', { name: 'Approve' }).click()` — first "element is not stable … was detached from the DOM", then on the retry the menu item never appeared. The PR did not touch the requests queue; the same test passed on `main`. Recurred on PR #638 (2026-11-22, CI run 45065537955, shard 1/6): `E06-S13-coach-absence-substitutes.spec.ts` failed the same way at the "Assign substitute" menu item of the occurrences list, on both attempts, while the PR only changed a people test.

**Problem**: A `DataTable` with `rowActions` (`RowActions`) re-renders its rows when its query settles or refetches. A menu opened by clicking the row's actions button just before that re-render is unmounted with the row, so the following `menuitem` click waits on a detached or missing element until the 30 s timeout. A visible row and its text do not prove the table has stopped re-rendering.

**Cause found (#653, 2026-11-25)**: on a fresh page load `useOrganizationScopeVersion()` returns 0 and moves to 1 once the top bar emits the organization scope. A list whose query key holds the scope version then switches to a new key with no data: `isLoading` turns true, `DataTable` drops every row and the open `RowActions` portal unmounts. The occurrences list (`activities/components/OccurrencesTable.tsx`) now keeps its rows with `placeholderData: keepPreviousData`, as `ThreadsTable` and `AgeCategoriesTable` already did; its "started" moment travels with the rows (`readAt` in the query result), because `dataUpdatedAt` is 0 while a placeholder shows.

**Rule (code)**: a `DataTable` list whose `useQuery` key holds the scope version, filters or page sets `placeholderData: keepPreviousData`, and anything derived from the read time is stored in the query result, not taken from `dataUpdatedAt`.

**Rule**: In browser tests open a row-actions menu and choose its item inside one `expect(async () => { … }).toPass({ timeout: 30_000 })`: return early when the expected result (the dialog) is already visible, open the menu only when the item is not visible, click the item and assert the result with short (2 s) timeouts. Same pattern as the combobox `pick` in lesson `integration-clubs-skip-seed-defaults-and-crudform-select-race`.

**Applies to**: `packages/app/.ai/qa/tests/**` steps that click a `DataTable` row action (`data-testid="…-actions-<id>"` + `menuitem`).
