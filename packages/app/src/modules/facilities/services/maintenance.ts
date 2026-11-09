// The reads and the reminder job of the maintenance tasks (facilities spec glossary *Maintenance task*, REQ-022, DD-36,
// DD-46; the `facilities:maintenance-reminders` row of *Events, Jobs*; #128):
// - `facilities.maintainerScopeProvider`: the places a person maintains, read by `people` for the `maintenance_planner`
//   grant and the derived role `vereino_maintenance_planner`;
// - the hours of use of a place family since an instant, computed from the occupancy data — `done` sessions, internal
//   bookings whose end has passed, `done` rentals — never stored, so a corrected or cancelled entry changes the count;
// - the daily reminders: 14 days and 1 day before a due date, and once the usage threshold is reached, in-app to the
//   place's maintainers and the club administrators through the foundation `dispatch`, whose idempotency key is the
//   "sent" marker (DD-46).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { calendarDateInZone, type Recipient } from '@vereino/core'
import type { DispatchService } from '@/modules/foundation'
import type { MaintainerScopeProvider } from '../../people/services/maintainer-scope'
import { InternalBooking, MaintenanceTask, PlaceMaintainer, Rental } from '../data/entities'
import { MAINTENANCE_DUE_TEMPLATE } from '../emails/templates'
import {
  dateReminderKey,
  dateReminderStage,
  usageReminderKey,
  usedHours,
  type DateReminderStage,
} from '../lib/maintenance'
import {
  clubAdminPersonIds,
  clubTimeZone,
  doneSessionTimes,
  findPlaces,
  userIdsOf,
  type FacilitiesScope,
} from './directory'
import { placeFamilyIds } from './occupancy'

const logger = createLogger('facilities').child({ component: 'maintenance-reminders' })

/** DI token `people` reads with `hasRegistration` (`people/services/maintainer-scope.ts`). */
export const FACILITIES_MAINTAINER_SCOPE_PROVIDER = 'facilities.maintainerScopeProvider' as const

const FOUNDATION_DISPATCH = 'foundationDispatch'

/** The places a person maintains, by `facilities_place_maintainers`, read with the caller's EntityManager. */
export async function maintainedPlaceIds(
  em: EntityManager,
  subject: { tenantId: string; organizationId: string; personId: string },
): Promise<string[]> {
  const rows = await em.find(
    PlaceMaintainer,
    {
      tenantId: subject.tenantId,
      organizationId: subject.organizationId,
      personId: subject.personId,
      deletedAt: null,
    },
    { fields: ['id', 'placeId'] },
  )
  return [...new Set(rows.map((row) => row.placeId))].sort()
}

export function createMaintainerScopeProvider(): MaintainerScopeProvider {
  return { placeIdsFor: (em, subject) => maintainedPlaceIds(em, subject) }
}

/**
 * The hours the place family of `placeId` was occupied from `since` to `until` (glossary *Maintenance task*
 * `usage_hours`): `done` sessions, confirmed internal bookings that have ended, `done` rentals; overlapping entries
 * count once.
 */
export async function usageHoursSince(
  container: AwilixContainer,
  em: EntityManager,
  scope: FacilitiesScope,
  placeId: string,
  since: Date,
  until: Date,
): Promise<number> {
  if (until <= since) return 0
  const placeIds = await placeFamilyIds(container, scope, placeId, em)
  const window = { start: since, end: until }
  const overlap = {
    ...scope,
    deletedAt: null,
    placeId: { $in: placeIds },
    startsAt: { $lt: until },
    endsAt: { $gt: since },
  }
  const sessions = await doneSessionTimes(container, scope, placeIds, window, em)
  const bookings = await em.find(
    InternalBooking,
    { ...overlap, status: 'confirmed', endsAt: { $gt: since, $lte: until } },
    { fields: ['id', 'startsAt', 'endsAt'] },
  )
  const rentals = await em.find(Rental, { ...overlap, status: 'done' }, { fields: ['id', 'startsAt', 'endsAt'] })
  return usedHours(
    [
      ...sessions,
      ...bookings.map((row) => ({ start: row.startsAt, end: row.endsAt })),
      ...rentals.map((row) => ({ start: row.startsAt, end: row.endsAt })),
    ],
    since,
    until,
  )
}

export type MaintenanceReminderCounts = { sent: number; skipped: number; failed: number }

type Reminder = { task: MaintenanceTask; key: string; stage: DateReminderStage | 'usage'; hours: number | null }

/**
 * The people a reminder of a task goes to: the maintainers of its place and the club administrators on `today`, those
 * with an account, as in-app recipients.
 */
