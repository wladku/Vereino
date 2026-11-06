---
title: "The platform Tag brand variant fails axe color-contrast; use a status variant for text a scan covers"
modules: ["platform", "facilities"]
areas: ["backend-ui", "testing"]
topics: ["tag", "axe", "color-contrast", "design-tokens", "accessibility"]
---

# The platform Tag brand variant fails axe color-contrast; use a status variant for text a scan covers

**Context**: #121's week preview marked the `reservable_paid` zone with `<Tag variant="brand">`. The E08-S01 axe scan of `/backend/facilities/calendar` reported `color-contrast` (serious): `text-brand-violet` (#bc9aff) on `bg-brand-violet/10` (#f8f5ff) is 2.11:1 against the 4.5:1 required for 12 px text.

**Problem**: `@open-mercato/ui` 0.9.0 `Tag` builds `brand` from the raw brand color with opacity, unlike the `success`, `info`, `warning`, `error` and `neutral` variants, which use the `status-*-text` tokens tuned for contrast. Nothing in typecheck or lint catches it; only the axe scan does.

**Rule**: In Vereino pages use the status variants of `Tag`/`StatusBadge` for labels; do not use `brand` for text. Scan every new admin page with `scanBlockingViolations` before shipping.

**Applies to**: `@open-mercato/ui/primitives/tag` consumers in `packages/app/src/modules/*/components/**`.
