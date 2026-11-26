// The single-event write shared by `activities.events.create` and `activities.club_event_parts.create` (club spec
// glossary *One-off event*, REQ-027; groups and activities parity spec REQ-A07, REQ-A08; facilities parity spec
// REQ-R19; club events spec DD-T01, DD-T07): the event type, the times, the deadline, the opening hours of a club
// place, the schedule lock and the conflict check, then the one-off activity and its one session. The caller has
// authorized the write and checked the references. No `registerCommand` here, so the commands share it freely.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { activitiesErrors } from '../api/errors'
import { Activity, Occurrence } from '../data/entities'
import { lockSchedule } from '../data/queries'
import { EVENT_TYPES, localDateTime, type ActivityType } from '../lib/activities-rules'
import { confirmByAt } from '../lib/confirm-by'
import { eventOutsideOpeningHours, openingLine } from '../lib/opening-hours'
import type { TypedVenue } from '../lib/venue'
import { clubClock, placeOpeningHours, type ActivitiesScope } from '../services/directory'
import { assertNoConflicts, findConflicts } from '../services/schedule'
import type { GroupDirectoryEntry } from '../../groups/services/group-directory'

export type OneOffEventWrite = {
  id: string
  occurrenceId: string
  group: GroupDirectoryEntry
  name: string
  type: ActivityType
  placeId: string | null
  venue: TypedVenue | null
  coachPersonId: string | null
  startAt: Date
  endAt: Date
  gatheringMinutesBefore: number | null
  confirmByMinutesBefore: number | null
  description: string | null
  opponentExternalTeamId: string | null
  invitedExternalTeamIds: readonly string[]
  isAway: boolean
  /** The club event the activity is a part of (DD-T01); null for a single event. */
  clubEventId: string | null
  /**
   * DD-T07: a part at an external place checks only the coach — no place tree, no opening hours, no facility
   * occupancy. Every other write keeps the full check (Q-T11).
   */
  coachOnly: boolean
}

/** Validates and writes a one-off activity with its one session; returns the activity (persisted, not flushed). */
export async function writeOneOffEvent(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: ActivitiesScope,
  input: OneOffEventWrite,
): Promise<Activity> {
  // `match` / `sparring` on a class group already answered 422 `activity_type_requires_team` in `assertReferences`.
  if (!EVENT_TYPES.includes(input.type)) await activitiesErrors.throw('event_type_not_allowed', { type: input.type })
  const { startAt, endAt, placeId } = input
  if (endAt.getTime() <= startAt.getTime()) await activitiesErrors.throw('activity_times_inverted')
  // REQ-A07: the event's own deadline must still be ahead (a series default is not checked: it is an offset).
  const confirmBy = confirmByAt(startAt, input.confirmByMinutesBefore)
  if (confirmBy && confirmBy.getTime() < Date.now()) await activitiesErrors.throw('occurrence_confirm_by_in_past')
  const { timeZone } = await clubClock(ctx.container, scope, undefined, em)
  const start = localDateTime(startAt, timeZone)
  const end = localDateTime(endAt, timeZone)
  // REQ-R19 (DD-R15): a club place's opening hours bound the event; a typed venue has no place and no hours.
  if (placeId && !input.coachOnly) {
    const hours = (await placeOpeningHours(ctx.container, scope, [placeId], em)).get(placeId) ?? null
    const opening = eventOutsideOpeningHours(hours, startAt, endAt, timeZone)
    if (opening) {
      await activitiesErrors.throw('event_place_closed', { field: 'startsAt', opening, hours: openingLine(opening) })
    }
  }
  await lockSchedule(em, scope.organizationId)
  await assertNoConflicts(
    await findConflicts(
      ctx.container,
      em,
      scope,
      {
        candidates: [{ key: input.occurrenceId, startAt, endAt }],
        placeId: input.coachOnly ? null : placeId,
        coachPersonId: input.coachPersonId,
      },
      'save',
    ),
  )
  const row = em.create(Activity, {
    id: input.id,
    ...scope,
    sectionId: input.group.sectionId,
    groupId: input.group.id,
    name: input.name,
    type: input.type,
    defaultPlaceId: placeId,
    venueName: input.venue?.name ?? null,
    venueAddress: input.venue?.address ?? null,
    defaultCoachPersonId: input.coachPersonId,
    opponentExternalTeamId: input.opponentExternalTeamId,
    invitedExternalTeamIds: [...new Set(input.invitedExternalTeamIds)],
    recurrenceRule: null,
    startsOn: start.date,
    endsOn: end.date,
    defaultStartTime: start.time,
    defaultEndTime: end.time,
    gatheringMinutesBefore: input.gatheringMinutesBefore,
    confirmByMinutesBefore: input.confirmByMinutesBefore,
    description: input.description,
    isActive: true,
    isAway: input.isAway,
    clubEventId: input.clubEventId,
  })
  em.persist(row)
  em.persist(
    em.create(Occurrence, {
      id: input.occurrenceId,
      ...scope,
      activityId: input.id,
      groupId: input.group.id,
      sectionId: input.group.sectionId,
      occurrenceDate: start.date,
      startAt,
      endAt,
      placeId,
      venueName: input.venue?.name ?? null,
      venueAddress: input.venue?.address ?? null,
      coachPersonId: input.coachPersonId,
      gatheringMinutesBefore: input.gatheringMinutesBefore,
      confirmByMinutesBefore: input.confirmByMinutesBefore,
    }),
  )
  return row
}
