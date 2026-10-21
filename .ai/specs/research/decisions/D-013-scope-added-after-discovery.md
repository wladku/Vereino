---
number: D-013
date: 2026-10-20
owner: Władek Kuć
source: product owner's answers in the spec's open questions Q-021…Q-038 and requests of 2026-10-20 (spec writing session)
status: confirmed
---
# D-013 Scope added to 1.0 after discovery (REQ-023…REQ-035)
**Decision:** the Must set of `2026-10-20-moscow.md` (eight items, D-001) is extended with the requirements below. They are Must in the specification `.ai/specs/2026-10-20-vereino-club-management.md`; the specification's phases replace the MoSCoW effort estimate.

| REQ | What | Source |
|---|---|---|
| REQ-023 | Internal booking of any club facility by a coach, instructor, coordinator or administrator of any section, without approval | Q-021, Q-022 |
| REQ-024 | Online booking request from an outsider in the public facility calendar; valid only after administrator approval; no online payment | Q-021, Q-023 |
| REQ-025 | Public club page with section pages (description, classes, schedule, terms, instructors, materials, contact), blocks switchable in the club settings | Q-021, Q-024 |
| REQ-026 | Prices block on the section page (membership fee and sibling discount) | Q-024 |
| REQ-027 | One-off event (`tournament`, `other`) for one's own group created by a coach without the coordinator's consent | Q-022 |
| REQ-028 | Club logo and section logos | product owner request 2026-10-20 |
| REQ-029 | Bulk-set weekly booking availability for external requests | product owner request 2026-10-20 |
| REQ-030 | Bank statement import (CSV/MT940) with automatic matching by payer code | product owner request 2026-10-20; format open in Q-028, overpayments in Q-030 |
| REQ-031 | Cash payments with receipt numbers (KP/YYYY/MM/NNN) in the panel and on the phone | Q-029 |
| REQ-032 | Order campaign (e.g. kits) — **MoSCoW Could → Must** | Q-031, Q-033 (Q-034, Q-035 open) |
| REQ-033 | The coach's view of their groups' payments, accepting cash, kit handover, cash handover to the treasurer | Q-029, Q-032 |
| REQ-034 | Separate treasurer role — finances only | Q-037 |
| REQ-035 | Multilingual interface (English and Polish catalogs in 1.0) | Q-038 |

**Kit orders Could → Must:** `moscow.md` listed "Kit orders (size survey)" under Could and D-001 put the shop "later". The product owner raised it to Must on 2026-10-20 because the order campaign replaces the Google Form and the spreadsheet the club uses today, and the payments for it flow through the same charges, cash receipts and handovers as membership fees (REQ-031, REQ-033). The shop as such stays out of 1.0.

**Related confirmations of the same day:** D-009 confirmed with push dropped from 1.0 (Q-002); D-010 confirmed with Stripe (Q-003); D-001 extended on 2026-10-20 with the full facility module and online payments.

**Why:** the pilot club asked for the things it does by hand today (bookings by phone, a Google Form for kits, cash "on trust", a bank statement retyped into Excel); each of them is on the path between the parent and the treasurer, and leaving them out would keep the club in Excel.

**To change:** if the extended Must set threatens the 1.0 date — the candidates to move to Should are, in order, bulk availability (REQ-029), logos (REQ-028) and bank import (REQ-030); the rest is tied to the payments and facility thesis.

**Revisit:** at the exit gate of phase 4 (payments) and phase 5 (facility) of the specification.
