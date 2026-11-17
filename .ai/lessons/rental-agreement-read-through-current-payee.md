---
title: "A rental's management agreement is read through the place's current payee"
modules: ["facilities", "club_core"]
areas: ["testing", "module-data"]
topics: ["rental-lifecycle", "management-agreement", "integration-tests"]
---

# A rental's management agreement is read through the place's current payee

**Context**: #284 (E11-S10). TEST-R09 entered rentals under one owner, switched the place to a second owner without an agreement, then ran `facilities rental-lifecycle --now`; the rental that should have expired did not (`expiredIds` was `[]`).

**Problem**: No column stores the payee or the agreement on a rental (DD-R10, no migration). The lifecycle job resolves the agreement at run time: `placePayee(placeId)` as it is now, then the `facility_management` contract in force on the day the rental was entered. Changing a place's owner after the entry therefore changes which agreement — and which expiry rule — applies.

**Rule**: In tests, run the lifecycle (or any agreement-based check) while the place still has the owner whose agreement the rental was entered under; use separate places, or switch the owner only after the check. In code, do not assume the agreement is frozen on the rental; only `payment_deadline` is fixed at entry.

**Applies to**: `facilities/commands/rentals.ts` (`advance_lifecycle`), `facilities/services/rental-slot.ts` (`rentalAgreement`), `clubCoreContracts.facilityAgreement`, `.ai/qa/tests/facilities/TEST-R09-*`.
