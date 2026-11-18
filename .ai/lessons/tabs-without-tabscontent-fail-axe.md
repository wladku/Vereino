---
title: "A platform Tabs used as view chips needs a TabsContent for the selected value"
modules: ["groups", "platform"]
areas: ["backend-ui", "testing"]
topics: ["tabs", "axe", "aria-controls"]
---

# A platform Tabs used as view chips needs a TabsContent for the selected value

**Context**: The phone roster (`groups/components/club/ClubGroupPage.tsx`, #274) used `Tabs` + `TabsList` + `TabsTrigger` for the views Active / Upcoming / History and rendered the list after `</Tabs>`. TEST-A17's axe scan failed with `aria-valid-attr-value` (critical) in every locale and colour scheme.

**Problem**: The Radix trigger always sets `aria-controls` to the id of its tab panel. Without a `TabsContent` for that value, the id points at no element, which axe reports. The page looks and works fine, so only the axe scan catches it.

**Rule**: Whenever a platform `Tabs` switches what the page shows, render the shown content inside `<TabsContent value={selected}>` (one panel for the current value is enough, as `RosterPanel.tsx` does). Do not render it as a sibling after `</Tabs>`.

**Applies to**: Every `@open-mercato/ui/primitives/tabs` usage in Vereino pages, member and admin.
