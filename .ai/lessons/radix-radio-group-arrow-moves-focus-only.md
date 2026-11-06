---
title: "In Playwright an arrow key on a Radix radio group (SegmentedControl) only moves focus; select with Space or a click"
modules: ["platform", "activities"]
areas: ["testing", "backend-ui"]
topics: ["playwright", "keyboard", "segmented-control", "radix", "accessibility"]
---

# In Playwright an arrow key on a Radix radio group (SegmentedControl) only moves focus; select with Space or a click

**Context**: The E06-S18 integration test (#100, 2026-11-03) switched the member calendar from Week to Month with the keyboard.

**Problem**: After `press('ArrowRight')` on the platform `SegmentedControl` (a Radix radio group), the Month option had focus but was not selected, so the month list never loaded and the test failed. Radix moves focus with the arrows and selects on Space, Enter or a click in this setup.

**Rule**: To change a `SegmentedControl` from the keyboard in a test, move focus with the arrow keys and then press Space (or click the option); assert `aria-checked`/`data-state="checked"` on the option before asserting the content it loads.

**Recurrence (2026-11-05, #138)**: TEST-M13 failed the same way on the `@open-mercato/ui` `RadioGroup` / `Radio` primitive of `/club/messages/new`. Radix moves the focus in a `setTimeout` and selects the focused item only while an arrow key is still down; `press()` releases the key before that, a person holding the key does not. Holding the key also works in a test: `keyboard.down('ArrowDown')`, assert the option checked, then `keyboard.up('ArrowDown')`.

**Applies to**: Playwright tests of any page using `@open-mercato/ui` `SegmentedControl`, `RadioGroup` or another Radix radio group.
