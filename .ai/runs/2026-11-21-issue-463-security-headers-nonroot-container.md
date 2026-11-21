# Run log — issue #463 (E18-S02): security headers, CSP decision, `no-store`, pinned non-root container

- **Goal:** responses carry HSTS and `Permissions-Policy`; the production CSP decision on `'unsafe-eval'`; authenticated
  API responses are `no-store`; the Dockerfile bases are pinned by digest, the deployed stage runs as non-root, and a
  check fails when it does not (S8.4, S14.8, ENG-08, ENG-TEST-11).
- **Trigger:** Cezar run (task 4d9d1448), label `cezar` on #463, `om-auto-fix-issue`; spec
  `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` phase E4 slice (d). Owner workflow note: draft PR, an
  independent reviewer takes it from there; no own review loop.
- **Branch:** `fix/issue-463-security-headers-nonroot-container`.

## Steps

1. Claimed #463 (assignee, `in-progress`, `🤖` claim comment naming worktree, branch and start time). Dependency #448
   (spike) is closed; its item 12 found no `Cache-Control` on API responses and no decision on `'unsafe-eval'`.
2. `Dockerfile`: the three `node:24-alpine` stages pinned to the index digest `sha256:116b800c…` (resolved with
   `docker buildx imagetools inspect node:24-alpine`; the same digest as `docker/backup/Dockerfile`). The `runner` stage
   already ran as `omuser`.
3. `scripts/check-dockerfiles.mjs` + `yarn dockerfiles:check` + new `yarn verify` step: for `Dockerfile` and
   `docker/backup/Dockerfile`, every `FROM` that is not a stage or `scratch` must be `@sha256:<64 hex>`, and the final
   stage's last `USER` must exist and not be `root`/`0`. Unit tests at 100 % lines/branches/functions.
4. `packages/app/next.config.ts` (local patch, S3.1): `Permissions-Policy` everywhere; HSTS
   `max-age=63072000; includeSubDomains` in production only (a dev server behind local HTTPS would otherwise pin
   `localhost`); `'unsafe-eval'` removed from the production CSP (kept in development for React's dev build);
   `Cache-Control: private, no-store` on `/api/:path*` when the request carries `auth_token` or `session_token` cookies,
   an `Authorization` header or `x-api-key` (`has` conditions) — anonymous public JSON keeps `public, s-maxage=60`.
5. `scripts/smoke.mjs`: `security headers` now also requires `permissions-policy` and `strict-transport-security` and
   fails a CSP that still allows `'unsafe-eval'`; unit tests updated (100 %).
6. New integration test `packages/app/.ai/qa/tests/platform/ENG-TEST-11-security-headers.spec.ts`. First run: 3 passed,
   1 failed — the browser case recorded `script-src eval …/_next/static/chunks/3thvdsjbck3cl.js:4689` on `/login`. Cause:
   zod v4's `allowsEval` probe (`new Function("")`, caught, but reported as a CSP violation). Fix: new
   `packages/app/src/instrumentation-client.ts` with `z.config({ jitless: true })` (zod's config is global, so platform
   forms are covered). Rerun: 4 passed.
7. Older tests asserting the changed headers: TEST-024, TEST-037, TEST-T09, ISSUE-192 passed. TEST-L15 failed:
   `Expected: "no-store"`, `Received: "private, no-store"` — the config header overrides the route's own `no-store`.
   Changed the assertion to `toMatch(/\bno-store\b/)`; rerun: 3 passed.
8. Browser smoke (CI job `browser-smoke`): ephemeral app on a free port, `node .ai/qa/agent-browser/login-smoke.mjs` →
   `signed in and reached …/backend`. First attempt failed locally only because Chrome's singleton socket path under the
   Cezar TMPDIR is too long; rerun with `TMPDIR=/tmp/ab463` passed. App processes stopped afterwards.
9. `yarn format`, full `yarn verify` (result in the PR body).
10. Docs: `docs/ops/deploy.md` (smoke header set, ENG-TEST-11 local and staging), spec changelog file, lesson
    `csp-without-unsafe-eval-needs-zod-jitless`.

## Decisions

- **`'unsafe-eval'` removed** from the production CSP: the production build, ENG-TEST-11's browser pages, the header
  tests and the browser smoke run without it once zod's eval probe is off. `'unsafe-inline'` stays (nonce CSP deferred by
  S8.4); `connect-src` is unchanged (out of this issue's scope; S8.4 allows narrowing later).
- **`no-store` by request markers**, not on all `/api/*`: a blanket header would override the sessionless public JSON
  routes' `public, s-maxage=60` (S8.6). A logged-in visitor of a public route gets `private, no-store`, which is the
  safe side.
- **Non-root check covers the final stage only.** The `dev` stage (local `docker-compose.fullapp.dev.yml`) and the
  `builder` stage run as root by design; neither is deployed.
- `docker/opencode/Dockerfile` (agent tooling, `FROM ${OPENCODE_BASE_IMAGE}`) is not a deployed image and is not checked.

## Files changed

`Dockerfile`, `package.json`, `scripts/verify.mjs`, `scripts/check-dockerfiles.mjs`, `scripts/smoke.mjs`,
`packages/app/next.config.ts`, `packages/app/src/instrumentation-client.ts`,
`packages/app/scripts/__tests__/check-dockerfiles.test.mjs`, `packages/app/scripts/__tests__/smoke.test.mjs`,
`packages/app/.ai/qa/tests/platform/ENG-TEST-11-security-headers.spec.ts`,
`packages/app/.ai/qa/tests/people/TEST-L15-first-administrator-and-empty-pickers.spec.ts`, `docs/ops/deploy.md`,
`.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-21-issue-463-phase-e4-headers-and-container.md`,
`.ai/lessons/csp-without-unsafe-eval-needs-zod-jitless.md`, this log.

## Open problems / next steps

- ENG-TEST-11 on staging (`node scripts/smoke.mjs <staging-url>` with the smoke account) once the Railway environment
  exists (owner action, epic #460).
- HSTS `preload` after the production domain is fixed (D-012).
- Pages and routes other than those ENG-TEST-11 opens were not walked under the CSP; the full CI suite runs against the
  same production build, but only a violation recorder catches report-only blocks.
