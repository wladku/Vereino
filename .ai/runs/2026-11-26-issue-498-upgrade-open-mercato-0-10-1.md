# Run: #498 — upgrade Open Mercato from 0.9.0 to 0.10.1 (ENG-UPG-01)

- **Trigger:** cezar run cfef92b9 (`om-auto-fix-issue 498`), issue labelled `cezar`; owner decision on #498 of 2026-11-26 evening ("start the upgrade 0.9.0 → 0.10.1 now", one build, `risk-high`, `needs-qa`; approves `@open-mercato/*` 0.10.1 and P2 bumps only as the release requires).
- **Issue:** #498. **Spec:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (P1/P2, ADR-001, ADR-023, S8.4). **Branch:** `chore/upgrade-open-mercato-0.10.1`.
- **Upgrade skill:** `.ai/skills/om-auto-upgrade-0.9.0-to-0.10.0/SKILL.md`, copied from `@open-mercato/cli` 0.10.1 (`dist/agentic/shared/ai/skills/`) like the earlier upgrade skills; 0.10.1 ships no separate 0.10.0 → 0.10.1 skill, so the 0.10.0 skill covers the window.
- **Hours spent (input to ADR-001):** see "Time" below.

## Release check

- 0.10.1 was published 2026-11-25 (0.10.0 on 2026-11-23). Same major line (0.x minor), no module Vereino uses removed, no irreversible data migration Vereino needs (the money and staff migrations concern modules Vereino does not enable). No stop condition of the issue applies.
- P5 age gate: `.yarnrc.yml` preapproves `@open-mercato/*`, so the one-day-old release installs without `--no-time-gate`; every third-party package keeps the five-day gate.

## Steps

1. Claimed #498 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch); renamed the task branch to `chore/upgrade-open-mercato-0.10.1`.
2. Bumped every `@open-mercato/*` pin from 0.9.0 to 0.10.1 (27 in `packages/app`, `shared` and `ui` dev and peer in `packages/ui`). `yarn install` resolved them; two new peer requests followed the 0.10.1 scaffold: `react-is` 19.2.8 (`@open-mercato/ui` → `recharts`) in `app` and `ui`, and `bullmq-otel` `^2.0.1` (`@open-mercato/queue` now accepts `^2`, `bullmq` asks for ≥ 2). No P2 package moved: `next` 16.4.6 is already newer than the scaffold's 16.4.5, `@mikro-orm/*`, `pg`, `date-fns`, `awilix` keep their versions (the platform asks `^7.1.14`, `4.4.0`).
3. Root `resolutions` (P4, CONTRIBUTING): **dropped** `happy-dom` (documents 0.10.1 depends on 21.0.4) and `re2js` (shared 0.10.1 pins 2.8.7, the fixed release); **kept** `lodash`, `lodash-es` (the scaffold still sets them), `zod` 4.6.7 (scaffold 4.6.6), `node-forge` 1.4.3 (scaffold 1.4.1), `handlebars` (unrelated to the platform).
4. Diffed the `create-mercato-app` 0.9.0 and 0.10.1 templates. Files Vereino never patched were copied over (dev scripts, `setup.mjs`, `bootstrap-api.ts`, `docker/opencode/Dockerfile`, `docker/scripts/init-or-migrate.sh`, the reference `example` module minus its tests, as before); new scaffold scripts were added (`dev-encryption-preflight.mjs`, `dev-infra-preflight.mjs`, `infra.mjs` and the other `dev-*` helpers that `dev.mjs` now imports) with the `infra:up` / `infra:down` scripts. Patched files were three-way merged (base 0.9.0 template, ours, theirs 0.10.1).
5. Ran the upgrade skill's detection over Vereino code (subagent, read-only; result summarised under *Upgrade checks*) and fixed what it found.
6. Gate and integration tests (below); removed the `CrudForm` label repair that 0.10.1 makes unnecessary.

## Local patches (CONTRIBUTING → *Local patches to platform files*)

