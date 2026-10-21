---
number: D-010
date: 2026-10-19 (confirmed 2026-10-20)
owner: Władek Kuć (A); Kacper Kuć co-owner for the gateway choice (technology — RACI); commission model: unknown
source: PTU benchmark + segment decision; Claude's proposal; confirmed in the spec's Q-003 (2026-10-20)
status: confirmed
---
# D-010 Online payment in 1.0
**Decision:** the parent pays the membership fee through a gateway; Orlik fees still go to the municipality's account and are recorded manually.
**Confirmation (2026-10-20, Q-003, DD-18):** the gateway is **Stripe** (Open Mercato `gateway_stripe`); a custom Przelewy24/PayU adapter is a non-goal of 1.0. Q-003 is owned by Władek with Kacper as co-owner of the adapter choice (technology and hosting are Kacper's per the RACI); the commission model remains open (Q-016).
**Why:** in the small-academy segment, fee collection is the first argument; PTU has had it for years.
**To change:** if gateway commissions are unacceptable to the club (conversation with the treasurer).
**Revisit:** after the conversation with the treasurer and the choice of gateway.
