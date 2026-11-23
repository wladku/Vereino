---
title: "A CSP without 'unsafe-eval' needs zod jitless in the browser, and is proven only by a browser test"
modules: ["platform"]
areas: ["backend-ui", "testing"]
topics: ["csp", "zod", "headers", "integration-tests"]
---

# A CSP without 'unsafe-eval' needs zod jitless in the browser, and is proven only by a browser test

**Context**: #463 (E18-S02) removed `'unsafe-eval'` from the production CSP in `packages/app/next.config.ts`. The header
checks (request-level) passed at once, but the ENG-TEST-11 browser case that records `securitypolicyviolation` events
found `script-src eval` on `/login`: zod v4's `allowsEval` probe runs `new Function("")` on the first parse. The error
is caught and validation still works, but the browser reports a violation (console error) on every page.

**Problem**: A CSP change looks done when the response headers are right, while the real effect (blocked or reported
code in the browser) shows only in a running page. Request-level tests and the unit tests of `scripts/smoke.mjs` cannot
see it.

**Rule**: Prove every CSP tightening with a browser test that records `securitypolicyviolation` events on the sign-in
page and a few admin pages (`platform/ENG-TEST-11-security-headers.spec.ts` is the pattern). Keep
`z.config({ jitless: true })` in `packages/app/src/instrumentation-client.ts` while the CSP has no `'unsafe-eval'`;
zod's config is global (`globalThis.__zod_globalConfig`), so it covers the platform's forms too. Never add
`'unsafe-eval'` back to silence a report (Ask First: weakening security).

**Applies to**: `packages/app/next.config.ts` headers, `packages/app/src/instrumentation-client.ts`, any new client
library that compiles code at runtime (template engines, JSON-schema validators such as ajv).
