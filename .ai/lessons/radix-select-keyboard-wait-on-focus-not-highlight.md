---
title: "Drive a Radix Select by keyboard one key at a time, waiting for each option's focus"
modules: ["people", "platform"]
areas: ["testing"]
topics: ["radix", "keyboard", "playwright", "select"]
---

# Drive a Radix Select by keyboard one key at a time, waiting for each option's focus

**Context**: TEST-F11 (#586) walked the `/club` ward switcher (platform `Select`, Radix) with `Home` and ArrowDown,
reading after every press whether the wanted option was highlighted (first `getAttribute('data-highlighted')`, then
`element === document.activeElement`). The two-option role switcher passed; the four-option ward switcher overshot to
the last option, and returning to the first option failed about every other run.

**Problem**: Radix Select focuses the selected option only after the list is positioned, and moves focus for
`ArrowUp`/`ArrowDown`/`Home`/`End` inside a `setTimeout`; `data-highlighted` follows a render later still. A one-shot read
right after `keyboard.press` sees the previous option, so a "press until it is there" loop presses once too often, and a
`Home` pressed before the opening focus lands is overridden. With two options the overshoot hits the same item and hides it.

**Rule**: After opening, wait until the selected option is focused (`expect(...[aria-selected="true"]).toBeFocused()`).
Then compute the target's index, press one arrow key at a time toward it and `await expect(options.nth(i)).toBeFocused()`
after each press before the next one; never decide the next press from a one-shot read, and do not rely on `Home`.

**Applies to**: `packages/app/.ai/qa/tests/**` keyboard tests of `@open-mercato/ui/primitives/select` (the `MemberShell`
switchers, helper `chooseByKeyboard` in `foundation/TEST-F11-member-shell-switchers.spec.ts`) and other Radix
listboxes and menus. See also `radix-radio-group-arrow-moves-focus-only`.
