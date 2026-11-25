# Data-subject request procedure

> **Status: draft — not approved.** Approved by the product owner on: _(date)_. Adopted by the club on: _(date)_.

GDPR arts. 12–22; engineering standards S9.6, S9.7. The club (controller) answers requests; the host (processor)
helps it (art. 28(3)(e)). Code paths are under `packages/app/src/modules/`. It is not legal advice.

## 1. Receiving a request

1. **Channels.** Any channel counts (e-mail, letter, in person, a message in Vereino). The privacy notice (#469) names
   the club's contact. A staff member who receives a request passes it to the club's data protection contact the same
   day.
2. **Register.** The club keeps a request register **outside this repository** (it holds personal data): date
   received, requester, right, identity check, deadline, decision, date answered, what was done. A request concerning
   the host's systems is also forwarded to the host.
3. **Identity.** Answer only to the person or someone entitled to act for them:
   - a member: the e-mail address in `people_persons.email`, or in person;
   - a ward: the guardian linked in `people_guardianships`; a ward aged 13 or more may also exercise their own rights,
     and the club weighs the ward's interest when a guardian asks for a teenager's data;
   - anyone else: ask for one more fact the club already holds; never ask for more data than needed to verify.
4. **Deadline.** Without undue delay and **within one month** of receipt; extendable by two more months for complex
   or many requests, telling the person within the first month why (art. 12(3)). Free of charge unless manifestly
   unfounded or excessive (art. 12(5)).
5. **Refusal** (fully or partly) states the reason and the right to complain to UODO and to go to court (art. 12(4)).

## 2. By right

### Access (art. 15) and portability (art. 20)

The club administrator exports one person's data in one file: the person record › *Details* › **Data requests** ›
**Export personal data** (`GET /api/people/persons/{id}/data-export`, feature `people.persons.export`; person data
export spec, #527). The file is a JSON document (`vereino.person-data-export`, version 1) with the person's rows from
every table of [`ropa.md`](ropa.md) that refers to them, encrypted values decrypted — including the medical certificate
date (`medicalValidUntil` in the people subject record) and the `medical` consent (A15, #682). Every export is recorded in
`people_data_export_log` (who, when, which person, why) before any data is read.

1. Check the requester's identity (§1), then download the export from the person record.
2. Read the `reviewRequired` list (the success message gives its count): free-text fields such as incident
   descriptions, substitution reasons, import rows and bank counterparty fields may name other people. Remove other
   people's data from those fields before sending (art. 15(4)). Other people already appear only as a relation (with
   a name only for a guardian, ward, payer, debtor, orderer or coach), never by id.
3. `actorCounts` says how many rows the person wrote as staff (attendance marked, payments recorded, …); the club
   gives the details on request, with art. 15(4) applied by hand.
4. `omitted` lists what the file leaves out and why: modules not enabled, the platform audit and access logs,
   application logs and backups (security records mixing several people's data, art. 6(1)(f)), and attachment
   binaries (the file lists their metadata; send the person's photo or a contract file separately on request).
5. Add the purposes, bases, recipients, retention and the right to complain (art. 15(1)(a)–(h)) by pointing to the
   privacy notice.
6. **Portability** covers data the person provided, processed under art. 6(1)(a) or (b) by automated means: the
   sections marked `"portable": true` (profile, contacts, consents, orders, rental requests). The same JSON file is the
   structured, machine-readable copy.

### Rectification (art. 16)

- The person corrects their own language, phone, e-mail and consent flags: `PUT /api/people/me`
  (`people.persons.update_self`, `people/commands/self.ts`). Name and birth date are not self-editable.
- Staff correct the rest: `PUT /api/people/persons` (`people.persons.update`, feature `people.manage`). Every change
  writes an audit entry.
- An anonymised person cannot be edited (409 `person_anonymized`).

### Erasure (art. 17) — by anonymisation (S9.6)

1. Record the request as a departure request with `erasure_requested = true` (`people_departure_requests`,
   `people/commands/departure-requests.ts`); a request for a person still taking part ends their membership first.
2. When the conditions hold, the club administrator runs **anonymise** (`POST /api/people/persons/{id}/anonymize`,
   command `people.persons.anonymize`, feature `people.persons.anonymize`, confirming the last name). It is refused
   (409 `anonymize_blocked`) until: the last day has passed, the account is closed, no active guardianship remains,
   no open charges or cash held, and a recorded request exists (`people/lib/erasure-rules.ts`). It cannot be undone.
3. **What it erases** (`people/services/erasure.ts`): phone, e-mail, notes, PESEL and its hash, external id and hash,
   photo (files released), birth date, language, the medical certificate date (`medical_valid_until`, #682), consents
   (including `medical`), ward consents on guardianships (including `medical`), departure-request notes,
   matched import rows; in the same transaction (#528) the contact e-mail, phone and notes of the orders the person
   placed and the print name and notes of orders for them (`payments_orders`), a typed payer label on charges naming
   them (`payments_charges.payer_label`), the person and account ids, address hash and secret parameters of their
   deliveries (`foundation_deliveries`) and the contact snapshots of their rentals (`facilities_rentals`; the renter's
   display name follows after the commit through the `facilities` subscriber of `people.person.anonymized`).
4. **What it keeps, and why.** Accounting rows stay linked through the payer reference code (art. 17(3)(b), art.
   6(1)(c)); the **name** stays until `erasure_hold_until` (5 years after the year of the latest payment, then cleared by
   the `people:life-cycle` job — see [`retention.md`](retention.md) R2 and open item R-A).
5. **Audit row** (S9.6). The command writes one audit entry with the acting role (who requested is the request id),
   when, the hold date, the counts of guardianships, departure requests and import rows touched, the photo files
   released, `tablesTouched` (every table the erasure wrote to with its row count) and `keptData` (each kept category
   with its legal basis, its row in [`retention.md`](retention.md) and its tables: accounting records R1, the request
   and decision R13, the name under the hold R2) — never the erased values.
6. **Not erased today** (open item D-3): bank counterparty data (kept as accounting records), message bodies (people
   life-cycle spec Q-L21), entry bans and incidents (kept for safety, art. 17(3)(e)), rental purpose and notes, earlier
   audit snapshots (V-L03). Erased data also remain in backups until the copy expires, up to about 13 months
   ([`retention.md`](retention.md) R17); tell the person so.
7. A person entered **by mistake** and without history may be deleted instead (`people.persons.delete`, soft delete,
   only with no history in any module).

### Restriction (art. 18) and objection (art. 21)

No restriction flag exists. The club records the restriction in the request register and the administrator stops
the processing by hand (e.g. removes the person from groups and notices); open item D-4. Objection applies to
processing under art. 6(1)(f) — safety logs, contact access log, published contacts: the club weighs it and answers.

### Withdrawing consent (art. 7(3))

As easy as giving it: the person switches off the three profile consents in the member area (`PUT /api/people/me`);
a guardian changes a ward's image and trip consents (`people_guardianships.consents`). Only the current state is
stored, history is in the audit log; the club removes any published name or image the same day. Withdrawing the
`medical` consent (the adult, or any guardian of a ward) clears the medical certificate date at once
([`retention.md`](retention.md) R20, #682).

## 3. Open items

| Id | What | Owner |
|---|---|---|
| D-1 | ~~Person data export for access and portability (structured, machine-readable)~~ — done (#527) | #527 |
| D-2 | ~~The anonymisation audit row records the legal basis for what is kept and the tables touched (S9.6)~~ — done (#528) | #528 |
| D-3 | Erasure gaps: audit snapshots (V-L03); order contact data, payer label and delivery rows are cleared since #528 | people life-cycle spec |
| D-4 | A restriction flag, or a documented manual way to restrict processing | product owner |
