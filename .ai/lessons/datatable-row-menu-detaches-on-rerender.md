---
title: "A DataTable row-actions menu opened right after page load can detach; open it and pick the item inside one toPass"
modules: ["facilities", "platform"]
areas: ["testing"]
topics: ["playwright", "data-table", "row-actions", "flaky-tests", "re-render"]
---

# A DataTable row-actions menu opened right after page load can detach; open it and pick the item inside one toPass

**Context**: PR #241 (2026-11-10): `TEST-039-request-ui.spec.ts` failed on CI run 42757613850 at `getByRole('menuitem', { name: 'Approve' }).click()` — first "element is not stable … was detached from the DOM", then on the retry the menu item never appeared. The PR did not touch the requests queue; the same test passed on `main`.

**Problem**: A `DataTable` with `rowActions` (`RowActions`) re-renders its rows when its query settles or refetches. A menu opened by clicking the row's actions button just before that re-render is unmounted with the row, so the following `menuitem` click waits on a detached or missing element until the 30 s timeout. A visible row and its text do not prove the table has stopped re-rendering.

**Rule**: In browser tests open a row-actions menu and choose its item inside one `expect(async () => { … }).toPass({ timeout: 30_000 })`: return early when the expected result (the dialog) is already visible, open the menu only when the item is not visible, click the item and assert the result with short (2 s) timeouts. Same pattern as the combobox `pick` in lesson `integration-clubs-skip-seed-defaults-and-crudform-select-race`.

**Applies to**: `packages/app/.ai/qa/tests/**` steps that click a `DataTable` row action (`data-testid="…-actions-<id>"` + `menuitem`).
