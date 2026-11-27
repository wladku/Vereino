---
title: "LookupSelect 0.10.1 searches with an empty query once a value is set, and names its selection button \"Change\""
modules: ["platform", "facilities", "groups"]
areas: ["backend-ui", "testing"]
topics: ["lookup-select", "platform-upgrade", "accessibility", "integration-tests"]
---

# LookupSelect 0.10.1 searches with an empty query once a value is set, and names its selection button "Change"

**Context**: After the Open Mercato 0.10.1 upgrade (#498, PR #887), TEST-L22 and TEST-R04 failed in CI on axe `label-content-name-mismatch`. Once that was repaired, TEST-R04 failed on a console error: `GET /api/facilities/renters?search=` answered 400 right after a renter was picked.

**Problem**: `@open-mercato/ui` 0.10.1 `LookupSelect` shows the chosen item as one button (`[data-testid="lookup-select-selected"] > button`) with `aria-label="Change"`. Its visible text is the item, plus a subtitle span that shows only from `sm` up. A fixed `aria-label` cannot hold the visible text at both widths: the platform glues the spans together without a space. It also calls `fetchItems('')` whenever a value is set (`shouldSearch = … || Boolean(value)`), so a fetcher that passes the query straight to an API with a minimum length gets a 400.

**Rule**: `PlatformA11yRepairs` drops the button's `aria-label` (`nameSelectionByContent` in `@vereino/ui`), so the name comes from the content and the `title` stays as the description. A `LookupSelect` fetcher returns `[]` below its API's minimum query length, as `searchRenters` does, or leaves an empty `search` out of the request, as every other Vereino fetcher already did. A new fetcher must handle `''`.

**Applies to**: every `LookupSelect` `fetchItems` in Vereino modules, `packages/ui/src/admin/platform-a11y.ts`, `@open-mercato/ui` upgrades.
