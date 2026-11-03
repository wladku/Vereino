# Vereino — UX parity for phases 1–3: people, sections and places lists

**Date**: 2026-11-03
**Status**: Ready for implementation — the product owner gave the go on 2026-11-03 ("Yes, mark it Ready"); Q-U10 was confirmed in PR #131 and the other autonomous defaults stand. V-U01 stays non-blocking (fallback defined). Applying the two `club_core` migrations (DD-U05) remains Ask First at implementation time (`AGENTS.md`)

> Use `om-spec-writing` for every new application, multi-module feature, or other non-trivial business slice. Keep every section below; write `N/A — {reason}` when a section does not apply. Change the status to `Ready for implementation` only after every blocking open question is resolved and the traceability table covers every requirement.

Sources: epic E06 #82 and its stories E06-S01 #83, E06-S03 #85, E06-S04 #86. The gap analysis of 2026-11-03 compared the clickable mockup with `main` (`db2bd67`), and the owner approved its filing the same day. Design authority for the screens: `docs/ux-concept/README.md` (B-04, B-05, B-06, B-09) and the mockup `docs/ux-concept/mockups/app.ts` (`screenSections`, `screenSection`, `screenPlacesAdmin`, `screenPersons`). This spec is an addendum to `.ai/specs/2026-10-20-vereino-club-management.md`, phase 1, whose requirements it completes; it does not change that spec's status or phases. Ids carry the letter **U** (`REQ-U01`, `DD-U01`, `TEST-U01`, `AC-U01`, `J-U01`) so they never collide with the club spec's global ids (D-028).

## TLDR

Three panel lists that phase 1 shipped with search only get what the mockup shows:

- **People (B-09)** gets filters for section, group, role, account and age, plus the perspectives All / Staff / Children / Without account, and the columns Roles, Groups, Guardians and Age.
- **Sections (B-04/B-05)** get group counts, a public flag and a guarded deactivation (409 while active groups remain). The section page gets addressable tabs and a short description, and section names become 2–80 characters and unique.
- **Places (B-06)** get kind, parent and active filters, an owner column, the hierarchy in the name cell, and regulations and photos.

Everything reuses the platform's `makeCrudRoute`, `DataTable`, `CrudForm`, response enrichers, the `attachments` partition and the optional-DI pattern already used by `people` ↔ `groups`.

## Problem Statement

Phase 1 delivered the people register, sections and places with the club spec's minimum: "search by last name" on people, plain lists elsewhere. The product owner compared the running sandbox with the clickable mockup: "sections, places, settings and many other things, like filters on people or facilities, are missing — we must specify everything that was in the mockup and prepare it for implementation" (the product owner, 2026-11-03). The gap analysis confirmed it (`git show db2bd67`):

- **People (`people/components/PersonsTable.tsx`):**
  - the list has search and pagination only;
  - `personListQuerySchema` (`people/data/validators.ts:165-173`) knows `lastName` and `hasAccount` only;
  - an administrator cannot list "Basen children without an account" or "our coaches" without opening records one by one.
- **Sections (`club_core/components/SectionsTable.tsx`):**
  - the list shows neither how many groups a section has nor whether it is public;
  - deactivation is an `isActive` checkbox with no guard, although `groups_groups.section_id` is NOT NULL and `club_core/commands/sections.ts:2-4` says "the 409 rule arrives with groups";
  - names allow 1–200 characters and duplicates.
- **Places (`club_core/components/PlacesTable.tsx`):**
  - the list has a search box only, although the list API already accepts `kind`, `parentPlaceId` and `isActive` (`club_core/data/validators.ts:153`);
  - the owner institution and the hierarchy are not visible;
  - the place has no regulations or photos (`club_core/data/entities.ts:238-242`: "arrive later").

