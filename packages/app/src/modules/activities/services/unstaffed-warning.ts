// The warning before an unstaffed session (parity spec REQ-A14, Q-A19, J-A04 step 3; E10-S07 #272): two hours before
// a planned session that still has no coach, the coordinators of its section (the club administrators when it has
// none) and the coaches and assistants of its group get `activities.session_without_coach` in the app — the group's
// leaders link to the session page, where they can take it over; the coordinators to the panel record, where they
// assign a substitute.
//
// Once per session and recipient: the notice's group key is the session id (the "dispatch key"), and a recipient who
// already has a notice with that key — unread, read or dismissed — gets none again, so a run every 15 minutes never
// repeats it and a read warning never comes back. A transaction-level advisory lock on the session serializes two
// runs at once (the platform's own lock covers the write of each recipient's notice).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { Notification } from '@open-mercato/core/modules/notifications/data/entities'
import { buildBatchNotificationFromType } from '@open-mercato/core/modules/notifications/lib/notificationBuilder'
import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { Activity, Occurrence } from '../data/entities'
import { wallTimeInZone } from '../lib/activities-rules'
import { unstaffedWarningDue, unstaffedWarningRecipients, unstaffedWarningWindow } from '../lib/substitutions'
import notificationTypes from '../notifications'
import { clubClock, coachNeededHandlerIds, findUserIds, rosterOn, type ActivitiesScope } from './directory'

export const SESSION_WITHOUT_COACH_TYPE = 'activities.session_without_coach'

/** The group key of the warning: one per session. */
export function unstaffedWarningKey(occurrenceId: string): string {
  return `${SESSION_WITHOUT_COACH_TYPE}:${occurrenceId}`
}

/** The sessions a run warns about: planned, without a coach, starting within the next two hours. */
export async function unstaffedSessions(em: EntityManager, scope: ActivitiesScope, now: Date): Promise<Occurrence[]> {
  const { after, until } = unstaffedWarningWindow(now)
  return em.find(
    Occurrence,
    { ...scope, deletedAt: null, status: 'planned', coachPersonId: null, startAt: { $gt: after, $lte: until } },
    { orderBy: { startAt: 'asc', id: 'asc' } },
  )
}

/**
 * Warns about one session; returns the users told now (empty when everyone was told before, when the session got a
 * coach meanwhile or when nobody has an account).
 */
export async function warnUnstaffedSession(
  container: AwilixContainer,
  scope: ActivitiesScope,
  occurrenceId: string,
  now: Date,
): Promise<string[]> {
  const type = notificationTypes.find((entry) => entry.type === SESSION_WITHOUT_COACH_TYPE)
  if (!type) throw new Error('[internal] the notification type is not declared: ' + SESSION_WITHOUT_COACH_TYPE)
  const em = container.resolve<EntityManager>('em').fork()
  return em.transactional(async (tx) => {
    const groupKey = unstaffedWarningKey(occurrenceId)
    await tx.execute(`select pg_advisory_xact_lock(hashtext('vereino.unstaffed-warning:' || ?))`, [occurrenceId])
    // Re-read under the lock: someone may have taken the session over since the run listed it.
    const occurrence = await tx.findOne(Occurrence, { id: occurrenceId, ...scope, deletedAt: null })
    if (!occurrence || !unstaffedWarningDue(occurrence, now)) return []
    const { timeZone, today } = await clubClock(container, scope, now, tx)
    const [coordinatorIds, roster] = await Promise.all([
      coachNeededHandlerIds(container, scope, occurrence.sectionId, today, tx),
      rosterOn(container, scope, occurrence.groupId, occurrence.occurrenceDate, tx),
    ])
    const leaderIds = new Set(unstaffedWarningRecipients([], roster))
    const personIds = unstaffedWarningRecipients(coordinatorIds, roster)
    const userIds = await findUserIds(container, scope, personIds, tx)
    const told = await tx.find(
      Notification,
      {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        type: SESSION_WITHOUT_COACH_TYPE,
        groupKey,
        recipientUserId: { $in: [...new Set(userIds.values())] },
      },
      { fields: ['id', 'recipientUserId'] },
    )
    const toldUserIds = new Set(told.map((row) => row.recipientUserId))
    // A coordinator who also leads the group gets the session page, where they can take the session over.
    const byLink = new Map<string, Set<string>>()
    for (const personId of personIds) {
      const userId = userIds.get(personId)
      if (!userId || toldUserIds.has(userId)) continue
      const linkHref = leaderIds.has(personId)
        ? `/club/occurrences/${occurrence.id}?as=coach`
        : `/backend/activities/occurrences/${occurrence.id}`
      const users = byLink.get(linkHref) ?? new Set<string>()
      users.add(userId)
      byLink.set(linkHref, users)
    }
    if (byLink.size === 0) return []
    const activity = await tx.findOne(Activity, { id: occurrence.activityId, ...scope }, { fields: ['id', 'name'] })
    const variables = {
      activity: activity?.name ?? '',
      date: occurrence.occurrenceDate,
      time: wallTimeInZone(occurrence.startAt, timeZone).slice(0, 5),
    }
    const service = resolveNotificationService(container)
    const notified: string[] = []
    for (const [linkHref, users] of byLink) {
      const recipientUserIds = [...users].sort()
      await service.createBatch(
        buildBatchNotificationFromType(type, {
          recipientUserIds,
          sourceEntityType: 'activities:occurrence',
          sourceEntityId: occurrence.id,
          linkHref,
          groupKey,
          titleVariables: variables,
          bodyVariables: variables,
        }),
        scope,
      )
      notified.push(...recipientUserIds)
    }
    return notified.sort()
  })
}
