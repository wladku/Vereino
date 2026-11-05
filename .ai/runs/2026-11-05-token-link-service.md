# Run — foundation I phase C step 1: token link service P-10 (#157)

- **Date:** 2026-11-05
- **Trigger:** cezar task `om-auto-fix-issue 157` (unattended)
- **Issue:** #157 — Implement: foundation I phase C — token link service (P-10), consumer #105
- **Spec:** `.ai/specs/2026-10-27-vereino-foundation-primitives.md` (phase C step 1, P-10, REQ-F07, TEST-F07, J-F03); approval D30 (2026-11-04, `D-030-unblock-held-back-work.md` on PR #158, item 4: phase C and its token-link migrations)
- **Branch:** `feat/issue-157-token-link-service`

## Goal

Build P-10 — `TokenLinkService` and `TokenLinkColumns` — so a consumer (first: #105, the declaration link) can issue a personal link stored only as a hash, read it on GET without spending it, and redeem it atomically in its command's transaction, with TEST-F07's service probes.

## Steps

1. Route: feature with a covering spec → feature route; FR triage: no `TokenLink*` code on `main`, no open PR referencing #157. Claimed #157 (assignee, `in-progress`, 🤖 comment); branch renamed from `cez/157`.
2. `@vereino/db`: `tokenLinkColumns({ hashColumn?, use })` and the `TokenLinkFields` / `TokenLinkUse` types; unit tests (100 %).
3. `foundation/lib/token-link.ts` (pure): `isWellFormedToken`, `expiryFor`, `hashesMatch` (`timingSafeEqual`), `tokenLinkState`; unit tests (100 %).
4. `foundation/services/token-link.ts`: `createTokenLinkService(entity, { use, ttlMs })` → `issue`, `peek`, `redeem` on the platform's `generateAuthToken` / `hashAuthToken` and the `nativeUpdate` compare-and-set of `authService`; DI `foundationTokenLinks`; exported from `@/modules/foundation`.
5. Error codes `token_link_expired`, `token_link_used` (410) with `en` / `pl` messages.
6. TEST-F07 probe `.ai/qa/tests/_fixtures/token-link-probe/probe.mjs` + `_fixtures/token-links.ts` + `foundation/TEST-F07-token-links.spec.ts`.
7. Spec (P-10 row, phase C implementation status, changelog) and module README updated.

## Decisions

- **No shipped table, no migration.** The spec says the foundation owns no token table; the first table (`activities_declaration_tokens`) belongs to #105. TEST-F07's service oracles therefore run on two QA-only probe tables (one per use policy) that the probe declares with the shipped `scopedEntityColumns` + `tokenLinkColumns` as `EntitySchema`s, registers before the ORM starts, and creates in the disposable Testcontainers database — the same "probe in its own process" pattern as the messaging probe. No `db:migrate`, no migration file.
- **Concrete signature.** The spec's abridged `issue(subject, targets, ctx)` / `peek(rawToken)` / `redeem(rawToken, em)` became `issue(em, subjectColumns, scope, { expiresAt? })`, `peek(em, raw, { scope? })`, `redeem(em, raw, { scope? })`: the service holds no `em` of its own (the consumer's request or command transaction decides), the subject and targets are the consumer's own columns, and an optional route scope makes a link of another organization or tenant answer exactly like an unknown token. `ttl` became `ttlMs`; the hash column name is only a `tokenLinkColumns` option (the property is always `tokenHash`). Recorded in the spec changelog; the foundation's TS API is an internal surface (`BACKWARD_COMPATIBILITY.md` §1), and the two new error codes are additive.
- **Expired vs used.** A spent `single` link reads `used` even after its expiry, so the page can say it already worked. A lost race re-reads the row: `used` → 410 `token_link_used`, otherwise 410 `token_link_expired`.
- **Expiry inside the TTL.** An own `expiresAt` (e.g. the occurrence start) must lie in the future and within the time to live — a programming error otherwise, so a consumer cannot mint a link that outlives its policy.
- **Secrets.** The service logs and emits nothing. The probe returns the raw tokens and hashes once, in its result's `secrets` field, so the test can prove that no event, step output or log line carries them.

## Files changed

- `packages/db/src/token-link-columns.ts`, `packages/db/src/index.ts`, `packages/db/src/__tests__/token-link-columns.test.mjs`
- `packages/app/src/modules/foundation/lib/token-link.ts`, `lib/__tests__/token-link.test.ts`, `lib/error-codes.ts`, `lib/__tests__/error-codes.test.ts`
- `packages/app/src/modules/foundation/services/token-link.ts`, `di.ts`, `index.ts`, `i18n/en.json`, `i18n/pl.json`, `README.md`
- `packages/app/.ai/qa/tests/_fixtures/token-link-probe/probe.mjs`, `_fixtures/token-links.ts`, `foundation/TEST-F07-token-links.spec.ts`
- `.ai/specs/2026-10-27-vereino-foundation-primitives.md`

## Commands and results

- `yarn workspace @vereino/db test` — 12/12 pass, 100 % lines / branches / functions.
- `npx jest src/modules/foundation/lib` (packages/app) — 7 suites, 40 tests pass.
- `yarn generate`, `yarn typecheck` — green.
- `yarn test:integration:vereino --filter TEST-F07` — first run aborted before Playwright started, in the app's worker process: `Error: ENOENT: no such file or directory, scandir '…\packages\app\.mercato\queue\scheduler-test\queue.lock'` (a local-queue lock race in the harness, unrelated to this change; no test executed). Re-run: `ok 1 … TEST-F07 token links: hashed storage, free peek, one-time and counted redemption, expiry and isolation (28.5s)`, `1 passed (1.4m)`.

- `yarn verify` (1st) — failed at `lint`: `react-hooks/rules-of-hooks` on the probe's helper `useOf` (renamed `linkUseOf`), `no-unnecessary-type-parameters` on `tokenOutput<T>` (now returns `unknown`, the test casts), `restrict-template-expressions` on `${ttlMs}` (now `String(ttlMs)`), and a `no-unnecessary-condition` warning in `tokenLinkColumns`.
- `yarn verify --from lint` — failed at `build`: `token-link-columns.ts(51,10): error TS2352: Conversion of type … to type 'SingleUseTokenLinkColumns | UntilExpiryTokenLinkColumns' may be a mistake` (the cast added for the warning); replaced by typed per-policy builders.
- `yarn verify` (final, full) — all 13 steps passed (generate, typecheck, typecheck:packages, typecheck:qa, lint, format:check, ds:check, i18n:check-hardcoded, contracts:check, lessons:check, test, test:scripts, build). The lint fixes after the green TEST-F07 run touched only names and type casts in the probe, fixture and test.

## Open problems

- None blocking. The declaration oracles of TEST-F07 (scope after an ended guardianship, `acting_role = guardian`, the link request with uniform 202 and rate limits) belong to #105.

## Next steps

- #105: `activities_declaration_tokens` (migration approved by D30), `TokenPageShell`, `DeclarationControls`, `/club/d/[token]`, the declaration oracles of TEST-F07 and the club spec's TEST-017.
