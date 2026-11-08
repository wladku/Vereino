---
title: "CrudForm's required check runs before onSubmit; a field with a domain message checks emptiness itself"
modules: ["payments", "platform"]
areas: ["backend-ui", "testing"]
topics: ["crud-form", "validation", "custom-field", "acceptance-criteria", "playwright"]
---

# CrudForm's required check runs before onSubmit; a field with a domain message checks emptiness itself

**Context**: Issue #115 (E07-S08) asks for "Select at least one group" when the kit order wizard is saved without a group. The groups field was a `type: 'custom'` CrudForm field with `required: true`, and `onSubmit` threw `createCrudFormError` with the domain message. The browser test found "This field is required" under the chips instead.

**Problem**: CrudForm 0.9.0 validates `required` fields before it calls `onSubmit`. An empty array counts as missing, so the generic message wins and the domain message never shows. Nothing fails at type level, and an API-only test passes, because the route answers its own 400.

**Rule**: When an acceptance criterion names the message for an empty field, leave `required` off that field and check emptiness in `onSubmit` with `createCrudFormError(message, { [fieldId]: message })`. A custom field with `rendersOwnError: true` shows that field error. Cover the message in a browser test, not only through the API.

**Applies to**: `packages/app/src/modules/*/components/**` CrudForm forms with custom fields (chips, repeatable groups), e.g. `payments/components/orders/OrderCampaignForm.tsx`.
