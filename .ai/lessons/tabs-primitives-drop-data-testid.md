---
title: "The platform Tabs primitives drop data-testid; put the test id on a wrapper and pick a tab by role"
modules: ["platform", "facilities"]
areas: ["backend-ui", "testing"]
topics: ["tabs", "data-testid", "playwright", "open-mercato-ui"]
---

# The platform Tabs primitives drop data-testid; put the test id on a wrapper and pick a tab by role

**Context**: #122 (B-24 rentals list). `RentalsTable` passed `data-testid` to `TabsList` and `TabsTrigger` from `@open-mercato/ui/primitives/tabs`; the E08-S02 Playwright test waited for `getByTestId('facilities-rentals-tabs')` and timed out although the tabs were on screen (screenshot at 375 px).

**Problem**: in `@open-mercato/ui` 0.9.0 `TabsList` destructures only `children`, `className` and `aria-label`, and `TabsTrigger` only `value`, `children`, `className`, `disabled`, `leading`, `count` (`dist/primitives/tabs.js`); every other prop, `data-testid` included, is silently dropped, and TypeScript does not complain. `StatusBadge` behaves the same way (lesson `club-routes-need-the-member-bootstrap-profile`).

**Rule**: never put `data-testid` on a platform primitive without checking that it forwards rest props; put it on a wrapping `div` you own, and in tests select tabs by role (`getByRole('tablist')`, `getByRole('tab', { name })`) inside that wrapper.

**Applies to**: Vereino admin and member components using `@open-mercato/ui/primitives/tabs` (and other primitives with an explicit prop list), and the Playwright tests in `packages/app/.ai/qa/tests`.
