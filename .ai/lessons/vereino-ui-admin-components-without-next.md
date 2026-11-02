---
title: "@vereino/ui admin components cannot use DataTable or CrudForm, so they build on primitives and keep every effect and handler in a tested .ts model"
modules: ["ui", "communication"]
areas: ["backend-ui", "testing"]
topics: ["vereino-ui", "datatable", "crudform", "coverage", "next-navigation"]
---

# @vereino/ui admin components cannot use DataTable or CrudForm, so they build on primitives and keep every effect and handler in a tested .ts model

**Context**: P-32 (`AudiencePicker`, `DeliveryStatusList`) of foundation III phase B (#35, 2026-11-02) lives in `packages/ui/src/admin/`.

**Problem**: The platform's `DataTable` and `CrudForm` import `next/navigation`, which `packages/ui` cannot resolve, and the package's tests run without a DOM while requiring 100 % coverage.

**Rule**: Admin components in `@vereino/ui` build on `@open-mercato/ui/primitives/*` (for example the table primitive in a focusable scroll region). A form field is a controlled component that the app mounts as a `CrudForm` custom field. Every effect, request and handler sits in a `.ts` model (`*-model.ts`, `request-effect.ts`) with unit tests; the `.tsx` stays a thin render.

**Applies to**: every shared admin component added to `@vereino/ui`.
