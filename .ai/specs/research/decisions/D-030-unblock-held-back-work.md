---
number: D-030
date: 2026-11-04
owner: Władek Kuć
source: the owner's answers in the coordinator session of 2026-11-04, asked to unblock the held-back backlog items (#92, E07 #106, #95, #96, #105, E08 #119)
status: confirmed
---
# D-030 Unblock held-back work: modules, phase 4 without the treasurer role, A05, REQ-017 and phase 5 on the example club

1. **`dictionaries` (#92).** Enabling the platform module `dictionaries` and its migrations is approved; the PZPN age categories become a club dictionary the administrator can edit.
2. **Payments (phase 4, E07).**
   - Enabling `payment_gateways` and `gateway_stripe` (`@open-mercato/core`, `@open-mercato/gateway-stripe`, already a dependency) together with their migrations is approved (the request on #107, V-5/DD-42 in #148). No Stripe credentials go into the repository; tests use the sandbox.
   - Phase 4 is built now with the **club administrator doing the treasurer's work**. The separate treasurer role and its screens (REQ-034, DD-33, phase 4 step 10, #118) stay held back until A02 is checked with a real treasurer (D21 unchanged for that part).
   - The payments specification is `Ready for implementation` on that basis, with the proposed defaults Q-049 (a late capture for a charge already paid becomes an overpayment flagged "to refund") and Q-050 (refunds only through Vereino, never the Stripe Dashboard) confirmed.
3. **A05 lifted (#95, #96).** Coach absences with substitutes and the coach contracts with the monthly coach units report are built now; the hold of D21 on the settlement parts of REQ-008 and REQ-021 (club spec phase 2 step 7) is lifted. The pilot review still checks A05.
4. **REQ-017 now (#105).** Foundation I phase C (token links, the link request without enumeration) is built now, followed by the club spec's personal declaration link (#105). Generating and applying the token-link migrations of that phase is approved.
5. **Phase 5 on the example club (E08).** Phase 5 is built on the specification's example club ("Dev Academy") with its default facility rules; the pilot club (Q18) and its facility rules (Q04) stay open but no longer block building, and the pilot's data comes in later as configuration. The facilities findings of the 2026-10-26 architectural review still have to be resolved in the specification before phase 5 is `Ready for implementation`.

**Why:** the backlog of phases 1–3 is nearly built, and the remaining items were waiting only on these decisions; the owner chose to build with the risks accepted rather than wait for interviews or the pilot.

**Still held back:** the treasurer role and screens (#118, REQ-034); any other module, dependency or migration stays Ask First.

**To change:** a superseding record approved by the owner.

**Revisit:** at the phase 2 pilot review (A02 with a real treasurer, A05 in use, the pilot club's facility data).
