// The reads of the online requests (facilities spec P-05, B-25, the B-01 widget; REQ-024; #125):
// - `requestSummary`: what the confirmation page shows a guest after the link — the place, the slot, the indicative
//   amount and the end of the 48-hour hold; nothing else of the request;
// - `requestQueue`: the B-25 queue and the B-01 widget — the confirmed requests whose hold is still valid, the soonest
//   expiry first, with the requester's details (decrypted for the administrator), the indicative amount, the
//   entry-ban hint and the entries that collide with the slot now (sessions, rentals, club bookings, closures and other
//   held requests on the place, its ancestors and descendants), each with its kind and times only.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Rental } from '../data/entities'
import { blockingHolds } from '../lib/requests'
import { clubRequestSettings, findPlaces, type FacilitiesScope } from './directory'
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
  }
}

export type QueueConflict = {
  kind: 'session' | 'rental' | 'booking' | 'closure' | 'maintenance' | 'request'
  start: string
  end: string
}

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
  return [
    ...entries.map((entry) => ({ kind: entry.kind, start: entry.start.toISOString(), end: entry.end.toISOString() })),
    ...holds.map((hold) => ({
      kind: 'request' as const,
      start: hold.start.toISOString(),
      end: hold.end.toISOString(),
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
  const places = await findPlaces(container, scope, [...new Set(rows.map((row) => row.placeId))], em)
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
