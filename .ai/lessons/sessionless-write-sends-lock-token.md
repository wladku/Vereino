---
title: "A sessionless token page that changes a versioned record still reads and sends its lock token"
modules: ["activities", "foundation"]
areas: ["module-data", "backend-ui"]
topics: ["optimistic-lock", "token-links", "sessionless", "public-pages", "concurrency"]
---

# A sessionless token page that changes a versioned record still reads and sends its lock token

**Context**: PR #182 (#105) added `/club/d/[token]`, where a guardian declares attendance from a personal link. The shared `writeDeclaration` called `enforceCommandOptimisticLockWithGuards` with `expected: null`, which reads the token from the request header. The signed-in club page sends that header (`club-client.ts`, `buildOptimisticLockHeader`), but the new link page sent none and its `GET` returned no `updatedAt`. A declaration from a stale link page therefore overwrote a newer change by the other guardian or the ward, with no 409. The PR review caught it; integration was green because no test sent a stale token.

**Problem**: A command that reads the expected version from the header silently skips the check when the header is missing. A new client of an existing command (a token page, a CLI, a job) looks correct and passes every happy-path test, so nothing shows that it has opted out of concurrency control.

**Rule**: When a new client (sessionless page, token link, public form) writes through a command that checks the optimistic lock from the header:
- the read route returns each editable row's `updatedAt` (null before the first write) and documents it in openApi;
- the client sends it with `withScopedApiRequestHeaders(buildOptimisticLockHeader(token))`;
- the client tells `optimistic_lock_conflict` apart from the domain 409s and reads the page again after any 409;
- the integration test posts once with a stale token (409 `optimistic_lock_conflict`) and once with the current one.

**Applies to**: `packages/app/src/modules/*/components/public/**`, token-link routes (`api/declaration-links/[token]`), and any route that runs a declare- or upsert-style command without a session.
