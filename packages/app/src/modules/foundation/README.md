# `foundation` — shared Vereino primitives

Helpers that compose the installed Open Mercato contracts (commands, DI, `auth`, encryption, scheduler, i18n) so every Vereino module implements each mechanic once. Specification: [`.ai/specs/2026-10-27-vereino-foundation-primitives.md`](../../../../../.ai/specs/2026-10-27-vereino-foundation-primitives.md) (P-01…P-19) and, for module jobs, [`.ai/specs/2026-10-27-vereino-foundation-scheduling-primitives.md`](../../../../../.ai/specs/2026-10-27-vereino-foundation-scheduling-primitives.md) (DD-G07). The module owns no table, route, page, event or ACL feature.

## What a primitive is

A **primitive** is a mechanic built once as a shared unit with its own tests (an id `P-nn` in the spec's *Reuse and Ownership Map*); a **helper** is a small shared function without an inventory claim; a **convention** is a platform mechanism used one fixed way. Nothing here re-wraps a platform API that is already one call — modules keep the platform's `CommandHandler`, `makeCrudRoute`, subscriber `metadata`, worker files and injection widgets.

**Inventory rule (REQ-F16).** A primitive may be built before its second consumer only when it is listed in the spec's inventory with at least two backlog stories and ships a self-contained test. Anything else stays in its module until a second module needs it.

**Where code goes.** Framework-free types, predicates and policies → `@vereino/core`; the entity base and column options → `@vereino/db`; code that binds the ORM, DI or the platform → `services/` here (covered by integration tests, S13.1); pure code of this module → `lib/` (100 % unit coverage).

## Public API

Other Vereino modules import every helper below from `@/modules/foundation` (this module's `index.ts`), never from its internal files; the boundaries lint enforces it (REQ-F16).

| Id | Export | File |
|---|---|---|
| P-01 | `ScopedEntityBase`, `decorateScopedEntityBase`, `validFromColumn`, `validToColumn`, `consentColumn` | `@vereino/db` |
| P-02 | `authorizeScoped`, `assertInScope`, `jobCommandContext`, `trustedScopeOf` | `services/authorize-scoped.ts` |
| P-03 | grant types, `grantContaining`, `scopeWhere`, `unionScopes` (`@vereino/core`); `scopeContract.resolve`, `ScopeProvider`, `SCOPE_PROVIDER_TOKEN` | `services/scope-contract.ts` |
| P-04 | `roleCatalogue`, `catalogueRoleFeatures` (`@vereino/core`); `seedRoles`, `rolesForAssignments`, `desiredRoles` | `services/roles.ts` |
| P-05 | `syncAuthRoles` | `services/roles.ts` |
| P-06 | `Validity`, `isActiveAt`, `endsBefore` (`@vereino/core`); `validityShape`, `refineValidity` | `lib/validity-schema.ts` |
| P-07 | `accountAgePolicy` (`@vereino/core`); `createAccount` | `services/accounts.ts` |
| P-08 | `grantConsent`, `withdrawConsent` (`@vereino/core`) | — |
| P-09 | `encryptedField` | `services/encrypted-field.ts` |
| P-12 | `registerModuleSchedule` (naming rules in `@vereino/core`) | `services/register-module-schedule.ts` |
| P-23 | `CalendarItem`, `groupCalendarItemsByDay`, `calendarWeek`, `isServedCalendarRange` (`@vereino/core`); `MemberShell`, `CalendarList`, `toScheduleItem` (`@vereino/ui`) | — |
| P-24 | `Recurrence` (parse/serialise), `expandOccurrences`, `occurrenceDates`, `zonedInstant`, `seriesEditPlan` (`@vereino/core`); `parseRecurrence` (422 `recurrence_unsupported` / `recurrence_invalid`) | `services/recurrence.ts` |
| P-25 | `defineTransitions` (`@vereino/core`); `assertTransition` (409 `invalid_transition`); `advanceWhere` (the job-driven conditional UPDATE: moves the rows still in `from`, returns the ids it changed — first consumer `activities.attendance.expire`, #32) | `services/transitions.ts` |
| P-26 | `Interval`, `intervalsOverlap`, `findOverlaps` (`@vereino/core`); the optional `vereino.occupancyProvider` contract, `occupancyProvider(container)` | `services/occupancy.ts` |
| P-16 | `renderLocalized`, `localeForPerson`, `assertSupportedLocale` (422 `locale_unsupported`, #27) | `services/localized.ts` |
| P-17 | `ErrorCodeTable` (`@vereino/core`); `errors(table)` | `services/errors.ts` |
| helper | `commandContextForRequest`, `errorResponse` (hand-written action and detail routes) | `services/route-context.ts` |

DI tokens (`di.ts`): `vereino.scopeProvider` — registered by the `people` module, not here; `foundationScopeContract`, `foundationAuthorization`, `foundationRoles`, `foundationAccounts`, `foundationEncryptedFields`, `foundationSchedules`, `foundationLocalized`, `foundationErrors`, `foundationScheduling` — stateless services; `vereino.occupancyProvider` — an optional contract registered by `facilities` (phase 5), never here.

Error codes (`lib/error-codes.ts`, thrown by `api/errors.ts`): `scope_denied` (403), `validity_inverted` (422), `email_taken` (409), `locale_unsupported` (422, #27); foundation II: `recurrence_unsupported` (422), `recurrence_invalid` (422), `invalid_transition` (409); `lock_token_required` (400, S5.2: `authorizeScoped` with the default `lock: 'updated_at'` on a loaded target, when the input field and the platform header carry no timestamp). The lock conflict is the platform's reserved `optimistic_lock_conflict` (409), thrown by `enforceCommandOptimisticLockWithGuards`.

## Conventions

- **Commands.** `execute` calls `authorizeScoped(spec, input, ctx, em)` first, inside the write transaction; the result's `actingRole` goes into the command result and `buildLog` writes it to `context.actingRole`; `authorizeReplay` calls it again with `{ mode: 'replay' }` and the handler sets `atomicReplay: true`.
- **Lists.** `list.buildFilters` returns `{ $and: [scopeWhere(await scopeContract.resolve(ctx), allowedKinds, columnMap), businessFilters] }` and the route sets `export: { enabled: false }` (the platform's full export skips `buildFilters`); without a matching grant `scopeWhere` yields `{ id: { $exists: false } }` (`id IS NULL`), because the query engine turns an empty `$in` into invalid SQL. Detail routes load the row in the trusted organization and call `assertInScope`. No hand-written scope check elsewhere.
- **Role sync.** `syncAuthRoles(userId, desired, ctx)` accepts the role list or a function of the current roles (`(current) => desiredRoles({ currentRoles: current, … }, today)`), evaluated under the per-user lock.
- **Subscribers.** A persistent subscriber is the platform shape `metadata { event, persistent: true, id: '<module>:<kebab-name>' }` + `handle`; it is idempotent through the consumer's unique constraint or a set comparison, and a failure is retried by the queue.
- **Jobs.** A module job is registered from `setup.ts` `seedDefaults` with `registerModuleSchedule(container, { module, name, schedule, scope })` — one schedule per organization, never thrown from setup; it takes its scope from the registration, is idempotent and logs `{ processed, failed, skipped }` (S4.7).
- **Worker files (DD-G07).** `workers/<name>.ts` exports `metadata = { queue: '<module>-<name>', id: '<module>:<name>', concurrency: 1 }` and a default `handle(job, ctx)` that re-validates the injected `tenantId` / `organizationId` with Zod and dispatches one module command with `jobCommandContext(container, scope)` (scope source `{ job: true }`, acting role `system`).
