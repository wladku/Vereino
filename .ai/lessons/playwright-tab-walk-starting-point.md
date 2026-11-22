---
title: "A Playwright Tab walk starts from a click on an unfocusable element; blur() leaves the starting point on the last focused control"
modules: ["platform", "activities"]
areas: ["testing"]
topics: ["playwright", "keyboard", "focus", "accessibility"]
---

# A Playwright Tab walk starts from a click on an unfocusable element; blur() leaves the starting point on the last focused control

**Context**: `ISSUE-547` checks every Tab stop of the attendance list at 375 px. It first checked a radio in every row, then called `document.activeElement.blur()` and `window.scrollTo(0, 0)` to start the walk from the top. The first Tab landed on the last row's "Clear" button and the second on the action bar, so the walk saw one list stop instead of 22.

**Problem**: Chromium keeps a *sequential focus navigation starting point*. `blur()` and scrolling do not move it: the next Tab continues after the element that was focused (or clicked) last.

**Rule**: To start a Tab walk at a known place, click an unfocusable element there (a heading, for example `page.getByTestId('<title>').click()`), or `focus()` a focusable element right before the region. Assert the number of stops the walk reached, so a walk that starts in the wrong place fails instead of passing on an empty list.

**Applies to**: keyboard and focus integration tests under `packages/app/.ai/qa/tests/**`.
