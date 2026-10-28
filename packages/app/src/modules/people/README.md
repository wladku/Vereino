# `people` — persons, staff roles, guardianships, record scope and accounts

Phase A1 of the foundation spec ([`.ai/specs/2026-10-27-vereino-foundation-primitives.md`](../../../../../.ai/specs/2026-10-27-vereino-foundation-primitives.md), Q17) builds what issue #38 needs; #26 (E02-S02) and #27 (E02-S03) extend it (consents, phone/photo/notes, guardianship relation and payer flag, imports, `/api/people/me`). Feature authority: the club spec ([`.ai/specs/2026-10-20-vereino-club-management.md`](../../../../../.ai/specs/2026-10-20-vereino-club-management.md), *Data Models*, DD-06, DD-07, DD-33, TEST-005).

| Surface | Contents |
|---|---|
| Entities | `Person` / `people_persons` (names, e-mail and PESEL encrypted; `pesel_hash` lookup hash; `user_id`), `RoleAssignment` / `people_role_assignments` (`club_admin`, `coordinator` + `section_id`, `coach`; validity), `Guardianship` / `people_guardianships` (guardian → ward; validity) |
| Pure logic | `lib/people-rules.ts` (club-zone date, PESEL check digit, role scope, `personScope`, `isPayerEligible`), `lib/error-codes.ts` |
| Commands | `people.persons.create`, `.update`, `.create_account` (not undoable), `people.role_assignments.create`, `.update`, `.end`, `people.guardianships.create`; job commands `people.persons.sync_roles`, `people.persons.bootstrap_admin` (system_job only, not undoable) |
| Routes | `GET/POST/PUT /api/people/persons`, `GET /api/people/persons/{id}`, `POST /api/people/persons/{id}/account`, `GET/POST/PUT /api/people/role-assignments`, `GET /api/people/role-assignments/{id}`, `POST /api/people/role-assignments/{id}/end`, `POST /api/people/guardianships` |
| DI | `people.scopeService`, also registered as the foundation's `vereino.scopeProvider` |
| Events | `people.person.created|updated|deleted|account_created`, `people.role_assignment.created|updated|deleted`, `people.guardianship.created|updated|deleted` (ids only) |
| Subscriber | `people:sync-auth-roles` (persistent) on the role-assignment, guardianship and account events |
| Worker / schedule | `people:sync-role-expiry` (queue `people-sync-role-expiry`), registered per organization from `setup.ts` with `registerModuleSchedule`, daily 02:00 in the club zone |
| CLI | `yarn mercato people sync-role-expiry --tenant --org [--today]`, `yarn mercato people bootstrap-admin --tenant --org --user --first-name --last-name [--email]` |
| Setup | `defaultRoleFeatures` = `catalogueRoleFeatures()` (the five phase 1 roles); `seedDefaults` seeds the roles and the schedule |
| ACL | `people.self`, `people.view`, `people.manage`, `people.roles.manage`, `people.pesel.view`, `people.accounts.manage` (all but `self` imply `view`) |
| Error codes | `account_age_below_threshold` 422, `account_birth_date_required` 422, `account_exists` 409, `pesel_duplicate` 409, `pesel_invalid` 422, `role_scope_required` 422, `role_scope_unexpected` 422, `guardianship_self` 422 |

## Record scope

`personScope` turns the person linked to the user into grants: `club_admin` (an active club_admin assignment), `coordinator` (the sections of active coordinator assignments), `guardian` (active wards), `self`. A `coach` grant carries group ids, which come from memberships (#30); phase A1 returns none, so coaches see only their own records. Reads use the foundation's `scopeWhere` (lists) and `assertInScope` (details) with one list of grant kinds per resource (`api/shared.ts`); commands use `authorizeScoped` with their allowed kinds, least-privileged first. Lists disable the platform's full export, which would skip `buildFilters`.

## Roles

A person's `auth` roles are always the full desired set: the roles outside `vereino_*`, the roles of the active assignments (`roleCatalogue` implications), `vereino_member` for an account and `vereino_payer` for an adult active guardian (`isPayerEligible`). The subscriber syncs one person after each change; the daily job recomputes everyone with an account (validity starts and ends, 18th birthdays) and logs `{ processed, updated, unchanged, failed, skipped }`; a failure is retried by the queue or the next run. Coordinators read the club's people records club-wide only once #26 defines that grant; in phase A1 a coordinator reads persons through `self` only.

## Accounts

`people.persons.create_account` applies `accountAgePolicy` with `club_core`'s `own_account_min_age`, calls the foundation's `createAccount` with the person's desired roles (so an assignment saved earlier is granted with the account), writes `user_id` and emits `people.person.account_created`. The invitation is rendered in the request locale: `auth.users.create` takes no locale. A failed invitation e-mail returns `warning: invite_email_failed`; the platform's `POST /api/auth/users/resend-invite` resends it and needs `auth.users.create`, which no Vereino role carries yet.
