---
title: "Platform rate limits need a measured proxy depth in production and the opt-in limiter in tests"
modules: ["foundation", "platform"]
areas: ["testing", "module-data", "debugging"]
topics: ["rate-limit", "proxy-depth", "integration-tests", "railway"]
---

# Platform rate limits need a measured proxy depth in production and the opt-in limiter in tests

**Context**: #738 (2026-11-25). The platform limiter (`@open-mercato/shared/lib/ratelimit`) defaults to
`RATE_LIMIT_TRUST_PROXY_DEPTH=0` and `RATE_LIMIT_STRATEGY=memory`. With depth 0, `getClientIp()` returns null and every
client falls into the one fallback key `global`: the sign-in limit of 20 per minute per client became 20 per minute for
the whole instance behind Railway's proxy. With `memory` the counters reset on every deploy. In the integration runner
`OM_INTEGRATION_TEST=true` switches the limiter off, so no route could answer 429 in a test and every limit was untested.

**Problem**: Both failures are silent. A zero depth looks like working limits until a busy evening; the integration
runner never shows a 429; with `redis` the platform limiter absorbs an unreachable store with per-process memory
counters and logs nothing.

**Rule**:
- On a deployment behind a proxy, set `RATE_LIMIT_TRUST_PROXY_DEPTH` to the depth measured on that environment
  (`docs/ops/deploy.md` → *Rate limits*: the `forwardedEntries` of the `Client address unresolved behind a proxy` log
  line), and run `RATE_LIMIT_STRATEGY=redis` (the boot check enforces it on Railway).
- A new sessionless route declares its per-client limit in `metadata.rateLimit` and counts token or address layers
  through `enforceSessionlessLimits` / `sessionlessSubjectAllowed` from `@/modules/foundation`, never through
  `getCachedRateLimiterService()` directly: only the foundation resolver hands an integration request with
  `x-om-test-rate-limit: on` an enabled limiter.
- Test a limit with that header and a key unique to the run (a fresh e-mail or token); a per-client key is `global` in
  the runner and stays spent across Playwright retries, so assert "a 429 within N + 1 attempts" there, not "exactly the
  N + 1st".

**Applies to**: `packages/app/src/modules/*/api/**` sessionless routes, `src/app/api/[...slug]/route.ts`,
`src/app/api/auth/**`, `scripts/vereino-boot-env.mjs`, `packages/app/.ai/qa/tests/**`.
