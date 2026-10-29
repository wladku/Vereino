---
title: "Reload after emulateMedia before an axe scan; a react-query refetch after an error keeps status error"
modules: ["people", "platform"]
areas: ["testing", "backend-ui"]
topics: ["axe", "dark-mode", "playwright", "react-query", "loading-state"]
---

# Reload after emulateMedia before an axe scan; a react-query refetch after an error keeps status error

**Context**: Issue #27 (2026-10-29) scanned the first `/club` member pages with axe in light and dark mode and showed their loading and error states.

**Problem**: (1) After `page.emulateMedia({ colorScheme: 'dark' })` the colour transition is still running when axe scans, so it reports contrast failures that do not exist once the page settles. (2) In react-query v5 a refetch after an error keeps `status: 'error'` while `isFetching` is true, so a page that switches on `status` shows the error instead of the loading state during the retry.

**Rule**: Reload the page after `emulateMedia({ colorScheme })` and wait for it before an axe scan. Show the loading state on `!data && isFetching` and the error state only when not fetching.

**Applies to**: `packages/app/.ai/qa/tests/**` axe scans; Vereino pages that read with react-query.
