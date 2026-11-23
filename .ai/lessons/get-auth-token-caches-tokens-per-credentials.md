---
title: "getAuthToken caches a token per e-mail and password for 45 minutes: clear the cache after anything that ends the user's sessions"
modules: ["platform", "club_core"]
areas: ["testing", "integration"]
topics: ["auth", "sessions", "integration-tests", "token-cache"]
---

# getAuthToken caches a token per e-mail and password for 45 minutes: clear the cache after anything that ends the user's sessions

**Context**: TEST-M07 (#632, 2026-11-23) signed the club administrator in, deleted the club (which deletes the
user's sessions), restored it, and signed in again with the same e-mail and password. The API answered 401 although
the user, roles and password were back.

**Problem**: `getAuthToken` of `@open-mercato/core/helpers/integration/api` keeps a process-wide `tokenCache` keyed
by the credentials (`TOKEN_TTL_MS` = 45 minutes) and returns the cached JWT without calling `/api/auth/login`. The
cached token names a session (`sid`) that no longer exists, and the platform refuses a token whose session is gone
(`resolveCanonicalStaffAuthContext`). Nothing in the response says the token came from the cache; the JWT's `iat` from
before the deletion and an empty `sessions` table for the user are the tell.

**Rule**: After a step that ends a user's sessions — deleting or restoring the user's club, closing the account, a
password change through `signInBrowser` (see `sign-in-browser-ends-the-api-token`) — call `clearAuthTokenCache()`
from the same helper module before the next `getAuthToken` for that user, or sign in with new credentials.

**Applies to**: `packages/app/.ai/qa/tests/**` using `getAuthToken`.
