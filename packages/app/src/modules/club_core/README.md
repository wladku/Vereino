# `club_core` — the club, its settings, sections, places and institutions

Phase A1 of the foundation spec ([`.ai/specs/2026-10-27-vereino-foundation-primitives.md`](../../../../../.ai/specs/2026-10-27-vereino-foundation-primitives.md), Q17) added the settings issue #38 needed; issue #25 (E02-S01, club spec phase 1 step 2 — [`.ai/specs/2026-10-20-vereino-club-management.md`](../../../../../.ai/specs/2026-10-20-vereino-club-management.md), *Data Models* → `club_core`, DD-02, DD-37, TEST-001, TEST-032) adds the DD-37 settings, sections, places and institutions. The public slug, publication, logos and public section fields arrive with steps 6–7; coach contracts wait for A05.

| Surface | Contents |
|---|---|
| Entities | `ClubSettings` / `club_core_club_settings` (one row per organization, created by the first update): `own_account_min_age` (16), `default_locale` (`pl`), `timezone` (`Europe/Warsaw`), `short_name`, `currency` (`PLN`), `declaration_kinds` (training `absence_only`, the others `confirm`), `online_fee_mode` (`club_pays`), `online_fee_percent` (0), `online_fee_fixed` (0, grosz), `coach_settlement_model` (`units_per_contract`, stored only), `show_called_up_children` (`none`), `order_sales_document` (`none`, the only value accepted in 1.0); `Section` / `club_core_sections` (`name`, `description`, `is_active`); `Place` / `club_core_places` (hierarchy through `parent_place_id`, `kind`, `name`, `surface`, `address`, `geo_lat`/`geo_lng`, `description`, `owner_institution_id`, `managed_by_club`, `is_external`, `rented_by_club`, `capacity_groups` ≥ 1, `contacts`, `is_active`); `Institution` / `club_core_institutions` (`name`, `type`, `address`, contact, `bank_account`, `notes`) |
| Encryption | `encryption.ts`: `club_core_places.contacts` (JSON text of `{ role, name, phone }[]`), `club_core_institutions.contact_name|contact_phone|contact_email|bank_account|notes`; no hash siblings |
| Pure logic | `lib/settings.ts` (Zod schema and default per setting, `resolveClubSettings`, `applyClubSettingsPatch`), `lib/places.ts` (`wouldCreateCycle`, `bookablePlaceProblem`, contacts), `lib/error-codes.ts` |
| DI | `clubCoreSettings` (`get(scope) → { values, defaultsApplied, updatedAt }`; reports `club_core.settings.invalid`); `clubCorePlaces` (`assertBookableLeaf(scope, placeId, em?)` — 404 unknown place, 422 `place_not_bookable` for a place with live children; for the session and booking commands of phases 2 and 5); `clubCoreDirectory` (`findSections(scope, ids, em?)`, `findInstitutions(scope, ids, em?)` — live sections with `isActive` and institutions by id, for `groups`, #30; `findPlaces(scope, ids, em?)`, `placeFamily(scope, placeId, em?)` — a place with its ancestors and descendants — and `placeOptions(scope, em?)`, for `activities`, #31) |
| Commands | `club_core.settings.update`; `club_core.sections.create|update|delete`; `club_core.places.create|update|delete`; `club_core.institutions.create|update|delete` — all undoable, `authorizeScoped` with the `club_admin` grant |
| Routes | `GET`/`PUT /api/club_core/settings` (`club_core.view` / `club_core.manage`); CRUD `/api/club_core/sections`, `/places`, `/institutions` (`GET` with `club_core.view`, writes with `club_core.manage`; delete is `DELETE ?id=` with the lock header); `GET /api/club_core/options/places` (`club_core.view`; names, parent, capacity and the leaf flag of the active places for selectors — every coordinator and the club administrator, #31) |
| Pages | `/backend/club/settings` (`pageContext: 'settings'`), `/backend/club/sections` (+ `create`, `[id]/edit` with the coordinators panel), `/backend/club/places` (+ `create`, `[id]/edit`), `/backend/club/institutions` (+ `create`, `[id]/edit`) |
| Events | `club_core.settings.updated`, `club_core.section|place|institution.created|updated|deleted` (ids only) |
| CLI | `yarn mercato club_core check-bookable-place --tenant --org --place` → `{ bookable, status?, code? }` (the leaf rule through `clubCorePlaces`) |
| ACL | `club_core.view`, `club_core.manage` (implies view); seeded on `vereino_club_admin` (`club_core.*`) and `vereino_coordinator` (`club_core.view`) by the role catalogue that `people` seeds |
| Error codes | `place_hierarchy_cycle` 422, `place_reference_invalid` 422, `place_not_bookable` 422, `place_has_children` 409, `institution_in_use` 409; the foundation's `locale_unsupported` 422 for a `default_locale` the app does not serve (#27) |

## Scope

Club settings are organization-wide: read with the feature, written by the club administrator. Sections are listed through `scopeWhere` with the kinds `coordinator` (column `id`, the coordinator's `section_ids`) and `club_admin`; places and institutions carry no section, so only the club administrator's grant lists them (a coordinator gets an empty list; the option-source routes of the club spec arrive with their first consumer in phase 2). Every write is the club administrator's.

## Coordinators

Coordinators are `people` role assignments (`coordinator` + `section_id`); `club_core` never stores or imports them. `people` owns the response enricher `people.section-coordinators` on the section list (`enrichers.entityId: 'club_core:section'`), which adds `_people: { coordinators, coordinatorMissing }` — current and future assignments with the person's name, and a warning flag for an active section without an active coordinator (the section still works). The section edit page assigns and ends coordinators through `/api/people/role-assignments`.

## Places

A parent must be a live place of the club and must not be the place itself or a descendant (422 `place_hierarchy_cycle`); hierarchy writes of a club take a transaction-scoped advisory lock, so two concurrent moves cannot close a loop. A place with live children is not deleted (409), and an institution that owns a live place is not deleted (409).

## Deferred

Deleting or deactivating a section that has groups (409, `groups`, phase 2); deleting a place with sessions or bookings (`activities`, `facilities`); public slug, publication, logos and public fields (steps 6–7); `opening_hours` (V-7), regulations, `is_public_schedule`, `accepts_online_requests`; coach contracts (A05); `search.ts` (no club_core entity is listed for search, and a global-search index of sections would bypass the coordinator's record scope).
