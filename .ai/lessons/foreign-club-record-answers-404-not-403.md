---
title: "A record of another club answers 404, never 403, and every route has a cross-club probe"
modules: ["foundation", "payments", "platform"]
areas: ["module-data", "debugging", "testing"]
topics: ["tenant-isolation", "authorize-scoped", "existence-leak", "route-inventory"]
---

# A record of another club answers 404, never 403, and every route has a cross-club probe

**Context**: The cross-club isolation guard of #628 (D-034: one instance serves many clubs) ran every Vereino route
as each role of club A against a second club B in the same tenant. Reads were clean, but about 300 write probes
answered 403 `scope_denied` for club B's record where a random id answered 404, and discount rules stored club B's
person ids (201/200).

**Problem**: Command loaders look a target up by `id` + `tenantId` only, so another organization's row of the same
tenant is found; `authorizeScoped` then refused it with 403, which tells the caller the id exists in some other club.
Body fields that name records (`conditions.personIds` of a discount rule) were stored without checking they belong to
the club. Neither shows up in single-club tests.

**Rule**: A loaded target of another organization answers exactly like a missing one (404): `authorizeScoped` does it
centrally, keep it that way and do the same in any hand-written check. Every id a request names in its body is
looked up in the caller's club (a module directory `find…` with the trusted scope) before it is stored; unknown and
foreign ids get the same 404/422. A new route or method gets its probes in
`packages/app/.ai/qa/tests/_fixtures/isolation/inventory/<module>.json` (records in `seed-<module>.ts`);
`route-isolation:check` in `yarn verify` fails without them, and `ISSUE-628-cross-club-isolation` runs them.
Exemptions need a reason and are only for requests that name no record.
A branch that adds routes and was opened before #628 landed fails `route-isolation:check` as soon as it merges
`main` (#610): add the probes in the merge fix, not later. The probe engine follows redirects, so a route that
redirects to an external provider (OAuth `start`, `link`) is exempt; records that only an OAuth round trip creates
are seeded through the in-process fake of the module's own tests (`seed-foundation.ts` uses the Google fake).

**Applies to**: `packages/app/src/modules/foundation/services/authorize-scoped.ts`, every module command with a
`loadTarget`, create/update commands with id references, `packages/app/.ai/qa/tests/_fixtures/isolation/`.
