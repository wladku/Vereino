# Run — issue #295: manual charge, assigning a payer, the person record's Charges tab (E12-S05)

- **Date:** 2026-11-17
- **Trigger:** cezar run fd025469 (`issue.labeled` `cezar`), skill `om-auto-fix-issue` with the vereino override.
- **Issue:** [#295](https://github.com/wladku/Vereino/issues/295) — feature route.
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-payments.md`, phase 5 (REQ-C06, REQ-C07; TEST-C07, TEST-C08, TEST-C02 tab part, TEST-C16 payer eligibility; AC-C06, AC-C07; DD-C05, DD-C12).
- **Branch:** `feat/issue-295-admin-manual-charges`

## Gate decisions

- The issue's "blocking" open question (spec Draft, Contracts 4 and 5 unapproved) is stale: the spec is `In progress` and its *Rollout* table records the owner's approval of Contracts 1–6 on 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)). Contracts 4, 5 and 6 cover everything this phase adds; no migration, no dependency, no new module.
- Claimed the issue (assignee, `in-progress`, 🤖 comment).

## Steps

1. Pure rules `payments/lib/manual-charges.ts` (due-date window, *Payer* rule for a manual charge, payer options and eligibility, assign refusal) with 100 % unit tests.
2. Commands in `payments/commands/ledger.ts`: `payments.charges.create_manual`; `payments.charges.assign_payer` in two modes — a session (B-22: one charge, lock token, eligibility) and a worker context (`{ wardPersonId }`, grant `system_job`: the ward's current primary payer onto every open charge without a payer). `payerFactsOf` in `services/directory.ts` reads the people directory once for both the commands and the detail route.
3. Routes: `POST /api/payments/charges` (the `makeCrudRoute` create action), `POST /api/payments/charges/{id}/payer`, `involvesPersonId` on the list, `payerOptions` on the detail. Error codes `charge_payer_already_set` 409, `charge_payer_not_eligible` 422, `charge_due_date_out_of_range` 422; event `payments.charge.payer_assigned`.
4. `people`: guardianship events carry `wardPersonId` (Contract 6); `PersonRecord` gets the spot `vereino:people:person-record:charges` and the "Charges" tab between Groups and (spec L's later) Leaving.
5. Subscribers `payments/subscribers/guardianship-payer.ts` (`.created`) and `guardianship-payer-updated.ts` (`.updated`), persistent.
6. UI: `AddChargeDialog` (B-21 head and the person tab), `AssignPayerDialog` and the guardianship link on B-22, widget `payments.injection.person-charges`.
7. Integration tests TEST-C07 and TEST-C08 (with the TEST-C02 tab part); spec status, AC-C06/AC-C07, changelog file, module README.

## Decisions

- **Due date out of range → a coded 422** (`charge_due_date_out_of_range`, with `from`/`to`) because the range depends on the club's today, which a schema cannot know; description and amount stay schema checks (400), as in every other `payments` route. The spec's API row is updated.
- **One command id for both assignment paths.** The spec's architecture names `payments.charges.assign_payer (system)` for the subscriber and Contract 5 lists no other command; the handler branches on `ctx.systemActor` and authorizes the worker path with `scopeSource: { job: true }` and `system_job`, so a session can never reach it (its schema is strict, and the job grant needs the system actor).
- **Two subscriber files**, because subscriber metadata takes one event.
- **No payer field in "Add charge".** The API accepts `payerPersonId`; the dialog leaves the payer to the *Payer* rule and B-22 assigns the rest (Q-C13 default), which keeps the dialog to four fields.
- **"Add charge" is shown to whoever sees the list** (the administrator today); the route enforces `payments.manage`.

## Files changed

See the commit; `payments` (lib, commands, routes, services, components, widgets, subscribers, i18n, README), `people` (events payload, PersonRecord, client helpers, i18n), the two integration tests, the spec and its changelog file.

## Commands and results

- `npx jest src/modules/payments/lib/__tests__/manual-charges.test.ts` — 14 passed.
- `yarn generate` — completed.
- `yarn typecheck` — exit 0.
- First full-suite `yarn test` failed: `payments-rules.test.ts › declares the error codes with their statuses` (the table lacked the three new codes) — fixed. `yarn lint` failed: `AddChargeDialog.tsx` "Returning a void expression from a function is forbidden" (4×) — fixed.
- `yarn test:integration:vereino --filter TEST-C07` — 1 passed (1.9 min); re-run after the review fixes (see the PR).
- `yarn test:integration:vereino --filter TEST-C08` — 1 passed (2.0 min).
- `yarn verify` — all 17 steps passed (1203 unit tests, `manual-charges.ts` 100 % lines/branches/functions).

## Review

An independent review subagent read `git diff origin/main...HEAD` against the spec: no blocking defects. Fixed: a guardian whose person record was deleted no longer counts as a payer (`payerFactsOf` keeps only live persons); the add-charge dialog checks the PLN 100 000 limit on the amount field. Accepted and documented in the module README (the spec names no other path): a primary payer whose guardianship starts later is not assigned when it begins, and a manual charge committed while a primary-payer event is handled may stay without a payer — B-22 assigns both.

## CI fix (integration shard 3/3)

- CI run 43999253326 failed on `E06-S02-person-record-tabs.spec.ts:109`: it opened `?tab=charges` as the *unknown* tab and expected Details. This PR made `charges` a real tab, so the administrator got the Charges tab. Fixed the test to use `?tab=unknown`; product behavior is unchanged. Lesson `new-tab-value-breaks-unknown-tab-tests`.
- `main` was already merged in by the merge train (`d1bccc4`).
- `yarn test:integration:vereino --filter E06-S02` — 1 passed (1.5 min).

## Open problems

None.

## Next steps

Review and merge the PR; spec L's PersonRecord change rebases on (or under) this tab per the spec's rebase rule.
