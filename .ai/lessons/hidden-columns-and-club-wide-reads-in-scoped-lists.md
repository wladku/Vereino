---
title: "Hide a per-caller column outside the CRUD projection; a club-wide read of a section-scoped kind uses clubWideKinds"
modules: ["people", "foundation"]
areas: ["module-data", "architecture"]
topics: ["data-scoping", "crud-factory", "after-list", "consents", "acting-role"]
---

# Hide a per-caller column outside the CRUD projection; a club-wide read of a section-scoped kind uses clubWideKinds

**Context**: Issue #26 (club spec phase 1 step 3, 2026-10-29) gave coordinators a club-wide read of the people records (basic data, no PESEL or consents) and showed guardianship consents only to the club administrator and the ward's guardians.

**Problem**: (1) `makeCrudRoute`'s `transformItem` does not receive the request context (`@open-mercato/shared` `crud/factory.ts`), so a per-caller column cannot be hidden there; projecting it and stripping it later leaks it whenever the hook is skipped. (2) A coordinator grant matches only `sectionId`, so `scopeWhere` and `assertInScope` could not express the coordinator's club-wide read of people.

**Rule**: Leave a per-caller sensitive column (`consents`) out of the list projection and add it in `afterList` only for the rows the caller may see, so a skipped hook fails closed. For a club-wide read of an otherwise section-scoped kind, pass `{ clubWideKinds: [...] }` to both `scopeWhere` and `assertInScope` (`@vereino/core` `ScopeMatchOptions`); when the acting role chooses the view (`full` / `basic`), order the read kinds so the club-wide kind comes last (`self, guardian, club_admin, coordinator`).

**Applies to**: `makeCrudRoute` lists with record scope in every Vereino module; `@vereino/core` `scopeWhere`, `grantContaining`, `findActingRole`; `foundation` `assertInScope`.
