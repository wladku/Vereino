// P-04 role seeding and P-05 role sync (foundation DD-F05). The catalogue and the pure role-set functions live
// in `@vereino/core`; this file binds them to the platform `auth` module.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { ensureRoles } from '@open-mercato/core/modules/auth/lib/setup-app'
import { User, UserRole } from '@open-mercato/core/modules/auth/data/entities'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { catalogueAuthRoles, sameRoleSet } from '@vereino/core'
import { lockUserRoleSync } from '../data/queries'

export { desiredRoles, rolesForAssignments } from '@vereino/core'

/**
 * Creates the catalogue's `vereino_*` roles in the tenant; idempotent. Called from the `people` module's
 * `setup.ts` `seedDefaults`, whose `defaultRoleFeatures` lists `catalogueRoleFeatures()`; the platform merges
 * those features into the role ACLs after `seedDefaults` (and `yarn mercato auth sync-role-acls` for existing
 * tenants).
 */
export async function seedRoles(container: AwilixContainer, scope: { tenantId: string }): Promise<void> {
  const em = container.resolve<EntityManager>('em').fork()
  await ensureRoles(em, { tenantId: scope.tenantId, roleNames: catalogueAuthRoles() })
}

export type RoleSyncContext = {
  /** Context the `auth.users.update` command runs with: the calling command's, subscriber's or job's. */
  commandContext: CommandRuntimeContext
  /** The caller's transactional EntityManager; the per-user advisory lock lives until it commits. */
  em: EntityManager
  /** Tenant and organization of the person whose roles are synced; the user must belong to both. */
  scope: { tenantId: string; organizationId: string }
}

export type RoleSyncResult = 'updated' | 'unchanged' | 'user_missing'

function isUnknownRoleError(error: unknown): boolean {
  return isCrudHttpError(error) && error.status === 400 && String(error.body.error).startsWith('Role(s) not found')
}

/**
 * Writes the full desired role list through `auth.users.update` when it differs from the user's current roles
 * (set comparison, so a repeat changes nothing). Read and write run under a per-user advisory lock in the
 * caller's transaction. An unknown role name is a catalogue mismatch: reported as
 * `foundation.roles.catalogue_mismatch` and rethrown as an uncoded internal error; any other failure propagates
 * so the subscriber's queue or the next job run retries.
 */
export async function syncAuthRoles(
  userId: string,
  roles: readonly string[],
  ctx: RoleSyncContext,
): Promise<RoleSyncResult> {
  const { em, scope } = ctx
  if (!em.isInTransaction()) {
    throw new Error("[internal] syncAuthRoles must run inside the caller's transaction (foundation DD-F05)")
  }
  await lockUserRoleSync(em, userId)
  const decryptionScope = { tenantId: scope.tenantId, organizationId: scope.organizationId }
  const user = await findOneWithDecryption(em, User, { id: userId, deletedAt: null }, {}, decryptionScope)
  if (!user) return 'user_missing'
  if (user.tenantId !== scope.tenantId || user.organizationId !== scope.organizationId) {
    throw new Error('[internal] the user does not belong to the tenant and organization of the person')
  }
  const links = await findWithDecryption(em, UserRole, { user: userId }, { populate: ['role'] }, decryptionScope)
  const current = links.map((link) => link.role.name)
  if (sameRoleSet(current, roles)) return 'unchanged'

  const commandBus = ctx.commandContext.container.resolve<CommandBus>('commandBus')
  try {
    await commandBus.execute('auth.users.update', {
      input: { id: userId, roles: [...roles] },
      ctx: { ...ctx.commandContext, transactionalEm: em },
    })
  } catch (error: unknown) {
    if (!isUnknownRoleError(error)) throw error
    getTelemetryRuntime()?.reportError(error, { module: 'foundation', code: 'foundation.roles.catalogue_mismatch' })
    throw new Error('[internal] a desired role is missing from the tenant', { cause: error })
  }
  return 'updated'
}
