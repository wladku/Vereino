---
title: "A 44 px member target is the tappable box, not the drawn box: platform Switch, Input and Checkbox draw small hit areas inside larger frames"
modules: ["platform", "people", "facilities", "communication", "activities", "payments"]
areas: ["backend-ui", "testing"]
topics: ["accessibility", "touch-targets", "member-pages", "switch", "input", "playwright"]
---

# A 44 px member target is the tappable box, not the drawn box: platform Switch, Input and Checkbox draw small hit areas inside larger frames

**Context**: E20-S12 (#491) measured every target on `/club` at 375 px (`_fixtures/touch-targets.ts`, test `platform/E20-S12-member-touch-targets.spec.ts`). Controls that looked 44 px high were not: the platform `Input` puts `className` on a wrapper `div` (`data-slot="input-wrapper"`) and the real `<input>` is only one text line (20 px) inside it, so a tap on the wrapper's padding focuses nothing; the platform `Switch` is a 32 × 20 px button and `SwitchField` toggles only on its label text; a Radix `Checkbox` is 16 px; the toast's `Alert` dismiss is 20 px. A round (`rounded-full`) button's corners are outside its hit shape, so Playwright reports "label intercepts pointer events" when it clicks the corner of a 44 px round switch.

**Problem**: Adding `min-h-11` to such a component's `className` grows the frame, not the tappable element, and an axe scan does not check target size. `min-h-11` with `inputClassName="self-stretch"` is still short: the wrapper's 1 px borders leave the inner input 42 px. E20-S12 measured only the pages it visited, so the guardian kit order form (`/club/orders/[campaignId]`, payments) kept 20 px inputs until TEST-083 found them (#548).

**Rule**: On member pages, give a platform `Input` `className="h-12"` and `inputClassName="self-stretch"` (the inner input then fills 46 px of the 48 px field); put a switch row in `MemberSwitchField` (`@vereino/ui`), a radio or checkbox in a `<label htmlFor>` row with `min-h-11`; a heading link gets `inline-flex min-h-11 items-center`. Prove it with `undersizedTargets(page)` (hit area = the control's box or any of its labels), not by reading class names. Click a round control near its middle edge, not at a corner.

**Applies to**: every member page, including the ones E20-S12 does not visit — when a page gets a new `Input`, measure it in that page's own test; `packages/app/src/modules/*/components/club/**`, `packages/ui/src/member/**`, integration tests of member pages.
