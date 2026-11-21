# Vereino — people life cycle and data entry

**Date**: 2026-11-14
**Status**: In progress — approved by the product owner on 2026-11-16 ([owner decisions on #255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)), the additions REQ-L15/REQ-L16 (phases L11, L12) on 2026-11-19; left: AC-L05 (the cash blocker's link untested), AC-L06 ("Former member" on the history screens untested), AC-L07 (18th-birthday ward-card lines at 375 px untested), AC-L15 (TEST-L22 quarantined, #433), AC-L16 (the "Fits" filter does not use birth years), the two generic criteria (close-out #452)

> Use `om-spec-writing` for every new application, multi-module feature, or other non-trivial business slice. Keep every section below; write `N/A — {reason}` when a section does not apply. Change the status to `Ready for implementation` only after every blocking open question is resolved and the traceability table covers every requirement.

Sources: the parity audit of 2026-11-14 (`main` at `a312199`) and the owner's decision D-031 §8 (`.ai/specs/research/decisions/D-031-mockup-is-the-model-and-eight-parity-decisions.md`), with D-029 (phone-first) and D-030. This spec is an addendum, in the form of `.ai/specs/implemented/2026-11-03-vereino-ux-parity-phases-1-3.md`. It completes three base specs and does not edit their bodies:

- `.ai/specs/2026-10-20-vereino-club-management.md` (**CM**): REQ-001, REQ-002, REQ-019, REQ-036, REQ-037, DD-39, V-2, Q-019, Q-027, and the vocabulary rows *Account*, *Legal guardianship*, *Consents* and *Role assignment*.
- `.ai/specs/2026-10-27-vereino-club-payments.md` (**PAY**): the vocabulary row *Payer*.
- `.ai/specs/2026-10-27-vereino-foundation-messaging-primitives.md` (**MSG**): the vocabulary row *Expansion* and DD-M10 (message revisions).

Ids carry the letter **L** (`REQ-L01`, `DD-L01`, `J-L01`, `TEST-L01`, `AC-L01`, `Q-L01`). Screen ids (M-xx, B-xx) are those of `docs/ux-concept/README.md`. Names follow the mockup: see "Glossary (D-031 §2)" in `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md`; this spec does not repeat the rename table.

**What this spec supersedes in the base specs**

| Base spec, place | Text today | Superseded by |
|---|---|---|
| CM *Implementation Phases*, phase 1 step 3 | "Deferred by the product owner: … `people.persons.anonymize` (GDPR decision)" | REQ-L05, phase L6 |
| CM *Open Questions*, Q-019 | "default no automatic deletion; anonymization on request" (to be confirmed before the pilot) | DD-L06, DD-L07: still no automatic deletion; the request, the preconditions and the retention hold are defined here |
| CM vocabulary *Legal guardianship* | "n:m relation guardian → ward with `relation`, `is_primary_payer`, consents and period" (no rule ends it) | DD-L08: a guardianship active on the ward's 18th birthday ends the day before it |
| CM vocabulary *Consents* | "granted or revoked only by the guardian or the administrator" | REQ-L10: an adult participant holds and changes their own consents |
| CM DD-39 | "the consent text is a club-editable template" (never built) | REQ-L10, DD-L11 |
| CM *Open Questions*, Q-027 | "default outside 1.0 … to be considered as a separate specification" | Q-L06 keeps the default and adds the rule for a camp of the club's own members |
| PAY vocabulary *Payer* | "Active guardian with `is_primary_payer`; for an adult participant without such a guardian — themselves" | DD-L08: after the 18th birthday no guardianship is active, so the adult is the payer of every charge created from that day; charges created earlier keep their payer |
| MSG vocabulary *Expansion* | "A participant younger than 18 on `today` adds their active guardians" | Unchanged; DD-L08 makes PAY agree with it. MSG gains the notices of REQ-L06 and REQ-L07 and the edit surface of DD-M10 (REQ-L12) |

## TLDR

Four situations that every club meets each year become functions of the product, and the forms stop leading into dead ends:

- **Invitation again.** The person record shows whether the invitation is pending and lets the administrator send it again, change the login e-mail, and block or unblock the account.
- **Leaving the club.** One dated operation ends memberships, roles, guardianships and contracts, hands a coach's future sessions over, refuses to finish while the coach holds cash, and closes the account. A member asks for it from the phone. Anonymisation is a separate, irreversible step with a retention hold.
- **Turning 18 and reaching the account age.** A daily job ends the guardianship on the 18th birthday, moves the consents to the adult, makes the adult the payer of new charges, and tells the family and the administrator 30 days ahead. It also tells them when a child may get an account.
- **New season.** A panel wizard moves groups to the new season, ends or copies the recurring activities and the fees, and announces the result.

It also closes the data-entry gaps no other spec owns (role assignment dates, guardianship start date, external id, photo, material rename, contract attachment, message edit, the first administrator) and gives every empty picker one pattern: a hint with a link or an in-place create.

Everything reuses the platform's commands, `makeCrudRoute`, `CrudForm`, the scheduler, the foundation dispatch (in-app and e-mail) and the optional-DI pattern that `people` and `groups` already use.

## Problem Statement

The audit walked each role through a year in the club and each form through a fresh installation. Verified against the code at `a312199` (paths under `packages/app/src/modules/`):

- **Invitation.**
  - `people/components/AccountPanel.tsx:46-70` offers "Create account" only. The link lasts 48 hours (CM V-2).
  - The platform route `POST /api/auth/users/resend-invite` needs `auth.users.create`. `vereino_club_admin` does not hold it (`packages/core/src/roles.ts:36-46`). The route also refuses a user who already has a password.
  - The record does not show whether the person ever signed in. The login e-mail cannot be changed and the account cannot be blocked.
- **Leaving.**
  - `people/commands/persons.ts` registers `people.persons.create` and `people.persons.update` only. No command ends a person's memberships, roles and guardianships together.
  - The event `people.person.deleted` is declared (`people/events.ts:7`) and never emitted.
  - CM names `people.persons.anonymize` in *Data Models* and defers it in phase 1 step 3.
  - A coach who leaves keeps `coach_person_id` on future sessions, an open contract, and the cash recorded as held (`payments_payments.collected_by_person_id`).
- **Turning 18.**
  - `packages/core/src/audience.ts:88-90` stops adding guardians at 18. `payments/lib/charge-plan.ts:83-88` keeps the guardian as payer whatever the ward's age. `people/services/scope-service.ts` keeps the adult among the guardian's wards.
  - So a parent keeps the calendar, the declarations and the charges of an adult, and receives none of the messages.
  - The consents `{ regulations, image, trips }` live only on the guardianship (`people/data/entities.ts:187`), so an adult participant has none.
  - The daily role sync (worker `people:sync-role-expiry`, command `people.persons.sync_roles` at `people/commands/jobs.ts:69`) only re-derives `auth` roles.
- **Account age.** `people/commands/accounts.ts:76-85` enforces `own_account_min_age` when the administrator clicks. Nothing tells anyone that a child reached the age.
- **New season.** `groups/data/entities.ts:25-36` holds a season (name, start, end), and a group has `season_id`. Nothing moves a group to the next season or ends the recurring activities (`activities_activities.ends_on`) and the fees (`payments_fees.valid_to`) together.
- **Consents.** Withdrawing `regulations`, `image` or `trips` changes nothing: no module but `people` reads them. The consent text of DD-39 is a fixed i18n string; `club_core_club_settings` has no field for it.
- **Data entry.**
  - `people/components/RolesPanel.tsx:105-141` creates an assignment without an end date and ends it today only, although the schemas accept dates (`people/data/validators.ts:65-80`).
  - `GuardianshipsPanel.tsx:505-512` does not send `validFrom`, which the API accepts (`validators.ts:113`).
  - `PersonForm.tsx` has no external id and no photo; `photo_attachment_id` of CM *Data Models* is not in `people/data/entities.ts`.
  - `club_core/components/SectionMaterialsPanel.tsx:89-91` sends only `isPublic`, so a rename means delete and upload again.
  - `ContractForm.tsx` has no attachment; `attachment_id` of CM *Data Models* is not in the entity.
  - `communication/api/threads/[id]/messages/[messageId]/route.ts:33` accepts `PATCH`; `ThreadRecord.tsx` offers delete only.
  - The first administrator exists only through `mercato people bootstrap-admin` (`people/cli.ts:49`).
- **Empty pickers.** On a fresh club these controls are empty and say nothing about the next step: the owner-institution select (`club_core/components/PlaceForm.tsx:198-202`), the contract institution select (`ContractForm.tsx:146-162`), the guardian lookup (`GuardianshipsPanel.tsx:379-392`, "No person found"), the role scope lookups (`RolesPanel.tsx`, "No section found"), the group's section select and age category (`groups/components/GroupForm.tsx`) and the activity pickers (`activities/components/ActivityForm.tsx:117-180`).

Who has it: the club administrator first; then guardians and adult participants (leaving, consents, the 18th birthday), coaches (leaving, onboarding) and coordinators (new season, onboarding).

## Overview and Success Measures

- **Primary outcome:** in the pilot season the administrator handles each of the four situations inside Vereino, with no change made by an operator in the database and no side spreadsheet of "who left".
- **Leading indicators:**
  - invitations re-sent from the person record;
  - departures recorded with a date;
  - guardianships active for a ward aged 18 or more (target: zero);
  - groups of an ended season still active 30 days after the next season starts (target: zero);
  - dead ends in the bootstrap walk-through (target: zero, TEST-L15).
- **Baseline:** none of the four situations can be completed in the application today (verified above); the bootstrap walk-through has seven dead ends in forms this spec owns.
- **Market / product reference:**
  - **Adopted:** SportBM and ProTrainUp (`.ai/specs/research/2026-10-23-benchmark-sportbm.md`, `2026-09-30-benchmark-protrainup.md`) keep former players as archived records and carry groups from season to season; Open Mercato's own invitation with a re-send (`auth/api/users/resend-invite`).
  - **Rejected:** hard deletion of a person on request (attendance, units and charges would lose their subject); automatic erasure after a fixed time (CM Q-019 default: no automatic deletion).

## Goals

- **REQ-L01** (D-031 §8a) — The administrator sees the state of a person's account (none, invited, active, blocked) and sends the invitation again while it is pending. A person whose link expired can also use "Forgot password" on M-01.
- **REQ-L02** — The administrator changes the login e-mail of an account, and blocks or unblocks it. The club's last active administrator cannot be blocked.
- **REQ-L03** (D-031 §8b) — A person, a guardian with their wards, or a whole family leaves the club on a date. One previewed operation ends the group memberships, the role assignments and the guardianships, and closes the accounts that have no purpose left. A member, a guardian or a coach asks for it from the phone.
- **REQ-L04** (D-031 §8b) — When the person is a coach or other staff, the same operation hands over or frees their future sessions and default-coach activities, ends their contracts and place assignments, and does not finish while they hold cash.
- **REQ-L05** (D-031 §8b; CM Q-019) — The administrator anonymises a person who left, on a recorded request, irreversibly, with a retention hold for payments; and removes a person created by mistake who has no history.
- **REQ-L06** (D-031 §8c) — On the ward's 18th birthday the guardianships end, the consents move to the adult, the adult becomes the payer of new charges, and pending guardian confirmations are settled. The family and the administrator are told 30 days ahead and on the day.
- **REQ-L07** (D-031 §8c) — When a child reaches the club's account age, the guardians and the administrator are told, and the administrator finds every such child in one list.
- **REQ-L08** (D-031 §8d; completes CM REQ-019) — The administrator or a section coordinator moves the club or a section to a new season in one previewed panel operation. Groups continue, are renamed, closed or copied. Recurring activities and fees of the old season end and may be copied. The result can be announced.
- **REQ-L09** — Making a person a coach or other staff is one guided journey on the person record: account, role, coach membership and contract, each with its state and a link.
- **REQ-L10** (completes CM REQ-002, REQ-037, DD-39) — An adult participant gives and withdraws their own consents on the phone. Every consent states what withdrawing changes. The administrator edits the consent texts, and each consent shows whether it was given to the current wording.
- **REQ-L11** — Moving a child to another group has stated effects: the declarations for the old group's future sessions are dropped, the new group's sessions appear undeclared, and the month's fee is charged once.
- **REQ-L12** — Every stored field in this list can be entered and corrected in the interface: role assignment dates, guardianship start date, external id, person photo, section material title, contract attachment, and the text of one's own message.
- **REQ-L13** — The first club administrator is created without the command line.
- **REQ-L14** — An empty picker never ends a task. It says what is missing and offers a link or an in-place create when the user may create the record, and names who can when the user may not.
- **REQ-L15** (owner request of 2026-11-18) — From a group's roster the administrator or the section coordinator moves one child or several selected children to another group on a chosen day, in one previewed step that can be undone. Each child keeps the history of both groups, and REQ-L11's effects (declarations, one fee for the month) hold for every child. The roster suggests the children whose age fits the target group.
- **REQ-L16** (owner request of 2026-11-18) — Each age category of the club carries a range of PZPN "U" years, so the club administrator sees which birth years belong to it in a given season. A team's public age range is proposed from its category, and the "Fits {group}" filter of REQ-L15 uses the category's birth years for a team.

## Non-goals

- Self-service erasure or account closing by a member: a request from the phone, a decision by the administrator (DD-L06).
- Automatic deletion or anonymisation after a period without a request (CM Q-019 default stays).
- Sign-ups of non-members to events, start lists and differentiated entry fees (CM Q-027 default stays; Q-L06).
- Self-enrolment of a child into a group or section from the phone or the public page: the mockup has no such screen, and the coordinator enrols (Q-L06).
- The roster screens (B-12 and the coordinator's phone roster), the activity wizard, the fee form and the facility forms: specs A, C and R own them. This spec gives them the group-move rule (REQ-L11) and the picker pattern (REQ-L14). Exception: the roster's "Move" action, for one child and for several (REQ-L15), is specified here, because spec A's roster (REQ-A03) offers only Edit, End and Remove.
- B-33 "Cash to settle" (issue #118) and the "Accept cash" dialog (spec C). REQ-L04 only reads the amount a coach holds.
- A payer other than the adult after the 18th birthday (Q-L02), and a guardianship that continues after 18 by rule (Q-L03).
- The treasurer role (held back, D-030, #245).
- The dashboard frame and widget placement (spec N). This spec defines two widgets (ids, feature, phase under *UI architecture*) and leaves their slot to N.

## Proposed Solution

**Account (REQ-L01, REQ-L02).** `people` gains three commands next to `people.persons.create_account` (`people/commands/accounts.ts`): `people.persons.resend_invitation`, `people.persons.update_account` (login e-mail, blocked flag) and `people.persons.close_account`. They call the platform only through `foundation/services/accounts.ts`, which already wraps `auth.users.create`. The helper gains `accountState`, `resendInvitation`, `updateAccount` (the platform command `auth.users.update`: `email`, `isConfirmed`) and `closeAccount` (`auth.users.delete`). The "Account" tab of B-10 shows the state and the actions.

The re-send uses the **V-L01 fallback** (owner decision 2026-11-16, [#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)): `authService.requestPasswordReset` and the platform's reset e-mail, a 60-minute link, with the tab saying "valid 60 minutes". The platform's invitation internals (`PasswordReset`, `InviteUserEmail`, `generateAuthToken` and the rest of V-L01) are imported only if `.ai/guides/framework-contracts.md` lists them; today it does not. If a later version of the guide lists them, the re-send switches to a 48-hour invitation link inside the same helper, with no change to the route. The first invitation (`people.persons.create_account`) is unchanged.

**Closing an account (gap c6).** `closeAccount` deletes the platform user with `auth.users.delete`, which in the installed version (`@open-mercato/core/src/modules/auth/commands/users.ts`, the delete command) removes in one transaction the user's sessions, role links, user ACL, pending password-reset links and sidebar preferences, then hard-deletes the user; the platform's protected-role floor refuses to delete the tenant's last administrator, and `people` refuses earlier with 422 `last_club_admin`. Effects outside that command:

- **Sessions:** gone with the user; an open browser tab fails its next request and lands on sign-in.
- **API keys:** keys hold their own roles (`api_keys.roles_json`), not the user's identity, and no Vereino role grants `api_keys.*` (`packages/core/src/roles.ts`), so a member owns none; a key the person created as a technical administrator stays and names them only in `created_by`. Ephemeral session keys (`session_user_id`) expire on their own.
- **Social identity links (D-027, `vereino_identity_links`, spec `2026-10-27-vereino-social-sign-in.md`, `Draft`):** once that table exists, `closeAccount` deletes the person's links in the same command, so a Google sign-in cannot reach a deleted user; until then there is nothing to delete.
- **Why delete and not deactivate:** a closed account has no purpose left (Q-L09): the person has left and holds no role. Deactivation (`isConfirmed = false`) is the reversible **block** of REQ-L02, which keeps the user, its e-mail and its roles. The comment at `people/commands/accounts.ts:49` ("the platform's own, separately audited user deactivation") describes withdrawing access to a live account, which this spec offers as the block. Deleting frees the login e-mail for a later return (a returning person gets a new invitation) and leaves no dormant credential. The person keeps `user_id` = null; audit entries keep the old user id.

**Leaving (REQ-L03, REQ-L04).** One command, `people.persons.depart`, takes the persons, the last day and the choices. `people` ends what it owns (role assignments, guardianships, accounts). Every other module registers an optional **departure contributor** under a DI token that `people` declares, the same direction as `groups.membershipContribution` (`people/services/membership-contribution.ts:11`, registered at `groups/di.ts`):

| Contributor | Reports in the preview | Does on apply | Undo (until the last day) | Emits after the commit |
|---|---|---|---|---|
| `groups` | active and future memberships | ends them on the last day with the rule of "end on a chosen last day" that spec A defines (REQ-A03). Until spec A's phase 2 lands it uses the existing `groups.memberships.end` rule (as phase L9 does), and a membership that has not started yet is **ended** with `valid_to` = the last day rather than removed; once A lands, such a membership is removed under A's delete rule (`DELETE /api/groups/memberships`: only before the start or without attendance; the route does not exist on `main`, whose `groups/api/memberships/route.ts` exports `GET`, `POST` and `PUT` only) | restores each membership's `valid_to` from the snapshot; re-creates a removed future membership with its id | `groups.membership.updated` per ended membership, `groups.membership.deleted` per removed one; the `groups` search and cache side effects of its own commands |
| `activities` | future planned sessions the person leads; activities whose default coach they are | sets the chosen coach or null from the day after the last day; writes a substitution entry per session | restores `coach_person_id` on each session and the default coach on each activity **only where the value is still the one the departure wrote**, and deletes the substitution entries it wrote; a session changed since is reported and left alone | `activities.occurrence.coach_changed` or `activities.occurrence.coach_unassigned` per session, `activities.activity.updated` per activity |
| `payments` | cash held; open charges as debtor or payer | nothing; cash held is a blocker, open charges are a warning | nothing to restore | nothing |
| `club_core` | open contracts with the person as party | sets `valid_to` to the last day | restores each contract's `valid_to` | `club_core.contract.updated` per contract |
| `facilities` | place maintainer rows; future internal bookings made by the person | removes the maintainer rows; the bookings stay with their group | re-inserts the removed maintainer rows with their ids | `facilities.place_maintainer.deleted` (on undo `…created`) per row |

Contributors read and write with the caller's `EntityManager`, so the departure is one transaction. A missing module contributes nothing. Because they write through `people`'s transaction rather than their own commands, the contract carries the side effects explicitly (gap c4): `apply` returns a snapshot and a list of changes; after the commit `people` calls each contributor's `afterCommit(changes, ctx)`, which emits the events of the last column through the module's own event bus and runs the cache invalidation and search reindex its commands would have run. A failure in `afterCommit` is logged and retried by the event bus; it never rolls the departure back. The command's undo (gap c3) calls each contributor's `undo(em, subject, snapshot)` in one transaction and then `afterCommit` with the reversed changes; it is refused with 409 `departure_undo_expired` once the last day has passed, because the life-cycle job then closes the accounts. A member, a guardian or a coach files a **departure request** from `/club/profile/leave`; the administrator opens it on the person record and runs the departure.

**Erasure (REQ-L05).** `people.persons.anonymize` runs only on a person who has left, only for an administrator, only with a recorded request. It clears contact and identity data at once and keeps the name only while a payment is under the retention hold (DD-L07); the daily job finishes it. `people.persons.delete` soft-deletes a person without any history.

**The 18th birthday and the account age (REQ-L06, REQ-L07).** A daily job `people:life-cycle` runs one idempotent command, `people.persons.life_cycle`, per club. It is built like the role sync: `people:sync-role-expiry` is the worker (`people/workers/sync-role-expiry.ts`), the command it runs is `people.persons.sync_roles` (`people/commands/jobs.ts:69`), and the daily schedule is registered per organization through `registerModuleSchedule` in `people/services/club-setup.ts` (gap c8). The job does, per club: notices 30 days before an 18th birthday; on the birthday the end of the guardianships, the consent carry-over and the event `people.person.came_of_age`; account-age notices; account closings of dated departures; the second step of erasures whose hold has lapsed.

**New season (REQ-L08).** On the Seasons tab of B-11 the wizard "Start a new season" builds a plan: a row per group with an action, and per recurring activity and fee whether it ends or is copied. `groups` previews and applies the plan; `activities` and `payments` register season contributors in the same optional-DI way.

**Consents (REQ-L10).** A person gets a `consents` column with the shape the guardianship has. The profile page shows an adult participant their own consents. The club settings get `consent_texts`. `people` exposes two flags (`image`, `trips`) for a session's participants through its existing directory contract, so the coach's attendance list can show them.

**Data entry and pickers (REQ-L12…REQ-L14).** The forms send the fields the APIs already accept; three fields need columns. `@vereino/ui` gains one pattern for empty pickers, used by every form in the list under *UI and Interaction Contracts*.

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-L01** The re-send is a `people` command gated by `people.accounts.manage`, built on a foundation helper | The administrator already creates accounts with that feature; the age rule and the audit stay in `people` | Grant `auth.users.create` to `vereino_club_admin` and call the platform route | The feature also creates arbitrary platform users, past the age rule and the person link |
| **DD-L02** The account state is read from the platform user, never stored: *invited* = no password and never signed in; *blocked* = `isConfirmed = false`; else *active* | One source of truth; a Google sign-in (D-027) counts as signed in | A status column on the person | Drifts from the platform user |
| **DD-L03** Departure is one `people` command with optional contributors per module, in one transaction | Modules never import each other; a half-finished departure is worse than none | An event that each module consumes after commit | No preview, no blockers, partial failure |
| **DD-L04** Cash held, and a staying minor left without a guardian, **block** the departure. Future sessions need an explicit **choice**: hand over to a named coach, or leave unassigned | Money and legal care must not be lost silently; unassigned sessions already have a list ("needing a coach") | Block on future sessions too | A coach leaving at short notice would block on finding a successor |
| **DD-L05** A person who left keeps the record with `left_on`; lists and pickers hide them by default; "Return to the club" clears it | Attendance, units and charges keep their subject; players come back | Soft-delete on leaving | The record disappears from history screens |
| **DD-L06** Only the club administrator starts an erasure, and only on a recorded request: from the person, from a guardian for a minor ward, or as the club's own decision with a note | The conservative reading of the right to erasure: the controller checks identity and grounds; a member's tap must not destroy data | Self-service erasure from the profile | Irreversible; a guardian could erase the other guardian's child |
| **DD-L07** Erasure has two steps. At once: phone, e-mail, notes, PESEL, external id, photo, birth date, consents, locale. The name stays while the person is debtor or payer of a charge with a payment booked in the current or the five previous calendar years, and is cleared by the daily job after that | Accounting evidence is kept five years; contact data has no such ground | Clear everything at once | The ledger would show payments from nobody for open accounting years |
| **DD-L08** A guardianship active on the ward's 18th birthday ends the day before it. The consents the guardian gave move to the adult with their author and date. The adult is the payer of every charge created from the birthday; earlier charges keep their payer | Parental responsibility ends at 18; MSG already stops writing to guardians; PAY's *Payer* rule then needs no code change | Keep the guardianship until someone ends it | A parent reads an adult's calendar and charges without a ground |
| **DD-L09** All dated life-cycle work runs in one daily job, idempotent through the state it writes and the dispatch idempotency keys | No marker table; a missed day is caught up by the next run | One job per rule | Five schedules to register and monitor |
| **DD-L10** The season rollover is a plan sent in the request, previewed and applied by `groups` with contributors from `activities` and `payments`. It lives in the panel for the coordinator too | It is configuration, which D-031 §3 keeps in the panel; a plan in the request needs no table | A stored draft; a phone wizard | More schema; a table of twenty groups does not fit 375 px |
| **DD-L11** Consent texts are stored per key with the time of the last change. Changing a text never withdraws a consent; a consent given earlier is marked "given to an earlier wording" | The club must show what was agreed to; silent invalidation would stop contact lists mid-season | Version every consent row | The date comparison gives the same answer without new columns |
| **DD-L12** An adult's own consents are a `consents` JSON column on the person, written through the same transitions as the guardianship's (`people/lib/people-rules.ts`) | One consent model; the carry-over at 18 is a copy | A self-guardianship row | Breaks "guardian ≠ ward" (422 today) |
| **DD-L13** One empty-picker pattern in `@vereino/ui/admin`: `PickerEmptyHint` and `InlineCreateDialog`, driven by the user's features | Seven modules have the same dead end; one component, one test | A hint text per form | Seven wordings; no create path |
| **DD-L14** The first administrator is made on a panel page open to the technical administrator while the club has none; it runs the existing command `people.persons.bootstrap_admin` | The command exists (`people/commands/jobs.ts:119`); only the entry point is missing | Make the tenant's first user an administrator automatically | The technical administrator must not get personal data by default (CM *Users*) |
| **DD-L15** A group move is one command, `groups.memberships.move`. The month's fee follows the group on the period's reference day; a later generation in the same period skips the new group's fee for a moved child | The generator reads the roster on one reference day (`payments/services/generation.ts:21-45`) but uses today for the current period, so a re-run after a move would charge twice | Pro-rate both fees | Not in the mockup; clubs charge whole months |
| **DD-L16** Moving several children is one command, `groups.memberships.move_many`, applied in one transaction after a preview; it reuses the single move for each child and has one undo | A season-end promotion moves 5–15 children at once; partial results would leave a group half-moved and a second click would double the rest | One call of `groups.memberships.move` per child from the page | No single undo; a failure in the middle leaves both groups wrong; the fee skip rule would run per call |
| **DD-L17** The "U" range of an age category is a Vereino row keyed by the platform dictionary entry (`groups_age_category_ranges`), not text parsed from the label; a team fits by birth year in the season's reference year, a class group by age on the move date | The platform `DictionaryEntry` holds only value, label, colour, icon and position (`@open-mercato/core/src/modules/dictionaries/data/entities.ts`), and PZPN counts categories by birth year ("rocznik"), not by age on a day | Parse "U10–U11" from the label; store ages instead of "U" years | A renamed category breaks the parsing; ages on a day misplace children born late in the year |

## Domain Vocabulary and Business Rules

| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| Account state | `none` (no `user_id`), `invited` (user without a password who never signed in), `active`, `blocked` (`isConfirmed = false`) | platform `auth:user` through `foundation` (DD-L02) | A user outside the club's tenant and organization reads as `none` (fail closed, as `accountEmail` does) |
| Invitation again | Sends a new link to the login e-mail through the platform's password reset; earlier unused links stay valid until they expire, because `requestPasswordReset` adds a reset row without ending the others and ending them would need the internal `PasswordReset` entity (read 2026-11-16 in `auth/services/authService.ts`) (V-L01 fallback, approved 2026-11-16): valid 60 minutes, and the e-mail and the tab say so; allowed only in the state `invited`; at most 3 per account in 5 minutes (*Rate limits*) | `people.persons.resend_invitation` | 409 `invitation_not_pending`; 429; `warning: invite_email_failed` when the e-mail fails |
| Login e-mail change | Changes the platform user's e-mail; in the state `invited` it also sends the invitation again; the person's contact e-mail changes only when it equalled the old login | `people.persons.update_account` | 409 `email_taken`; 409 on a stale version |
| Blocked account | The user cannot sign in and their sessions end; roles and data stay; reversible | platform `isConfirmed` | 422 `last_club_admin` for the club's only active administrator; the same check on closing and on departure |
| Departure | The dated end of a person's part in the club: memberships, role assignments, guardianships as ward, contracts, place assignments. A guardian's guardianships end when their ward leaves in the same departure | `people.persons.depart` | 409 `departure_blocked` with `details.blockers` |
| Last day | A calendar date in the club's time zone, today or later; everything ends with `valid_to` = that day | the command input | 422 `departure_date_in_past` |
| Blocker | (a) cash held by the person > 0; (b) a minor ward who stays and would have no active guardian; (c) the club's last active administrator; (d) a person who already left | contributors and `people` | The blocker names the record and links to the screen that resolves it |
| Hand-over choice | For a coach: `handOverTo: personId` (a person with a coach grant on the group, or any coach for a coordinator or administrator) or `leaveUnassigned: true`; applies to planned sessions that start after the last day and to default-coach activities | `activities` contributor | 422 `departure_handover_required` when sessions exist and no choice was made |
| Primary payer hand-over | When a leaving guardian is the primary payer of a staying ward, the request names another active guardian, who becomes the payer on the day after the last day. Open charges of the ward that have no payer then get the new payer through spec C's rule (REQ-C06) | `people` | 422 `departure_payer_required` |
| Former person | A person with `left_on` ≤ today; excluded from pickers, audiences and the default People list; shown in the perspective "Former" | `people_persons.left_on` | "Return to the club" clears the date; memberships are not restored |
| Departure request | A member's request to leave, optionally with erasure, for themself or for wards; one open request per subject; states `open`, `done`, `declined` (with a reason) | `people_departure_requests` | 409 `departure_request_exists`; 403 for a person outside the caller's `self` and ward scope |
| Anonymised person | `anonymized_at` set; first and last name read as the localised label "Former member"; no contact data, PESEL, external id, photo, birth date, notes or consents; ids stay on attendance, units, charges, payments and messages | `people.persons.anonymize` | 409 `anonymize_blocked` unless: left, account closed, no open charge as debtor or payer, no cash held, no active guardianship, request recorded |
| Retention hold | `erasure_hold_until` = 31 December of the fifth year after the latest payment on a charge whose debtor or payer is the person; null when there is none. While it is in the future the name stays, visible only with `people.manage` | `payments` contributor, `people` | — |
| Mistaken person | A person with no membership, guardianship, role assignment, account, attendance, charge, message or rental, ever | contributors (`hasHistory`) | 409 `person_in_use` with the reasons and a link to "Leaving the club" |
| Coming of age | The ward's 18th birthday in the club's time zone (`isAdultOn`, `packages/core/src/account-policy.ts:21`). Guardianships that started before it end the day before. A guardianship created on or after it is deliberate and is left alone (Q-L03) | `people.persons.life_cycle` | A person without a birth date is skipped and listed for the administrator |
| Consent carry-over | Each of `regulations`, `image`, `trips`: the most recent decision among the ending guardianships, copied with `granted`, `at` and `by_person_id`; the adult changes them afterwards | `people_persons.consents` | No guardianship consent → "not given" |
| Pending confirmation at 18 | A declaration `pending_guardian` for a session on or after the birthday becomes final with the ward's own answer | `activities`, on `people.person.came_of_age` | — |
| Account-age notice | Sent once, on the day the age reaches `own_account_min_age`, for a person without an account; also after the club lowers the threshold | `people.persons.life_cycle` | No guardian with an address → only the administrator's list |
| Season rollover plan | New season (existing or created in the plan) plus one action per group: `continue` (new `season_id`), `rename` (continue with a new name and age category), `close` (deactivate; memberships, recurring activities and fees end on the old season's last day), `copy` (a new group with the same settings and an empty roster). Per recurring activity and fee of a continued or renamed group: `end`, `end_and_copy` or `keep` | `groups.seasons.rollover` | 409 `rollover_plan_stale` when the preview no longer matches; 409 with the conflict list when a copied activity collides; nothing is applied in part |
| Own consents | `{ regulations, image, trips }` of a person aged 18 or more, changed by that person or the administrator | `people_persons.consents` | Change by anyone else → 403; a minor's own consents → 422 `consents_minor` |
| Consent wording | Per consent key: the club's text (≤ 1000 characters) or, when empty, the built-in text; `changedAt` set on every change | `club_core_club_settings.consent_texts` | 422 on length |
| Group move | Ends the membership in the old group on the day before `date` (spec A's end on a chosen last day, REQ-A03) and starts one in the new group on `date`, same role, in one transaction. This spec adds the pairing, the effects on declarations and the fee, and the roster actions that call it (REQ-L15) | `groups.memberships.move` | 409 on an overlap; 403 outside the section scope of either group |
| Moving several children | A group move (above) for each selected participant of one roster to one target group on one `date` (today or later, Q-L08). The preview lists, per child, what happens: moved; already a member of the target group on that date (skipped); has future declarations in the old group (dropped); a fee in the target group (charged once for the month, DD-L15). An active participant of the source roster on `date` is movable; a membership that has ended or not started by `date` is listed as `skip_not_active`. The apply step moves every child the preview listed as movable, or none | `groups.memberships.move_many` | 409 `move_preview_stale` when a membership changed after the preview (the page refreshes the preview); 422 `move_same_group`, `move_target_inactive`, `move_date_in_past` or `move_too_many` (more than 100); 403 outside the section scope of either group |
| Fits the target group's age | For a team whose category has a range (REQ-L16): a participant whose birth year is among the category's birth years in the reference year. Otherwise: a participant whose age on the move date lies within the target group's `age_from`–`age_to` (the public age range, #91). The roster's "Fits {group}" filter preselects them; it never moves anyone by itself. Without an age range on the target group the filter is not offered | `groups` | — |
| Age category range | Two whole numbers `u_from` ≤ `u_to` (1–99; `u_to` may be open) on an age category, meaning PZPN "U" years: a child belongs to the category "U{from}–U{to}" in a season when `reference_year − birth_year + 1` lies in the range. Defaults for the seeded categories: Kids 4–5, Skrzat 6–7, Żak 8–9, Orlik 10–11, Młodzik 12–13, Trampkarz 14–15, Junior młodszy 16–17, Junior starszy 18–19, Senior 20–open | `groups_age_category_ranges` | 422 `age_range_inverted`; a category without a range offers no birth years |
| Reference year | The calendar year in which the group's season starts; for a team without a season, the calendar year of the move date (for the filter) or of today (for the display) | `groups` seasons | — |
| Birth years of a category | For a reference year R, the years `R − u_to + 1` … `R − u_from + 1` (e.g. Orlik U10–U11 in the season 2026/27: 2016–2017) | computed, never stored | — |

**What withdrawing a consent changes** (shown next to each consent on M-10 and in the confirmation; keys `people.club.profile.consents.effect.<key>`):

| Consent | Effect of "not given" or withdrawn |
|---|---|
| `regulations` | The person record and the People perspective "Missing consents" show it. Taking part is not blocked |
| `image` | The coach's attendance list (M-05) and the roster show "no image consent" beside the participant. Vereino publishes no participant images either way |
| `trips` | On an away session the guardian or adult who answers "yes" is asked to give it; the coach's list shows "no trip consent". The answer is not refused |
| `share_contact_with_coaches` | The phone and e-mail leave the coaches' lists at once (built, REQ-037) |
| `share_presence_with_guardians` | The ward's name leaves other guardians' session views at once (built, REQ-006) |
| `publish_name` | The name leaves the public pages at once (built, REQ-025) |

## Users, Permissions, and Scope

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| Club administrator (panel) | Everything in this spec: account actions, departure, erasure, removal, consent texts, season rollover for the club, staff checklist, every in-place create | Club-wide (`club_admin` grant) | `people.accounts.manage`, `people.manage`, `people.roles.manage`, new `people.persons.anonymize` (covered by the role's `people.*`), `club_core.manage`, `club_core.contracts.manage`, `groups.manage`, `activities.manage`, `payments.manage` |
| Section coordinator (panel for configuration, phone for daily work, D-031 §3) | Season rollover for groups of their sections; coach membership in the staff journey; group move; sees "left on" and the flags, never contact data or consents | `section_ids`; people stay a **basic** read (`people/api/shared.ts`) | `groups.manage`, `activities.manage`, `people.view` |
| Coach (phone) | Files their own departure request; sees the consent flags of their groups' participants on M-05; edits their own message | `self`; `coached_group_ids` | `people.self`, `activities.coach`, `communication.post` |
| Guardian (phone) | Files a departure request for themself and their wards; changes wards' consents with the stated effects; sees the notices about 18 and the account age | `self` + `ward_person_ids` | `people.self` |
| Adult participant (phone) | Own consents; own departure request | `self` | `people.self` |
| Minor participant with an account (phone) | Sees who their guardians are (unchanged); no consents, no request | `self` | `people.self` |
| Technical administrator | Creates the first club administrator while the club has none | The selected organization | the platform feature `auth.users.create` (V-L04) |

`tenantId` and `organizationId` come from the authenticated context in every command and route; contributors receive them as arguments and never read system scope. The daily job takes its scope from the schedule registration (`registerModuleSchedule` in `people/services/club-setup.ts`), as the `people:sync-role-expiry` worker does for `people.persons.sync_roles`. No feature is checked by role name.

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Existing module or new module | Integration seam | Why |
|---|---|---|---|---|
| Invitation, login e-mail, blocking, closing | reuse | platform `auth` | `foundation/services/accounts.ts` (`auth.users.create`, `auth.users.update`, `auth.users.delete`; `authService.requestPasswordReset` and the reset e-mail for the re-send, V-L01 decided 2026-11-16) | The platform owns users and links |
| Departure, erasure, life-cycle job | app-own | `people` | commands; scheduler | Owns persons, guardianships, assignments |
| What each module ends on a departure | app-own, new contracts | `groups`, `activities`, `payments`, `club_core`, `facilities` provide; `people` consumes | DI tokens `people.departure.<module>` declared in `people/services/departure.ts`, read with `hasRegistration` | Same direction as `groups.membershipContribution` |
| Notices (18, account age, departure, season) | reuse | `foundation` dispatch | `dispatch` with templates and idempotency keys, as `payments/commands/group-charges.ts:262` | In-app and e-mail in the person's language (MSG) |
| Season, group actions | extend | `groups` | commands on `groups/commands/seasons.ts`, `groups.ts`, `memberships.ts` | Owns seasons and rosters |
| Ending and copying activities and fees | app-own, new contracts | `activities`, `payments` provide; `groups` consumes | DI tokens `groups.season.<module>` declared in `groups/services/season-rollover.ts` | `groups` must not import them |
| Consent texts | extend | `club_core` | `PUT /api/club_core/settings` | Club setting, like `rules_url` (#195) |
| Consent flags on the attendance list | extend | `people` provides, `activities` consumes | the existing person directory contract (`people/services/person-directory.ts`), additive method | Already the seam for names and contacts |
| Person photo, contract attachment | reuse | `attachments` | the byte and size checks of `readCheckedUpload` in `club_core/api/uploads.ts` in the route; `createScoped` in the private partition from the command, as `club_core/commands/logos.ts`, `materials.ts` and `place-files.ts` call it | Same as logos and place photos |
| Message edit | reuse | `communication` | existing `PATCH …/messages/{messageId}` | Only the surface is missing |
| Empty-picker pattern | app-own | `@vereino/ui/admin` | React components; features from `people/components/useGrantedFeatures.ts` (moved to a shared hook) | Used by seven modules (AGENTS.md: shared when two or more reuse it) |

## Architecture and Data Flow

```text
B-10 Account tab  -> POST /api/people/persons/{id}/account/invitation -> people.persons.resend_invitation
                       -> foundation.resendInvitation -> platform authService.requestPasswordReset + reset e-mail (60 min)

M-10 /club/profile/leave -> POST /api/people/me/departure-requests -> people_departure_requests
                              -> notice to administrators (foundation dispatch)
B-10 Leaving tab  -> POST /api/people/departures/preview -> people + contributors (read only)
                  -> POST /api/people/departures         -> people.persons.depart (one transaction)
                       -> people: role assignments, guardianships, left_on
                       -> people.departure.groups | activities | club_core | facilities (caller's EntityManager)
                       -> after commit: people.person.departed, role sync, notices

scheduler people:life-cycle (daily, per club) -> people.persons.life_cycle
     -> notices T-30 and T-0; guardianships end; consents copied; people.person.came_of_age
     -> activities subscriber: pending confirmations become final
     -> account-age notices; dated account closings; erasure step two

B-11 Seasons tab -> POST /api/groups/seasons/rollover/preview -> groups + groups.season.activities | payments
                 -> POST /api/groups/seasons/rollover          -> groups.seasons.rollover (one transaction)
                       -> after commit: groups.season.rolled_over; optional announcement per group
```

- **Module boundaries:** `people` never imports `groups`, `activities`, `payments`, `club_core` or `facilities`; it declares the contributor interfaces and they register. `groups` declares the season contributor interfaces. `activities` consumes `people.person.came_of_age` as an event.
- **Extension points:** the person record gets a widget injection spot for the staff checklist rows, `vereino:people:person-record:staff-setup`, named like the groups spot (`GROUPS_SPOT_ID`, `people/components/PersonRecord.tsx:35`) and spec C's charges spot `vereino:people:person-record:charges` (DD-C05); `groups` and `club_core` inject their rows; the dashboard lists are widget contents placed by spec N.
- **Alternatives considered:** events instead of contributors (DD-L03); a stored rollover draft (DD-L10).
- **Compatibility:** every existing route keeps its inputs. `GET /api/people/persons` gains an optional `view=former` and excludes former persons from the other views; this is a behaviour change on a Vereino-owned list and is recorded under `BACKWARD_COMPATIBILITY.md` in phase L4.

## User Journeys

### Journey J-L01 — The invitation expired

1. Kasia tells Aneta, the administrator, that her link no longer works. Aneta opens Kasia on B-10, tab Account. The state reads "Invited on 3 November — not signed in yet".
2. Aneta clicks "Send the invitation again". The command sends a new link valid 60 minutes (the V-L01 fallback); the tab says so. The tab shows "Sent again today".
3. Kasia's address was mistyped: Aneta clicks "Change login e-mail", types the right one, saves. The invitation goes to the new address.
4. Failures: the e-mail provider fails → a warning and the action stays available; Kasia has signed in meanwhile → 409 and the tab reloads as "Active"; a fourth attempt in five minutes → 429 with the wait time.

### Journey J-L02 — A family leaves the club

1. Kasia opens `/club/profile` on the phone and taps "Leave the club". The page lists her and her two wards; she ticks both children, leaves "Also delete our data" unticked, picks the last day (30 November) and sends.
2. Aneta gets a notice. On Kasia's record, tab Leaving, she opens the request and the preview: two participant memberships each, Kasia's guardianships, an open November charge for Jan (a warning), Kasia's account to be closed, Jan's father stays the guardian of nobody else and is offered too.
3. Aneta confirms. On 30 November everything has `valid_to` set; on 1 December the job closes the accounts. Kasia gets the confirmation e-mail on the day of the decision.
4. Failures: the second ward stays and Kasia is their only guardian → blocker "Jan would have no guardian"; Kasia is the primary payer of a staying ward → the form asks for the next payer; a stale preview → 409 and a fresh preview.

### Journey J-L03 — A coach leaves in mid-season

1. Wojtek tells the coordinator he stops at the end of the month and sends the request from `/club/profile/leave`.
2. Aneta opens the preview: 14 planned sessions after the last day, two activities with Wojtek as default coach, a contract, a coordinator assignment, and 240 zł of cash held.
3. The cash is a blocker. It links to B-33 (issue #118). After the cash is accepted there, Aneta opens the preview again.
4. She chooses "hand the Żaki sessions to Marek" and "leave the Basen sessions unassigned". She confirms.
5. From the day after the last day the Żaki sessions carry Marek, the Basen sessions appear under "needing a coach" on the coordinator's phone (spec A), the contract and the assignments end, and the groups' threads get no post (a hand-over is not a schedule change).
6. Failure: Marek is not a coach of that group and the actor is a coordinator of another section → 403 on that choice.

### Journey J-L04 — A request to delete data

1. A former member's parent writes to the club asking to delete the child's data. Aneta opens the child (perspective "Former"), tab Leaving, and records the request: who asked, when, and the note.
2. She clicks "Anonymise" and types the last name to confirm. Contact data, PESEL, photo and birth date are gone at once. Because the family paid fees this year, the name stays until 31 December five years on, visible to the administrator only, with the date shown.
3. Failures: an open charge → 409 with a link to the charge; the account still open → 409 "Close the account first".

### Journey J-L05 — Jan turns 18

1. Thirty days before the birthday Kasia, Jan and Aneta get the notice: from that day Jan decides for himself, Kasia stops seeing his calendar and charges, and Jan needs an account or an e-mail address to get messages.
2. On the birthday the job ends Kasia's guardianship, copies the three consents to Jan, and gives Jan's account the payer role (built). Jan's profile shows "My consents", each marked "given by Kasia Kowalska on 2 September 2026".
3. The November charge created earlier stays with Kasia. The December charge names Jan as payer.
4. Jan has no account and no e-mail: the administrator's list "Adults without contact" shows him, and the December charge is flagged as it is today for a payer who cannot be reached.

### Journey J-L06 — A new season

1. In August Aneta opens Groups → Seasons and clicks "Start a new season". She names it 2027/28 with its dates.
2. The table lists the 2026/27 groups. She sets "Żaki 2017" to rename ("Orliki 2017", category Orlik), "Skrzaty 2020" to continue, "Zumba wtorek" to close, and copies "Skrzaty 2020" as "Skrzaty 2021".
3. For each continued group she keeps the training activities with "end and copy" and raises the fee from 120 to 130 zł.
4. The preview shows what will be created and ended and one conflict: the copied Tuesday training collides with a rental. She moves it to 17:00 in the plan and applies.
5. She ticks "Announce in the group threads". Each continued group gets a post with the first session's date.
6. A coordinator does the same for their own sections only; other sections' groups are not listed.

### Journey J-L07 — A new coach

1. Aneta adds Marek as a person. The Roles tab shows the checklist "Staff setup": Account — none; Role — none; Groups as coach — none; Contract — none.
2. She creates the account (invitation sent), assigns the role "coach", follows "Add to a group as coach" to the roster of Żaki (spec A's screen, opened with Marek preselected), and "Add a contract" to the contract form with Marek as party.
3. Back on the record every row is green. Marek signs in and sees his sessions.
4. A coordinator sees the same checklist without the Account and Contract actions.

### Journey J-L08 — The first day of a new club

1. The technical administrator opens the panel. A banner says the club has no administrator and links to "First administrator". They pick Aneta's user, type her name and confirm.
2. Aneta adds a place. The owner select is empty: it says "No institution yet" and offers "Add an institution"; she types the municipality's name in the dialog and it is selected.
3. She adds a child, opens Guardians, searches for the mother, gets "No person found — Add 'Kasia Kowalska'", and creates her in place.
4. A coordinator opening the group form with no section sees "No section yet. Ask the club administrator to add one" and no button.

### Journey J-L09 — The Kids move up to Skrzaty

1. On 1 September Ewa, coordinator of the football section, opens the roster of "Kids" and chooses **Move to another group**. She picks "Skrzaty" and the date 1 September.
2. The roster filter **Fits Skrzaty** (the group's age range 6–7) preselects six of the eleven children. She unticks one whose parents asked to stay a year longer and ticks one who is younger but ready.
3. The preview lists six children to move, one skipped (already in Skrzaty since August), two with declarations for future Kids sessions that will be dropped, and the September fee charged once, in Skrzaty.
4. She confirms. Kids' roster shows the six under **History** with the last day 31 August; Skrzaty's roster lists them from 1 September. Each child's **Groups** tab on B-10 shows "Kids 2025-09-01 – 2026-08-31" and "Skrzaty from 2026-09-01".
5. An hour later she notices one wrong child and uses **Undo** on the toast; all six moves are reverted together, and she repeats the move without that child.
6. On the phone, from **More → Groups → Kids**, the same action works with the same preview (D-029).

### Journey J-L10 — The categories know their birth years

1. Aneta, club administrator, opens Groups → **Age categories** (a tab next to Seasons). The nine PZPN categories show their "U" ranges and, for the current season 2026/27, the birth years: Orlik U10–U11 → 2016–2017.
2. She adds a category "Orlik młodszy" with the range U10–U10; it is created in the club's dictionary and gets its range in one step.
3. Ewa, coordinator, creates the team "Orliki 2017" with the category Orlik młodszy. The team's public tab proposes "Wiek od 9, do 10" and shows "Rocznik 2017 w sezonie 2026/27"; she keeps it.
4. In September, moving children to "Orliki 2017", the filter **Fits Orliki 2017** preselects the children born in 2017, whatever their birthday.

## UI and Interaction Contracts

The mockup has no screen for leaving, erasure, the 18th birthday or the season rollover: D-031 §8 adds them. Each is placed on the nearest mockup screen (the tabs of B-10 `screenPerson`, the Seasons tab of B-11, the profile M-10 `screenProfile`) and keeps that screen's layout. Polish texts that exist in the mockup are cited by key (`docs/ux-concept/mockups/i18n/pl.json`); new texts get new keys in the owning module's catalogs, in both locales, with the glossary's words.

Closest installed references: `people/components/PersonRecord.tsx` (tabs synced with `?tab=`), `people/components/AccountPanel.tsx`, `club_core/components/SectionInUseDialog.tsx` (a 409 with a list of records and links), `payments/components/GeneratePeriodDialog.tsx` (preview, then apply), `people/components/imports/ImportRecord.tsx` (a classified preview table before a commit), `people/components/club/ClubProfilePage.tsx` and `ConsentList.tsx` (member page with consents), `communication/components/club` (the member thread page). `.ai/guides/backend-ui.md` applies; implementation invokes `om-backend-ui-design`.

| Surface / route | Purpose and primary actions | Data source / mutations | Closest installed reference | Canonical shell / components | Required states | Requirement IDs |
|---|---|---|---|---|---|---|
| B-10 `/backend/people/persons/[id]?tab=account` | Account state; "Send the invitation again"; "Change login e-mail"; "Block" / "Unblock"; "Create account" (built) | `GET /api/people/persons/{id}`; `POST …/account/invitation`; `PUT …/account` | `AccountPanel.tsx` | `SectionHeader`, `StatusBadge`, `Button`, `useConfirmDialog`, `Input` | loading, each of the four states, warning (e-mail failed), 409, 429, 403 (actions hidden) | REQ-L01, REQ-L02 |
| B-10 `…?tab=leaving` (new tab, shown with `people.manage`) | Open requests; "Record a request"; "Leaving the club" (preview → confirm); "Return to the club"; "Anonymise"; "Delete person" | `GET/POST /api/people/departure-requests`; `POST /api/people/departures/preview`; `POST /api/people/departures`; `POST …/{id}/return`; `POST …/{id}/anonymize`; `DELETE /api/people/persons/{id}` | `SectionInUseDialog.tsx`, `ImportRecord.tsx`, `GeneratePeriodDialog.tsx` | `SectionHeader`, `DataTable` (preview rows), `Alert`, `useConfirmDialog` (typed confirmation for anonymise), `StatusBadge` | loading, nothing to end, blockers (links), warnings, choices missing, stale preview (409), success, 403 | REQ-L03, REQ-L04, REQ-L05 |
| B-10 `…?tab=roles` | "Staff setup" checklist; assign with an optional end date; "Edit" (dates, scope); "End on…" with a date | `GET/POST/PUT /api/people/role-assignments`; `POST …/{id}/end` (all built) | `RolesPanel.tsx`; the coordinator "until" date of `club_core/components/SectionCoordinators.tsx` | as today + `Dialog`, date `Input` | loading, empty (mockup `b.screenPerson.emptyRolesTitle`), 409 duplicate, 409 version, 422 dates | REQ-L09, REQ-L12 |
| B-10 `…?tab=guardians` | Start date on add and edit; in-place "Add a new person"; for an adult: "Own consents" with author and date | `POST/PUT /api/people/guardianships` (built); `POST /api/people/persons` ; `POST /api/people/persons/{id}/consents` | `GuardianshipsPanel.tsx` | `LookupSelect` + `PickerEmptyHint`, `InlineCreateDialog` | as today + empty picker, 409 duplicate person (PESEL) | REQ-L10, REQ-L12, REQ-L14 |
| B-10 `…?tab=details` and `/backend/people/persons/create` | External id (shown and sent with `people.pesel.view`, the feature that returns it); photo upload and removal | `PUT /api/people/persons`; `POST/DELETE /api/people/persons/{id}/photo` | `PersonForm.tsx`; `club_core/components/LogoPanel.tsx` | `CrudForm`, the logo panel's file control | 409 `external_id_duplicate`, 422 per file, upload progress | REQ-L12 |
| B-09 `/backend/people/persons` | Perspective "Former"; filter "Needs attention": may get an account, turns 18 within 30 days, adult without contact, missing consents | `GET /api/people/persons?view=former`, `?attention=…` | `PersonsTable.tsx` (perspective tablist and URL filters of the precedent spec, DD-U03) | `DataTable` filters, tablist | loading, empty per perspective, filtered-empty | REQ-L03, REQ-L06, REQ-L07, REQ-L10 |
| `/backend/people/first-administrator` (new; linked from a banner while the club has no administrator) | Pick a user of the organization, first and last name, confirm | `POST /api/people/first-administrator` | `PersonCreatePage.tsx` | `Page`, `PageBody`, `CrudForm` | loading, 409 `club_admin_exists` (the page then says who it is), 403, success → B-09 | REQ-L13 |
| B-02 `/backend/club/settings`, group "Consent texts" | One textarea per consent key, with the built-in text as placeholder and "last changed" | `GET/PUT /api/club_core/settings` | `ClubSettingsForm.tsx` | `CrudForm` group | loading, 422 length, 409 version | REQ-L10 |
| B-05 section page, Materials | "Rename" on a material | `PUT /api/club_core/sections/{id}/materials/{materialId}` (built; the title is already accepted) | `SectionMaterialsPanel.tsx` | inline `Input` with save and cancel | 409 version, 422 | REQ-L12 |
| B-07 contract form | Attachment: upload, download, remove (PDF ≤ 10 MB) | `POST/GET/DELETE /api/club_core/contracts/{id}/attachment` | `PlaceFilesPanel.tsx` (regulations PDF) | file control | 422 format or size, progress | REQ-L12 |
| B-11 `/backend/groups/seasons/rollover` (new; "Start a new season" on the Seasons tab) | Step 1 season; step 2 groups with actions; step 3 activities and fees; step 4 preview and apply; optional announcement | `POST /api/groups/seasons/rollover/preview`; `POST /api/groups/seasons/rollover` | `people/components/imports/ImportRecord.tsx`; `activities/components/PreviewPanel.tsx` and `ConflictList.tsx` | `Page`, stepper as the activity wizard (B-14), `DataTable`, `ConflictList` | loading, no group in the old season, conflicts, stale plan (409), partial scope note for a coordinator, success summary | REQ-L08 |
| B-19 `/backend/communication/threads/[id]` | "Edit" on one's own message; "edited" mark (built in the read model) | `PATCH /api/communication/threads/{id}/messages/{messageId}` | `ThreadRecord.tsx` delete action | inline `Textarea`, `useConfirmDialog` not needed | 409 `case_immutable`, 409 version, deleted or system message → action hidden | REQ-L12 |
| M-10 `/club/profile` | Adult: "My consents" (`m.screenProfile.consentRegulations`, `…consentImage`, `…consentTrips`) with the effect line and a confirmation on withdrawal; wards' consents get the same effect lines; notice card before and after an 18th birthday; link "Leave the club" | `GET/PUT /api/people/me` (built); `PUT /api/people/me/consents` | `ClubProfilePage.tsx`, `ConsentList.tsx` | `MemberShell`, design-system `Checkbox`, `Card`, confirm sheet | loading, error with retry, 409 version, saved | REQ-L06, REQ-L10 |
| `/club/profile/leave` (new member page; `requireAuth`, `people.self`) | Choose who leaves (self, wards), the last day, "Also delete our data", a note; send; see the open request and withdraw it | `GET/POST/DELETE /api/people/me/departure-requests` | `/club/messages/new` (Vereino member form) | `MemberShell`, `Checkbox`, date `Input`, `Textarea`, sticky submit bar | loading, error, open request (read-only with "Withdraw"), declined with the reason, sent, 409 | REQ-L03 |
| M-10 ward card and `/club/wards/[personId]` | Lines "May have an own account — ask the club" and "Turns 18 on {date}: from then {name} decides alone" | `GET /api/people/me` (adds `wards[].notices`) | `ClubWardPage.tsx` | `Card`, `StatusBadge` | — | REQ-L06, REQ-L07 |
| M-07 `/club/messages/[threadId]` | "Edit" on one's own message | the same `PATCH` | the member thread page's delete action (spec A adds delete on the phone) | inline `Textarea` | 409 `case_immutable`, 409 version | REQ-L12 |
| M-05 attendance list (owner: spec A) | Flags "no image consent", "no trip consent" beside a participant | the attendance read gains `consentFlags` from `people` | — | `StatusBadge` | — | REQ-L10 |

### UI architecture

| Role | Navigation groups in order | Dashboard / injected widgets | Login-to-primary-task flow |
|---|---|---|---|
| Club administrator | People → People → person → tabs (no new sidebar item); Classes / Zajęcia → Groups → Seasons → "Start a new season" (spec N's sidebar, `groups.nav.group`); Club → Settings | Two dashboard widgets (below): "Departure requests" and "People needing attention" | Notice "Kasia asked to leave" → person, tab Leaving → Preview → Confirm: 3 clicks |
| Section coordinator | Classes / Zajęcia → Groups → Seasons (panel, configuration); daily work on the phone (spec A) | none | Classes → Groups → Seasons → "Start a new season": 3 clicks |
| Guardian, participant, coach | Member "More" list (spec N) → Profile → "Leave the club" | none | Profile → "Leave the club" → Send: 3 taps |
| Technical administrator | Banner → "First administrator" | none | 2 clicks |

| Surface / widget | Empty state guidance and action | Responsive behavior | Keyboard / focus behavior |
|---|---|---|---|
| Leaving tab | "Nothing to end: this person has no membership, role or guardianship" + "Delete person" when allowed | Preview rows stack under 640 px | Confirm with Ctrl/Cmd+Enter, Escape cancels; focus moves to the first blocker |
| Season wizard | "No group belongs to season {name}" + link to Groups | Panel only; the table scrolls horizontally under 768 px | One action select per row, arrow keys; the stepper is a list of links |
| `/club/profile/leave` | Open request shown instead of the form | 375 px: one column, sticky submit above the bottom bar | Native date input; the checkbox list is a `fieldset` with a legend |
| My consents | — | 375 px: each consent a row with its effect line beneath | The confirmation sheet traps focus and returns it to the checkbox |
| Empty picker | See the pattern below | The hint wraps; the action is a full-width button under 640 px | The action is reachable by Tab right after the control; the dialog returns focus to the control |

**Dashboard widgets (B-01, gap c7).** Two platform dashboard widgets in `people`, built like `people/widgets/dashboard/sections-without-coordinator` (`people.dashboard.sectionsWithoutCoordinator`). Spec N places them; its dashboard table ("who sees which widget") gains rows 10 and 11 in N's next change. This spec does not edit N, so until then this table is the source:

| N row | Widget id (folder) | Content | Feature (with `dashboards.view`) | Administrator | Coordinator | Attendant | Phase | Empty state |
|---|---|---|---|---|---|---|---|---|
| 10 | `people.dashboard.departureRequests` (`people/widgets/dashboard/departure-requests`) | Open departure requests, oldest first, five rows: subject, requester, requested last day; each links to B-10 `?tab=leaving` | `people.manage` | yes | — | — | L4 | "No departure requests" |
| 11 | `people.dashboard.peopleNeedingAttention` (`people/widgets/dashboard/people-needing-attention`) | One count per B-09 "Needs attention" filter (may get an account, turns 18 within 30 days, adult without contact, missing consents), each a link to B-09 with the filter | `people.manage` | yes | — | — | L8 (the "missing consents" count needs L7) | "Nobody needs attention" |

Both read `people` APIs only (`GET /api/people/departure-requests?status=open&pageSize=5`, `GET /api/people/persons?attention=…&pageSize=1` per filter), cover loading, empty and error with retry, and are asserted in TEST-L05 and TEST-L10.

### The empty-picker pattern (REQ-L14)

One component pair in `packages/ui/src/admin/`: `PickerEmptyHint` (text and one action, rendered under a select or inside a lookup's empty slot) and `InlineCreateDialog` (a `CrudForm` with the minimum fields of the record, which returns the created option and selects it).

- **When the option source has no option at all:** "No {record} yet." plus, with the creating feature, "Add {record}"; without it, "Ask the club administrator to add one."
- **When a search finds nothing:** "No {record} found." plus, where the table says in-place, "Add '{term}'".
- **In-place** is used when the record needs at most four fields; otherwise a **link** opens the create page in a new tab and the picker reloads when the window regains focus.
- The feature is read from the session (`useGrantedFeatures`); the server refuses anyway. The hint never names a record the user may not read.

| # | Form (file) | Picker | Today | Pattern | Creating feature | Specified by |
|---|---|---|---|---|---|---|
| 1 | Place (`club_core/components/PlaceForm.tsx`) | Owner institution | silent empty select | in-place (name, kind) | `club_core.manage` | this spec |
| 2 | Contract (`club_core/components/ContractForm.tsx`) | Institution; person | silent empty select | in-place institution; link "Add person" | `club_core.manage`; `people.manage` | this spec |
| 3 | Guardians (`people/components/GuardianshipsPanel.tsx`) | Person | "No person found" | in-place (first name, last name, birth date, e-mail) | `people.manage` | this spec |
| 4 | Roles (`people/components/RolesPanel.tsx`) | Section; place | "No section found" / "No place found" | link to the create page | `club_core.manage` | this spec |
| 5 | Group (`groups/components/GroupForm.tsx`) | Section; age category; season | plain select; dictionary on a platform page | link (section); in-place entry (age category); in-place (season: name, dates) | `club_core.manage`; `dictionaries.*`; `groups.manage` | this spec |
| 6 | External team (`groups/components/ExternalTeamForm.tsx`) | Institution | a coordinator sees only "none", because the institution list is the administrator's | a names-only option source readable with `club_core.view` (`GET /api/club_core/institutions/options`), so a coordinator picks an existing institution; adding one stays the administrator's, with the hint "Ask the club administrator" | `club_core.manage` | this spec |
| 7 | Section coordinators (`club_core/components/SectionCoordinators.tsx`) | Person | no create path | link "Add person" | `people.manage` | spec N (B-05), as a consumer |
| 8 | Activity wizard and event forms (`activities/components/ActivityForm.tsx`, `EventForm.tsx`, member `ClubEventForm`) | Group; bookable place; coach; external team | help text only | link (group, place); hint (coach: "Add a coach membership in the group"); in-place (external team) | `groups.manage`; `club_core.manage` | spec A, as a consumer |
| 9 | Fee and order campaign (`payments/components/FeeForm.tsx`, `payments/components/orders`) | Group; activity | — | link | `groups.manage`; `activities.manage` | spec C, as a consumer |
| 10 | Zone rule, closure, rate, rental and maintenance dialogs (`facilities/components/*Form.tsx`, `RentalDialog.tsx`, `PlaceMaintainers.tsx`) | Place; renter; person | empty for the attendant | hint or link; the attendant's renter search is spec R's | `club_core.manage`; `people.manage` | spec R, as a consumer |
| 11 | Announcement audience (`packages/ui/src/admin/audience-picker.tsx`) | Section; group | — | hint with a link | `club_core.manage`; `groups.manage` | spec N, as a consumer |

Specs A, C, R and N describe a picker only where it behaves differently from this pattern.

Three notes on the rows, from the hand-overs of specs A and C:

- **Age categories (row 5).** Spec A puts the link "Edit age categories" beside the select (REQ-A02); this spec adds the in-place entry. The default categories seeded for a club (`groups/lib/groups-rules.ts:77-80`) start at "Skrzat (U6–U7)", while the mockup's youngest academy group is "Kids" (ages 4–5, `g-kids` in `app.ts`). Phase L3 adds the entry "Kids (U4–U5)" to the seeded list for new clubs; an existing club adds it in place.
- **Coach picker (row 8).** The activity's coach picker lists only people with a coach role or a coach or assistant membership. That is intended. Its empty or no-match hint reads "Only coaches are listed. Open the person's staff setup" and links to the Roles tab of B-10, where the checklist of REQ-L09 makes the person a coach.
- **Person record (B-10).** Three specs edit `people/components/PersonRecord.tsx`: this one (the Leaving tab, the staff-setup spot), spec C (the Charges tab through its injection spot, REQ-C07, C's phase 5) and spec A (nothing, it reuses the Groups tab). The tab order is Details, Guardians, Roles, Account, Groups, Charges, Leaving. The second pull request to land rebases on the first; neither changes the other's tab.

### B-10 `?tab=leaving` — Leaving the club

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Kowalska Kasia                          38 · has an account          │
│ [Details] [Guardians] [Roles] [Account] [Groups] [Charges] [Leaving] │
├──────────────────────────────────────────────────────────────────────┤
│ Request: Kasia asked on 12 Nov to leave with Jan and Ola,            │
│          last day 30 Nov, without deleting data.   [Decline] [Open]  │
├──────────────────────────────────────────────────────────────────────┤
│ Who leaves  [x] Kasia  [x] Jan (9)  [x] Ola (6)  [ ] Piotr (father)  │
│ Last day    [2026-11-30]                                             │
│ ── Will end ─────────────────────────────────────────────────────── │
│ Jan   Żaki — participant            until 30 Nov                     │
│ Kasia Guardian of Jan, Ola          until 30 Nov                     │
│ Kasia Account                       closed on 1 Dec                  │
│ ── Warnings ─────────────────────────────────────────────────────── │
│ Jan   Fee November, 120 zł, open ↗  stays with payer Kasia           │
│ ── Blocks ───────────────────────────────────────────────────────── │
│ (none)                                                               │
├──────────────────────────────────────────────────────────────────────┤
│                                   [Cancel]  [Confirm leaving]        │
└──────────────────────────────────────────────────────────────────────┘
```

- **Behavior:**
  - The preview reloads when a person is ticked or the date changes. "Confirm leaving" is disabled while a blocker or a missing choice remains.
  - For a coach the section "Sessions and activities" lists each group with its count of future sessions and a control: hand over to (a coach lookup) or leave unassigned.
  - After the last day the tab shows "Left on {date}" with "Return to the club", "Anonymise" (with a recorded request) and, for a person without history, "Delete person".
  - "Anonymise" asks for the person's last name and names what is erased now and what on the hold date.
- **Responsive and accessibility:** each preview section is a table with a caption; blockers are announced with `role="alert"`.
- **Localization:** `people.leaving.*`, `people.account.*` in en and pl; dates in the reader's locale.
- **Design-system and theming:** `StatusBadge` and `Alert` variants only; checked in light and dark mode.

### `/club/profile/leave` — Leave the club (phone)

```text
┌───────────────────────────────┐
│ ‹ Profile     Leave the club  │
├───────────────────────────────┤
│ Who leaves                    │
│ [x] Me (Kasia Kowalska)       │
│ [x] Jan Kowalski              │
│ [ ] Ola Kowalska              │
│ Last day        [30.11.2026]  │
│ [ ] Also delete our data      │
│     The club keeps payment    │
│     records as the law needs. │
│ Note (optional)               │
│ [                           ] │
├───────────────────────────────┤
│        [Send the request]     │
└───────────────────────────────┘
```

- **Behavior:** the club decides; the page says so and shows the open request with its date and "Withdraw". A coach sees one extra line: "The club will hand your sessions over and settle the cash you hold." A minor with an account does not see the link.
- **Responsive and accessibility:** 375 px, both locales, light and dark; touch targets at least 44 px; the submit bar stays above the bottom navigation.
- **Localization:** `people.club.leave.*`.

### Roster: moving children (REQ-L15)

| Surface / route | Purpose and primary actions | Data source / mutations | Closest installed reference | Canonical shell / components | Required states | Requirement IDs |
|---|---|---|---|---|---|---|
| B-12 `/backend/groups/groups/[id]?tab=roster`, view **Active** | Row action **Move…** (one child); row selection with the toolbar action **Move to another group** (several); filter chip **Fits {group}** once a target is chosen | `POST /api/groups/memberships/move` (one), `POST /api/groups/memberships/move-many` with `dryRun` then apply | `groups/components/RosterPanel.tsx` (views and row actions of #355); `payments/components/GeneratePeriodDialog.tsx` (preview, then apply) | `DataTable` row selection, `Dialog` with target group (`LookupSelect`, active groups of the caller's sections except this one), date (default the 1st of the next month, never in the past), preview list, **Move {n}** | no participant selected (action disabled with a hint); preview loading; nothing movable (apply disabled, reasons listed); stale preview (refreshed with a notice); success toast with **Undo**; 403 | REQ-L15 |
| `/club/groups/[id]` (spec A REQ-A11, phone roster) | The same two actions and the same dialog as a full-screen sheet | as above | spec A's phone roster | sheet, sticky **Move {n}** button | as above; 375 px, both locales, light and dark | REQ-L15 |
| B-10 `…?tab=groups` | History of memberships with both groups and dates after a move (existing tab, no change) | `GET /api/groups/memberships?personId=` | `groups` injection on the person record (#84) | — | — | REQ-L15 |

### Groups: age categories (REQ-L16)

| Surface / route | Purpose and primary actions | Data source / mutations | Closest installed reference | Canonical shell / components | Required states | Requirement IDs |
|---|---|---|---|---|---|---|
| B-11 `/backend/groups/age-categories` (new tab **Kategorie wiekowe** in `GroupsNav`, after Seasons) | The club's categories in the dictionary's order with "U od", "U do" and the birth years for a chosen season (default: the season of today); edit the range in the row; **Dodaj kategorię** (name and range in one dialog); a link to the platform dictionary page for renaming, reordering and deleting | `GET /api/groups/age-categories?seasonId=`, `PUT /api/groups/age-categories/{entryId}/range`, `POST /api/groups/age-categories` | `groups/components/SeasonsTable.tsx`; the in-place category create of #305 | `DataTable` with inline number inputs, `Dialog` | no dictionary (hint to the club administrator); category without a range ("brak zakresu"); 422 inverted range; read-only for a coordinator | REQ-L16 |
| B-12 team form and **Strona publiczna** tab | When a category with a range is chosen and the public age fields are empty, "Wiek od" and "Wiek do" are proposed as `u_from − 1` and `u_to` (editable; never overwritten once set); the tab shows "Rocznik {years} w sezonie {season}" | existing group fields | `GroupForm.tsx`, `GroupPublicForm.tsx` | inline hint | category without a range: no proposal | REQ-L16 |
| Roster dialog of REQ-L15 | The chip reads **Pasuje do {grupy} (rocznik {years})** for a team with a ranged category, **Pasuje do {grupy} ({from}–{to} lat)** otherwise | as REQ-L15 | — | — | target without a range and without ages: no chip | REQ-L15, REQ-L16 |

## Data Models

### `people_persons` (changed)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `left_on` | date, null | (`organization_id`, `left_on`) | no | set by the departure; cleared by "Return to the club"; never set on an anonymised return |
| `anonymized_at` | timestamptz, null | — | no | set once; never cleared |
| `erasure_hold_until` | date, null | partial index where not null | no | set with `anonymized_at` when a payment is under the hold; cleared when the job erases the name |
| `consents` | jsonb, default `{}` | — | personal data, not encrypted (as on the guardianship) | `StoredConsents`; written only through the P-08 transitions; only for a person aged 18 or more |
| `photo_attachment_id` | uuid, null | — | the file is in the private `attachments` partition | PNG, JPEG or WebP ≤ 5 MB, byte-checked as `club_core/api/uploads.ts`; deleted on anonymisation |

### `groups_age_category_ranges` (new)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `id` | UUID, required | primary key | no | immutable |
| `tenant_id` / `organization_id` | UUID, required | composite scope index | no | trusted context only |
| `age_category_entry_id` | UUID, required | unique (`organization_id`, `age_category_entry_id`) | no | an entry of the club's `groups.age_categories` dictionary; a row whose entry was deleted on the platform is ignored and removed by the next write |
| `u_from` | smallint, required | — | no | 1–99 |
| `u_to` | smallint, null | — | no | ≥ `u_from`; null = open |
| `created_at`, `updated_at` | timestamp, required | optimistic-lock version | no | — |

Seeded for the nine default categories by `groups` `seedDefaults` (new clubs) and by the migration for existing clubs whose entries still carry the default values (`kids` … `senior`); renamed or added entries get no range until the administrator sets one.

### `people_departure_requests` (new)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `id` | UUID, required | primary key | no | immutable |
| `tenant_id` / `organization_id` | UUID, required | composite scope indexes | no | trusted context only |
| `batch_id` | UUID, required | (`organization_id`, `batch_id`) | no | one value for the rows of one family request |
| `subject_person_id` | UUID, required | partial unique (`organization_id`, `subject_person_id`) where `status = 'open'` | no | the person who is to leave |
| `requested_by_person_id` | UUID, null | — | no | null when the administrator records a letter or the club's decision |
| `requester_kind` | text, required | — | no | `self`, `guardian`, `club` |
| `requested_last_day` | date, null | — | no | today or later |
| `erasure_requested` | boolean, default false | — | no | — |
| `note` | text, null | — | encrypted | ≤ 1000 characters |
| `status` | text, default `open` | (`organization_id`, `status`, `created_at`) | no | `open` → `done` or `declined`; a member may delete their own open request |
| `decided_by_person_id`, `decided_at`, `decline_reason` | UUID, timestamptz, text; null | — | `decline_reason` encrypted | set on the decision |
| `created_at`, `updated_at` | timestamp, required | optimistic-lock version | no | — |

Rows of an anonymised person keep ids and dates and lose `note` and `decline_reason`.

### `club_core_club_settings` and `club_core_contracts` (changed)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `club_core_club_settings.consent_texts` | jsonb, default `{}` | — | no | `{ <key>: { text, changedAt } }` for the six consent keys; `text` ≤ 1000 characters; an empty text removes the key |
| `club_core_contracts.attachment_id` | uuid, null | — | the file is in the private partition, readable with `club_core.contracts.manage` | one PDF ≤ 10 MB; a second upload replaces the first |

No table of `groups`, `activities`, `payments`, `communication` or `facilities` changes. Ownership: every new column belongs to the module of its table; cross-module references stay ids. All four migrations are additive and need the owner's approval (see *Rollout*).

## API, Command, and Error Contracts

Every route is a custom guarded command route with per-method `metadata` and `openApi`, like `people/api/persons/[id]/account/route.ts`; lists use `{ items, total, page, pageSize, totalPages }`. Updates send the record's version and surface 409. Error codes are declared in each module's `lib/error-codes.ts`.

| Method / command | Path / ID | Auth and feature gate | Input | Success response / event | Errors and concurrency | Requirement IDs |
|---|---|---|---|---|---|---|
| `GET` | `/api/people/persons/{id}` (extended) | as today | — | adds `account: { state, email, invitedAt, lastSignInAt }`, `leftOn`, `anonymizedAt`, `erasureHoldUntil`, `hasPhoto`; `externalId` and `consents` only with `people.manage` | as today | REQ-L01, REQ-L03, REQ-L12 |
| `POST` / `people.persons.resend_invitation` | `/api/people/persons/{id}/account/invitation` | auth + `people.accounts.manage`; `club_admin` grant | — | 200 `{ sentAt, warning? }`; audit entry | 404; 409 `invitation_not_pending`; 429; not undoable | REQ-L01 |
| `PUT` / `people.persons.update_account` | `/api/people/persons/{id}/account` | same | `{ email?, blocked? }` | 200 with the new `account`; `people.person.account_updated` | 409 `email_taken`; 422 `last_club_admin`; 409 version | REQ-L02 |
| `DELETE` / `people.persons.close_account` | `/api/people/persons/{id}/account` | same | — | 204; `user_id` cleared; `people.person.account_closed` | 422 `last_club_admin`; 409 `account_has_purpose` while an active role, guardianship or membership remains and the person has not left | REQ-L03 |
| `GET`, `POST`, `DELETE` | `/api/people/me/departure-requests` (+ `/{id}`) | auth + `people.self` | `{ subjectPersonIds[], lastDay?, erasure, note? }` | 201 with the batch; `people.departure_request.created` | 403 subject outside `self` and wards; 409 `departure_request_exists`; 422 for a minor caller; 429 (*Rate limits*) | REQ-L03 |
| `GET`, `POST`, `PUT` | `/api/people/departure-requests` | auth + `people.manage` | list filters; record `{ subjectPersonId, requesterKind, erasure, note }`; decline `{ id, reason }` | list; 201; 200 + notice to the requester | 409 version | REQ-L03, REQ-L05 |
| `POST` | `/api/people/departures/preview` | auth + `people.manage` | `{ personIds[], lastDay }` | `{ persons: [{ id, ends[], warnings[], blockers[], choicesNeeded[] }], suggestedPersons[], previewToken }` | 422 `departure_date_in_past` | REQ-L03, REQ-L04 |
| `POST` / `people.persons.depart` | `/api/people/departures` | same | `{ personIds[], lastDay, previewToken, handOver?: [{ groupId, toPersonId }] (a null `toPersonId` leaves the group's sessions unassigned), nextPayer?: [{ wardPersonId, guardianPersonId }], requestBatchId? }` | 200 summary; `people.person.departed` per person | 409 `departure_blocked`; 409 `departure_preview_stale`; 422 `departure_handover_required`, `departure_payer_required`; undoable only until the last day: the undo restores what `people` ended and calls each contributor's `undo` (hand-overs, default coaches, substitution entries, contract `valid_to`, maintainer rows); afterwards 409 `departure_undo_expired` | REQ-L03, REQ-L04 |
| `POST` / `people.persons.return` | `/api/people/persons/{id}/return` | same | — | 200; `left_on` cleared | 409 `person_anonymized` | REQ-L03 |
| `POST` / `people.persons.anonymize` | `/api/people/persons/{id}/anonymize` | auth + `people.persons.anonymize` | `{ requestId, confirmLastName }` | 200 `{ anonymizedAt, erasureHoldUntil }`; `people.person.anonymized` | 409 `anonymize_blocked` with the reasons; 422 `confirmation_mismatch`; not undoable | REQ-L05 |
| `DELETE` / `people.persons.delete` | `/api/people/persons/{id}` | auth + `people.manage` | — | 204; `people.person.deleted` | 409 `person_in_use` with the reasons; undoable | REQ-L05 |
| `PUT` / `people.persons.set_own_consents` | `/api/people/me/consents` | auth + `people.self`; adult | `{ changes: { regulations?, image?, trips? } }` | 200 with the consents | 422 `consents_minor`; 409 version | REQ-L10 |
| `POST` | `/api/people/persons/{id}/consents` | auth + `people.manage` | same | same | same | REQ-L10 |
| `POST`, `DELETE` | `/api/people/persons/{id}/photo` | auth + `people.manage` | multipart file | 200 / 204 | 422 `person_photo_format_unsupported`, `person_photo_too_large` | REQ-L12 |
| `POST` / `people.persons.bootstrap_admin` (existing command, new route) | `/api/people/first-administrator` | auth + `auth.users.create` (V-L04) | `{ userId, firstName, lastName }` | 201 `{ personId }` | 409 `club_admin_exists`; 404 user outside the organization | REQ-L13 |
| job / `people.persons.life_cycle` | scheduler `people:life-cycle`; CLI `mercato people life-cycle --tenant --org [--today] [--dry-run] [--register-schedule]` | job context | `{ today?, dryRun? }` (`--dry-run` prints the counts and writes nothing; `--register-schedule` registers the daily schedule after a real run, *Rollout*) | counts per rule; audit entry | idempotent; one person's failure is logged and retried next day | REQ-L06, REQ-L07, REQ-L03, REQ-L05 |
| `PUT` | `/api/club_core/settings` (extended) | auth + `club_core.manage` | `consentTexts?: { <key>: string }` (an empty string restores the built-in text) | 200; the read returns `{ text, changedAt }` per key | 422 length | REQ-L10 |
| `POST`, `GET`, `DELETE` | `/api/club_core/contracts/{id}/attachment` | auth + `club_core.contracts.manage` | multipart PDF | 200 / file / 204 | 422 `contract_attachment_format_unsupported`, `…_too_large` | REQ-L12 |
| `POST` | `/api/groups/seasons/rollover/preview` | auth + `groups.manage` + section scope | the plan (see *Vocabulary*) | what will be created, changed and ended, per module; conflicts; `previewToken` | 403 for a group outside the scope; 422 plan errors | REQ-L08 |
| `POST` / `groups.seasons.rollover` | `/api/groups/seasons/rollover` | same | the plan + `previewToken` + `announce: boolean` | 200 summary; `groups.season.rolled_over` | 409 `rollover_plan_stale`; 409 conflicts; not undoable (each created record is ended or deleted by its own command) | REQ-L08 |
| `POST` / `groups.memberships.move` | `/api/groups/memberships/move` | auth + `groups.manage` + both groups in scope | `{ membershipId, toGroupId, date }` | 200 both memberships; the existing `groups.membership.*` events | 409 overlap; 409 version | REQ-L11 |
| `POST` / `groups.memberships.move_many` | `/api/groups/memberships/move-many` | auth + `groups.manage` + the source and the target group in scope | `{ fromGroupId, toGroupId, date, membershipIds: string[] (1–100, participants of fromGroupId), dryRun?: boolean, previewToken?: string }` | `dryRun`: `{ items: [{ membershipId, personId, outcome: 'move' \| 'skip_already_member' \| 'skip_not_active', futureDeclarations, feeNote }], previewToken }`; apply: `{ moved: n, skipped: n }` and one `groups.membership.*` event pair per moved child; one undo token | 409 `move_preview_stale`; 422 `move_same_group`, `move_target_inactive`, `move_date_in_past`, `move_too_many`; 403 scope | REQ-L15 |
| `GET` | `/api/groups/age-categories` | auth + `groups.view` | `seasonId?` | `{ items: [{ entryId, value, label, uFrom, uTo, birthYears: { from, to } \| null }], referenceYear }` | — | REQ-L16 |
| `PUT` / `groups.age_category_ranges.set` | `/api/groups/age-categories/{entryId}/range` | auth + `dictionaries.manage` | `{ uFrom, uTo? }` | 200 the row; audit; undoable | 422 `age_range_inverted`; 404 not an entry of the club's dictionary | REQ-L16 |
| `POST` / `groups.age_categories.create` | `/api/groups/age-categories` | auth + `dictionaries.manage` | `{ label, uFrom, uTo? }` | 201 the dictionary entry with its range, in one transaction | 409 a category with that name exists; 422 range | REQ-L16 |
| contract `DepartureContributor` | DI `people.departure.<module>` | called by `people` only | `preview(em, subject, lastDay)`; `apply(em, subject, lastDay, choices)` → `{ snapshot, changes }`; `undo(em, subject, snapshot)` → `changes`; `afterCommit(changes, ctx)` (events, cache, search; table under *Proposed Solution*); `hasHistory(em, subject)`; `payments` also `retentionHoldUntil(em, subject)`; optional `erase(em, subject)` → `{ touched, kept }` in the anonymisation's transaction (`payments`, `facilities`; S9.6, #528) | items, warnings, blockers | `preview`, `apply` or `undo` throws → the whole departure or undo rolls back; `afterCommit` failures are logged and retried, never rolled back | REQ-L03…REQ-L05 |
| contract `SeasonContributor` | DI `groups.season.<module>` | called by `groups` only | `preview(em, plan)`, `apply(em, plan)` | items and conflicts | throws → the whole rollover rolls back | REQ-L08 |
| `GET` | `/api/club_core/institutions/options` | auth + `club_core.view` | `search?` | `{ items: [{ id, name }] }`, names only, `no-store` | 401, 403 | REQ-L14 |
| contract (additive) | `people` person directory: `consentFlags(personIds, ctx)` | `activities` | person ids of one session | `{ personId, image: boolean, trips: boolean }[]` from the active guardianship or the adult's own consents | absent `people` → no flags | REQ-L10 |

Reused without change: `PUT /api/people/role-assignments` and `POST …/{id}/end` (`validTo`), `PUT /api/people/guardianships` (`validFrom`), `PUT /api/people/persons` (`externalId` is already in `personFields`), `PUT …/materials/{materialId}` (`title`), `PATCH …/messages/{messageId}`.

## Events, Jobs, Notifications, and Cross-Module Flows

| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit behavior |
|---|---|---|---|---|
| `people.departure_request.created` | `people` | `people` subscriber | In-app notice and e-mail to the club administrators | Key `people:departure-request:{batchId}` |
| `people.person.departed` | `people` | `people` role sync (as `people/subscribers/sync-auth-roles.ts`); `people` notice to the requester | Roles re-derived on the last day by the daily sync; confirmation e-mail | Idempotent; audit entry of the command lists what ended |
| `groups.membership.updated` with an end date (existing event) | `groups` | new `activities` subscriber | Deletes the person's attendance rows without an actual mark for that group's sessions after the end date | Idempotent; covers the departure and the group move |
| `people.person.came_of_age` | `people` (life-cycle job) | new `activities` subscriber | `pending_guardian` declarations for sessions on or after the birthday become final | Idempotent |
| `people.person.anonymized` | `people` | `people` search indexer; `facilities` subscriber | Search tokens removed; the person's contact snapshots on rentals cleared; `payments` keeps ids only and changes nothing | Each consumer idempotent; a failure retries and is reported |
| `people.person.account_updated`, `people.person.account_closed` | `people` | none in 1.0 | Audit only | — |
| `groups.season.rolled_over` | `groups` | `groups` subscriber when `announce` | One post per continued group thread through `communication.threads.create`: the new season and the first session | Key `groups:season:{seasonId}:{groupId}` |
| scheduler `people:life-cycle` (daily, per club, registered through `registerModuleSchedule` in `people/services/club-setup.ts`, like the `people:sync-role-expiry` worker) | scheduler | `people.persons.life_cycle` | See below | Idempotent; counts in the audit entry; catches up missed days (rules compare dates with `<=`) |

The life-cycle job, per club, on `today` in the club's time zone:

1. **T−30:** for each person who turns 18 within 30 days and has not been told: notice `people.turns_18_soon` to the active guardians, to the person when they have an account or an address, and to the administrators. Key `people:turns-18-soon:{personId}`.
2. **Birthday:** for each person aged 18 with a guardianship that started before the birthday and is still active: copy the consents, end the guardianships the day before the birthday, emit `people.person.came_of_age`, send `people.came_of_age`. The payer role is granted by the existing role sync.
3. **Account age:** for each person without an account whose age reached `own_account_min_age` and who was not told: notice `people.account_age_reached` to the guardians and the administrators. Key `people:account-age:{personId}:{threshold}`.
4. **Dated departures:** close the account of every person with `left_on` < today (Q-L09).
5. **Erasure step two:** for each person with `erasure_hold_until` < today: clear the name and the hold date. Registered only once migration B (phase L6) has landed (phase L8, *Guard for step 5*).

Templates are in a new `people/emails` folder (as `payments/emails`) and the `people` notification types, rendered in the recipient's language (MSG). No message contains a birth date, a PESEL or an amount.

## Security, Privacy, and Compliance

- **Authorization:** every new route has `requireFeatures`; the commands use `authorizeScoped` with the allowed grant kinds (`club_admin` for accounts, departure and erasure; `club_admin` or the section's `coordinator` for the rollover and the group move; `self` and `guardian` for the member routes). Erasure has its own feature, `people.persons.anonymize`, so a later role can hold `people.manage` without it. No role is checked by name.
- **Tenant isolation:** scope from the session on every query; contributors and the job receive it as an argument; a preview token is bound to the tenant, the organization, the actor and the input, and expires after 15 minutes.
- **Who may start what (conservative defaults, DD-L06):**
  - A member asks; only the administrator decides a departure and an erasure.
  - A guardian asks only for themself and their own active wards. One guardian's request for a child with a second active guardian is shown to the administrator with that fact.
  - A minor asks for nothing.
  - The administrator may record the club's own decision (for example a member who stopped coming) with a note.
- **Erasure (CM Q-019):**
  - Nothing is erased without a request. There is no time-based deletion.
  - Erased at once: phone, e-mail, notes, PESEL and its hash, external id and its hash, photo, birth date, locale, the three `…_at` consents, `consents`; the consents on the person's ended guardianships; the notes of their departure requests; staged import rows that matched the person; the search tokens. In the same transaction (S9.6, #528) every departure contributor with the optional `erase` clears its part — `payments`: the contact e-mail, phone and notes of orders the person placed, the print name and notes of orders for them, a typed payer label on charges naming them; `facilities`: the contact snapshots of their rentals — and `foundation` clears the person and account ids, address hash and secret parameters of their deliveries (`eraseRecipientDeliveries`).
  - The audit entry of `people.persons.anonymize` (S9.6) lists `tablesTouched` (each table with its changed row count) and `keptData` (each kept category with its legal basis, its row of `docs/compliance/retention.md` and its tables), never an erased value.
  - Kept: the person id on attendance, units, substitution entries, charges, payments, receipts, messages and audit entries. Screens show "Former member" in place of the name.
  - The name is kept under the retention hold (DD-L07) and is readable only with `people.manage`. Bank statement rows keep the sender data of the statement: they are accounting evidence under PAY's retention.
  - Audit snapshots written before the erasure hold old values, encrypted at rest. V-L03 checks whether the platform can purge them per record; until then this is a recorded residual risk.
  - The request, the decision and the two erasure times are kept as the proof that the club answered.
- **The 18th birthday:** the guardian's read of the ward ends with the guardianship, on the server (`people/services/scope-service.ts` reads active guardianships), not only in the interface. Notices name the person and the date of the change, never the birth date.
- **Sensitive data:** the request note and the decline reason are encrypted (`people/encryption.ts`); the photo and the contract PDF are in the private `attachments` partition and are read through scoped routes; a coordinator's basic read gains `leftOn` and nothing else; consent flags go to the coach of the session only, as two booleans.
- **Abuse and failure modes:** the re-send is rate-limited per account (3 in 5 minutes) and per administrator; a login e-mail change cannot take an address used in the tenant; the last administrator cannot be blocked, closed or made to leave; anonymisation needs the typed last name; the departure and the rollover apply in one transaction or not at all; a member can file at most 5 departure requests in 24 hours (429).
- **Rate limits (gap c5).** The route `metadata.rateLimit` in use today (`activities/api/declaration-links/route.ts:23`) is keyed per client IP, so it cannot count per account. Both limits use the installed limiter instead: the platform `RateLimiterService`, which `@open-mercato/core/bootstrap` registers in the container as `rateLimiterService`, consumed with `checkRateLimit(service, config, key, message)` from `@open-mercato/shared/lib/ratelimit/helpers` (the app's API dispatcher `packages/app/src/app/api/[...slug]/route.ts` already imports both). The route calls it before the command; no Vereino cache or table holds counters.

  | Limit | Key | Config | When the limiter is absent or degraded |
  |---|---|---|---|
  | Re-send per account | `people_resend_invitation:{tenantId}:{personId}` | 3 points / 300 s | fails open, as the platform default; the command still refuses a non-pending account |
  | Re-send per administrator | `people_resend_invitation_actor:{tenantId}:{userId}` | 20 points / 3600 s | fails open |
  | Departure requests per member | `people_departure_request:{tenantId}:{callerPersonId}` | 5 points / 86400 s | fails open; the one-open-request index still bounds the rows |

  A 429 carries `Retry-After`, which the Account tab and the phone page turn into "try again in N minutes". TEST-L01 and TEST-L05 run with the limiter enabled for the case that asserts the 429.

## Integration Coverage

Tests are self-contained (own tenant, users and records) and run with `yarn test:integration:vereino --filter <TEST-ID>`. Phone tests run at 375 px in pl and en, light and dark.

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-L01 | integration + UI | a person with an invited account; one with an active account | open the Account tab; send again; send four times; make the e-mail fail | state shown; the new link works and sets a password; 409 for the active account; 429; warning on failure | REQ-L01 |
| TEST-L02 | integration | invited and active accounts; a club with one administrator | change the login e-mail (free, taken); block and unblock; block the only administrator | the invitation follows the new address; 409 `email_taken`; a blocked user's session ends and sign-in is refused; 422 `last_club_admin` | REQ-L02 |
| TEST-L03 | integration + UI | a guardian with an account, two wards in two groups, a second guardian without other wards | preview; confirm with a future last day; undo it and confirm again; run the job with `--today` after it; try the undo then; return one child | every row has `valid_to`; `groups.membership.updated` emitted per ended membership after the commit; the undo restores every `valid_to` and the next confirm works; accounts closed the next day; the late undo answers 409 `departure_undo_expired`; guardian scope empty; former perspective lists them; the return clears the date only | REQ-L03 |
| TEST-L04 | integration | a guardian who is the only guardian of a staying ward; a primary payer of a staying ward; the only administrator | depart each; change data between preview and apply; use a past date | 409 `departure_blocked` naming the ward; 422 `departure_payer_required`; 422 `last_club_admin`; 409 `departure_preview_stale`; 422 date; nothing changed | REQ-L03 |
| TEST-L05 | UI (phone) | guardian, adult participant, coach, minor with an account | open `/club/profile/leave`; send; withdraw; the administrator declines with a reason; name another family's child through the API | the request shows on B-10 and in the dashboard widget "Departure requests"; the reason shows on the phone; the minor has no link; 403; 409 for a second open request; with the limiter enabled, a sixth request in 24 hours answers 429 with `Retry-After` | REQ-L03 |
| TEST-L06 | integration + UI | a coach with 6 future sessions in two groups, a default-coach activity, a contract, a maintainer row and cash held | preview; apply without a choice; settle the cash (fixture); hand one group over and leave one unassigned; a coordinator names a coach of another section | blocker with the amount; 422 `departure_handover_required`; sessions carry the new coach or null from the day after; substitution entries written; contract ended; maintainer row gone; `activities.occurrence.coach_changed` / `…coach_unassigned`, `club_core.contract.updated` and `facilities.place_maintainer.deleted` emitted after the commit; an undo before the last day restores coaches, default coach, contract and maintainer row and removes the substitution entries, and leaves alone a session whose coach was changed since; 403 | REQ-L04 |
| TEST-L07 | integration | a former person with a payment this year; one without payments; a second tenant | anonymise without a request, with an open charge, with a wrong name, then correctly; run the job after the hold date; search by the old name; open a thread and an attendance list | 409 with reasons; 422; contact fields null at once; name kept with the hold, then cleared; no search hit; "Former member" on the screens; no undo; the other tenant untouched | REQ-L05 |
| TEST-L08 | integration | a person without history; a person with one attendance | delete both; undo the first | 204 and `people.person.deleted`; 409 `person_in_use`; the undo restores | REQ-L05 |
| TEST-L09 | integration | a ward 17 years and 335 days old with two guardians, consents given by one, an account, an open charge, a `pending_guardian` declaration; a ward without a birth date; a guardianship created after 18 | run the job at T−30 twice, then on the birthday twice; generate the next period; read the calendar and charges as the former guardian | one notice per recipient; guardianships end the day before; consents copied with author and date; the old charge keeps its payer, the new one names the adult; the declaration is final; the former guardian gets 403 and no ward; the later guardianship stays; the skipped person is listed | REQ-L06 |
| TEST-L10 | integration + UI | a child one day under the threshold; a club that lowers the threshold | run the job on the day, and again; lower the threshold and run | one notice to guardians and administrators; B-09 "may get an account" lists the child; the dashboard widget "People needing attention" counts the child under that filter and links to it; a new notice after the change only for the newly eligible | REQ-L07 |
| TEST-L11 | integration + UI (phone) | an adult participant; a guardian; a 17-year-old with an account; a coach of their group; a coordinator | the adult gives and withdraws each consent; the minor tries through the API; open the attendance read as the coach; read the person as the coordinator | stored with author and date; the effect line and the confirmation appear; 422 `consents_minor`; flags present for the coach; no consents in the coordinator's read | REQ-L10 |
| TEST-L12 | integration + UI | a club with built-in texts and one given consent | change a consent text; open the profile; send 1001 characters | the phone shows the club's text; the earlier consent reads "given to an earlier wording" and stays valid; 422 | REQ-L10 |
| TEST-L13 | integration + UI | a person with a role, a guardianship, a material, a thread with own and others' messages, a case | assign a role with an end date; edit its dates; end it on a future date; set a guardianship start date; type an external id used by another person; rename a material; edit a message in the panel and on the phone; edit in a case | each value stored and shown; 409 `external_id_duplicate`; "edited" mark; no edit on others' messages; 409 `case_immutable` | REQ-L12 |
| TEST-L14 | UI + unit | a club without institutions, sections, seasons and people; an administrator and a coordinator | open forms 1–6 of the picker table as each | the hint and the right action per feature; an in-place create selects the new record; the coordinator sees "Ask the club administrator"; the component has full unit coverage | REQ-L14 |
| TEST-L15 | UI | a tenant with a platform user and no club administrator | first-administrator page; then add a place with a new institution, a child with a new guardian, a section, a group | no step needs the command line or a second visit to another module's menu; a second call answers 409 `club_admin_exists` | REQ-L13, REQ-L14 |
| TEST-L16 | integration + UI | a season with four groups in two sections, recurring activities, fees, and a rental that collides with one copied activity | preview and apply a plan with continue, rename, close and copy; change a group between preview and apply; apply twice; run as the coordinator of one section; announce | groups, memberships, `ends_on` and `valid_to` as planned; copies start on the new dates with the new amount; the conflict stops the whole plan; 409 `rollover_plan_stale`; the second apply changes nothing; the other section untouched; one post per continued group | REQ-L08 |
| TEST-L17 | integration | a child in group A with declarations for future sessions and a generated monthly charge; group B with its own fee | move the child on the 15th; generate the same period again; generate the next period | A's future declarations gone, B's sessions undeclared; one charge for the month; the next month charges B's fee | REQ-L11 |
| TEST-L18 | integration + UI | a new person; an administrator and a coordinator | follow the staff checklist; upload a photo and a contract PDF; upload an SVG renamed `.png` | each row turns done; the coordinator has no account or contract action; files stored privately; 422 on the fake image | REQ-L09, REQ-L12 |
| TEST-L19 | unit | — | `people/lib/life-cycle-rules.ts`, `people/lib/departure-rules.ts`, `groups/lib/season-rollover.ts`, the account-state function in `@vereino/core` | 100 % line, branch and function coverage (AGENTS.md) | REQ-L01…REQ-L11 |
| TEST-L20 | security | a second tenant; users without each feature | call every new route of the phase (each phase that adds a route lists TEST-L20: L1, L3, L4, L6, L7, L9, L10) | fail closed: 403 or 404, no data of the other tenant, no contributor called | all |
| TEST-L21 | integration | group "Kids" with eleven participants, one already in "Skrzaty", two with future declarations, a September fee in both groups, generated September charges | preview a move of seven to "Skrzaty" on 1 September; apply; generate September again; undo; change one membership between preview and apply | the preview lists six moves and one skip with reasons; after apply both rosters and the B-10 history match; one September fee per child; undo restores both groups and the declarations; a changed membership gives 409 `move_preview_stale`; a coordinator of another section gets 403 | REQ-L15, REQ-L11 |
| TEST-L22 | UI | as TEST-L21, a target group with the age range 6–7 | select via **Fits Skrzaty**, untick one, move, undo from the toast, on the panel and at 375 px | the filter preselects by age on the move date; the dialog states are as in the UI contract; both locales, light and dark | REQ-L15 |
| TEST-L23 | integration + unit | a club with the seeded categories, a season starting 2026-09-01, children born 2015–2018 | read the categories for that season; set Orlik młodszy U10–U10; create a team with it; move children with **Fits** | Orlik U10–U11 shows 2016–2017; the team's public tab proposes 9–10 and "Rocznik 2017"; the filter preselects the 2017 births only; an inverted range gives 422; a coordinator cannot change a range (403); the birth-year rule has 100 % coverage in `groups/lib/groups-rules.ts` | REQ-L16 |

## Implementation Phases

Validation for each phase: `yarn verify`, the phase's integration tests, and for a phase with a migration the SQL review from `yarn db:generate`, shown in the phase's pull request before it is applied (owner decision 2026-11-16; no `yarn db:migrate` against a dev or real database). Each phase is one pull request and leaves a working app.

Each phase maps to one story of epic #255: L1 → #303 (S01), L2 → #304 (S02), L3 → #305 (S03), L4 → #306 (S04), L5 → #307 (S05), L6 → #308 (S06), L7 → #309 (S07), L8 → #310 (S08), L9 → #311 (S09), L10 → #312 (S10), L11 → #383 (S11), L12 → #384 (S12).

Implementation state (close-out #452, 2026-11-20): every phase landed — L1 Done (#339), L2 Done (#371), L3 Done (#346), L4 Done (#365), L5 Done (#431), L6 Done (#437), L7 Done (#412), L8 Done (#414), L9 Done (#406), L10 Done (#415), L11 Done (#429), L12 Done (#424). Left: TEST-L22 (the panel and phone UI of L11) is quarantined as `test.fixme` (#433); the "Fits" filter of REQ-L15 still uses the target group's age range, not the birth years of REQ-L16 (`fitsAgeCategory` in `groups/lib/groups-rules.ts` has no caller); the 18th-birthday lines on the ward card (AC-L07) have no phone UI test.

### Cross-spec dependencies (gaps c1, c2, c11)

State on 2026-11-16: spec N (`2026-11-14-vereino-parity-navigation-and-naming.md`) is `Ready for implementation`, with its phase 2 (#256) and phase 3 (#257) landed and phase 1 landed only in part (#246: the Club group; `overrides.nav.groupOrder`, the shared `groups.nav.group` "Classes / Zajęcia" and the other menu labels are still open). Specs A (`…-parity-groups-and-activities.md`), C (`…-parity-payments.md`) and R (`…-parity-facilities.md`) are `Draft` and are being made Ready in parallel; this spec does not edit them. Where a phase needs one of them and it has not landed, the phase names the fallback it ships with.

| Phase | Needs | What exactly | Without it |
|---|---|---|---|
| L1, L2, L3 | spec N phases 1–3 (D-031: N's sidebar, tabbed pages and glossary come before any other spec builds UI) | new texts in the glossary's words (N phase 3, landed); no new sidebar item: the first-administrator page (L3) is `navHidden` and reached from its banner, so N phase 1's remainder does not block them | — (may start now) |
| L4 | spec A phase 2 (REQ-A03: end on a chosen last day; `DELETE /api/groups/memberships`) | the `groups` contributor's end and delete | the existing `groups.memberships.end`; a membership that has not started yet is ended with `valid_to` = the last day instead of removed |
| L4 | spec C phase 5 (REQ-C06) | open charges of a staying ward without a payer get the next payer named at the departure | the next payer becomes primary payer on the day after the last day; existing open charges keep their payer until C's rule lands, and the preview says so |
| L4 | spec N phase 6 (dashboard frame) | slot for `people.dashboard.departureRequests` (N's widget table, row 10) | the widget shows on the platform dashboard in the default order |
| L5 | #118 (B-33 "Cash to settle", referenced by spec C) | clearing the cash blocker | the blocker is shown and cannot be cleared in the app; S05 is scheduled after #118 (owner decision 2026-11-16) |
| L7 | spec A phase 7 (M-05 attendance surfaces) | A draws the `image` and `trips` flags on M-05 from `consentFlags` | the contract ships and is tested through the API (TEST-L11) |
| L8 | spec N phase 6 | slot for `people.dashboard.peopleNeedingAttention` (N row 11) | as for L4 |
| L9 | spec N phase 1 (remainder) | the "Classes / Zajęcia → Groups → Seasons" path | the wizard is reached from the existing Seasons tab of `GroupsNav`, under today's "Groups" sidebar group |
| L9 | spec A phase 2 (REQ-A03) | the action `close` ends memberships on the old season's last day | the existing `groups.memberships.end` |
| L10 | spec A phase 2 (the roster views and row actions, built in #355; a roster opened with a preselected person) | the staff checklist's "Add to a group as coach"; the "Move…" row action is built by L10 itself (REQ-L15), since #355 shipped none | the move route ships with its test (TEST-L17); the checklist row links to the group's roster without preselection |
| L10 | spec C (the skip rule in charge generation, agreed on 2026-11-16) and spec C phase 5 (REQ-C07, the Charges tab on B-10) | the skip rule in `payments/lib/charge-plan.ts`; the tab order Details, Guardians, Roles, Account, Groups, Charges, Leaving in `PersonRecord.tsx` | the second of L10 and C phase 5 to land rebases on the first; neither changes the other's tab |
| — | spec R | consumer of the picker pattern only (row 10 of the picker table) | — |

### Phase L1 — Account state, invitation again, login e-mail, block

- **Depends on:** spec N phases 1–3 (*Cross-spec dependencies*: no new sidebar item, so it may start now)
- **Outcome:** J-L01 works end to end.
- **Why this order / value delivered:** the smallest of the four decisions and the one administrators meet weekly.
- **Deliverables:** step 1 runs V-L02 (V-L01 is decided: the fallback); `foundation/services/accounts.ts` (`accountState`, `resendInvitation` on `requestPasswordReset`, `updateAccount`, `closeAccount` with the effects of *Closing an account*); the per-account and per-administrator limits through `rateLimiterService` (*Rate limits*); `people/commands/accounts.ts` (three commands); routes under `people/api/persons/[id]/account/`; `AccountPanel.tsx`; the pure account-state function in `packages/core`; error codes and i18n.
- **Independent slices / estimated commits:** (a) foundation and core: 1; (b) commands and routes: 1; (c) the panel: 1.
- **Requirements closed:** REQ-L01, REQ-L02
- **Tests:** TEST-L01, TEST-L02, TEST-L19 (account state), TEST-L20 (these routes)
- **Validation:** as above
- **Exit gate:** J-L01 in the browser in both locales, light and dark.

### Phase L2 — Fields the APIs already accept

- **Depends on:** spec N phases 1–3 (*Cross-spec dependencies*: forms only, may start now)
- **Outcome:** role assignment dates and edit, guardianship start date, external id, material rename and message edit are usable.
- **Why this order / value delivered:** no schema; removes five audit rows at once.
- **Deliverables:** `RolesPanel.tsx`, `GuardianshipsPanel.tsx`, `PersonForm.tsx`, `club_core/components/SectionMaterialsPanel.tsx`, `communication/components/ThreadRecord.tsx` and the member thread page under `communication/components/club`.
- **Independent slices / estimated commits:** one per module: `people`, `club_core`, `communication`.
- **Requirements closed:** REQ-L12 (all but the photo and the contract attachment)
- **Tests:** TEST-L13
- **Validation:** as above
- **Exit gate:** each field round-trips in the browser; message edit at 375 px in both locales, light and dark.

### Phase L3 — Empty pickers and the first administrator

- **Depends on:** spec N phases 1–3 (*Cross-spec dependencies*: the first-administrator page is `navHidden`, so it may start now)
- **Outcome:** J-L08 works end to end.
- **Why this order / value delivered:** specs A, C, R and N consume the component, so it lands early.
- **Deliverables:** `packages/ui/src/admin/picker-empty-hint.tsx` and `inline-create-dialog.tsx` with unit tests; the shared features hook; forms 1–6 of the picker table; the institutions options route; the seeded age category "Kids (U4–U5)" with its unit test; `people/backend/people/first-administrator/`, its route and the banner; a `yarn setup` note in `README.md`.
- **Independent slices / estimated commits:** (a) the component: 1; (b) `club_core` and `people` forms: 1; (c) `groups` forms: 1; (d) the first administrator: 1.
- **Requirements closed:** REQ-L13, REQ-L14
- **Tests:** TEST-L14, TEST-L15, TEST-L20 (the institutions options route and `POST /api/people/first-administrator`)
- **Validation:** as above; step 1 runs V-L04
- **Exit gate:** the walk-through of TEST-L15 passes on a fresh tenant.

### Phase L4 — Leaving the club: members and guardians

- **Depends on:** phase L1 (`closeAccount`). Cross-spec (*Cross-spec dependencies*): spec A phase 2 (REQ-A03) for the `groups` contributor, with the `groups.memberships.end` fallback until it lands; spec C phase 5 (REQ-C06) for the payer of open charges at the hand-over; spec N phase 6 for the widget's slot.
- **Outcome:** J-L02 works end to end.
- **Why this order / value delivered:** the common case; it builds the contributor seam the next phases reuse.
- **Deliverables:** migration A (`people_persons.left_on`, `people_departure_requests`; approved 2026-11-16); `people/services/departure.ts` (the contract with `preview`, `apply`, `undo`, `afterCommit`, `hasHistory`, and the tokens); `people/lib/departure-rules.ts`; `people/commands/departures.ts` with its undo; the routes, with the departure-request limit through `rateLimiterService`; the Leaving tab; `/club/profile/leave`; the `groups` contributor (`groups/di.ts`) with its undo and its `afterCommit` events; the `activities` subscriber that drops undecided declarations; the perspective "Former" and the exclusion from pickers and audiences, including `packages/core/src/audience.ts`; the dashboard widget `people.dashboard.departureRequests`; the `BACKWARD_COMPATIBILITY.md` note.
- **Independent slices / estimated commits:** (a) the migration and rules: 1; (b) command, preview, undo and `groups`: 2; (c) the panel tab and the widget: 1; (d) the phone page and requests: 1.
- **Requirements closed:** REQ-L03
- **Tests:** TEST-L03, TEST-L04, TEST-L05, TEST-L19 (departure rules), TEST-L20 (the departure, request and return routes)
- **Validation:** as above
- **Exit gate:** J-L02 in the browser; the phone page at 375 px, both locales, light and dark.

### Phase L5 — Leaving the club: coaches and staff

- **Depends on:** phase L4 and #118. Resolving the cash blocker needs B-33 (issue #118, referenced by spec C); without it the blocker is shown and cannot be cleared in the application, so S05 (#307) is scheduled after #118 (owner decision 2026-11-16, Q-L05).
- **Outcome:** J-L03 works end to end.
- **Why this order / value delivered:** closes D-031 §8b for staff.
- **Deliverables:** contributors in `activities` (sessions, default coach, substitution entries), `payments` (cash held, open charges, `retentionHoldUntil`), `club_core` (contracts) and `facilities` (maintainer rows), each with its `undo` and its `afterCommit` events (table under *Proposed Solution*); the hand-over controls on the Leaving tab.
- **Independent slices / estimated commits:** one per contributing module.
- **Requirements closed:** REQ-L04
- **Tests:** TEST-L06
- **Validation:** as above
- **Exit gate:** J-L03 in the browser; freed sessions appear in the "needing a coach" list.

### Phase L6 — Erasure and removal

- **Depends on:** phases L4 and L5 (`hasHistory`, `retentionHoldUntil`). Q-L01 is answered (2026-11-16: keep the retention hold)
- **Outcome:** J-L04 works end to end.
- **Why this order / value delivered:** completes CM's deferred `people.persons.anonymize`.
- **Deliverables:** migration B (`anonymized_at`, `erasure_hold_until`; approved 2026-11-16); the feature in `people/acl.ts`, its grant in `people/setup.ts` and `yarn mercato auth sync-role-acls` (`BACKWARD_COMPATIBILITY.md` §4); `people.persons.anonymize` and `people.persons.delete`; the "Former member" label in `people/services/person-directory.ts`; the `facilities` subscriber; the Leaving tab actions; step 1 runs V-L03.
- **Independent slices / estimated commits:** (a) commands: 2; (b) consumers and labels: 1; (c) UI: 1.
- **Requirements closed:** REQ-L05
- **Tests:** TEST-L07, TEST-L08, TEST-L20 (the anonymise and delete routes; a user with `people.manage` but without `people.persons.anonymize` gets 403)
- **Validation:** as above
- **Exit gate:** J-L04 in the browser; a database read of the person shows no contact value.

### Phase L7 — Consents: the adult's own, effects, texts

- **Depends on:** none in this spec. Cross-spec: spec A phase 7 draws the flags on M-05; the contract ships here and is tested through the API until then.
- **Outcome:** an adult manages their consents on the phone; texts are the club's.
- **Why this order / value delivered:** phase L8 copies consents into the column this phase adds.
- **Deliverables:** migration C (`people_persons.consents`, `club_core_club_settings.consent_texts`; approved 2026-11-16); `people.persons.set_own_consents`; `ClubProfilePage.tsx` and `ConsentList.tsx`; the effect lines; `ClubSettingsForm.tsx`; `consentFlags` in the person directory; the B-09 filter value "missing consents".
- **Independent slices / estimated commits:** (a) own consents: 1; (b) texts: 1; (c) flags and filter: 1.
- **Requirements closed:** REQ-L10
- **Tests:** TEST-L11, TEST-L12, TEST-L20 (`/api/people/me/consents`, `/api/people/persons/{id}/consents`, the extended settings route)
- **Validation:** as above
- **Exit gate:** M-10 at 375 px, both locales, light and dark.

### Phase L8 — The 18th birthday and the account age

- **Depends on:** phases L4 (job step 4) and L7; L6 only for job step 5 (gap c9: the guard below). Q-L02 is answered (2026-11-16: guardianships end automatically on the 18th birthday and the adult pays new charges)
- **Outcome:** J-L05 works end to end.
- **Why this order / value delivered:** removes the contradiction between MSG and PAY.
- **Deliverables:** `people/lib/life-cycle-rules.ts`; `people.persons.life_cycle`, its worker and schedule (`people/workers/`, `registerModuleSchedule` in `people/services/club-setup.ts`), the CLI command with `--dry-run`; the notices and e-mail templates; the `activities` subscriber for `people.person.came_of_age`; the B-09 "Needs attention" filter; the dashboard widget `people.dashboard.peopleNeedingAttention`; the lines on M-10 and the ward page.
- **Guard for step 5 (gap c9):** erasure step two reads `anonymized_at` and `erasure_hold_until`, which migration B (phase L6) adds. The step is a separate rule in `life-cycle-rules.ts` registered in the job's rule list only by phase L6's pull request; if L8 lands first, L8 ships steps 1–4 and the job's audit entry reports no step-5 count. Whichever of L6 and L8 lands second adds the registration and TEST-L07's job case.
- **First run on existing data:** dry run, then the owner's explicit confirmation, then the real run (*Rollout*, approved 2026-11-16).
- **Independent slices / estimated commits:** (a) rules and job: 2; (b) notices: 1; (c) surfaces: 1.
- **Requirements closed:** REQ-L06, REQ-L07
- **Tests:** TEST-L09, TEST-L10, TEST-L19 (life-cycle rules)
- **Validation:** as above
- **Exit gate:** TEST-L09 green; the notices read in both locales; the ward card at 375 px.

### Phase L9 — New season

- **Depends on:** no other phase of this spec (uses the activity and fee commands as they are; spec A's new activity fields are copied when present). Cross-spec: the action `close` ends memberships with spec A's end on a chosen last day (REQ-A03, A phase 2) when it has landed, and with the existing `groups.memberships.end` otherwise; the sidebar path "Classes → Groups → Seasons" needs the rest of spec N phase 1, and until then the wizard is reached from the existing Seasons tab under "Groups"
- **Outcome:** J-L06 works end to end.
- **Why this order / value delivered:** needed once a year, before August; independent of the other phases.
- **Deliverables:** `groups/services/season-rollover.ts` (contract), `groups/lib/season-rollover.ts`, `groups.seasons.rollover`, the two routes, the wizard page (`navHidden`, reached from the Seasons tab); contributors in `activities` and `payments`; the announcement subscriber.
- **Independent slices / estimated commits:** (a) plan rules and `groups`: 2; (b) `activities`: 1; (c) `payments`: 1; (d) the wizard: 2.
- **Requirements closed:** REQ-L08
- **Tests:** TEST-L16, TEST-L19 (rollover rules), TEST-L20 (the two rollover routes; a coordinator outside the section gets 403)
- **Validation:** as above
- **Exit gate:** J-L06 in the browser as the administrator and as a coordinator.

### Phase L10 — Staff setup, group move, photo and contract file

- **Depends on:** spec A phase 2 (REQ-A03, built in #355; L10 adds the roster's "Move…" row action itself, REQ-L15); spec C for the generation skip rule (agreed, owner decision 2026-11-16) and C phase 5 for the Charges tab order on B-10 (*Cross-spec dependencies*)
- **Outcome:** J-L07 works end to end; REQ-L11 holds.
- **Why this order / value delivered:** the remaining data-entry rows; touches other specs' screens, so it lands after them.
- **Deliverables:** migration D (`people_persons.photo_attachment_id`, `club_core_contracts.attachment_id`; approved 2026-11-16); the checklist on `RolesPanel.tsx` with the injection spot in `PersonRecord.tsx` (the file spec C's phase 5 also edits for the Charges tab) and the rows from `groups` and `club_core`; `groups.memberships.move`, built on spec A's membership end (REQ-A03), with the roster's "Move…" row action and its one-child dialog in `RosterPanel.tsx` (phase L11 extends the same dialog to several children); the skip rule in `payments/lib/charge-plan.ts`; the photo and attachment routes and controls.
- **Independent slices / estimated commits:** (a) checklist: 1; (b) move and fee rule: 2; (c) files: 1.
- **Requirements closed:** REQ-L09, REQ-L11, REQ-L12 (photo, contract attachment)
- **Tests:** TEST-L17, TEST-L18, TEST-L20 (the move, photo and contract attachment routes)
- **Validation:** as above
- **Exit gate:** J-L07 in the browser; TEST-L17 green.

### Phase L11 — Move several children from a roster

- **Depends on:** L10 (`groups.memberships.move` and the fee skip rule); spec A phase 2 (the roster views and row actions, built in #355); spec A phase 9 (the phone roster `/club/groups`) for the phone entry point only
- **Outcome:** J-L09 works end to end; REQ-L15 holds.
- **Why this order / value delivered:** the season-end promotion is a recurring task of every coordinator; it reuses the single move, so it comes right after it.
- **Deliverables:** `groups.memberships.move_many` with its preview and undo in `groups/commands/memberships.ts`; the route `/api/groups/memberships/move-many`; the age-fit rule in `groups/lib/groups-rules.ts` with unit tests; row selection, the toolbar action "Move to another group" and the several-children form of L10's dialog in `RosterPanel.tsx`; the same dialog on the phone roster when spec A phase 9 is built; catalog keys in `groups/i18n/pl.json` and `en.json`.
- **Independent slices / estimated commits:** (a) command, route and rule: 2; (b) panel dialog: 1; (c) phone sheet: 1.
- **Requirements closed:** REQ-L15
- **Tests:** TEST-L21, TEST-L22, TEST-L20 (the new route)
- **Validation:** as above
- **Exit gate:** J-L09 in the browser as a coordinator; TEST-L21 green.

### Phase L12 — Birth-year ranges of the age categories

- **Depends on:** none (the category picker and the in-place create exist since #305); phase L11 uses the ranges when L12 has landed and falls back to the group's age range before
- **Outcome:** J-L10 works end to end; REQ-L16 holds.
- **Why this order / value delivered:** small and independent; makes the promotion filter match how PZPN counts categories.
- **Deliverables:** migration E (`groups_age_category_ranges` with the seed for existing clubs); the entity, the commands and the routes in `groups`; the birth-year rule in `groups/lib/groups-rules.ts`; the **Kategorie wiekowe** tab; the proposal in `GroupForm.tsx` / `GroupPublicForm.tsx`; `seedDefaults` for new clubs; catalog keys in `groups/i18n/pl.json` and `en.json`.
- **Independent slices / estimated commits:** (a) data, rule and routes: 2; (b) tab and form proposal: 1.
- **Requirements closed:** REQ-L16
- **Tests:** TEST-L23, TEST-L20 (the new routes)
- **Validation:** as above
- **Exit gate:** J-L10 in the browser as the club administrator; TEST-L23 green.

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-L01 | J-L01; B-10 Account | `people.persons.resend_invitation`; `foundation` `accountState`, `resendInvitation` | L1 | TEST-L01, TEST-L19, TEST-L20 | AC-L01 |
| REQ-L02 | J-L01; B-10 Account | `people.persons.update_account`; `auth.users.update` | L1 | TEST-L02 | AC-L02 |
| REQ-L03 | J-L02; B-10 Leaving; `/club/profile/leave`; B-09 Former | `people_persons.left_on`, `people_departure_requests`; `people.persons.depart`, `…return`, `…close_account`; `DepartureContributor` (`groups`); `people.person.departed` | L4 | TEST-L03, TEST-L04, TEST-L05, TEST-L19 | AC-L03, AC-L04 |
| REQ-L04 | J-L03; B-10 Leaving | `DepartureContributor` (`activities`, `payments`, `club_core`, `facilities`) | L5 | TEST-L06 | AC-L05 |
| REQ-L05 | J-L04; B-10 Leaving | `anonymized_at`, `erasure_hold_until`; `people.persons.anonymize`, `people.persons.delete`; `people.person.anonymized`, `people.person.deleted` | L6 | TEST-L07, TEST-L08 | AC-L06 |
| REQ-L06 | J-L05; M-10; ward page; B-09 filter | `people.persons.life_cycle`; `people.person.came_of_age`; `people_persons.consents` | L8 | TEST-L09, TEST-L19 | AC-L07 |
| REQ-L07 | J-L05; M-10 ward card; B-09 filter | life-cycle job step 3; notice `people.account_age_reached` | L8 | TEST-L10 | AC-L08 |
| REQ-L08 | J-L06; B-11 season wizard | `groups.seasons.rollover`; `SeasonContributor` (`activities`, `payments`); `groups.season.rolled_over` | L9 | TEST-L16, TEST-L19 | AC-L09 |
| REQ-L09 | J-L07; B-10 Roles | injection spot `vereino:people:person-record:staff-setup`; rows from `groups`, `club_core` | L10 | TEST-L18 | AC-L10 |
| REQ-L10 | M-10; B-02; B-10 Guardians; M-05 flags | `people_persons.consents`; `club_core_club_settings.consent_texts`; `people.persons.set_own_consents`; `consentFlags` | L7 | TEST-L11, TEST-L12 | AC-L11 |
| REQ-L11 | roster (spec A) | `groups.memberships.move`; `activities` subscriber; skip rule in `payments/lib/charge-plan.ts` | L4 (subscriber), L10 | TEST-L17 | AC-L12 |
| REQ-L12 | B-10, B-05, B-07, B-19, M-07 | existing `PUT`/`PATCH` routes; `photo_attachment_id`, `attachment_id` | L2, L10 | TEST-L13, TEST-L18 | AC-L13 |
| REQ-L13 | J-L08; `/backend/people/first-administrator` | `POST /api/people/first-administrator`; `people.persons.bootstrap_admin` | L3 | TEST-L15 | AC-L14 |
| REQ-L14 | J-L08; picker table | `PickerEmptyHint`, `InlineCreateDialog` | L3 | TEST-L14, TEST-L15 | AC-L14 |
| REQ-L15 | J-L09; roster (B-12, phone roster) | `groups.memberships.move_many`, `/api/groups/memberships/move-many`, age-fit rule | L11 | TEST-L21, TEST-L22 | AC-L15 |
| REQ-L16 | J-L10; Kategorie wiekowe tab, team form | `groups_age_category_ranges`, `/api/groups/age-categories*`, birth-year rule | L12 (L11 uses it) | TEST-L23 | AC-L16 |

**Extension surfaces** (`.ai/guides/spec-delivery.md`). Each added surface names the Vereino adaptation the implementation starts from:

| Surface | Requirement | Reference capability and file | Phase | Test | Classification |
|---|---|---|---|---|---|
| DI contracts `people.departure.<module>` | REQ-L03…REQ-L05 | `module.di-registration`; adapted as `groups.membershipContribution` (`people/services/membership-contribution.ts:11`, `groups/di.ts`) | L4, L5 | TEST-L03, TEST-L06 | emitted-example |
| DI contracts `groups.season.<module>` | REQ-L08 | the same pattern as `groups.sectionUsage` (`club_core/services/section-usage.ts:10`) | L9 | TEST-L16 | emitted-example |
| Command routes under `people/api/persons/[id]/account`, `people/api/departures`, `people/api/departure-requests`, `people/api/me` | REQ-L01…REQ-L05, REQ-L10 | adapted as `people/api/persons/[id]/account/route.ts` and `people/api/me/route.ts` | L1, L4, L6, L7 | TEST-L01…TEST-L08, TEST-L11 | emitted-example |
| Scheduled job `people:life-cycle` | REQ-L06, REQ-L07 | adapted as `people/workers/sync-role-expiry.ts` and `people/commands/jobs.ts` | L8 | TEST-L09, TEST-L10 | emitted-example |
| Subscribers in `activities` (`groups.membership.updated`, `people.person.came_of_age`) and `facilities` (`people.person.anonymized`) | REQ-L05, REQ-L06, REQ-L11 | adapted as `groups/subscribers/sync-member-roles.ts` | L4, L6, L8 | TEST-L07, TEST-L09, TEST-L17 | emitted-example |
| Member page `/club/profile/leave` | REQ-L03 | adapted as `people/frontend/club/profile/page.tsx` | L4 | TEST-L05 | emitted-example |
| Backend pages `first-administrator`, `seasons/rollover` | REQ-L08, REQ-L13 | adapted as `people/backend/people/persons/create/` and `people/backend/people/imports/[id]/` | L3, L9 | TEST-L15, TEST-L16 | emitted-example |
| Dashboard widgets `people.dashboard.departureRequests`, `people.dashboard.peopleNeedingAttention` | REQ-L03, REQ-L06, REQ-L07 | adapted as `people/widgets/dashboard/sections-without-coordinator` | L4, L8 | TEST-L05, TEST-L10 | emitted-example |
| Widget injection spot `vereino:people:person-record:staff-setup` | REQ-L09 | `umes.widget-injection`, `src/modules/example/widgets`; first Vereino spot on a person record | L10 | TEST-L18 | new in Vereino |

## Rollout, Migration, and Rollback

Rollback follows S14.6: redeploy the previous release, never run `down()`. Every migration is additive and nullable or defaulted, so the previous release works on the new schema.

**Ask First items (AGENTS.md) — all thirteen approved by the product owner on 2026-11-16** ([#255 owner decisions](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611), answering items (a)1–13 of the [audit](https://github.com/wladku/Vereino/issues/255#issuecomment-6899654561)). Each migration's SQL is shown in its pull request before it is applied.

| # | Item | Phase (story) | Kind | Approval |
|---|---|---|---|---|
| 1 | Migration A: `people_persons.left_on` (index `organization_id`, `left_on`); table `people_departure_requests` (columns under *Data Models*, partial unique index on open requests) | L4 (#306) | migration, new entity | approved 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)) |
| 2 | Migration B: `people_persons.anonymized_at`, `erasure_hold_until` (partial index) | L6 (#308) | migration | approved 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)) |
| 3 | Migration C: `people_persons.consents`; `club_core_club_settings.consent_texts` | L7 (#309), used by L8 (#310) | migration (two modules, two files) | approved 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)) |
| 4 | Migration D: `people_persons.photo_attachment_id`; `club_core_contracts.attachment_id` | L10 (#312) | migration (two modules, two files) | approved 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)) |
| 5 | Feature id `people.persons.anonymize`, its grant in `setup.ts` and `yarn mercato auth sync-role-acls` (`BACKWARD_COMPATIBILITY.md` §4); the club administrator holds it through `people.*` | L6 (#308) | contract (ACL) | approved 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)) |
| 6 | DI contracts `people.departure.<module>` (registered by `groups`, `activities`, `payments`, `club_core`, `facilities`) and `groups.season.<module>` (by `activities`, `payments`); the additive `consentFlags(personIds)` on the person directory | L4, L5, L6, L7, L9 | contract (cross-module) | approved 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)) |
| 7 | Events `people.departure_request.created`, `people.person.departed`, `people.person.came_of_age`, `people.person.anonymized`, `people.person.account_updated`, `people.person.account_closed`, `groups.season.rolled_over`; first emission of `people.person.deleted` | L1, L4, L6, L8, L9 | contract (events) | approved 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)) |
| 8 | New routes and error codes of *API, Command, and Error Contracts*, including `GET /api/club_core/institutions/options` readable with `club_core.view` (institution names shown to coordinators for the first time) and `POST /api/people/first-administrator` gated by `auth.users.create`; the CLI command `people life-cycle`; the schedule `people:life-cycle` | all | contract (API, CLI, schedule) | approved 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)) |
| 9 | `GET /api/people/persons` hides former persons by default; pickers and audiences exclude them, including `packages/core/src/audience.ts` | L4 (#306) | behaviour change of an existing list | approved 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)) |
| 10 | The skip rule in the charge generation, so a moved child is charged once for the month | L10 (#312) | behaviour change in `payments`; spec C agrees | approved 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)) |
| 11 | Ending guardianships of wards already 18 or older on existing data: dry run first, then the owner's explicit confirmation, then the real run | L8 (#310) | data change by a job (see below) | approved 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)) |
| 12 | The re-send uses the V-L01 fallback (`requestPasswordReset`, 60-minute link); deep imports of platform internals only if `.ai/guides/framework-contracts.md` lists them (`BACKWARD_COMPATIBILITY.md` §9) | L1 (#303) | reliance on a platform surface | approved 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)) |
| 13 | Seed change: the default age category "Kids (U4–U5)" for new clubs | L3 (#305) | seed | approved 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)) |
| 14 | New route `POST /api/groups/memberships/move-many` with the command `groups.memberships.move_many` and the error codes `move_preview_stale`, `move_same_group`, `move_target_inactive`, `move_date_in_past`, `move_too_many` (additive; no migration, no new feature id: it uses `groups.manage`) | L11 | contract (route, command) | requested by the owner on 2026-11-18; approved 2026-11-19 |
| 15 | Migration E: table `groups_age_category_ranges` with the seed of the nine default ranges for existing clubs; routes `GET/POST /api/groups/age-categories`, `PUT …/{entryId}/range`; error `age_range_inverted` | L12 | migration, new entity, contract | requested by the owner on 2026-11-18; approved 2026-11-19 |

No new module and no new dependency (the owner approved none; none is needed).

- **First run of the life-cycle job (phase L8, item 11).** Existing clubs may hold guardianships of wards already over 18. The first run would end them all at once. The deployment therefore runs `mercato people life-cycle --tenant --org --dry-run` first, which prints the counts; the owner confirms explicitly; only then does the first real run go, and it sends the "came of age" notice for those persons too. So that no scheduled run comes before the confirmation, phase L8 registers the daily schedule at setup only for new clubs (they have no such backlog); for an existing club the confirmed real run is `mercato people life-cycle --tenant --org --register-schedule`, which runs the job once and then registers the schedule with the same `registerModuleSchedule` call.
- **Feature flags:** none. The job step for the 18th birthday is registered with phase L8; before it nothing changes for existing guardianships.
- **Observability:** the job logs counts per rule and reports a failed person to telemetry (`people.life_cycle.failed`), as the role sync does.
- **Rollback of data:** a departure can be undone until its last day; a guardianship ended by the job can be re-created by the administrator; an anonymisation cannot be reversed — the confirmation says so.

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| The invitation pieces of the platform are not a stable import | The re-send breaks on a platform upgrade | Decided 2026-11-16: the re-send uses the platform's password-reset request (60-minute link, `requestPasswordReset`) with the text saying so; no deep import unless `.ai/guides/framework-contracts.md` lists it; one helper holds the dependency | Low |
| A re-sent link lasts 60 minutes, not 48 hours | A member who opens the e-mail late needs another re-send | The tab and the e-mail state the validity; "Forgot password" on M-01 works too | Accepted (owner, 2026-11-16) |
| A contributor is missing or throws | A departure ends some records and not others | One transaction with the caller's `EntityManager`; TEST-L06; a missing module contributes nothing by design | Low |
| The administrator leaves sessions unassigned and nobody picks them up | Sessions without a coach | They enter the "needing a coach" list and the coordinator's notice (spec A's "session without a coach at start") | Accepted |
| The cash blocker cannot be cleared before #118 ships | A coach cannot be marked as gone | Phase L5 names the dependency; until then the administrator ends memberships one by one as today | Medium until #118 |
| Guardianships end at 18 while the family still expects the parent to manage everything | Calls to the club on the birthday | Notices 30 days ahead to all three parties; Q-L02 decided by the owner on 2026-11-16 (they end automatically); a parent who keeps paying uses the adult's payer code; the adult can get an account at once | Medium |
| An adult without an account or address after 18 | No one receives messages or charges | The administrator's "adult without contact" list and the T−30 notice | Low |
| Erasure leaves old values in audit snapshots | Not a complete erasure | V-L03; snapshots are encrypted and readable only through the audit API by the administrator | Accepted until V-L03 |
| The retention hold keeps a name for up to six years | A complaint that the name was not erased | The reply states the ground and the date; contact data is gone at once; Q-L01 decided by the owner on 2026-11-16 (keep the hold, Polish five-year accounting retention) | Low |
| The rollover copies an activity into a taken slot | A double booking | The preview runs the existing conflict check; any conflict stops the whole plan | Low |
| The first job run ends many old guardianships | Surprise for families | The dry run, the owner's explicit confirmation and `--register-schedule` in *Rollout* | Low |
| Specs A and C land after the phases that use them | A phase ships with a fallback and a gap | *Cross-spec dependencies* names the fallback per phase; the second pull request to land removes it | Low |
| Former persons disappear from the default People list | An administrator cannot find someone | The perspective "Former" and the search covering all perspectives when a name is typed | Low |
| Phase L10 touches screens of specs A and C | Merge order | L10 is last and names both dependencies | Low |

## Acceptance Criteria

- [x] **AC-L01** — An administrator sees "invited", "active", "blocked" or no account on B-10 and re-sends a pending invitation; the new link works for 60 minutes, which the tab and the e-mail state. An active account answers 409 and a fourth attempt in five minutes 429. — evidence: #339; `TEST-L01-account-state-and-actions`
- [x] **AC-L02** — An administrator changes a login e-mail (409 when taken) and blocks an account, which ends its sessions and refuses sign-in until unblocked. The club's only administrator cannot be blocked, closed or made to leave. — evidence: #339, #365; `TEST-L01-account-state-and-actions`, `TEST-L03-departure`
- [x] **AC-L03** — A departure with a last day ends every membership, role assignment and guardianship of the chosen persons on that day, in one step or not at all, closes their accounts the next day, and moves them to "Former". A staying minor never ends up without a guardian, and a staying ward never without a primary payer when another guardian exists. — evidence: #365; `TEST-L03-departure`, `packages/app/src/modules/people/lib/__tests__/departure-rules.test.ts`
- [x] **AC-L04** — A guardian, an adult participant and a coach each send, see and withdraw a departure request on `/club/profile/leave` at 375 px, in Polish and English, in light and dark mode; a minor has no such link; a request for another family's child answers 403. — evidence: #365; `TEST-L05-departure-requests`
- [ ] **AC-L05** — A leaving coach's future sessions carry the chosen coach or none from the day after the last day, with substitution entries; their contract and place assignments end; the departure is refused while they hold cash, with the amount and a link. — partial evidence: #431; `TEST-L06-coach-departure` (the cash refusal with its amount is asserted, the link is not)
- [ ] **AC-L06** — Anonymising a former person clears every contact and identity field at once, keeps the name only under the retention hold and clears it on the hold date, keeps attendance, units, charges and messages under "Former member", and cannot be undone. It is refused without a recorded request, with an open charge, or with an open account. A person without history can be deleted; one with history answers 409. — partial evidence: #437; `TEST-L07-anonymise-and-delete`, `packages/app/src/modules/people/lib/__tests__/erasure-rules.test.ts` ("Former member" is asserted on the person read, not on the attendance, units, charges and message screens)
- [ ] **AC-L07** — On a ward's 18th birthday every guardianship that started earlier ends the day before; the former guardian no longer reads the calendar, declarations or charges of the adult; the consents appear on the adult's profile with their author and date; the next charge names the adult as payer and earlier charges keep theirs. Guardians, the person and the administrators each got one notice 30 days ahead and one on the day. The notices on the ward card show at 375 px in both locales, light and dark.
- [x] **AC-L08** — On the day a child reaches the club's account age, the guardians and the administrators get one notice, the ward card says so on the phone, and B-09 lists the child under "may get an account". — evidence: #414; `TEST-L10-account-age`
- [x] **AC-L09** — An administrator moves the club, and a coordinator their sections only, to a new season in one previewed step: groups continue, are renamed, closed or copied; ended activities and fees stop on the old season's last day; copies start in the new season; a conflict or a stale plan applies nothing; a second apply changes nothing. — evidence: #406; `TEST-L16-season-rollover`, `packages/app/src/modules/groups/lib/__tests__/season-rollover.test.ts`
- [x] **AC-L10** — The staff checklist on B-10 shows the state of the account, the role, the coach membership and the contract, each with a working link; a coordinator sees it without the account and contract actions. — evidence: #415; `TEST-L18-staff-setup-and-files`
- [x] **AC-L11** — An adult participant gives and withdraws their own consents on M-10 at 375 px, in both locales, light and dark; each consent shows what withdrawing changes and asks for confirmation; a minor cannot. The administrator edits the consent texts, and a consent given before a change reads "given to an earlier wording" and stays valid. The coach's attendance read carries the image and trip flags; a coordinator's read carries no consent. — evidence: #412; `TEST-L11-own-consents`, `TEST-L12-consent-texts`
- [x] **AC-L12** — After a child is moved to another group, the old group's future sessions no longer show the child, the new group's sessions show the child undeclared, and the month has exactly one fee charge. — evidence: #415; `TEST-L17-group-move`
- [x] **AC-L13** — A role assignment can be created with an end date, edited and ended on a chosen date; a guardianship's start date can be set; a person has an external id and a photo; a section material can be renamed; a contract carries a PDF; the author edits their own message in the panel and on the phone (375 px, both locales, light and dark) unless the thread is a case. — evidence: #371, #415; `TEST-L13-data-entry-fields`, `TEST-L18-staff-setup-and-files`
- [x] **AC-L14** — On a fresh tenant the first club administrator is created in the panel, and the walk-through place → institution → person → guardian → section → group needs no command line and meets no empty picker without a hint and an action. A user without the creating feature sees who can add the record and no button. — evidence: #346; `TEST-L15-first-administrator-and-empty-pickers`
- [ ] **AC-L15** — A coordinator moves several selected children from one roster to another group on a chosen day after a preview, every moved child shows both groups with their dates on B-10, the month has one fee per child, the whole move can be undone at once, and the same works on the phone at 375 px in both locales, light and dark.
- [ ] **AC-L16** — Every seeded age category shows its "U" range and the birth years for the chosen season; the club administrator sets a range and adds a category with its range; a team's public age range is proposed from its category; the "Fits" filter of a team preselects children by birth year.
- [ ] Every listed backend surface matches its recorded Open Mercato reference and uses the canonical shell/components, shared API helpers, semantic tokens, and complete loading, empty, error, conflict, keyboard, accessibility, responsive, light-mode, and dark-mode states.
- [ ] Every affected API and UI path has self-contained integration coverage and the configured validation gate passes.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | `AGENTS.md` (module boundaries, Ask First, coverage, changelog files), the spec template, the precedent addendum, D-029, D-030, D-031 |
| Data models, APIs, events, UI, and tests are internally consistent | pass | Requirement Traceability rows REQ-L01…REQ-L14 |
| Every workflow completes end to end without a catch-all integration phase | pass | J-L01…J-L08, each closed in a named phase |
| Platform-native reuse and extension points were chosen before custom code | pass | Reuse and Ownership Map; DD-L01, DD-L03, DD-L09, DD-L10 |
| UI contracts identify references, canonical components, and theme/state coverage | pass | UI and Interaction Contracts; phone criteria AC-L04, AC-L07, AC-L11, AC-L13 |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | Phases L1…L10 |
| Contracts of installed modules confirmed | pass with checks at the first step of L1, L3, L6 | V-L01 decided by the owner (the fallback); V-L02, V-L03, V-L04 run as the first step of their phase, each with a fallback; the rate limiter and `auth.users.delete` read from the installed code (*Security → Rate limits*, *Closing an account*) |
| Ask First items approved | pass | items 1–13 under *Rollout*, approved 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)); items 14 and 15 approved 2026-11-19 |
| Pre-implementation audit gaps closed | pass | [audit on #255](https://github.com/wladku/Vereino/issues/255#issuecomment-6899654561): (c1) *Cross-spec dependencies*, phases L1–L3; (c2) the `groups` contributor row, phase L4; (c3) the contributor table's undo column, the `DepartureContributor` contract, TEST-L03, TEST-L06; (c4) the "Emits after the commit" column and `afterCommit`; (c5) *Security → Rate limits*; (c6) *Proposed Solution → Closing an account*; (c7) *UI architecture → Dashboard widgets*; (c8) *UI architecture*, the life-cycle job paragraph, the *Reuse* row for files; (c9) phase L8 *Guard for step 5*; (c10) TEST-L20 in L3, L4, L6, L7, L9, L10; (c11) *Cross-spec dependencies* |

Verdict: `Ready for implementation` — the owner approved the thirteen Ask First items, answered Q-L01 and Q-L02 and confirmed Q-L03…Q-L21 on 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)). S01 (#303), S02 (#304), S03 (#305), S07 (#309) and S09 (#311) can start first; S05 (#307) waits for #118; phases that use spec A or C ship with the fallbacks of *Cross-spec dependencies* until those land.

## Resolved assumptions (autonomous defaults)

Confirmed as written by the product owner on 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)). Each is the option closest to the mockup or the more cautious one.

| ID | Question | Chosen answer | Rationale | Confirmation |
|---|---|---|---|---|
| Q-L03 | May a guardianship continue after 18 (an adult under legal guardianship)? | No rule in 1.0. The job ends only guardianships that started before the birthday; one the administrator creates afterwards stays. Messaging still writes to the adult only | Rare; keeps one rule; the administrator has a manual path | confirmed 2026-11-16 |
| Q-L04 | Do the guardian's consents carry over at 18, or reset? | Carry over with author and date; the adult is told and can withdraw each | A consent given by a holder of parental responsibility stays valid until withdrawn; a reset would drop contact lists and trip consents in mid-season | confirmed 2026-11-16 |
| Q-L05 | Is cash held a hard blocker for a coach's departure? | Yes, with no "settled outside" override | Money must be accounted for in the system that recorded it; the override would hide a shortfall | confirmed 2026-11-16; S05 (#307) is scheduled after #118 |
| Q-L06 | Enrolment and camp sign-up (CM Q-027)? | No self-enrolment in 1.0. A camp or a holiday course of the club's own members is a group with its activity and fee; the coordinator fills the roster and guardians declare as usual. Non-members stay outside 1.0, as Q-027 says | The mockup has no enrolment screen; the existing group, activity and fee model covers a members' camp | confirmed 2026-11-16 |
| Q-L07 | Who may start a departure and an erasure? | A member asks from the phone; only the administrator decides | Irreversible or far-reaching; identity and grounds must be checked (DD-L06) | confirmed 2026-11-16 |
| Q-L08 | May the last day be in the past? | No: today or later | Backdating would rewrite attendance and fee history; a correction of one membership date is spec A's roster edit | confirmed 2026-11-16; backdated corrections go through spec A's roster edit |
| Q-L09 | Does the account of a person who left stay open? | It closes the day after the last day. A guardian whose wards stay does not "leave"; only their own memberships end | An account without any role or relation has no purpose | confirmed 2026-11-16 |
| Q-L10 | Where do former persons show? | Hidden from the default lists, pickers and audiences; listed under "Former"; "Return to the club" restores the person without memberships | Keeps lists short and history intact | confirmed 2026-11-16 |
| Q-L11 | Is a hand-over of a leaving coach's sessions announced to guardians? | No. Only a change of time, place or gathering is announced (D-031 §7) | A substitution is not announced today either | confirmed 2026-11-16 |
| Q-L12 | How far ahead is the 18th birthday announced? | 30 days, and again on the day | Time to create an account and to talk at home; one reminder, no series | confirmed 2026-11-16 |
| Q-L13 | Does a child get an account automatically at the account age? | No. The guardians and the administrator are told; the administrator creates it on request | The club decides who gets accounts (CM REQ-002: "may have") | confirmed 2026-11-16 |
| Q-L14 | Where does the coordinator run the season rollover? | In the panel | Configuration stays in the panel (D-031 §3); a table of groups does not fit a phone | confirmed 2026-11-16 |
| Q-L15 | Does a missing or withdrawn consent block anything? | No. It warns and flags (the effects table) | Blocking a child's training over a form is the club's decision, not the system's | confirmed 2026-11-16 |
| Q-L16 | Does changing a consent text withdraw given consents? | No. Earlier consents are marked "given to an earlier wording" | DD-L11 | confirmed 2026-11-16 |
| Q-L17 | Which fee does a moved child pay in the month of the move? | The fee of the group they were in on the period's reference day; no pro-rating | The generator already reads one day; clubs charge whole months | confirmed 2026-11-16 |
| Q-L18 | Who creates the first administrator? | The technical administrator, on a panel page, while the club has none | The command exists; the technical administrator must not become a club administrator by default | confirmed 2026-11-16 |
| Q-L19 | Is "Leaving" a seventh tab on B-10? | Yes, after the mockup's six, shown only with `people.manage` | D-031 §8 adds the function; the mockup's tabs keep their order | confirmed 2026-11-16 |
| Q-L20 | Can a departure be undone? | Yes, until its last day, including the hand-overs, contracts and maintainer rows (each contributor's `undo`); afterwards "Return to the club" and new memberships | After the last day accounts are closed and notices sent | confirmed 2026-11-16 |
| Q-L21 | Is the name of an anonymised person replaced in stored message bodies? | No. Only the author and participant labels change; the text others wrote stays | Editing other people's messages is out of proportion; cases are immutable (CM) | confirmed 2026-11-16 |
| Q-L22 | How many children may one move take? | Up to 100, one roster, one target group | A roster rarely exceeds 30; the limit keeps the transaction short | confirmed 2026-11-19 |
| Q-L23 | Does the move keep each child's role? | Yes: participants only; coaches and assistants are moved one by one with **Move…** | A coach changing groups is a staffing decision, not a promotion | confirmed 2026-11-19 |
| Q-L24 | Is a child already in the target group an error? | No: skipped with the reason in the preview; the others move | One known exception should not block the promotion | confirmed 2026-11-19 |
| Q-L25 | Which year is the reference year of a season? | The calendar year in which the season starts (2026/27 → 2026); without a season, the year of the move date | PZPN youth categories change with the season; clubs think "rocznik 2017 in 2026/27" | confirmed 2026-11-19 |
| Q-L26 | How is a team's age range proposed from "U{from}–U{to}"? | "Wiek od" = u_from − 1, "Wiek do" = u_to; editable, never overwriting values already set | A U-category spans children who are u_from − 1 at the season start and u_to at its end | confirmed 2026-11-19 |

## Open Questions

Only what blocks a phase is listed. The V rows are contract checks with a fallback, run as the first step of their phase.

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-L01 | Erasure: is the name kept until the end of the fifth calendar year after the last payment (DD-L07), or erased at once because the club keeps its accounting documents outside Vereino? | Władek Kuć (with the club's accountant) | no (resolved) | Resolved 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)): keep the retention hold — the name stays until 31 December of the fifth year after the last payment, readable only with `people.manage`; contact data goes at once (DD-L07) |
| Q-L02 | The 18th birthday: do guardianships end automatically (DD-L08), making the adult the payer of new charges, or does a parent stay the payer until the family changes it? | Władek Kuć | no (resolved) | Resolved 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)): guardianships end automatically on the 18th birthday and the adult pays new charges (DD-L08); a parent who keeps paying uses the adult's payer code |
| V-L01 | Can `foundation` import the platform's invitation pieces (`PasswordReset`, `INVITE_TOKEN_TTL_MS`, `generateAuthToken`, `hashAuthToken`, `InviteUserEmail`, `getSecurityEmailBaseUrl`) in the installed version? | Władek Kuć | no | Decided 2026-11-16 ([#255](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)): the fallback — `authService.requestPasswordReset` and the platform's reset e-mail (60-minute link), with the tab saying "valid 60 minutes"; deep imports only if `.ai/guides/framework-contracts.md` lists them (it does not on 2026-11-16) |
| V-L02 | Does `isConfirmed = false` refuse sign-in by password and by Google (D-027) and end the sessions? Read on 2026-11-14: `auth.users.update` deletes the sessions on `isConfirmed = false` | implementer, phase L1 step 1 | no | pending; fallback: block by removing every `vereino_*` role and ending the sessions |
| V-L03 | Can audit snapshots of one record be purged or redacted through an installed contract? | implementer, phase L6 step 1 | no | pending; fallback: the residual risk recorded under *Security* |
| V-L04 | Does the platform's default administrator role hold `auth.users.create`, so it can gate the first-administrator page? | implementer, phase L3 step 1 | no | answered 2026-11-17 (#305): yes — the installed `auth` module (`@open-mercato/core` 0.9.0, `auth/setup.ts`) gives the `admin` role `auth.*`; the page, its banner and both methods of `/api/people/first-administrator` are gated on `auth.users.create`, no fallback |

## Changelog

Each change is its own file in `.ai/specs/changelog/2026-11-14-vereino-people-life-cycle-and-data-entry/` (`YYYY-MM-DD-<slug>.md`, one `| date | change |` row), so parallel PRs never conflict here; `cat .ai/specs/changelog/2026-11-14-vereino-people-life-cycle-and-data-entry/*.md` lists them in date order. Never add rows to this section.
