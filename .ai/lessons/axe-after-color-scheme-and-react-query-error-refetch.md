---
title: "Reload after emulateMedia before an axe scan (open a dialog inside the scan's ready callback); a react-query refetch after an error keeps status error"
modules: ["people", "activities", "groups", "platform"]
areas: ["testing", "backend-ui"]
topics: ["axe", "dark-mode", "playwright", "react-query", "loading-state", "dialogs"]
---

# Reload after emulateMedia before an axe scan (open a dialog inside the scan's ready callback); a react-query refetch after an error keeps status error

**Context**: Issue #27 (2026-10-29) scanned the first `/club` member pages with axe in light and dark mode and showed their loading and error states. Issue #95 (2026-11-06) scanned an open dialog (M-04 "Report absence") the same way.

**Problem**: (1) After `page.emulateMedia({ colorScheme: 'dark' })` the colour transition is still running when axe scans, so it reports contrast failures that do not exist once the page settles. (2) In react-query v5 a refetch after an error keeps `status: 'error'` while `isFetching` is true, so a page that switches on `status` shows the error instead of the loading state during the retry. (3) `scanInColorSchemes` (`_fixtures/axe.ts`) reloads the page for each scheme, so a dialog opened before the call is gone when `ready` runs: the first run of E06-S13 failed with "element(s) not found" on the dialog.

(4) Issue #368 (2026-11-18): TEST-A12 switched the scheme on a filled form with an error state, which a reload would lose, and scanned straight away; it failed `color-contrast` intermittently on half-blended colours, even with `reducedMotion: 'reduce'`, because the platform ThemeProvider toggles the `dark` class from a `matchMedia` listener and the page's CSS transitions still run.

(5) PR #406 (2026-11-19): TEST-L16 scanned the third step of the season rollover wizard with `scanInColorSchemes`; the reload reset the wizard to its first step and `ready` failed with "element(s) not found" on the preview, on both CI attempts. State that lives only in the client (a wizard step, a filled form) needs `switchColorScheme` + `scanBlockingViolations` per scheme.

(6) PR #430 (2026-11-20): TEST-L22 failed `color-contrast` on CI only, on both attempts (2 nodes in every scheme, then 1 node in pl/dark), and passed locally. The age chip of the move dialog changed the selection, the preview refetched, and the chip and Move buttons went disabled and back; their opacity fade (Tailwind `transition-*`, not stopped by `reducedMotion`) was still running when axe scanned (`#555555` on `#212121`). `networkidle` does not wait for a CSS transition.

**Rule**: Reload the page after `emulateMedia({ colorScheme })` and wait for it before an axe scan. When the page cannot be reloaded (a filled form, its error state), switch with `switchColorScheme` (`_fixtures/axe.ts`): it waits for the `dark` class and for every running `CSSTransition` to finish; never scan right after a bare `emulateMedia`. `scanBlockingViolations` itself also waits for running CSS transitions (since #430), so a button re-enabled after a refetch is scanned at its final colours; do not scan with a hand-rolled AxeBuilder that skips this wait. Show the loading state on `!data && isFetching` and the error state only when not fetching. To scan a dialog, open it inside the `ready` callback of `scanInColorSchemes` (it runs after every reload), and reload once more before continuing the flow in light mode.

**Applies to**: `packages/app/.ai/qa/tests/**` axe scans; Vereino pages that read with react-query.
