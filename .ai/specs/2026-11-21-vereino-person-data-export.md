# Person data export for access and portability requests

**Date**: 2026-11-21
**Status**: Draft (issue #527; implementation is Ask First: it adds a route, an ACL feature and a migration, and needs the owner's approval of DD-X04 and the assumptions marked ⚠)

## TLDR

A club administrator downloads, for one person, a single JSON file with that person's data from every Vereino table
that refers to them (GDPR art. 15 access, art. 20 portability). The file leaves out other people's data (art. 15(4)).
Each module adds its own part through an optional DI contributor, `people.dataExport.<module>`. The `departure`
contributors (`people/services/departure.ts`) use the same pattern, so `people` never imports another module. Every
export is logged before any data is read, through the foundation primitive `auditedRead` (P-27), into a new
append-only table `people_data_export_log`. The smallest useful result is one button on the person record and one
`GET` route. This closes open item D-1 of `docs/compliance/data-subject-requests.md` and DPIA measure DP-5.

## Problem Statement

Today an administrator answers an access or portability request by hand. They open the person record
(`GET /api/people/persons/{id}`), then each module's view, and use the table list of `docs/compliance/ropa.md` as a
checklist (`data-subject-requests.md` §2). `people` CRUD routes set `export: { enabled: false }`. This manual route has
three problems:

- **It is slow and incomplete.** The data sits in about 40 tables across 8 modules (inventory below). Several of them
  have no staff view per person, for example `communication_thread_reads`, `payments_payer_refs`,
  `foundation_deliveries` and `facilities_entry_bans`.
- **It is not machine-readable.** Art. 20 asks for a structured, commonly used, machine-readable format. Screenshots
  and copied text are not one.
- **It is not audited.** Nothing records that a person's full data set left the system, or who took it out.

Affected users: club administrators, who answer requests within one month (art. 12(3)), and every member, ward or
guardian who makes one.

## Overview and Success Measures

- **Primary outcome:** an administrator answers an access or portability request with one download, in under a
  minute. The file covers every RoPA table that refers to the person (AC-X01).
- **Leading indicators:** the integration test TEST-X01 finds a row in the export for each seeded table. Every
  export has a row in `people_data_export_log`.
- **Baseline:** a manual compilation across about 8 module views. There is no export and no audit.
- **Market / product reference:**
  - **Discourse** "Download my posts" and **GitLab** user export: one archive per user. Discourse is self-service and
    asynchronous. GitLab is admin-run. Adopted: one bundle per person, built from per-module contributions.
    Rejected for now: asynchronous jobs, because one club member's data is small.
  - **Nextcloud** `user_migration`: each app implements an exporter interface and the core collects them. Adopted as
    the contributor seam.
  - **Odoo** `data_recycle` / GDPR app: lists the records that refer to a partner, per model. Adopted: per-table
    sections with the table name. Rejected: generic reflection over all foreign keys, because Vereino encrypts columns
    and must decide per column what belongs to the person.

## Goals

- **REQ-X01** — A club administrator downloads one JSON file holding the person's data from every table that
  `docs/compliance/ropa.md` lists as referring to the person, with encrypted columns decrypted.
- **REQ-X02** — The file leaves out other people's data. The art. 15(4) rules are in *Domain Vocabulary* (DD-X03).
- **REQ-X03** — The export is tenant- and organization-scoped and fails closed. A person of another club or
  organization is not found (404), and a caller without the feature is refused (403).
- **REQ-X04** — Every export is recorded (actor, acting role, person, time, purpose) before any data is read. When the
  record cannot be written, nothing is exported.
- **REQ-X05** — Every module that holds person data provides its own part. When a module is not enabled, its part is
  left out, and the file says which parts were left out.

## Non-goals

- **Self-service export by the member in the member area.** Deferred; see *Resolved assumptions*.
- **A CSV bundle or ZIP archive.** JSON is a single file and needs no new dependency. A ZIP would need one, which is
  Ask First.
- **Attachment binaries** (person photo, incident photos, contract file). The export lists their metadata (file name,
  type, size, date). The administrator sends a file separately when the person asks for it.
- **Platform audit rows** (`action_logs`), the platform access log, application logs and backups. See DD-X05.
- **Asynchronous generation, e-mailing the file, or storing it.** The file is streamed to the administrator's browser
  and never stored on the server.
- **Restriction (art. 18), erasure, or any other change to the data.** The export only reads.

## Proposed Solution

1. `people` defines the contributor contract, `PersonDataExportContributor`, in `people/services/data-export.ts`.
   - Each of `groups`, `activities`, `communication`, `payments`, `facilities` and `club_core` registers one under
     `people.dataExport.<module>` in its `di.ts`. These modules are listed in `DATA_EXPORT_CONTRIBUTOR_MODULES`.
   - Each module imports the contract type only, from `../../people/services/data-export`. The departure
     contributors already import their type this way (`payments/services/departure-contribution.ts:11`).
   - `people` collects the contributors with `container.hasRegistration`, the same way `departureContributors` does.
   - `people` contributes its own tables directly.
   - `people` reads `foundation_deliveries` through a new public read helper of `foundation`,
     `personDeliveriesForExport`, exported from `@/modules/foundation`. Business modules may import that module, so
     `foundation` never imports `people`.
2. A custom guarded route `GET /api/people/persons/{id}/data-export` (feature `people.persons.export`):
   1. Derive the trusted scope, load the person and run `assertInScope`. These are the same steps as
      `people/api/persons/[id]/route.ts`.
   2. Call `auditedRead` with the log entity `PersonDataExportLog`.
   3. Inside the read, run every contributor on one forked EntityManager.
   4. Assemble the document and return it with `Content-Disposition: attachment`.
3. A "Data requests" panel on the person record's *Details* tab has one "Export personal data" button. The button
   downloads the file through `apiCall`.

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-X01** Contributors behind optional DI tokens `people.dataExport.<module>`, listed in `DATA_EXPORT_CONTRIBUTOR_MODULES` (`groups`, `activities`, `communication`, `payments`, `facilities`, `club_core`). `foundation` contributes through a public helper that `people` calls, never through a token. | The established people-owned seam, `people.departure.*`, extended to `communication`. No ORM relations, and only the type-only contract import that the departure contributors already use. An absent module contributes nothing. `foundation` stays below the business modules. | `people` reads the other modules' tables directly | Breaks module boundaries (AGENTS.md *Never*). `people` would have to know each module's encryption map. |
| | | An event plus subscribers that collect parts | Events run after commit and asynchronously. A synchronous download needs a direct answer. |
| | | A generic foundation registry primitive | The foundation inventory has no such primitive (REQ-F16). `people.departure.*` already sets the pattern. |
| **DD-X02** One JSON document, `format: "vereino.person-data-export"`, `version: 1` | Structured and machine-readable (art. 20). One file, no new dependency, easy to test. The version lets a later format change stay compatible. | A CSV per table in a ZIP | Needs an archive dependency (Ask First). CSV loses nesting such as consents. |
| **DD-X03** Contributors redact other people. Another person's id never appears. A link to another person appears only as their display name, and only where the link is itself information about the subject. Staff actor columns appear as a role label without the name. | Art. 15(4). Keeps the rule in each module, which knows what each column means. One shared helper keeps the wording consistent. | Include every referenced id | Leaks other people's identifiers. |
| | | Leave out every link to another person | The guardian–ward link and the payer of a ward's charge are part of the subject's own data. |
| **DD-X04** ⚠ The audit goes through `auditedRead` into a new append-only table `people_data_export_log`. The table is migration-backed. | P-27 is the canonical audited-read primitive. Its row is committed before the read, and a failed write blocks the read (REQ-X04). | An audit-only command in `action_logs` | Commands are for mutations. The rows are encrypted and cannot be filtered by person (lesson `action-log-columns-encrypted-at-rest`). |
| | | Only the platform access log | Its rows rotate after hours (V-F08). It cannot prove an answer a month later. |
| **DD-X05** ⚠ Leave out platform audit rows, the access log, application logs and backups. List them in the document's `omitted` block with the reason. | Audit snapshots hold other people's data and staff internals. Their purpose is security and accountability (A14, art. 6(1)(f)). The privacy notice and the procedure describe them. | Export the subject's audit rows | The audit API is not scoped per data subject. The snapshots mix several people. |
| **DD-X06** ⚠ Rows where the person acted as staff are exported as counts per table, not row by row. Examples: facility logs they wrote, attendance they marked, payments they recorded. | Those rows are mostly about other people. A count tells the person what exists, and the club gives details on request (art. 15(3) "copy" of their data, with art. 15(4) applied by hand). | Export every row where the person is an actor | Floods the file with other people's records, which would then need redacting column by column. |
| **DD-X07** Streamed response. Nothing is stored. | No new storage or retention row. The file exists only in the administrator's download. | Store the file as an attachment | Creates a new copy of the personal data, with its own retention and erasure duty. |
| **DD-X08** The PESEL is exported (decrypted) only when the caller also holds `people.pesel.view`. Otherwise its key holds `"[withheld: people.pesel.view]"`. | Keeps the existing rule that reading a PESEL needs its own feature (`people/api/persons/[id]/route.ts:62`). | Always export it | Would bypass `people.pesel.view`. |

## Domain Vocabulary and Business Rules

| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| **Subject** | The `people_persons` row whose data is exported, found in the trusted scope | `people` | Not in scope, or missing → 404 `person_not_found` |
| **Subject row** | A row whose person column names the subject as the data subject. Examples: `person_id`, debtor `person_id`, `participant_person_id`, `ward_person_id` or `guardian_person_id` of a guardianship, `renter_type='person'` + `renter_id`, `party_type='person'` + `party_id`, `subject_type='person'` + `subject_id`, the subject's thread participations. | each contributor | — |
| **Actor row** | A row where the subject appears only as the staff member who acted, for example `marked_by_person_id`, `recorded_by_person_id`, `operator_person_id` or `decided_by_person_id`. Exported as `{ table, count }` (DD-X06). | each contributor | — |
| **Other-person reference** | A column that names someone other than the subject. Its id is dropped. It becomes `{ "relation": "<key>", "name": "<display name>" }` only for: guardian or ward of a guardianship, payer or debtor of a charge, the orderer of a ward's order, and the coach of a session the subject attended. Every other one becomes `{ "relation": "<key>" }` (role only). | `people` helper `redactPerson` (lib, pure) | — |
| **Messages** | From `communication`: the subject's threads (encrypted subject), their participation reasons, their read times, and only the messages the subject wrote. Other authors' message bodies are left out, and the count of left-out messages per thread is given. | `communication` | — |
| **Free-text fields about several people** | `facilities_incidents.involved`/`description`, `people_import_rows.raw` and `payments_bank_transactions` counterparty fields. Exported only on a subject row: an incident the subject reported, an import row matched to the subject, a transaction matched to the subject as payer. They are exported as stored, with their fields named in `reviewFields` and listed in `reviewRequired`, so the administrator knows to check them for third-party data before sending. | each contributor | — |
| **Secrets and technical keys** | Never exported: lookup hashes (`*_hash`), token hashes (declaration, order, rental links), `foundation_deliveries.secret_params`, `foundation_dispatches.params`, Stripe ids beyond the checkout reference. | each contributor | A contributor unit test asserts their absence |
| **Section** | `{ module, table, activity, portable, rows, omittedOtherAuthors?, reviewFields? }`.<br>- `activity` is the RoPA activity id (A1–A13).<br>- `portable` marks art. 20 data (J-X02).<br>- `omittedOtherAuthors` is used by `communication_thread_messages` only.<br>- `reviewFields` names the free-text fields to check for third-party data. | contributor | — |
| **Actor count** | `{ module, table, count }`, in the document's `actorCounts` (DD-X06) | contributor | — |
| **Omitted** | `{ module?, category?, reason }`, where `reason` is one of:<br>- `module_not_enabled`: the module is not in `src/modules.ts`;<br>- `no_contributor`: the module is enabled but registers no contributor;<br>- `security_audit_not_subject_data`: the DD-X05 categories (`category`: `action_logs`, `access_log`, `application_logs`, `backups`);<br>- `attachment_binary`: A-7. | `people` (`lib/data-export.ts`) | — |
| **Review required** | The document's `reviewRequired` list: `{ module, table, recordId, field }` for every `reviewFields` hit. The success flash shows how many there are, so the administrator checks them before sending. | `people` | — |
| **Completeness** | A contributor that throws aborts the whole export with 500, and a partial file is never returned. The log row was written before the read, so it records the attempt whatever the outcome. The row means "an export was started", not "an export was delivered". | `people` route | Uncoded 500. The administrator retries, and the retry writes a new row. |
| **Organization filter** | Every contributor query filters by the subject's `tenant_id` and `organization_id`, including lookups by `userId`. A platform user can belong to several organizations, so the user id alone never selects rows. | each contributor | TEST-X02 seeds the subject's own rows in a second organization and asserts they are absent. |

## Users, Permissions, and Scope

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| Club administrator (`vereino_club_admin`) | Export any person of their organization | Trusted `{ tenantId, organizationId }` from `trustedScopeOf(commandContextForRequest(req))`, plus `assertInScope(scopeContract.resolve(ctx), ['club_admin'], { personId })`. Only the `club_admin` grant kind is accepted, not the wider `PERSON_READ_KINDS`. A feature holder acting only as `self`, `guardian` or `coordinator` gets 403 `scope_denied`. The acting role logged is therefore always `club_admin`. | `people.persons.export` (new, `dependsOn: ['people.view']`). The club administrator holds it through `people.*` (`packages/core/src/roles.ts:45`). |
| PESEL in the export | Included only with the extra feature | same | `people.pesel.view` |
| Coordinator, coach, treasurer, member, guardian | Refused (403) | — | — |
| Unauthenticated | 401 | — | — |

Scope is never taken from the payload. The route has no system-scope path. Contributors receive the trusted scope and
filter every query by `tenant_id` and `organization_id`.

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Existing module or new module | Integration seam | Why |
|---|---|---|---|---|
| Contributor contract and assembly | app-owned | `people` | optional DI `people.dataExport.<module>` | `people` owns the person (DD-X01) |
| Each module's tables | app-owned in each module | `groups`, `activities`, `communication`, `payments`, `facilities`, `club_core`, `foundation` | `services/data-export-contribution.ts` registered in `di.ts` | The module knows its encryption map and its meaning |
| Decrypted reads | reuse | platform `findWithDecryption` | — | Existing pattern (`people/services/people-read.ts:62`) |
| Audit of the read | reuse | `foundation` `auditedRead` (P-27) + new `people_data_export_log` | `@/modules/foundation` | Canonical audited read |
| Scope and authorization | reuse | `trustedScopeOf`, `assertInScope`, `scopeContract` | `@/modules/foundation` | Fail closed |
| Download in the browser | reuse | `apiCall` (raw response) + a Blob download | — | No raw `fetch` |

## Architecture and Data Flow

```text
PersonRecord › Details › DataExportPanel [Export personal data]
  -> apiCall GET /api/people/persons/{id}/data-export
     -> trustedScopeOf + findPerson + assertInScope            (404 / 403 fail closed)
     -> auditedRead(PersonDataExportLog, resourceKind 'people:person', purpose 'data_subject_export')
          writes + commits people_data_export_log row          (failure -> 500, no read)
          mirrors best-effort to the platform access log
        -> people part (persons, roles, guardianships, departure requests, import rows)
        -> for module in DATA_EXPORT_CONTRIBUTOR_MODULES:
             hasRegistration(people.dataExport.<module>) ? contributor.export(em, subject) : omitted
     <- 200 application/json; Content-Disposition: attachment; filename="person-data-<date>.json"
```

- **Module boundaries:** `people` imports no other module. Each contributing module imports only the contract type, from
  `../../people/services/data-export` (type-only), as the departure contributors do. `foundation` imports nothing from `people`.
- **Extension points:** optional DI registrations, and the person record's existing tab content
  (`PersonRecord.tsx`).
- **Compatibility:** additive only. There is a new route, a new ACL feature, a new table, and new DI tokens. Nothing
  existing changes. The document format is a new Vereino contract (`format` + `version`), and BACKWARD_COMPATIBILITY
  gets a row for it.

## User Journeys

### Journey J-X01 — Answer an access request

1. The administrator opens `/backend/people/persons/{id}` (Details tab) after checking the requester's identity
   (`data-subject-requests.md` §1).
2. In the "Data requests" panel they press **Export personal data**. The button shows a busy state.
3. The browser downloads `person-data-2026-11-21.json`. A success flash says the export was recorded in the log and
   reminds the administrator to check fields flagged for review before sending.
4. Failures:
   - 403: the panel is not shown without the feature. A direct call gets 403.
   - 404: the person is gone or out of scope. The flash shows a localized "not found" message.
   - 500: the log could not be written or a part failed. The flash shows a localized error, and nothing is
     downloaded. The administrator retries.

### Journey J-X02 — Portability

The same file is the portability answer. Its `portable` sections are marked with `"portable": true`: the profile,
contacts, consents, orders and rental requests (data the person provided under art. 6(1)(a)/(b)).

## UI and Interaction Contracts

| Surface / route | Purpose and primary actions | Data source / mutations | Closest installed reference | Canonical shell / components | Required states | Requirement IDs |
|---|---|---|---|---|---|---|
| `/backend/people/persons/{id}` › Details › "Data requests" panel | One button, **Export personal data** | `GET /api/people/persons/{id}/data-export` (read, audited) | `people/components/ErasurePanel.tsx` (action panel on the record, `apiCall`, flash) | existing record shell, `Button`, `Alert`, `flash` | idle, busy (button disabled + `aria-busy`), success flash, error flash (403/404/500), hidden without feature | REQ-X01, REQ-X03 |

```text
┌ Data requests ─────────────────────────────────────────────┐
│ Download everything Vereino holds about this person, for   │
│ an access or portability request. The download is logged.  │
│                                   [Export personal data]   │
└────────────────────────────────────────────────────────────┘
```

- **Behavior:** the panel is shown only when `useGrantedFeatures()['people.persons.export']`. It has no
  confirmation dialog, because the export changes no data. The button stays disabled while the request runs.
- **Responsive and accessibility:** at 375 px the button wraps under the text. Its label is the visible text. The
  busy state is announced (`aria-busy`). The result flash is a live region.
- **Localization:** `people.dataExport.*` in `people/i18n/en.json` and `pl.json`. The file content uses stable keys,
  not translated labels.
- **Design system:** semantic tokens only, no status colors. Check light and dark mode.

## Data Models

### `PersonDataExportLog` (`people_data_export_log`, new, append-only, `people`)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `id`, `tenant_id`, `organization_id`, `created_at` | `AppendOnlyEntityBase` | index `(tenant_id, organization_id, created_at)` | no | never updated or deleted by the app |
| `actor_user_id` | uuid | — | no | from `ctx.auth.sub` |
| `acting_role` | text | — | no | `club_admin` |
| `resource_kind` | text | — | no | `people:person` |
| `resource_ids` | uuid[] | GIN not needed (lookups by subject are rare) | no | `[personId]` |
| `purpose` | text | — | no | `data_subject_export` |

The table holds no exported values. Retention: it is kept like the contact access log (R12 in
`docs/compliance/retention.md`). The implementing PR adds the row to `retention.md`. The migration comes from
`yarn db:generate`, is reviewed, and is applied only with the owner's approval.

## API, Command, and Error Contracts

| Method / command | Path / ID | Auth and feature gate | Input | Success response / event | Errors and concurrency | Requirement IDs |
|---|---|---|---|---|---|---|
| `GET` | `/api/people/persons/{id}/data-export` | auth + `people.persons.export` (`metadata.GET`), `openApi` documented | path `id` (uuid, zod) | 200 `application/json`, `Content-Disposition: attachment; filename="person-data-YYYY-MM-DD.json"`, `Cache-Control: no-store`. Body: the document below. No event. | 400 invalid id, 401, 403, 404 `person_not_found` (also out of scope), 500 uncoded (log write or contributor failure) | REQ-X01–X05 |
| DI contract | `people.dataExport.<module>` | — | `PersonDataExportSubject { tenantId, organizationId, personId, userId \| null }` | `Promise<{ sections: DataExportSection[]; actorCounts: Array<{ table; count }> }>` | throws → whole export 500 | REQ-X05 |

The route is a custom route, not `makeCrudRoute`, because it reads across modules and returns a file. It uses no
command because it changes nothing. Document shape (version 1):

```json
{
  "format": "vereino.person-data-export",
  "version": 1,
  "generatedAt": "2026-11-21T10:00:00Z",
  "subject": { "id": "…", "firstName": "…", "lastName": "…", "email": "…", "consents": { }, "pesel": "…" },
  "sections": [
    { "module": "people", "table": "people_guardianships", "activity": "A2", "portable": true,
      "rows": [ { "relation": "ward", "other": { "relation": "guardian", "name": "Anna Nowak" }, "consents": { } } ] },
    { "module": "communication", "table": "communication_thread_messages", "activity": "A4", "portable": false,
      "rows": [ { "threadId": "…", "body": "…", "createdAt": "…" } ], "omittedOtherAuthors": 4 }
  ],
  "actorCounts": [ { "module": "activities", "table": "activities_attendances", "count": 37 } ],
  "reviewRequired": [ { "module": "facilities", "table": "facilities_incidents", "recordId": "…", "field": "involved" } ],
  "omitted": [ { "category": "action_logs", "reason": "security_audit_not_subject_data" },
               { "module": "facilities", "reason": "module_not_enabled" } ]
}
```

Record ids of the subject's own rows are kept, because they let the club find a row the person asks about. Ids of
other people are never kept.

## Events, Jobs, Notifications, and Cross-Module Flows

| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit behavior |
|---|---|---|---|---|
| `GET …/data-export` | `people` route | `people.dataExport.*` contributors (synchronous DI calls) | none (read only) | `auditedRead` row first. A retry writes a new row, so each attempt is recorded. |

No events, jobs or notifications. A module that is not enabled has no registration and is listed in `omitted`.

### Contributor inventory (what each part exports)

| Module | Subject rows (sections) | Actor rows (counts only) |
|---|---|---|
| `people` | - `people_persons` (subject)<br>- `people_role_assignments`<br>- `people_guardianships` (both directions)<br>- `people_departure_requests` (subject)<br>- `people_import_rows` matched to the subject (`reviewFields: raw`) | departure requests decided, imports created or committed |
| `groups` | `groups_memberships` | — |
| `activities` | - `activities_attendances` (subject `person_id`; declared-by and marked-by as relation only)<br>- `activities_declaration_tokens` (as guardian: purpose and dates only, no hash) | sessions coached (`default_coach_person_id`, `coach_person_id`), substitution entries naming the subject, attendance marked, substitutions decided, `activities_contact_access_log` reads by the subject |
| `communication` | - `communication_threads` the subject takes part in (subject line only)<br>- the subject's **own** `communication_thread_participants` row (reasons, joined at); the other participants appear only as a count per thread<br>- the subject's own `communication_thread_reads`<br>- `communication_thread_messages` written by the subject | — |
| `payments` | - `payments_charges` where the subject is the debtor or the payer (the other party as relation, with a name only for a guardian/ward pair)<br>- `payments_payments` on those charges: amount, date, method and status only. The transfer title, reference and recorder are left out when the subject is not the payer.<br>- `payments_checkouts` and `payments_payer_refs` of the subject<br>- `payments_orders` and `payments_order_lines` where the subject is the participant or the orderer<br>- `payments_bank_transactions` matched to the subject as payer (`reviewFields`: counterparty name, account, title)<br>- `payments_order_links` (as guardian: dates only) | payments recorded or collected, cash handovers, order campaigns created, bank imports, transactions decided, orders handed over |
| `facilities` | - `facilities_rentals` (`renter_type='person'`)<br>- `facilities_entry_bans` (`subject_type='person'`)<br>- `facilities_internal_bookings` booked by the subject<br>- `facilities_place_maintainers`<br>- `facilities_incidents` the subject reported (`reviewFields: involved, description`) | logs operated, tasks planned or done, rentals decided, bans issued, bookings cancelled |
| `club_core` | `club_core_contracts` (`party_type='person'`, terms decrypted, attachment metadata only) | — |
| `foundation` (via `personDeliveriesForExport`, called by `people`) | `foundation_deliveries` for the person: channel, template, status and dates. No e-mail after the wipe, no secret. | `foundation_dispatches` by the subject's user, in the subject's organization only |

## Security, Privacy, and Compliance

- **Authorization:** feature `people.persons.export`, plus `people.pesel.view` for the PESEL. No role-name checks.
- **Tenant isolation:** the trusted scope comes from the session. `assertInScope` runs before the log write, and
  every contributor query filters by tenant and organization. A person of another organization returns 404, never
  403, so the response does not reveal whether the person exists (TEST-X02).
- **Sensitive data:** decrypted values leave only in the response body. They are never logged, put in events, put in
  the URL, or stored. The filename carries no name. `Cache-Control: no-store`. The log row holds ids only.
- **Abuse and failure modes:**
  - Bulk extraction by a compromised administrator account: every export is logged with the actor, and the log is
    append-only. Rate limiting is not added in v1 (see risks).
  - Third-party data: guarded by DD-X03 and the `reviewRequired` list (A-9).
  - Contributors that leak secrets: each contributor's unit test asserts that hash and token columns are absent.

## Integration Coverage

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-X01 | integration (API) | Org A: a guardian and a ward. Seed one row per contributor table where the fixtures allow it: membership, attendance, a message by the ward and one by another person, a charge with the guardian as payer, an order, a person rental, a contract. | Administrator calls `GET …/data-export` for the ward | 200, attachment header. Every expected `table` is in `sections`. The guardian appears only as `{relation, name}`. The other author's message body is absent and `omittedOtherAuthors` is 1. No `*_hash` key anywhere. `people_data_export_log` has one row for the ward. | REQ-X01, X02, X04 |
| TEST-X02 | security | Org A administrator. A person in org B (and in tenant B). The org A subject's user also has a membership, a delivery and a message in org B. | - Export the org B person.<br>- Export the org A subject.<br>- Call as a coach, as a coordinator holding `people.persons.export` without a `club_admin` grant, and unauthenticated. | - 404 for the org B person, and no log row for them.<br>- The org A export contains none of the subject's org B rows.<br>- 403, 403 and 401 for the three callers. | REQ-X03 |
| TEST-X03 | integration | Administrator without `people.pesel.view` (custom role with `people.persons.export`). Person with a PESEL. | Export | `subject.pesel` holds the withheld marker | REQ-X01, DD-X08 |
| TEST-X04 | UI | Administrator, a person | Open the record › Details, press **Export personal data** in en and pl, at 375 px | The download arrives. The success flash is shown. The panel is hidden for a coordinator. Axe reports no violations. | REQ-X01, X03 |

Unit tests (100 % coverage, `lib/**`): `redactPerson`, the document assembler, the `omitted` computation and the
`reviewRequired` list. AC-X04 (a failed log write returns no data) is the contract of `auditedRead`. That primitive's
own unit tests (`foundation/lib/audited-read`) already prove it, and the route adds no path around it. TEST-X01
asserts that the row exists.

## Implementation Phases

### Phase X1 — Contract, people part, route, audit

- **Depends on:** owner approval of DD-X04 (migration) and the ⚠ assumptions
- **Outcome:** the route returns the `people` part (profile, roles, guardianships, departure requests, import rows)
  with the audit row. Every other module is listed in `omitted` as `no_contributor`.
- **Why this order / value delivered:** it ships the whole safety envelope (scope, audit, redaction) first. The
  administrator already gets the core of A1/A2.
- **Deliverables:**
  - `people/services/data-export.ts` (contract, tokens, collector)
  - `people/lib/data-export.ts` (redaction, assembly; pure)
  - `PersonDataExportLog` entity and migration
  - `people/api/persons/[id]/data-export/route.ts`
  - `people.persons.export` in `acl.ts` and setup grants
  - `BACKWARD_COMPATIBILITY.md` row
  - `retention.md` row
- **Requirements closed:** REQ-X03, REQ-X04; REQ-X01/X02 for `people`
- **Tests:** TEST-X01 (the `people` sections and the log row only; it grows in X2), TEST-X02 (the person and caller
  cases), TEST-X03, unit tests
- **Validation:** `yarn generate`, `yarn db:generate` (review the SQL), `yarn verify`,
  `yarn test:integration:vereino --filter TEST-X01`, then `--filter TEST-X02` and `--filter TEST-X03`, one id per run
- **Exit gate:** TEST-X01, TEST-X02 and TEST-X03 pass locally. A log row is written before the read.

### Phase X2 — Module contributors

- **Depends on:** Phase X1
- **Outcome:** the six contributors are registered and `foundation`'s helper is in place. The file covers every RoPA
  table in the inventory.
- **Deliverables:**
  - `<module>/services/data-export-contribution.ts` and its `di.ts` registration for `groups`, `activities`,
    `communication`, `payments`, `facilities` and `club_core`.
  - `personDeliveriesForExport` in `foundation`, exported from its `index.ts`.
  - Each module has a unit test for redaction and for the absence of secrets, wherever its logic sits in `lib/`.
- **Independent slices:** one per module, on disjoint files. Each slice works alone: until it lands, its module stays
  in `omitted` as `no_contributor`. The slices may ship as separate PRs.
- **Requirements closed:** REQ-X01, REQ-X02, REQ-X05
- **Tests:** TEST-X01 (extended to every module), TEST-X02 (the second-organization rows)
- **Validation:** `yarn verify`, `yarn test:integration:vereino --filter TEST-X01`, then `--filter TEST-X02`
- **Exit gate:** TEST-X01 passes. A disabled module shows up in `omitted`.

### Phase X3 — Person record panel and procedure update

- **Depends on:** Phase X2
- **Outcome:** an administrator exports from the record in one click.
- **Deliverables:**
  - `people/components/DataExportPanel.tsx` on the Details tab
  - i18n en/pl
  - update of `docs/compliance/data-subject-requests.md` §2 (D-1 closed, the steps now point to the export)
  - DPIA DP-5 status
- **Requirements closed:** REQ-X01 (UI)
- **Tests:** TEST-X04
- **Validation:** `yarn verify`, `yarn test:integration:vereino --filter TEST-X04`. Browser check in en and pl, at
  375 px, in light and dark mode.
- **Exit gate:** TEST-X04 passes. Screenshots are on the PR.

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-X01 | J-X01, J-X02, Data requests panel | `GET …/data-export`, contributors | X1, X2, X3 | TEST-X01, X03, X04 | AC-X01 |
| REQ-X02 | J-X01 | DD-X03 redaction, `omittedOtherAuthors`, `reviewRequired` | X1, X2 | TEST-X01 | AC-X02 |
| REQ-X03 | J-X01 failure path | trusted scope, `assertInScope(['club_admin'])`, feature gate, organization filter | X1, X2 | TEST-X02 | AC-X03 |
| REQ-X04 | J-X01 | `people_data_export_log`, `auditedRead` | X1 | TEST-X01, `auditedRead` unit tests | AC-X04 |
| REQ-X05 | — | `people.dataExport.<module>`, `omitted` | X2 | TEST-X01, unit tests of the `omitted` computation | AC-X05 |

## Rollout, Migration, and Rollback

- **Migration:** one additive table, `people_data_export_log`, generated with `yarn db:generate` in phase X1. It is
  applied only with the owner's approval (AGENTS.md *Ask First*).
- **Feature:** the new ACL feature `people.persons.export` reaches the club administrator through `people.*`. Other
  roles do not get it.
- **Rollback:**
  - Revert the PR. The route, the panel and the contributors go away.
  - The log table stays. It is append-only and harmless, and a later down-migration can drop it once its retention
    period is over.
  - No existing data is changed.

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| A contributor forgets a table | Incomplete answer under art. 15 | TEST-X01 seeds one row per inventory table. The RoPA table list is the checklist in the phase X2 review. | A table added later without a contributor change. Mitigation: a lesson, and the RoPA update rule in the PR template. |
| Third-party data in free text | Art. 15(4) breach | The `reviewRequired` list in the file. The success flash shows its count. The procedure tells the administrator to check those fields before sending. | Depends on the administrator's check (A-9 ⚠) |
| A large export (long-time member) times out | Failed download | Rows per person are in the low thousands. Measured in TEST-X01 with seeded volume. | A move to an async job, if ever needed, keeps the document format |
| Bulk extraction by one account | Data leak | Append-only log with the actor. The access-log mirror. | No rate limit in v1 |
| Format drift | Downstream readers break | `format` + `version`, and a BC row | — |

## Acceptance Criteria

- [ ] **AC-X01** — A club administrator of organization A downloads, for one person of A, one JSON file holding that
  person's rows from every table in the contributor inventory, with encrypted values decrypted (TEST-X01).
- [ ] **AC-X02** — The file holds no id of another person and no other author's message body. Links to other people
  appear only as relation plus name, as DD-X03 allows (TEST-X01).
- [ ] **AC-X03** — A person of another organization or tenant cannot be exported (404), and a caller without
  `people.persons.export` gets 403 (TEST-X02).
- [ ] **AC-X04** — Every export writes one `people_data_export_log` row before the data is read. A failed log write
  returns 500 with no data.
- [ ] **AC-X05** — A module that is not enabled is listed in `omitted` and does not fail the export.
- [ ] The Data requests panel uses the canonical components and semantic tokens, and covers the idle, busy, success,
  error, hidden, keyboard, 375 px, light and dark states (TEST-X04).
- [ ] Every affected API and UI path has self-contained integration coverage, and `yarn verify` passes.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | `AGENTS.md`, `.ai/guides/spec-delivery.md`, `om-spec-writing`, `docs/compliance/ropa.md`, `data-subject-requests.md` |
| Data models, APIs, events, UI, and tests are internally consistent | pass | Traceability table |
| Every workflow completes end to end without a catch-all integration phase | pass | J-X01 across X1–X3; each phase has its own tests |
| Platform-native reuse and extension points were chosen before custom code | pass | DD-X01, DD-X04; reuse map |
| UI contracts identify references, canonical components, and theme/state coverage | pass | Data requests panel row (`ErasurePanel.tsx` reference) |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | Phases X1–X3 |

Verdict: `Blocked — owner approval of the migration (DD-X04) and of the ⚠ assumptions A-2, A-3, A-4 and A-9 (Q-X01)`.

## Resolved assumptions (autonomous defaults)

The run wrote this spec unattended (`om-auto-fix-issue` feature route), so each open question was answered with the
most reversible choice. The owner can override any answer on the spec PR.

| ID | Question | Chosen answer | Rationale |
|---|---|---|---|
| A-1 | JSON or a CSV bundle? | JSON, one file (DD-X02) | No new dependency. The issue accepts either. |
| A-2 | ⚠ NEEDS HUMAN CONFIRMATION — Include the platform audit log and backups? | No. List them in `omitted` with the reason (DD-X05). | Mixed data of several people. The procedure explains them. A legal call for the owner. |
| A-3 | ⚠ NEEDS HUMAN CONFIRMATION — Rows where the person acted as staff? | Counts per table (DD-X06) | Avoids exporting other people's data. Details on request. |
| A-4 | ⚠ NEEDS HUMAN CONFIRMATION — Audit through a new table and migration? | Yes, `people_data_export_log` via `auditedRead` (DD-X04) | The canonical primitive. A migration is Ask First. |
| A-5 | Self-service export for the member? | Deferred (non-goal) | The issue names the administrator. Identity checks stay with the club (procedure §1). |
| A-6 | Who may export? | The club administrator only, via the new `people.persons.export` | Least privilege |
| A-7 | Attachment binaries? | Metadata only | Keeps one JSON file. The club sends files on request. |
| A-8 | Async job or synchronous? | Synchronous, streamed, not stored (DD-X07) | Small per-person volume. No new copy of the data to retain. |
| A-9 | ⚠ NEEDS HUMAN CONFIRMATION — Free text that may name other people (incident `involved`/`description`, import `raw`, bank counterparty)? | Exported on the subject's own rows and listed in `reviewRequired`. The administrator checks those fields before sending. | Leaving them out would hide the subject's own data. Automatic redaction of free text is unreliable. |

## Open Questions

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-X01 | Approve A-2, A-3, A-4 (the migration) and A-9, so that implementation may start | product owner | yes | pending |

## Changelog

Each change is its own file in `.ai/specs/changelog/2026-11-21-vereino-person-data-export/`
(`YYYY-MM-DD-<slug>.md`, one `| date | change |` row). Never add rows to this section.
