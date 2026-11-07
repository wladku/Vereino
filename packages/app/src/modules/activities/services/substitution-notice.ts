// The in-app notices of a substitution (club spec glossary *Substitution*, *Events* rows `coach_unassigned` /
// `coach_changed`; README flow F-03 path A; E06-S13 #95): after the assigned coach reports an absence, the coordinators
// of the session's section (the club administrators when it has none) get `activities.coach_needed`, linking to the
// session on B-15; after a coach is assigned, that coach gets `activities.substitution_assigned`, linking to the
// session as the coach. Never the user who acted; nothing when the session changed again meanwhile. Grouped by the
// substitution entry, so a retried delivery refreshes the same notification. The reason is never put in a notice.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { buildBatchNotificationFromType } from '@open-mercato/core/modules/notifications/lib/notificationBuilder'
import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { Activity, Occurrence } from '../data/entities'
import { wallTimeInZone } from '../lib/activities-rules'
import notificationTypes from '../notifications'
import { clubClock, coachNeededHandlerIds, findPersons, findUserIds, type ActivitiesScope } from './directory'

export type SubstitutionEvent = {
  occurrenceId: string
  substitutionEntryId: string
  previousCoachPersonId: string | null
  newCoachPersonId: string | null
  actorUserId: string | null
}

async function send(
  container: AwilixContainer,
  scope: ActivitiesScope,
  occurrence: Occurrence,
  event: SubstitutionEvent,
  notice: { type: string; personIds: readonly string[]; linkHref: string; coachPersonId: string | null },
): Promise<string[]> {
  const type = notificationTypes.find((entry) => entry.type === notice.type)
  const userIds = await findUserIds(container, scope, notice.personIds)
  const recipientUserIds = [...new Set(userIds.values())].filter((userId) => userId !== event.actorUserId).sort()
  if (!type || recipientUserIds.length === 0) return []
  const em = container.resolve<EntityManager>('em').fork()
  const activity = await em.findOne(Activity, { id: occurrence.activityId, ...scope }, { fields: ['id', 'name'] })
  const { timeZone } = await clubClock(container, scope)
  const coach = notice.coachPersonId
    ? (await findPersons(container, scope, [notice.coachPersonId])).get(notice.coachPersonId)
    : undefined
  const variables = {
    activity: activity?.name ?? '',
    date: occurrence.occurrenceDate,
    time: wallTimeInZone(occurrence.startAt, timeZone).slice(0, 5),
    coach: coach ? `${coach.firstName} ${coach.lastName}` : '',
  }
  await resolveNotificationService(container).createBatch(
    buildBatchNotificationFromType(type, {
      recipientUserIds,
      sourceEntityType: 'activities:occurrence',
      sourceEntityId: occurrence.id,
      linkHref: notice.linkHref,
      groupKey: `${type.type}:${event.substitutionEntryId}`,
      titleVariables: variables,
      bodyVariables: variables,
    }),
    scope,
  )
  return recipientUserIds
}

async function liveOccurrence(
  container: AwilixContainer,
  scope: ActivitiesScope,
  id: string,
): Promise<Occurrence | null> {
  const em = container.resolve<EntityManager>('em').fork()
  return em.findOne(Occurrence, { id, ...scope, deletedAt: null })
}

/** Tells the section's coordinators that a planned session lost its coach; returns the notified users. */
export async function notifyCoachNeeded(
  container: AwilixContainer,
  scope: ActivitiesScope,
  event: SubstitutionEvent,
): Promise<string[]> {
  const occurrence = await liveOccurrence(container, scope, event.occurrenceId)
  // Someone took the session over already, or it is no longer planned: nothing is needed any more.
  if (!occurrence || occurrence.status !== 'planned' || occurrence.coachPersonId) return []
  const { today } = await clubClock(container, scope)
  return send(container, scope, occurrence, event, {
    type: 'activities.coach_needed',
    personIds: await coachNeededHandlerIds(container, scope, occurrence.sectionId, today),
    linkHref: `/backend/activities/occurrences/${occurrence.id}`,
    coachPersonId: event.previousCoachPersonId,
  })
}

/** Tells the assigned coach that the session is theirs; returns the notified users. */
export async function notifySubstitutionAssigned(
  container: AwilixContainer,
  scope: ActivitiesScope,
  event: SubstitutionEvent,
): Promise<string[]> {
  const occurrence = await liveOccurrence(container, scope, event.occurrenceId)
  if (!occurrence || occurrence.status !== 'planned' || !event.newCoachPersonId) return []
  if (occurrence.coachPersonId !== event.newCoachPersonId) return []
  return send(container, scope, occurrence, event, {
    type: 'activities.substitution_assigned',
    personIds: [event.newCoachPersonId],
    linkHref: `/club/occurrences/${occurrence.id}?as=coach`,
    coachPersonId: event.previousCoachPersonId,
  })
}
