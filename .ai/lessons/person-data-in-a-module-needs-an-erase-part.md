---
title: "A module that stores a person's personal data implements the departure contributor's erase, in the anonymisation's transaction"
modules: ["people", "payments", "facilities", "foundation"]
areas: ["module-data"]
topics: ["erasure", "privacy", "audit", "gdpr"]
---

# A module that stores a person's personal data implements the departure contributor's erase, in the anonymisation's transaction

**Context**: #528 (S9.6). `people.persons.anonymize` cleared only `people`'s own tables; `payments_orders` contacts,
`payments_charges.payer_label` and `foundation_deliveries` recipients stayed, and only `facilities` subscribed to
`people.person.anonymized`. The audit entry could not list the tables touched or the basis for what was kept,
because the other modules' clearing ran in subscribers after the commit and `people` knew nothing about it.

**Problem**: An erasure split between a command and post-commit subscribers cannot write one audit row that names
every table touched (S9.6), and a new module that stores contacts, names or free text about a person is silently left
out of the erasure. Counting rows per update also double-counts a row cleared by two updates (an order the person
placed for themself is both "placed by" and "for" them).

**Rule**: Every module that stores personal data of a `people` person (contacts, names, free text, hashes of an
address) implements the optional `erase(em, subject)` of its `people.departure.<module>` contributor
(`people/services/departure.ts`): it clears its fields with the caller's EntityManager, inside the anonymisation's
transaction, and returns `{ touched: [{ table, rows }], kept: [{ category, basis, retention, tables }] }` — row counts
of distinct rows, never values; `kept` cites the row of `docs/compliance/retention.md`. Accounting amounts, payments
and payer codes stay. A `foundation` table is cleared through a helper exported from `@/modules/foundation`
(`eraseRecipientDeliveries`). Post-commit subscribers of `people.person.anonymized` only do what needs the committed
state (e.g. a display name read from the person directory). Extend TEST-L07 with the new table.

**Applies to**: `packages/app/src/modules/*/services/departure-contribution.ts`, `people/services/erasure.ts`
(`eraseContributorData`), `people/lib/erasure-rules.ts` (`erasureAudit`), `people/commands/erasure.ts`, TEST-L07.