| File | Result | Reason |
|---|---|---|
| `packages/app/package.json` | re-applied | Vereino scripts kept; `@open-mercato/enterprise` stays out; `infra:*` scripts and `react-is` added from the scaffold |
| `scripts/i18n-check-hardcoded.mjs`, `eslint.config.mjs`, `scripts/dev-runtime-supervisor.mjs` | re-applied (unchanged upstream) | the scaffold did not change them |
| `jest.config.cjs` | re-applied | upstream widened `transformIgnorePatterns` (sanitize-html family); merged cleanly with the coverage thresholds |
| `next.config.ts` | **adapted** | the scaffold now builds the CSP with `createContentSecurityPolicy` (nonce, no `'unsafe-eval'` in production) and picks the frame policy per Next phase; Vereino's #463 CSP literal is **dropped** (fixed upstream), HSTS, `Permissions-Policy`, authenticated `Cache-Control`, token-page `Referrer-Policy` and `proxyClientMaxBodySize` re-applied |
| `src/proxy.ts` (row added — it was missing from the table) | **adapted** | upstream emits the per-request CSP nonce for pages; Vereino's `/api` cross-site check (#744) runs first and API routes keep the config CSP |
| `src/app/layout.tsx`, `AppProviders.tsx` | adapted | upstream nonce for the theme script and `ContentSecurityPolicyProvider`; `PasswordPolicyBridge` (#779, now named in the table) and `PlatformFlashTranslator` kept |
| `src/components/ClientBootstrap.tsx` | re-applied | `member`/`login` profiles kept; upstream registry-error reporting merged |
| `src/components/DemoFeedbackWidget.tsx`, `src/app/globals.css`, `.ds-check-ignore` | re-applied | Vereino's token classes kept over upstream's new inline gradient; upstream CSS and the umes-extensions baseline removal merged; two baseline rows for the new example `VisitPanel.tsx` (not enabled) |
| `src/app/api/[...slug]/route.ts` | re-applied | upstream `honorsBodyTenantId` and super-admin changes merged; Vereino's `sessionlessRateLimiter` / `noteClientAddress` kept |
| `src/modules.ts` | re-applied | Vereino's trimmed list kept; only the widened `ModuleEntry` type (`locator`, `packageName`) taken. No module added (`channel_smtp` of the scaffold not enabled: new modules are Ask First) |
| `src/i18n/*.json` | re-applied | upstream keys merged cleanly with the Vereino brand keys |
| `.env.example` | re-applied | enterprise block stays removed; Vereino key-store and per-club limit notes kept; upstream API-dispatcher note added; storefront notes skipped (module not enabled) |
| `scripts/dev.mjs` | re-applied (row added) | #808: no webpack fallback on low inotify limits |
| `scripts/dev-service-connections.mjs` | new patch (row added) | the 0.10.1 scaffold file fails `@next/next/no-assign-module-variable`; the loaded module is held in `ioredis` |
| `Dockerfile`, `.dockerignore`, `docker-compose*.yml` | adapted | upstream encryption preflight copied from `packages/app/scripts/` (monorepo path); stricter `.env*` ignore, digest-pinned images, loopback-bound infra ports, `MCP_HTTP_HOST` taken as is |
| `instrumentation*.ts`, `[...slug]/page.tsx`, `login`, `start`, `page.tsx`, `BackendHeaderChrome`, `OrganizationSwitcher`, `public/*.svg`, root `.gitignore`, Railway scripts | re-applied (unchanged upstream) | the scaffold did not change them |

## Upgrade checks (`om-auto-upgrade-0.9.0-to-0.10.0`, 103 checks)

- Automatic: `module-runtime-requires` — no match (`customers`, `portal`, `workflows` are not enabled; `yarn generate` passes the dependency check).
- Fixed: `production-csp-nonce` (scaffold adopted; the outline print page's inline `<style>` now carries the nonce), `production-bootstrap-superadmin` (the integration runner sets a per-run `OM_INIT_SUPERADMIN_PASSWORD`; `scripts/image-smoke.sh` password meets the default policy; `docs/ops/deploy.md` updated), `acl-live-row-canonicalization` (`foundation/services/roles.ts` counts live user-role links only; TEST-M07 and TEST-M10 read live ACL rows only), `attachment-shared-storage-release` (every call site already follows the contract; see *Decisions*).
- New platform tables: 0.10's attachments migration adds `attachment_document_extractions` and `attachment_document_sections`; `club_core export-club` refused to run until they were listed (`PLATFORM_CLUB_TABLES`, as `derived`: rebuilt from the files, deleted with the club, not exported).
- Advisory, not changed: `search-presenter-badge-deprecated` (`people/search.ts` `badge`, removal in 0.11.0), `organization-create-undo-tombstone` (`training/services/library-init.ts` reads the configured organization without `deletedAt`), `money-exact-decimals` (the payments gateway type still names 0.9.0 and passes `amount`; the platform derives `amountExact`), `cli-module-command-exit-code` (three CLI comments say `process.exitCode` is dropped), `compose-tenant-encryption-key` / `production-bootstrap-superadmin` in `docker-compose.fullapp.yml` (upstream defaults, not used for deployment). All other checks: no match or module not enabled.

## Decisions

- **CSP.** Adopted the platform's nonce-based CSP as the upgrade skill asks ("adopt together"); it is stricter than #463's (no `'unsafe-inline'` for scripts, `script-src-attr 'none'`, `connect-src 'self'` plus Stripe). ENG-TEST-11 now asserts the nonce, a fresh nonce per response and no blanket `https:` in `connect-src`; its browser test found no violation on `/login`, `/backend`, "Add person" and the coordinator calendar. The subagent found no browser call to another origin in Vereino code.
- **`releaseScoped` lint.** 0.10.1 puts `@deprecated` on the whole method although only `{ flush: false }` outside a transaction is deprecated. `eslint.vereino.mjs` allows that one name in `@typescript-eslint/no-deprecated`; every other deprecated API still fails. (The package-scoped allow form does not match the optional-chain references.)
- **Runner superadmin password.** Random per run (`qa-superadmin-<hex>`, meets the test policy of min length 12); the platform test helpers read the same variable.
- **`CrudForm` label repair removed.** CrudForm 0.10.1 renders `htmlFor`/ids; E20-S18 passed with the repair switched off, so `labelCrudField` and the id generator are gone from `@vereino/ui`; the other repairs and the axe baseline entries stay (lesson `platform-crudform-labels-axe-baseline` updated).
- **Agentic harness not refreshed.** Only the release's upgrade skill was added to `.ai/skills` (tiers, manifest); `agentic:init --update-harness` was not run (outside the issue's scope).

## Upstream findings (to report to Open Mercato)

- `@open-mercato/core` 0.10.1 marks the whole `AttachmentService.releaseScoped` `@deprecated` instead of a `{ flush: false }`-outside-a-transaction overload.
- The 0.10.1 scaffold's `scripts/dev-service-connections.mjs` fails the scaffold's own `next` lint rule (`no-assign-module-variable`).
- With `translations` disabled, query-index handlers log `relation "entity_translations" does not exist` and `QueryIndexScopeError` for `directory:tenant` / `directory:organization` events when a tenant is created (handler errors in the logs; no test fails).

## Files changed

See the pull request; summary: package manifests and `yarn.lock`, root `package.json` resolutions, the platform-owned files above, `eslint.vereino.mjs`, `packages/ui/src/admin/platform-a11y.ts` and its tests, `foundation/services/roles.ts`, `training/components/club/OutlinePrintPage.tsx`, `club_core/lib/club-offboarding.ts`, `scripts/vereino-ephemeral.mjs` and its test, `scripts/image-smoke.sh`, four integration tests (ENG-TEST-11, TEST-M07, TEST-M10, E20-S18 comment) and the axe fixture comment, `.ai/skills/om-auto-upgrade-0.9.0-to-0.10.0/`, CONTRIBUTING, the engineering spec (stack baseline, ADR-001, S7.4) and its changelog file, `docs/ops/deploy.md`, `docs/compliance/asvs-*.md`, the lesson.

## Commands and results

- `yarn install` → done with warnings (only the pre-existing `playwright-core` peer note of `@axe-core/playwright`).
- `yarn generate` → all generators completed (module dependency check passes); `yarn typecheck` → 0 errors.
- First `yarn verify` → `lint` failed: 8 errors — 7 × `releaseScoped is deprecated` (training images/library, payments bank import, people jobs/erasure), 1 × `Do not assign to the variable module` (`scripts/dev-service-connections.mjs`). Fixed (see *Decisions*).
- Resumed `yarn verify --from lint` → `ds:check` failed: `src/modules/example/components/VisitPanel.tsx:115:24 [alert-without-style]` (and :119). Baselined (scaffold example, not enabled).
- First `yarn test:integration:vereino --filter ENG-TEST-11` → `yarn initialize failed`: "Production initialization requires a unique superadmin password via OM_INIT_SUPERADMIN_PASSWORD or --password; built-in placeholders are not allowed." Fixed in the runner.
- `TEST-M07` (club export) → `export-club` exit 1: "Failed: club tables not covered: attachment_document_extractions, attachment_document_sections". Fixed in `PLATFORM_CLUB_TABLES`.
- Final `yarn verify` → all 23 steps passed (after `yarn format` of the rewritten `platform-a11y.test.mjs`).
- `@vereino/ui` tests → 282 pass, coverage 100 % (`platform-a11y.ts` 100/100/100); `vereino-ephemeral.test.mjs` → 33 pass.
- Integration, local (Testcontainers PostgreSQL 17, production build), one id per run: ENG-TEST-11 5 passed; TEST-M07 (club export and session cancellation) 2 passed after the fix; TEST-M10 2 passed; ISSUE-744 3 passed; TEST-O07 (outline print) 1 passed; TEST-C15 (Stripe tab) 2 passed; ENG-TEST-25 1 passed; E02-S05 (public pages) 3 passed; ISSUE-481 1 flaky (dark sidebar heading focus ring read as `box-shadow: none` on the first try, passed on retry); E20-S18 1 passed with the `CrudForm` repair switched off, and E20-S18 and ENG-TEST-25 again on the final code.
- Browser smoke: `node .ai/qa/agent-browser/login-smoke.mjs` (agent-browser v0.38.2, checksum-verified, against `test:integration:vereino:start`) → "signed in and reached /backend".

## Open problems and next steps

- The full integration suite runs in CI (six shards); locally only the tests this change touches ran (list above).
- Owner step of the issue: the sandbox picks 0.10.1 up through its nightly upgrade, then the owner's smoke check. Operators: the 0.10.0 migrations (attachments document tables, ACL duplicates soft-deleted, receipt scope, `ai_assistant` tables) run with the next deploy's `db:migrate`; never run here against a real database.
- Follow-ups (not filed by this run): replace the deprecated search `badge` before 0.11.0; pass `amountExact` in the payments gateway call.

## Time

Claimed 21:03 UTC, pull request opened about 22:00 UTC on 2026-11-26: about 1 hour of autonomous run time, most of it waiting for the gate and integration runs (input to ADR-001's "one working day per month" exit trigger). The owner's sandbox smoke check is not included.
