// The in-app notice of a moved session (groups and activities parity spec REQ-A09, D-031 §7; #271): the people a
// cancellation would tell — on the session's new date — get `activities.occurrence_moved` with the old and the new
// time, place and gathering time, never the person who made the change; a coach's change also tells the section's
// coordinators. A restore says the session takes place after all; a series edit sends one notice naming the first
// changed date, the number of changed sessions and the new rule. The group key is the record id plus the version the
// change wrote (DD-A09), so a replayed event refreshes the same notification. The values are written in the club's
// language (as the share text), the sentence around them in the reader's.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { buildBatchNotificationFromType } from '@open-mercato/core/modules/notifications/lib/notificationBuilder'
import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { cancellingRole, type CancellingRole } from '@vereino/core'
import { renderLocalized } from '@/modules/foundation'
import type { ClubCoreSettingsService } from '../../club_core/services/settings'
import { Activity, Occurrence } from '../data/entities'
import {
  cancellationNotifiedCount,
  cancellationPersonIds,
  cancellationRecipients,
  localDateTime,
} from '../lib/activities-rules'
import { gatheringAt } from '../lib/gathering'
import type { SeriesRule, SessionChange } from '../lib/session-change'
import { sessionWhen } from '../lib/share-text'
import notificationTypes from '../notifications'
import { sessionAudience, type CancellationActor } from './cancellation-notice'
import { findPersons, findPlaces, findUserIds, type ActivitiesScope } from './directory'

/** Who changed a session: their user, their person and the role they acted in. */
export type SessionNoticeActor = CancellationActor & { userId: string | null }

/** A session's where and when as a notice names it. */
type Point = { startAt: Date; endAt: Date; placeId: string | null; venueName: string | null; gathering: number | null }

const NOTICE = 'activities.notifications.occurrenceMoved'

/** The notice body that names who moved the session, per acting role. */
const BODY_KEY_BY_ROLE: Readonly<Record<CancellingRole, string>> = {
  coach: `${NOTICE}.bodyByCoach`,
  coordinator: `${NOTICE}.bodyByCoordinator`,
  club_admin: `${NOTICE}.bodyByAdmin`,
}

async function clubSettings(container: AwilixContainer, scope: ActivitiesScope) {
  const settings = await container.resolve<ClubCoreSettingsService>('clubCoreSettings').get(scope)
  return { timeZone: settings.values.timezone, locale: settings.values.defaultLocale }
}

async function placeNames(container: AwilixContainer, scope: ActivitiesScope, ids: Array<string | null>) {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))]
  const places = await findPlaces(container, scope, wanted)
  return new Map(wanted.map((id) => [id, places.get(id)?.name ?? '']))
}

/** "wt., 18 lis 17:00 (zbiórka 16:30), Boisko piłkarskie" in the club's language and zone. */
function pointLabels(
  points: Point[],
  names: ReadonlyMap<string, string>,
  club: { timeZone: string; locale: string },
): Promise<string[]> {
  return renderLocalized(club.locale, (t, locale) =>
    points.map((point) => {
      const when = sessionWhen(
        { startAt: point.startAt, endAt: point.endAt, gatheringAt: gatheringAt(point.startAt, point.gathering) },
        locale,
        club.timeZone,
      )
      const values = {
        date: when.date,
        time: when.startTime,
        gathering: when.gatheringTime ?? '',
        place: point.placeId ? (names.get(point.placeId) ?? '') : (point.venueName ?? ''),
      }
      return when.gatheringTime
        ? t(`${NOTICE}.pointWithGathering`, '{date} {time} (gathering {gathering}), {place}', values)
        : t(`${NOTICE}.point`, '{date} {time}, {place}', values)
    }),
  )
}

/** The users a session notice reaches: the session audience on `onDate` with an account, without the actor. */
async function noticeRecipients(
  container: AwilixContainer,
  scope: ActivitiesScope,
  occurrence: Occurrence,
  actor: SessionNoticeActor,
  onDate: string,
): Promise<string[]> {
  const audience = await sessionAudience(container, scope, occurrence, actor, onDate)
  const userIds = await findUserIds(container, scope, cancellationPersonIds(audience))
  return cancellationRecipients({ ...audience, userIds, actorUserId: actor.userId })
}

async function actorName(container: AwilixContainer, scope: ActivitiesScope, personId: string | null) {
  if (!personId) return null
  const person = (await findPersons(container, scope, [personId])).get(personId)
  return person ? `${person.firstName} ${person.lastName}` : null
}

async function send(
  container: AwilixContainer,
  scope: ActivitiesScope,
  input: {
    recipientUserIds: string[]
    sourceEntityId: string
    groupKey: string
    titleKey: string
    bodyKey: string
    variables: Record<string, string>
  },
): Promise<void> {
  const type = notificationTypes.find((entry) => entry.type === 'activities.occurrence_moved')
  if (!type) return
  const notification = buildBatchNotificationFromType(type, {
    recipientUserIds: input.recipientUserIds,
    sourceEntityType: 'activities:occurrence',
    sourceEntityId: input.sourceEntityId,
    groupKey: input.groupKey,
    titleVariables: input.variables,
    bodyVariables: input.variables,
  })
  await resolveNotificationService(container).createBatch(
    { ...notification, titleKey: input.titleKey, title: input.titleKey, bodyKey: input.bodyKey, body: input.bodyKey },
    scope,
  )
}

/**
 * Sends the notice of a moved or restored session; returns the notified users (none when the session is no longer
 * planned — a cancellation meanwhile — or nobody with an account is told).
 */
