---
title: "Registering a dormant optional DI token: walk every consumer call path and every reader of the new rows"
modules: ["payments", "facilities"]
areas: ["module-data", "architecture"]
topics: ["optional-di", "dd-19", "cross-module-contracts", "rental-charges", "integration-tests"]
---

# Registering a dormant optional DI token: walk every consumer call path and every reader of the new rows

**Context**: #291 registered `payments.chargeService`, which `facilities` had called through `hasRegistration` since #122 while no provider existed. The spec said the phase "changes nothing in `facilities`".

**Problem**: A seam that has always been a no-op hides what it does once it answers. (1) `facilities` called `createForSource` for an unregistered renter with neither payer id, so the provider's 422 `charge_payer_required` would have rolled back every such staff rental (E08-S02 enters one). (2) The facilities approval accepts `amountOverride: 0`, a free rental the provider's amount rule would have refused. (3) Integration tests written for the dormant seam asserted `chargeId: null` (TEST-022). (4) The new rows reached readers the spec did not list: "Accept cash", the cash payers list and the bank matcher pick any open charge with a person payer, and would have booked club money on a charge payable to the facility owner.

**Rule**: Before registering a token another module already calls, read every call site of the consumer and check each input path (every renter type, every override) against the provider's refusals; grep the QA tests for assertions that depend on the token's absence; and list every query that reads the provider's table by the columns the new rows fill (`payer_person_id`, status), not only the routes the spec names. Fix the consumer's input in the same PR when the provider would otherwise refuse a path the consumer allows, and record the deviation in the spec changelog.

**Applies to**: optional DI seams between Vereino modules (`payments.chargeService`, `facilities.occupancyService`, `groups.personFilter`, …); `packages/app/src/modules/*/di.ts`; `packages/app/.ai/qa/tests/**`.
