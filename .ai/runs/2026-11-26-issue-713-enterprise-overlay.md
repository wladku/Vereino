# Run: issue #713 — Enterprise phase 1b (conditional loading, overlay build, demo module)

- **Trigger:** Cezar queue (`cezar` label), skill `om-auto-fix-issue` (feature route, spec merged and approved). Owner
  comment of 2026-11-26 on #713 releases phase 1b on top of phase 1a (PR #723).
- **Spec:** `.ai/specs/2026-11-23-vereino-enterprise-package.md`, phase 1b (DD-E02, DD-E03, DD-E10…DD-E12, REQ-E01,
  REQ-E02, REQ-E04 demo, REQ-E05 read-only route, REQ-E06; ENT-TEST-02…05). Ask First items of phase 1b (`modules.ts`,
  `next.config.ts`, `globals.css`, Dockerfile) approved by the owner on PR #660 (2026-11-23).
- **Branch / worktree:** `feat/issue-713-enterprise-overlay`, Cezar run ff6e2845 worktree.

## Steps

1. Claimed #713 (assignee, `in-progress`, `🤖` claim comment naming this run); branch renamed from `cez/713`.
2. Read phase 1a (PR #723) and the platform generator (`@open-mercato/cli/dist/lib/resolver.js`,
   `module-package.js`, `generators/module-package-sources.js`) to see how a package module is found and imported.
3. Delegated two independent script slices to subagents (disjoint files, no commits): the `forbidden-packages`
   import rule with markers and `--overlay` plus the overlay `licenses:check` test (ENT-TEST-04); `--modules-root` for
   `route-isolation:check`, `contracts:check`, `i18n:check-hardcoded`. Reviewed both diffs.
4. Fixture package `packages/app/.ai/qa/fixtures/enterprise-overlay/` (`@vereino/enterprise`, module `enterprise_demo`:
   `GET|POST /api/enterprise_demo/state`, page `/backend/enterprise-demo`, ACL `enterprise_demo.view`, en/pl, its own
   route-isolation inventory); excluded from the app `tsconfig.json` (Jest already ignores `.ai/qa`).
5. `scripts/enterprise-overlay.mjs` (manifest patch, `yarn install --no-immutable`, lockfile-diff check,
   `packages/node_modules` link, `--ci` trust file) with `enterprise-overlay.test.mjs` (ENT-TEST-05, 100 %).
6. App wiring: `modules.ts` and `next.config.ts` switch blocks with `enterprise-switch` markers, static `@source` in
   `globals.css`, `foundation/lib/enterprise-build.ts` (pure boot check, 100 %) + `services/enterprise-build.ts`
   called from `instrumentation.ts`, `readCiTrust` in `licence-verify.ts` used by the gate and `licence-status`.
7. ENT-TEST-03 (overlay only; skipped unless `NEXT_PUBLIC_VEREINO_ENTERPRISE=true`): three clubs, a second `next start`
   of the same build with test-signed keys (A valid, C expired past grace) and `VEREINO_CI=true`.
8. CI job `enterprise-overlay`; Dockerfile (DD-E12, clone stage); `.gitignore`, `.dockerignore`; CONTRIBUTING (section
   and local-patch rows), `BACKWARD_COMPATIBILITY.md` §8, `docs/ops/deploy.md`; spec DD-E02/DD-E03/DD-E12 updated to
   what was built, changelog file; lesson `modules-ts-is-parsed-statically`.

## Decisions

- **Peer-only package + `packages/node_modules` link** instead of the spec's `@vereino/ui` pattern (peers repeated as
  dev dependencies): the dev-dependency copies gave the package its own `node_modules/@open-mercato/ui`, and the app
  typecheck then compiled that second source tree and failed on its unresolved imports (same trap as lesson
  `vereino-ui-imports-no-platform-client-sources`); two copies of React would also break hooks. The runner image
  already links `packages/node_modules` to the app's for the same reason (#727).
- **`exports` with `.ts`/`.tsx` targets**: the generator imports `@vereino/enterprise/modules/<id>/<file>` without an
  extension; `./modules/*` → `./src/modules/*` failed (TS2307 on every generated import).
- **Static `@source`** instead of a generated include: Tailwind scans nothing when the path is absent (the public build
  passes), and a CSS `@import` of a missing generated file would break it.
- **Build-time decision** = `NEXT_PUBLIC_VEREINO_ENTERPRISE` inlined by `next build` + `enabled-module-ids.generated.ts`;
  the boot check refuses switch-without-package, package-without-switch and switch-with-unregistered-ids.
