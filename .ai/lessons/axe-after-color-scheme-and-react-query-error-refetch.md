---
title: "Reload after emulateMedia before an axe scan (open a dialog inside the scan's ready callback); a react-query refetch after an error keeps status error"
modules: ["people", "activities", "platform"]
areas: ["testing", "backend-ui"]
topics: ["axe", "dark-mode", "playwright", "react-query", "loading-state", "dialogs"]
---

# Reload after emulateMedia before an axe scan (open a dialog inside the scan's ready callback); a react-query refetch after an error keeps status error

**Context**: Issue #27 (2026-10-29) scanned the first `/club` member pages with axe in light and dark mode and showed their loading and error states. Issue #95 (2026-11-06) scanned an open dialog (M-04 "Report absence") the same way.

**Problem**: (1) After `page.emulateMedia({ colorScheme: 'dark' })` the colour transition is still running when axe scans, so it reports contrast failures that do not exist once the page settles. (2) In react-query v5 a refetch after an error keeps `status: 'error'` while `isFetching` is true, so a page that switches on `status` shows the error instead of the loading state during the retry. (3) `scanInColorSchemes` (`_fixtures/axe.ts`) reloads the page for each scheme, so a dialog opened before the call is gone when `ready` runs: the first run of E06-S13 failed with "element(s) not found" on the dialog.

**Rule**: Reload the page after `emulateMedia({ colorScheme })` and wait for it before an axe scan. Show the loading state on `!data && isFetching` and the error state only when not fetching. To scan a dialog, open it inside the `ready` callback of `scanInColorSchemes` (it runs after every reload), and reload once more before continuing the flow in light mode.

**Applies to**: `packages/app/.ai/qa/tests/**` axe scans; Vereino pages that read with react-query.
