# Vereino foundation — reusable backend and frontend primitives, with staff accounts and roles (#38) as the first consumer

**Date**: 2026-10-27
**Status**: Draft (design complete and reviewed; waiting for the product owner's approval on the PR and for approval to enable the `scheduler` and `progress` modules)

> Use `om-spec-writing` for every new application, multi-module feature, or other non-trivial business slice. Keep every section below; write `N/A — {reason}` when a section does not apply. Change the status to `Ready for implementation` only after every blocking open question is resolved and the traceability table covers every requirement.

Sources: issue #38 (staff accounts, seeded club roles, `auth` role sync), `.ai/specs/backlog.md` (E02–E05), `.ai/specs/product-brief.md` (Scope, Key flows, Business rules R01–R16, Decisions), `.ai/specs/2026-10-20-vereino-club-management.md` (phase 1 ready since 2026-10-27; *Users, Permissions, and Scope*, *Reuse and Ownership Map*, *Data Models*, DD-06, DD-07, DD-33, DD-35, DD-37, DD-38, DD-39; contract verifications V-1, V-2, V-3, V-10, V-11, V-12), `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (S3, S4, S4.9, S4.10, S6.7, S13, S16.1), `AGENTS.md` (workspaces table, extraction rule), `.ai/runs/2026-10-26-spec-architectural-review.md`, the API digest of the installed `@open-mercato/*` 0.9.0 packages (2026-10-27: `shared/lib/commands/*`, `shared/lib/crud/*`, `shared/modules/{events,setup,registry,encryption}.ts`, `core/modules/auth/{commands/users.ts,services/rbacService.ts}`, `core/modules/progress`, `scheduler`, `ui/{backend,portal,primitives}`), the open-source research of 2026-10-27 (*Overview*). The social sign-in that was designed here on the same day lives in its own specification, `2026-10-27-vereino-social-sign-in.md` (split per Q14). Paths `src/...` are relative to `packages/app/`; `@om/*` means `packages/app/node_modules/@open-mercato/*/src`.

## TLDR

Every story in the backlog repeats the same mechanics: a record scoped to a tenant, an organization and a role; a command that parses, checks scope, asserts the lock and records the acting role; a role or consent valid for a period; a link that works without a session; a file imported through a preview and a review queue; a page that shows only what the viewer's roles allow. The club management spec designs each feature but not where these mechanics live, so each of the seven planned modules would re-implement them. This specification designs the **foundation**: framework-free primitives in `@vereino/core`, MikroORM mixins in `@vereino/db`, a thin member layer in `@vereino/ui`, and one framework-bound Vereino module `foundation` (`src/modules/foundation/`) that wraps the installed commands, DI, events, `auth`, `attachments` and `progress` contracts. Issue #38 is the first consumer and the acceptance oracle: it must be buildable on these primitives alone. Nineteen primitives (P-01…P-19) are designed; phase A builds the twelve that #38 and the other E02 stories touch, phase B the link, import and public-block primitives with their first consumers; everything else is designed here and built with its first consumer, never before.

## Problem Statement

Seven modules (`club_core`, `people`, `groups`, `activities`, `communication`, `payments`, `facilities`) are planned over five phases, implemented by agents one story at a time. The club spec fixes the contracts (routes, events, IDs, tables) but not the implementation mechanics behind them. Without a foundation each story writes its own scope check, lock assertion, acting-role capture, token handling and import loop — the architectural review of 2026-10-26 already found undeclared `scopeService` sources and a fail-open treasurer scope, the class of defect a shared, tested primitive prevents. The three workspace packages exist but export nothing (`packages/{core,db,ui}/src/index.ts` are `export {}`).

## Overview and Success Measures

- **Primary outcome:** every phase 1 story (#25–#29, #38) ships with exactly one implementation of each mechanic listed in F1–F16; measured at the phase 1 exit gate by the foundation's lint rule (`vereino/no-local-scope-check`, see F16) reporting zero violations and by the review checklist.
- **Leading indicators:** #38 implemented with the primitives only (its PR lists which P-ids it used — target: P-01…P-07, P-09, P-12, P-13, P-16, P-17, P-18 and nothing bespoke); the second consumer of each primitive (E02-S02, E02-S03) adds no change to the primitive's public API.
- **Baseline:** 0 shared primitives; 3 empty packages; 4 reference scaffold modules not owned by Vereino.
- **Market / product reference (research 2026-10-27):** *adopted* — MikroORM's optimistic lock shown to the user, never retried server-side; CASL's "same rule set filters lists and guards details" (one scope contract drives both); Odoo's two layers (model ACL default-deny, then record rules) with record scope **default-deny** (Casbin domain tuple shape); Odoo `implied_ids` for role implication (`dependsOn`); Auth.js `VerificationToken` return-and-delete (single use by construction) and Django's uniform "done" response for link requests; Baserow/Odoo import (auto-map by header, preview, test before import, idempotent re-import by external id, async job); listmonk's consent status that never deletes the row on withdrawal; shadcn Sidebar composition for the member shell; Medusa v2 module links (no shared tables, ids only). *Rejected* — django-simple-history per-model history tables (one `acting_role` column suffices); Keycloak composite roles (no validity periods; our sync job owns them); stateless HMAC tokens (a stored single-use row gives the audit trail); Baserow's 5-second undo (explicit review queue instead); shadcn block variants.

## Goals

- **REQ-F01** (Must) — Every Vereino entity carries the standard scope and lifecycle columns through one mixin, and every domain mutation runs through one command wrapper that parses, derives scope, asserts the lock, records the acting role and emits side effects after commit.
- **REQ-F02** (Must) — One scope contract (`ScopeContract`) resolves a user's record scope for every module, fails closed when no person is linked, and drives both list filters and detail guards.
- **REQ-F03** (Must) — The `vereino_*` roles are declared once as data with their features and implications, seeded idempotently, and kept in sync with business role assignments and their validity periods (#38, TEST-005).
- **REQ-F04** (Must) — Accounts are created only through one wrapper over `auth.users.create` that applies the club's age threshold, sends the invitation and handles a failed invitation e-mail (V-2).
- **REQ-F05** (Must) — Validity periods and consents share one value type and one column pattern; a consent withdrawal keeps the row and its history in the audit log.
- **REQ-F06** (Must) — Encrypted personal fields are declared through one helper that adds the hash sibling, the lookup candidates and the search exclusion (V-3, DD-38).
- **REQ-F07** (Must) — Links that work without a session (declarations, orders, request confirmations, personal link requests) use one token service: hashed, single-use, scoped, expiring, with uniform 202 responses and IP + e-mail rate limits (DD-35, V-10, V-12).
- **REQ-F08** (Must) — Bulk imports (people, fixtures, bank statements) run through one pipeline: upload to the private `attachments` partition, mapping, classification, review queue, commit with progress, purge.
- **REQ-F09** (Must) — Club settings are declared with typed defaults once and read through one service (DD-37).
- **REQ-F10** (Must) — Persistent subscribers and scheduled jobs are declared through wrappers that enforce idempotency, scope from registration and counted logs (S4.6, S4.7).
- **REQ-F11** (Must) — Server-side text (e-mails, notifications) renders in a person's preferred locale through one helper (V-11).
- **REQ-F12** (Must) — Every module declares its error codes through one typed table and factory (S6.7, `contracts:check`).
- **REQ-F13** (Must) — Member pages share one shell: role-aware tiles, a role-context switcher that is a view filter only (DD-07), a ward selector, consent toggles and the locale switcher.
- **REQ-F14** (Should) — Token pages, public pages with block slots, the import wizard and declaration controls are shared components built with their first consumer.
- REQ-F15 (social sign-in) moved on 2026-10-27 to `2026-10-27-vereino-social-sign-in.md` (REQ-S01…S04); the id is not reused.
- **REQ-F16** (Must) — The extraction rule in `AGENTS.md` is amended once so that a primitive may be built ahead of its second consumer only when it is in this inventory with at least two backlog stories and a self-contained test, and a lint rule stops modules from re-implementing a listed mechanic.

## Non-goals

- Re-documenting or wrapping what the platform already provides: `makeCrudRoute`, `DataTable`, `CrudForm`, `withAtomicFlush`, `createModuleEvents`, `rbacService`, `ProgressService`, the i18n catalogues. The primitives compose these; a wrapper that only renames a platform API is an invention and is not built.
- Business entities, routes and pages — they stay in their modules per the club spec; `foundation` owns no business table.
- Social sign-in (Google, Facebook): designed in `2026-10-27-vereino-social-sign-in.md`, which consumes P-01, P-02, P-09, P-13 and P-17 from this spec.
- Self-registration, JIT account creation, SAML, enterprise `sso`, MFA (lesson `enterprise-package-is-commercial`).
- Money, discount, calendar-grid, CSV-report and recurrence primitives — named as P-21…P-24 placeholders in *Implementation Phases*; built with phases 2 and 4.
- Push notifications, native apps (N02, N12).

## Proposed Solution

Four homes, one rule. `@vereino/core` holds framework-free value types, predicates and policies (scope predicates, validity, consent state, token policy, row classification, role catalogue data, error-code types). `@vereino/db` holds the MikroORM mixins and migration helpers. `@vereino/ui` holds the member layer built on `@open-mercato/ui` primitives and semantic tokens. The module `foundation` (`src/modules/foundation/`, listed in `vereino-modules.json`) holds everything that needs the platform: the command wrapper, the scope resolver and its DI token, role seeding and sync, account creation, token links, the import pipeline, settings, public blocks, subscriber and job wrappers, localized rendering and the error factory. Business modules depend on `foundation` through its public TypeScript API (`@/modules/foundation`, type and value imports of helpers only — never its entities) and through DI tokens; `foundation` depends on no business module (optional data providers such as `people.scopeService` are resolved by token with `hasRegistration`). The rule: a mechanic is implemented once, here, with its own tests; a module that re-implements a listed mechanic fails lint (REQ-F16). This is the smallest platform-native solution because every primitive is a thin composition of an installed contract that the digest located, not a parallel subsystem.

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-F01** Framework-bound primitives live in a Vereino module `foundation`; framework-free ones in `@vereino/core`; ORM mixins in `@vereino/db`; member UI in `@vereino/ui` (Q3 = A) | Discovery, DI, events, ACL and migrations exist only for modules; S4.9 keeps `@vereino/core` framework-free | A fourth package `@vereino/platform`; `src/lib/vereino/**` | The package needs an amendment to the workspaces table and S4.9/S4.10; `src/lib` has no discovery, so role sync, routes and blocks could not live there |
| **DD-F02** The extraction rule is amended once (Q2 = A): a primitive may precede its second consumer only when listed here with ≥ 2 backlog stories and a test | Without the amendment #38 would write role sync, scope resolution and token handling twice | Keep the rule and extract in phase 2 | Costs a rewrite of phase 1 code and leaves the review-found scope defects in place |
| **DD-F03** The scope *contract* (interface, kinds, fail-closed union, predicates) is owned by the foundation; the scope *data* stays in `people` (`people.scopeService` registers as the single `ScopeProvider`; Q6) | The club spec makes `people` the sole source; the foundation must not import `people` | Move scope data into `foundation` | Would couple the foundation to business tables and reverse the dependency direction |
| **DD-F04** Optimistic locking uses the platform's `updated_at` token and `assertOptimisticLock` (header `x-om-ext-optimistic-lock-expected-updated-at`), not an integer `version` column | The installed CRUD factory, `CrudForm` (`optimisticLockUpdatedAt`) and the example module all use `updated_at`; one convention across platform and Vereino tables | MikroORM `@Property({ version: true })` integer (research: preferred by the ORM) | Would split the lock protocol between platform and Vereino entities; the timestamp collision risk is accepted and detected by TEST-F01 |
| **DD-F05** Role sync writes through the command `auth.users.update` with the full desired `roles: string[]`, computed from active assignments | `rbacService` has no grant/revoke API and `syncUserRoles` is private (V-F02); the command resolves names per tenant and emits `auth.role.assigned`; the club spec's events row is corrected accordingly | Direct writes to `user_roles` | Bypasses the platform's audit, events and ACL cache invalidation |
| **DD-F06** Token links are a service parameterised by the owning entity (`activities_declaration_tokens`, `payments_order_links`, `facilities_rentals`), not a `foundation` table | The club spec keeps these tables in their modules; DD-35 names each lookup key | One `foundation_token_links` table | Cross-module ORM relations and a system-scope table that every module reads |
| **DD-F07** The import pipeline is a service over a module-owned `*_imports` / `*_import_rows` pair that implements two mixins; classification and matching are callbacks | Same reason as DD-F06; `people_imports` is already designed with its columns (DD-38) | Foundation-owned import tables | Row payloads are module data under module encryption maps |
| **DD-F08** `acting_role` is derived by the command wrapper from the scope kind that allowed the action (DD-07); the UI context switcher only filters views | A client-sent role is untrustworthy | Context switcher as the source of truth | Rejected by DD-07 |
| **DD-F12** Member layer: thin shells and controls only (Q5 = A), built on `@open-mercato/ui` primitives (`Card`, `Button`, `Dialog`, `StatusBadge`, `LanguageSwitcher`) and the platform's semantic tokens; no own palette, no `dark:` forks | At least two member pages share each shell; the platform tokens already cover light and dark | Per-page assembly; a Vereino design system | Five pages would repeat the Today tiles, switcher and ward selector; an own design system contradicts `backend-ui.md` |

DD-F09, DD-F10, DD-F11 and DD-F13 (social sign-in) moved to the social sign-in spec as DD-S01…DD-S06; the ids are not reused.

## Domain Vocabulary and Business Rules

| Term | Definition | Owner | Rule / failure |
|---|---|---|---|
| Scope | The set of record ids a user may read or write, per kind: `club_wide` (optionally limited to a module), `section_ids`, `coached_group_ids`, `substitute_occurrence_ids`, `place_ids`, `maintenance_place_ids`, `ward_person_ids`, `self_person_id` (club spec *Record scope* row) | contract: `foundation` (`@vereino/core` types); data: `people` | No person linked to the user, or no provider registered → empty scope, fail closed; never "everything" |
| Scope kind that allowed the action | The first scope kind, in a fixed order, under which the target record is in scope; becomes `acting_role` | `foundation` | Derived on the server (DD-07); a client value is ignored |
| Validity | `valid_from` (date, required) and `valid_to` (date, optional); active at `now` when `valid_from ≤ now` and (`valid_to` empty or `now ≤ valid_to`) | `@vereino/core` | `valid_to < valid_from` → 422 `validity_inverted` |
| Consent record | A `<consent>_at` timestamptz column exactly as the club spec defines it on `people_persons` (`publish_name_consent_at`, `share_contact_with_coaches_at`, `share_presence_with_guardians_at`): set = granted at that instant, null = never granted or withdrawn; the row is never deleted; the grant and withdrawal dates survive in the command's `audit_logs` entry (no extra column — the club's protected columns stay as listed) | `@vereino/core` type, `@vereino/db` column helper | Withdrawal of a consent that is not granted → no-op, 200 |
| Token link | A row in a module table with `token_hash` (the platform's `hashAuthToken`, HMAC-keyed), `expires_at`, `used_at`, `tenant_id`, `organization_id`, a subject id and a purpose; the raw token travels only in the e-mail link | `foundation` service, module table | Expired → 410 `token_link_expired`; used → 410 `token_link_used`; unknown → 404 without detail; all public requests for a link return 202 |
| Import batch / row | A module-owned pair of tables implementing `ImportBatchMixin` (`file_attachment_id`, `mapping`, `status`, `summary`, `committed_at`) and `ImportRowMixin` (`row_no`, `raw` encrypted, `classification`, `decision`, `error_code`, `error_column`) | `foundation` service, module tables | Commit of a committed batch → 409 `import_already_committed`; a row error never carries the cell value |
| Club setting | A key with a typed default declared once by its owning module (`defineClubSettings`), stored on `club_core_club_settings`, read through the settings service | `foundation` registry, `club_core` storage | Unknown key → type error at build time; invalid stored value → the default, with a `foundation.settings.invalid` report fingerprint |
| Public block | A DI-registered renderer a module contributes to a public page slot, filtered by `club_settings.publication` | `foundation` registry | A block whose module is disabled is skipped; it never throws into the page |

One vocabulary for scope kinds and acting roles (the club spec's *Record scope* row and its `acting_role` values), in the fixed order `allowingKind` evaluates:

| `ScopeKind` (`Scope` field) | Source assignment or relation (`people`) | `ActingRole` recorded |
|---|---|---|
| `club_wide` (`clubWide: 'all'`) | active `club_admin` assignment | `club_admin` |
| `club_wide` limited to `payments` (`clubWide: { modules: ['payments'] }`) | active `treasurer` assignment | `treasurer` |
| `section_ids` | active `coordinator` assignment with `section_id` | `coordinator` |
| `coached_group_ids` ∪ `substitute_occurrence_ids` | `coach`/`assistant` membership, default coach, substitution | `coach` |
| `place_ids` | active `facility_operator` assignment with `place_id` | `facility_operator` |
| `maintenance_place_ids` | `facilities_place_maintainers` row (optional provider) | `maintenance_planner` |
| `ward_person_ids` | active guardianship | `guardian` |
| `self_person_id` | the linked person | `self` |

## Users, Permissions, and Scope

The foundation adds no business actor and no ACL feature of its own in phases A–B: every primitive runs inside the calling module's route or command and inherits its gate; the sessionless token routes keep `metadata.rateLimit` (V-10) plus the `checkAuthRateLimit` IP + e-mail key. The foundation never widens a scope: the union combinator can only narrow to the registered provider's answer, and an absent provider yields the empty scope. (The two identity features `foundation.identity.self` / `foundation.identity.manage` belong to the social sign-in spec.)

## Reuse and Ownership Map

| Primitive | Reuse / extend / app-own | Installed seam (digest 2026-10-27) | Why |
|---|---|---|---|
| P-01 `ScopedEntityBase` | app-own (mixin) | the example entity pattern: `tenant_id`, `organization_id`, `created_at`, `updated_at`, `deleted_at`, `@Unique` | the platform has no base class; one mixin keeps the lock token and soft delete identical everywhere |
| P-02 `defineScopedCommand` | extend | `CommandHandler` (`prepare`/`execute`/`undo`), `registerCommand`, `parseWithCustomFields`, `assertOptimisticLock`, `runCrudCommandWrite`, `emitCrudSideEffects`, `extractUndoPayload` | one place for the S4.4 sequence and DD-07 |
| P-03 `ScopeContract` | app-own (contract) + extend (DI) | Awilix `container.register(asFunction().scoped())`, `hasRegistration` | the platform RBAC knows features, not record scope (DD-06) |
| P-04 `RoleCatalogue` | extend | `acl.ts` features with `dependsOn`; `setup.ts` `defaultRoleFeatures` + `seedDefaults`; `yarn mercato auth sync-role-acls` | role names are data; seeding is the platform's |
| P-05 `syncAuthRoles` | extend | command `auth.users.update` (`roles: string[]`), `commandBus.execute` | DD-F05 |
| P-06 `Validity` | app-own | — (pure) | S3.5 time as a parameter |
| P-07 `createAccount` | extend | command `auth.users.create` (`sendInviteEmail`, `warning: 'invite_email_failed'`), `api/users/resend-invite` (V-2) | the platform owns users and invitations; the foundation returns `userId` and the `people` command writes `people_persons.user_id` (S4.3) |
| P-08 `ConsentRecord` | app-own | — (pure type + column helper) | listmonk pattern; consumers E02-S02 (`publish_name_consent_at`, guardianship consents), E02-S03 (the D22/D23 consents on `/club/profile`), E03-S05 (DD-39) |
| P-09 `EncryptedField` | extend | `defaultEncryptionMaps` (`hashField`), `findWithDecryption`, `lookupHashCandidates`, `search.ts` `fieldPolicy.excluded` (V-3) | one declaration produces map, hash and search policy together |
| P-10 `TokenLinkService` | extend | `generateAuthToken` / `hashAuthToken` pattern (`core/modules/auth/lib/tokenHash.ts`), `metadata.rateLimit`, `checkAuthRateLimit`, system-scope lookup per DD-35 | Auth.js return-and-delete semantics on module tables |
| P-11 `ImportPipeline` | extend | `attachments` private partition, `ProgressService` (`createJob`…`completeJob`), the bulk outbox pattern of `example/lib/todoBulkComplete.ts`, commands of the owning module | DD-38 |
| P-12 `defineScheduledJob` | extend | `schedulerService.register(...)` in `seedDefaults`, worker `metadata` + `handle(job, ctx)`, `createRequestContainer()` | S4.7 |
| P-13 `definePersistentSubscriber` | extend | subscriber `metadata { event, persistent: true, id }`, `handle(payload, ctx)` | S4.6 |
| P-14 `defineClubSettings` | extend | `club_core_club_settings` (DD-37), `createModuleEvents` for change events | typed defaults |
| P-15 `PublicBlocks` | extend | Awilix registrations by token prefix `publicBlock:<module>.<name>`, `InjectionSpot` for rendering | the DI block mechanism the club spec names |
| P-16 `renderLocalized` | extend | `loadDictionary(locale)`, `createFallbackTranslator`, `resolveSupportedLocale`, `getSupportedLocales` (V-11) | no explicit-locale `resolveTranslations` exists; the primitive adds the fallback chain (person → club default → `en`) and the supported-locale validation, which no installed helper composes |
| P-17 `defineErrorCodes` | extend | `CrudHttpError`, `contracts:check` (`packages/app/scripts/check-vereino-contracts.mjs`), `openApi` | S6.7; the primitive adds the typed table shape `contracts:check` reads, the duplicate-code check across modules and the OpenAPI listing — consumers #38, E02-S01 (`club_core`) and every later module |
| P-18 member shell | extend | `@open-mercato/ui` `Card`, `Button`, `Dialog`, `StatusBadge`, `LanguageSwitcher`, `InjectionSpot`; reference `/[orgSlug]/portal/dashboard` (`PortalPageHeader`, `PortalCard`, `PortalEmptyState`) | DD-F12 |
| P-19 token / public / import / declaration UI | extend | `Dialog`, `useConfirmDialog`, `DataTable` for previews, `FormField` | built with first consumers |

P-20 `IdentityLink` moved to the social sign-in spec; the id is not reused.

## Architecture and Data Flow

```text
packages/core (@vereino/core)  ◄── packages/db (@vereino/db)  ◄── packages/app
       ▲                                                         │
       └───────────────── packages/ui (@vereino/ui) ◄────────────┘
                                                                  src/modules/foundation  ◄── club_core, people, groups, activities, communication, payments, facilities
                                                                  (helpers, DI tokens; no business entity, no route in phases A–B)

Route (module) ─► validators (Zod) ─► defineScopedCommand(handler)
   prepare: parse → ensureScope(ctx) → scopeContract.resolve(user) → isInScope(target) → assertOptimisticLock → acting_role
   execute: runCrudCommandWrite(phases) → emitCrudSideEffects (events, indexer) after commit → undo seam
scopeContract.resolve(user) ─► ScopeProvider (DI token `vereino.scopeProvider`, registered by people.scopeService)
                             ─► union of kinds in fixed order; absent provider or unlinked user → EMPTY (fail closed)
people.role_assignment.{created,updated,deleted} ─► definePersistentSubscriber(syncAuthRoles) ─► auth.users.update { roles }
scheduler people:sync-role-expiry ─► defineScheduledJob ─► syncAuthRoles for assignments past valid_to
Public link ─► GET /api/<module>/.../{token} ─► TokenLinkService.consume(entity, token) ─► DD-35 lookup (token_hash) ─► scope narrowed ─► module command
Upload ─► ImportPipeline.create (attachments private) ─► map ─► classify (callback) ─► rows ─► review (decide_row) ─► commit (module commands, ProgressService) ─► purge job
```

- **Dependency direction:** `app → ui | db → core` unchanged; inside the app, business modules → `foundation` → platform. `foundation` imports no business module; it reaches `people` only through the `vereino.scopeProvider` token with `hasRegistration` (absent → empty scope) and reaches `club_core` storage only through the settings service token the `club_core` module registers in phase 1 step 2.
- **Shared packages:** `@vereino/core` exports types, predicates and policies only (S4.9); `@vereino/db` exports mixins and migration helpers and is imported only by `data/entities.ts` and migrations; `@vereino/ui` exports the member layer and is imported by `frontend/**` pages.
- **Extension points the foundation defines:** DI tokens `vereino.scopeProvider`, `vereino.clubSettings`, `vereino.publicBlock:<module>.<name>`; the lint rule `vereino/no-local-scope-check`.
- **Compatibility:** the DI tokens, the error codes and the `vereino_*` role names become protected surfaces at the first deployment (`BACKWARD_COMPATIBILITY.md` §2, §4). The exported TypeScript APIs of `@vereino/core|db|ui` and of `foundation` stay **internal** surfaces under §1 (change them and every consumer in the same PR; `yarn typecheck` is the guard) until a package is ever published; phase A adds a §1 row naming `foundation` as an internal surface with that path.

## User Journeys

### Journey J-F01 — A coordinator gets an account and her scope (consumer: #38)

1. The administrator creates the person and saves a `coordinator` assignment for section A (P-02 command in `people`, P-06 validity). No account yet: `syncAuthRoles` (P-05) finds no `user_id` and records nothing.
2. The administrator chooses "Create account": `createAccount` (P-07) checks the threshold from `clubSettings.own_account_min_age` (P-14), calls `auth.users.create` with `roles` computed from the active assignments through `RoleCatalogue` (P-04) and `sendInviteEmail: true`, and returns `userId`, which the `people` command stores; the person's `preferred_locale` chooses the e-mail language (P-16); a failed e-mail returns `invite_email_failed` and the UI offers "Resend".
3. She sets her password through `/reset/<token>`, signs in, lands on `/club` (P-18): the shell asks `ScopeContract` (P-03) and shows the coordinator tiles for section A only; the switcher is hidden because she has one role.
4. Her assignment ends: `people:sync-role-expiry` (P-12) runs `syncAuthRoles`, `auth.users.update` removes `vereino_coordinator`; the next request to a section route returns 403 (TEST-005, TEST-F03).

### Journey J-F02 — The administrator imports families (consumer: E02-S04)

1. `/backend/people/imports` uploads a file: `ImportPipeline.create` stores it in the private `attachments` partition and the batch row (`people_imports`), suggests the mapping by header (Baserow pattern), and classifies rows through the `people` callback (`pesel_hash` / `external_id_hash` match, never names — DD-38).
2. The review queue shows rows classified `review`/`error`; decisions go through `people.imports.decide_row`.
3. Commit runs the `people` commands row by row inside a `ProgressService` job; a second commit returns 409 `import_already_committed`; `people:purge-import-rows` (P-12) deletes rows 30 days later.

### Journey J-F03 — A guardian declares from an e-mail link (consumer: E03-S03)

1. The reminder e-mail (P-16, locale of the guardian) carries `/club/d/<token>`; the page (P-19 `TokenPageShell`) calls `GET /api/activities/declaration-links/{token}`.
2. `TokenLinkService.consume` performs the single DD-35 lookup on `activities_declaration_tokens.token_hash`, narrows every further query to the found tenant and organization, refuses expired (410) and used (410) tokens, and returns the session and the wards the token covers.
3. The declaration command runs with the scope derived from the token (`ward_person_ids` of that guardian only) and `acting_role = guardian`.

## UI and Interaction Contracts

### UI architecture

Admin pages keep the platform shell and `DataTable`/`CrudForm` from `@open-mercato/ui` directly. Member (`/club/*`) and public (`/p/*`) pages use the member layer from `@vereino/ui`, which composes `@open-mercato/ui` primitives and the platform's semantic tokens (`--background`, `--card`, `--primary`, `--muted-foreground`, `--status-*`); it defines no colour of its own and no `dark:` override. Reference pages: `/[orgSlug]/portal/dashboard` (`PortalPageHeader`, `PortalCard`, `PortalEmptyState`, `InjectionSpot 'portal:dashboard:sections'`) for the Today shell; `/backend/profile` for the profile sections; `/quote/[token]` (`sales`) for token pages. Every component below ships loading, empty, error, conflict (where a write exists), keyboard, `aria` and 375-px behaviour, light and dark, and is exercised by TEST-F11.

| Surface / component | Behaviour | Data source and mutations | Reference | Canonical components | States | Requirement IDs |
|---|---|---|---|---|---|---|
| `MemberPage` (`@vereino/ui`) | shell for `/club/*`: header with greeting, `WardSelector`, `RoleContextSwitcher`, `LanguageSwitcher`; single column at 375 px | `GET /api/people/me` (scope kinds, wards, roles, locale) | `/[orgSlug]/portal/dashboard` | `PortalPageHeader`-like header from `Card`/`Button`, `InjectionSpot 'vereino:club:header'` | loading skeleton, error (retry), unauthenticated → redirect | REQ-F13 |
| `TodayTiles` | role-aware tiles; a tile renders only when its module is enabled and the viewer's scope kinds include the tile's kind; `InjectionSpot 'vereino:club:tiles'` for modules | tile data from each module's endpoint | same | `Card`, `StatusBadge`, `Button` | loading per tile, empty ("No classes today"), error per tile (the shell survives) | REQ-F13 |
| `RoleContextSwitcher` | visible only with ≥ 2 scope kinds; changes a view filter stored in `sessionStorage`; never sent as `acting_role` (DD-F08) | none | `ProfileDropdown` pattern | `Dialog`/dropdown primitive, `Button` | keyboard (arrow, Enter, Escape), `aria-expanded` | REQ-F13 |
| `WardSelector` | "All wards" or one ward; persists in `sessionStorage` | `GET /api/people/me` | same | dropdown primitive | empty (no wards → hidden) | REQ-F13 |
| `ConsentToggle` | switch with the grant date or "not granted"; withdrawal asks for confirmation | `PUT /api/people/me` (`shareContactWithCoaches`, …) | `/backend/profile` | switch primitive, `useConfirmDialog` | saving, error (value preserved), conflict 409 → reload prompt | REQ-F05 |
| `TokenPageShell` | frame for `/club/d/[token]`, `/club/o/[token]`, `/p/[clubSlug]/requests/verify/[token]`: resolves the token first, then renders the child | `GET …/{token}` of the owning module | `/quote/[token]` | `Card`, `Button` | loading, expired (410, "ask for a new link"), used, not found (same copy as expired), success | REQ-F14 |
| `PublicPageShell` | frame for `/p/*` with named block slots filled by `PublicBlocks` | public endpoints of `club_core` | `/[orgSlug]/portal` | `Card`, section headers | loading, 404, "club does not publish a page", a failed block renders nothing | REQ-F14 |
| `ImportWizard` | upload → mapping → preview (`DataTable`, classification column with `StatusBadge`) → review queue → commit with progress | the owning module's import routes | `wms/components/backend/ImportInventoryDialog.tsx` (installed, not enabled) | `Dialog`, `DataTable`, `FormField`, progress from `ProgressService` | upload error (422 mapping), empty file, conflict 409 committed, progress, summary | REQ-F14 |
| `DeclarationControls` | `absence_only` → "Report absence"; `confirm` → "Attending / Not attending"; status announced via `aria-live` | `POST /api/activities/attendance/declare` | club spec *Today* mock-up | `Button`, `StatusBadge` | saving, error, 409 (deadline passed) | REQ-F14 |

```text
/club — Today (MemberPage + TodayTiles)
┌──────────────────────────────────────────────┐
│ Hello, Kasia            [Jaś ▾] [as: guardian ▾] │   ← WardSelector, RoleContextSwitcher (≥ 2 roles)
├──────────────────────────────────────────────┤
│ ┌ Calendar ──────────┐ ┌ Messages ──────────┐ │   ← tiles injected by modules; a failing tile
│ │ Tue 17:00 Jaś      │ │ 2 new              │ │     renders its own error, the shell survives
│ │ [Report absence]   │ └────────────────────┘ │
│ └────────────────────┘                         │
└──────────────────────────────────────────────┘
```

- **Localization:** namespaces `foundation.member.*`, `foundation.import.*`, `foundation.token.*` in `src/modules/foundation/i18n/{en,pl}.json`; dates with `Intl` in the club time zone.
- **Design-system and theming:** semantic tokens only; `StatusBadge` for classification and declaration status; light and dark verified; no hard-coded colours.

## Data Models

### `ScopedEntityBase` (mixin, `@vereino/db`)

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK, `gen_random_uuid()` | — |
| `tenant_id`, `organization_id` | uuid, required | only from trusted context; composite index with the entity's most frequent filter (the entity adds it) |
| `created_at`, `updated_at` | timestamptz | `updated_at` is the optimistic-lock token (DD-F04), returned as `updatedAt` |
| `deleted_at` | timestamptz? | soft delete; `deleteOrmEntity({ soft: true })` |

`ValidityColumns` adds `valid_from` date, `valid_to` date?; `ConsentColumns('<name>')` adds `<name>_at` timestamptz? (the club spec's consent columns; withdrawal = null, history in `audit_logs`); `TokenLinkColumns` adds `token_hash` text (unique, indexed), `expires_at` timestamptz, `used_at` timestamptz?, `purpose` text; `ImportBatchMixin` / `ImportRowMixin` add the columns named in *Domain Vocabulary*. Mixins are MikroORM base classes applied with `@Entity` in the owning module; they create no table of their own. The foundation owns no table in phases A–B (DD-F06, DD-F07); the social sign-in spec adds `vereino_identity_links` to the module later.

## API, Command, and Error Contracts

The foundation exposes TypeScript APIs and DI tokens, not HTTP routes, in phases A–B; the routes it serves are the consumers' own.

| ID | Export (home) | Signature (abridged) | Behaviour and errors |
|---|---|---|---|
| P-02 | `defineScopedCommand(spec)` (`foundation`) | `spec: { id: '<module>.<entity>.<action>', input: ZodType, resourceKind, resolveTarget(input, ctx) → { id, tenantId, organizationId, section_id?, … }, requiredKinds: ScopeKind[], lock?: 'updated_at' \| 'none', idempotencyKey?(input) → string, execute(parsed, scope, ctx) → result, undo?(…) \| notUndoable: { reason } }` → `CommandHandler` registered with `registerCommand` | `prepare`: `parseWithCustomFields`, `ensureScope(ctx)` (tenant + `selectedOrganizationId ?? auth.orgId`), `scopeContract.resolve`, target in scope else 403 `scope_denied`, `assertOptimisticLock` (409 `optimistic_lock_conflict`), `acting_role` set on `ctx`; `execute`: `runCrudCommandWrite` phases, idempotency by unique constraint (repeat returns the original result), side effects after commit. **Undo:** when `undo` is given, the wrapper registers `isUndoable: true`, reads the payload with `extractUndoPayload`, re-runs `ensureScope` and the scope check against the *current* scope of the undoing user, asserts the lock on the current record, runs the inverse inside `runCrudCommandWrite` and emits `emitCrudUndoSideEffects`; when `undo` is omitted the spec must carry `notUndoable: { reason }` (recorded in the command log) — a missing reason is a type error |
| P-03 | `ScopeKind`, `Scope`, `emptyScope()`, `unionScopes(a, b)`, `isInScope(scope, target)`, `allowingKind(scope, target)` (`@vereino/core`); `scopeContract.resolve(ctx) → Scope` and token `vereino.scopeProvider` (`foundation`) | `Scope = { clubWide: 'all' \| { modules: string[] } \| null; sectionIds; coachedGroupIds; substituteOccurrenceIds; placeIds; maintenancePlaceIds; wardPersonIds; selfPersonId; }` | no provider or no linked person → `emptyScope()`; `allowingKind` returns the first kind in the fixed order of the vocabulary table that contains the target |
| P-04 | `roleCatalogue` (`@vereino/core` data), `seedRoles(container, scope)` and `rolesForAssignments(assignments, now)` (`foundation`) | `roleCatalogue: Record<VereinoRole, { authRole: 'vereino_…', features: string[], implies?: VereinoRole[], requiresScope?: 'section' \| 'place' \| null }>` | `seedRoles` is idempotent (`defaultRoleFeatures` + `seedDefaults`); `rolesForAssignments` returns the sorted, de-duplicated `auth` role names for the active assignments (`Validity`) |
| P-05 | `syncAuthRoles(userId, desiredRoles, ctx)` (`foundation`) | executes `auth.users.update` with `{ id, roles }` only when the set differs | idempotent; unknown role name → the platform's 400 is rethrown as an uncoded 500 with `reportError` fingerprint `foundation.roles.catalogue_mismatch` (a seeding bug, never a user error); a failed `auth.users.update` propagates: the persistent subscriber is retried by the queue, the job records it in its failed count and retries on the next run |
| P-06 | `Validity.parse`, `isActiveAt(v, now)`, `endsBefore(v, now)` (`@vereino/core`) | pure | 422 `validity_inverted` from the Zod refine |
| P-07 | `createAccount({ birthDate, email, roles, locale }, ctx) → { userId, warning? }` (`foundation`) | reads `own_account_min_age` (P-14); calls `auth.users.create` with `sendInviteEmail: true`, `organizationId`, `roles`; returns `userId` — the `people.persons.create_account` command writes `people_persons.user_id` itself (S4.3, DD-F03) | 422 `account_age_below_threshold`; 409 `account_exists`; platform duplicate e-mail → 409 `email_taken`; `warning: 'invite_email_failed'` passed through; event `people.person.account_created` emitted by the caller |
| P-08 | `ConsentState`, `grantConsent(now)`, `withdrawConsent(now)` (`@vereino/core`) | pure transitions on `{ grantedAt }` | withdrawal when not granted → unchanged |
| P-09 | `encryptedField({ entityId, field, hash: true \| false, searchable: false })` (`foundation`) → `{ mapEntry, lookup(value) → string[], searchPolicy }` | builds the `defaultEncryptionMaps` entry with `hashField`, the `lookupHashCandidates` wrapper and the `fieldPolicy.excluded` entry | a field declared `searchable: true` with `hash` is a type error |
| P-10 | `createTokenLinkService(entity, { purpose, ttl })` (`foundation`) → `{ issue(subject, scope, ctx) → rawToken, consume(rawToken) → { row, tenantId, organizationId } \| null, markUsed(row) }` | `issue` stores `hashAuthToken(raw)`; `consume` is the single DD-35 lookup, constant-time compare, refuses expired/used | 410 `token_link_expired`, 410 `token_link_used`; `consume` of an unknown token returns null (route answers 404 with the expired copy) |
| P-11 | `createImportPipeline({ batchEntity, rowEntity, classify(raw, ctx) → { classification, matchedId?, errorCode?, errorColumn? }, commitRow(row, ctx) })` (`foundation`) → `{ create, suggestMapping, preview, decideRow, commit, purge }` | `commit` runs in a `ProgressService` job with checkpoints; `purge` deletes rows older than 30 days after commit | 422 `import_mapping_invalid`, 409 `import_already_committed`, 409 `import_in_progress` |
| P-12 | `defineScheduledJob({ id: '<module>:<name>', schedule, run(ctx) → { processed, failed } })` (`foundation`) | registers the scheduler target in `seedDefaults` (`schedulerService.register`, stable uuid) and the worker (`metadata` + `handle`) | scope from the registration only; logs start/finish with counts (S15.1) |
| P-13 | `definePersistentSubscriber({ event, id, key(payload) → string, handle })` (`foundation`) | wraps `metadata { persistent: true }`; de-duplication relies on the consumer's own unique constraint (Q12); the wrapper only enforces that `key` exists and passes it to `handle` | a handler that throws is retried by the queue; the wrapper never swallows |
| P-14 | `defineClubSettings(module, { key: { schema: ZodType, default } })` (`foundation`) → `{ read(ctx) → values, write(ctx, patch) }` and token `vereino.clubSettings` | stored on `club_core_club_settings` (DD-37) through the `club_core` service; `read` validates and falls back to the default | change event `club_core.settings.updated` (owner `club_core`) |
| P-15 | `registerPublicBlock(container, { id: '<module>.<name>', slot, render(ctx) })` and `resolvePublicBlocks(container, slot, publication)` (`foundation`) | Awilix registrations by prefix; disabled module → not registered → skipped | a block that throws is logged with fingerprint `foundation.public_block.failed` and skipped |
| P-16 | `renderLocalized(locale, (t) => …)` and `localeForPerson(person, clubSettings)` (`foundation`) | `resolveSupportedLocale` → `loadDictionary` → `createFallbackTranslator` | unknown locale → club default → `en` |
| P-17 | `defineErrorCodes([{ code, status, messageKey }])` (`@vereino/core` type) and `errors(table)` → `{ throw(code, details?) }` (`foundation`) | throws `CrudHttpError(status, { error, code })`; the table is what `contracts:check` reads | duplicate code across modules → `contracts:check` fails |

Error codes of the module (`lib/error-codes.ts`): `scope_denied` (403), `optimistic_lock_conflict` (409, platform code re-exported), `validity_inverted` (422), `account_exists` (409), `email_taken` (409), `token_link_expired` (410), `token_link_used` (410), `import_mapping_invalid` (422), `import_already_committed` (409), `import_in_progress` (409); `account_age_below_threshold` (422) is owned and declared by `people`. Uncoded 500s carry no detail (S6.7); they are reported with `<module>.<reason>` fingerprints. Lists use `createPagedListResponseSchema`; amounts and dates follow S6.3–S6.6.

## Events, Jobs, Notifications, and Cross-Module Flows

| Event / job | Producer | Consumer | Effect | Idempotency |
|---|---|---|---|---|
| `people.role_assignment.created` / `updated` / `deleted` (the club spec's ids; "ended" is an `updated` with `valid_to`) | `people` | `foundation` helper called from the `people` persistent subscriber (`people:sync-auth-roles`) | `syncAuthRoles` through `auth.users.update` (DD-F05; the club spec's events row corrected in the same PR) | set comparison; queue retry on failure |
| scheduler `people:sync-role-expiry` (daily 02:00) | `people` via P-12 | `people` | `syncAuthRoles` for assignments past `valid_to` | set comparison |
| `club_core.settings.updated` | `club_core` via P-14 | modules caching settings | cache invalidation | version |

The foundation emits no event and no notification type of its own in phases A–B.

## Security, Privacy, and Compliance

- **Authorization and scope:** every primitive narrows, none widens; the union combinator cannot add a kind the provider did not return; an absent provider or an unlinked user yields the empty scope; `acting_role` is server-derived (DD-F08). The lint rule `vereino/no-local-scope-check` fails a hand-written `em.find*` / `findWithDecryption` / `nativeUpdate` call in a route handler or command outside `foundation` that is not inside a `defineScopedCommand` or a `makeCrudRoute` option; an explicit `// vereino-scope: <reason>` escape requires a review comment.
- **Tenant isolation:** mixins require both scope columns; the only system-scope reads are the DD-35 list (`TokenLinkService.consume` implements it); each narrows immediately to the found tenant and organization.
- **Tokens:** raw tokens are never stored or logged; hashes use the platform's `hashAuthToken` (HMAC-keyed); constant-time comparison; one token = one subject, one purpose, one scope.
- **Sensitive data:** import `raw` rows and every field declared with P-09 are encrypted by the owning module's map; events carry ids only (S4.6).
- **Abuse:** `metadata.rateLimit` on every sessionless token route (V-10; `RATE_LIMIT_TRUST_PROXY_DEPTH` set in deployment) and `checkAuthRateLimit` on every token-link request route; uniform 202 for link requests.
- **Failure modes (S3.6):** `auth.users.update` failing in `syncAuthRoles` → the subscriber throws and the queue retries, the job counts the failure and retries next run; a failed invitation e-mail → `invite_email_failed` surfaced with resend (P-07); `ProgressService` unavailable during an import commit → the batch stays `previewed`, no `import_in_progress` is left behind, the operator retries; a public block that throws → skipped with `foundation.public_block.failed`; an invalid stored setting → the default with `foundation.settings.invalid`.
- **Compliance:** the age threshold stays a club setting (D-022); consents follow the club spec's columns; nothing here changes the data-protection notice.

## Integration Coverage

Tests are self-contained (own tenant and organization, cleanup in `finally`) and live in `packages/app/.ai/qa/tests/foundation/`.

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-F01 | integration | a `people` command built with P-02; two organizations | create and update across organizations; update with a stale `updated_at`; two writers in the same millisecond; undo | 403 `scope_denied` across scope; 409 `optimistic_lock_conflict`; `acting_role` recorded; undo restores and re-checks scope | REQ-F01, REQ-F12 |
| TEST-F02 | security | user without a linked person; user with coordinator scope of section A | read section A and B lists and details | unlinked → empty lists and 403 on details; coordinator → A only, B 403; list and detail agree | REQ-F02 |
| TEST-F03 | integration | fresh tenant | `seedRoles` twice; assignment coordinator A then coach; `valid_to` yesterday; run `people:sync-role-expiry` twice; `auth.users.update` failing once | no duplicate roles; `auth` roles granted then revoked; the second run changes nothing; the failed update is retried (TEST-005 of the club spec passes through this path) | REQ-F03, REQ-F10 |
| TEST-F04 | integration | person 15, person 40, person with an account | `createAccount` ×3; invite e-mail transport failing | 422 threshold; 201 with invite; 409 `account_exists`; `invite_email_failed` surfaced and resend works; `people_persons.user_id` written by the `people` command, not by the foundation | REQ-F04 |
| TEST-F05 | unit + integration | person with consents | grant, withdraw, grant again; validity inverted | `<name>_at` set, null, set; the row kept; the audit entries carry the dates; 422 `validity_inverted` | REQ-F05 |
| TEST-F06 | integration | person with PESEL | duplicate PESEL; search by surname; read without `people.pesel.view`; raw DB read | 409; search hits through `search_tokens`; PESEL hidden; ciphertext in the database | REQ-F06 |
| TEST-F07 | integration + security | declaration token for guardian G | consume twice; after expiry; from a tenant B route; request a link for an unknown e-mail | second → 410 used; expired → 410; tenant B → 404; unknown e-mail → 202 same timing class | REQ-F07 |
| TEST-F08 | integration | CSV with new, matched, review and error rows | create, map, preview, decide, commit, commit again, purge after 30 days (clock injected); commit with `ProgressService` stopped | classifications; progress job completes; 409 on second commit; rows purged; errors carry no cell value; the stopped-service commit leaves the batch `previewed` | REQ-F08 |
| TEST-F09 | unit + integration | club settings with and without stored values | read, write invalid value, read | defaults; validation error; invalid stored value → default + report fingerprint | REQ-F09 |
| TEST-F10 | integration | e-mail rendering for `pl` and `en` persons, unknown locale | render | correct dictionary; fallback to club default then `en` | REQ-F11 |
| TEST-F11 | UI | member with two roles and two wards; one role; no wards | `/club`, switch role and ward, keyboard, 375 px, dark | switcher visibility rules; tiles filtered; `aria-live`; axe clean | REQ-F13 |
| TEST-F14 | unit | a module file with a hand-written `em.find` in a route handler; the same inside `defineScopedCommand`; a `makeCrudRoute` list filter | run the lint rule | the first reported; the other two not; the foundation's own files exempt | REQ-F16 |

TEST-F12, TEST-F13 and TEST-F15 moved to the social sign-in spec (TEST-S01…S04); the ids are not reused.

## Implementation Phases

Validation for every phase: `yarn verify` (the single gate; `typecheck:packages`, strict i18n, `contracts:check`, `build`), `yarn test:integration:vereino --filter TEST-F…`, SQL review from `yarn db:generate` (no `yarn db:migrate` without approval). Each new package export and the module `foundation` are covered at 100 % line, branch and function by unit tests (S13.6). `foundation` is added to `packages/app/vereino-modules.json` in phase A step 1.

### Phase A — Kernel, with #38 as the consumer

- **Depends on:** this spec `Ready for implementation`; the club spec phase 1 (ready); the `AGENTS.md` amendment (REQ-F16) in the same PR as step 1; **approval to enable the `scheduler` module** (P-12; the club spec's phase 1 step 1 asks for it) and **the `progress` module** (P-11, `ProgressService`; neither is in `src/modules.ts` today) — both Ask First.
- **Outcome:** #38, E02-S02 and E02-S03 can be implemented on the primitives; a coordinator gets an account, scoped roles and a member shell (J-F01).
- **Why this order / value delivered:** every later story needs scope, commands, roles and accounts; building them once with the first consumer removes the duplicated implementations the review flagged.
- **Deliverables:** `packages/core/src/{scope,validity,consent,roles,error-codes,account-policy}.ts` + `index.ts`; `packages/db/src/{scoped-entity,validity-columns,consent-columns,migrations}.ts` + `index.ts`; `src/modules/foundation/{index.ts,setup.ts,di.ts,lib/*,lib/error-codes.ts,api/errors.ts,commands/define-scoped-command.ts,scope/*,roles/*,accounts/*,encryption/*,settings/*,localized/*,jobs/*,subscribers/*,i18n/{en,pl}.json,README.md}`; `packages/ui/src/member/{MemberPage,TodayTiles,RoleContextSwitcher,WardSelector,ConsentToggle}.tsx` + `index.ts`; the lint rule in `eslint.vereino.mjs`; `AGENTS.md` extraction-rule amendment; `BACKWARD_COMPATIBILITY.md` §1 row for `foundation`.
- **Steps:**
  1. Repository wiring: `foundation` in `vereino-modules.json`, package `index.ts` exports, `AGENTS.md` amendment, `BACKWARD_COMPATIBILITY.md` row, README of the module (what is a primitive, how to add one — the inventory rule of REQ-F16); enabling `scheduler` and `progress` in `src/modules.ts` after approval.
  2. P-06 `Validity`, P-08 `ConsentRecord`, P-17 `defineErrorCodes` (core) with unit tests; P-01 mixins and migration helpers (db) with a probe entity test; P-09 `encryptedField` in full (map entry, hash lookup, search policy — first consumer: the PESEL of E02-S02, TEST-F06).
  3. P-03 scope contract (core predicates + `foundation` resolver, DI token, empty-scope default); P-02 `defineScopedCommand` with `acting_role` and undo (TEST-F01, TEST-F02 against a probe command in `foundation/__tests__`, re-run on the first `people` command).
  4. P-04 role catalogue and `seedRoles`; P-05 `syncAuthRoles`; P-12 job wrapper; P-13 subscriber wrapper (TEST-F03 through the `people` assignment commands of #38).
  5. P-14 club settings registry (`own_account_min_age` first, with the DD-37 defaults the `club_core` module declares); P-16 `renderLocalized`; P-07 `createAccount` (TEST-F04, TEST-F09, TEST-F10).
  6. P-18 member shell (TEST-F11) and the `/club` page of E02-S03 using it.
  7. Lint rule `vereino/no-local-scope-check` (TEST-F14).
- **Independent slices / estimated commits:** (a) core + db 2 commits; (b) scope + command 2 commits; (c) roles + accounts 2 commits; (d) settings + localized 1 commit; (e) member shell 2 commits; (f) lint 1 commit. (b) after (a); (c)–(e) after (b); (f) any time. Slices (a)–(d) are the backend kernel, (e) the member layer, (f) the guard — one owner per slice.
- **Requirements closed:** REQ-F01, REQ-F02, REQ-F03, REQ-F04, REQ-F05, REQ-F06, REQ-F09, REQ-F10, REQ-F11, REQ-F12, REQ-F13, REQ-F16
- **Tests:** TEST-F01 … TEST-F06, TEST-F09, TEST-F10, TEST-F11, TEST-F14
- **Validation:** as above; `yarn test:scripts` for the lint rule
- **Exit gate:** #38's acceptance criteria pass using only P-ids (its PR lists them); `yarn verify` green; `/club` checked in light and dark at 375 px; the lint rule reports zero violations in `people` and `club_core`.

### Phase B — Links, imports and public blocks, with E02-S04, E02-S05 and E03-S03 as consumers

- **Depends on:** Phase A exit gate; E02-S01 (`club_core` settings storage) merged.
- **Outcome:** the bulk import (J-F02), the public club page blocks and the declaration link (J-F03) run on shared primitives.
- **Why this order / value delivered:** three consumers of the import pipeline and four of the token service are in phases 1–5; the first of each arrives here.
- **Deliverables:** P-10 `TokenLinkService` + `TokenLinkColumns`, P-11 `ImportPipeline` + mixins, P-15 `PublicBlocks`, P-19 `TokenPageShell`, `PublicPageShell`, `ImportWizard`, `DeclarationControls`; `foundation/i18n` keys.
- **Steps:** 1. P-11 with `people` imports (TEST-F08). 2. P-15 and `PublicPageShell` with `/p/[clubSlug]` (E02-S05). 3. P-10, `TokenPageShell` and `DeclarationControls` with `/club/d/[token]` (E03-S03; TEST-F07). 4. `ImportWizard` on `/backend/people/imports`.
- **Independent slices / estimated commits:** (a) import 3 commits; (b) public blocks 2 commits; (c) token links 2 commits; (d) wizard 1 commit. (d) after (a).
- **Requirements closed:** REQ-F07, REQ-F08, REQ-F14
- **Tests:** TEST-F07, TEST-F08; the consumers' TEST-037, TEST-051 and the phase 2 declaration tests of the club spec
- **Validation:** as above
- **Exit gate:** E02-S04 and E02-S05 acceptance criteria pass; the declaration link flow passes on a fresh tenant; token pages checked in light and dark at 375 px.

Primitives for later phases (P-21 `Money`, P-22 `CsvExport`, P-23 `CalendarList`, P-24 recurrence helpers) are intentionally not phased here: they are built with phases 2 and 4 of the club spec and enter this inventory through a Changelog row when their first consumer is planned. The social sign-in (`2026-10-27-vereino-social-sign-in.md`) follows phase A as its own phases 1–2.

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-F01 | J-F01, every module command | P-01, P-02, `scope_denied`, `optimistic_lock_conflict` | A | TEST-F01 | AC-F01 |
| REQ-F02 | J-F01, every list and detail route | P-03, token `vereino.scopeProvider` | A | TEST-F02 | AC-F02 |
| REQ-F03 | J-F01 | P-04, P-05, `auth.users.update`, `people:sync-role-expiry` | A | TEST-F03 | AC-F03 |
| REQ-F04 | J-F01 | P-07, `auth.users.create`, `account_age_below_threshold`, `account_exists`, `email_taken` | A | TEST-F04 | AC-F04 |
| REQ-F05 | `/club/profile` consents, role assignments | P-06, P-08, `ValidityColumns`, `ConsentColumns`, `validity_inverted` | A | TEST-F05 | AC-F05 |
| REQ-F06 | E02-S02 PESEL, E02-S04 import | P-09 | A | TEST-F06 | AC-F06 |
| REQ-F07 | J-F03, `/club/d/[token]` | P-10, `TokenLinkColumns`, `token_link_expired`, `token_link_used` | B | TEST-F07 | AC-F07 |
| REQ-F08 | J-F02, `/backend/people/imports` | P-11, mixins, `import_*` codes | B | TEST-F08 | AC-F08 |
| REQ-F09 | `/backend/club/settings` | P-14, `club_core.settings.updated` | A | TEST-F09 | AC-F09 |
| REQ-F10 | jobs and subscribers of every module | P-12, P-13 | A | TEST-F03 | AC-F10 |
| REQ-F11 | invitation and reminder e-mails | P-16 | A | TEST-F10 | AC-F11 |
| REQ-F12 | every module | P-17, `contracts:check` | A | TEST-F01 (codes asserted), `yarn contracts:check` | AC-F12 |
| REQ-F13 | `/club` | P-18 | A | TEST-F11 | AC-F13 |
| REQ-F14 | token, public and import pages | P-19 | B | TEST-F07, TEST-F08, club spec TEST-037 | AC-F14 |
| REQ-F16 | `AGENTS.md`, `eslint.vereino.mjs` | lint rule `vereino/no-local-scope-check` | A | TEST-F14 | AC-F16 |

## Rollout, Migration, and Rollback

- **Migrations:** none in phases A–B (mixins only); migrations are generated by `yarn db:generate` per consumer, SQL pasted in the PR, applied only with approval; rollback never runs `down()` in production (S14.6).
- **Modules to enable (Ask First, phase A step 1):** `scheduler` (`@open-mercato/scheduler`) for P-12 and `progress` (`@open-mercato/core`) for P-11; both are approvals in `src/modules.ts`, recorded in the run log.
- **Club spec amendments (landed with this spec's PR):** the events row `people.role_assignment.*` ("via `rbacService`" → "via `auth.users.update`", DD-F05); nothing else in the club spec changes for the foundation.
- **Seeds:** `seedRoles` runs in `foundation.setup.ts` `seedDefaults` after the `people` module registers its assignments; existing tenants run `yarn mercato auth sync-role-acls` after a feature change.
- **Configuration:** `RATE_LIMIT_TRUST_PROXY_DEPTH` set in Railway for the token routes.
- **Observability:** report fingerprints `foundation.scope.empty_for_linked_user`, `foundation.roles.catalogue_mismatch`, `foundation.settings.invalid`, `foundation.public_block.failed`; counts logged by every job (S15.1).
- **Rollback:** a primitive is rolled back by reverting its PR — consumers compile against the previous API because every change to a primitive's public API is additive within 1.0 (`BACKWARD_COMPATIBILITY.md` default path).

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| Over-abstraction before the second consumer (Q2) | primitives shaped for #38 only; churn in phase 2 | the inventory rule (≥ 2 stories), additive-only API changes, the leading indicator "second consumer adds no API change" | some signatures will still change; accepted within 1.0 |
| `updated_at` lock collisions under concurrent saves within the same millisecond (DD-F04) | a lost update goes unnoticed | TEST-F01 two-writer case; timestamps with microsecond precision in PostgreSQL | negligible for a club-sized load |
| The scope provider in `people` returns too much (the review's fail-open treasurer case) | data leak across sections | the contract's fixed kinds and the fail-closed union; TEST-F02 for every kind; the lint rule | provider bugs remain the `people` module's tests to catch |
| `auth.users.update` as the role-sync seam (DD-F05) changes in a platform upgrade | role sync breaks silently | TEST-F03 runs at every upgrade run; the command id and `roles` input are a documented platform contract | an upgrade run revisits P-05 |
| A failed public block breaks the public page | club page down | blocks are isolated and skipped on error with a fingerprint | a missing block is visible only in logs |
| The lint rule produces false positives | friction for module authors | rule scoped to hand-written reads outside `defineScopedCommand` / `makeCrudRoute`; an explicit `// vereino-scope: <reason>` escape requires a review comment | accepted |
| `scheduler` or `progress` approval delayed | P-11/P-12 blocked | both are the platform's own modules, already installed; the approval is a `src/modules.ts` change | none once approved |

## Acceptance Criteria

- [ ] **AC-F01** — Every `people` and `club_core` command in #38, E02-S01 and E02-S02 is declared with `defineScopedCommand`; a cross-organization update returns 403 `scope_denied`, a stale save returns 409 `optimistic_lock_conflict`, the audit entry carries the server-derived `acting_role`, and an undo re-checks the current scope.
- [ ] **AC-F02** — A user without a linked person sees empty lists and 403 on details in every module; a coordinator of section A sees A only, in lists and details alike.
- [ ] **AC-F03** — On a fresh tenant the four phase 1 roles exist after one `seedRoles` and are unchanged after a second; TEST-005 of the club spec passes through `syncAuthRoles` and `people:sync-role-expiry`.
- [ ] **AC-F04** — `createAccount` refuses a person below the club threshold with 422, refuses a second account with 409, sends the invitation in the person's locale, surfaces a failed invitation e-mail with a working resend, and never writes a `people` table itself.
- [ ] **AC-F05** — Validity and consents behave as the vocabulary states; a withdrawn consent keeps its row, and the grant and withdrawal dates are in the audit log.
- [ ] **AC-F06** — A field declared with `encryptedField` is ciphertext in the database, searchable through `search_tokens`, deduplicated by its hash sibling, and hidden without the feature.
- [ ] **AC-F07** — A token link is usable exactly once, refused after expiry, invisible from another tenant, and every link request returns 202 whether or not the e-mail exists.
- [ ] **AC-F08** — The people import classifies, reviews and commits rows through the pipeline with progress, refuses a second commit, purges rows after 30 days and never exposes a cell value in an error.
- [ ] **AC-F09** — A club setting reads its default when unset and its default plus a report fingerprint when the stored value is invalid.
- [ ] **AC-F10** — Every job and persistent subscriber of phase 1 is declared through P-12/P-13; running any of them twice changes nothing; a failed `auth.users.update` is retried.
- [ ] **AC-F11** — Invitation and reminder e-mails render in the person's preferred locale, with the club default and then `en` as fallbacks.
- [ ] **AC-F12** — Every module's error codes come from one table that `contracts:check` validates; a duplicate code fails the gate.
- [ ] **AC-F13** — `/club` renders the shell with role-aware tiles, the switcher only for ≥ 2 roles, the ward selector only with wards, keyboard-operable, `aria-live` for declaration status, in light and dark at 375 px.
- [ ] **AC-F14** — Token pages, the public page shell, the import wizard and the declaration controls are shared components with the states listed in *UI and Interaction Contracts*.
- [ ] **AC-F16** — `AGENTS.md` carries the amended extraction rule; `yarn verify` fails on a module that re-implements a listed mechanic.
- [ ] Every listed backend surface matches its recorded Open Mercato reference and uses the canonical shell/components, shared API helpers, semantic tokens, and complete loading, empty, error, conflict, keyboard, accessibility, responsive, light-mode, and dark-mode states.
- [ ] Every affected API and UI path has self-contained integration coverage and the configured validation gate passes.

AC-F15 moved to the social sign-in spec (AC-S01…S04); the id is not reused.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | `AGENTS.md`, `.ai/guides/spec-delivery.md`, `backend-ui.md`, `framework-contracts.md`, `contracts.md`, `extensions.md`, the engineering standards (S3, S4, S6, S13, S16), `.ai/review-checklist.md`, skill `om-spec-writing` |
| Data models, APIs, events, UI, and tests are internally consistent | pass | *Requirement Traceability*: REQ-F01…F14 and F16 each with a phase, a test and an AC; ids P-01…P-19, DD-F01…F08 and F12, J-F01…F03, TEST-F01…F11 and F14, AC-F01…F14 and F16 defined once; the moved ids (REQ-F15, P-20, DD-F09…F11, F13, TEST-F12/F13/F15, AC-F15) are listed as moved, never reused |
| Every workflow completes end to end without a catch-all integration phase | pass | J-F01…J-F03 complete within phases A–B; no "polish" phase |
| Platform-native reuse and extension points were chosen before custom code | pass | *Reuse and Ownership Map*: 16 of 19 primitives extend an installed seam located by the API digest; the three app-owned ones (mixins, scope contract types, validity/consent types) have no installed counterpart |
| UI contracts identify references, canonical components, and theme/state coverage | pass | every surface in *UI and Interaction Contracts* names a reference, components and states; one text mock-up |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | phases A–B |
| Contracts of installed modules confirmed at the field and behavior level | pass | the API digest of 2026-10-27 (commands, DI, events, setup, scheduler, routes, UI) and V-F02 (`auth.users.update` `roles`; `rbacService` has no grant API) |
| Architectural review applied | pass | scope-cohesion review (fresh context) and architectural review of 2026-10-27 (`.ai/runs/2026-10-27-foundation-spec.md`): every Critical and High finding applied; the split (Q14) and the DD-35 extension (Q13) decided by the owner the same day |
| User approval for implementation | fail | pending: the product owner's approval on the PR; approval to enable `scheduler` and `progress` |

Verdict: `Blocked — the product owner's approval of the design on the PR, and approval to enable the scheduler and progress modules`

## Open Questions

`om-spec-writing` gate — round 1 (Q1–Q7) and the review questions (Q12–Q14) answered on 2026-10-27 by Władek Kuć; round 2 (Q8–Q11, Q13) now lives in the social sign-in spec as Q-S01…S05:

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q1 | Split: foundation spec vs bundled vs club-spec amendment | Władek Kuć | yes | **A — a separate foundation spec; the club spec stays the feature authority; #38 is the first consumer** — 2026-10-27 |
| Q2 | Extraction rule vs primitives ahead of the second consumer | Władek Kuć | yes | **A — one-time amendment: inventory with ≥ 2 stories and a test** (REQ-F16, DD-F02) — 2026-10-27 |
| Q3 | Home for framework-bound primitives | Władek Kuć | yes | **A — module `foundation` in `packages/app/src/modules/`** (DD-F01) — 2026-10-27 |
| Q4 | Cut for 1.0 | Władek Kuć | yes | **As recommended — phases A–B here; money, CSV, calendar, recurrence deferred; social sign-in in its own spec** — 2026-10-27 |
| Q5 | Member UI layer | Władek Kuć | yes | **A — thin member layer in `@vereino/ui`** (DD-F12) — 2026-10-27 |
| Q6 | Scope data stays in `people` | Władek Kuć | no | **yes, by default** (DD-F03) — 2026-10-27 |
| Q7 | Primitives carry their own tests and 100 % coverage | Władek Kuć | no | **yes, by default** — 2026-10-27 |
| Q8–Q11 | Social sign-in: scope, mechanism, providers, linking rule | Władek Kuć | yes | **answered 2026-10-27; moved to the social sign-in spec (Q-S01…S04)** |
| Q12 | Does `defineScopedCommand` need a `foundation` receipts table for subscriber idempotency, or is the consumer's unique constraint enough? | Władek Kuć | no | **consumer's unique constraint** (P-13), decided by the author on 2026-10-27; revisit if a consumer has no natural key |
| Q13 | May the identity sign-in lookup join the DD-35 list? | Władek Kuć | yes | **yes — D-027; moved to the social sign-in spec (Q-S05)** — 2026-10-27 |
| Q14 | Should phases C–D (social sign-in) become a separate spec? | Władek Kuć | yes | **yes — split into `2026-10-27-vereino-social-sign-in.md`; this spec keeps phases A–B** — 2026-10-27 |

Contract verifications (performed on 2026-10-27 against the installed 0.9.0 packages; numbered `V-F` so they never collide with the club spec's `V-` series; V-F01, V-F03 and V-F04 moved to the social sign-in spec as V-S01, V-S03, V-S04):

| ID | What to check | Phase | Result |
|---|---|---|---|
| V-F02 | Granting and revoking `auth` roles programmatically | A | **Confirmed with a constraint:** `rbacService` has no grant/revoke; `syncUserRoles` is private; the command `auth.users.update` accepts `roles: string[]` (names resolved per tenant) — DD-F05; the club spec's events row that says "via `rbacService`" is corrected in the same PR |

## Changelog

| Date | Change |
|---|---|
| 2026-10-27 | Skeleton written by `om-spec-writing` (interactive): TLDR, the Open Questions gate (Q1–Q5 blocking, Q6–Q7 non-blocking), the functionality kinds extracted from the backlog (F1–F16) and the candidate primitive inventory (P-01…P-19). Nothing below the gate was designed yet |
| 2026-10-27 | Gate round 1 answered by the product owner (Q1 = A, Q2 = A, Q3 = A, Q4 as recommended, Q5 = A; Q6, Q7 by default). Gate round 2 opened and answered for the owner's new request — sign-in with Google and Facebook — after checking the installed packages (no OAuth in core `auth`; SSO only in the commercial enterprise module): Q8 = A, Q9 = A, Q10 Google first, Q11 verified-e-mail linking without JIT |
| 2026-10-27 | Full design: Overview with the open-source research (MikroORM, CASL, Odoo, Casbin, Auth.js, Django, Baserow, listmonk, shadcn, Medusa v2), REQ-F01…F16, DD-F01…F13, vocabulary, permissions, reuse map against the API digest of the installed packages, architecture and data flow, journeys, UI contracts, data models, TypeScript contracts, error codes, events, security, TEST-F01…F15, phases A–D with steps, traceability, rollout, risks, AC-F01…F16, compliance report |
| 2026-10-27 | Reviews applied (scope cohesion in fresh context, architectural review): event ids aligned with the club spec and its `rbacService` row corrected (DD-F05); consent columns exactly as the club defines them; e-mail matching at sign-in dropped; `scheduler` and `progress` enabling added to phase A's dependencies; P-07 returns `userId` instead of writing `people_persons`; one `ScopeKind → ActingRole` table; undo semantics in P-02 and "not undoable" reasons; failure modes; `role_catalogue_mismatch` replaced by an uncoded 500 with a fingerprint; P-09 built in full in phase A; consumers named for P-08 and P-17; V-15…V-18 renumbered V-F01…V-F04; the lint rule scoped to hand-written reads; package exports classed as internal surfaces (§1) |
| 2026-10-27 | Owner decisions Q13 (yes) and Q14 (yes): the social sign-in — REQ-F15, P-20, DD-F09…F11, DD-F13, J-F02, TEST-F12/F13/F15, AC-F15, Q8–Q11, Q13, V-F01/F03/F04 — moved to `2026-10-27-vereino-social-sign-in.md`; journeys renumbered J-F01…J-F03; this spec keeps phases A–B and 19 primitives; the verdict now blocks only on the owner's approval and the `scheduler`/`progress` approvals |
