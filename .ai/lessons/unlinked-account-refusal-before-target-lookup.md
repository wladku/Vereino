---
title: "Refuse an unlinked account before any target lookup; a hand-written no-person refusal throws scopeDenialCode"
modules: ["foundation", "communication", "activities", "people"]
areas: ["module-data", "debugging"]
topics: ["data-scoping", "error-codes", "authorize-scoped", "forbidden"]
---

# Refuse an unlinked account before any target lookup; a hand-written no-person refusal throws scopeDenialCode

**Context**: #76 gave an account with no linked person of the club its own 403 `scope_unlinked`, but only inside `authorizeScoped` and `assertInScope`. #155 found reads and commands that refused by hand (`if (!self) throw('scope_denied')`) and kept the bare "no access" message there. The composer also resolved the audience target before `assertInScope`, so an unlinked account got `scope_denied` for an unknown section and `scope_unlinked` for an existing one.

**Problem**: A refusal written by hand for "no linked person" or "not a participant" does not go through the foundation's rule, so it drifts from it. A service that loads or resolves the target before checking the scope answers differently for a record that exists and one that does not, which tells an unlinked caller whether an id exists.

**Rule**: In a read or command that checks the session scope (`scopeContract.resolve(ctx)`) itself, throw `scopeDenialCode(scope)` (from `@/modules/foundation`) wherever the refusal can be caused by a missing `self` grant, and keep `scope_denied` only where the caller is known to be linked (another person, another family's ward, a staff feature). When the service resolves a target before `assertInScope`, refuse first with `if (isUnlinkedScope(scope)) throw('scope_unlinked')`, as `authorizeScoped` does before `loadTarget`. Marker and job scopes keep `scope_denied`.

**Applies to**: `packages/app/src/modules/*/services/**` and `commands/**` that refuse with `foundationErrors.throw('scope_denied')`; `foundation/lib/scope-denial.ts`; TEST-076 and TEST-155.
