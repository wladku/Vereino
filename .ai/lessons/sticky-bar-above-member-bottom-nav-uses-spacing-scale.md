---
title: "A sticky bar above the member bottom navigation uses a spacing-scale offset (bottom-24); ds:check refuses arbitrary values and inline styles"
modules: ["activities", "ui"]
areas: ["backend-ui"]
topics: ["ds-check", "tailwind", "sticky", "member-shell", "safe-area", "mobile"]
---

# A sticky bar above the member bottom navigation uses a spacing-scale offset (bottom-24); ds:check refuses arbitrary values and inline styles

**Context**: The attendance list (#99, E06-S17) needed a sticky action bar on the phone above the member shell's fixed bottom navigation (`@vereino/ui` `member-shell.tsx`: about 4 rem tall plus `env(safe-area-inset-bottom)`). The first version, `bottom-[calc(4.5rem+env(safe-area-inset-bottom))]`, failed `yarn ds:check` with `arbitrary-tailwind`. The second, an inline `style={{ bottom: 'calc(…)' }}`, failed with `inline-style`.

**Problem**: An exact offset that includes the safe area cannot be written in Vereino page code: both escape routes are design-system violations, and only `yarn verify` finds them, after typecheck and lint have passed.

**Rule**: Offset a sticky bar above the member bottom navigation with a spacing-scale class that clears the bar plus a typical safe area: `sticky bottom-24 z-30` (6 rem, below the navigation's `z-40`), and `sm:static` when the bar is only needed on a phone. Run `yarn ds:check` early when a change adds layout classes. Do not add a `ds-check` ignore entry to get around it.

**Applies to**: member (`/club/**`) pages under `packages/app/src/modules/*/components/club/`, `@vereino/ui` member shell, `packages/app/scripts/ds-check.mjs`.
