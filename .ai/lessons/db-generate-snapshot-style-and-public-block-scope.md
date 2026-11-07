---
title: "db:generate rewrites a module snapshot in its own JSON style, and a public block provider takes its public sections from club_core"
modules: ["groups", "people", "activities", "club_core"]
areas: ["module-data", "architecture"]
topics: ["db-generate", "migrations", "snapshots", "public-pages", "di-providers", "data-scoping"]
---

# db:generate rewrites a module snapshot in its own JSON style, and a public block provider takes its public sections from club_core

**Context**: Issue #91 (2026-11-05) added columns to `groups_groups` and `people_persons` and the first two DD-28 public block providers (`groups.publicCatalog`, `activities.publicSchedule`).

**Problem**: (1) `yarn db:generate` writes the whole `.snapshot-open-mercato.json` with `JSON.stringify(…, 2)`. The `groups` snapshot had been committed in Prettier style (inline arrays) and the `people` one in raw style, so one regeneration produced 170 lines of reformatting noise in `groups`, and running Prettier over both turned `people` into noise instead. `yarn format` does not cover snapshots. (2) A fresh cezar worktree has no `.mercato/generated/**`, so `yarn typecheck` fails with dozens of "Cannot find module '@/.mercato/generated/…'" errors that have nothing to do with the change. (3) A club-page provider needs to know which sections are public, but reading `club_core` sections itself would let each provider decide publication on its own.

**Rule**: After `db:generate`, keep each snapshot in the style it was committed in (Prettier for `groups`, raw for `people`): format only the snapshot that was in Prettier style, and if a file gets rewritten, `git checkout` it and regenerate, deleting the duplicate migration file. The diff must show only the schema change. A snapshot committed in mixed style (`club_core` after #86: Prettier arrays at the top, raw arrays further down) cannot be restored by either formatter: restore it from git and insert only the generated column or table block by hand, then confirm with a second `db:generate` that reports no changes (#199, 2026-11-06). Run `yarn generate` once in a new worktree before the first `yarn typecheck`. A public block provider never decides what is public in another module: `club_core` passes the public sections (`PublicClubBlockContext.sections`, or the one public section on a section page), the owning module filters its own `is_public` records, and personal data leaves `people` only in its published form (`personDirectory.publicNames` → "First L.").

**Applies to**: `packages/app/src/modules/*/migrations/.snapshot-open-mercato.json`, `yarn db:generate`, new worktrees; `club_core/services/public-blocks.ts` and every `*.public*` provider (`payments.publicPrices`, `facilities.publicPlaces` next).
