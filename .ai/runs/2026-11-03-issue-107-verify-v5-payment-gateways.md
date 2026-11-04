# Issue #107: verify V-5 against payment_gateways and gateway_stripe

- **Date:** 2026-11-03
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, run by cezar; no subagents
- **Trigger:** `/om-auto-fix-issue 107` (E07-T01, epic #106)
- **Branch:** `cez/task-107`
- **Status:** completed; docs-only PR for review. The approval to enable the modules is asked on the issue.

## Goal

Resolve V-5 of `.ai/specs/2026-10-27-vereino-club-payments.md` against the installed `@open-mercato/*` 0.9.0 packages. Confirm or drop the fallback "mapping exclusively through `payments_checkouts`", list the payment methods, answer the architectural review's refund and late-capture findings, and ask for approval to enable `payment_gateways` and `gateway_stripe`.

## Steps

1. Claimed the issue (assignee, `in-progress`, 🤖 comment). Classified it as a docs spike: no bug chain and no feature route, a direct spec update as in #120.
2. Read the installed sources (paths in the spec's V-5 row). Used read-only `cat`/`grep`, not `om-framework-context`. No Stripe sandbox was used: none is configured in this worktree, and no credentials may be written to it.
3. Looked for the 2026-10-26 review's detailed findings. `.ai/runs/2026-10-26-spec-architectural-review.md` keeps only the headline "money corrections without a contract (reverse, refunds, late captures, charge generation)", because the full report was given in the session. Refunds and late captures were answered from that headline.
4. Updated the payments spec, the club spec (reuse row and data flow) and S10.8 of the engineering standards. Added a lesson.

## Findings

- **Session:** `paymentGatewayService.createPaymentSession` through DI. The public sessions route needs `payment_gateways.manage` and generates its own `paymentId`. `gateway_stripe` creates a PaymentIntent with an embedded Payment Element client session, not a hosted Checkout Session. `successUrl`/`cancelUrl` are ignored, and `returnUrl` must go into the session payload. Amounts are in major units.
- **Provider key** `stripe`, integration `gateway_stripe`, default API version `2025-02-24.acacia`, webhook `/api/payment_gateways/webhook/stripe`.
- **Events** carry ids only. They are emitted only on a valid transition. `failed`/`cancelled`/`expired` are terminal, so a capture after a declined attempt emits nothing. `session.expired` and `partially_refunded` are never emitted. Stripe refund webhooks match no transaction (401). The status poller has no schedule.
- **Credentials** are per tenant and organization in `integration_credentials`, as one AES-GCM blob encrypted with the tenant key. They can also come from `OM_INTEGRATION_STRIPE_*` env when a tenant is created.
- **Methods:** card, with Apple Pay, Google Pay and Link. `paymentTypes` is passed to `payment_method_types` unchanged, so BLIK and P24 are reachable in code but not yet run.
- **Fallback confirmed:** `paymentId` = the `payments_checkouts.id`.

## Decisions (autonomous defaults; the product owner may override)

- **DD-42:** one idempotent fulfilment that reads the provider state. It runs from the subscriber, the return page (`POST /api/payments/checkouts/{id}/refresh`) and a 15-minute sweep `payments:reconcile-checkouts`. Late captures are always booked. The checkout returns `clientSession` instead of `redirectUrl`.
- **Q-049:** a capture for a charge that is no longer open → online overpayment flagged "to refund".
- **Q-050:** refunds only from Vereino (`payments.payments.refund`, reversing payment with `gateway_refund_id`). Dashboard refunds are not synced.
- Left open: the reverse command and the charge-generation undo findings (out of this issue's scope).

## Files changed

- `.ai/specs/2026-10-27-vereino-club-payments.md`: status; DD-18; new DD-42; two vocabulary rows; UI rows M-08, M-09; `payments_payments` and `payments_checkouts` data rows; checkout, refresh, refund and subscriber API rows; event rows (sweep, `session.expired` dropped); TEST-057; phase readiness, steps 1 and 4, tests; traceability REQ-012; three risk rows; compliance report and verdict; Q-016, Q-049, Q-050; V-5; changelog.
- `.ai/specs/2026-10-20-vereino-club-management.md`: `payment_gateways` reuse row, data-flow lines, changelog.
- `.ai/specs/2026-10-21-engineering-standards-and-patterns.md`: S10.8 pointer to DD-42, changelog.
- `.ai/lessons/payment-gateway-events-miss-late-captures.md` + row in `.ai/lessons.md`.
- This run log.

## Commands and results

- `node scripts/check-lessons.mjs`: valid.
- `yarn format:check`: `670 Vereino file(s), 0 unformatted`. Documentation only; no code, so no `yarn verify`.
- Nothing ran against a database or Stripe. All findings were read from code.

## Open problems

- The owner's approval to enable `payment_gateways` and `gateway_stripe` (Ask First), asked on #107.
- A Stripe sandbox run of card, BLIK and P24 through the Payment Element (phase 4 step 1, S18.4).
- Phase 4 stays Draft: A02 readiness and the reverse / generation-undo findings remain.
