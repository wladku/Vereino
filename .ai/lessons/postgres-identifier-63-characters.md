---
title: "A constraint or index name over 63 characters is truncated by PostgreSQL and by db:generate"
modules: ["platform", "club_core"]
areas: ["module-data"]
topics: ["migrations", "check-constraints", "naming", "postgres"]
---

# A constraint or index name over 63 characters is truncated by PostgreSQL and by db:generate

**Context**: #471 (2026-11-22). The owner approved a check named `club_core_club_settings_former_participant_retention_months_check` (65 characters). `yarn db:generate` wrote `…_retention_months_che` into the migration, and PostgreSQL would have truncated it the same way without an error.

**Problem**: PostgreSQL identifiers hold at most 63 bytes (`NAMEDATALEN - 1`). A longer name is cut silently, so the name in the spec, the entity's `@Check`/`@Index` and the database differ, and a later `drop constraint if exists "<full name>"` drops nothing.

**Rule**: Keep every table, column, index and constraint name at 63 characters or fewer; for a long column on a long table shorten the middle (`club_core_club_settings_retention_months_check`). When an approved name is too long, use a shorter one in the entity and the migration and record the change and its reason in the migration header and the PR, rather than asking again.

**Applies to**: `@Check`, `@Index`, `@Unique` names in `packages/app/src/modules/*/data/entities.ts`; hand-edited migrations; migration proposals in issues and specs.
