---
title: "A declaration's minor rule reads the age on the session's day, not today"
modules: ["activities", "people"]
areas: ["testing", "module-data"]
topics: ["declarations", "integration-tests", "life-cycle", "birthdays"]
---

# A declaration's minor rule reads the age on the session's day, not today

**Context**: TEST-L09 (#310) needed a `pending_guardian` declaration from a ward who comes of age soon. The fixture made the ward turn 18 tomorrow and declared a match two days ahead; the declaration came back `final` (`Expected: "pending_guardian" Received: "final"`).

**Problem**: `activities/lib/policy.ts` `isMinorOn(birthDate, onDate)` is evaluated on the session's date. A ward who is 17 today but 18 on the session's day declares as an adult, so the guardian-confirmation policy never applies.

**Rule**: When a test (or a feature) needs a minor's pending declaration, keep the person under 18 on the session's day: put the 18th birthday after the session (for example 10 days out for a session 2 days ahead). Code that reasons about "minor at the time of X" reads the age on X's day, as the policy does.

**Applies to**: `activities` declarations and policies (`lib/policy.ts`), integration fixtures that combine `declare` with birth dates near 18 (`.ai/qa/tests/people/TEST-L09-coming-of-age.spec.ts`), the people life-cycle job (`people/services/life-cycle.ts`).
