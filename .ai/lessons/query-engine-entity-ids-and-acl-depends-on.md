---
title: "A list entityId must match the ORM class name; ACL dependsOn is diagnostics only, so grant *.view explicitly"
modules: ["groups", "platform"]
areas: ["module-data", "architecture"]
topics: ["query-engine", "crud-factory", "entity-id", "acl", "role-features"]
---

# A list entityId must match the ORM class name; ACL dependsOn is diagnostics only, so grant *.view explicitly

**Context**: Issue #30 (club spec phase 2 step 2, 2026-10-29) added the `groups` module with a `GroupMembership` entity and gave the coordinator `groups.manage`.

**Problem**: (1) The installed query engine resolves a list's table from the `entityId` through the ORM class name (`@open-mercato/shared` `engine.ts`, `resolveRegisteredEntityTableName`); its table-name fallback iterates a `Map` as an array, so `groups:membership` failed with `relation "memberships" does not exist`. (2) `dependsOn` in `acl.ts` is not expanded at check time (`shared/src/security/aclDependencies.ts` only reports missing dependencies), so `groups.manage` does not imply `groups.view`, although the club spec's feature list says it does.

**Rule**: A `makeCrudRoute` list's `entityId` is `<module>:<snake_case of the ORM class>` (`groups:group_membership`). A role that needs to read gets the `*.view` feature explicitly next to `*.manage` in `@vereino/core` `roleCatalogue`; existing tenants then need their role ACLs synced.

**Applies to**: `makeCrudRoute` lists and `entityId`s of every Vereino module; `@vereino/core` `roles.ts`; module `acl.ts` files.
