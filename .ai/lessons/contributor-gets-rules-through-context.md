---
title: "A contributor of another module receives the owner's rules through its context, never by a value import"
modules: ["groups", "activities", "payments", "people"]
areas: ["architecture"]
topics: ["optional-di-contract", "module-boundaries", "eslint-boundaries"]
---

# A contributor of another module receives the owner's rules through its context, never by a value import

**Context**: #311 (season rollover) gave `activities` and `payments` season contributors for the contract `groups` declares in `groups/services/season-rollover.ts`. The contributors first imported `recordActionOf`, `copyEndsOn` and a throw helper from that file; `yarn lint` refused it with `boundaries/dependencies` ("Dependencies with kind \"value\" … moduleId=\"groups\" are not allowed in … moduleId=\"payments\"").

**Problem**: The module-boundaries rule allows a module to import only types from another Vereino module. A contract whose contributors need the owner's rules (or its error codes) cannot hand them over as exports.

**Rule**: Put the rules the contributors apply into the context object the owner passes to `preview`/`apply` (for the rollover: `SeasonRolloverContext.rules`, built from `groups/lib`), and import the contract with `import type` only. The owner's lib stays the single source and keeps its 100 % coverage.

**Applies to**: every optional-DI contributor contract (`groups.season.<module>`, `people.departure.<module>`, later ones) and any shared rule a contributor would otherwise import from the declaring module.
