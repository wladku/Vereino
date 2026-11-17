// The reads of the online requests (facilities spec P-05, B-25, the B-01 widget; REQ-024; #125):
// - `requestSummary`: what the confirmation page shows a guest after the link — the place, the slot, the indicative
//   amount and the end of the 48-hour hold; nothing else of the request — and the header of the club's public pages
//   (`club_core`'s public frame of the club the token named, null while the club publishes no page; #261);
// - `requestQueue`: the B-25 queue and the B-01 widget — the confirmed requests whose hold is still valid, the soonest
//   expiry first, with the requester's details (decrypted for the administrator), the indicative amount, the
//   entry-ban hint and the entries that collide with the slot now (sessions, rentals, club bookings, closures and other
//   held requests on the place, its ancestors and descendants), each with its kind, times and the label staff see.
//   Since #280 (facilities parity spec phase 6, REQ-R08, B-25 cards): each item also carries the payee (the nearest
//   owner institution up the place tree, null = the club), when the rules were accepted online and when the e-mail was
//   confirmed.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { ClubCorePublicSite, PublicClubFrame } from '../../club_core/services/public-site'
import { Rental } from '../data/entities'
import { blockingHolds } from '../lib/requests'
import { calendarEntries, staffEntryLabel } from './calendar'
import { clubRequestSettings, findPlaces, placePayee, type FacilitiesScope } from './directory'
import { occupancyEntries, placeFamilyIds } from './occupancy'

export type RequestSummary = {
  status: 'pending_approval'
  placeName: string
  startsAt: string
  endsAt: string
  timeZone: string
  units: number
  amount: number | null
  currency: string
  holdExpiresAt: string
  club: PublicClubFrame['club'] | null
}

const CLUB_CORE_PUBLIC_SITE = 'clubCorePublicSite'

/** The public header of the club the token named; null without `club_core` or while the club publishes no page. */
async function publicClub(container: AwilixContainer, scope: FacilitiesScope): Promise<PublicClubFrame['club'] | null> {
  if (!container.hasRegistration(CLUB_CORE_PUBLIC_SITE)) return null
  const frame = await container.resolve<ClubCorePublicSite>(CLUB_CORE_PUBLIC_SITE).clubFrameForScope(scope)
  return frame.status === 'ok' ? frame.value.club : null
}

export async function requestSummary(
  container: AwilixContainer,
  row: Rental,
  timeZone: string,
): Promise<RequestSummary> {
  const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
  const settings = await clubRequestSettings(container, scope)
  const place = (await findPlaces(container, scope, [row.placeId])).get(row.placeId)
  return {
    status: 'pending_approval',
    placeName: place?.name ?? '',
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timeZone,
    units: row.units,
    amount: row.rateId ? row.amount : null,
    currency: settings.currency,
    holdExpiresAt: (row.holdExpiresAt ?? row.updatedAt).toISOString(),
    club: await publicClub(container, scope),
  }
}

export type QueueConflict = {
  kind: 'session' | 'rental' | 'booking' | 'closure' | 'maintenance' | 'request'
  start: string
  end: string
  /** What staff see of the entry (the activity, the renter, the purpose and booker…); null when it cannot be read. */
  label: string | null
}

export type QueuePayee = { institutionId: string; name: string }

export type QueueItem = {
  id: string
  updatedAt: string
  placeId: string
  placeName: string
  startsAt: string
  endsAt: string
  units: number
  renterDisplayName: string
  renterCategory: string
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  purpose: string | null
  amount: number | null
  holdExpiresAt: string
  entryBanMatch: boolean
  conflicts: QueueConflict[]
  /** The owner institution the rental would be paid to; null = the club itself. */
  payee: QueuePayee | null
  regulationsAcceptedAt: string | null
  emailVerifiedAt: string | null
}

export type RequestQueue = {
  items: QueueItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  timeZone: string
  currency: string
}

