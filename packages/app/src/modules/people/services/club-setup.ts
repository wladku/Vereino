// Setting up a club's `people` defaults (foundation spec P-04, P-12): the `vereino_*` roles, their ACL features and
// the daily `people:sync-role-expiry` and `people:purge-import-rows` (#28) schedules in the club zone, and for a new
// club the daily `people:life-cycle` (#310), declared in `lib/club-jobs.ts`; `setUpClubJob` gives the club its job state
// and, until the operator moved a job type onto its sweep, its per-club schedule (many-clubs spec DD-M04, #629).
// Idempotent; used by `setup.ts` `seedDefaults` and by the
// `people bootstrap-admin` CLI for a tenant created outside `mercato init`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { ensureCustomRoleAcls } from '@open-mercato/core/modules/auth/lib/setup-app'
import { getCliModules } from '@open-mercato/shared/modules/registry'
import { seedRoles, setUpClubJob } from '@/modules/foundation'
import type { ClubScope } from './club-clock'

export async function registerRoleExpirySchedule(container: AwilixContainer, scope: ClubScope): Promise<boolean> {
  return setUpClubJob(container, scope, 'people:sync-role-expiry')
}

export async function registerImportPurgeSchedule(container: AwilixContainer, scope: ClubScope): Promise<boolean> {
  return setUpClubJob(container, scope, 'people:purge-import-rows')
}

/**
 * The daily `people:life-cycle` job (people life-cycle spec *Events, Jobs*, DD-L09; #310). Set up at setup only for a
 * new club; an existing club gets it from `mercato people life-cycle --register-schedule` after the owner confirmed
 * the dry run (*Rollout*, item 11), so no scheduled run ends the guardianships of adults on existing data first.
 */
export async function registerLifeCycleSchedule(container: AwilixContainer, scope: ClubScope): Promise<boolean> {
  return setUpClubJob(container, scope, 'people:life-cycle')
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
