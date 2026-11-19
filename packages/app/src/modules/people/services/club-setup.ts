// Setting up a club's `people` defaults (foundation spec P-04, P-12): the `vereino_*` roles, their ACL features and
// the daily `people:sync-role-expiry` and `people:purge-import-rows` (#28) schedules in the club zone, and for a new
// club the daily `people:life-cycle` (#310). Idempotent; used by `setup.ts` `seedDefaults` and by the
// `people bootstrap-admin` CLI for a tenant created outside `mercato init`.
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

/** Daily at 04:00 in the club's time zone (club spec *Events, Jobs* row `people:purge-import-rows`). */
export const IMPORT_PURGE_CRON = '0 4 * * *'

export async function registerImportPurgeSchedule(container: AwilixContainer, scope: ClubScope): Promise<boolean> {
  const { timezone } = await clubSettings(container, scope)
  return registerModuleSchedule(container, {
    module: 'people',
    name: 'purge-import-rows',
    schedule: { cron: IMPORT_PURGE_CRON, timezone },
    scope,
    description: 'Delete the staged rows and the file of people imports 30 days after their commit or cancellation.',
  })
}

/** Daily at 01:30 in the club's time zone, before the role sync at 02:00 re-derives the roles of the day. */
export const LIFE_CYCLE_CRON = '30 1 * * *'

/**
 * The daily `people:life-cycle` schedule (people life-cycle spec *Events, Jobs*, DD-L09; #310). Registered at setup only
 * for a new club; an existing club gets it from `mercato people life-cycle --register-schedule` after the owner
 * confirmed the dry run (*Rollout*, item 11), so no scheduled run ends the guardianships of adults on existing data first.
 */
export async function registerLifeCycleSchedule(container: AwilixContainer, scope: ClubScope): Promise<boolean> {
  const { timezone } = await clubSettings(container, scope)
  return registerModuleSchedule(container, {
    module: 'people',
    name: 'life-cycle',
    schedule: { cron: LIFE_CYCLE_CRON, timezone },
    scope,
    description:
      '18th birthdays and account ages: notices, guardianships ending, consents; accounts of dated departures.',
  })
}

/**
 * Seeds the roles and the schedules; with `withRoleAcls` (the CLI) also merges the roles' default features, as the
 * platform does itself after `seedDefaults` in `mercato init` and `mercato seed:defaults`. `lifeCycleSchedule: false`
 * (the `bootstrap-admin` CLI, which may run on an existing club) leaves out the life-cycle schedule.
 */
export async function setUpClubPeople(
  container: AwilixContainer,
  scope: ClubScope,
  options: { withRoleAcls?: boolean; lifeCycleSchedule?: boolean } = {},
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
  await registerImportPurgeSchedule(container, scope)
  // A new club (`seedDefaults`) has no backlog of adults under guardianship; an existing one waits for the confirmed run.
  if (options.lifeCycleSchedule !== false) await registerLifeCycleSchedule(container, scope)
}
