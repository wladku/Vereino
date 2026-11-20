---
title: "A row created with em.create has no id before the flush when the database default generates it"
modules: ["groups", "platform"]
areas: ["module-data"]
topics: ["mikro-orm", "seed-defaults", "dictionaries", "scalar-ids"]
---

# A row created with em.create has no id before the flush when the database default generates it

**Context**: Issue #384 (2026-11-19) seeded the PZPN age category ranges next to the platform `DictionaryEntry` rows in `groups/services/age-categories.ts`. The first integration run failed in `yarn initialize`: `Value for AgeCategoryRange.entryId is required, 'undefined' found`.

**Problem**: `DictionaryEntry` (and every Vereino `ScopedEntityBase` entity) declares its primary key with `defaultRaw: 'gen_random_uuid()'`, so `em.create` leaves `id` undefined until the INSERT. A second row that stores the first row's id as a scalar (no ORM relation across modules) reads `undefined`; typecheck and unit tests do not see it.

**Rule**: When a write creates a row and, in the same flush, another row that names it by a scalar id, set the first row's `id` yourself (`id: randomUUID()` from `node:crypto`), as the commands already do for their own rows. Run the seed path (`yarn initialize` inside `yarn test:integration:vereino`) before trusting such a change.

**Applies to**: `seedDefaults`, CLI seeds and commands that create a platform or Vereino row together with a Vereino row keyed by its id (`packages/app/src/modules/*/services`, `commands`).
