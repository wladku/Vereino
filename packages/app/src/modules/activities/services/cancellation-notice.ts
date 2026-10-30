// The in-app cancellation notice (club spec glossary *Session cancellation*; foundation II DD-G12; #31): the people a
// cancelled session concerns — participants with an account, guardians of minor participants, the coaches — get the
// `activities.occurrence_cancelled` notification, grouped by the session id so a retry refreshes it.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { buildBatchNotificationFromType } from '@open-mercato/core/modules/notifications/lib/notificationBuilder'
import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { Activity, Occurrence } from '../data/entities'
import { cancellationPersonIds, cancellationRecipients, wallTimeInZone } from '../lib/activities-rules'
import notificationTypes from '../notifications'
import { activeGuardians, clubTimeZone, findPersons, findUserIds, rosterOn, type ActivitiesScope } from './directory'

/** Sends the notice for a cancelled session; returns the notified users (none when the session is not cancelled). */
export async function notifyOccurrenceCancelled(
  container: AwilixContainer,
  scope: ActivitiesScope,
  event: { occurrenceId: string; actorUserId: string | null },
): Promise<string[]> {
  const em = container.resolve<EntityManager>('em').fork()
  const occurrence = await em.findOne(Occurrence, { id: event.occurrenceId, ...scope, deletedAt: null })
  if (!occurrence || occurrence.status !== 'cancelled') return []
  const activity = await em.findOne(Activity, { id: occurrence.activityId, ...scope }, { fields: ['id', 'name'] })
  const roster = await rosterOn(container, scope, occurrence.groupId, occurrence.occurrenceDate)
  const participantIds = roster.filter((member) => member.role === 'participant').map((member) => member.personId)
  const [persons, guardiansByWard] = await Promise.all([
    findPersons(container, scope, participantIds),
    activeGuardians(container, scope, participantIds, occurrence.occurrenceDate),
  ])
  const audience = {
    roster,
    coachPersonId: occurrence.coachPersonId ?? null,
    birthDates: new Map([...persons.values()].map((person) => [person.id, person.birthDate])),
    guardiansByWard,
    onDate: occurrence.occurrenceDate,
  }
  const userIds = await findUserIds(container, scope, cancellationPersonIds(audience))
  const recipientUserIds = cancellationRecipients({
    ...audience,
    userIds,
    actorUserId: event.actorUserId,
  })
  const type = notificationTypes.find((entry) => entry.type === 'activities.occurrence_cancelled')
  if (!type || recipientUserIds.length === 0) return []
  const timeZone = await clubTimeZone(container, scope)
  const variables = {
    activity: activity?.name ?? '',
    date: occurrence.occurrenceDate,
    time: wallTimeInZone(occurrence.startAt, timeZone).slice(0, 5),
    reason: occurrence.cancelReason ?? '',
  }
  await resolveNotificationService(container).createBatch(
    buildBatchNotificationFromType(type, {
      recipientUserIds,
      sourceEntityType: 'activities:occurrence',
      sourceEntityId: occurrence.id,
      groupKey: `activities.occurrence_cancelled:${occurrence.id}`,
      titleVariables: variables,
      bodyVariables: variables,
    }),
    scope,
  )
  return recipientUserIds
}
