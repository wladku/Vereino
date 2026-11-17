---
title: "A local .env AUTH_SECRET outranks the ephemeral runner's JWT_SECRET: export one AUTH_TOKEN_SECRET before an integration run that looks a token up by its hash"
modules: ["platform", "facilities"]
areas: ["testing", "debugging"]
topics: ["integration-tests", "ephemeral-runner", "token-hash", "env", "worktrees"]
---

# A local .env AUTH_SECRET outranks the ephemeral runner's JWT_SECRET: export one AUTH_TOKEN_SECRET before an integration run that looks a token up by its hash

**Context**: TEST-R10 (#280) failed in a cezar worktree at `heldRequest` with `[internal] no request row for the token`, before any assertion of the change. The request had been submitted (202) and confirmed (200).

**Problem**: `hashAuthToken` (an HMAC) takes its secret from `AUTH_TOKEN_SECRET`, then `AUTH_SECRET`, `NEXTAUTH_SECRET`, `JWT_SECRET`, in that order. `scripts/vereino-ephemeral.mjs` gives the app a random `JWT_SECRET`, but the app also loads `packages/app/.env`: a non-empty `AUTH_SECRET` there wins on the server. The Playwright process does not load `.env`, so the fixtures (`requestIdByToken`, every lookup by `hashAuthToken(token)`) hash with the runner's `JWT_SECRET` and never find the row. CI has no `.env`, so the same test passes there; TEST-035 and TEST-036 fail the same way locally.

**Rule**: Before `yarn test:integration:vereino` in a checkout whose `packages/app/.env` sets `AUTH_SECRET` (or `NEXTAUTH_SECRET`), export one shared `AUTH_TOKEN_SECRET` in the shell that starts the runner (`export AUTH_TOKEN_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")`): it outranks every other secret and both the app and the test process inherit it. Do not edit `.env` to work around it, and do not read a token-hash failure in setup as a bug of the change under test.

**Applies to**: `packages/app/scripts/vereino-ephemeral.mjs`, `packages/app/.ai/qa/tests/_fixtures/facility-requests.ts` and every fixture that calls `hashAuthToken`; local and worktree integration runs.
