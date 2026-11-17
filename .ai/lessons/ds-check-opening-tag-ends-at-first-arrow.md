---
title: "ds:check reads a JSX opening tag up to its first `>`: put an arrow-function prop after an ignored style prop"
modules: ["platform", "facilities"]
areas: ["backend-ui", "testing"]
topics: ["ds-check", "design-system", "inline-style", "ds-check-ignore", "yarn-verify"]
---

# ds:check reads a JSX opening tag up to its first `>`: put an arrow-function prop after an ignored style prop

**Context**: #278 added `onClick={onEntry ? () => { … } : undefined}` to the axis blocks of
`facilities/components/day-axis/DayAxis.tsx`, before their `style={{ … }}`. `yarn verify` then failed at `ds:check`
with `.ds-check-ignore [stale] … DayAxis.tsx inline-style style=`, although the style prop was still there.

**Problem**: `packages/app/scripts/ds-check.mjs` finds opening tags with `/<[A-Za-z][^>]*>/` on the source with strings
and comments masked. The `>` of an arrow (`=>`) or of a comparison inside an attribute expression ends the "tag" early,
so a `style=` after it is not seen: an existing `.ds-check-ignore` entry turns stale, and a new inline style would slip
past the check unnoticed.

**Rule**: In an element the check must see, keep attributes whose expressions contain `=>` or `>` after `style=` (or
move the handler into a named function above the JSX). When `ds:check` reports a stale ignore for a style that is still
present, look for an arrow or `>` earlier in the same opening tag before touching `.ds-check-ignore`.

**Applies to**: `packages/app/scripts/ds-check.mjs`, `packages/app/.ds-check-ignore`, every `.tsx` with an inline-style
exception (the day axis of DD-R01).
