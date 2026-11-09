// The checks of a rental slot (facilities spec glossary *Booking (external rental)*, *Slot occupancy*; REQ-013, B-24
// validation; #122), shared by the quote (`POST /api/facilities/rentals/quote`, nothing saved), the staff entry and the
// move. In order: the units, the rate of the place for the renter category on the date, a closure or the opening
// hours (`place_closed`), a planned maintenance window (`maintenance_scheduled`, #128), the zone (`zone_not_reservable`), the other occupancy (`rental_conflict`) and the renter's
// entry ban (`entry_ban_active`). The commands throw the first issue; the quote lists them all next to the amount and
// the deadlines. Every read uses the caller's EntityManager, so under the occupancy lock (DD-43) the result stands
// until the commit.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { EntryBan, RentalRate, ZoneRule } from '../data/entities'
import { rentalRateShapeOf } from '../commands/rental-rates'
import { zoneRuleShapeOf } from '../commands/zone-rules'
import { quoteRate, type RenterCategory } from '../lib/rates'
import {
  banActiveOn,
  localSlotOf,
  occupancyConflictCode,
  quoteRental,
  rentalEnd,
  slotReservable,
  slotWithinOpeningHours,
  unitsAllowed,
  type OccupancyEntry,
  type RenterType,
} from '../lib/rentals'
import { dayZoneSegments } from '../lib/zones'
import { clubTimeZone, openingHours, type FacilitiesScope } from './directory'
import { occupancyEntries, placeFamilyIds } from './occupancy'

export type RentalIssueCode =
  | 'rental_units_invalid'
  | 'rental_rate_missing'
  | 'place_closed'
  | 'maintenance_scheduled'
  | 'zone_not_reservable'
  | 'rental_conflict'
  | 'entry_ban_active'

/** A conflicting entry as staff see it (ids and times; names stay on the calendar). */
export type ConflictView = { kind: OccupancyEntry['kind']; id: string; start: string; end: string }

export type RentalIssue = { code: RentalIssueCode; conflicts?: ConflictView[] }

export type SlotInput = {
  placeId: string
  startsAt: Date
  units: number
  renterCategory: RenterCategory
  renterType?: RenterType | null
  renterId?: string | null
  /** The rental being moved, left out of the occupancy check. */
  ignoreIds?: readonly string[]
}

export type SlotAssessment = {
  endsAt: Date
  amount: number | null
  rateId: string | null
  appliedCategory: RenterCategory | null
  cancellationDeadline: Date
  paymentDeadline: Date
  issues: RentalIssue[]
}

function conflictView(entry: OccupancyEntry): ConflictView {
  return { kind: entry.kind, id: entry.id, start: entry.start.toISOString(), end: entry.end.toISOString() }
}

async function renterBanned(
  container: AwilixContainer,
  em: EntityManager,
  scope: FacilitiesScope,
  input: SlotInput,
  date: string,
): Promise<boolean> {
  if (!input.renterId || (input.renterType !== 'institution' && input.renterType !== 'person')) return false
  const placeIds = await placeFamilyIds(container, scope, input.placeId, em)
  const bans = await em.find(EntryBan, {
    ...scope,
    deletedAt: null,
    subjectType: input.renterType,
    subjectId: input.renterId,
    placeId: { $in: placeIds },
    revokedAt: null,
  })
  return bans.some((ban) =>
    banActiveOn({ startsOn: ban.startsOn, endsOn: ban.endsOn ?? null, revokedAt: ban.revokedAt ?? null }, date),
  )
}

/** Every issue of the slot plus the quote (amount and deadlines); the units issue stops the occupancy checks. */
export async function assessRentalSlot(
  container: AwilixContainer,
  em: EntityManager,
  scope: FacilitiesScope,
  input: SlotInput,
  now: Date,
): Promise<SlotAssessment> {
  const issues: RentalIssue[] = []
  const unitsOk = unitsAllowed(input.units)
  if (!unitsOk) issues.push({ code: 'rental_units_invalid' })
  const units = unitsOk ? input.units : 1
  const endsAt = rentalEnd(input.startsAt, units)
  const timeZone = await clubTimeZone(container, scope)
  const slot = localSlotOf(input.startsAt, endsAt, timeZone)

  const rates = await em.find(RentalRate, { ...scope, deletedAt: null, placeId: input.placeId })
  const rate = quoteRate(rates.map(rentalRateShapeOf), input.placeId, input.renterCategory, slot.date)
  if (!rate) issues.push({ code: 'rental_rate_missing' })
  const quote = quoteRental(input.startsAt, units, rate?.pricePer90 ?? 0, now)

  if (unitsOk) {
    const entries = await occupancyEntries(
      container,
      em,
      scope,
      input.placeId,
      { start: input.startsAt, end: endsAt },
      input.ignoreIds ?? [],
    )
    const closures = entries.filter((entry) => entry.kind === 'closure')
    const hours = (await openingHours(container, scope, [input.placeId], em)).get(input.placeId) ?? null
    if (closures.length > 0 || !slotWithinOpeningHours(hours, slot)) {
      issues.push({ code: 'place_closed', ...(closures.length > 0 ? { conflicts: closures.map(conflictView) } : {}) })
    } else {
      // A planned maintenance window blocks the slot like a closure (#128), ahead of the zone.
      const works = entries.filter((entry) => entry.kind === 'maintenance')
      if (works.length > 0) issues.push({ code: 'maintenance_scheduled', conflicts: works.map(conflictView) })
      const rules = await em.find(ZoneRule, { ...scope, deletedAt: null, placeId: input.placeId })
      if (!slotReservable(dayZoneSegments(rules.map(zoneRuleShapeOf), slot.date), slot)) {
        issues.push({ code: 'zone_not_reservable' })
      }
      const others = entries.filter((entry) => entry.kind !== 'closure' && entry.kind !== 'maintenance')
      if (occupancyConflictCode(others) === 'rental_conflict') {
        issues.push({ code: 'rental_conflict', conflicts: others.map(conflictView) })
      }
    }
  }
  if (await renterBanned(container, em, scope, input, slot.date)) issues.push({ code: 'entry_ban_active' })

  return {
    endsAt,
    amount: rate ? quote.amount : null,
    rateId: rate?.id ?? null,
    appliedCategory: rate?.renterCategory ?? null,
    cancellationDeadline: quote.cancellationDeadline,
    paymentDeadline: quote.paymentDeadline,
    issues,
  }
}

/** The quote route's read: the same assessment on a fresh EntityManager, outside any transaction and lock. */
export function quoteRentalSlot(
  container: AwilixContainer,
  scope: FacilitiesScope,
  input: SlotInput,
  now: Date,
): Promise<SlotAssessment> {
  return assessRentalSlot(container, container.resolve<EntityManager>('em').fork(), scope, input, now)
}
