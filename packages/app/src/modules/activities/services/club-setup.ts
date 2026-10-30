// Setting up a club's `activities` defaults (foundation II P-12, DD-G07): the daily `activities:generate-occurrences`
// schedule at 03:00 in the club's time zone and the 15-minute `activities:expire-guardian-confirmations` schedule (club
// spec *Events, Jobs* rows), plus the default declaration policies (#32). Idempotent (an upsert on the stable id, a
// find-or-create of the policies); used by `setup.ts` `seedDefaults` and re-run when the club's time zone changes.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { registerModuleSchedule } from '@/modules/foundation'
import { AttendancePolicy } from '../data/entities'
import { DEFAULT_POLICIES, policyKey } from '../lib/policy'
import { clubTimeZone, type ActivitiesScope } from './directory'

/** Daily at 03:00 in the club's time zone. */
export const GENERATE_OCCURRENCES_CRON = '0 3 * * *'

export async function registerGenerateSchedule(container: AwilixContainer, scope: ActivitiesScope): Promise<boolean> {
  return registerModuleSchedule(container, {
    module: 'activities',
    name: 'generate-occurrences',
    schedule: { cron: GENERATE_OCCURRENCES_CRON, timezone: await clubTimeZone(container, scope) },
    scope,
    description: 'Extend every active series to the 16-week horizon.',
  })
}

/** Every 15 minutes (club spec *Events, Jobs* row `activities:expire-guardian-confirmations`; foundation II P-12). */
export const EXPIRE_CONFIRMATIONS_INTERVAL = '15m' as const

export async function registerExpireSchedule(container: AwilixContainer, scope: ActivitiesScope): Promise<boolean> {
  return registerModuleSchedule(container, {
    module: 'activities',
    name: 'expire-guardian-confirmations',
    schedule: { interval: EXPIRE_CONFIRMATIONS_INTERVAL },
    scope,
    description: 'Apply the policy default to guardian confirmations past their time limit.',
  })
}

/**
 * Seeds the default declaration policies (club spec *Declaration policy* defaults, D-006; `lib/policy.ts`
 * `DEFAULT_POLICIES`) for a club that has none of them yet — one row per scope key, never overwriting a club's own
 * choice; a second run adds nothing.
 */
export async function seedDefaultPolicies(container: AwilixContainer, scope: ActivitiesScope): Promise<number> {
  const em = container.resolve<EntityManager>('em').fork()
  const existing = await em.find(AttendancePolicy, { ...scope, deletedAt: null })
  const present = new Set(
    existing.map((row) =>
      policyKey({ scope: row.scope, groupId: row.groupId ?? null, activityType: row.activityType ?? null }),
    ),
  )
  let created = 0
  for (const policy of DEFAULT_POLICIES) {
    if (present.has(policyKey(policy))) continue
    em.persist(
      em.create(AttendancePolicy, {
        ...scope,
        scope: policy.scope,
        groupId: policy.groupId,
        activityType: policy.activityType,
        minorDeclarationMode: policy.minorDeclarationMode,
        confirmTimeoutHours: policy.confirmTimeoutHours,
        defaultAfterTimeout: policy.defaultAfterTimeout,
      }),
    )
    created += 1
  }
  if (created > 0) await em.flush()
  return created
}

/** Everything `seedDefaults` does for one club: the two schedules and the default policies. */
export async function setUpClubActivities(container: AwilixContainer, scope: ActivitiesScope): Promise<void> {
  await registerGenerateSchedule(container, scope)
  await registerExpireSchedule(container, scope)
  await seedDefaultPolicies(container, scope)
}
