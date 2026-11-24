---
title: "In a header row the links keep their width and the name truncates; never flex-1 plus justify-end on a scroller"
modules: ["club_core", "platform"]
areas: ["backend-ui", "testing"]
topics: ["flexbox", "truncate", "responsive", "header", "overflow"]
---

# In a header row the links keep their width and the name truncates; never flex-1 plus justify-end on a scroller

**Context**: Issue #488 (E20-S09): on the public club page a 30-character club name hid the header menu at 1440 px —
only the last letter of "Klub" showed. The nav was `flex-1` (flex basis 0) with `overflow-x-auto`, its list
`justify-end`, next to a club link sized to its full text.

**Problem**: An item with flex basis 0 never wraps and only gets what its siblings leave, so a long sibling squeezes it
to nothing. Inside a scroll container, `justify-end` pushes overflowing content out past the start edge, where it
cannot be scrolled to: the links were cut from the left and unreachable. Even short names did not fit one row below
about 620 px (five links plus the language switcher), so the old 480 px breakpoint also clipped "Events". A 640 px
breakpoint passed locally and failed on CI, whose fonts are wider: the row had no slack.

**Rule**: In a row of a name plus links, give the stretch to the name's wrapper (`flex-1 basis-0` with a small
`min-w`), truncate the name with its full text in `title`, and let the links keep their own width (`flex: 0 1 auto`,
`min-w-0`) so they scroll only once the name is at its minimum. Never put `justify-end` (or `justify-center`) on
content inside an `overflow-x-auto` box. Pick the one-row breakpoint where the links really fit, measured in both
locales with real headroom (CI fonts are wider than a local machine's; assert a minimum width left for the name), and
prove it with a bounding-box plus `elementFromPoint` hit test on every link at each width.

**Applies to**: `packages/ui/src/public/public-header.tsx` and any header or toolbar row in `packages/ui` or module
pages; test `ISSUE-488-public-header-long-club-name`.
