# Data protection impact assessment (DPIA)

> **Status: draft — not approved.** Approved by the product owner on: _(date)_. Adopted by the club (controller) on:
> _(date, by whom)_. To be completed **before the pilot** (S9.7) and reviewed when the processing, the hosting or a
> risk changes, and at least yearly.

GDPR art. 35; engineering standards S9.7. The structure follows the minimum content of art. 35(7) — (a) description,
(b) necessity and proportionality, (c) risks to the people concerned, (d) measures — which is also the content the
WP 248 rev.01 guidelines (Annex 2), on which the UODO list builds, ask for. It is not legal advice.

## 0. Why a DPIA is required

Art. 35(1) requires a DPIA for processing "likely to result in a high risk". The UODO list of processing that needs a
DPIA (*Komunikat Prezesa UODO z dnia 17 czerwca 2019 r.*, M.P. 2019 poz. 666) says that processing meeting **at least
two criteria** generally needs one, and it was drawn up on the basis of the WP29 guidelines WP 248 rev.01, which it
supplements ([`legal-verification.md`](legal-verification.md), B2). Vereino meets two WP 248 criteria:

| WP 248 rev.01 criterion | Why it applies |
|---|---|
| **4** — sensitive data or data of a highly personal nature, including "financial data that might be used for payment fraud" | charges, payments, bank statement imports with counterparties' account numbers and transfer titles (`payments_bank_transactions`) |
| **7** — data concerning vulnerable data subjects; "Vulnerable data subjects may include children" | most participants are wards under 18, including children under 13 (`people_persons.birth_date`, `people_guardianships`) |

The children criterion is WP 248's, not one of the UODO list's twelve criteria (B2 corrected). Two criteria are met, so
a DPIA is carried out.

## 1. Description of the processing (art. 35(7)(a))

- **Nature.** A web application for one club: membership register, guardianships and consents, groups and session
  attendance, messages and e-mail notices, fees and payments (manual, bank import, online through Stripe), orders,
  place rentals for outside renters, facility logs and incidents. The activities A1–A14 and their tables are in
  [`ropa.md`](ropa.md).
- **Scope.** The pilot club: its members, wards, guardians, staff and outside renters — in the order of hundreds of
  people, one organization. No profiling, no automated decisions with legal effect, no monitoring of public places,
  no biometric, genetic or location data.
- **Context.** Children cannot judge the processing themselves; guardians act for them (S9.3). Accounts of 13–17-year
  olds are enabled by a guardian, never by self sign-up; consent-based options follow the 16-year rule (B1). Staff
  are volunteers or part-time coaches using their own phones.
- **Purposes.** Running the club's membership and activities and its accounting (S9.2).
- **Hosting.** Railway EU West, operated by the host as processor; off-site encrypted backups at a second EU provider;
  e-mail through Resend; Stripe as an independent controller ([`processors.md`](processors.md)).

## 2. Necessity and proportionality (art. 35(7)(b))

