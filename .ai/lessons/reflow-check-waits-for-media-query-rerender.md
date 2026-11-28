---
title: "A reflow check right after a resize must wait for a media-query layout to re-render"
modules: ["facilities", "platform"]
areas: ["testing", "backend-ui", "debugging"]
topics: ["reflow", "playwright", "media-query", "flaky-test", "calendar"]
---

# A reflow check right after a resize must wait for a media-query layout to re-render

**Context**: #908. E08-S01 loads `/backend/facilities/calendar` at 1280 px, where the view without `range` is Week (`useWideCalendar`, DD-W03), then `expectNoPageOverflow` resizes to 320 px and measured `scrollWidth` once. The Week grid switches to Day only when the `matchMedia` `change` event re-renders the page, which can come after Playwright's `setViewportSize` and `waitForLoadState('networkidle')` have returned. The check then measured the Week grid at 320 px (`page wider than 320 px by 427 px`), with an empty list of offenders. It failed on both attempts in CI at 00:30 club time; locally it passed at 01:08 and failed only its first attempt at about 01:25. A browser clock pinned to 00:30 reproduced it every time; at 12:30 the switch had already happened. The settled page fits 320 px in both views.

**Problem**: A single measurement right after a resize sees a layout that exists only for one render. Whether the re-render lands first depends on the page's work in that frame (here the time of day), so the test passes for weeks and then fails all day, or for an hour.

**Rule**: `expectNoPageOverflow` (`packages/app/.ai/qa/tests/_fixtures/axe.ts`) polls the overflow for up to 5 s after the resize and fails only if it lasts. Do not go back to a single measurement. A test that needs a time-of-day state pins the browser clock (`page.clock.setFixedTime`) instead of depending on when CI runs, as the #908 case in E08-S01 does at 00:30 club time.

**Applies to**: every caller of `expectNoPageOverflow`; pages that pick a layout from a media query (the facilities, activities and member calendars).
