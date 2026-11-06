---
title: "A coded error that names a value passes it in the details; the foundation's errors fill the message's placeholders from them"
modules: ["foundation", "payments"]
areas: ["module-data", "testing"]
topics: ["error-codes", "i18n", "validation"]
---

# A coded error that names a value passes it in the details; the foundation's errors fill the message's placeholders from them

**Context**: E07-S02 (#109, 2026-11-06) had to answer 422 "The amount exceeds the remaining 50 zł". The foundation's `errors(table).throw(code, details)` translated the message with no parameters, so a `{remaining}` placeholder stayed literal and every module that needed a value in the message would have built the text by hand.

**Problem**: A hand-built message skips the i18n catalogs, and a number formatted in the browser differs from the one the API returns.

**Rule**: Put the value in the message as `{name}` in both catalogs and pass it in the details: `paymentsErrors.throw('payment_exceeds_remaining', { remaining: formatZloty(remaining), remainingAmount: remaining })`. The factory fills placeholders from the string and number values of the details and still returns every detail in the body, so add a raw field (`remainingAmount` in grosz) next to the formatted one for clients. Format money for messages with a pure helper in `lib/` (`formatZloty`), not with `Intl`, so both locales and the tests see the same text.

**Applies to**: `packages/app/src/modules/foundation/services/errors.ts`, every module's `api/errors.ts` and `lib/error-codes.ts`, integration tests that assert an error's `error` text.
