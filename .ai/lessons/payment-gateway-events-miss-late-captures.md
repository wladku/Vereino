---
title: "Book online payments from the provider state, not from payment_gateways events alone"
modules: ["payments", "platform"]
areas: ["integration", "framework-context"]
topics: ["payment-gateways", "stripe", "events", "idempotency", "refunds"]
---

# Book online payments from the provider state, not from payment_gateways events alone

**Context**: V-5 of the payments spec (issue #107, 2026-11-03) read the installed `@open-mercato/core` and `@open-mercato/gateway-stripe` 0.9.0 sources. The research behind S10.8 assumed hosted Stripe Checkout Sessions and `checkout.session.*` webhooks; the installed adapter creates PaymentIntents for the embedded Payment Element instead.

**Problem**: `payment_gateways` emits a status event only on a valid transition, and `failed`, `cancelled` and `expired` are terminal. A payer who retries in the Payment Element after a decline is captured by Stripe, but the transaction stays `failed` and no `payment.captured` event is emitted. `session.expired` and `partially_refunded` emit nothing at all. Stripe refund webhooks (`charge.refunded`, `charge.refund.updated`) carry a charge or refund id, so the webhook route finds no transaction and answers 401. The status poller worker has no registered schedule.

**Rule**: Treat gateway events as a wake-up signal only. Make one idempotent fulfilment that reads `paymentGatewayService.getPaymentStatus` (it returns the provider state even when the stored transition is invalid), and run it from the event subscriber, the return page and an app-owned sweep. Start refunds from the app through `refundPayment` and book them from the call's result. Before adopting a provider pattern from research, check the installed adapter's API (Checkout Session vs PaymentIntent) and its status map.

**Applies to**: the `payments` module (DD-42 of `.ai/specs/2026-10-27-vereino-club-payments.md`), any consumer of `payment_gateways` events, `packages/app/node_modules/@open-mercato/core/src/modules/payment_gateways/lib/{gateway-service,status-machine}.ts`, `gateway-stripe/src/modules/gateway_stripe/lib/{status-map,webhook-handler}.ts`.
