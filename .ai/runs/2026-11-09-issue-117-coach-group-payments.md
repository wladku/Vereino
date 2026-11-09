# Run — issue #117: a coach sees their groups' fees and kit, accepts cash, sends reminders and hands over kit (E07-S10)

- **Goal and trigger:** cezar task a9a1ed4f (`om-auto-fix-issue 117`), unattended. Build M-18 "My groups' payments" (flow F-14): the coach part of payments spec phase 4 step 10 (REQ-033, DD-31, DD-32, TEST-045).
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-club-payments.md` (phase 4 step 10, coach part); #117 (epic #106; depends on #114, #115, both merged); `feat/issue-117-coach-group-payments`.
- **Approval:** the owner's comment on #117 (2026-11-09) decides Q1 — the treasurer's settlement and RG-number assertions move from TEST-045 to TEST-046 (#118), and the spec's test table follows; the treasurer role and screens stay held (A02). Nothing else is Ask First here: no migration (the cash a coach holds needs no new column until the handover of #118), no dependency, no new module; the new routes, ACL features, event, e-mail template and error codes are additive, and the existing routes keep their contracts.

## Steps

1. Claimed #117 (assignee, `in-progress`, claim comment) and renamed the task branch.
2. Pure rules `lib/group-charges.ts` with unit tests (100 %): the groups of a scope, fee and order visibility, the coach's cash refusal, child and group totals, the "To pay" filter, overdue charges by payer, the hand-over refusal.
3. `commands/cash.ts`: the acceptance core extracted into `acceptCashOnCharges` and `afterCashCommit`; `enqueueConfirmation` takes its idempotency key. `payments.cash.record` behaves as before.
4. `services/group-charges.ts` (the M-18 view, a child's group charges, "Cash with you") and `commands/group-charges.ts` (`payments.cash.collect`, `payments.group_charges.remind`, `payments.orders.hand_over`); `payments.order_campaigns.remind` now also accepts a coach's or coordinator's grant for a campaign group of theirs.
5. ACL `payments.groups.view|collect` (already in the coach and coordinator roles of `@vereino/core`), six error codes, the event `payments.order.handed_over`, the e-mail template `payments.charge_reminder`.
6. Routes: `GET /api/payments/group-charges`, `POST /api/payments/group-charges/cash`, `/group-charges/remind`, `/group-charges/campaigns/{id}/remind`, `POST /api/payments/orders/{id}/hand-over`; the share text moved into `campaignShareText` (shared with the admin route).
7. UI: `/club/coach/payments` (M-18) in the member shell and the "My groups' payments" tile on `/club` (`vereino:club:today:sections`); en + pl.
8. Integration test `packages/app/.ai/qa/tests/payments/TEST-045-coach-group-payments.spec.ts`.
9. Spec: TEST-045/TEST-046 rows per Q1, the step 10 implementation note; changelog entry `2026-11-09-issue-117-coach-group-payments.md`; module README and the UX concept's M-18 API line; lesson `group-scoped-writes-load-the-group-as-target`.

## Decisions

- **The coach's cash has its own route** (`POST /api/payments/group-charges/cash`, feature `payments.groups.collect`) instead of widening `POST /api/payments/cash`: route metadata requires all listed features, and the administrator's route stays `payments.cash.record` for any payer. Both share `acceptCashOnCharges`, so the KP numbering, the refusals and the allocation are one code path.
- **The coach's campaign reminder has its own route** for the same reason; it runs the existing command, whose scope check now matches a coach's campaign group or a coordinator's section.
- **One receipt, an e-mail per payer:** a child's fee and kit may have different payers (the spec's API row); each payer gets the confirmation of their own lines (key `payments:cash:<receipt>:<payer>`).
- **Hand-over carries `groupId`** next to `confirmUnpaid`: the scope of a coach is a group, and an order's child may be in several groups.
- **"Cash with you" without a migration:** until the handover (#118) adds `cash_handover_id`, everything a person collected and did not reverse is held by them.
- **The administrator is not bound by `coach_fee_access`** on M-18 (it is the treasurer's work, D-030); every other caller is.
- **A charge without a payer is 422 `charge_payer_missing`** ("a matter for the treasurer"), a fee with `view` 403 `coach_fee_cash_disabled`, a fee with `none` or any charge outside the group 403 `charge_out_of_scope`.

## Files changed

`packages/app/src/modules/payments/{acl.ts,di.ts,events.ts,README.md,lib/{group-charges.ts,error-codes.ts,__tests__/group-charges.test.ts,__tests__/payments-rules.test.ts},data/validators.ts,emails/templates.ts,services/{group-charges.ts,directory.ts},commands/{group-charges.ts,cash.ts,order-campaigns.ts},api/{group-charges/**,orders/[id]/hand-over/route.ts,order-campaign-routes.ts,order-campaigns/[id]/share-text/route.ts},components/club/coach/*,frontend/club/coach/payments/*,widgets/{injection-table.ts,injection/club-coach-payments/*},i18n/*}`, the integration test, the payments spec and its changelog entry, `docs/ux-concept/README.md`, the lesson and this log.

## Commands and results

- `yarn workspace @vereino/app jest src/modules/payments/lib` — 12 suites, 243 tests passed; `lib/group-charges.ts` at 100 % lines, branches and functions.
- `yarn test` — first run failed one test (`payments vocabularies` expected the old error-code table); fixed by listing the six new codes, then passed.
- `yarn typecheck`, `yarn typecheck:qa`, `yarn lint` (no errors in `payments`), `yarn format:check`, `yarn ds:check`, `yarn i18n:check-hardcoded --strict` (one finding `throw new Error('group-charges')` fixed), `yarn contracts:check`, `yarn lessons:check`, `yarn spec-changelogs:check` — passed.
- `yarn test:integration:vereino --filter TEST-045`:
  - runs 1 and 2: `[internal] the app was not ready within 180s` — the Testcontainers PostgreSQL refused connections (`connect ECONNREFUSED 127.0.0.1:32769`, 711 times) because Docker Desktop restarted on the machine during the runs; not related to the change;
  - run 3: failed at the "already paid" case — `Expected: 409, Received: 403`: the fully paid fee of an earlier period is no longer shown on M-18 (DD-32 visibility), so it is `charge_out_of_scope`; the test now checks `charge_already_paid` on the paid kit (still shown) and 403 for the paid older fee;
  - run 4: `1 passed (2.2m)`.

- `yarn verify` — all 14 steps passed (generate, typecheck ×3, lint, format, ds, i18n, contracts, lessons, spec changelogs, test, test:scripts, build).

## Open problems

- None known in scope. The treasurer's "Cash to settle", the handover (`payments_cash_handovers`, RG numbers) and TEST-046 are #118 (held, A02).

## Next steps

- Review and merge the PR; #118 adds the handover and makes "Cash with you" exclude handed-over cash.