export async function notifySessionMoved(
  container: AwilixContainer,
  scope: ActivitiesScope,
  event: { occurrenceId: string; change: SessionChange; actor: SessionNoticeActor; updatedAt: string },
): Promise<string[]> {
  const em = container.resolve<EntityManager>('em').fork()
  const occurrence = await em.findOne(Occurrence, { id: event.occurrenceId, ...scope, deletedAt: null })
  if (!occurrence || occurrence.status !== 'planned') return []
  const club = await clubSettings(container, scope)
  const onDate = localDateTime(occurrence.startAt, club.timeZone).date
  const recipientUserIds = await noticeRecipients(container, scope, occurrence, event.actor, onDate)
  if (recipientUserIds.length === 0) return []
  const activity = await em.findOne(Activity, { id: occurrence.activityId, ...scope }, { fields: ['id', 'name'] })
  const before = event.change.before
  const names = await placeNames(container, scope, [before.placeId, occurrence.placeId])
  const [from, to] = await pointLabels(
    [
      {
        startAt: new Date(before.startAt),
        endAt: new Date(before.endAt),
        placeId: before.placeId,
        venueName: before.venueName,
        gathering: before.gatheringMinutesBefore,
      },
      {
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
        placeId: occurrence.placeId,
        venueName: occurrence.venueName ?? null,
        gathering: occurrence.gatheringMinutesBefore ?? null,
      },
    ],
    names,
    club,
  )
  const restored = event.change.kinds.includes('restored')
  const name = await actorName(container, scope, event.actor.personId)
  const role = cancellingRole(event.actor.actingRole)
  await send(container, scope, {
    recipientUserIds,
    sourceEntityId: occurrence.id,
    groupKey: `activities.occurrence_moved:${occurrence.id}:${event.updatedAt}`,
    titleKey: restored ? `${NOTICE}.restoredTitle` : `${NOTICE}.title`,
    bodyKey: restored ? `${NOTICE}.restoredBody` : name && role ? BODY_KEY_BY_ROLE[role] : `${NOTICE}.body`,
    variables: { activity: activity?.name ?? '', date: onDate, from: from ?? '', to: to ?? '', name: name ?? '' },
  })
  return recipientUserIds
}

/** "17:00–18:30 (gathering 16:30), Boisko piłkarskie": a series rule in the club's language. */
function ruleLabels(rules: SeriesRule[], names: ReadonlyMap<string, string>, locale: string): Promise<string[]> {
  return renderLocalized(locale, (t) =>
    rules.map((rule) => {
      const values = {
        time: `${rule.startTime.slice(0, 5)}–${rule.endTime.slice(0, 5)}`,
        gathering: String(rule.gatheringMinutesBefore ?? ''),
        place: rule.placeId ? (names.get(rule.placeId) ?? '') : (rule.venueName ?? ''),
      }
      return rule.gatheringMinutesBefore
        ? t(`${NOTICE}.ruleWithGathering`, '{time} (gathering {gathering} min before), {place}', values)
        : t(`${NOTICE}.rule`, '{time}, {place}', values)
    }),
  )
}

/**
 * Sends the one notice of a series edit (DD-A08) to the audience of its first changed session; returns the notified
 * users.
 */
export async function notifyScheduleChanged(
  container: AwilixContainer,
  scope: ActivitiesScope,
  event: {
    activityId: string
    scheduleChange: { from: string; movedCount: number; before: SeriesRule; after: SeriesRule }
    actor: SessionNoticeActor
    updatedAt: string
  },
): Promise<string[]> {
  const em = container.resolve<EntityManager>('em').fork()
  const activity = await em.findOne(Activity, { id: event.activityId, ...scope, deletedAt: null })
  if (!activity) return []
  const first = await em.findOne(Occurrence, {
    ...scope,
    activityId: activity.id,
    occurrenceDate: event.scheduleChange.from,
    deletedAt: null,
  })
  if (!first) return []
  const recipientUserIds = await noticeRecipients(container, scope, first, event.actor, first.occurrenceDate)
  if (recipientUserIds.length === 0) return []
  const club = await clubSettings(container, scope)
  const { before, after } = event.scheduleChange
  const names = await placeNames(container, scope, [before.placeId, after.placeId])
  const [beforeLabel, afterLabel] = await ruleLabels([before, after], names, club.locale)
  await send(container, scope, {
    recipientUserIds,
    sourceEntityId: first.id,
    groupKey: `activities.occurrence_moved:${activity.id}:${event.updatedAt}`,
    titleKey: `${NOTICE}.seriesTitle`,
    bodyKey: `${NOTICE}.seriesBody`,
    variables: {
      activity: activity.name,
      from: event.scheduleChange.from,
      count: String(event.scheduleChange.movedCount),
      before: beforeLabel ?? '',
      after: afterLabel ?? '',
      name: (await actorName(container, scope, event.actor.personId)) ?? '',
    },
  })
  return recipientUserIds
}

/**
 * How many people a move of a session tells (the move response's `notified`, J-A03 step 3): the session audience on
 * its new date, in the app or by e-mail, without the actor. 0 when the session is not planned.
 */
export async function countMoveNotified(
  container: AwilixContainer,
  scope: ActivitiesScope,
  occurrenceId: string,
  actor: CancellationActor,
): Promise<number> {
  const em = container.resolve<EntityManager>('em').fork()
  const occurrence = await em.findOne(Occurrence, { id: occurrenceId, ...scope, deletedAt: null })
  if (!occurrence || occurrence.status !== 'planned') return 0
  const club = await clubSettings(container, scope)
  const onDate = localDateTime(occurrence.startAt, club.timeZone).date
  return cancellationNotifiedCount(await sessionAudience(container, scope, occurrence, actor, onDate), actor.personId)
}