- **Dockerfile uses the spec's fallback** (a clone stage taking the token as a build argument; only the package sources
  leave it) instead of a BuildKit secret mount: Railway's support for `RUN --mount=type=secret` is not verified, and the
  flag would make the public build depend on it too. The overlay-shape image is not built here (no access to the
  private repository; phase 2).
- **ENT-TEST-03 starts a second server**: keys are read once at boot and must name tenants the test creates, so the
  runner's app (no keys) cannot serve the licensed cases; `next start` of the same build on the same database can.
- **`licence-status` warning for a tenant with Enterprise data but no key** (DD-E05) stays open: the demo module has no
  entity; it belongs to the first real module (phase 3).
- **The CI job is not made required**: adding it to the `main` ruleset is the owner's call.

## Commands and results

- Overlay shape, locally (fixture copied to `packages/enterprise`): `node scripts/enterprise-overlay.mjs --ci` → exit 0,
  `yarn.lock` diff = the `@vereino/enterprise@workspace` entry + one line in `@vereino/app`. First attempt with
  `devDependencies` and `exports: ./modules/* → ./src/modules/*`: `yarn typecheck` failed (TS2307 on every generated
  `@vereino/enterprise/modules/...` import, then errors inside `packages/enterprise/node_modules/@open-mercato/ui/src`);
  fixed as in *Decisions*. Then `NEXT_PUBLIC_VEREINO_ENTERPRISE=true yarn generate` + `yarn typecheck` → pass.
- `NEXT_PUBLIC_VEREINO_ENTERPRISE=true yarn test:integration:vereino --filter ENT-TEST-03` → **1 passed** (production
  build of the overlay shape; A `on` + write 200, B 404 `enterprise_feature_disabled` on GET and POST, C `read_only` +
  write 409 `enterprise_feature_read_only`, page states, test kid trusted with a warning, no key in the output).
- Public shape restored (`git checkout packages/app/package.json yarn.lock`, overlay folders removed,
  `yarn install --immutable`). `yarn test:integration:vereino --filter ENT-TEST-0` → **3 passed, 1 skipped**
  (ENT-TEST-02 ×3; ENT-TEST-03 skipped outside the overlay shape).
- `--modules-root .ai/qa/fixtures/enterprise-overlay/src/modules`: `contracts:check` 0 problems,
  `route-isolation:check` 0 problems (after adding the fixture's inventory), `i18n:check-hardcoded --strict` pass.
- Script tests: `enterprise-overlay.test.mjs` 13 pass, 100 % lines/branches/functions; subagents: forbidden-packages
  + licenses 38 pass at 100 %, contracts + route isolation 29 pass at 100 %. Foundation lib: `enterprise-build.ts`,
  `licence-verify.ts` 100 %.
- `docker build --target runner .` (public shape): first attempt failed inside `yarn install` with Yarn's
  internal `The onCancel handler was attached after the promise settled` during the fetch step while `yarn verify`
  ran alongside; the retry passed. The image has no `packages/enterprise`, `NEXT_PUBLIC_VEREINO_ENTERPRISE` empty, user
  `omuser`.
- `yarn verify`: failures fixed on the way — `format:check` (test file), `i18n:check-hardcoded --strict` (an internal
  error text → `[internal] …`), `lessons:check` (area `build` outside the taxonomy), `test:scripts` (98.48 % on the new
  link helper → tests added). Lint twice died with `FATAL ERROR: Ineffective mark-compacts near heap limit` (no
  findings) while another worktree's gate ran on the same machine; the app lint alone peaks at 4.5 GB RSS with and
  without the fixture, so it is not this change. Final: generate, typecheck, typecheck:packages, typecheck:qa pass;
  `yarn verify --from lint` → **all 19 steps passed** (no change in between).
- `yarn guard --base origin/main` → **blocked**: `[test-skip]` on ENT-TEST-03's `test.skip(!OVERLAY, …)`. The skip is
  what the spec requires (ENT-TEST-03 "tagged and skipped by the default integration run", DD-E11); explained in the
  PR, owner decision needed (`guard-approved`). Warning: `ci.yml` changed (the new job).

## Open problems / next steps

- Owner: review the guard finding and add `guard-approved` if the skip is accepted.
- Owner: decide whether `enterprise-overlay` becomes a required check of `main`.
- Phase 2 (owner action first): create `wladku/vereino-enterprise` from the fixture, the signing pair, the build token;
  then verify the overlay image on staging (`ENTERPRISE_REF`, `ENTERPRISE_TOKEN`) — the overlay Docker path is not
  exercised here.
- The app lint is near Node's default heap limit (4.5 GB RSS); worth a separate issue (raise `--max-old-space-size` for
  lint, or split it).
