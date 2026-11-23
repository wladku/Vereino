# Records of processing activities

> **Status: draft — not approved.** Approved by the product owner on: _(date)_. The club (controller) adopts it as
> its own record and fills in its identity before the pilot data gate.

GDPR art. 30(1) (controller) and art. 30(2) (processor); engineering standards S9.1–S9.4, S9.7. Data categories are
taken from the entities (`packages/app/src/modules/<module>/data/entities.ts`) and cited by table, not guessed. "ENC"
marks columns the module encrypts at rest (`<module>/encryption.ts`). It is not legal advice.

## 1. Controller record (art. 30(1))

| | |
|---|---|
| Controller | _(the club's name, address, KRS or other registration number — filled in by the club)_ |
| Contact for data protection | _(club board member or e-mail — filled in by the club)_ |
| Data protection officer | _(none, unless the club decides art. 37 applies — to be recorded by the club)_ |
| Processor | the host ([`processors.md`](processors.md)); DPA signer open (ENG-Q-03, P-0) |
| Transfers outside the EEA | only through the host's sub-processors — see [`processors.md`](processors.md) (open items P-1a, P-2a) |
| Retention | per activity below; full schedule in [`retention.md`](retention.md) |
| Security measures (art. 32) | [§3](#3-security-measures-art-321-art-301g) |

**Data subjects** used below: *members* (adult participants), *wards* (participants under 18, including children
under 13), *guardians*, *staff* (coaches, administrators, treasurers, maintainers), *renters* (outside people booking
a place), *external contacts* (institutions, opposing teams, section public contacts).

### Processing activities

| # | Activity and purpose | Legal basis (S9.2) | Data subjects | Data categories (tables) | Recipients | Retention |
|---|---|---|---|---|---|---|
| A1 | **Membership register** — keep who belongs to the club, their roles and contacts | art. 6(1)(b) membership contract with the member or, for a ward, the guardian | members, wards, guardians, staff | name (ENC), birth date, e-mail and phone (ENC), preferred language, notes (ENC), **PESEL — optional** (ENC, with a lookup hash), external id (ENC), leaving date, photo (private attachment) — `people_persons`; roles — `people_role_assignments`; departure requests with note (ENC) — `people_departure_requests` | host and sub-processors | R3, R4, R13 |
| A2 | **Guardianship and consents** — link wards to guardians, record the guardian's permissions | art. 6(1)(b); **art. 6(1)(a)** for optional processing: image, publishing a name, sharing contacts or presence (S9.2, S9.3) | wards, guardians, members | relation, primary payer — `people_guardianships`; consents `{regulations, image, trips}` with given at and by whom — `people_guardianships.consents`, `people_persons.consents`; profile consent timestamps — `people_persons.*_at`; consent wording — `club_core_club_settings.consent_texts` | host | R3 |
| A3 | **Groups, sessions and attendance** — plan sessions, record who comes, who was present, substitutions | art. 6(1)(b) | wards, members, staff | memberships — `groups_memberships`; attendance declared and actual, who declared or marked — `activities_attendances`; coach ids — `activities_activities`, `activities_occurrences`; substitution reason (ENC, may name health or family matters) — `activities_substitution_entries`; declaration links (token hash) — `activities_declaration_tokens` | host | R3, R9 |
| A4 | **Communication** — threads between staff and families; e-mail notices and personal links | art. 6(1)(b) | all signed-in people, guardians | thread subject and message body (ENC), participants, read times — `communication_*`; deliveries with e-mail (ENC, wiped after sending, hash kept), link secret (ENC, wiped) — `foundation_deliveries`, `foundation_dispatches` | host, **Resend** (P-2) | R8, R8a, R10 |
| A5 | **Fees, charges and payments (accounting)** — charge fees, book payments, issue cash receipts and handovers, import bank statements | art. 6(1)(b) for charging; **art. 6(1)(c)** for keeping accounting records (*ustawa o rachunkowości* art. 74) | members, guardians (payers), renters | debtor and payer ids, payer label (ENC), description (ENC), amounts — `payments_charges`; payments with transfer title (ENC), receipt number — `payments_payments`; `payments_cash_handovers`; payer code — `payments_payer_refs`; bank counterparty name, **account number** and title (ENC) — `payments_bank_transactions`; statement files — `payments_bank_imports` | host, the club's accountant | R1, R1a, R2 |
| A6 | **Online payments** — pay a charge or an order by card, BLIK or Przelewy24 | art. 6(1)(b) | payers | checkout with payer id and amount — `payments_checkouts`; Stripe receives payer name and e-mail and ids in `metadata`; no card data in Vereino (S10.8) | **Stripe as independent controller** (P-3) | R1, R18 |
| A7 | **Orders** (kit and other group orders) | art. 6(1)(b) | wards, guardians, members | participant and orderer ids, contact e-mail and phone (ENC), print name and number, notes (ENC) — `payments_orders`, `payments_order_lines`; order links (token hash) — `payments_order_links` | host, Stripe (when paid online) | R11, R9 |
| A8 | **Place rentals** — outside renters and members request and book places | art. 6(1)(b) (steps before and performance of a rental contract) | renters, members | renter name and contacts (ENC), language, purpose, decision reason, notes (ENC), amount, regulations accepted at, e-mail verification (token hash) — `facilities_rentals`; cancellation links — `facilities_rental_links` | host, Resend | R6, R7, R1, R9 |
| A9 | **Facility safety and operation** — opening logs, incidents, entry bans, maintenance | **art. 6(1)(f)** safety and liability (S9.2) | staff, members, renters, other people involved | operator, condition, remarks (ENC) — `facilities_logs`; reporter, description and people involved (ENC, **may contain health data**), action taken, photos — `facilities_incidents`, `facilities_incident_photos`; ban subject and reason (ENC) — `facilities_entry_bans`; responsible person — `facilities_maintenance_tasks`; booker — `facilities_internal_bookings` | host | R12 |
| A10 | **Contact access log** — record which staff member read guardians' contacts and why; record which administrator exported a person's data (#527) | art. 6(1)(f) accountability for access to contacts | staff, guardians | actor, role, occurrence, ids of guardians read, purpose (no contact values) — `activities_contact_access_log`; actor, role, exported person id, purpose (no exported values) — `people_data_export_log` | host | R12 |
| A11 | **Staff contracts** — coaches' and other staff contracts and rates | art. 6(1)(b); 6(1)(c) where they ground payments | staff | party, terms with rates (ENC), attached contract — `club_core_contracts` | host, the club's accountant | R14 |
| A12 | **Imports** — bulk entry of people from a spreadsheet | art. 6(1)(b) (as A1) | members, wards, guardians | uploaded file, raw rows (ENC) — `people_imports`, `people_import_rows` | host | R5 |
| A13 | **Club data and public pages** — publish the club, sections and places | art. 6(1)(f) for contacts published by their owner's choice; art. 6(1)(a) for publishing an instructor's name (S9.2) | external contacts, staff | section public contact name, e-mail, phone — `club_core_sections`; place contacts (ENC) — `club_core_places`; institution contacts and bank account (ENC) — `club_core_institutions`; opposing team contact (ENC) — `groups_external_teams`. Public pages show no participant or guardian names (S9.4) | the public (only the published fields), host | manual (R-C) |
| A14 | **Security and audit** — platform audit log of commands, sign-in, application logs | art. 6(1)(f) security; art. 5(2) accountability | all users | audit entries with snapshots — platform `action_logs`; application logs without personal data (S15.1) | host, Railway | R15, R16, R17 |

**Special categories (art. 9).** Vereino has no column for health data. Free-text fields can receive it
(`facilities_incidents.description`, `involved`; `activities_substitution_entries.reason`; notes). The club tells its
staff to write only what is needed; the DPIA treats this as a risk ([`dpia.md`](dpia.md) risk D-8).

**PESEL** is optional (S9.4). The club records why it collects it (for example insurance or federation registration)
before entering it; without such a reason the field stays empty (open item O-1).

## 2. Processor record (art. 30(2)) — the host

| | |
|---|---|
| Processor | the host (the product owner, ENG-Q-03) |
| Controller on whose behalf | the club |
| Categories of processing | hosting, storage, backup, monitoring, e-mail delivery and maintenance of the Vereino instance — all activities A1–A14 |
| Sub-processors and transfers | [`processors.md`](processors.md) |
| Security measures | §3 |

## 3. Security measures (art. 32(1), art. 30(1)(g))

- Tenant and organization scope on every query, derived on the server and failing closed; feature-based authorization
  (S8.3); second-tenant tests per route (S13.4).
- Encryption at rest of the columns marked ENC; TLS in transit; backups encrypted with `age`, key outside Railway
  ([`backups.md`](../ops/backups.md)).
- Personal links: random 32-byte tokens stored only as SHA-256, single purpose, expiring (S8.7).
- No personal data in logs, events, URLs or error messages (S9.4, S15.1).
- Nightly off-site backup, RPO ≤ 24 hours, restore drill ([`backups.md`](../ops/backups.md)); monitoring and the
  incident and breach path ([`incident.md`](../ops/incident.md)).
- OWASP ASVS 5.0 level 2 as the target, with known gaps listed in [`asvs-checklist.md`](asvs-checklist.md) (no MFA in
  1.0, session lifetime, missing HSTS).

## Open items

| Id | What | Owner |
|---|---|---|
| O-1 | The club records why it collects PESEL, or leaves it empty | club |
| O-2 | The club fills in the controller identity and contact | club |
| O-3 | Basis of the `trips` consent: a guardian's permission for an activity may be part of the contract rather than art. 6(1)(a) consent; the club decides and the privacy notice (#469) follows | club, #469 |
