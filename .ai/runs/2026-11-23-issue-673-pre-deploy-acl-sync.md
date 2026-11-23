# Run: pre-deploy ACL sync only when role-feature defaults change (#673, DD-M11)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue 673` (label `cezar`). Build the DD-M11 wrapper of the many clubs spec: the role-ACL sync over every club's tenant runs only when the role-feature defaults changed since the last deploy; the deploy runbook says how it runs.
- **Spec / issue / branch:** `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md` (DD-M11, REQ-M09, TEST-M10, AC-M09), epic #626, issue #673, branch `feat/issue-673-pre-deploy-acl-sync`.
- **Approval:** DD-M11 is an *Ask First* item (deploy contract); the owner approved it on 2026-11-23 in a comment on #630, cited in the issue.

## Steps

1. Claimed #673 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Read the platform sync: `auth sync-role-acls` (`@open-mercato/core` 0.9.0, `auth/cli.js`) loops over every tenant and merges every module's `setup.defaultRoleFeatures` (plus `defaultCustomerRoleFeatures` through `syncCustomerRoleAcls` when `customer_accounts` is on); `ensureRoleAclFor` only adds features.
3. `foundation/lib/role-acl-defaults.ts` (pure, 100 % unit coverage): merged, sorted fingerprint of both default maps plus the core version (SHA-256); the skip/sync decision; the stored-value reader; the argument parser (`--force` only).
4. `foundation/cli.ts`: `yarn mercato foundation sync-role-acls-if-changed [--force]` — computes the hash from `getCliModules()`, reads the stored hash from `module_configs` (`foundation` / `role_acl_defaults_hash`, instance scope) through `data/queries.ts`, runs the registered `auth sync-role-acls` command when due, then stores `{ hash, coreVersion, syncedAt }` with `moduleConfigService.setValue`. One JSON result line (`skipped` / `synced`).
5. `scripts/railway-predeploy.sh` calls the wrapper instead of `auth sync-role-acls`; `docs/ops/deploy.md` gets a *Role ACL sync* section (how it decides, `--force`, add-only); `BACKWARD_COMPATIBILITY.md` lists the new operator command and the updated ACL path.
6. TEST-M10 (`packages/app/.ai/qa/tests/foundation/TEST-M10-role-acl-sync-wrapper.spec.ts`) and the usage case in ISSUE-642.

## Decisions

- **Storage without a migration:** the platform's `module_configs` row at instance scope (an installed contract that supports `tenant_id null`), not a new table.
- **Read the row, not `getValue`:** the first TEST-M10 run failed — `moduleConfigService.getValue` served the cached hash after the test changed the row (as a restore would). The wrapper now reads the row (`readInstanceModuleConfigValue`); lesson `module-config-get-value-reads-the-cache`.
- **Delegate to the installed command:** the wrapper runs the `auth` module's registered `sync-role-acls` CLI so the sync behaves exactly like before (including portal roles); a failed sync stores nothing, so the next deploy syncs again.
- **Hash also covers `defaultCustomerRoleFeatures`:** the same platform command applies them; including them can only cause an extra sync, never a missed one.
- **No env-var switch for forcing:** `--force` is run by hand from a shell on the app service (documented), keeping the config surface unchanged.

## Files changed

- `packages/app/src/modules/foundation/cli.ts` (new), `lib/role-acl-defaults.ts` (new), `lib/__tests__/role-acl-defaults.test.ts` (new), `data/queries.ts`
- `packages/app/.ai/qa/tests/foundation/TEST-M10-role-acl-sync-wrapper.spec.ts` (new), `packages/app/.ai/qa/tests/platform/ISSUE-642-module-cli-exit-code.spec.ts`
- `scripts/railway-predeploy.sh`, `docs/ops/deploy.md`, `BACKWARD_COMPATIBILITY.md`
- `.ai/specs/changelog/2026-11-22-vereino-many-clubs-one-instance/2026-11-23-issue-673-acl-sync-wrapper.md`, `.ai/lessons/module-config-get-value-reads-the-cache.md`, this log

## Commands and results

- `yarn workspace @vereino/app jest …role-acl-defaults.test.ts --coverage`: 6 passed, 100 % lines/branches/functions.
- `yarn test:integration:vereino --filter TEST-M10`, first run: failed — `Expected status "synced", reason "changed"; Received status "skipped", reason "unchanged"` (cached stored hash); also the result parser picked a later pg-pool log line. After both fixes: `2 passed` (the filter also matches the communication spec's TEST-M10, which passed too).
- `yarn test:integration:vereino --filter ISSUE-642`: `1 passed`.
- `yarn verify`: first run failed at `lint` (restricted `@mikro-orm` import in `cli.ts`, `module` variable name, an unnecessary assertion, then an unsafe `any`); fixed, `format` applied; the final full run passed all 21 steps (exit 0). `yarn guard`: no blocking findings.

## Open problems / next steps

- The test ID `TEST-M10` is also used by the communication messaging spec, so `--filter TEST-M10` runs both files.
- AC-M09's second half (deploy time with 1,000 clubs under 10 minutes) is measured by TEST-M09 in phase 5.
