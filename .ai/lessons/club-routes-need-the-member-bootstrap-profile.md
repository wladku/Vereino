---
title: "Injection spots on /club need the member client-bootstrap profile; StatusBadge drops data-testid; member buttons must wrap at 320 px"
modules: ["activities", "people", "platform"]
areas: ["backend-ui", "testing"]
topics: ["injection-widgets", "client-bootstrap", "member-pages", "status-badge", "reflow", "playwright"]
---

# Injection spots on /club need the member client-bootstrap profile; StatusBadge drops data-testid; member buttons must wrap at 320 px

**Context**: Issue #32 (2026-10-30) put the `activities` calendar and attendance tiles on `people`'s `/club` page through an injection spot, and the guardian UI test (TEST-014) ran the member pages at 375 and 320 px.

**Problem**: (1) `packages/app/src/components/ClientBootstrap.tsx` maps each route to a profile that decides which client registries load; `/club` fell under `public`, which loads no injection registry, so every `InjectionSpot` there rendered nothing — silently, with the widget correctly generated. (2) The platform `StatusBadge` does not forward `data-testid`, so a locator on it finds nothing. (3) The platform `Button` is `whitespace-nowrap shrink-0`: a long localized action label ("Wycofaj zgłoszenie nieobecności — Hania") and a row of three week buttons widen the page past 320 px.

**Rule**: A route family that mounts injection spots needs a client-bootstrap profile that loads `injection` (the `member` profile covers `/club` and `/club/*`); check `resolveClientBootstrapProfile` before debugging a widget that does not appear. Put test ids on a wrapper around `StatusBadge`. On member pages give rows of buttons `flex-wrap` and long-label buttons `h-auto whitespace-normal max-w-full`, and keep `expectNoPageOverflow` in the UI test.

**Applies to**: `packages/app/src/components/ClientBootstrap.tsx`; member pages under `src/modules/*/frontend/club/**` and `@vereino/ui` member components; Playwright tests of member pages.
