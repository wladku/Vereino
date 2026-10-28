// Setting up a club's `people` defaults (foundation spec P-04, P-12): the `vereino_*` roles, their ACL features and
// the daily `people:sync-role-expiry` schedule in the club zone. Idempotent; used by `setup.ts` `seedDefaults` and by
// the `people bootstrap-admin` CLI for a tenant created outside `mercato init`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { ensureCustomRoleAcls } from '@open-mercato/core/modules/auth/lib/setup-app'
import { getCliModules } from '@open-mercato/shared/modules/registry'
import { registerModuleSchedule, seedRoles } from '@/modules/foundation'
import { clubSettings, type ClubScope } from './club-clock'

/** Daily at 02:00 in the club's time zone (club spec *Events* row). */
export const ROLE_EXPIRY_CRON = '0 2 * * *'

export async function registerRoleExpirySchedule(container: AwilixContainer, scope: ClubScope): Promise<boolean> {
  const { timezone } = await clubSettings(container, scope)
  return registerModuleSchedule(container, {
    module: 'people',
    name: 'sync-role-expiry',
    schedule: { cron: ROLE_EXPIRY_CRON, timezone },
    scope,
    description: 'Recompute staff auth roles: assignments that start or end, 18th birthdays.',
  })
}

/**
 * Seeds the roles and the schedule; with `withRoleAcls` (the CLI) also merges the roles' default features, as the
 * platform does itself after `seedDefaults` in `mercato init` and `mercato seed:defaults`.
 */
export async function setUpClubPeople(
  container: AwilixContainer,
  scope: ClubScope,
  options: { withRoleAcls?: boolean } = {},
): Promise<void> {
  await seedRoles(container, { tenantId: scope.tenantId })
  if (options.withRoleAcls) {
    // Outside a request the platform's own module lookup is empty; the CLI registers its modules separately.
    const modules = getCliModules()
    await ensureCustomRoleAcls(
      container.resolve<EntityManager>('em').fork(),
      scope.tenantId,
      modules.length > 0 ? modules : undefined,
    )
  }
  await registerRoleExpirySchedule(container, scope)
}
