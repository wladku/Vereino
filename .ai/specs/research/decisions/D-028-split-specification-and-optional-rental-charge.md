---
number: D-028
date: 2026-10-27
owner: Władek Kuć
source: om-spec-writing review session 2026-10-26/27 — Władek's answers to the two structural decisions of the architectural review (`.ai/runs/2026-10-26-spec-architectural-review.md`)
status: confirmed
---
# D-028 Split the club specification in three; the rental charge becomes optional

1. **Split (DD-01).** The club management specification is split into three, so that each has its own status, readiness and lifecycle:
   - `.ai/specs/2026-10-20-vereino-club-management.md` keeps phases 1–3 (`club_core` + `people`, `groups` + `activities`, `communication`) and everything the modules share: the vocabulary of people, places and sessions, roles and features, `people.scopeService`, club settings, the public page shell, DD-35 and i18n. Phase 1 stays `Ready for implementation`.
   - `.ai/specs/2026-10-27-vereino-club-payments.md` holds phase 4 (`payments`).
   - `.ai/specs/2026-10-27-vereino-facilities.md` holds phase 5 (`facilities`).
   - Ids (REQ, DD, J, TEST, AC, Q, V) stay global and are never renumbered.
   - This supersedes the per-phase readiness amendment of DD-01 made on the same day (PR #39); per-phase readiness stays inside each specification.
2. **Optional rental charge (DD-19).** `facilities` requires only `activities`.
   - With `payments` enabled, the rental charge is created through the optional DI token `payments.chargeService` (`hasRegistration`) in the same transaction as the rental, and `payments.payment.recorded` confirms the rental.
   - Without it, a rental carries its amount; the renter's email shows the amount, the owner's account and the deadline; staff confirm the rental with the `confirm` action.
   - Enabling `payments` later creates no charges for earlier rentals.
   - The facility module, the product's differentiator, therefore no longer waits for phase 4, whose treasurer work is held back (A02, D-021).

**Why:** the architectural review of 2026-10-26 found the single specification bundled at least five capabilities whose phases deploy as a stack, and the facility module was hard-blocked by held-back payments work. The owner chose the review's recommended options.

**Not changed:** the requirements, priorities and decisions themselves; the phase numbers 4 and 5 (kept as names); the backlog issues; the held-back status of the treasurer work (A02) and of the settlement automation (A05).

**To change:** a superseding record approved by the owner.

**Revisit:** when phase 5 is planned (whether the facility module should ship before payments at the pilot club).
