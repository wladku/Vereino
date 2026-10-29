---
title: "Scan Vereino pages with the platform axe baseline; CrudForm 0.9.0 labels are not associated"
modules: ["platform", "club_core"]
areas: ["backend-ui", "testing"]
topics: ["accessibility", "axe", "crud-form", "app-shell", "wcag"]
---

# Scan Vereino pages with the platform axe baseline; CrudForm 0.9.0 labels are not associated

**Context**: ENG-TEST-25 (2026-10-29) scanned the ten `club_core` admin pages with axe for the first time. List pages were clean, but every form page reported critical `label` and `button-name` violations, and the settings page also reported `color-contrast` and `label-content-name-mismatch`.

**Problem**: All of them come from platform markup in `@open-mercato/ui` 0.9.0, not from Vereino code. `CrudForm` renders each field's `<label>` without `htmlFor` and its inputs, textareas and select triggers without an id or `aria-label` (`node_modules/@open-mercato/ui/src/backend/CrudForm.tsx`, field wrapper with `data-crud-field-id`). The backend AppShell sidebar group headings fail contrast, and its "Back to Main" link has an `aria-label` that differs from its text. Field configuration cannot fix this without ejecting `CrudForm`, and a baseline by rule id alone would also hide the same rule on Vereino markup.

**Rule**: Scan Vereino pages with `scanBlockingViolations(page, testInfo, { platformBaseline: true })` from `packages/app/.ai/qa/tests/_fixtures/axe.ts`. The baseline matches by rule and node (`data-crud-focus-target` controls, `[data-sidebar-group` selectors, `data-testid="appshell-` links), so Vereino markup with the same rule still fails. Never widen it to a whole rule. Remove an entry as soon as an upgrade of `@open-mercato/ui` fixes it, and report the defect upstream instead of patching `node_modules`.

**Applies to**: integration tests of every Vereino page (`packages/app/.ai/qa/tests/**`), engineering standards S7.4, upgrades of `@open-mercato/ui`.
