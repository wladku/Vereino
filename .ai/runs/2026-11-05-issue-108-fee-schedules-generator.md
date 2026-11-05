# Issue #108 — fee schedules, discount rules and the period generator

- **Date:** 2026-11-05
- **Agent / tool:** Claude Code (claude-opus-5-5), `om-auto-fix-issue` with the repo-local override, cezar task
- **Trigger:** cezar task "108"; resumed on the owner's instruction "continue autonomously, make reasonable assumptions, do not ask"
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-club-payments.md` phase 4 step 2; issue #108 (epic #106); branch `feat/issue-108-fee-schedules-generator`
- **Status:** in progress

## Goal

Build the `payments` module slice from E07-S01: fee schedules (B-20), discount rules, the "Coaches and payments" setting, the idempotent period generator (B-21) and the one-off camp fee (REQ-011, REQ-018, TEST-018, TEST-048).

## Steps

1. Read issue #108, its dependency #107 (closed) and epic #106. The spec is `Ready for implementation` (D30). The issue still listed the charge-generation undo as **blocking**, and the issue said "ask before migrations".
2. First pass: stopped before claiming, and posted both needs with a proposed undo default on #108 (comment 6657581340). Committed this log as a stop record.
3. The owner then ordered the run to continue autonomously. I took both points as autonomous defaults and recorded them on #108 (comment 6657607656):
   - the undo default as proposed;
   - the `payments` migration as approved under D-030. The spec's own changelog row of 2026-11-04 says "modules and migrations approved".
4. Claimed the issue (assignee, `in-progress`, the comment).
5. Pure logic:
   - `lib/payments-rules.ts`: vocabularies, the fee target XOR, the discount value and conditions with the R12 defaults, billing periods, the 12-month range, the reference day, session counting.
   - `lib/charge-plan.ts`: payer, age ranking, sibling ranking per payer across sections, the most favorable discount, the plan and its summary.
   - Unit tests at 100 % line, branch and function coverage.
6. Data:
   - entities `Fee`, `DiscountRule`, `Charge`, `ChargeGeneration`, `PaymentsSettings`;
   - `encryption.ts` (`payments_charges.description`, as the spec requires);
   - the migration, generated offline from an empty seed snapshot with an unreachable `DATABASE_URL`, plus a header comment and a hand-written `down()`.
7. Commands, all undoable and run through `authorizeScoped` with `club_admin`:
   - fees and discount rules (create, update, delete);
   - settings;
   - `payments.charges.generate`: a tried advisory lock, so a held lock answers 409 at once. Its undo cancels the run's open charges.
8. `people.personDirectory.primaryPayers` added (additive DI method), so `payments` reads payers without touching `people` entities.
9. Routes:
   - CRUD `/api/payments/fees` and `/api/payments/discount-rules`;
   - `GET /api/payments/charges`;
   - `POST /api/payments/charges/generate`;
   - `GET`/`PUT /api/payments/settings`;
   - all with `metadata` and `openApi`.
10. Pages and catalogs:
    - B-20 with the tabs Fees / Discounts / Coaches and payments;
    - B-21 charges with the "Generate period" dialog and its summary;
    - en and pl catalogs.
11. Module registration: `src/modules.ts` and `vereino-modules.json`.
12. Integration tests: TEST-018 (API), TEST-048 (camp, API) and E07-S01 (pages).
13. Spec updated:
    - the step 2 note;
    - the data-model rows: whole-percent `percent`; the charge's `generation_id` and cancel fields; the unique index on live fee charges; the new `payments_charge_generations`;
    - the compliance row and verdict: the generation undo is answered, the reverse command is still open;
    - a changelog row.

## Decisions

- **Undo of a generation:** it cancels the run's charges that are still `open`, never deletes them, and marks the run undone. The unique index covers only live (non-cancelled) `fee` charges, so the period can be generated again.
  - Reason: the owner's default (#108). An audit trail with no hard deletes (S10).
- **Concurrent generation:** `pg_try_advisory_xact_lock` per club, and a held lock answers 409 `generation_in_progress` immediately.
  - Reason: the AC asks for a 409, not a wait.
- **Range of the period:** `YYYY-MM` from 12 months back to 12 months ahead.
  - Reason: "no earlier than 12 months back" is B-21's rule. The 12-month cap ahead guards against typos.
- **Reference day:** memberships, guardianships and ages are read on today for the current month, on the first day for a future month and on the last day for a past month.
- **One-off fees:** labelled `one_off`, so a camp is charged once whatever month generates it.
- **Per-session fees:** charged `amount × sessions not cancelled` in the month, and nothing is created without sessions. Nothing in the spec defined this, so it is the simplest reading of "per session".
- **Payer:**
  - the active primary-payer guardian;
  - otherwise an adult pays for themselves;
  - otherwise the charge is `payer_missing`. An unknown birth date is treated as a minor.
- **Sibling ranking:** per payer over all sections; existing charges of the period take part, but they never change. The full-rate child is `oldest` or `youngest`, unknown birth dates rank last, and ties go by id. Several rules → the largest discount, with ties broken by rule name, then id.
- **Percent column:** `percent` is a whole number 1–100 (`int`) rather than `numeric`, per the issue's validation (recorded in the spec).
- **Scope and roles:** every write is `club_admin` only, because the treasurer role is held back (D-030). Fee, discount and settings routes need `payments.manage`, and the charge list needs `payments.view`.
- **Deferred:**
  - the scheduled `payments:generate-charges` job;
  - the charge list's perspectives, payment recording and cancellation (E07-S02);
  - `payer_institution_id` and `payee_institution_id` (rental charges, DD-19).

## Files changed

- `packages/app/src/modules/payments/**`: the new module.
- `packages/app/src/modules/people/services/person-directory.ts`: `primaryPayers`.
- `packages/app/src/modules.ts`, `packages/app/vereino-modules.json`: `payments` enabled.
- `packages/app/.ai/qa/tests/_fixtures/payments.ts`, `packages/app/.ai/qa/tests/payments/*.spec.ts`: the tests.
- `.ai/specs/2026-10-27-vereino-club-payments.md`: step note, data model, compliance, changelog.
- `.ai/runs/2026-11-05-issue-108-fee-schedules-generator.md`: this log.

## Commands and results

- `yarn generate`, `yarn typecheck`: green.
- `npx jest src/modules/payments --coverage`: 40 tests passed; `charge-plan.ts`, `payments-rules.ts` and `error-codes.ts` at 100 % statements, branches, functions and lines. The first run showed one uncovered branch (`?? null` in the sibling ranking), so I added a case for two children without birth dates.
- `DATABASE_URL=postgres://…@127.0.0.1:1/none yarn db:generate`: `payments: generated Migration20261105123548_payments.ts`, every other module "no changes". No `db:migrate` against any database.
- Integration and gate results: see below.

## Open problems

## Next steps