| Question | Answer |
|---|---|
| Lawful basis | art. 6(1)(b) for core processing, 6(1)(c) for accounting, 6(1)(f) for safety logs, 6(1)(a) only for optional processing (S9.2; [`ropa.md`](ropa.md)) |
| Minimisation | a field exists only if a club spec requirement needs it; PESEL optional; public pages show no participant or guardian names; no personal data in logs, events, URLs or errors (S9.4) |
| Accuracy | members correct their contacts themselves (`PUT /api/people/me`); staff correct the rest ([`data-subject-requests.md`](data-subject-requests.md)) |
| Storage limitation | [`retention.md`](retention.md) — several periods are not yet enforced by a job (gaps R1, R3; R9 enforced since #525) |
| Information | privacy notices in Polish and English and a short version for children (E19-S03, #469) |
| Data subjects' rights | [`data-subject-requests.md`](data-subject-requests.md) |
| Processors and transfers | [`processors.md`](processors.md); DPA not yet signed (P-0) |
| Views of data subjects (art. 35(9)) | _(the club records whether it asked members or guardians, e.g. at a general meeting, and what they said)_ |

## 3. Risks to the people concerned (art. 35(7)(c))

Likelihood and severity: low / medium / high. "Residual" is the risk after the measures in §4 that already exist;
open measures are listed in §5.

| # | Risk | Likelihood | Severity | Existing measures | Residual |
|---|---|---|---|---|---|
| D-1 | Another club or an outsider reads a child's data through a scope or authorization bug | low | high | server-derived tenant and organization scope, fail closed; feature-based ACL; second-tenant and insufficient-feature tests per route (S8.3, S13.4) | low |
| D-2 | A staff member reads more than needed (e.g. all guardians' phone numbers) | medium | medium | contacts shown to coaches only with the `share_contact_with_coaches` consent; every read logged in `activities_contact_access_log` | low |
| D-3 | A personal link (declaration, order, rental) is forwarded or leaked and opened by someone else | medium | medium | 32-byte tokens stored as hashes, one purpose and one subject, expiry, `no-referrer`, `no-store` (S8.6, S8.7) | medium — dead tokens are deleted 30 days after use or expiry (R9, #525) |
| D-4 | An administrator's or treasurer's account is taken over (phishing, reused password) and payment or child data is exposed or changed | medium | high | platform sign-in rate limits; audit log | **medium** — no MFA in 1.0 (ENG-Q-09) and 8-hour sessions without idle timeout (ENG-Q-12) |
| D-5 | Data are lost (database failure, operator mistake) | low | medium | nightly encrypted off-site dump, restore drill, RTO ≤ 60 min ([`backups.md`](../ops/backups.md)) | medium — up to 24 h of data can be lost (no PITR, ENG-Q-03) |
| D-6 | Payment data are misused (wrong person charged, fraud with account numbers from bank imports) | low | high | encrypted counterparty data; only exact payer-code matches booked automatically (S10.7); immutable payments; no card data stored | low |
| D-7 | E-mail goes to the wrong person or reveals another family's data | low | medium | templates without other participants' names; addresses from the person record; staging only to an allowlist (S12.6) | low |
| D-8 | Health or family information written into free text (incident description, people involved, substitution reason, notes) — art. 9 data without a documented basis | medium | high | these fields are encrypted at rest | **medium** — the club instructs staff to record only what safety requires; art. 9(2) basis to be decided by the club (open item DP-4) |
| D-9 | Data kept longer than needed: former participants, dead links, messages, logs, audit snapshots | high | medium | anonymisation on request; import purge, request purge, delivery e-mail wipe | **medium** — automatic 12-month anonymisation (#471), token deletion and several periods are open ([`retention.md`](retention.md)) |
| D-10 | Erased data come back or persist: backups up to ~13 months, audit snapshots (V-L03), order contact data | medium | medium | backups encrypted, key held by two people only | medium — see R-F, R-G, R-E |
| D-11 | Transfer to US vendors' staff (Railway, Resend) without a confirmed mechanism | medium | medium | EU regions chosen | medium until P-1a and P-2a are confirmed |
| D-12 | A child's name or image is published without permission | low | high | public pages show no participant names (S9.4); image and name publication only with recorded consent (S9.2) | low |
| D-13 | A person cannot get a copy of their data (no export) or the request is missed | medium | low | procedure and manual compilation ([`data-subject-requests.md`](data-subject-requests.md)) | medium until the export exists |

## 4. Measures (art. 35(7)(d))

Technical and organisational measures in place are listed in [`ropa.md` §3](ropa.md#3-security-measures-art-321-art-301g)
and [`asvs-checklist.md`](asvs-checklist.md); the incident and breach path is in [`incident.md`](../ops/incident.md).

## 5. Measures still needed before or soon after the pilot

| Id | Measure | Reduces | Owner |
|---|---|---|---|
| DP-1 | Sign the DPA; confirm regions and transfer mechanisms of Railway and Resend; choose the backup provider and the uptime monitor (P-0 … P-5) | D-11 | product owner |
| DP-2 | Decide ENG-Q-09 (MFA) and ENG-Q-12 (session lifetime); at least hide "remember me" for staff roles | D-4 | product owner |
| DP-3 | Build the retention jobs: former participants after 12 months (#471), dead tokens, and the open periods (R-A … R-G) | D-3, D-9, D-10 | #471, #525, #526, #528 |
| DP-4 | Club instruction to staff on free text; decide the art. 9(2) basis for incident and substitution notes (e.g. art. 9(2)(c) vital interests or (f) legal claims) | D-8 | club |
| DP-5 | Person data export for access and portability | D-13 | #527 |
| DP-6 | Privacy notices, including backups and retention (#469) | transparency | #469 |

## 6. Conclusion

_(to be completed by the club with the owner after §5)_ With DP-1 done and DP-2 decided, the residual risks are
medium at most and do not require prior consultation with UODO under art. 36. If the club accepts D-4 or D-8 at a
high residual level, it consults UODO before the pilot.

| | |
|---|---|
| Assessed by | _(name, role, date)_ |
| Accepted by the club | _(name, role, date)_ |
| Next review | _(date)_ |