async function reminderRecipients(
  container: AwilixContainer,
  em: EntityManager,
  scope: FacilitiesScope,
  placeId: string,
  today: string,
): Promise<Recipient[]> {
  const maintainers = await em.find(
    PlaceMaintainer,
    { ...scope, placeId, deletedAt: null },
    { fields: ['id', 'personId'] },
  )
  const admins = await clubAdminPersonIds(container, scope, today, em)
  const personIds = [...new Set([...maintainers.map((row) => row.personId), ...admins])]
  const users = await userIdsOf(container, scope, personIds, em)
  return personIds.flatMap((personId) => {
    const userId = users.get(personId)
    return userId
      ? [{ personId, userId, email: null, locale: 'en', reasons: ['direct' as const], channels: ['in_app' as const] }]
      : []
  })
}

/** Enqueues one reminder and publishes it; false when its key was used before (sent already). */
async function sendReminder(
  container: AwilixContainer,
  scope: FacilitiesScope,
  reminder: Reminder,
  placeName: string,
  recipients: readonly Recipient[],
): Promise<boolean> {
  const dispatch = container.resolve<DispatchService>(FOUNDATION_DISPATCH)
  const em = container.resolve<EntityManager>('em').fork()
  const enqueued = await em.transactional((tx) =>
    dispatch.enqueue(
      tx,
      {
        template: MAINTENANCE_DUE_TEMPLATE,
        params: {
          taskId: reminder.task.id,
          placeName,
          kind: reminder.task.kind,
          dueDate: reminder.task.dueDate ?? null,
          stage: reminder.stage,
          hours: reminder.hours,
        },
        recipients,
        source: { module: 'facilities', type: 'facilities:maintenance_task', id: reminder.task.id },
        idempotencyKey: reminder.key,
        actor: { userId: null, actingRole: 'system' },
      },
      { ...scope, scope: [{ kind: 'system_job' }], em: tx },
    ),
  )
  if (!enqueued.created) return false
  await dispatch.publish(enqueued.dispatchId, scope)
  return true
}

/**
 * `facilities.maintenance.send_reminders` (the daily `facilities:maintenance-reminders` job; DD-46): for every planned
 * task, the date reminder due on the club's `today` (14 days or 1 day before the due date) and, for a usage task, the
 * reminder once the hours counted since `usage_counted_from` reach the threshold. One dispatch per key, so a rerun
 * sends nothing twice; a failing task is counted and left to the next run.
 */
export async function sendMaintenanceReminders(
  container: AwilixContainer,
  scope: FacilitiesScope,
  now: Date,
): Promise<MaintenanceReminderCounts> {
  const counts: MaintenanceReminderCounts = { sent: 0, skipped: 0, failed: 0 }
  const em = container.resolve<EntityManager>('em').fork()
  const today = calendarDateInZone(now, await clubTimeZone(container, scope))
  const tasks = await em.find(
    MaintenanceTask,
    { ...scope, deletedAt: null, status: 'planned', $or: [{ dueDate: { $ne: null } }, { scheduleType: 'usage_hours' }] },
    { orderBy: { id: 'asc' } },
  )
  const places = await findPlaces(
    container,
    scope,
    [...new Set(tasks.map((task) => task.placeId))],
    em,
  )
  for (const task of tasks) {
    try {
      const reminders: Reminder[] = []
      if (task.dueDate) {
        const stage = dateReminderStage(task.dueDate, today)
        if (stage) reminders.push({ task, stage, hours: null, key: dateReminderKey(task.id, task.dueDate, stage) })
      }
      if (task.scheduleType === 'usage_hours' && task.usageCountedFrom && task.usageHoursThreshold) {
        const hours = await usageHoursSince(container, em, scope, task.placeId, task.usageCountedFrom, now)
        if (hours >= task.usageHoursThreshold) {
          reminders.push({
            task,
            stage: 'usage',
            hours: Math.floor(hours),
            key: usageReminderKey(task.id, task.usageCountedFrom),
          })
        }
      }
      if (reminders.length === 0) continue
      const recipients = await reminderRecipients(container, em, scope, task.placeId, today)
      for (const reminder of reminders) {
        if (await sendReminder(container, scope, reminder, places.get(task.placeId)?.name ?? '', recipients)) {
          counts.sent += 1
        } else counts.skipped += 1
      }
    } catch (error: unknown) {
      counts.failed += 1
      logger.warn('Maintenance reminder failed for one task; the next run retries it', {
        ...scope,
        taskId: task.id,
        err: error,
      })
    }
  }
  return counts
}
