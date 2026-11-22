# Run: issue #528 — anonymisation records the basis for kept data and clears order contacts, payer labels and delivery rows (S9.6)

- **Trigger:** cezar run 8efe4af8 (issue labelled `cezar`), skill `om-auto-fix-issue` with the repo-local override; step 1 of 3 (build, draft PR; an independent reviewer marks it ready).
- **Issue:** #528 · **Branch:** `fix/issue-528-anonymisation-kept-data-basis` · **Spec:** `.ai/specs/2026-11-14-vereino-people-life-cycle-and-data-entry.md` (*Security → Erasure*, contract `DepartureContributor`), engineering standards S9.6.

## Steps

1. Claimed #528 (assignee, `in-progress`, 🤖 claim comment). Live-work check: only this run's process in the worktree.
2. Classified: enhancement that closes an existing standard (S9.6) inside an existing spec → reuse-spec, no new spec. No migration, no new module, no dependency; the contract change is an optional method (additive, `BACKWARD_COMPATIBILITY.md` rule 1).
3. Read `people/commands/erasure.ts`, `people/services/erasure.ts`, the departure contributor contract, `payments`/`facilities` contributors, `foundation_deliveries`, the compliance open items D-2, D-3, R-E.
4. Implemented (see Decisions), unit tests for the pure audit rules (100 %), extended TEST-L07.
5. First TEST-L07 run failed: `payments_orders` counted 2 rows for one order (the person placed it for themself, so both updates matched). Fixed by counting distinct order ids; rerun green.
6. Updated the spec, compliance docs (`data-subject-requests.md` D-2 done, D-3 narrowed; `retention.md` R8a, R11, R-E), spec changelog file, lesson `person-data-in-a-module-needs-an-erase-part`.

## Decisions

- **Clear in the anonymisation's transaction, not in subscribers.** The issue suggested subscribers, but S9.6 asks for one audit row listing every table touched; post-commit subscribers cannot report into it. The departure contributor (already the seam `people` uses to reach `payments`/`facilities` without importing them) gains an optional `erase(em, subject)` returning `{ touched, kept }`. `payments` and `facilities` implement it; `foundation_deliveries` is cleared through the new public helper `eraseRecipientDeliveries` from `@/modules/foundation`. The `facilities` subscriber stays for the renter display name (needs the committed person).
- **Audit context** gains `tablesTouched` (`{ table, rows }`, distinct changed rows, zero-row tables dropped) and `keptData` (`{ category, basis, retention, tables }`): accounting records R1 (art. 6(1)(c), Accounting Act art. 74, Tax Ordinance art. 86), request and decision R13, name under hold R2. No erased value enters the context (asserted in TEST-L07).
- **What `payments` clears:** orders placed by the person → contact e-mail, phone, notes; orders for them as participant → print name, notes; charges naming them as debtor or payer → `payer_label`. Amounts, payments, payer codes stay (TEST-L07 negative case). Note: `payer_label` is written only for unregistered renters today (`sourcePayerOf`), so on a person's charge it is normally already empty; the clear covers any stale label.
- **Deliveries:** `person_id`, `user_id`, `email`, `email_hash`, `secret_params` nulled; a still-queued delivery ends `failed` (`address_invalid`) — no message reaches an anonymised person.
- **Out of scope (unchanged):** audit snapshots (V-L03), message bodies (Q-L21), rental purpose/notes, bank counterparty data.

## Files changed

- `packages/app/src/modules/people/lib/erasure-rules.ts` (+ tests), `people/services/departure.ts`, `people/services/erasure.ts`, `people/commands/erasure.ts`
- `packages/app/src/modules/payments/services/departure-contribution.ts`
- `packages/app/src/modules/facilities/services/departure-contribution.ts`
- `packages/app/src/modules/foundation/services/dispatch.ts`, `foundation/index.ts`
- `packages/app/.ai/qa/tests/people/TEST-L07-anonymise-and-delete.spec.ts`
- `.ai/specs/2026-11-14-vereino-people-life-cycle-and-data-entry.md`, `.ai/specs/changelog/2026-11-14-vereino-people-life-cycle-and-data-entry/2026-11-21-issue-528-erasure-audit.md`
- `docs/compliance/data-subject-requests.md`, `docs/compliance/retention.md`
- `.ai/lessons/person-data-in-a-module-needs-an-erase-part.md`, this log

## Commands and results

- `yarn workspace @vereino/app jest src/modules/people/lib/__tests__/erasure-rules.test.ts --coverage` → 23 passed, `erasure-rules.ts` 100 % lines/branches/functions.
- `yarn typecheck` → green.
- `yarn test:integration:vereino --filter TEST-L07` → first run: `Expected ArrayContaining [... {"rows": 1, "table": "payments_orders"} ...] Received [... {"rows": 2, "table": "payments_orders"} ...]`; after the fix: 3 passed (TEST-L07, TEST-L08, TEST-L20).
- `yarn verify` → see the PR body.

## Open problems / next steps

- V-L03 (purging earlier audit snapshots) stays open in the people life-cycle spec.
- The review step (separate session) marks the draft PR ready.
