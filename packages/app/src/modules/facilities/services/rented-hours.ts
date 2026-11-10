// The rented-hours report (facilities spec REQ-038, TEST-053, AC-038; #129): the hours of `done` sessions on the places
// the club rents from their owners (`rented_by_club`) and on their sub-places, per month, group and coach, for a period
// of whole club-zone days `from`–`to`. Places come from `clubCoreDirectory`, sessions and group names from
// `activities.placeSessions`, coach names from `people.personDirectory`; the rules are `lib/rented-hours.ts`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { addDays, zonedInstant, type CalendarDate } from '@vereino/core'
import { rentedHoursReport, type RentedHoursReport } from '../lib/rented-hours'
import { clubTimeZone, doneSessionsForReport, personNames, rentedPlaces, type FacilitiesScope } from './directory'

/** The period has been checked (`reportPeriodProblem`). A `placeId` that names no rented place leaves no rows. */
export async function rentedHours(
  container: AwilixContainer,
  scope: FacilitiesScope,
  query: { placeId?: string; from: CalendarDate; to: CalendarDate },
): Promise<RentedHoursReport> {
  const em = container.resolve<EntityManager>('em').fork()
  const timeZone = await clubTimeZone(container, scope)
  const places = await rentedPlaces(container, scope, em)
  const chosen = query.placeId ? places.filter((place) => place.id === query.placeId) : places
  const window = {
    start: zonedInstant(query.from, '00:00', timeZone),
    end: zonedInstant(addDays(query.to, 1), '00:00', timeZone),
  }
  // One query after the other on the forked EntityManager.
  const sessions = await doneSessionsForReport(
    container,
    scope,
    chosen.flatMap((place) => [place.id, ...place.descendantIds]),
    window,
    em,
  )
  const coachIds = [...new Set(sessions.flatMap((row) => (row.coachPersonId ? [row.coachPersonId] : [])))]
  const coachNames = await personNames(container, scope, coachIds, em)
  const report = rentedHoursReport({ from: query.from, to: query.to, timeZone, places: chosen, sessions, coachNames })
  // The place filter lists every rented place, not only the chosen one.
  return { ...report, places: places.map((place) => ({ id: place.id, name: place.name })) }
}
