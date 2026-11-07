// The in-app cancellation notice (club spec glossary *Session cancellation*; foundation II DD-G12; #31): the people a
// cancelled session concerns — participants with an account, guardians of minor participants, the coaches — get the
// `activities.occurrence_cancelled` notification, grouped by the session id so a retry refreshes it. A coach's
// cancellation also tells the section's coordinators, and the notice names who cancelled and in which role (#139).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { buildBatchNotificationFromType } from '@open-mercato/core/modules/notifications/lib/notificationBuilder'
import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { Activity, Occurrence } from '../data/entities'
import { cancellationCoordinatorIds, cancellingRole, type CancellingRole } from '@vereino/core'
import {
  cancellationNotifiedCount,
  cancellationPersonIds,
  cancellationRecipients,
  wallTimeInZone,
} from '../lib/activities-rules'
import notificationTypes from '../notifications'
import {
  activeGuardians,
  clubTimeZone,
  findPersons,
  findUserIds,
  rosterOn,
  sectionCoordinatorIdsOn,
  type ActivitiesScope,
} from './directory'

/** Who cancelled a session: their person (null for a user linked to no person) and the role they acted in. */
export type CancellationActor = { personId: string | null; actingRole: string | null }

/**
 * The people a session's cancellation concerns, as on its date: the roster, the coach, the minors' guardians and, for
 * a coach's cancellation, the section's coordinators without the canceller.
 */
async function cancellationAudience(
  container: AwilixContainer,
  scope: ActivitiesScope,
  occurrence: Occurrence,
  actor: CancellationActor,
) {
  const roster = await rosterOn(container, scope, occurrence.groupId, occurrence.occurrenceDate)
  const participantIds = roster.filter((member) => member.role === 'participant').map((member) => member.personId)
  const [persons, guardiansByWard, coordinatorIds] = await Promise.all([
    findPersons(container, scope, participantIds),
    activeGuardians(container, scope, participantIds, occurrence.occurrenceDate),
    actor.actingRole === 'coach'
      ? sectionCoordinatorIdsOn(container, scope, occurrence.sectionId, occurrence.occurrenceDate)
      : Promise.resolve([]),
  ])
  return {
    roster,
    coachPersonId: occurrence.coachPersonId ?? null,
    birthDates: new Map([...persons.values()].map((person) => [person.id, person.birthDate])),
    guardiansByWard,
    onDate: occurrence.occurrenceDate,
    coordinatorIds: cancellationCoordinatorIds(actor.actingRole, coordinatorIds, actor.personId),
  }
}

/**
 * How many people the cancellation of a session tells, without the person who cancelled — the number the member
 * page's toast names (E06-S15 #97). 0 when the session is not cancelled.
 */
export async function countCancellationNotified(
  container: AwilixContainer,
  scope: ActivitiesScope,
  occurrenceId: string,
  actor: CancellationActor,
): Promise<number> {
  const em = container.resolve<EntityManager>('em').fork()
  const occurrence = await em.findOne(Occurrence, { id: occurrenceId, ...scope, deletedAt: null })
  if (!occurrence || occurrence.status !== 'cancelled') return 0
  return cancellationNotifiedCount(await cancellationAudience(container, scope, occurrence, actor), actor.personId)
}

/** The notice body that names the canceller, per acting role (`CANCELLING_ROLES`). */
const BODY_KEY_BY_ROLE: Readonly<Record<CancellingRole, string>> = {
  coach: 'activities.notifications.occurrenceCancelled.bodyByCoach',
  coordinator: 'activities.notifications.occurrenceCancelled.bodyByCoordinator',
  club_admin: 'activities.notifications.occurrenceCancelled.bodyByAdmin',
}

/** Sends the notice for a cancelled session; returns the notified users (none when the session is not cancelled). */
export async function notifyOccurrenceCancelled(
  container: AwilixContainer,
  scope: ActivitiesScope,
  event: { occurrenceId: string; actorUserId: string | null; actor: CancellationActor },
): Promise<string[]> {
  const em = container.resolve<EntityManager>('em').fork()
  const occurrence = await em.findOne(Occurrence, { id: event.occurrenceId, ...scope, deletedAt: null })
  if (!occurrence || occurrence.status !== 'cancelled') return []
  const activity = await em.findOne(Activity, { id: occurrence.activityId, ...scope }, { fields: ['id', 'name'] })
  const audience = await cancellationAudience(container, scope, occurrence, event.actor)
  const userIds = await findUserIds(container, scope, cancellationPersonIds(audience))
  const recipientUserIds = cancellationRecipients({
    ...audience,
    userIds,
    actorUserId: event.actorUserId,
  })
  const type = notificationTypes.find((entry) => entry.type === 'activities.occurrence_cancelled')
  if (!type || recipientUserIds.length === 0) return []
  const timeZone = await clubTimeZone(container, scope)
  const actorPersonId = event.actor.personId
  const actor = actorPersonId ? (await findPersons(container, scope, [actorPersonId])).get(actorPersonId) : undefined
  const role = cancellingRole(event.actor.actingRole)
  const variables = {
    activity: activity?.name ?? '',
    date: occurrence.occurrenceDate,
    time: wallTimeInZone(occurrence.startAt, timeZone).slice(0, 5),
    reason: occurrence.cancelReason ?? '',
    name: actor ? `${actor.firstName} ${actor.lastName}` : '',
  }
  const notification = buildBatchNotificationFromType(type, {
    recipientUserIds,
    sourceEntityType: 'activities:occurrence',
    sourceEntityId: occurrence.id,
    groupKey: `activities.occurrence_cancelled:${occurrence.id}`,
    titleVariables: variables,
    bodyVariables: variables,
  })
  // R01: the body names who cancelled and in which role, one sentence per role so the role is translated too; an
  // event without the canceller (older than #139) keeps the type's body.
  const bodyKey = actor && role ? BODY_KEY_BY_ROLE[role] : null
  await resolveNotificationService(container).createBatch(
    bodyKey ? { ...notification, bodyKey, body: bodyKey } : notification,
    scope,
  )
  return recipientUserIds
}
