// The owner (municipality) report of a facility for a period (facilities spec REQ-015, TEST-025, AC-015; README B-28,
// flow F-12; #127). The facility is the chosen place and its sub-places; the period runs over whole club-zone days
// `from`–`to`. Figures: the scheduled hours of each zone (the zone rules of those places), the club time — `planned`
// and `done` sessions and confirmed internal bookings, clipped to the period and split by the zone they fell in —, the
// rentals that start in the period and were billable (count, value, the table), the payments to the owner's account,
// the incidents that occurred and the maintenance tasks done in the period. The report names the owner institution
// and says where its payments figure comes from (facilities parity spec REQ-R11, #285): a rental with a charge counts
// once its charge, read live through `payments.chargeService.statusOf`, is paid; a rental without one counts from the
// rental register (confirmed and done). Encrypted columns are read with `findWithDecryption`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { addDays, zonedInstant, type CalendarDate } from '@vereino/core'
import { Incident, InternalBooking, MaintenanceTask, Rental, ZoneRule } from '../data/entities'
import { zoneRuleShapeOf } from '../data/shapes'
import { OCCUPYING_BOOKING_STATUSES } from '../lib/internal-bookings'
import {
  REPORTED_RENTAL_STATUSES,
  clubZoneMinutes,
  hoursOf,
  ownerPayments,
  periodDates,
  scheduledZoneMinutes,
  type OwnerReport,
} from '../lib/owner-report'
import { rentalChargeState } from '../lib/rental-record'
import { ZONES, type ZoneRuleShape } from '../lib/zones'
import { chargeService } from './charges'
import {
  clubRequestSettings,
  clubSessionTimes,
  findPlaces,
  placeFamily,
  placePayee,
  type FacilitiesScope,
} from './directory'

/**
 * Null when `placeId` names no place of the club. The period has been checked (`reportPeriodProblem`). `ctx` is the
 * caller's request context, which the charge service reads its scope from.
 */
export async function ownerReport(
  ctx: CommandRuntimeContext,
  scope: FacilitiesScope,
  query: { placeId: string; from: CalendarDate; to: CalendarDate },
): Promise<OwnerReport | null> {
  const container = ctx.container
  const em = container.resolve<EntityManager>('em').fork()
  const place = (await findPlaces(container, scope, [query.placeId], em)).get(query.placeId)
  if (!place) return null
  const family = await placeFamily(container, scope, query.placeId, em)
  const placeIds = [query.placeId, ...(family?.descendantIds ?? [])]
  const { timeZone, currency } = await clubRequestSettings(container, scope)
  const window = {
    start: zonedInstant(query.from, '00:00', timeZone),
    end: zonedInstant(addDays(query.to, 1), '00:00', timeZone),
  }
  const dates = periodDates(query.from, query.to)
  const live = { ...scope, deletedAt: null, placeId: { $in: placeIds } }
  const overlapping = { ...live, startsAt: { $lt: window.end }, endsAt: { $gt: window.start } }
  const inWindow = { $gte: window.start, $lt: window.end }

  // One query after the other on the forked EntityManager.
  const rules = await em.find(ZoneRule, {
    ...live,
    validFrom: { $lte: query.to },
    $or: [{ validTo: null }, { validTo: { $gte: query.from } }],
  })
  const rulesByPlace = new Map<string, ZoneRuleShape[]>()
  for (const row of rules)
    rulesByPlace.set(row.placeId, [...(rulesByPlace.get(row.placeId) ?? []), zoneRuleShapeOf(row)])

  const sessions = await clubSessionTimes(container, scope, placeIds, window, em)
  const bookings = await em.find(
    InternalBooking,
    { ...overlapping, status: { $in: [...OCCUPYING_BOOKING_STATUSES] } },
    { fields: ['id', 'placeId', 'startsAt', 'endsAt'] },
  )
  const rentals = await findWithDecryption(
    em,
    Rental,
    { ...live, startsAt: inWindow, status: { $in: [...REPORTED_RENTAL_STATUSES] } },
    { orderBy: { startsAt: 'asc', id: 'asc' } },
    scope,
  )
  const incidents = await em.count(Incident, { ...live, occurredAt: inWindow })
  const works = await em.find(
    MaintenanceTask,
    { ...live, status: 'done', doneAt: inWindow },
    { fields: ['id', 'cost'] },
  )

  const zoneMinutes = scheduledZoneMinutes(rulesByPlace, dates)
  const sessionMinutes = clubZoneMinutes(sessions, rulesByPlace, dates, timeZone, window)
  const bookingMinutes = clubZoneMinutes(
    bookings.map((row) => ({ placeId: row.placeId, start: row.startsAt, end: row.endsAt })),
    rulesByPlace,
    dates,
    timeZone,
    window,
  )
  const zoneKeys = [...ZONES, 'none' as const]
  const minutesOf = (totals: Record<string, number>) => zoneKeys.reduce((sum, zone) => sum + totals[zone], 0)
  const charges = chargeService(container)
  const chargeIds = rentals.flatMap((row) => (row.chargeId ? [row.chargeId] : []))
  const statuses = charges && chargeIds.length > 0 ? await charges.statusOf(chargeIds, ctx) : new Map<string, string>()
  const payments = ownerPayments(
    rentals.map((row) => ({
      amount: row.amount,
      status: row.status,
      chargeState: rentalChargeState(row.chargeId, statuses),
    })),
  )
  const payee = await placePayee(container, scope, query.placeId, em)
  const sessionHours = hoursOf(minutesOf(sessionMinutes))
  const bookingHours = hoursOf(minutesOf(bookingMinutes))
  return {
    place: { id: place.id, name: place.name },
    owner: payee ? { institutionId: payee.institutionId, name: payee.name } : null,
    from: query.from,
    to: query.to,
    timeZone,
    currency,
    zoneHours: Object.fromEntries(ZONES.map((zone) => [zone, hoursOf(zoneMinutes[zone])])) as OwnerReport['zoneHours'],
    clubTime: {
      // The total is the sum of the shown parts, so the screen and the CSV add up (each part is rounded to 0.01 h).
      total: Math.round((sessionHours + bookingHours) * 100) / 100,
      sessions: sessionHours,
      bookings: bookingHours,
      byZone: Object.fromEntries(
        zoneKeys.map((zone) => [zone, hoursOf(sessionMinutes[zone] + bookingMinutes[zone])]),
      ) as OwnerReport['clubTime']['byZone'],
    },
    rentals: {
      count: rentals.length,
      value: rentals.reduce((sum, row) => sum + row.amount, 0),
      items: rentals.map((row) => ({
        id: row.id,
        start: row.startsAt.toISOString(),
        end: row.endsAt.toISOString(),
        renter: row.renterDisplayName,
        units: row.units,
        amount: row.amount,
        status: row.status,
      })),
    },
    payments,
    incidents: { count: incidents },
    maintenance: { done: works.length, cost: works.reduce((sum, row) => sum + (row.cost ?? 0), 0) },
  }
}
