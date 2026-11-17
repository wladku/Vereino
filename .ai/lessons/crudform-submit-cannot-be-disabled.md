---
title: "CrudForm's submit button cannot be disabled from outside: draw your own action bar"
modules: ["activities", "platform"]
areas: ["backend-ui"]
topics: ["crudform", "submit-gate"]
---

# CrudForm's submit button cannot be disabled from outside: draw your own action bar

**Context**: The activity wizard (#268, REQ-A04) must keep "Create" disabled until a preview of the current values found no collision. `CrudForm` 0.9.x (`@open-mercato/ui/backend/CrudForm`) has no prop that disables its submit button; `FormActionButtons` disables it only while `pending`.

**Problem**: Throwing from `onSubmit` alone leaves a clickable button, and patching the DOM `disabled` attribute is overwritten by React on the next render.

**Rule**: For a gated submit, render the form with `embedded`, `hideFooterActions` and a fixed `formId` (an embedded form draws no header submit either), then draw the page title and an own action bar with `<Button type="submit" form={formId} disabled={!ready || pending}>`. Keep the same check in `onSubmit` (throw `createCrudFormError(...)`), because Ctrl/Cmd+Enter submits through the form, not the button. Reference: `activities/components/ActivityForm.tsx` (`ActivityCreateForm`).

**Applies to**: any backend `CrudForm` page whose save waits for a precondition (a preview, a confirmation, a dry run).
