# Vereino foundation — reusable backend and frontend primitives, with staff accounts and roles (#38) as the first consumer

**Date**: 2026-10-27
**Status**: Draft (design complete, reviewed twice and simplified; waiting for the product owner's approval on the PR and for approval to enable the `scheduler` module)

> Use `om-spec-writing` for every new application, multi-module feature, or other non-trivial business slice. Keep every section below; write `N/A — {reason}` when a section does not apply. Change the status to `Ready for implementation` only after every blocking open question is resolved and the traceability table covers every requirement.

Sources: issue #38 (staff accounts, seeded club roles, `auth` role sync), `.ai/specs/backlog.md` (E02–E05), `.ai/specs/product-brief.md` (Scope, Key flows, Business rules R01–R16, Decisions), `.ai/specs/2026-10-20-vereino-club-management.md` (phase 1 ready since 2026-10-27; *Users, Permissions, and Scope*, *Reuse and Ownership Map*, *Data Models*, DD-02, DD-06, DD-07, DD-33, DD-35, DD-37, DD-38, DD-39; contract verifications V-1, V-2, V-3, V-10, V-11, V-12), `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (S3, S4, S4.9, S4.10, S6.7, S13, S16.1), `AGENTS.md` (workspaces table, extraction rule), `.ai/runs/2026-10-26-spec-architectural-review.md`, the API digest of the installed `@open-mercato/*` 0.9.0 packages (2026-10-27: `shared/lib/commands/*`, `shared/lib/crud/*`, `shared/modules/{events,setup,registry,encryption}.ts`, `core/modules/auth/{commands/users.ts,services/rbacService.ts}`, `core/modules/configs/lib/module-config-service.ts`, `core/modules/wms/data/entities.ts`, `cli/dist/lib/generators/scanner.js` (`widgets/injection`), `scheduler`, `ui/{backend,portal,primitives}`), the open-source research of 2026-10-27 (*Overview*). The social sign-in lives in `2026-10-27-vereino-social-sign-in.md` (split per Q14). Paths `src/...` are relative to `packages/app/`; `@om/*` means `packages/app/node_modules/@open-mercato/*/src`.

## TLDR

Every story in the backlog repeats the same mechanics: a record scoped to a tenant, an organization and a role; a command that parses, checks scope, asserts the lock and records the acting role; a role or consent valid for a period; a link that works without a session; a file imported through a preview and a review queue; a page that shows only what the viewer's roles allow. The club management spec designs each feature but not where these mechanics live, so each of the seven planned modules would re-implement them. This specification designs the **foundation** — and, after two reviews, keeps it deliberately small: only what the installed platform does *not* provide. Framework-free types and policies in `@vereino/core`, an entity base class in `@vereino/db`, a thin member layer in `@vereino/ui`, and one framework-bound Vereino module `foundation` (`src/modules/foundation/`) with a handful of helpers that *compose* the installed command, DI, `auth`, encryption and scheduler contracts instead of wrapping them. Issue #38 is the first consumer and the acceptance oracle. Phase A1 builds the backend kernel with #38 (P-01…P-09), phase A2 the member layer with E02-S03, phase B the token links and the shared shells with their first consumers; the import pipeline and the job wrapper are designed but extracted only when their second consumer arrives.

## Problem Statement

Seven modules (`club_core`, `people`, `groups`, `activities`, `communication`, `payments`, `facilities`) are planned over five phases, implemented by agents one story at a time. The club spec fixes the contracts (routes, events, IDs, tables) but not the implementation mechanics behind them. Without a foundation each story writes its own scope check, lock assertion, acting-role capture and token handling — the architectural review of 2026-10-26 already found undeclared `scopeService` sources and a fail-open treasurer scope, the class of defect a shared, tested primitive prevents. The three workspace packages exist but export nothing (`packages/{core,db,ui}/src/index.ts` are `export {}`). The opposite failure is just as real: a foundation that re-implements the platform's commands, widgets or settings would give modules two ways to do everything; the first draft of this spec did exactly that and the reviews cut it back.

## Overview and Success Measures

- **Primary outcome:** every phase 1 story (#25–#29, #38) ships with exactly one implementation of each mechanic listed in F1–F16; measured at the phase 1 exit gate by the review checklist line of REQ-F16 (no hand-written scope filter outside `prepareScoped`) and by the per-module scope test (TEST-F02 class) passing for `club_core` and `people`.
- **Leading indicators:** #38 implemented with the primitives only (its PR lists which P-ids it used — target: P-01…P-09 and nothing bespoke); the second consumer of each primitive (E02-S02, E02-S03) adds no change to the primitive's public API.
- **Baseline:** 0 shared primitives; 3 empty packages; 4 reference scaffold modules not owned by Vereino.
- **Market / product reference (research 2026-10-27):** *adopted* — MikroORM's optimistic lock shown to the user, never retried server-side; CASL's "same rule set filters lists and guards details" (one scope contract drives both); Odoo's two layers (model ACL default-deny, then record rules) with record scope **default-deny** (Casbin domain tuple shape); Odoo `implied_ids` for role implication (`dependsOn`); Auth.js `VerificationToken` return-and-delete (single use by construction) and Django's uniform "done" response for link requests; Baserow/Odoo import (auto-map by header, preview, test before import, idempotent re-import by external id, async job); listmonk's consent status that never deletes the row on withdrawal; shadcn Sidebar composition for the member shell; Medusa v2 module links (no shared tables, ids only). *Rejected* — django-simple-history per-model history tables (one `acting_role` column suffices); Keycloak composite roles (no validity periods; our sync job owns them); stateless HMAC tokens (a stored single-use row gives the audit trail); Baserow's 5-second undo (explicit review queue instead); shadcn block variants.

## Goals

- **REQ-F01** (Must) — Every Vereino entity carries the standard scope and lifecycle columns through one base class, and every domain mutation is a platform `CommandHandler` whose `prepare` calls one helper that parses, derives scope (from the session, a token or a marker), asserts the lock and records the acting role.
- **REQ-F02** (Must) — One scope contract (`ScopeContract`) resolves a user's record scope for every module as a list of grants, fails closed when no person is linked, and drives both list filters and detail guards.
- **REQ-F03** (Must) — The `vereino_*` roles are declared once as data with their features and implications, seeded idempotently from the `people` module's setup, and kept in sync with business role assignments and their validity periods (#38, TEST-005).
- **REQ-F04** (Must) — Accounts are created only through one helper over `auth.users.create` that sends the invitation and surfaces a failed invitation e-mail; the age-threshold policy is a pure function the `people` command applies before calling it (V-2).
- **REQ-F05** (Must) — Validity periods and consents share one value type and one column pattern; a consent withdrawal keeps the row and its history in the audit log.
- **REQ-F06** (Must) — Encrypted personal fields are declared through one helper that adds the hash sibling, the lookup candidates and the search exclusion (V-3, DD-38).
- **REQ-F07** (Must) — Links that work without a session (declarations, orders, request confirmations, personal link requests) use one token service: hashed, single-use, scoped, expiring, with uniform 202 responses and IP + e-mail rate limits (DD-35, V-10, V-12).
- **REQ-F08** (Should) — Bulk imports share one pipeline shape (upload to the private `attachments` partition, mapping, classification, review queue, commit with progress, purge), built concretely in `people` and extracted when the second importer (fixtures) arrives.
- **REQ-F09** (Must) — Club settings are declared with typed defaults once, on the `club_core` settings entity the club spec already designs (DD-02, DD-37), and read through the `club_core` service — the foundation adds no registry.
- **REQ-F10** (Must) — Scheduled jobs take their scope from the registration, are idempotent and log counts (S4.7); the shared wrapper is extracted at the second job.
- **REQ-F11** (Must) — Server-side text (e-mails, notifications) renders in a person's preferred locale through one helper function (V-11).
- **REQ-F12** (Must) — Every module declares its error codes as one typed table and throws through one shared factory (S6.7, `contracts:check`).
- **REQ-F13** (Must) — Member pages share one shell: role-aware tiles, a role-context switcher that is a view filter only (DD-07), a ward selector, consent toggles and the locale switcher.
- **REQ-F14** (Should) — Token pages, public pages with named slots, the import wizard and declaration controls are shared components built with their first consumer.
- REQ-F15 (social sign-in) moved on 2026-10-27 to `2026-10-27-vereino-social-sign-in.md` (REQ-S01…S04); the id is not reused.
- **REQ-F16** (Must) — The extraction rule in `AGENTS.md` is amended once so that a primitive may be built ahead of its second consumer only when it is in this inventory with at least two backlog stories and a self-contained test; the review checklist gains one line ("no hand-written scope filter outside `prepareScoped`"), and the existing boundaries lint confines `@mikro-orm/*` imports to `data/**`, `commands/**`, `di.ts` and migrations.

## Non-goals

- Re-documenting or wrapping what the platform already provides: `CommandHandler`, `makeCrudRoute`, `runCrudCommandWrite`, `DataTable`, `CrudForm`, `withAtomicFlush`, `createModuleEvents`, subscriber `metadata`, injection widgets, `ModuleConfigService`, `rbacService`, `ProgressService`, the i18n catalogues. A wrapper that only renames a platform API is an invention and is not built (the first draft's `defineScopedCommand`, `definePersistentSubscriber`, `PublicBlocks` registry and `defineClubSettings` registry were removed for this reason).
- Business entities, routes and pages — they stay in their modules per the club spec; in this spec `foundation` owns no table (the social sign-in spec adds `vereino_identity_links` to the same module).
- A custom lint rule for scope checks: it would check syntax, not scoping (false negatives inside callbacks, false positives in `di.ts`, token routes and seeds); the review checklist and TEST-F02-class tests do the job.
- Social sign-in (Google, Facebook): designed in `2026-10-27-vereino-social-sign-in.md`, which consumes P-01, P-02, P-03, P-09 and P-17 from this spec.
- Self-registration, JIT account creation, SAML, enterprise `sso`, MFA (lesson `enterprise-package-is-commercial`).
- Money, discount, calendar-grid, CSV-report and recurrence primitives — named as P-21…P-24 placeholders in *Implementation Phases*; built with phases 2 and 4.
- Push notifications, native apps (N02, N12).

## Proposed Solution

Four homes, one rule. `@vereino/core` holds framework-free value types, predicates and policies (scope grants and predicates, validity, consent state, the account-age policy, token policy, role catalogue data, the error-table type). `@vereino/db` holds the undecorated entity base class and migration helpers. `@vereino/ui` holds the member layer built on `@open-mercato/ui` primitives and semantic tokens. The module `foundation` (`src/modules/foundation/`, listed in `vereino-modules.json`) holds the few helpers that need the platform: `prepareScoped` + `assertInScope`, the scope resolver and its DI token, role seeding and sync, `createAccount`, `encryptedField`, the token-link service, the localized renderer and the error factory. Business modules keep the platform's own shapes — `CommandHandler`, subscriber `metadata`, worker files, injection widgets — and call the helpers from inside them; they depend on `foundation` through its public TypeScript API (`@/modules/foundation`, helper imports only, never entities) and through DI tokens; `foundation` depends on no business module (optional data providers are resolved by token with `hasRegistration`). The rule: a mechanic is implemented once, here, with its own tests, and only when at least two backlog stories need it (REQ-F16). This is the smallest platform-native solution because every helper is a composition of an installed contract the digest located, and everything the platform already does is left to the platform.

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-F01** Framework-bound helpers live in a Vereino module `foundation`; framework-free ones in `@vereino/core`; the entity base in `@vereino/db`; member UI in `@vereino/ui` (Q3 = A) | Discovery, DI, events, ACL and migrations exist only for modules; S4.9 keeps `@vereino/core` framework-free; S4.3 forbids value imports between Vereino modules, so shared components cannot live in `foundation/frontend` | A fourth package `@vereino/platform`; `src/lib/vereino/**` | The package needs an amendment to the workspaces table and S4.9/S4.10; `src/lib` has no discovery |
| **DD-F02** The extraction rule is amended once (Q2 = A): a primitive may precede its second consumer only when listed here with ≥ 2 backlog stories and a test | Without the amendment #38 would write role sync, scope resolution and token handling twice | Keep the rule and extract in phase 2 | Costs a rewrite of phase 1 code and leaves the review-found scope defects in place |
| **DD-F03** The scope *contract* (grant kinds, fail-closed union, predicates) is owned by the foundation; the scope *data* stays in `people` (`people.scopeService` registers as the single `ScopeProvider`; Q6); the foundation itself contributes one grant it can compute without `people`: `self_user` from `ctx.auth.sub` | The club spec makes `people` the sole source of person scope; identity commands (social spec) target the user, not a person | Move scope data into `foundation` | Would couple the foundation to business tables and reverse the dependency direction |
| **DD-F04** Optimistic locking uses the platform's `updated_at` token and `assertOptimisticLock` (header `x-om-ext-optimistic-lock-expected-updated-at`), not an integer `version` column | The installed CRUD factory, `CrudForm` (`optimisticLockUpdatedAt`) and the example module all use `updated_at`; one convention across platform and Vereino tables | MikroORM `@Property({ version: true })` integer | Would split the lock protocol; the same-millisecond collision risk is accepted and TEST-F01 asserts that one of two concurrent writers gets 409 |
| **DD-F05** Role sync writes through the command `auth.users.update` with the full desired `roles: string[]`, computed from active assignments | `rbacService` has no grant/revoke API and `syncUserRoles` is private (V-F02); the command resolves names per tenant and emits `auth.role.assigned`; the club spec's events row is corrected accordingly | Direct writes to `user_roles` | Bypasses the platform's audit, events and ACL cache invalidation |
| **DD-F06** Token links are a service parameterised by the owning entity (`activities_declaration_tokens`, `payments_order_links`, `facilities_rentals`), not a `foundation` table | The club spec keeps these tables in their modules; DD-35 names each lookup key | One `foundation_token_links` table | Cross-module ORM relations and a system-scope table that every module reads |
| **DD-F07** The import pipeline is built concretely in `people` (E02-S04) and extracted into a service over module-owned `*_imports` / `*_import_rows` tables when the second importer (fixtures, phase 2) arrives; the signature in this spec is illustrative | One consumer in phase 1; bank statements match orders, not persons, and fixtures need no review queue — the common shape is not yet known | Generic pipeline first | Speculative callbacks shaped by one consumer (review of 2026-10-27) |
| **DD-F08** `acting_role` is derived by `prepareScoped` from the first *allowed* grant that contains the target, where each command lists its allowed grant kinds **least-privileged first**; the UI context switcher only filters views | A client-sent role is untrustworthy (DD-07); "most privileged first" would record `club_admin` when an administrator declares her own child's absence | Context switcher as the source of truth; a fixed global privilege order | Rejected by DD-07; the global order mislabels the common case |
| **DD-F12** Member layer: thin shells and controls only (Q5 = A), built on `@open-mercato/ui` primitives (`Card`, `Button`, `Dialog`, `StatusBadge`, `LanguageSwitcher`) and the platform's semantic tokens; no own palette, no `dark:` forks; tests on `node --test` with `react-dom/server` rendering (no jsdom) | At least two member pages share each shell; the platform tokens already cover light and dark; `packages/ui` already runs `node --test` at 100 % coverage | Per-page assembly; a Vereino design system; a jsdom/RTL harness | Five pages would repeat the shell; an own design system contradicts `backend-ui.md`; a second harness for one package |
| **DD-F14** Helpers, not a framework: modules keep the platform `CommandHandler`, subscriber `metadata`, worker files and injection widgets; the foundation exposes `prepareScoped`/`assertInScope`, not a command wrapper | The installed handler already has `prepare/execute/buildLog/captureAfter/undo`, `makeCrudRoute` dispatches by `commandId`, and the example module needs snapshots, `buildLog` and redo that a wrapper would hide or duplicate (review of 2026-10-27) | `defineScopedCommand` (first draft) | Two command shapes per module; sessionless writes had no way in |
| **DD-F15** Public page slots are platform injection spots `vereino:public:<slot>`; each contributing widget reads `club_settings.publication` itself | The CLI scanner discovers `widgets/injection/**` and `InjectionSpot` filters by module; the spec already uses it for `vereino:club:tiles` | An Awilix registry `publicBlock:<module>.<name>` (first draft) | A parallel widget system |
| **DD-F16** Club settings stay on `club_core_club_settings` with Zod-typed defaults declared in `club_core` (club spec DD-02, DD-37); the foundation ships no settings registry and no DI token | DD-02 chose a regular entity because the settings are edited in `CrudForm` with their own lock token and carry the `publication` JSON and logo; `ModuleConfigService` (`configs`) exists but would split those concerns | `ModuleConfigService` over `module_configs` (review suggestion); a foundation registry (first draft) | Contradicts DD-02; the registry added nothing a typed defaults object does not |
| **DD-F17** The entity base in `@vereino/db` is an undecorated `abstract class` (the installed `wms/data/entities.ts` `WmsScopedEntity` pattern); subclasses in `data/entities.ts` apply `@Entity` and the column decorators from `@mikro-orm/decorators/legacy`; `@mikro-orm/core`, `@mikro-orm/decorators` and `@mikro-orm/postgresql` are pinned exactly in `packages/db` and `packages/app` | Two physical MikroORM copies (`nmHoistingLimits: workspaces`) share decorator metadata only at the same version; an undecorated base avoids the inheritance pitfalls the review named | A decorated mixin base with `@Entity` inheritance | Metadata drift across copies; generated discovery imports only module `data/entities` |

DD-F09, DD-F10, DD-F11 and DD-F13 (social sign-in) moved to the social sign-in spec as DD-S01…DD-S06; the ids are not reused.

## Domain Vocabulary and Business Rules

| Term | Definition | Owner | Rule / failure |
|---|---|---|---|
| Scope | A list of grants a user holds: `ScopeGrant = { kind, ids? , modules? }` with the kinds of the table below; the union of two scopes is the concatenation (club spec *Record scope* row) | contract: `foundation` (`@vereino/core` types); data: `people` (+ `self_user` from `foundation`) | No person linked to the user, or no provider registered → the scope holds only `self_user`; record reads then see nothing (fail closed); never "everything" |
| Allowed kinds of a command | The grant kinds a command accepts, listed least-privileged first; `prepareScoped` picks the first allowed grant that contains the target and records its `ActingRole` | each command (`people`, `club_core`, …) | A target in no allowed grant → 403 `scope_denied` |
| Validity | `valid_from` (date, required) and `valid_to` (date, optional); active at `now` when `valid_from ≤ now` and (`valid_to` empty or `now ≤ valid_to`) | `@vereino/core` | `valid_to < valid_from` → 422 `validity_inverted` |
| Consent record | A `<consent>_at` timestamptz column exactly as the club spec defines it on `people_persons` (`publish_name_consent_at`, `share_contact_with_coaches_at`, `share_presence_with_guardians_at`): set = granted at that instant, null = never granted or withdrawn; the row is never deleted; the grant and withdrawal dates survive in the command's `audit_logs` entry | `@vereino/core` type, `@vereino/db` column helper | Withdrawal of a consent that is not granted → no-op, 200 |
| Token link | A row in a module table with `token_hash` (the platform's `hashAuthToken`, HMAC-keyed), `expires_at`, `used_at`, `tenant_id`, `organization_id`, a subject id and a purpose; the raw token travels only in the e-mail link | `foundation` service, module table | Expired → 410 `token_link_expired`; used → 410 `token_link_used`; unknown → 404 without detail; all public requests for a link return 202 |
| Import batch / row | A module-owned pair of tables (`people_imports`, `people_import_rows` first) with the columns the club spec designs; the shared shape is extracted at the second importer (DD-F07) | the importing module | Commit of a committed batch → 409 `import_already_committed`; a row error never carries the cell value |
| Club setting | A key with a Zod-typed default declared by `club_core` on `club_core_club_settings` (DD-37) and read through `club_core`'s settings service | `club_core` (DD-F16) | Invalid stored value → the default, with a `club_core.settings.invalid` report fingerprint |
| Public slot | A platform injection spot `vereino:public:<slot>` on a public page; a module contributes a widget under `widgets/injection/` that renders nothing when `club_settings.publication` disables its block | `foundation` names the slots; modules own the widgets (DD-F15) | A widget that throws is isolated by `InjectionSpot`'s error boundary and reported with `<module>.public_block.failed` |

Grant kinds and acting roles (the club spec's *Record scope* row and its `acting_role` values):

| `ScopeGrant.kind` | Payload | Source (`people` unless noted) | `ActingRole` recorded |
|---|---|---|---|
| `club_admin` | — (club-wide) | active `club_admin` assignment | `club_admin` |
| `treasurer` | `modules: ['payments']` | active `treasurer` assignment | `treasurer` |
| `coordinator` | `ids`: section ids | active `coordinator` assignments | `coordinator` |
| `coach` | `ids`: group ids ∪ substitute occurrence ids | `coach`/`assistant` memberships, default coach, substitutions | `coach` |
| `facility_operator` | `ids`: place ids | active `facility_operator` assignments | `facility_operator` |
| `maintenance_planner` | `ids`: place ids | `facilities_place_maintainers` (optional provider) | `maintenance_planner` |
| `guardian` | `ids`: ward person ids | active guardianships | `guardian` |
| `self` | `ids`: [own person id] | the linked person | `self` |
| `self_user` | `ids`: [own `auth:user` id] | `foundation`, from `ctx.auth.sub` (DD-F03) | `self` |

A command targeting a person-scoped record lists, for example, `['self', 'guardian', 'coordinator', 'club_admin']`; a command targeting a user-scoped record (an identity link) lists `['self_user', 'club_admin']`.

## Users, Permissions, and Scope

The foundation adds no business actor and no ACL feature of its own in this spec: every helper runs inside the calling module's route or command and inherits its gate; the sessionless token routes keep `metadata.rateLimit` (V-10) plus the `checkAuthRateLimit` IP + e-mail key. The foundation never widens a scope: the union is a concatenation of grants the providers returned, and an absent provider contributes nothing. (The two identity features `foundation.identity.self` / `foundation.identity.manage` are declared by the social sign-in spec in the same module's `acl.ts`.)

## Reuse and Ownership Map

Status: **primitive** (built as a shared unit with its own tests), **helper** (a small shared function; no inventory claim), **convention** (a platform mechanism used a fixed way), **deferred** (designed; extracted at the second consumer), **moved** / **removed**.

| ID | Primitive | Status | Home | Installed seam (digest 2026-10-27) | Why |
|---|---|---|---|---|---|
| P-01 | `ScopedEntityBase` | primitive | `@vereino/db` | the installed `WmsScopedEntity` pattern (undecorated `abstract class`), `@mikro-orm/decorators/legacy` in subclasses (DD-F17) | one base keeps the lock token and soft delete identical everywhere |
| P-02 | `prepareScoped` + `assertInScope` | primitive | `foundation` | `CommandHandler.prepare`, `parseWithCustomFields`, `assertOptimisticLock`; `runCrudCommandWrite`, `emitCrudSideEffects` and undo stay the module's (DD-F14) | one place for the S4.4 sequence and DD-07, callable from every `prepare`, including sessionless ones |
| P-03 | `ScopeContract` | primitive | types in `@vereino/core`; resolver + DI token in `foundation` | Awilix `container.register(asFunction().scoped())`, `hasRegistration` | the platform RBAC knows features, not record scope (DD-06) |
| P-04 | `RoleCatalogue` + `seedRoles` | primitive | data in `@vereino/core`; seeding in `foundation`, called from `people`'s `setup.ts` | `acl.ts` features with `dependsOn`; `setup.ts` `defaultRoleFeatures` + `seedDefaults`; `yarn mercato auth sync-role-acls` | role names are data; seeding is the platform's; `people` calls it so the order of module setup does not matter |
| P-05 | `syncAuthRoles` | primitive | `foundation` | command `auth.users.update` (`roles: string[]`), `commandBus.execute` | DD-F05 |
| P-06 | `Validity` | primitive | `@vereino/core` | — (pure) | S3.5 time as a parameter; consumers: assignments (#38), memberships, consents, seasons |
| P-07 | `createAccount` + `accountAgePolicy` | primitive | policy in `@vereino/core`; helper in `foundation` | command `auth.users.create` (`sendInviteEmail`, `warning: 'invite_email_failed'`), `api/users/resend-invite` (V-2) | the platform owns users and invitations; the `people` command applies the policy, throws its own code and writes `people_persons.user_id` (S4.3) |
| P-08 | `ConsentRecord` | primitive | `@vereino/core` type, `@vereino/db` column helper | — (pure) | listmonk pattern; consumers E02-S02 (`publish_name_consent_at`, guardianship consents), E02-S03 (the D22/D23 consents on `/club/profile`), E03-S05 (DD-39) |
| P-09 | `encryptedField` | primitive | `foundation` | `defaultEncryptionMaps` (`hashField`), `findWithDecryption`, `lookupHashCandidates`, `search.ts` `fieldPolicy.excluded` (V-3) | one declaration produces map, hash and search policy together; consumers E02-S02 (PESEL), E02-S04 (import rows), social sign-in, phase 5 |
| P-10 | `TokenLinkService` | primitive (phase B) | `foundation` | `generateAuthToken` / `hashAuthToken` (`core/modules/auth/lib/tokenHash.ts`), `metadata.rateLimit`, `checkAuthRateLimit`, system-scope lookup per DD-35 | Auth.js return-and-delete semantics on module tables; consumers E03-S03, phase 4 order links, phase 5 requests, E02-S05 slug lookup |
| P-11 | `ImportPipeline` | deferred | `people` first; `foundation` at the second importer | `attachments` private partition, `ProgressService`, the bulk outbox pattern of `example/lib/todoBulkComplete.ts` | DD-F07 |
| P-12 | `defineScheduledJob` | deferred | `people` first (`people:sync-role-expiry` written plainly); `foundation` at the second job (`people:purge-import-rows`) | `schedulerService.register(...)` in `seedDefaults`, worker `metadata` + `handle(job, ctx)` | one job in phase A; the `hasRegistration` guard, stable uuid and 15-field registration are real boilerplate worth sharing at two |
| P-13 | `definePersistentSubscriber` | removed | — | subscriber `metadata { event, persistent: true, id }` + `handle` | the installed shape is already one object; de-duplication is the handler's unique constraint (Q12); one README line |
| P-14 | `defineClubSettings` | removed | `club_core` owns the settings entity, typed defaults and service (DD-F16) | `club_core_club_settings` (DD-02, DD-37) | a registry added nothing |
| P-15 | public slots | convention | `foundation` names the spots; widgets in each module | `widgets/injection/**` discovery, `InjectionSpot` (DD-F15) | the platform's widget system |
| P-16 | `renderLocalized` | helper | `foundation/lib/localized.ts` | `loadDictionary(locale)`, `createFallbackTranslator`, `resolveSupportedLocale`, `getSupportedLocales` (V-11) | no explicit-locale `resolveTranslations` exists; the helper composes the fallback chain (person → club default → `en`) |
| P-17 | `ErrorCodeTable` + `errors(table)` | helper | type in `@vereino/core`; factory in `foundation` | `CrudHttpError`; `contracts:check` (`packages/app/scripts/check-vereino-contracts.mjs`) already enforces uniqueness, pattern, reserved codes and i18n keys | one factory replaces seven `api/errors.ts`; nothing else is claimed |
| P-18 | member layer | primitive (phase A2) | `@vereino/ui` | `@open-mercato/ui` `Card`, `Button`, `Dialog`, `StatusBadge`, `LanguageSwitcher`, `InjectionSpot`; reference `/[orgSlug]/portal/dashboard` | DD-F12; consumers E02-S03, E03-S03, phase 4 |
| P-19 | `TokenPageShell`, `PublicPageShell`, `ImportWizard`, `DeclarationControls` | primitive (phase B) | `@vereino/ui` | `Dialog`, `useConfirmDialog`, `DataTable` for previews, `FormField` | three token routes, four public pages, three importers, two declaration surfaces |
| P-20 | `IdentityLink` | moved | the social sign-in spec | — | — |

## Architecture and Data Flow

```text
packages/core (@vereino/core)  ◄── packages/db (@vereino/db)  ◄── packages/app
       ▲                                                         │
       └───────────────── packages/ui (@vereino/ui) ◄────────────┘
                                                                  src/modules/foundation  ◄── club_core, people, groups, activities, communication, payments, facilities
                                                                  (helpers and DI tokens only; no table, no route in this spec)

Route (module) ─► validators (Zod) ─► platform CommandHandler (module)
   prepare(input, ctx):  const { parsed, scope, actingRole } = await prepareScoped(spec, input, ctx)   // P-02
                         ... module snapshots, buildLog, custom fields as the example module does
   execute: runCrudCommandWrite(phases) → emitCrudSideEffects after commit; undo = the platform's, with prepareScoped again
prepareScoped: parse → scope source (session: scopeContract.resolve(ctx) | token: the TokenLinkService result | marker: a signed-in user's self_user)
             → first allowed grant containing the target (else 403 scope_denied) → assertOptimisticLock → actingRole
scopeContract.resolve(ctx) ─► ScopeProvider (DI token `vereino.scopeProvider`, registered by people.scopeService) ∪ { self_user }
                            ─► concatenation of grants; absent provider or unlinked user → only self_user (fail closed)
people subscriber people:sync-auth-roles (platform metadata) on people.role_assignment.{created,updated,deleted} ─► syncAuthRoles ─► auth.users.update { roles }
people worker people:sync-role-expiry (plain worker + registration in people's setup) ─► syncAuthRoles for assignments past valid_to
people setup.ts seedDefaults ─► seedRoles(container, scope)   // P-04, order-independent
Public link ─► GET /api/<module>/.../{token} ─► TokenLinkService.consume(entity, token) ─► DD-35 lookup (token_hash) ─► prepareScoped with the token scope ─► module command
Public page /p/* ─► PublicPageShell ─► InjectionSpot 'vereino:public:<slot>' ─► module widgets (read club_settings.publication)
```

- **Dependency direction:** `app → ui | db → core` unchanged; inside the app, business modules → `foundation` → platform. `foundation` imports no business module; it reaches `people` only through the `vereino.scopeProvider` token with `hasRegistration` (absent → no person grants). `club_core` owns and serves the settings (DD-F16); the foundation never reads them.
- **Shared packages:** `@vereino/core` exports types, predicates and policies only (S4.9); `@vereino/db` exports the base class, column helpers and migration helpers and is imported only by `data/entities.ts` and migrations; `@vereino/ui` exports the member layer and is imported by `frontend/**` pages.
- **Extension points the foundation defines:** DI token `vereino.scopeProvider`; injection spots `vereino:club:header`, `vereino:club:tiles`, `vereino:public:<slot>`.
- **Compatibility:** the DI token, the spot names, the error codes and the `vereino_*` role names become protected surfaces at the first deployment (`BACKWARD_COMPATIBILITY.md` §2, §4). The exported TypeScript APIs of `@vereino/core|db|ui` and of `foundation` are **internal** surfaces under §1: a change lands with every consumer in the same PR and `yarn typecheck` is the guard; no additive-only promise is made. Phase A1 adds a §1 row naming `foundation` with that path.

## User Journeys

### Journey J-F01 — A coordinator gets an account and her scope (consumer: #38)

1. The administrator creates the person and saves a `coordinator` assignment for section A (a `people` `CommandHandler` whose `prepare` calls `prepareScoped`; P-06 validity). No account yet: `syncAuthRoles` (P-05) finds no `user_id` and records nothing.
2. The administrator chooses "Create account": the `people` command `people.persons.create_account` reads `own_account_min_age` through `club_core`'s settings service, applies `accountAgePolicy` (P-07, pure) and throws `account_age_below_threshold` itself when the person is too young; otherwise it calls `createAccount` (P-07) with `roles` computed from the active assignments through `RoleCatalogue` (P-04) and `sendInviteEmail: true`, stores the returned `userId` on `people_persons.user_id`, and emits `people.person.account_created`; the person's `preferred_locale` chooses the e-mail language (P-16); a failed e-mail returns `invite_email_failed` and the UI offers "Resend".
3. She sets her password through `/reset/<token>`, signs in, lands on `/club` (P-18): the shell asks `ScopeContract` (P-03) and shows the coordinator tiles for section A only; the switcher is hidden because she has one role.
4. Her assignment ends: `people:sync-role-expiry` runs `syncAuthRoles`, `auth.users.update` removes `vereino_coordinator`; the next request to a section route returns 403 (TEST-005, TEST-F03).

### Journey J-F02 — The administrator imports families (consumer: E02-S04)

1. `/backend/people/imports` uploads a file: the `people` import stores it in the private `attachments` partition and the batch row (`people_imports`), suggests the mapping by header (Baserow pattern), and classifies rows (`pesel_hash` / `external_id_hash` match through P-09's lookup, never names — DD-38).
2. The review queue shows rows classified `review`/`error`; decisions go through `people.imports.decide_row`.
3. Commit runs the `people` commands row by row inside a `ProgressService` job; a second commit returns 409 `import_already_committed`; `people:purge-import-rows` deletes rows 30 days later. The pipeline is extracted to the foundation when the fixtures importer (phase 2) is planned (DD-F07).

### Journey J-F03 — A guardian declares from an e-mail link (consumer: E03-S03)

1. The reminder e-mail (P-16, locale of the guardian) carries `/club/d/<token>`; the page (P-19 `TokenPageShell`) calls `GET /api/activities/declaration-links/{token}`.
2. `TokenLinkService.consume` performs the single DD-35 lookup on `activities_declaration_tokens.token_hash`, narrows every further query to the found tenant and organization, refuses expired (410) and used (410) tokens, and returns the subject and the wards the token covers.
3. The declaration command's `prepare` calls `prepareScoped` with the token as the scope source: the scope holds one `guardian` grant with those ward ids, and `acting_role = guardian`.

## UI and Interaction Contracts

### UI architecture

Admin pages keep the platform shell and `DataTable`/`CrudForm` from `@open-mercato/ui` directly. Member (`/club/*`) and public (`/p/*`) pages use the member layer from `@vereino/ui`, which composes `@open-mercato/ui` primitives and the platform's semantic tokens (`--background`, `--card`, `--primary`, `--muted-foreground`, `--status-*`); it defines no colour of its own and no `dark:` override. Reference pages: `/[orgSlug]/portal/dashboard` (`PortalPageHeader`, `PortalCard`, `PortalEmptyState`, `InjectionSpot 'portal:dashboard:sections'`) for the Today shell; `/backend/profile` for the profile sections; `/quote/[token]` (`sales`) for token pages. Every component below ships loading, empty, error, conflict (where a write exists), keyboard, `aria` and 375-px behaviour, light and dark; `packages/ui` tests render with `react-dom/server` under `node --test` (DD-F12) and TEST-F11 exercises the browser states.

| Surface / component | Behaviour | Data source and mutations | Reference | Canonical components | States | Requirement IDs |
|---|---|---|---|---|---|---|
| `MemberPage` (`@vereino/ui`) | shell for `/club/*`: header with greeting, `WardSelector`, `RoleContextSwitcher`, `LanguageSwitcher`; single column at 375 px | `GET /api/people/me` (grants, wards, locale) | `/[orgSlug]/portal/dashboard` | `PortalPageHeader`-like header from `Card`/`Button`, `InjectionSpot 'vereino:club:header'` | loading skeleton, error (retry), unauthenticated → redirect | REQ-F13 |
| `TodayTiles` | role-aware tiles; a tile renders only when its module is enabled and the viewer holds a grant of the tile's kind; `InjectionSpot 'vereino:club:tiles'` for modules | tile data from each module's endpoint | same | `Card`, `StatusBadge`, `Button` | loading per tile, empty ("No classes today"), error per tile (the shell survives) | REQ-F13 |
| `RoleContextSwitcher` | visible only with ≥ 2 grant kinds (excluding `self`/`self_user`); changes a view filter stored in `sessionStorage`; never sent as `acting_role` (DD-F08) | none | `ProfileDropdown` pattern | `Dialog`/dropdown primitive, `Button` | keyboard (arrow, Enter, Escape), `aria-expanded` | REQ-F13 |
| `WardSelector` | "All wards" or one ward; persists in `sessionStorage` | `GET /api/people/me` | same | dropdown primitive | empty (no wards → hidden) | REQ-F13 |
| `ConsentToggle` | switch with the grant date or "not granted"; withdrawal asks for confirmation | `PUT /api/people/me` (`shareContactWithCoaches`, …) | `/backend/profile` | switch primitive, `useConfirmDialog` | saving, error (value preserved), conflict 409 → reload prompt | REQ-F05 |
| `TokenPageShell` | frame for `/club/d/[token]`, `/club/o/[token]`, `/p/[clubSlug]/requests/verify/[token]`: resolves the token first, then renders the child | `GET …/{token}` of the owning module | `/quote/[token]` | `Card`, `Button` | loading, expired (410, "ask for a new link"), used, not found (same copy as expired), success | REQ-F14 |
| `PublicPageShell` | frame for `/p/*` with named injection spots `vereino:public:<slot>` | public endpoints of `club_core` | `/[orgSlug]/portal` | `Card`, section headers, `InjectionSpot` | loading, 404, "club does not publish a page", a failed widget renders nothing | REQ-F14 |
| `ImportWizard` | upload → mapping → preview (`DataTable`, classification column with `StatusBadge`) → review queue → commit with progress | the owning module's import routes | `wms/components/backend/ImportInventoryDialog.tsx` (installed, not enabled) | `Dialog`, `DataTable`, `FormField`, progress from `ProgressService` | upload error (422 mapping), empty file, conflict 409 committed, progress, summary | REQ-F14 |
| `DeclarationControls` | `absence_only` → "Report absence"; `confirm` → "Attending / Not attending"; status announced via `aria-live` | `POST /api/activities/attendance/declare` | club spec *Today* mock-up | `Button`, `StatusBadge` | saving, error, 409 (deadline passed) | REQ-F14 |

```text
/club — Today (MemberPage + TodayTiles)
┌──────────────────────────────────────────────┐
│ Hello, Kasia            [Jaś ▾] [as: guardian ▾] │   ← WardSelector, RoleContextSwitcher (≥ 2 grant kinds)
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

### `ScopedEntityBase` (abstract base class, `@vereino/db`; DD-F17)

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK, `gen_random_uuid()` | — |
| `tenant_id`, `organization_id` | uuid, required | only from trusted context; composite index with the entity's most frequent filter (the entity adds it) |
| `created_at`, `updated_at` | timestamptz | `updated_at` is the optimistic-lock token (DD-F04), returned as `updatedAt` |
| `deleted_at` | timestamptz? | soft delete; `deleteOrmEntity({ soft: true })` |

The base class declares the properties with the `@mikro-orm/decorators/legacy` column decorators but carries no `@Entity`; a subclass in a module's `data/entities.ts` adds `@Entity({ tableName })` and its own columns (the installed `WmsScopedEntity` shape). `ValidityColumns` adds `valid_from` date, `valid_to` date?; `ConsentColumns('<name>')` adds `<name>_at` timestamptz? (the club spec's consent columns; withdrawal = null, history in `audit_logs`); `TokenLinkColumns` adds `token_hash` text (unique, indexed), `expires_at` timestamptz, `used_at` timestamptz?, `purpose` text. The foundation owns no table in this spec (DD-F06, DD-F07); the social sign-in spec adds `vereino_identity_links` to the module.

## API, Command, and Error Contracts

The foundation exposes TypeScript APIs and one DI token, not HTTP routes; the routes it serves are the consumers' own.

| ID | Export (home) | Signature (abridged) | Behaviour and errors |
|---|---|---|---|
| P-02 | `prepareScoped(spec, input, ctx) → { parsed, scope, actingRole, lock }` and `assertInScope(scope, kinds, target) → ActingRole` (`foundation`) | `spec: { input: ZodType, resourceKind, allowedKinds: GrantKind[] (least-privileged first), resolveTarget(parsed, ctx) → { id, tenantId, organizationId, sectionId?, groupId?, placeId?, personId?, userId? }, lock?: 'updated_at' \| 'none', scopeSource?: { token: TokenLinkResult } \| { marker: { userId } } }` | parses with `parseWithCustomFields`; derives tenant and organization from the session (`ctx.auth`, `selectedOrganizationId ?? auth.orgId`) or from the token/marker source; resolves the scope (`scopeContract.resolve(ctx)` for a session, the token's grants for a token, `self_user` for a marker); picks the first allowed grant containing the target else 403 `scope_denied`; `assertOptimisticLock` when `lock = 'updated_at'` (409 `optimistic_lock_conflict`); returns `actingRole` for the module's log entry. Called from a module's `prepare` and again from its `undo` (so an undo re-checks the *current* scope); everything else — snapshots, `buildLog`, `runCrudCommandWrite`, side effects, redo — stays the module's, as in the example module. A command without `undo` sets the platform's `isUndoable: false` and states the reason in its JSDoc |
| P-03 | `GrantKind`, `ScopeGrant`, `Scope = ScopeGrant[]`, `unionScopes(a, b)` (concat), `grantContaining(scope, kinds, target) → ScopeGrant \| null`, `hasKind(scope, kind)` (`@vereino/core`); `scopeContract.resolve(ctx) → Scope` and token `vereino.scopeProvider` (`foundation`) | `ScopeGrant = { kind: GrantKind; ids?: string[]; modules?: string[] }` | the resolver concatenates the registered provider's grants with `{ kind: 'self_user', ids: [ctx.auth.sub] }`; no provider or no linked person → only `self_user`; `grantContaining` walks `kinds` in the given order and returns the first grant whose `ids` contain the target's matching id (or any grant for `club_admin`; `treasurer` only when the target's module is listed) |
| P-04 | `roleCatalogue` (`@vereino/core` data), `seedRoles(container, scope)` and `rolesForAssignments(assignments, now)` (`foundation`) | `roleCatalogue: Record<VereinoRole, { authRole: 'vereino_…', features: string[], implies?: VereinoRole[], requiresScope?: 'section' \| 'place' \| null }>` | `seedRoles` is idempotent and is called from `people`'s `setup.ts` `seedDefaults` (`defaultRoleFeatures` + `seedDefaults`), so it does not depend on module setup order; `rolesForAssignments` returns the sorted, de-duplicated `auth` role names for the active assignments (`Validity`) |
| P-05 | `syncAuthRoles(userId, desiredRoles, ctx)` (`foundation`) | executes `auth.users.update` with `{ id, roles }` only when the set differs | idempotent by set comparison; unknown role name → the platform's 400 is rethrown as an uncoded 500 with `reportError` fingerprint `foundation.roles.catalogue_mismatch`; a failed `auth.users.update` propagates: the `people` persistent subscriber is retried by the queue, the job counts the failure and retries on the next run |
| P-06 | `Validity.parse`, `isActiveAt(v, now)`, `endsBefore(v, now)` (`@vereino/core`) | pure | 422 `validity_inverted` from the Zod refine |
| P-07 | `accountAgePolicy({ birthDate, threshold, now }) → 'ok' \| 'below_threshold'` (`@vereino/core`); `createAccount({ email, roles, locale }, ctx) → { userId, warning?: 'invite_email_failed' }` (`foundation`) | the helper calls `auth.users.create` with `sendInviteEmail: true`, `organizationId`, `roles` and returns `userId` | the `people` command applies the policy first and throws its own `account_age_below_threshold`; `createAccount` maps the platform's duplicate e-mail to 409 `email_taken`; `account_exists` (409) is the `people` command's check on `user_id` |
| P-08 | `ConsentState`, `grantConsent(now)`, `withdrawConsent(now)` (`@vereino/core`) | pure transitions on `{ grantedAt }` | withdrawal when not granted → unchanged |
| P-09 | `encryptedField({ entityId, field, hash: true \| false, searchable: false })` (`foundation`) → `{ mapEntry, lookup(value) → string[], searchPolicy }` | builds the `defaultEncryptionMaps` entry with `hashField`, the `lookupHashCandidates` wrapper and the `fieldPolicy.excluded` entry | a field declared `searchable: true` with `hash` is a type error |
| P-10 | `createTokenLinkService(entity, { purpose, ttl })` (`foundation`) → `{ issue(subject, grants, ctx) → rawToken, consume(rawToken) → TokenLinkResult \| null, markUsed(row) }` | `issue` stores `hashAuthToken(raw)` with the grants the link carries (e.g. one `guardian` grant); `consume` is the single DD-35 lookup, constant-time compare, refuses expired/used and returns `{ row, tenantId, organizationId, grants }` for `prepareScoped` | 410 `token_link_expired`, 410 `token_link_used`; `consume` of an unknown token returns null (route answers 404 with the expired copy) |
| P-11 | *illustrative* — `createImportPipeline({ batchEntity, rowEntity, classify, commitRow })` → `{ create, suggestMapping, preview, decideRow, commit, purge }` | not built in this spec (DD-F07) | — |
| P-12 | *illustrative* — `defineScheduledJob({ id, schedule, run })` | not built in this spec; `people:sync-role-expiry` is a plain worker with its registration in `people`'s `setup.ts` | — |
| P-16 | `renderLocalized(locale, (t) => …)` and `localeForPerson(person, clubDefault)` (`foundation/lib/localized.ts`) | `resolveSupportedLocale` → `loadDictionary` → `createFallbackTranslator` | unknown locale → club default → `en` |
| P-17 | `ErrorCodeTable` type (`@vereino/core`) and `errors(table)` → `{ throw(code, details?) }` (`foundation`) | throws `CrudHttpError(status, { error, code })`; the table is what `contracts:check` reads | uniqueness, pattern, reserved codes and i18n keys are enforced by the existing `contracts:check` |

Error codes of the module (`src/modules/foundation/lib/error-codes.ts`): `scope_denied` (403), `optimistic_lock_conflict` (409, platform code re-exported), `validity_inverted` (422), `email_taken` (409), `token_link_expired` (410), `token_link_used` (410); `account_age_below_threshold` (422) and `account_exists` (409) are owned and declared by `people`; the import codes (`import_mapping_invalid`, `import_already_committed`, `import_in_progress`) by `people` until the pipeline is extracted. Uncoded 500s carry no detail (S6.7); they are reported with `<module>.<reason>` fingerprints. Lists use `createPagedListResponseSchema`; amounts and dates follow S6.3–S6.6.

## Events, Jobs, Notifications, and Cross-Module Flows

| Event / job | Producer | Consumer | Effect | Idempotency |
|---|---|---|---|---|
| `people.role_assignment.created` / `updated` / `deleted` (the club spec's ids; "ended" is an `updated` with `valid_to`) | `people` | `people`'s persistent subscriber `people:sync-auth-roles` (platform `metadata`), calling `syncAuthRoles` | `auth.users.update` (DD-F05; the club spec's events row corrected in the same PR) | set comparison; queue retry on failure |
| scheduler `people:sync-role-expiry` (daily 02:00) | `people` (plain worker; registration in `people`'s `setup.ts`) | `people` | `syncAuthRoles` for assignments past `valid_to` | set comparison |
| `club_core.settings.updated` | `club_core` (DD-F16) | modules caching settings | cache invalidation | `updated_at` of the settings row |

The foundation emits no event and no notification type in this spec.

## Security, Privacy, and Compliance

- **Authorization and scope:** every helper narrows, none widens; the resolver concatenates only what the registered provider returned plus `self_user`; an absent provider or an unlinked user yields no person grants; `acting_role` is server-derived from the first allowed grant (DD-F08). The review checklist line of REQ-F16 ("no hand-written scope filter outside `prepareScoped`") and a TEST-F02-class test per module replace the custom lint rule; the boundaries lint confines `@mikro-orm/*` imports to `data/**`, `commands/**`, `di.ts` and migrations, so a route handler cannot query the ORM at all.
- **Tenant isolation:** the base class requires both scope columns; the only system-scope reads are the token-link entries of the DD-35 list (`TokenLinkService.consume` implements them) and, from the social sign-in spec, the identity lookup; each narrows immediately to the found tenant and organization.
- **Tokens:** raw tokens are never stored or logged; hashes use the platform's `hashAuthToken` (HMAC-keyed); constant-time comparison; one token = one subject, one purpose, one set of grants.
- **Sensitive data:** every field declared with P-09 is encrypted by the owning module's map; events carry ids only (S4.6).
- **Abuse:** `metadata.rateLimit` on every sessionless token route (V-10; `RATE_LIMIT_TRUST_PROXY_DEPTH` set in deployment) and `checkAuthRateLimit` on every token-link request route; uniform 202 for link requests.
- **Failure modes (S3.6):** `auth.users.update` failing in `syncAuthRoles` → the subscriber throws and the queue retries, the job counts the failure and retries next run; a failed invitation e-mail → `invite_email_failed` surfaced with resend (P-07); a scope provider that throws → `prepareScoped` fails closed with an uncoded 500 and fingerprint `foundation.scope.provider_failed`; an invalid stored setting → the default with `club_core.settings.invalid`; a public widget that throws → isolated by `InjectionSpot` and reported.
- **Compliance:** the age threshold stays a club setting (D-022); consents follow the club spec's columns; nothing here changes the data-protection notice.

## Integration Coverage

Integration tests are self-contained (own tenant and organization, cleanup in `finally`) and live in `packages/app/.ai/qa/tests/foundation/`; unit tests live next to the code in `__tests__/` (100 % coverage, S13.6).

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-F01 | integration | a `people` command whose `prepare` calls `prepareScoped`; two organizations | create and update across organizations; update with a stale `updated_at`; two writers of one record in the same millisecond; undo | 403 `scope_denied` across scope; 409 `optimistic_lock_conflict`; exactly one of the two concurrent writers succeeds and the other gets 409; `acting_role` recorded; undo restores and re-checks the current scope | REQ-F01, REQ-F12 |
| TEST-F02 | security | user without a linked person; user with coordinator grants for section A; an administrator who is also a guardian | read section A and B lists and details; the administrator declares her own child's absence | unlinked → empty lists and 403 on details; coordinator → A only, B 403; list and detail agree; the administrator's declaration records `acting_role = guardian` (least-privileged first) | REQ-F02 |
| TEST-F03 | integration | fresh tenant | `seedRoles` twice (from `people`'s setup); assignment coordinator A then coach; `valid_to` yesterday; run `people:sync-role-expiry` twice; `auth.users.update` failing once | no duplicate roles; `auth` roles granted then revoked; the second run changes nothing; the failed update is retried (TEST-005 of the club spec passes through this path) | REQ-F03, REQ-F10 |
| TEST-F04 | integration | person 15, person 40, person with an account | `people.persons.create_account` ×3; invite e-mail transport failing | 422 `account_age_below_threshold` thrown by `people`; 201 with invite; 409 `account_exists`; `invite_email_failed` surfaced and resend works; `people_persons.user_id` written by the `people` command | REQ-F04 |
| TEST-F05 | unit + integration | person with consents | grant, withdraw, grant again; validity inverted | `<name>_at` set, null, set; the row kept; the audit entries carry the dates; 422 `validity_inverted` | REQ-F05 |
| TEST-F06 | integration | person with PESEL | duplicate PESEL; search by surname; read without `people.pesel.view`; raw DB read | 409; search hits through `search_tokens`; PESEL hidden; ciphertext in the database | REQ-F06 |
| TEST-F07 | integration + security | declaration token for guardian G | consume twice; after expiry; from a tenant B route; request a link for an unknown e-mail; declare through the token | second → 410 used; expired → 410; tenant B → 404; unknown e-mail → 202 same timing class; the declaration's `acting_role = guardian` with only the token's wards in scope | REQ-F07 |
| TEST-F08 | integration | CSV with new, matched, review and error rows (the `people` importer) | create, map, preview, decide, commit, commit again, purge after 30 days (clock injected); commit with `ProgressService` stopped | classifications; progress job completes; 409 on second commit; rows purged; errors carry no cell value; the stopped-service commit leaves the batch `previewed` | REQ-F08 |
| TEST-F09 | unit + integration | `club_core` settings with and without stored values | read, write invalid value, read | defaults; validation error; invalid stored value → default + report fingerprint | REQ-F09 |
| TEST-F10 | integration | e-mail rendering for `pl` and `en` persons, unknown locale | render | correct dictionary; fallback to club default then `en` | REQ-F11 |
| TEST-F11 | UI | member with two grant kinds and two wards; one kind; no wards | `/club`, switch role and ward, keyboard, 375 px, dark | switcher visibility rules; tiles filtered; `aria-live`; axe clean | REQ-F13 |
| TEST-F14 | unit | a route handler importing `@mikro-orm/core`; a command importing it; `data/entities.ts` | run `yarn lint` | the handler reported by the boundaries rule; the other two not | REQ-F16 |

TEST-F12, TEST-F13 and TEST-F15 moved to the social sign-in spec (TEST-S01…S04); the ids are not reused.

## Implementation Phases

Validation for every phase: `yarn verify` (the single gate; `typecheck:packages`, strict i18n, `contracts:check`, `build`), `yarn test:integration:vereino --filter TEST-F…`, SQL review from `yarn db:generate` (no `yarn db:migrate` without approval). Each new package export and the module `foundation` are covered at 100 % line, branch and function by unit tests (S13.6). `foundation` is added to `packages/app/vereino-modules.json` in phase A1 step 1. One task is one PR: phase A1 ships with #38, phase A2 with E02-S03, phase B in two PRs with its consumers.

### Phase A1 — Backend kernel, with #38 as the consumer

- **Depends on:** this spec `Ready for implementation`; the club spec phase 1 (ready); E02-S01 merged or in the same PR as far as `club_core_club_settings` and its service are concerned (`own_account_min_age`, DD-F16); the `AGENTS.md` amendment and the review-checklist line (REQ-F16) in the same PR as step 1; **approval to enable the `scheduler` module** (`people:sync-role-expiry`; the club spec's phase 1 step 1 asks for it) — Ask First.
- **Outcome:** #38 and E02-S02 can be implemented on the primitives; a coordinator gets an account and scoped roles (J-F01 steps 1, 2 and 4).
- **Why this order / value delivered:** every later story needs scope, commands, roles and accounts; building them once with the first consumer removes the duplicated implementations the review flagged.
- **Deliverables:** `packages/core/src/{scope,validity,consent,roles,error-codes,account-policy}.ts` + `index.ts`; `packages/db/src/{scoped-entity,validity-columns,consent-columns,migrations}.ts` + `index.ts` (+ `@mikro-orm/decorators` pinned, DD-F17); `src/modules/foundation/{index.ts,di.ts,lib/{prepare-scoped,scope,roles,accounts,encryption,localized,errors,error-codes}.ts,api/errors.ts,i18n/{en,pl}.json,README.md}` (the README states what a primitive is, how to add one — the inventory rule of REQ-F16 — and the one-line conventions for subscribers and jobs); `AGENTS.md` extraction-rule amendment; `.ai/review-checklist.md` line; the boundaries lint entry in `eslint.vereino.mjs`; `BACKWARD_COMPATIBILITY.md` §1 row for `foundation`.
- **Steps:**
  1. Repository wiring: `foundation` in `vereino-modules.json`, package `index.ts` exports, pins, `AGENTS.md` amendment, checklist line, boundaries entry (TEST-F14), BC row, README; enabling `scheduler` in `src/modules.ts` after approval.
  2. P-06 `Validity`, P-08 `ConsentRecord`, P-07 `accountAgePolicy`, P-17 `ErrorCodeTable` (core) with unit tests; P-01 base class and column helpers (db) with a probe entity SQL test; P-09 `encryptedField` (TEST-F06 with the PESEL of E02-S02).
  3. P-03 scope contract (core types and predicates + `foundation` resolver, DI token, `self_user` grant, fail-closed default); P-02 `prepareScoped` + `assertInScope` (TEST-F01, TEST-F02 on the first `people` commands).
  4. P-04 role catalogue and `seedRoles` (called from `people`'s `setup.ts`); P-05 `syncAuthRoles`; `people:sync-auth-roles` subscriber and `people:sync-role-expiry` worker written plainly in `people` (TEST-F03).
  5. P-16 `renderLocalized`; P-07 `createAccount`; the `people.persons.create_account` command with the policy (TEST-F04, TEST-F09 against `club_core`'s settings, TEST-F10).
- **Independent slices / estimated commits:** (a) core + db 2 commits; (b) scope + prepare 2 commits; (c) roles + accounts 2 commits; (d) localized + errors 1 commit. (b) after (a); (c), (d) after (b).
- **Requirements closed:** REQ-F01, REQ-F02, REQ-F03, REQ-F04, REQ-F05, REQ-F06, REQ-F09 (with E02-S01), REQ-F10 (the job written plainly; the wrapper deferred), REQ-F11, REQ-F12, REQ-F16
- **Tests:** TEST-F01 … TEST-F06, TEST-F09, TEST-F10, TEST-F14
- **Validation:** as above
- **Exit gate:** #38's acceptance criteria pass using only P-01…P-09 (its PR lists them); `yarn verify` green; the review checklist line holds for `people` and `club_core`; TEST-F02 passes for both.

### Phase A2 — Member layer, with E02-S03 as the consumer

- **Depends on:** Phase A1 exit gate; the `packages/ui` test approach of DD-F12 (`react-dom/server` under `node --test`) proven on the first component.
- **Outcome:** the guardian and the coordinator land on `/club` with role-aware tiles (J-F01 step 3).
- **Why this order / value delivered:** five member pages across phases 1–4 share the shell; the first one is E02-S03.
- **Deliverables:** `packages/ui/src/member/{MemberPage,TodayTiles,RoleContextSwitcher,WardSelector,ConsentToggle}.tsx` + `index.ts`; injection spots `vereino:club:header`, `vereino:club:tiles`; the `/club` page of E02-S03 using them.
- **Steps:** 1. `MemberPage` and `TodayTiles` with server-render tests. 2. `RoleContextSwitcher`, `WardSelector`, `ConsentToggle`. 3. `/club` and `/club/profile` of E02-S03 on the shell (TEST-F11).
- **Independent slices / estimated commits:** (a) shell 2 commits; (b) controls 1 commit; (c) pages 1 commit. (b), (c) after (a).
- **Requirements closed:** REQ-F13
- **Tests:** TEST-F11
- **Validation:** as above; `packages/ui` unit coverage 100 %
- **Exit gate:** E02-S03's `/club` acceptance criteria pass; checked in light and dark at 375 px; keyboard and `aria-live` verified.

### Phase B — Token links and the shared shells, with E02-S04, E02-S05 and E03-S03 as consumers

- **Depends on:** Phase A1 exit gate (Phase A2 for `PublicPageShell` and `TokenPageShell` styling); **approval to enable the `progress` module** (`ProgressService` for the `people` import commit) — Ask First.
- **Outcome:** the people import (J-F02), the public club page (E02-S05) and the declaration link (J-F03) run on the shared pieces that have at least two consumers.
- **Why this order / value delivered:** four consumers of the token service and four public pages are in phases 1–5; the first of each arrives here.
- **Deliverables:** P-10 `TokenLinkService` + `TokenLinkColumns`; the public slots convention (P-15) and `PublicPageShell`; P-19 `TokenPageShell`, `ImportWizard`, `DeclarationControls`; the concrete `people` import (P-11 stays in `people`; DD-F07); `foundation/i18n` keys.
- **Steps:** 1. The `people` import with `ImportWizard` on `/backend/people/imports` (E02-S04; TEST-F08). 2. `PublicPageShell` with the `vereino:public:*` spots and `club_core`'s widgets on `/p/[clubSlug]` (E02-S05). 3. P-10, `TokenPageShell` and `DeclarationControls` with `/club/d/[token]` (E03-S03; TEST-F07).
- **Independent slices / estimated commits:** (a) import + wizard 3 commits (one PR with E02-S04); (b) public shell 2 commits (one PR with E02-S05); (c) token links 2 commits (one PR with E03-S03).
- **Requirements closed:** REQ-F07, REQ-F08 (the concrete importer), REQ-F14
- **Tests:** TEST-F07, TEST-F08; the consumers' TEST-037, TEST-051 and the phase 2 declaration tests of the club spec
- **Validation:** as above
- **Exit gate:** E02-S04 and E02-S05 acceptance criteria pass; the declaration link flow passes on a fresh tenant; token and public pages checked in light and dark at 375 px.

Deferred by design: P-11 (extracted with the fixtures importer, phase 2), P-12 (extracted with `people:purge-import-rows`), P-21 `Money`, P-22 `CsvExport`, P-23 `CalendarList`, P-24 recurrence helpers (phases 2 and 4). Each enters the inventory through a Changelog row when its second consumer is planned. The social sign-in (`2026-10-27-vereino-social-sign-in.md`) follows phase A1 as its own phases 1–2.

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-F01 | J-F01, every module command | P-01, P-02, `scope_denied`, `optimistic_lock_conflict` | A1 | TEST-F01 | AC-F01 |
| REQ-F02 | J-F01, every list and detail route | P-03, token `vereino.scopeProvider` | A1 | TEST-F02 | AC-F02 |
| REQ-F03 | J-F01 | P-04, P-05, `auth.users.update`, `people:sync-role-expiry` | A1 | TEST-F03 | AC-F03 |
| REQ-F04 | J-F01 | P-07, `auth.users.create`, `email_taken`; `people`'s `account_age_below_threshold`, `account_exists` | A1 | TEST-F04 | AC-F04 |
| REQ-F05 | `/club/profile` consents, role assignments | P-06, P-08, `ValidityColumns`, `ConsentColumns`, `validity_inverted` | A1 | TEST-F05 | AC-F05 |
| REQ-F06 | E02-S02 PESEL, E02-S04 import | P-09 | A1 | TEST-F06 | AC-F06 |
| REQ-F07 | J-F03, `/club/d/[token]` | P-10, `TokenLinkColumns`, `token_link_expired`, `token_link_used` | B | TEST-F07 | AC-F07 |
| REQ-F08 | J-F02, `/backend/people/imports` | the `people` importer (P-11 deferred), `ImportWizard` | B | TEST-F08 | AC-F08 |
| REQ-F09 | `/backend/club/settings` | `club_core_club_settings`, `club_core` settings service, `club_core.settings.updated` (DD-F16) | A1 (with E02-S01) | TEST-F09 | AC-F09 |
| REQ-F10 | `people:sync-role-expiry` (P-12 deferred) | plain worker + registration | A1 | TEST-F03 | AC-F10 |
| REQ-F11 | invitation and reminder e-mails | P-16 | A1 | TEST-F10 | AC-F11 |
| REQ-F12 | every module | P-17, `contracts:check` | A1 | TEST-F01 (codes asserted), `yarn contracts:check` | AC-F12 |
| REQ-F13 | `/club` | P-18 | A2 | TEST-F11 | AC-F13 |
| REQ-F14 | token, public and import pages | P-19, the `vereino:public:*` spots | B | TEST-F07, TEST-F08, club spec TEST-037 | AC-F14 |
| REQ-F16 | `AGENTS.md`, `.ai/review-checklist.md`, `eslint.vereino.mjs` | the boundaries entry | A1 | TEST-F14 | AC-F16 |

## Rollout, Migration, and Rollback

- **Migrations:** none from the foundation (base class and column helpers only); migrations are generated by `yarn db:generate` per consumer, SQL pasted in the PR, applied only with approval; rollback never runs `down()` in production (S14.6).
- **Modules to enable (Ask First):** `scheduler` (`@open-mercato/scheduler`) in phase A1 step 1; `progress` (`@open-mercato/core`) in phase B step 1; both are approvals in `src/modules.ts`, recorded in the run log.
- **Club spec amendments (landed with this spec's PR):** the events row `people.role_assignment.*` ("via `rbacService`" → "via `auth.users.update`", DD-F05); nothing else in the club spec changes for the foundation.
- **Seeds:** `seedRoles` is called from `people`'s `setup.ts` `seedDefaults`; existing tenants run `yarn mercato auth sync-role-acls` after a feature change.
- **Configuration:** `RATE_LIMIT_TRUST_PROXY_DEPTH` set in Railway for the token routes; exact MikroORM pins in `packages/db` and `packages/app` (DD-F17).
- **Observability:** report fingerprints `foundation.scope.provider_failed`, `foundation.roles.catalogue_mismatch`, `club_core.settings.invalid`, `<module>.public_block.failed`; counts logged by every job (S15.1).
- **Rollback:** a helper is rolled back by reverting its PR together with the consumers that PR changed (internal surface, §1); nothing is deployed that a consumer does not use.

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| Over-abstraction before the second consumer (Q2) | primitives shaped for #38 only; churn in phase 2 | the inventory rule (≥ 2 stories), deferral of P-11/P-12, same-PR API changes with `yarn typecheck`, the leading indicator "second consumer adds no API change" | some signatures will still change; accepted within 1.0 |
| `updated_at` lock collisions under concurrent saves within the same millisecond (DD-F04) | a lost update goes unnoticed | TEST-F01's two-writer case asserts one 409; timestamps with microsecond precision in PostgreSQL | negligible for a club-sized load |
| The scope provider in `people` returns too much (the review's fail-open treasurer case) | data leak across sections | the contract's fixed kinds and the concatenation that cannot add a kind; TEST-F02 for every kind; the per-module scope test | provider bugs remain the `people` module's tests to catch |
| Least-privileged-first acting role picks `self`/`guardian` for an administrator acting on her own data (DD-F08) | an audit reader expects `club_admin` | this is the intended reading (DD-07: the role that *allowed* the action); documented in the module README | none |
| `auth.users.update` as the role-sync seam (DD-F05) changes in a platform upgrade | role sync breaks silently | TEST-F03 runs at every upgrade run; the command id and `roles` input are a documented platform contract | an upgrade run revisits P-05 |
| Two MikroORM copies drift (DD-F17) | decorator metadata not shared; discovery breaks | exact pins in both workspaces; the probe-entity SQL test; Renovate from E2 groups the ORM | an upgrade must move both pins together |
| `packages/ui` server-render tests miss browser-only states | a broken interaction ships | TEST-F11 in the real browser at the phase A2 gate | accepted |
| `scheduler` or `progress` approval delayed | the expiry job or the import commit blocked | both are the platform's own modules, already installed; the approval is a `src/modules.ts` change; `progress` moved to phase B so it does not block #38 | none once approved |

## Acceptance Criteria

- [ ] **AC-F01** — Every `people` and `club_core` command in #38, E02-S01 and E02-S02 calls `prepareScoped` from its `prepare`; a cross-organization update returns 403 `scope_denied`, a stale save returns 409 `optimistic_lock_conflict`, one of two concurrent writers gets 409, the audit entry carries the server-derived `acting_role`, and an undo re-checks the current scope.
- [ ] **AC-F02** — A user without a linked person sees empty lists and 403 on details in every module; a coordinator of section A sees A only, in lists and details alike; an administrator declaring her own child's absence is recorded as `guardian`.
- [ ] **AC-F03** — On a fresh tenant the four phase 1 roles exist after one `seedRoles` (from `people`'s setup) and are unchanged after a second; TEST-005 of the club spec passes through `syncAuthRoles` and `people:sync-role-expiry`.
- [ ] **AC-F04** — `people.persons.create_account` refuses a person below the club threshold with 422 (its own code), refuses a second account with 409, sends the invitation in the person's locale through `createAccount`, surfaces a failed invitation e-mail with a working resend, and writes `people_persons.user_id` itself.
- [ ] **AC-F05** — Validity and consents behave as the vocabulary states; a withdrawn consent keeps its row, and the grant and withdrawal dates are in the audit log.
- [ ] **AC-F06** — A field declared with `encryptedField` is ciphertext in the database, searchable through `search_tokens`, deduplicated by its hash sibling, and hidden without the feature.
- [ ] **AC-F07** — A token link is usable exactly once, refused after expiry, invisible from another tenant, carries only the grants it was issued with, and every link request returns 202 whether or not the e-mail exists.
- [ ] **AC-F08** — The people import classifies, reviews and commits rows with progress, refuses a second commit, purges rows after 30 days and never exposes a cell value in an error.
- [ ] **AC-F09** — A club setting reads its default when unset and its default plus a report fingerprint when the stored value is invalid, through `club_core`'s service.
- [ ] **AC-F10** — `people:sync-role-expiry` takes its scope from its registration, logs counts, and running it twice changes nothing; a failed `auth.users.update` is retried.
- [ ] **AC-F11** — Invitation and reminder e-mails render in the person's preferred locale, with the club default and then `en` as fallbacks.
- [ ] **AC-F12** — Every module's error codes come from one `ErrorCodeTable` thrown through `errors(table)`; `contracts:check` stays green.
- [ ] **AC-F13** — `/club` renders the shell with role-aware tiles, the switcher only for ≥ 2 grant kinds, the ward selector only with wards, keyboard-operable, `aria-live` for declaration status, in light and dark at 375 px.
- [ ] **AC-F14** — Token pages, the public page shell with its spots, the import wizard and the declaration controls are shared components with the states listed in *UI and Interaction Contracts*.
- [ ] **AC-F16** — `AGENTS.md` carries the amended extraction rule, `.ai/review-checklist.md` the scope line, and `yarn lint` fails on a route handler that imports `@mikro-orm/*`.
- [ ] Every listed backend surface matches its recorded Open Mercato reference and uses the canonical shell/components, shared API helpers, semantic tokens, and complete loading, empty, error, conflict, keyboard, accessibility, responsive, light-mode, and dark-mode states.
- [ ] Every affected API and UI path has self-contained integration coverage and the configured validation gate passes.

AC-F15 moved to the social sign-in spec (AC-S01…S04); the id is not reused.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | `AGENTS.md`, `.ai/guides/spec-delivery.md`, `backend-ui.md`, `framework-contracts.md`, `contracts.md`, `extensions.md`, the engineering standards (S3, S4, S6, S13, S16), `.ai/review-checklist.md`, skill `om-spec-writing` |
| Data models, APIs, events, UI, and tests are internally consistent | pass | *Requirement Traceability*: REQ-F01…F14 and F16 each with a phase, a test and an AC; ids P-01…P-19 with a status each, DD-F01…F08 and F12, F14…F17, J-F01…F03, TEST-F01…F11 and F14, AC-F01…F14 and F16 defined once; the moved ids (REQ-F15, P-20, DD-F09…F11, F13, TEST-F12/F13/F15, AC-F15) are listed as moved, never reused |
| Every workflow completes end to end without a catch-all integration phase | pass | J-F01…J-F03 complete within phases A1, A2 and B; no "polish" phase |
| Platform-native reuse and extension points were chosen before custom code | pass | *Reuse and Ownership Map*: of the 11 units built in this spec (P-01…P-10, P-18, P-19 minus the deferred ones), 7 extend an installed seam and 4 are app-owned with no installed counterpart (the base class, the scope types, `Validity`, `ConsentRecord`); P-13, P-14 and the first draft's registries were removed in favour of the platform's own shapes |
| UI contracts identify references, canonical components, and theme/state coverage | pass | every surface in *UI and Interaction Contracts* names a reference, components and states; one text mock-up |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | phases A1, A2, B |
| Contracts of installed modules confirmed at the field and behavior level | pass | the API digest of 2026-10-27 (commands, DI, events, setup, scheduler, routes, UI), V-F02 (`auth.users.update` `roles`; `rbacService` has no grant API), and the review spot-checks of 2026-10-27 (`widgets/injection` discovery, `ModuleConfigService`, `WmsScopedEntity`, `packages/db` and `packages/ui` manifests) |
| Architectural review applied | pass | three reviews on 2026-10-27 (scope cohesion, architecture, then contradictions + anti-patterns; `.ai/runs/2026-10-27-foundation-spec.md`): every Critical and High finding applied — `defineScopedCommand` replaced by `prepareScoped`, the public-block registry by injection spots, the settings registry removed in favour of `club_core` (DD-F16), P-13 removed, P-11/P-12 deferred, the lint rule replaced by the checklist and boundaries, grants instead of a scope object with least-privileged-first acting role, E02-S01 and `scheduler` in A1, `progress` in B, the account policy in `people`, one BC regime, one test location |
| User approval for implementation | fail | pending: the product owner's approval on the PR; approval to enable `scheduler` (phase A1) |

Verdict: `Blocked — the product owner's approval of the design on the PR, and approval to enable the scheduler module`

## Open Questions

`om-spec-writing` gate — round 1 (Q1–Q7) and the review questions (Q12–Q15) answered on 2026-10-27 by Władek Kuć; round 2 (Q8–Q11, Q13) now lives in the social sign-in spec as Q-S01…S05:

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q1 | Split: foundation spec vs bundled vs club-spec amendment | Władek Kuć | yes | **A — a separate foundation spec; the club spec stays the feature authority; #38 is the first consumer** — 2026-10-27 |
| Q2 | Extraction rule vs primitives ahead of the second consumer | Władek Kuć | yes | **A — one-time amendment: inventory with ≥ 2 stories and a test** (REQ-F16, DD-F02) — 2026-10-27 |
| Q3 | Home for framework-bound primitives | Władek Kuć | yes | **A — module `foundation` in `packages/app/src/modules/`** (DD-F01) — 2026-10-27 |
| Q4 | Cut for 1.0 | Władek Kuć | yes | **As recommended, then narrowed by the reviews: phases A1, A2, B; P-11/P-12 deferred; P-13/P-14 removed; social sign-in in its own spec** — 2026-10-27 |
| Q5 | Member UI layer | Władek Kuć | yes | **A — thin member layer in `@vereino/ui`** (DD-F12) — 2026-10-27 |
| Q6 | Scope data stays in `people` | Władek Kuć | no | **yes, by default** (DD-F03) — 2026-10-27 |
| Q7 | Primitives carry their own tests and 100 % coverage | Władek Kuć | no | **yes, by default** — 2026-10-27 |
| Q8–Q11 | Social sign-in: scope, mechanism, providers, linking rule | Władek Kuć | yes | **answered 2026-10-27; moved to the social sign-in spec (Q-S01…S04)** |
| Q12 | Does a subscriber wrapper need a `foundation` receipts table for idempotency? | Władek Kuć | no | **no receipts table; the consumer's unique constraint; the wrapper itself was then removed (P-13)** — 2026-10-27 |
| Q13 | May the identity sign-in lookup join the DD-35 list? | Władek Kuć | yes | **yes — D-027; moved to the social sign-in spec (Q-S05)** — 2026-10-27 |
| Q14 | Should phases C–D (social sign-in) become a separate spec? | Władek Kuć | yes | **yes — split into `2026-10-27-vereino-social-sign-in.md`; this spec keeps phases A–B** — 2026-10-27 |
| Q15 | Apply the contradiction and anti-pattern reviews (helpers instead of a command framework, platform widgets and settings, grants, deferrals)? | Władek Kuć | yes | **yes — applied on 2026-10-27 ("Nanieś rekomendowane poprawki i uproszczenia")** |

Contract verifications (performed on 2026-10-27 against the installed 0.9.0 packages; numbered `V-F` so they never collide with the club spec's `V-` series; V-F01, V-F03 and V-F04 moved to the social sign-in spec as V-S01, V-S03, V-S04):

| ID | What to check | Phase | Result |
|---|---|---|---|
| V-F02 | Granting and revoking `auth` roles programmatically | A1 | **Confirmed with a constraint:** `rbacService` has no grant/revoke; `syncUserRoles` is private; the command `auth.users.update` accepts `roles: string[]` (names resolved per tenant) — DD-F05; the club spec's events row that says "via `rbacService`" is corrected in the same PR |
| V-F05 | `react-dom/server` rendering of the member components under `node --test` with the `@open-mercato/ui` primitives (no jsdom) | A2 | **Open — phase A2 step 1 on `MemberPage`;** fallback: a `jsdom` devDependency in `packages/ui` only, with the coverage thresholds unchanged |

## Changelog

| Date | Change |
|---|---|
| 2026-10-27 | Skeleton written by `om-spec-writing` (interactive): TLDR, the Open Questions gate (Q1–Q5 blocking, Q6–Q7 non-blocking), the functionality kinds extracted from the backlog (F1–F16) and the candidate primitive inventory (P-01…P-19). Nothing below the gate was designed yet |
| 2026-10-27 | Gate round 1 answered by the product owner (Q1 = A, Q2 = A, Q3 = A, Q4 as recommended, Q5 = A; Q6, Q7 by default). Gate round 2 opened and answered for the owner's new request — sign-in with Google and Facebook — after checking the installed packages: Q8 = A, Q9 = A, Q10 Google first, Q11 verified-e-mail linking without JIT |
| 2026-10-27 | Full design: Overview with the open-source research, REQ-F01…F16, DD-F01…F13, vocabulary, permissions, reuse map against the API digest of the installed packages, architecture and data flow, journeys, UI contracts, data models, TypeScript contracts, error codes, events, security, TEST-F01…F15, phases A–D with steps, traceability, rollout, risks, AC-F01…F16, compliance report |
| 2026-10-27 | Reviews applied (scope cohesion in fresh context, architectural review): event ids aligned with the club spec and its `rbacService` row corrected (DD-F05); consent columns exactly as the club defines them; e-mail matching at sign-in dropped; P-07 returns `userId`; one scope/acting-role vocabulary; undo semantics; failure modes; P-09 in phase A; package exports classed as internal surfaces (§1) |
| 2026-10-27 | Owner decisions Q13 (yes) and Q14 (yes): the social sign-in moved to `2026-10-27-vereino-social-sign-in.md`; journeys renumbered J-F01…J-F03; this spec keeps phases A–B and 19 primitives |
| 2026-10-27 | Third review round applied (Q15 — contradictions and anti-patterns, two fresh-context reviewers, claims spot-checked in the installed packages): `defineScopedCommand` replaced by `prepareScoped` + `assertInScope` on the platform `CommandHandler`, with a scope source for tokens and markers (DD-F14); `Scope` is a list of grants, commands list allowed kinds least-privileged first, `self_user` grant added (DD-F03, DD-F08); `PublicBlocks` registry replaced by injection spots `vereino:public:<slot>` (DD-F15); `defineClubSettings` removed — `club_core` owns the settings on `club_core_club_settings` with typed defaults (DD-F16); `definePersistentSubscriber` removed (P-13); `ImportPipeline` and `defineScheduledJob` deferred to their second consumer (DD-F07, P-12); the custom lint rule replaced by a review-checklist line and the boundaries rule for `@mikro-orm/*` imports (REQ-F16, TEST-F14); the entity base is an undecorated abstract class with exact MikroORM pins (DD-F17); the account-age policy is applied and its code thrown by `people` (P-07); P-02 repeat = 409/no-op, no "original result"; `seedRoles` called from `people`'s setup; phase A split into A1 (kernel with #38, E02-S01 and `scheduler` as dependencies) and A2 (member layer with E02-S03), `progress` moved to phase B; one BC regime (internal surfaces, same-PR change); one test location; counts corrected (4 app-owned units); `club_core.settings.updated` keyed by `updated_at`; V-F05 added for the `packages/ui` test approach |
