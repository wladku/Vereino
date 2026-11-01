# `groups` — groups of both kinds, memberships over time, seasons and external teams

Issue #30 (E03-S01, club spec phase 2 step 2 — [`.ai/specs/2026-10-20-vereino-club-management.md`](../../../../../.ai/specs/2026-10-20-vereino-club-management.md), glossary *Group*, *Membership*, *Coach / instructor*, *Record scope*; *Data Models* → `groups`; DD-03a; REQ-004, REQ-019, REQ-020; TEST-030). Requires `people` and `club_core` (`index.ts` `requires`); both are reached only through DI services and scalar ids.

| Surface | Contents |
|---|---|
| Entities | `Season` / `groups_seasons` (`name` unique among the live seasons of the club, `starts_on`, `ends_on`); `Group` / `groups_groups` (`section_id`, `name`, `kind` `team`/`class_group`, team-only `league` and `season_id`, `description`, `is_active`); `GroupMembership` / `groups_memberships` (`group_id`, `person_id`, `role` `participant`/`coach`/`assistant`, `valid_from`, `valid_to`; partial unique index on open-ended rows); `ExternalTeam` / `groups_external_teams` (`name`, `club_name`, `institution_id`, `contact`, `notes`) |
| Encryption | `encryption.ts`: `groups_external_teams.contact`; no hash sibling |
| Pure logic | `lib/groups-rules.ts` (kinds, roles, `disallowedTeamFields`, `seasonDatesInverted`, `firstOverlapping`, `periodStatus`, `rosterOrder`, `groupNameKey` and `matchGroupNames` for the import, #65), `lib/error-codes.ts` |
| DI | registers `groups.directory` (`findGroups`, `rosterOn(scope, groupId, date)`, `findExternalTeams` — for `activities`, #31), `groups.membershipContribution` — the optional contribution `people` reads with `hasRegistration` (`coachedGroupIds`, `isActiveParticipant`) — and `groups.membershipImporter` (#65), the optional hook of the `people` bulk import (`resolveGroups`, `ensureParticipantMemberships`; `services/membership-importer.ts`, rules in the `people` README); consumes `clubCoreDirectory` (sections, institutions), `clubCoreSettings` (club day), `people.personDirectory` (roster names) and `people.roleSync` |
| Commands | `groups.groups.create|update|delete`; `groups.memberships.create|update|end`; `groups.seasons.create|update|delete`; `groups.external_teams.create|update|delete` — all undoable, `authorizeScoped` |
| Routes | CRUD `/api/groups/groups` (+ `GET /api/groups/groups/{id}` with `actingRole`), `/api/groups/memberships` (+ `POST /api/groups/memberships/{id}/end`), `/api/groups/seasons`, `/api/groups/external-teams`; `GET` with `groups.view`, writes with `groups.manage`; update and delete send the platform optimistic-lock header |
| Pages | `/backend/groups/groups` (+ `create`, `[id]` with the tabs Roster and Details), `/backend/groups/seasons` (+ `create`, `[id]/edit`), `/backend/groups/external-teams` (+ `create`, `[id]/edit`); seasons and external teams are tabs of the groups list |
| Events | `groups.group|membership|season|external_team.created|updated|deleted` (ids only; membership events also carry `groupId` and `personId`) |
| Subscriber | `groups:sync-member-roles` (persistent, `groups.membership.*`): asks `people.roleSync` to recompute the person's `auth` roles (an adult active participant is a payer) |
| ACL | `groups.view`, `groups.manage`; seeded by the role catalogue `people` seeds: `vereino_club_admin` (`groups.*`), `vereino_coordinator` (`groups.view`, `groups.manage`), `vereino_coach` (`groups.view`) |
| Error codes | `group_team_fields_on_class_group` 422, `groups_reference_invalid` 422, `group_section_inactive` 422, `group_has_memberships` 409, `membership_overlap` 409, `season_dates_inverted` 422, `season_name_taken` 409, `season_in_use` 409 |

## Scope

Groups and rosters are read with the grant kinds `coach` (the group ids of the caller's active `coach`/`assistant` memberships), `coordinator` (the group's section) and `club_admin`, least-privileged first, so the detail route's `actingRole` is `coach` for a coach of the group. The roster list narrows to the groups `scopeWhere` admits on the groups table (memberships carry no section). Groups and memberships are written by a coordinator within their sections and by the club administrator; moving a group to another section needs both sections in scope. Seasons and external teams are club-wide dictionaries: read by every coach, coordinator and the club administrator, written by every coordinator and the club administrator (`clubWideKinds: ['coordinator']`).

## Coach scope and roles

`people.scopeService` stays the single scope provider (foundation DD-F03). `people` declares the contract of an optional contribution (`people/services/membership-contribution.ts`) and resolves it with `hasRegistration`, the pattern the club spec names for `facilities.maintainerScopeProvider`; `groups` registers it, so the dependency stays `groups` → `people`. Without `groups` there is no coach grant and no participant payer. A `coach` role assignment grants only the `vereino_coach` `auth` role (the `groups.view` feature); the coach's groups come from memberships — both are needed before a coach sees a group (#26).

## Rules

- Team fields (`league`, `season_id`) on a `class_group` → 422; the form clears them when the kind is a class group.
- A membership write takes the group's row lock first, then refuses an overlapping live membership of the same person, group and role (409 `membership_overlap`); the partial unique index on open-ended rows backs it.
- A membership is ended through `valid_to` (`POST …/end`, default today in the club zone) and stays in the roster; there is no delete.
- A group with any live membership (ended ones included) is not deleted (409 `group_has_memberships`); deactivate it.
- A season named by a live group is not deleted (409 `season_in_use`); group writes that name a season row-lock it.

## Deferred

`age_category_entry_id` (needs the `dictionaries` module, Ask First); the public fields (`is_public`, `public_description`, `public_conditions`, `age_from`/`age_to`, `level_label`, story #29); sessions and attendance (`activities`, #31 and later), the 409 on changing `kind` to `class_group` when the group has matches, and `match`/`sparring` for a class group → 422 (with activities); section deactivation and deletion with groups (409, `club_core` needs a `groups` usage contract); the person record's "Groups" tab; `search.ts` (no `groups` entity is listed for search).
