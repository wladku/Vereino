---
title: "A dialog form opened from inside another form stops its submit event"
modules: ["ui", "club_core", "people", "groups"]
areas: ["backend-ui", "testing"]
topics: ["dialog", "portal", "crudform", "submit", "event-bubbling"]
---

# A dialog form opened from inside another form stops its submit event

**Context**: #305 added `InlineCreateDialog` (in-place create of an empty picker) to `CrudForm` fields such as the place form's owner institution. TEST-L15 clicked "Add and select" in the dialog and the place form was saved instead: the place appeared in the list without its owner, and the dialog's institution was never selected.

**Problem**: The dialog renders in a portal, outside the outer `<form>` in the DOM, but React bubbles synthetic events through the component tree, not the DOM. A `submit` of the dialog's own `<form>` therefore also reaches the `onSubmit` of the `CrudForm` (or any form) that renders the picker. Unit tests with a fake event do not show it; only a real browser does.

**Rule**: A form rendered in a dialog, popover or other portal that can be opened from inside another form calls `event.stopPropagation()` (besides `preventDefault()`) in its submit handler, and its unit test asserts it. Prefer the shared `InlineCreateDialog` of `@vereino/ui`, which does this.

**Applies to**: `packages/ui/src/admin/inline-create-dialog*.ts(x)`; any module dialog with its own `<form>` opened from a `CrudForm` field or another form.
