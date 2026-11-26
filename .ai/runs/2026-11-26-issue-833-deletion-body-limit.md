# Run: issue #833 — Facebook deletion callback refuses oversized bodies before reading them

- **Trigger:** Cezar run (`om-auto-fix-issue`), issue labeled `cezar` on 2026-11-26.
- **Issue:** #833 (follow-up from the review of PR #829, #567). Depends on #829, merged as `04be7daf`.
- **Branch:** `fix/issue-833-refuse-oversized-facebook-deletion-bodies`.
- **Spec:** `.ai/specs/2026-10-27-vereino-social-sign-in.md` (API table and TEST-S03 row updated; changelog file `2026-11-26-issue-833-deletion-body-limit.md`).

## Goal

`POST /api/foundation/identity/facebook/deletion` read the whole body with `request.text()` and only then checked the
8192-character limit of `signed_request`. The sessionless route must refuse a body over a small limit, or one without
`content-length`, with 413 before reading it, covered in TEST-S03.

## Steps and decisions

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming this run and worktree).
2. Pure helper `deletionBodyAllowed(contentLength)` and `MAX_DELETION_BODY_BYTES = 16 KiB` in
   `foundation/lib/facebook.ts`, with unit tests (100 % coverage rule). Only a plain decimal length up to the limit
   passes; a missing header (chunked body), a list, a sign or an exponent is refused.
3. The route checks the header after the provider check (so Google still answers 404) and before reading the body:
   413 `{ error: 'Payload too large' }`, `no-store`, documented in `openApi`. Plain error body like the route's 400,
   no new error code. Node's HTTP parser never hands the handler more bytes than the declared `content-length`, so the
   header bounds what `request.text()` reads.
4. Route comment notes the per-IP rate limit vs Facebook's shared callback IPs (accepted for now by the owner, out of
   scope of #833).
5. TEST-S03: a validly signed request padded to over 16 KiB → 413 and the link kept; the same request streamed
   chunked (no `content-length`, `fetch` with a `ReadableStream`) → 413. The test now makes 8 deletion calls, under
   the 10/min/IP limit.

## Files changed

- `.ai/lessons/verify-lint-heap-out-of-memory.md` (new lesson)
- `packages/app/src/modules/foundation/lib/facebook.ts`, `lib/__tests__/facebook.test.ts`
- `packages/app/src/modules/foundation/api/identity/[provider]/deletion/route.ts`
- `packages/app/.ai/qa/tests/foundation/identity/TEST-S03-facebook-sign-in.spec.ts`
- `.ai/specs/2026-10-27-vereino-social-sign-in.md`, `.ai/specs/changelog/2026-10-27-vereino-social-sign-in/2026-11-26-issue-833-deletion-body-limit.md`

## Commands and results

- `yarn workspace @vereino/app jest src/modules/foundation/lib/__tests__/facebook.test.ts` — 8 passed.
- `yarn test:integration:vereino --filter TEST-S03` — `1 passed (1.1m)`; the server log shows only the two expected
  `deletion_bad_signature` entries, so the 413 requests never reached the signature check.
- `yarn verify` (first run) — failed at `lint` with no lint finding: `FATAL ERROR: Ineffective mark-compacts near heap
  limit Allocation failed - JavaScript heap out of memory` in `eslint .` of `@vereino/app`. Environment, not the
  change; recorded as lesson `verify-lint-heap-out-of-memory`.
- `NODE_OPTIONS=--max-old-space-size=8192 yarn verify --from lint` — all 19 steps passed; then a full
  `NODE_OPTIONS=--max-old-space-size=8192 yarn verify` — `all 23 step(s) passed`.
- `yarn guard` — no blocking findings.

## Open problems / next steps

- None for #833. The per-IP rate limit for Facebook's shared IPs stays as is (out of scope).
