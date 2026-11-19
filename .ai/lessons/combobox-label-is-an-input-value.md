---
title: "A ComboboxInput shows its chosen label as an input value; assert it with toHaveValue, not getByText"
modules: ["platform"]
areas: ["backend-ui", "testing"]
topics: ["combobox", "playwright", "crudform", "preselected-value"]
---

# A ComboboxInput shows its chosen label as an input value; assert it with toHaveValue, not getByText

**Context**: PR #415 (#312): TEST-L18 opened the contract form with `?personId=` and asserted `getByText('Tomasz Nowy')`. The form resolved the name correctly (`resolveLabel`), yet the check failed on both CI attempts with `element(s) not found`.

**Problem**: The platform single-value `ComboboxInput` (`@open-mercato/ui/backend/inputs/ComboboxInput`) renders the chosen option's label as the `value` of a plain `<input role="combobox">`. Playwright's `getByText` matches text nodes only, never an input's value, so it cannot find a preselected label however long it waits.

**Rule**: Assert a preselected or chosen combobox label with `expect(page.locator('[data-crud-field-id="<fieldId>"] input')).toHaveValue('<label>')` (or `getByRole('combobox')` scoped to the field). Use `getByText`/`toContainText` only for components that render the selection as text, such as a `LookupSelect` row.

**Applies to**: integration tests under `packages/app/.ai/qa/tests/**` that check a `ComboboxInput` (CrudForm pickers, party/person pickers).
