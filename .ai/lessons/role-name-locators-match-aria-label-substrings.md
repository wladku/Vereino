---
title: "A role locator by a record's name matches every control whose aria-label contains it; use exact: true for a positive check"
modules: ["activities", "groups"]
areas: ["testing"]
topics: ["playwright", "locators", "aria-label", "merge-main", "integration-tests"]
---

# A role locator by a record's name matches every control whose aria-label contains it; use exact: true for a positive check

**Context**: PR #349 (#266) asserted `page.getByRole('link', { name: 'Trening Orlików' })` on the activities list. After `main` was merged in, #268 had added a per-row "Sessions" button with `aria-label="Sessions of Trening Orlików"`, and TEST-A01 failed with `strict mode violation: … resolved to 2 elements`.

**Problem**: Playwright's `name` option matches a case-insensitive substring by default. A row action whose accessible name embeds the row's name (good a11y practice: "Edit X", "Sessions of X") makes every positive locator by that name ambiguous, and the action can land on `main` after the test was written.

**Rule**: For a positive check (`toBeVisible`, `click`) on a link or button named after a record, pass `exact: true`. Keep a negative check (`toHaveCount(0)`) non-exact: the substring match is stricter there, since it also catches the row's actions.

**Applies to**: Integration tests under `packages/app/.ai/qa/tests/**` that locate list rows or record links by a seeded name.