Who has it: the club administrator; a section coordinator (club-wide basic people read, own sections' public content).

## Overview and Success Measures

- **Primary outcome:** each of the three administrator questions below is answered from one list in at most two filter choices, without opening records:
  - "which children of section X have no account";
  - "who are our coaches";
  - "which places belong to the municipality".
- **Leading indicators:** use of the new filters and perspectives (URL query parameters in access logs); no section deactivated while it still has active groups (`section_has_active_groups` count stays at zero in the data).
- **Baseline:** none of the three questions can be answered from a list today (verified against `db2bd67`).
- **Market / product reference:**
  - **Adopted:** SportBM and ProTrainUp people lists (filter by group, role and account; studied in E01-T05 #15) and Open Mercato's own `customers` people list (perspectives, filters in the URL, enriched columns).
  - **Rejected:** saved custom views. Perspectives cover the four views the mockup names.

## Goals

- **REQ-U01** — An administrator or coordinator narrows the people register by section, group, role, account and age, switches between the perspectives All / Staff / Children / Without account, searches by first or last name, and sees each person's roles, groups, guardians and age, all within their existing read scope (closes E06-S01 #83; completes club spec REQ-001 and REQ-003 on B-09).
- **REQ-U02** — An administrator sees each section's number of active groups and public state, cannot deactivate or delete a section that still has active groups, and edits a section on tabs addressable by URL. A section has a short description for its public tile and a unique name of 2–80 characters (closes E06-S03 #85; completes REQ-003, REQ-025).
- **REQ-U03** — An administrator filters places by kind, parent and active state, sees the owner institution and the hierarchy, and records regulations and photos on a place (closes E06-S04 #86; completes REQ-003).

## Non-goals

- Export, bulk actions and saved custom views on these lists (not in the mockup).
- Sorting the people list by name: names are encrypted without a sortable index (`people/encryption.ts:11-18`), and the list keeps its `createdAt` default.
- Widening any read scope: coordinators keep the club-wide **basic** read; a coach still reads only themselves in the panel.
- Public use of place photos and regulations, and the place fields "public schedule" and "accepts requests". Both are phase 5 (`.ai/specs/2026-10-27-vereino-facilities.md`, E08-S04 #124).
- The person record's Groups tab (E06-S02 #84) and the dashboard widget (E06-S06 #88): their own stories, built on the existing memberships API and the existing coordinators enricher.
- Treasurer and facility-operator roles in the role filter (phases 4 and 5).

## Proposed Solution

**People.** The list route stays a `makeCrudRoute`. Its query schema gains optional parameters that narrow the candidate set before the CRUD query runs:

| Parameter | Values / meaning | Owner of the predicate |
|---|---|---|
| `search` | first or last name | `people` |
| `sectionId` | section | `groups` (memberships, through the contract) plus `people` (role assignments scoped to the section) |
| `groupId` | group | `groups`, through the contract |
| `role` | `club_admin`, `coordinator`, `coach`, `guardian` or `participant` | `people` (assignments, guardianships) plus `groups` (memberships) |
| `hasAccount` | with or without an account | `people` |
| `ageFrom`, `ageTo` | age range | `people` |
| `view` | `all`, `staff`, `children` or `no_account` | `people` |

Predicates over `people` data (roles, guardianships, account, birth date) are resolved by `people`. Predicates over memberships are resolved by `groups` through a new optional DI contract, **`groups.personFilter`**. `people` declares its interface and token, and `groups` registers it. This is the same direction as `groups.membershipContribution`, declared in `people/services/membership-contribution.ts:11` and registered at `groups/di.ts:33`. The contract returns the matching person ids, which `people` intersects into the existing `ids` filter.

The new columns come from two places:
- the route's own list hook (`transformItem`) adds roles, "has wards" and guardian names. This is `people`'s own data, so it needs no cross-module seam;
- a `groups` response enricher on `people:person`, `groups.person-groups`, adds the active group names. The persons route opts in to enrichers with `enrichers: { entityId: PERSON_ENTITY_ID }`, as the sections route does (`club_core/api/sections/route.ts:47`).

When `groups` is not enabled, the group-based filters answer 400 `people_filter_unavailable`, the Groups column is absent, and everything else works.

**Sections.** A new optional DI contract **`groups.sectionUsage`** answers "active groups of section X". `club_core` declares its interface, `groups` registers it, and it takes the caller's `EntityManager` like the existing contributions.

The guard runs in three places:
- the section update command before `isActive → false`;
- the delete command before a soft delete;
- the undo of either command, before a state that would deactivate the section.

Each lock the section row (`PESSIMISTIC_WRITE`) and then refuse with 409 `section_has_active_groups`, listing the groups. On the other side, `groups` locks the section row `FOR SHARE` when it creates or activates a group (DD-U08), so the two cannot interleave.

The rest of the section changes:
- a `groups` enricher on `club_core:section` adds `_groups.activeGroupCount`, using the same seam as `people.section-coordinators`;
- a new nullable column `short_description`, edited through the existing public-content command (`sectionPublicUpdateSchema`), so the section's coordinator edits it like the other public texts;
- a case-insensitive unique index on the live section names, built in its own concurrent migration (DD-U05);
- a section-only name schema, enforced in the command (DD-U07);
- the edit page moves its existing panels into three tabs synced with `?tab=`.

**Places.** The page exposes the three existing API filters, and the list response gains the owner's name, resolved inside `club_core`. The name cell shows the hierarchy. A nullable `regulations_text` column and a link table `club_core_place_files` hold the regulations PDF and photos. They copy the section-materials pattern: `readCheckedUpload` byte checks, `createScoped` in `privateAttachments`, and `persistLink`.

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-U01** Group-based people filters resolve to ids in `groups` and are intersected in `people` | Keeps the dependency `groups` → `people`; `people` never imports `groups` (club spec module boundaries) | A SQL join from the `people` route to `groups_memberships` | Crosses module ownership; breaks when `groups` is disabled |
| **DD-U02** Cross-module columns come from response enrichers. The module's own columns come from the route's list hook | Enrichers are the established cross-module seam (`people/data/enrichers.ts`); a module needs no seam for its own data. The persons route opts in to enrichers | Every column as an enricher | An enricher on one's own entity adds a seam without a boundary |
| **DD-U03** Perspectives are a `view` query parameter mapped to filters on the server. The page renders them as app-owned tabs above `DataTable`, synced with the URL | One source of truth; a shareable URL; the same scope rules. `DataTable`'s `perspective` prop (`example/components/TodosTable.tsx:298`) stores saved per-user views, which is a non-goal, and no Vereino table syncs filters to the URL yet (`ActivitiesTable` keeps them in `useState`) | Client-only tabs over the loaded page; the platform's saved perspectives | Wrong counts with paging; saved views are out of scope |
| **DD-U04** Section deactivation is blocked while active groups exist (no cascade) | README B-04 "deactivating a section with groups → 409 with the list of groups"; reversible; no hidden side effects on schedules | Cascade-deactivate the groups | Ends memberships and sessions silently; hard to undo |
| **DD-U05** Name uniqueness is a partial unique index on `(organization_id, lower(name))` over live sections. It is built `CONCURRENTLY` in its own idempotent migration with `lock_timeout = '5s'`, after an in-migration duplicate check that fails with the list of duplicates (`BACKWARD_COMPATIBILITY.md` §5). Unique violations (23505) map to 409 in the commands and their undo | Race-free; follows §5 | A check in the command only | Races between two administrators |
| **DD-U06** Place files reuse the section-materials pattern in a new link table | Proven byte checks and scoped reads; private by default | A JSON array of attachment ids on the place | No per-file scope or kind; harder to clean up |
| **DD-U07** The section name rule (2–80) is a **breaking narrowing** under `BACKWARD_COMPATIBILITY.md` §2. Its migration path: a section-only schema (the shared `nameSchema` at `club_core/data/validators.ts:12` stays 1–200 for places, institutions and materials). The command enforces 2–80 only on create and when the submitted name differs from the stored one. Stored longer names keep loading and saving | The edit form resends `name` on every save, so a zod-only rule would break untouched records | Truncate or reject existing long names; narrow the shared schema | Data loss; breaks places and institutions |
| **DD-U08** The deactivation guard and group creation serialize on the section row. `club_core` takes `PESSIMISTIC_WRITE` in update, delete and their undo; `groups` takes `FOR SHARE` when it creates or activates a group | Closes the race between deactivating a section and creating a group in it | Re-read without a lock | Both commits can succeed and leave an inactive section with an active group |

## Domain Vocabulary and Business Rules

| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| Staff (perspective) | A person with an active `people_role_assignments` row (`club_admin`, `coordinator`, `coach`) or an active `coach`/`assistant` membership on today's date in the club time zone | `people`, `groups` | Without `groups`: assignments only |
| Children (perspective) | A person whose age today in the club time zone is under 18 (a minor); a person without a birth date is excluded. Not the R10 account threshold, which decides only who may hold an account | `people_persons.birth_date` (plain `date`) | — |
| Without account (perspective) | `user_id IS NULL` | `people` | — |
| Age filter | Inclusive range `ageFrom`–`ageTo` in whole years today, translated to birth-date bounds; a person without a birth date is excluded when either bound is set | `people` | 400 when `ageFrom > ageTo` or outside 0–120 |
| Role `guardian` | An active guardianship as guardian on today's date | `people_guardianships` | — |
| Role `participant` | An active `participant` membership today | `groups` | 400 `people_filter_unavailable` without `groups` |
| Role `coach` | An active `coach` role assignment, or an active `coach`/`assistant` membership | `people`, `groups` | Without `groups`: assignments only |
| Section filter | An active membership in a group of the section, or an active role assignment scoped to that section | `groups`, `people` | 400 `people_filter_unavailable` without `groups` |
| Active group of a section | `groups_groups.section_id = X`, `is_active = true`, `deleted_at IS NULL` | `groups` | — |
| Section deactivation guard | `isActive → false`, a soft delete, or an undo that results in either, is refused while the section has an active group; the section row is locked first (DD-U08) | `club_core` command via `groups.sectionUsage` | 409 `section_has_active_groups`, `details.groups: [{ id, name }]` (at most 20 listed, plus `total`) |
| Section name | Trimmed; 2–80 characters on create and when the submitted name differs from the stored one (DD-U07); unique case-insensitively among the club's live sections (inactive ones included), also on undo and restore | `club_core_sections` | 422 `section_name_length`; 409 `section_name_taken` |
| Short description | Plain text, at most 160 characters, nullable; edited through the public-content command by the administrator or the section's coordinator; shown on the public club page tile when the section is public | `club_core_sections.short_description` | 422 on length |
| Place file | A photo (PNG, JPEG or WebP ≤ 5 MB, at most 10 per place, counted under a lock on the place row) or one regulations PDF (≤ 10 MB) linked to a place | `club_core_place_files` + `attachments` | 422 `place_file_format_unsupported`, `place_file_too_large`, `place_photos_limit_reached` (naming as `club_core/api/uploads.ts:31-36`); a second regulations PDF replaces the first |

## Users, Permissions, and Scope

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| Club administrator | All three lists with every filter; deactivate sections; edit place files | Club-wide (`club_admin` grant) | `people.view`, `club_core.view`, `club_core.manage` |
| Section coordinator | People list with every filter (basic fields only); sections list (read) | People: club-wide **basic** read, unchanged (`people/api/shared.ts:15-18`); no e-mail, phone, notes or PESEL in rows, filters or enrichers | `people.view`, `club_core.view` |
| Coach without other roles | Unchanged: only themselves in the people list | `self` grant | `people.view` when granted |

`tenantId` and `organizationId` come from the authenticated context through `makeCrudRoute` and the commands; the two DI contracts take them as arguments and never read system scope. A filter never widens the candidate set: the ids returned by `groups.personFilter` are intersected with the actor's scope, never unioned.

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Existing module or new module | Integration seam | Why |
|---|---|---|---|---|
| People list query | extend | `people` | `makeCrudRoute` query schema + list hook | Owns persons, assignments, guardianships |
| Membership predicates | app-own, new contract | `groups` provides, `people` consumes | DI `groups.personFilter` (`hasRegistration`) | `people` must not import `groups` |
| Group names on persons | app-own | `groups` | Response enricher `groups.person-groups` on `people:person` | Same seam as `people.section-coordinators` |
| Roles, guardians, "has wards" | app-own | `people` | The persons route's list hook (`transformItem`), batch per page with decryption | Own data needs no cross-module seam |
| Section usage | app-own, new contract | `groups` provides, `club_core` consumes | DI `groups.sectionUsage` (`hasRegistration`) | `club_core` must not import `groups` |
| Active group count | app-own | `groups` | Response enricher `groups.section-groups` on `club_core:section` | — |
| Place owner name | extend | `club_core` | List hook joining `club_core_institutions` (same module) | Same module; no seam needed |
| Place files | reuse | `attachments` | `createScoped` / `readScoped` in `privateAttachments`, `persistLink` | Same as section materials |
| Tables and forms | reuse | Open Mercato UI | `DataTable` filters (`activities/components/ActivitiesTable.tsx:142-217`), `CrudForm`; the perspective tabs are an app-owned tablist above `DataTable` (DD-U03) | Canonical primitives |

## Architecture and Data Flow

```text
B-09 PersonsTable -> GET /api/people/persons?view&search&sectionId&groupId&role&hasAccount&ageFrom&ageTo
                       -> people list hook: own predicates (assignments, guardianships, account, birth date)
                       -> groups.personFilter (optional DI) -> person ids -> intersect into `ids`
                       -> makeCrudRoute query (scope as today)
                       -> list hook: roles, guardians, has wards (people)
                       -> enricher: groups.person-groups (optional; the route opts in to enrichers)

B-04 SectionsTable -> GET /api/club_core/sections -> enrichers: people.section-coordinators (existing), groups.section-groups (new)
Deactivate/Delete  -> club_core.sections.update|delete (and undo) -> lock section row -> groups.sectionUsage.activeGroupsOf(em, sectionId) -> 409 or save
Group create/activate -> groups command -> lock section row FOR SHARE -> group_section_inactive (422) when inactive

B-06 PlacesTable   -> GET /api/club_core/places?kind&parentPlaceId&isActive -> owner name from club_core_institutions
Place files        -> POST/DELETE /api/club_core/places/{id}/files -> readCheckedUpload -> attachments (privateAttachments) + club_core_place_files
```

- **Module boundaries:** `groups` provides four new contributions (two DI services, two enrichers) and changes one of its own commands (the `FOR SHARE` lock on the section in group create and activate). `people` and `club_core` declare the contracts they read and degrade when `groups` is absent; neither imports `groups`.
- **Extension points:** response enrichers (`data/enrichers.ts`, auto-discovered), DI registrations (`di.ts`), list hooks of `makeCrudRoute`.
- **Alternatives considered:** a shared read model or a search index for people. That is heavier than a small club needs (hundreds of people), and it is rejected.
- **Compatibility:**
  - **Additive changes:** optional query parameters, new response fields (`roles`, `hasWards`, `guardians`, `_groups`, `shortDescription`, `ownerName`, `regulationsText`), nullable columns, a new table, new error codes and new DI tokens (`BACKWARD_COMPATIBILITY.md`).
  - **Two breaking narrowings, each with its path:**
    - the section name rule: section-only schema, enforced on create and rename only (DD-U07);
    - section uniqueness: a concurrent index after an in-migration duplicate check (DD-U05).
  - **Undo:** the undo of section update and delete gains the guard and the 409 mapping; it never succeeds into a state the forward command would refuse.

## User Journeys

### Journey J-U01 — An administrator finds the Basen children without an account

1. Aneta opens `/backend/people/persons` and chooses the perspective **Children**, then the filter Section = Basen.
2. The URL becomes `?view=children&sectionId=…`. The list shows the Basen children with their age, groups and guardians.
3. She adds "Without account" (`hasAccount=false`) and sends the link to the coordinator, who sees the same rows with basic fields.
4. If `groups` is disabled, the section and group filters are not offered; a hand-made URL with `sectionId` answers 400 `people_filter_unavailable`, and the page shows "This filter needs the groups module".

### Journey J-U02 — An administrator tries to deactivate a section that still has groups

1. Aneta chooses **Deactivate** on the Basen row in `/backend/club/sections` and confirms.
2. The command finds two active groups and answers 409 `section_has_active_groups`. The dialog lists "Basen — początkujący" and "Basen — zaawansowani" with links to the groups, and the section stays active.
3. She deactivates both groups (`/backend/groups/groups/{id}`), retries, and the section becomes inactive. The list shows the "inactive" status and Groups = 0.

### Journey J-U03 — An administrator records the Orlik regulations and photos

1. Aneta filters `/backend/club/places` by kind "pitch". The list shows "↳ Boisko piłkarskie" under "Orlik" with the owner "Gmina Przykładowo".
2. On the place form she pastes the regulations text, uploads the PDF and two photos.
3. An SVG renamed `.png` answers 422 `place_file_format_unsupported` on the field; a stale save answers 409 with the shared conflict dialog.

## UI and Interaction Contracts

The closest installed references: `activities/components/ActivitiesTable.tsx` (DataTable `filters`, `filterValues`, `onFiltersApply`, `onFiltersClear`, `FilterDef` with `loadOptions`); `people/components/PersonRecord.tsx` (tabs; also the model for the app-owned perspective tablist of DD-U03); `club_core/components/SectionMaterialsPanel.tsx` (file list with upload and remove). `DataTable`'s own `perspective` prop (`example/components/TodosTable.tsx:298`) is not used: it stores saved per-user views, a non-goal. `.ai/guides/backend-ui.md` applies; implementation invokes `om-backend-ui-design`.

| Surface / route | Purpose and primary actions | Data source / mutations | Closest installed reference | Canonical shell / components | Required states | Requirement IDs |
|---|---|---|---|---|---|---|
| `/backend/people/persons` | Filter, switch perspective, search, open a record, "Add person" | `GET /api/people/persons` | `ActivitiesTable.tsx` (filters), `PersonRecord.tsx` (tablist) | `Page`, `PageBody`, `DataTable` (filters), an app-owned perspective tablist (DD-U03), `StatusBadge`, `EmptyState` | loading, empty ("Add the first person or family" + Add person), filtered-empty ("No people match" + Clear filters), error + retry, 400 filter message, 403 | REQ-U01 |
| `/backend/club/sections` | Columns Groups and Public; row action Deactivate; Add section | `GET /api/club_core/sections`, `PUT /api/club_core/sections` | `SectionsTable.tsx` | `DataTable`, `RowActions`, `useConfirmDialog`, `StatusBadge`, `EmptyState` | loading, empty ("The club has no sections yet" + Add section), error, 409 groups dialog, success flash | REQ-U02 |
| `/backend/club/sections/[id]/edit` | Tabs Details / Coordinators / Public page; short description; name rules; coordinator end date | `GET/PUT /api/club_core/sections`, role assignments | `PersonRecord.tsx` tabs, `SectionForm.tsx` | `CrudForm`, platform tabs | loading, error, 409 conflict, 409 name taken on the field, 422 length | REQ-U02 |
| `/backend/club/places` | Filters kind, parent, active; columns Owner and hierarchy | `GET /api/club_core/places` | `ActivitiesTable.tsx` | `DataTable`, `StatusBadge` | loading, empty ("Add the first facility"), filtered-empty, error | REQ-U03 |
| `/backend/club/places/[id]/edit` | Regulations text and PDF; photos | `PUT /api/club_core/places`, `POST/DELETE /api/club_core/places/{id}/files` | `SectionMaterialsPanel.tsx` | `CrudForm`, file list | upload progress, 422 per file, 409 conflict | REQ-U03 |

### UI architecture

| Role | Navigation groups in order | Dashboard / injected widgets | Login-to-primary-task flow |
|---|---|---|---|
| Club administrator | People → People; Club → Sections, Places (unchanged) | none in this spec (E06-S06 #88) | `/backend` → People → perspective → filter: 3 clicks |
| Section coordinator | People → People; Club → Sections | none | `/backend` → People → filter Section: 3 clicks |

| Surface / widget | Empty state guidance and action | Responsive behavior | Keyboard / focus behavior |
|---|---|---|---|
| People list | "Add the first person or family" + Add person; with filters: "No people match" + Clear filters | Filters collapse into the DataTable filter drawer under 768 px; columns Groups and Guardians hide under 640 px | Perspective tabs are a tablist (arrow keys); filters apply with Enter; focus returns to the table after Apply |
| Sections list | "The club has no sections yet" + Add section | Groups and Public stay; logo column hides under 640 px | Deactivate opens a confirm dialog (Escape cancels, Ctrl/Cmd+Enter confirms) |
| Section page tabs | — | Tabs scroll horizontally on narrow screens | Tablist with `aria-selected`; `?tab=` updates without a reload |
| Places list | "Add the first facility" + Add place | Owner hides under 640 px | — |

### `/backend/people/persons` — People

```text
┌──────────────────────────────────────────────────────────────────────┐
│ People                                                [Add person]  │
│ [All] [Staff] [Children] [Without account]        🔍 First or last name│
│ Filters: Section ▾  Group ▾  Role ▾  Account ▾  Age from [ ] to [ ]  │
├──────────────────────────────────────────────────────────────────────┤
│ Person ↗          Age  Roles                 Groups        Account Guardians │
│ Kowalski Jan       9   —                     Żaki, Basen   no      Kowalska Kasia │
│ Kowalska Kasia    38   [Guardian]            —             yes     —       │
│ Nowak Wojtek      41   [Coach][Coordinator]  Żaki (coach)  yes     —       │
├──────────────────────────────────────────────────────────────────────┤
│ ‹ 1 2 3 ›                                              25 per page   │
└──────────────────────────────────────────────────────────────────────┘
```

- **Behavior:**
  - The perspective and the filters are in the URL, so the page restores them on reload and the browser's back button works.
  - The Section and Group options come from `/api/club_core/sections` and `/api/groups/groups`. Role is a fixed list.
  - The perspective combines with the filters (AND).
  - A person appears once, whatever the number of matching memberships.
  - The name cell reads "Last First" and links to the record.
- **Responsive and accessibility:** role badges carry text, never colour alone; the age column is right-aligned and numeric.
- **Localization:** `people.persons.filters.*`, `people.persons.views.*`, `people.persons.columns.*` in en and pl.
- **Design-system and theming:** `StatusBadge` variants only; no hard-coded colours; checked in light and dark mode.

### `/backend/club/sections` and `/backend/club/sections/[id]/edit` — Sections

```text
┌────────────────────────────────────────────────────────────────────┐
│ Sections                                            [Add section]  │
├────────────────────────────────────────────────────────────────────┤
│ Logo  Section   Coordinators   Groups  Public  Status   [⋯]          │
│ [B]   Basen     Aneta K.            2  yes     active   Edit · Deactivate │
│ [S]   Szachy    ⚠ no coordinator    0  no      inactive Edit · Activate   │
└────────────────────────────────────────────────────────────────────┘
Section page: [Details] [Coordinators] [Public page]   (?tab=details|coordinators|public)
Details: Name* · Internal description · Logo
Public page: Public ✓ · Slug · Short description (≤160, "shown on the club page tile") · Public description · Terms · Contact · Materials
(the short description sits on the Public page tab because the public-content command saves it, which the section's coordinator may run — Q-U10)
```

- **Behavior:**
  - **Deactivate** opens a confirmation. On 409 the dialog turns into the list of active groups, linked to the groups, with the text "Deactivate these groups first". **Activate** is the reverse and has no guard.
  - Delete keeps its confirmation and gains the same guard.
  - The Coordinators tab gains an optional "until" date in the assign dialog.
- **Localization:** `club_core.sections.*` additions in en and pl.

### `/backend/club/places` — Places

```text
┌────────────────────────────────────────────────────────────────────┐
│ Places                                                  [Add place] │
│ Filters: Kind ▾  Parent ▾  Active ▾                    🔍 Search    │
├────────────────────────────────────────────────────────────────────┤
│ Place                         Kind    Owner                Capacity │
│ Orlik                         complex Gmina Przykładowo        —    │
│   ↳ Boisko piłkarskie         pitch   Gmina Przykładowo        2    │
│ Szkoła nr 3 — sala [External] hall    Szkoła nr 3              1    │
└────────────────────────────────────────────────────────────────────┘
Place form, new group "Regulations and photos": regulations text · regulations PDF (one) · photos (up to 10)
```

- **Behavior:**
  - Within a page, rows are ordered parent first, then children by name; a child whose parent is on another page shows the parent's name after the arrow.
  - The **External** badge reflects `is_external`. Owner shows the institution name, or "—" when none is set.

## Data Models

### `club_core_sections` (changed)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `short_description` | `varchar(160)`, nullable | — | no | plain text, trimmed; empty → null |
| `name` | unchanged column | new partial unique index `club_core_sections_org_name_unique` on `(organization_id, lower(name)) WHERE deleted_at IS NULL` | no | 2–80 on create and when the submitted name differs from the stored one (DD-U07) |

### `club_core_places` (changed)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `regulations_text` | `text`, nullable | — | no (public rules, no personal data) | at most 20 000 characters |

### `club_core_place_files` (new)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `id` | UUID, required | primary key | no | immutable |
| `tenant_id` / `organization_id` | UUID, required | `(organization_id, place_id, kind)` | no | trusted context only |
| `place_id` | UUID, required | FK by id to `club_core_places` | no | the place must be live |
| `attachment_id` | UUID, required | unique | no | `attachments` record in `privateAttachments`, owner `club_core:place`, assignment `club_core:place_file` |
| `kind` | `varchar(16)`: `photo` \| `regulations` | partial unique `(organization_id, place_id) WHERE kind = 'regulations' AND deleted_at IS NULL` | no | — |
| `position` | `integer`, required | — | no | photo order, 0-based |
| `created_at`, `deleted_at` | timestamps | — | no | soft delete; the attachment is removed with the link |

No changes to `people_persons`, `people_role_assignments`, `people_guardianships` or the `groups` tables. Migrations are generated with `yarn db:generate`; applying them is Ask First (`AGENTS.md`).

## API, Command, and Error Contracts

| Method / command | Path / ID | Auth and feature gate | Input | Success response / event | Errors and concurrency | Requirement IDs |
|---|---|---|---|---|---|---|
| `GET` (`makeCrudRoute`, extended) | `/api/people/persons` | auth + `people.view`; scope unchanged | existing params + `view`, `search` (2–80), `sectionId`, `groupId`, `role`, `ageFrom`, `ageTo` (0–120) | `{ items, total, page, pageSize, totalPages }` (S6.4); each item gains `roles: Role[]`, `hasWards: boolean`, `guardians: { id, displayName }[]` (list hook) and, with `groups`, `_groups: { groups: { id, name, role }[] }` (enricher; the route adds `enrichers: { entityId }`) | 400 `validation_failed` (ranges); 400 `people_filter_unavailable` (a group-based filter without `groups`); 422 `people_filter_too_broad` (the filter resolves to over 10 000 ids — the module's code for a request it understands and refuses); 503 `people_filter_failed` (the `groups` contract threw; logged; retryable); 403 | REQ-U01 |
| DI (new) | `groups.personFilter` — `matchPersonIds(em, { tenantId, organizationId, on, sectionId?, groupId?, membershipRoles? }) → Promise<string[]>`; interface and token declared in `people/services/person-filter.ts` | called by `people` only | as typed | person ids with an active matching membership on `on` | throws → 503 `people_filter_failed` | REQ-U01 |
| `GET` (unchanged route) | `/api/club_core/sections` | auth + `club_core.view` | — | items gain `_groups: { activeGroupCount }` and `shortDescription` | — | REQ-U02 |
| Command (changed) | the public-content command behind `sectionPublicUpdateSchema` (`club_core/data/validators.ts:78`) | `club_core.sections.public_content` for own sections, or `club_core.manage` | `shortDescription` ≤ 160 | unchanged | 422; 409 optimistic lock | REQ-U02 |
| `POST` (unchanged) | `/api/people/role-assignments` | unchanged | `validTo` — already accepted by `roleAssignmentCreateSchema` through `validityShape` (`people/data/validators.ts:51-59`); the Coordinators tab's assign dialog exposes it | unchanged | unchanged | REQ-U02 |
| Command (changed) | `club_core.sections.update`, `club_core.sections.delete` and their `undo` | `club_core.manage` | `isActive: false` or delete | unchanged; `SectionSnapshot` gains `shortDescription` | 409 `section_has_active_groups` (`details: { groups: [{ id, name }], total }`); 409 `section_name_taken` when an undo or restore would duplicate a name; 409 optimistic lock as today | REQ-U02 |
| Command (changed) | `club_core.sections.create`, `.update` | `club_core.manage` | `name` 2–80 on create and rename (section-only schema, checked in the command against the stored value) | unchanged | 422 `section_name_length` (field `name`); 409 `section_name_taken` (field `name`) | REQ-U02 |
| DI (new) | `groups.sectionUsage` — `activeGroupsOf(em, { tenantId, organizationId, sectionId, limit }) → Promise<{ groups: { id, name }[], total }>`; interface and token declared in `club_core/services/section-usage.ts` | called by `club_core` only, inside the command's transaction | as typed | — | absent → no guard (without `groups` no group can reference a section) | REQ-U02 |
| Command (changed) | `groups` group create and update (activation) | unchanged | unchanged | unchanged | the section row is read `FOR SHARE` before the existing `group_section_inactive` check (DD-U08) | REQ-U02 |
| `GET` (unchanged route) | `/api/club_core/places` | auth + `club_core.view` (`club_core/api/places/route.ts:30`); record scope unchanged | `kind`, `parentPlaceId`, `isActive` (already accepted) | items gain `ownerName` (string \| null) and `regulationsText` | — | REQ-U03 |
| `POST` (new) | `/api/club_core/places/{id}/files` | auth + `club_core.manage` | multipart `file`, `kind` | 201 `{ id, kind, fileName, size, position }`; audit entry | 422 `place_file_format_unsupported`, `place_file_too_large`, `place_photos_limit_reached`; 404 place | REQ-U03 |
| `DELETE` (new) | `/api/club_core/places/{id}/files/{fileId}` | auth + `club_core.manage` | — | 204; audit entry | 404 | REQ-U03 |
| `GET` (new) | `/api/club_core/places/{id}/files` | auth + `club_core.manage` | — | `{ items: [{ id, kind, fileName, size, position, url }] }`, where `url` points to `/api/attachments/file/{id}` | 404 | REQ-U03 |

All new error codes go to `people/lib/error-codes.ts` and `club_core/lib/error-codes.ts` with en and pl messages (S6.7). The new routes carry `metadata` with the feature gate and OpenAPI schemas.

## Events, Jobs, Notifications, and Cross-Module Flows

| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit behavior |
|---|---|---|---|---|
| Section deactivate / delete | `club_core` command | `groups.sectionUsage` (sync read) | refuse or save | read-only call inside the command's transaction; no event change |
| Place file added / removed | `club_core` command | — | attachment created / soft-deleted | audit log entry per change; idempotent delete |

No new events, jobs or notifications. Existing `club_core.section.updated` events keep their payloads.

## Security, Privacy, and Compliance

- **Authorization:** feature gates as today. Filters run after the scope narrowing and only intersect ids, so a coordinator's filter never returns a person outside the club. A coach without `people.view` gets nothing new.
- **Tenant isolation:** both DI contracts take `tenantId` and `organizationId` from the route's trusted context and filter by them. The enrichers receive the scoped page of records only.
- **Sensitive data:**
  - Guardians are shown by display name only, which is basic data and already visible to a coordinator. E-mail, phone, PESEL, notes and consents never enter a row, a filter or an enricher.
  - The search reuses the platform's hashed search tokens for encrypted names (no plaintext index).
  - The birth date is already plain, but the list shows the computed age only.
- **Abuse and failure modes:**
  - **Enumeration:** a filter on an id from another club returns an empty list, not 404.
  - **Size and memory:** the id set from `groups.personFilter` is bounded by the club's size. Above 10 000 ids the route answers 422 `people_filter_too_broad` rather than loading them.
  - **Uploads:** checked by magic bytes, SVG refused, size limits enforced before storage.
  - **Concurrency:** deactivation locks the section row and group creation reads it `FOR SHARE` (DD-U08), so one of the two waits and then sees the other's result. Photo uploads lock the place row before counting.

## Integration Coverage

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-U01 | integration | One club; two sections with groups; a guardian with two wards; a coach by assignment and one by membership; one person without an account | `GET /api/people/persons` with each perspective and each filter, and with combinations | expected ids per case; the `roles`, `hasWards` and `guardians` fields on every row, and `_groups` when `groups` is registered; a person listed once | REQ-U01 |
| TEST-U02 | security | A coordinator; a second tenant with the same section name | Filters with the other tenant's ids; read rows | empty results; no e-mail, phone or PESEL in any row; no cross-tenant id | REQ-U01 |
| TEST-U03 | integration | the `groups.personFilter` token hidden from the container | `sectionId` filter; list without group params | 400 `people_filter_unavailable`; the plain list still works (the `_groups` enricher is not asserted, because it is auto-discovered with the module) | REQ-U01 |
| TEST-U04 | UI | People list in the browser at 375 px and desktop, light and dark | Choose Children, filter by section, reload, use back | URL holds the state; rows match; filtered-empty and empty states; axe clean | REQ-U01 |
| TEST-U05 | integration | A section with two active groups; a second section | Deactivate; delete; undo an activation of an inactive section that has a group; create a group while a deactivation holds the lock (two connections); deactivate after ending the groups | 409 with both groups listed; undo refused with 409; the concurrent pair ends with exactly one success and no inactive section holding an active group; finally success, `_groups.activeGroupCount` 2 → 0 | REQ-U02 |
| TEST-U06 | integration | Two sections; one legacy section with a 120-character name inserted directly | Rename to an existing name in other case; set a 1-character name; save the legacy section with its name unchanged; undo a rename into a name taken meanwhile | 409 `section_name_taken` on `name`; 422 `section_name_length`; the legacy save succeeds; the undo answers 409 | REQ-U02 |
| TEST-U07 | UI | Sections list and section page; the section's coordinator | Deactivate through the dialog; open `?tab=coordinators`; assign a coordinator with an "until" date; as the coordinator set a short description and see it on `/p/{slug}` | dialog lists groups; tab active; the assignment shows its end date; public tile shows the text | REQ-U02 |
| TEST-U08 | integration | Places of three kinds under a complex with an owner | Filters; list fields; upload photo, PDF, SVG-as-PNG, 11th photo, two parallel uploads at 9 photos; second regulations PDF | filtered ids; `ownerName`; 201s; 422 codes; never more than 10 photos; the second PDF replaces the first | REQ-U03 |
| TEST-U09 | UI | Places list and form | Filter by kind; see the indented child and the External badge; upload and remove a photo | rows ordered parent first; badge text; file list updates; 409 conflict dialog on a stale save | REQ-U03 |
| TEST-U10 | unit | `people/lib/person-list-filters.ts`, `club_core/lib/place-hierarchy.ts`, `club_core/lib/section-usage.ts` | age range → birth-date bounds (club time zone, leap days), `view` → filter mapping, parent-first ordering with orphaned children, truncation to 20 groups with `total`, the stored-versus-submitted name rule | 100 % line, branch and function coverage (`AGENTS.md`, S13.6) | REQ-U01, REQ-U02, REQ-U03 |

The tests live in `packages/app/.ai/qa/tests/` (integration) as in phase 1, run by `yarn test:integration:vereino`. TEST-U03 hides the `groups.personFilter` token from the container the way the messaging probe does (`packages/app/.ai/qa/tests/_fixtures/messaging-probe/probe.mjs:79-80`, `hiddenTokens` around `hasRegistration`).

## Implementation Phases

Validation for each phase: `yarn verify` (including `typecheck:packages`, the strict i18n check, `contracts:check` and `build`), the phase's integration tests, and the SQL review from `yarn db:generate` (no `yarn db:migrate` without approval). Each phase is an independent vertical slice; the three can ship in any order and in parallel PRs (one per story).

### Phase 1 — People list filters, perspectives and columns (E06-S01 #83)

- **Depends on:** none (uses `groups` when registered)
- **Outcome:** J-U01 works end to end.
- **Why this order / value delivered:** the owner's first named gap; it unblocks season preparation without opening records.
- **Deliverables:**
  - `people`:
    - the query schema additions and the list hook (own predicates; roles, guardians and "has wards" through `transformItem`);
    - `enrichers: { entityId: PERSON_ENTITY_ID }` on `people/api/persons/route.ts`, so the `groups` enricher runs;
    - the pure logic in `people/lib/person-list-filters.ts` with unit tests (TEST-U10);
    - the contract interface and token `people/services/person-filter.ts`;
    - `PersonsTable.tsx` with filters, app-owned perspective tabs and URL state (DD-U03);
    - error codes and the i18n keys.
  - `groups`: the registration of `groups.personFilter` in `groups/di.ts` and the enricher `groups.person-groups`.
- **Independent slices / estimated commits:**
  - (a) the `people` own predicates and the `view` parameter: 1 commit;
  - (b) the `groups` contract and the enricher: 1 commit;
  - (c) the UI: 1 commit.
- **Requirements closed:** REQ-U01
- **Tests:** TEST-U01, TEST-U02, TEST-U03, TEST-U04, TEST-U10 (people part)
- **Validation:** as above
- **Exit gate:** J-U01 in the browser in both locales, light and dark, at 375 px with the 320 px reflow; axe clean on the list.

### Phase 2 — Sections: counts, guarded deactivation, tabs, short description and name rules (E06-S03 #85)

- **Depends on:** none
- **Outcome:** J-U02 works end to end; the short description shows on P-01.
- **Why this order / value delivered:** removes the only destructive gap (a section deactivated under live groups).
- **Deliverables:**
  - `club_core`:
    - migration A: the nullable `short_description` column;
    - migration B, on its own: the duplicate check, then `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS` with `lock_timeout = '5s'` (DD-U05, `BACKWARD_COMPATIBILITY.md` §5);
    - the section-only name schema and the stored-versus-submitted check in the command (DD-U07);
    - the guard with the row lock in update, delete and both undos; `SectionSnapshot` gains `shortDescription`; 23505 mapped to 409;
    - the contract interface and token `club_core/services/section-usage.ts`; the pure logic in `club_core/lib/section-usage.ts` with unit tests;
    - `shortDescription` in `sectionPublicUpdateSchema` and its command;
    - `SectionsTable.tsx` (columns, row action, empty state) and `SectionForm.tsx` (tabs synced with `?tab=`, the field, the coordinator "until" date);
    - the public sections item gains `shortDescription` (`club_core/services/public-site.ts`).
  - `groups`:
    - the registration of `groups.sectionUsage` and the enricher `groups.section-groups`;
    - the `FOR SHARE` read of the section row in group create and activation (DD-U08).
- **Independent slices / estimated commits:**
  - (a) migrations A and B and the name rules: 1 commit;
  - (b) the guard and the contract: 1 commit;
  - (c) the UI: 1 commit.
- **Requirements closed:** REQ-U02
- **Tests:** TEST-U05, TEST-U06, TEST-U07, TEST-U10 (section part)
- **Validation:** as above
- **Exit gate:** J-U02 in the browser in both modes and at 375 px. The migrations' SQL is reviewed, and migration B is shown to fail with its duplicate list on a seeded duplicate and to pass without one.

### Phase 3 — Places: filters, owner, hierarchy, regulations and photos (E06-S04 #86)

- **Depends on:** none
- **Outcome:** J-U03 works end to end.
- **Why this order / value delivered:** prepares the place data that phase 5 (facilities) publishes.
- **Deliverables:**
  - `club_core`:
    - a migration adding `regulations_text` and `club_core_place_files`;
    - the routes `places/[id]/files`, with the place row locked while photos are counted;
    - the pure logic `club_core/lib/place-hierarchy.ts` (parent-first ordering) with unit tests;
    - the list fields `ownerName` and `regulationsText`;
    - `PlacesTable.tsx` (filters, owner, hierarchy) and `PlaceForm.tsx` (the "Regulations and photos" group);
    - error codes and the i18n keys.
- **Independent slices / estimated commits:**
  - (a) the list and the filters: 1 commit;
  - (b) the files: 1–2 commits.
- **Requirements closed:** REQ-U03
- **Tests:** TEST-U08, TEST-U09, TEST-U10 (place part)
- **Validation:** as above
- **Exit gate:** J-U03 in the browser in both modes and at 375 px; the upload rejects an SVG renamed `.png`.

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-U01 | J-U01, `/backend/people/persons` | `GET /api/people/persons` (new params, list hook), DI `groups.personFilter`, enricher `groups.person-groups` | Phase 1 | TEST-U01…TEST-U04, TEST-U10 | AC-U01, AC-U02 |
| REQ-U02 | J-U02, `/backend/club/sections`, `/backend/club/sections/[id]/edit`, P-01 tile | `club_core_sections.short_description`, name index, commands guard and undo, `groups` section lock, DI `groups.sectionUsage`, enricher `groups.section-groups` | Phase 2 | TEST-U05…TEST-U07, TEST-U10 | AC-U03, AC-U04 |
| REQ-U03 | J-U03, `/backend/club/places`, place form | `club_core_places.regulations_text`, `club_core_place_files`, `places/[id]/files` routes | Phase 3 | TEST-U08, TEST-U09, TEST-U10 | AC-U05 |

**Extension surfaces** (`.ai/guides/spec-delivery.md`). Each added surface is its own row:

| Surface | Requirement | Reference capability and file | Phase | Test | Classification |
|---|---|---|---|---|---|
| `GET /api/people/persons` query extension (`search`, filters, `view`) | REQ-U01 | `search.encrypted-column-list-filter`, `src/modules/example/api/todos/route.ts`; adapted today at `people/api/persons/route.ts:56-57` | Phase 1 | TEST-U01, TEST-U02 | emitted-example |
| Response enricher `groups.person-groups` on `people:person` (and the route's enricher opt-in) | REQ-U01 | `umes.response-enricher`, `src/modules/example/data/enrichers.ts`; adapted in Vereino as `people/data/enrichers.ts` (`people.section-coordinators`) with the opt-in at `club_core/api/sections/route.ts:47` | Phase 1 | TEST-U01 | emitted-example |
| DI service `groups.personFilter` | REQ-U01 | `module.di-registration`, `src/modules/example/di.ts`; adapted in Vereino as `groups.membershipContribution` (declared in `people/services/membership-contribution.ts:11`, registered at `groups/di.ts:33`) | Phase 1 | TEST-U01, TEST-U03 | emitted-example |
| Response enricher `groups.section-groups` on `club_core:section` | REQ-U02 | `umes.response-enricher`, `src/modules/example/data/enrichers.ts`; adapted as `people/data/enrichers.ts` | Phase 2 | TEST-U05 | emitted-example |
| DI service `groups.sectionUsage` | REQ-U02 | `module.di-registration`, `src/modules/example/di.ts`; the same Vereino pattern as `groups.personFilter` | Phase 2 | TEST-U05 | emitted-example |
| API routes `club_core/api/places/[id]/files` | REQ-U03 | `api.crud-query-engine-custom-fields`, `src/modules/example/api/todos/route.ts` (the guarded route family); adapted in Vereino as `club_core/api/sections/[id]/materials/route.ts` | Phase 3 | TEST-U08 | emitted-example |

Each row names the reference capability from `src/modules/example/references/surface-inventory.json` with its exact file (`.ai/guides/spec-delivery.md`) and the Vereino module that already adapted it; the implementation starts from the Vereino adaptation.

## Rollout, Migration, and Rollback

Rollback follows S14.6: it redeploys the previous release and never runs `down()`. Every migration here is backward compatible for one release, so the previous code keeps working on the new schema.

- **Phase 2, migration A** (`short_description`, nullable): the previous release ignores the column. `down()` exists for local development only.
- **Phase 2, migration B** (unique index), in its own idempotent migration (`BACKWARD_COMPATIBILITY.md` §5):
  - it first runs the duplicate check; when any organization has case-insensitive duplicate live names, it fails with the list (organization id, names) and changes nothing;
  - the operator renames the sections (an administrator's normal edit), then re-runs the migration;
  - after that it runs `SET lock_timeout = '5s'` and `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS`;
  - the previous release keeps working with the index, which only refuses duplicates it never relied on;
  - a forward fix, if one is needed, drops the index in a new migration.
- **Phase 3 migration** (`regulations_text`, `club_core_place_files`): additive. The previous release ignores both. Stored files remain in `privateAttachments` under the owner `club_core:place` and become reachable again when the release is redeployed.
- **DI contracts (phases 1 and 2):** registration in `groups` and reading in `people` / `club_core` ship in one PR per phase. The previous release has neither, so a redeploy restores today's behaviour.
- **Migrations are Ask First** (`AGENTS.md`); `yarn db:migrate` runs only after approval.
- **Feature flags:** none.

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| The full-name `search` on encrypted names depends on the platform search tokens matching `first_name` as they match `last_name` | Search by first name fails | V-U01 in phase 1, step 1; fallback: `search` matches last names only and the placeholder says so | Low |
| Id intersection for large clubs | Slow list above several thousand people | 422 `people_filter_too_broad` above 10 000 ids; the segment is small clubs (D11) | Low |
| Existing duplicate section names block the index | Migration B fails with the list of duplicates | The check inside migration B; the administrator renames and re-runs; the column migration and the code are unaffected | Low; one-off |
| A group is created in a section while it is being deactivated | A section ends up inactive with an active group | DD-U08: the section row is locked in `club_core` and read `FOR SHARE` in `groups`; TEST-U05 runs the race on two connections | Low |
| Undo restores a state the forward command forbids | An inactive section with groups, or a duplicate name | The guard and the 23505 → 409 mapping run in both undos; TEST-U05, TEST-U06 | Low |
| Place photos stored but not shown publicly until phase 5 | Perceived as unfinished | Photos are listed on the place form; the public use is E08-S04 #124 | Accepted |

## Acceptance Criteria

- [ ] **AC-U01** — An administrator in a club with sections Akademia and Basen opens People. With **Children** and Section = Basen, the list shows exactly the Basen participants under 18, each with age, groups and guardians. The URL restores the same view on reload.
- [ ] **AC-U02** — A coordinator using any filter or perspective sees no e-mail, phone, PESEL or notes, and no person of another tenant. Without `groups` registered, group-based filters answer 400 `people_filter_unavailable` and the rest of the list works.
- [ ] **AC-U03** — Deactivating or deleting a section with active groups answers 409 `section_has_active_groups` listing them, and nothing changes. After the groups are deactivated, the same action succeeds and the list shows Groups = 0.
- [ ] **AC-U04** — Section names are unique case-insensitively among live sections (409 `section_name_taken` on the field, also when an undo would duplicate one). They are 2–80 characters on create and rename (422 `section_name_length`), and a stored longer name saves unchanged. `?tab=coordinators` opens that tab, and a coordinator assignment can carry an end date. The section's coordinator sets the short description, which appears on the public club page tile.
- [ ] **AC-U05** — The places list filters by kind, parent and active state; it shows the owner and the hierarchy with the External badge. A place accepts one regulations PDF and up to 10 photos, and rejects an SVG renamed `.png` with 422.
- [ ] Every listed backend surface matches its recorded Open Mercato reference and uses the canonical shell/components, shared API helpers, semantic tokens, and complete loading, empty, error, conflict, keyboard, accessibility, responsive, light-mode, and dark-mode states.
- [ ] Every affected API and UI path has self-contained integration coverage and the configured validation gate passes.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | `AGENTS.md` (module boundaries, Ask First migrations, coverage rule), `.ai/guides/spec-delivery.md`, `.ai/guides/backend-ui.md`, `BACKWARD_COMPATIBILITY.md` |
| Data models, APIs, events, UI, and tests are internally consistent | pass | Requirement Traceability rows REQ-U01…REQ-U03 |
| Every workflow completes end to end without a catch-all integration phase | pass | J-U01…J-U03, each closed in its own phase |
| Platform-native reuse and extension points were chosen before custom code | pass | Reuse and Ownership Map; DD-U01, DD-U02, DD-U06 |
| UI contracts identify references, canonical components, and theme/state coverage | pass | UI and Interaction Contracts |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | Implementation Phases 1–3 |

Verdict: `Blocked — awaiting the product owner's go for implementation` (every check passes; the spec PR #131 merged on 2026-11-03 with Q-U10 confirmed).

## Resolved assumptions (autonomous defaults)

| ID | Question | Chosen answer | Rationale | Confirmation |
|---|---|---|---|---|
| Q-U01 | Split into three specs (three independently deployable capabilities)? | One spec, three independent phases | The product owner chose one covering spec for E06-S01, E06-S03 and E06-S04 on 2026-11-03; each phase ships on its own | decided by the owner |
| Q-U02 | How does the "full name" search work on encrypted names? | `search` matches each word against first or last name through the platform search tokens (V-U01); fallback: last name only | Reuses the existing mechanism; no new index | — |
| Q-U03 | Age filter: fixed bands or a range? | A numeric range `ageFrom`–`ageTo` plus the **Children** perspective (< 18) | Fits any club threshold (R10 is configurable) | — |
| Q-U04 | Deactivating a section with active groups: block or cascade? | Block with 409 and the list (DD-U04); delete is guarded the same way | README B-04; the most reversible option | — |
| Q-U05 | Does name uniqueness include inactive sections? | Yes, all live (not soft-deleted) sections | A reactivated section must not collide | — |
| Q-U06 | Existing names over 80 characters? | Kept; the 2–80 rule applies on create and when the submitted name differs from the stored one (DD-U07) | No data loss; no failing saves | — |
| Q-U07 | Are place photos and regulations public now? | No; stored privately, published in phase 5 (E08-S04) | Smallest scope; the facilities spec owns publication | — |
| Q-U08 | Photo limits? | PNG, JPEG or WebP ≤ 5 MB, at most 10 per place; one regulations PDF ≤ 10 MB | Matches the logo and material checks already in `club_core/api/uploads.ts`, with a larger photo size | — |
| Q-U09 | Does the role filter "coach" include coach and assistant memberships? | Yes (union with assignments) | The mockup's Staff view and README "who are our coaches" | — |
| Q-U10 | Who edits the short description: the administrator only (base update) or also the section's coordinator (public-content command)? | The public-content command (`sectionPublicUpdateSchema`), so the section's coordinator and the administrator | It is public tile text like the public description the coordinator already edits; in the mockup the coordinator can edit it (`canEdit` in `screenSection`) | confirmed by the product owner, 2026-11-03 |
| Q-U11 | Is "Children" under 18, or under the club's account threshold (R10)? | Under 18 (minors) | The perspective answers "who is a minor"; R10 decides only who may hold an account | — |

## Open Questions

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| V-U01 | Do the platform search tokens answer `$ilike` on `first_name` the same way as on `last_name` (`people/api/persons/route.ts:56-57`)? | implementer, phase 1 step 1 | no (fallback defined) | pending |

## Changelog

| Date | Change |
|---|---|
| 2026-11-03 | Initial draft (autonomous, `om-auto-write-spec` on #82), covering E06-S01 #83, E06-S03 #85, E06-S04 #86 |
| 2026-11-03 | Revised after an independent architectural review. Changes:<br>– the section guard now locks the section row, and `groups` reads it `FOR SHARE` (DD-U08);<br>– both undos are guarded;<br>– the name rule is classified as a breaking narrowing, with a section-only schema (DD-U07);<br>– the index gets its own concurrent migration with an in-migration duplicate check (DD-U05);<br>– rollback follows S14.6;<br>– the persons route opts in to enrichers, and its own columns come from the list hook;<br>– the perspectives are app-owned tabs (DD-U03);<br>– unit tests are added (TEST-U10), and error codes and the list shape are made consistent;<br>– the short description moves to the public-content command (Q-U10). |
| 2026-11-03 | Q-U10 confirmed by the product owner: the section's coordinator and the administrator edit the short description. |
| 2026-11-03 | Consistency pass after the merge of PR #131:<br>– the short description moves to the Public page tab, matching Q-U10;<br>– TEST-U01 names the top-level `roles`, `hasWards` and `guardians` fields;<br>– the name rule reads "on create and rename" everywhere (DD-U07);<br>– the perspectives are an app-owned tablist in every section (DD-U03), and `TodosTable`'s `perspective` prop is named as not used;<br>– the section filter names both owners of its predicate;<br>– the non-goals no longer claim that #84 and #88 reuse this spec's enricher;<br>– the extension-surface table cites the `example` capability ids and files per `spec-delivery.md`, with a new row for the persons query extension;<br>– the coordinator "until" date is traced to the existing `validTo` of the role-assignment API;<br>– status and verdict reflect the merged PR. |
| 2026-11-03 | Status set to `Ready for implementation` on the product owner's go; the migrations stay Ask First at implementation time |
