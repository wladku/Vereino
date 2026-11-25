---
title: "Build a test e-mail address from a person's name only through testEmailFor"
modules: ["platform", "people"]
areas: ["testing"]
topics: ["integration-tests", "fixtures", "e-mail", "diacritics"]
---

# Build a test e-mail address from a person's name only through testEmailFor

**Context**: PR #746 renamed the people in the integration test data to fictional Polish names (the coordinator became `Rafał`). The helper `createStaff` in `packages/app/.ai/qa/tests/_fixtures/club.ts` built the account address as `${firstName.toLowerCase()}-<suffix>@example.org`, so it became `rafał-…@example.org`. The account API rejects that address (`400 Invalid email address`, ASCII-only pattern). Integration shards 1, 2, 3, 5 and 6 went red on #746 and on #750, which was stacked on it: 12 specs failed at `create account`.

**Problem**: A rename of test data looks harmless and passes typecheck and unit tests. The broken address only shows up in the integration run, 30 minutes later. `ł` does not decompose under NFD, so `normalize('NFD')` alone does not fix it.

**Rule**: Build an address from a person's name only with `testEmailFor(firstName)` from `_fixtures/club.ts`. It folds diacritics and `ł`/`Ł` to ASCII and keeps the address unique. Never interpolate a name into an address. A PR that renames people in the test data runs at least one integration test that creates an account for a renamed person.

**Applies to**: `packages/app/.ai/qa/tests/**`: `createStaff` and every spec-local helper that creates an account (`createAccount`) for a named person.
