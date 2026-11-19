---
title: "A dialog's preselected option follows options that load after it mounts"
modules: ["facilities"]
areas: ["backend-ui"]
topics: ["react-state", "preselection", "flaky-test"]
---

# A dialog's preselected option follows options that load after it mounts

**Context**: TEST-R04 failed once in CI (#366): the slot dialog showed "General purpose" for a coach whose DD-R04 first kind is "For a group". `SlotDialog` held the kind in `React.useState(kinds[0])`, which reads `kinds` only at mount; a coach's `kinds` gain `group` only after their groups load, so a dialog opened first kept the earlier first kind.

**Problem**: `useState(initial)` freezes a value derived from props. When the options arrive asynchronously (groups, places, permissions), the preselection is right on a fast machine and wrong on a slow one — a user-facing race that shows up as a flaky browser test.

**Rule**: Store only the user's explicit pick (`null` until they choose) and derive the shown value on each render: the pick while it is still offered, else the first offered option (`selectedSlotKind` in `facilities/lib/slot.ts`). Do not seed state from props that may still be loading.

**Applies to**: `packages/app/src/modules/*/components/**` dialogs and forms that preselect from props loaded after mount.
