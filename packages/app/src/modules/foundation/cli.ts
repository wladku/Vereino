// Operator and deploy commands of `foundation` (`yarn mercato foundation <command>`).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { getCliModules } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { ModuleConfigService } from '@open-mercato/core/modules/configs/lib/module-config-service'
import {
  decideRoleAclSync,
  parseSyncRoleAclsArgs,
  roleAclDefaultsHash,
  storedRoleAclHash,
} from './lib/role-acl-defaults'
import { readInstanceModuleConfigValue } from './data/queries'

/** Instance-scoped module config entry holding `{ hash, coreVersion, syncedAt }` of the last successful sync. */
const ROLE_ACL_HASH_CONFIG = { moduleId: 'foundation', name: 'role_acl_defaults_hash' } as const

const SYNC_USAGE = 'Usage: mercato foundation sync-role-acls-if-changed [--force]\n'

/** The installed `@open-mercato/core` version, read from its package.json (the package exports no such path). */
function installedCoreVersion(): string {
  const requireFromApp = createRequire(path.join(process.cwd(), 'package.json'))
  const entry = requireFromApp.resolve('@open-mercato/core')
  const manifest = path.join(path.dirname(entry), '..', 'package.json')
  const { version } = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: unknown }
  if (typeof version !== 'string' || !version) throw new Error(`[internal] no version in ${manifest}`)
  return version
}

/**
 * `foundation sync-role-acls-if-changed [--force]` (many clubs spec DD-M11, REQ-M09, AC-M09; #673): the pre-deploy step
 * (`scripts/railway-predeploy.sh`). It hashes the merged role-feature defaults of every enabled module plus the
 * installed `@open-mercato/core` version and compares the hash with the one stored after the last successful sync. Only
 * when they differ (or nothing is stored, or `--force`) does it run the platform's `auth sync-role-acls`, which visits
 * every tenant — one per club — once, and then stores the new hash. A failed sync stores nothing, so the next deploy
 * tries again. Prints one JSON line: `status` `skipped` or `synced`, the `reason` and the hash; exit 1 on a usage error
 * or a failed sync.
 */
const syncRoleAclsIfChanged: ModuleCli = {
  command: 'sync-role-acls-if-changed',
  async run(argv) {
    const parsed = parseSyncRoleAclsArgs(argv)
    if ('error' in parsed) {
      process.stderr.write(`${parsed.error}\n${SYNC_USAGE}`)
      throw new Error('[internal] foundation sync-role-acls-if-changed: invalid options')
    }
    const modules = getCliModules()
    const authSync = modules
      .find((entry) => entry.id === 'auth')
      ?.cli?.find((command) => command.command === 'sync-role-acls')
    if (!authSync)
      throw new Error('[internal] foundation sync-role-acls-if-changed: auth sync-role-acls is not registered')

    const coreVersion = installedCoreVersion()
    const hash = roleAclDefaultsHash(modules, coreVersion)
    const container = await createRequestContainer()
    const configs = container.resolve<ModuleConfigService>('moduleConfigService')
    // The row, not `configs.getValue`: the cache may hold a hash the database no longer has and skip a due sync.
    const storedHash = storedRoleAclHash(
      await readInstanceModuleConfigValue(
        container.resolve<Parameters<typeof readInstanceModuleConfigValue>[0]>('em'),
        ROLE_ACL_HASH_CONFIG,
      ),
    )
    const decision = decideRoleAclSync({ storedHash, currentHash: hash, force: parsed.force })
    if (!decision.sync) {
      process.stdout.write(`${JSON.stringify({ status: 'skipped', reason: decision.reason, hash, coreVersion })}\n`)
      return
    }
    await authSync.run([])
    await configs.setValue(ROLE_ACL_HASH_CONFIG.moduleId, ROLE_ACL_HASH_CONFIG.name, {
      hash,
      coreVersion,
      syncedAt: new Date().toISOString(),
    })
    process.stdout.write(
      `${JSON.stringify({ status: 'synced', reason: decision.reason, hash, previousHash: storedHash, coreVersion })}\n`,
    )
  },
}

const commands: ModuleCli[] = [syncRoleAclsIfChanged]

export default commands
