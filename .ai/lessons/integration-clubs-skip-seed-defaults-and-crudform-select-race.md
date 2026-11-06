---
title: "Integration test clubs never run a module's seedDefaults; a CrudForm select clicked before its options load opens nothing"
modules: ["groups", "platform"]
areas: ["testing", "module-data"]
topics: ["seed-defaults", "cli", "playwright", "crudform", "select"]
---

# Integration test clubs never run a module's seedDefaults; a CrudForm select clicked before its options load opens nothing

**Context**: Issue #92 (2026-11-05) seeded the club's PZPN age category dictionary in `groups/setup.ts` `seedDefaults` and drove the group form at 375 px as a coordinator in `E06-S10-team-age-category.spec.ts`.

**Problem**: (1) `createClub` (`.ai/qa/tests/_fixtures/club.ts`) builds a tenant through the API plus `people bootstrap-admin`; no module's `seedDefaults` runs for it, so data seeded only there does not exist in a test club (nor in a club initialized before the seed was added). (2) Clicking a `CrudForm` select (`[data-crud-field-id=…] [role="combobox"]`) right after `page.goto` can land before its `loadOptions` resolved: the click succeeds, no listbox opens, and the next `getByRole('option')` times out although every option request answered 200.

**Rule**: Put a module's per-club seed in a service and expose it as an idempotent operator CLI (`yarn mercato <module> <seed-command> --tenant --org`, printing JSON), call that from `seedDefaults` and from the test fixture. In browser tests pick select options with a retry — open the combobox when `aria-expanded` is not `true`, click the option with a short timeout, all inside `expect(…).toPass()` (see `pick` in `E06-S10-team-age-category.spec.ts`).

**Applies to**: `packages/app/src/modules/*/setup.ts`, `packages/app/src/modules/*/cli.ts`, `packages/app/.ai/qa/tests/**` browser steps on `CrudForm` selects.
