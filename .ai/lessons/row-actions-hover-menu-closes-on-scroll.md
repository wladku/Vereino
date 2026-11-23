---
title: "The platform row menu closes on scroll; retry opening it until the item click lands"
modules: ["platform", "activities"]
areas: ["testing"]
topics: ["integration-tests", "row-actions", "flaky"]
---

# The platform row menu closes on scroll; retry opening it until the item click lands

**Context**: PR #652 (issue #628) failed the required check `integration (shard 1/6)` twice in a row (first try and
retry) in `E06-S13`: `getByRole('menuitem', { name: 'Assign substitute' }).click()` timed out with "element was
detached from the DOM". The trace showed the ⋯ click succeeding, then the menu unmounting while Playwright scrolled the
menu item into view. The same test passed locally in 15 s; on the runner it took 54 s.

**Problem**: `RowActions` from `@open-mercato/ui/backend/RowActions` is a hover menu: it opens on pointer enter and
click, repositions on every scroll, and closes 150 ms after pointer leave. A scroll or layout shift on a slow runner
can move the menu out from under the still pointer, the browser fires pointer leave, and the menu closes. Nothing
reopens it, so a plain `.click()` on the item waits out its whole timeout. This depends on timing, so the code under
test does not have to change for it to happen.

**Rule**: In integration tests, open a row menu and click its item inside one
`expect(async () => { open; item.click({ timeout: 5_000 }); expect(result).toBeVisible() }).toPass()` block, so a closed
menu is opened again. Assert on what the item opens (dialog, navigation), not only on the click. Never weaken the
assertion that follows.

**Applies to**: every `packages/app/.ai/qa/tests/**` spec that clicks `ui.rowActions.openActions` and then a
`menuitem` (E06-S13 fixed in #652; TEST-T11, TEST-U07, E06-S12, C05, C17 and A04 use the same plain pattern).
