# Run log — issue #466: remove the commercially licensed enterprise package (E18-S05)

- **Trigger:** Cezar run 38ac8aee (`om-auto-fix-issue`, label `cezar`), step 1 of 3 (build, draft PR); an independent reviewer marks the PR ready.
- **Issue:** #466 (epic #460); depends on the spike #448 (closed).
- **Spec:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md`, ADR-023 and ENG-Q-10.
- **Branch:** `chore/issue-466-remove-unused-enterprise-package`.
- **Route:** `direct` (dependency removal; the owner's ENG-Q-10 answer on epic #460 approves it: "removed if the platform spike shows no installed import needs it").

## Steps

1. Claimed #466 (assignee, `in-progress`, `🤖` claim comment naming this run).
2. Read the spike result (`.ai/runs/2026-11-20-issue-448-platform-spike-e3.md`, item 10): no installed package imports `@open-mercato/enterprise`; the app's only import is the scaffold example `src/modules/agent_examples/ai-agents.ts`, so removal is feasible after deleting that module. Hence the "no import" branch of the issue applies, not the "stop and report" branch.
3. Deleted `packages/app/src/modules/agent_examples/` (platform-owned scaffold example, never enabled: it was registered only behind `OM_ENABLE_ENTERPRISE_MODULES_AGENTS`).
4. Removed the `OM_ENABLE_ENTERPRISE_MODULES*` blocks from `src/modules.ts` (and the now unused `parseBooleanWithDefault` import); they would register modules from a package that is no longer installed. Replaced the switches in `.env.example` with a note.
5. Removed `"@open-mercato/enterprise": "0.9.0"` from `packages/app/package.json`; `yarn install` dropped it and its exclusive transitive packages from `yarn.lock`; `yarn install --immutable` passes.
6. New check `scripts/check-forbidden-packages.mjs` (`yarn forbidden-packages:check`, a `yarn verify` step after `di-commands:check`): fails, naming file and line, when a workspace manifest lists a forbidden package (any dependency field), when `yarn.lock` resolves it (catches a transitive return after a platform upgrade), or when a source file under `packages/` or `scripts/` imports, requires or registers it (`from: '…'` in `modules.ts`). Unit tests at 100 % line/branch/function coverage, including the negative case (a fixture file importing the package fails naming the file).
7. `scripts/check-licenses.mjs`: removed the enterprise exception; the test now asserts the package would be a violation. `yarn licenses:check`: "1483 production packages, every licence allowed".
8. Docs: `CONTRIBUTING.md` local-patch rows (`package.json`, `modules.ts`, `agent_examples/`, `.env.example`), `CODE_REVIEW.md`, `BACKWARD_COMPATIBILITY.md`, `docs/ops/deploy.md`, lesson `enterprise-package-is-commercial`, spec changelog entry.

## Decisions

- **A verify step, not only a lint rule:** the issue asks for a check that fails when the package is imported *or installed* again; ESLint sees imports only. One script covers manifests, lockfile and sources, and names the file.
- **Kept `OM_ENABLE_ENTERPRISE_MODULES: 'false'` in `vereino-ephemeral.mjs` and the deploy table:** harmless, and keeps a reinstalled package off.
- **Left `PLATFORM_MODULE_IDS` (`vereino-paths.mjs`) and the docker-compose `agents` profile comments untouched:** the id list is a guard against listing scaffold ids as Vereino modules; the compose files are platform-owned and not part of this story.
- **`@newrelic/security-agent` stays a licence exception:** it is proprietary (New Relic Software License), but ENG-Q-10 covers only `@open-mercato/enterprise`; its reason now says removing `newrelic` needs its own owner decision (flagged in the PR).

## Commands and results

- `node scripts/check-forbidden-packages.mjs` → "No forbidden package is installed or imported: @open-mercato/enterprise".
- `yarn install --immutable` → done (warnings only, as on `main`).
- `yarn licenses:check` → "1483 production packages, every licence allowed."
- `yarn test:scripts` → 406 tests pass, coverage 100 / 100 / 100.
- First `yarn verify` failed at `format:check`: "packages/app/scripts/__tests__/check-forbidden-packages.test.mjs is not formatted (run yarn format)"; fixed with `yarn format`, then a full run: `[verify] all 19 step(s) passed`.
- Negative case: a temporary `packages/app/src/negative-demo.ts` importing `@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent` → exit 1, "- packages/app/src/negative-demo.ts:1: imports @open-mercato/enterprise (commercially licensed; …)"; file removed.
- `yarn test:integration:vereino --filter ENG-TEST-16` (production build, platform sign-in page) → 1 passed.

## Open problems / next steps

- Integration tests: the change adds or edits none; ENG-TEST-16 ran locally as a build-and-boot check; CI runs the full suite on the draft PR.
- Owner: decide on `newrelic` / `@newrelic/security-agent` separately if "no proprietary package" is wanted.
