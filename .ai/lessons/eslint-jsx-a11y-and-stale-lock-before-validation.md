---
title: "The first .tsx of a Vereino module needs jsx-a11y rules without the plugin object; a stale lock token answers 409 before validation"
modules: ["club_core", "platform"]
areas: ["backend-ui", "debugging"]
topics: ["eslint", "jsx-a11y", "flat-config", "optimistic-lock", "crud-factory", "integration-tests"]
---

# The first .tsx of a Vereino module needs jsx-a11y rules without the plugin object; a stale lock token answers 409 before validation

**Context**: Issue #25 (club spec phase 1 step 2, 2026-10-28) added the first backend pages of a Vereino module (`club_core/backend/club/*`) and the first `makeCrudRoute` update tests that send the optimistic-lock header.

**Problem**: (1) With the first `.tsx` file under `src/modules/<vereino-id>/`, ESLint stopped with `Cannot redefine plugin "jsx-a11y"`: `eslint-config-next` already registers its own copy of the plugin for every `.tsx` file, and spreading `jsxA11y.flatConfigs.recommended` registers a second plugin object under the same name. (2) `makeCrudRoute` registers a generic optimistic-lock reader and runs a route-level guard before the command (`@open-mercato/shared` `crud/factory.ts`), so an update with another record's (stale) token answers 409 even when its body would fail validation with 400 — a test that reused the wrong token asserted the wrong status.

**Rule**: In `packages/app/eslint.config.mjs` the Vereino `jsx-a11y` entry passes only `rules: jsxA11y.flatConfigs.recommended.rules` for the module `.tsx` files, never the plugin object. An update test sends the token of the record it updates; a 400 assertion needs a current token, and a 409 assertion is checked separately.

**Applies to**: `packages/app/eslint.config.mjs`; Vereino module pages and components (`*.tsx`); `makeCrudRoute` update and delete routes with the optimistic lock; `packages/app/.ai/qa/tests/**`.