async function conflictsOf(
  container: AwilixContainer,
  em: EntityManager,
  scope: FacilitiesScope,
  row: Rental,
  now: Date,
): Promise<QueueConflict[]> {
  const window = { start: row.startsAt, end: row.endsAt }
  const entries = await occupancyEntries(container, em, scope, row.placeId, window, [row.id])
  const placeIds = await placeFamilyIds(container, scope, row.placeId, em)
  const others = await em.find(
    Rental,
    {
      ...scope,
      deletedAt: null,
      placeId: { $in: placeIds },
      status: 'pending_approval',
      holdExpiresAt: { $gt: now },
      startsAt: { $lt: row.endsAt },
      endsAt: { $gt: row.startsAt },
    },
    { fields: ['id', 'status', 'holdExpiresAt', 'startsAt', 'endsAt'] },
  )
  const holds = blockingHolds(
    others.map((other) => ({
      id: other.id,
      status: other.status,
      holdExpiresAt: other.holdExpiresAt ?? null,
      start: other.startsAt,
      end: other.endsAt,
    })),
    window,
    now,
    row.id,
  )
  // The labels staff see, read only when something collides (the read decrypts the window's rentals).
  const labels = new Map<string, string | null>(
    entries.length + holds.length === 0
      ? []
      : (await calendarEntries(container, em, scope, placeIds, window, now)).map((entry) => [
          entry.id,
          staffEntryLabel(entry),
        ]),
  )
  return [
    ...entries.map((entry) => ({
      kind: entry.kind,
      start: entry.start.toISOString(),
      end: entry.end.toISOString(),
      label: labels.get(entry.id) ?? null,
    })),
    ...holds.map((hold) => ({
      kind: 'request' as const,
      start: hold.start.toISOString(),
      end: hold.end.toISOString(),
      label: labels.get(hold.id) ?? null,
    })),
  ]
}

/** The confirmed requests still held, the soonest expiry first, one page. */
export async function requestQueue(
  container: AwilixContainer,
  scope: FacilitiesScope,
  page: { page: number; pageSize: number },
  now: Date,
): Promise<RequestQueue> {
  const em = container.resolve<EntityManager>('em').fork()
  const where = { ...scope, deletedAt: null, status: 'pending_approval' as const, holdExpiresAt: { $gt: now } }
  const total = await em.count(Rental, where)
  const rows = await findWithDecryption(
    em,
    Rental,
    where,
    {
      orderBy: { holdExpiresAt: 'asc', id: 'asc' },
      limit: page.pageSize,
      offset: (page.page - 1) * page.pageSize,
    },
    scope,
  )
  const settings = await clubRequestSettings(container, scope)
  const placeIds = [...new Set(rows.map((row) => row.placeId))]
  const places = await findPlaces(container, scope, placeIds, em)
  const payees = new Map<string, QueuePayee | null>()
  for (const placeId of placeIds) {
    const payee = await placePayee(container, scope, placeId, em)
    payees.set(placeId, payee ? { institutionId: payee.institutionId, name: payee.name } : null)
  }
  const items: QueueItem[] = []
  for (const row of rows) {
    items.push({
      id: row.id,
      updatedAt: row.updatedAt.toISOString(),
      placeId: row.placeId,
      placeName: places.get(row.placeId)?.name ?? '',
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      units: row.units,
      renterDisplayName: row.renterDisplayName,
      renterCategory: row.renterCategory,
      contactName: row.contactName ?? null,
      contactPhone: row.contactPhone ?? null,
      contactEmail: row.contactEmail ?? null,
      purpose: row.purpose ?? null,
      amount: row.rateId ? row.amount : null,
      holdExpiresAt: (row.holdExpiresAt as Date).toISOString(),
      entryBanMatch: row.entryBanMatch,
      conflicts: await conflictsOf(container, em, scope, row, now),
      payee: payees.get(row.placeId) ?? null,
      regulationsAcceptedAt: row.regulationsAcceptedAt?.toISOString() ?? null,
      emailVerifiedAt: row.usedAt?.toISOString() ?? null,
    })
  }
  return {
    items,
    total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: Math.max(1, Math.ceil(total / page.pageSize)),
    timeZone: settings.timeZone,
    currency: settings.currency,
  }
}
