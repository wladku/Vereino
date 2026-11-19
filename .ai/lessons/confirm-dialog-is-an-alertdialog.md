---
title: "The platform confirm dialog has role alertdialog: browser tests pick it with getByRole('alertdialog')"
modules: ["platform", "people"]
areas: ["testing"]
topics: ["playwright", "confirm-dialog", "alertdialog", "integration-tests"]
---

# The platform confirm dialog has role alertdialog: browser tests pick it with getByRole('alertdialog')

**Context**: PR #412 (#309, 2026-11-19) — TEST-L11 withdrew an own consent on `/club/profile`, which opens the confirmation from `useConfirmDialog` (`@open-mercato/ui/backend/confirm-dialog`), and waited for `page.getByRole('dialog')`. The required check `integration (shard 6/6)` failed on both attempts with `element(s) not found` after 20 s, although the dialog was open.

**Problem**: `ConfirmDialog` renders a native `<dialog role="alertdialog">` opened with `showModal()`. Playwright's `getByRole('dialog')` matches the role exactly, so it never finds an `alertdialog`; the failure reads like a dialog that did not open.

**Rule**: In a browser test, pick a `useConfirmDialog` / `ConfirmDialog` confirmation with `page.getByRole('alertdialog')`. Use `page.getByRole('alertdialog').or(page.getByRole('dialog'))` only when the same step can show either a confirmation or a regular `Dialog`.

**Applies to**: every integration test under `packages/app/.ai/qa/tests/` that confirms or cancels through the platform confirm dialog (withdrawals, deletions, destructive actions).
