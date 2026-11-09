// Setting up a club's `activities` defaults (foundation II P-12, DD-G07): the daily `activities:generate-occurrences`
// schedule at 03:00 in the club's time zone, the 15-minute `activities:expire-guardian-confirmations` schedule and the
// daily `activities:send-declaration-reminders` schedule at 18:00 in the club's time zone (club spec *Events, Jobs*
// rows; REQ-017), plus the default declaration policies (#32). Idempotent (an upsert on the stable id, a
// find-or-create of the policies); used by `setup.ts` `seedDefaults` and re-run when the club's time zone changes.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { registerModuleSchedule } from '@/modules/foundation'
import { AttendancePolicy } from '../data/entities'
import { DECLARATION_REMINDERS_CRON } from '../lib/declaration-links'
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

/** Daily at 18:00 in the club's time zone: the personal links for tomorrow's undeclared sessions (REQ-017). */
export async function registerRemindersSchedule(container: AwilixContainer, scope: ActivitiesScope): Promise<boolean> {
  return registerModuleSchedule(container, {
    module: 'activities',
    name: 'send-declaration-reminders',
    schedule: { cron: DECLARATION_REMINDERS_CRON, timezone: await clubTimeZone(container, scope) },
    scope,
    description: 'E-mail a personal declaration link for the undeclared sessions of the next day.',
  })
}

/**
 * Seeds the default declaration policies (club spec *Declaration policy* defaults, D-006; `lib/policy.ts`
 * `DEFAULT_POLICIES`) for a club that has none of them yet — one row per scope key, never overwriting a club's own
 * choice; a second run adds nothing.
 */
export async function seedDefaultPolicies(container: AwilixContainer, scope: ActivitiesScope): Promise<number> {
  const em = container.resolve<EntityManager>('em').fork()
  // A soft-deleted default stays deleted: the club removed it on purpose, and a rerun of setup must not bring it back.
  const existing = await em.find(AttendancePolicy, { ...scope })
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

/** Which schedules were registered (false: the registration failed and was logged) and how many policies were added. */
export type ClubActivitiesSetUp = {
  schedules: { generateOccurrences: boolean; expireGuardianConfirmations: boolean; sendDeclarationReminders: boolean }
  policiesCreated: number
}

/**
 * Everything `seedDefaults` does for one club: the three schedules and the default policies. Idempotent, so the
 * `activities set-up-club` command re-runs it for a club set up before a schedule existed (#192: the reminders).
 */
export async function setUpClubActivities(
  container: AwilixContainer,
  scope: ActivitiesScope,
): Promise<ClubActivitiesSetUp> {
  const generateOccurrences = await registerGenerateSchedule(container, scope)
  const expireGuardianConfirmations = await registerExpireSchedule(container, scope)
  const sendDeclarationReminders = await registerRemindersSchedule(container, scope)
  const policiesCreated = await seedDefaultPolicies(container, scope)
  return {
    schedules: { generateOccurrences, expireGuardianConfirmations, sendDeclarationReminders },
    policiesCreated,
  }
}
