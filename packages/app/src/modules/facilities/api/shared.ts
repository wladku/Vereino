// Shared pieces of the `facilities` routes (#121, #122): the list entity ids, list-item serializers and OpenAPI schemas.
// Lists filter with `scopeWhere` (foundation spec P-03): the facility rules carry no section, so only the club-wide
// grant lists them.
import { z } from 'zod'
import type { ScopeColumnMap } from '@vereino/core'
import { wallTimeOf } from '../lib/zones'

/** The entity ids of the lists (query engine): `<module>:<snake_case of the ORM class>`. */
export const ZONE_RULE_ENTITY_ID = 'facilities:zone_rule'
export const CLOSURE_ENTITY_ID = 'facilities:closure'
export const RENTAL_RATE_ENTITY_ID = 'facilities:rental_rate'
export const RENTAL_ENTITY_ID = 'facilities:rental'
export const ENTRY_BAN_ENTITY_ID = 'facilities:entry_ban'

export const FACILITY_COLUMNS: ScopeColumnMap = {}

type Row = Record<string, unknown>

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const bool = (value: unknown): boolean => value === true || value === 't' || value === 'true'
const int = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0))

function iso(value: unknown): string | null {
  let date: Date | null = null
  if (value instanceof Date) date = value
  else if (typeof value === 'string' || typeof value === 'number') date = new Date(value)
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}

/** A `date` column as `YYYY-MM-DD` (the driver may return a Date or a string). */
function day(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  return typeof value === 'string' ? value.slice(0, 10) : null
}

/** A `smallint[]` column: an array, or its Postgres text `{1,2}`. */
function weekdays(value: unknown): number[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.replace(/[{}]/g, '').split(',') : []
  return items
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= 7)
    .sort((a, b) => a - b)
}

export function zoneRuleListItem(row: Row) {
  return {
    id: String(row.id),
    placeId: String(row.place_id),
    weekdays: weekdays(row.weekdays),
    timeFrom: wallTimeOf(text(row.time_from) ?? ''),
    timeTo: wallTimeOf(text(row.time_to) ?? ''),
    zone: text(row.zone),
    priority: int(row.priority),
    source: text(row.source),
    validFrom: day(row.valid_from),
    validTo: day(row.valid_to),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export function closureListItem(row: Row) {
  return {
    id: String(row.id),
    placeId: String(row.place_id),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    reason: text(row.reason),
    note: text(row.note),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export function rentalRateListItem(row: Row) {
  return {
    id: String(row.id),
    placeId: String(row.place_id),
    renterCategory: text(row.renter_category),
    pricePer90: int(row.price_per_90),
    seasonFrom: text(row.season_from),
    seasonTo: text(row.season_to),
    includesLighting: bool(row.includes_lighting),
    validFrom: day(row.valid_from),
    validTo: day(row.valid_to),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export function rentalListItem(row: Row) {
  return {
    id: String(row.id),
    placeId: String(row.place_id),
    renterType: text(row.renter_type),
    renterId: text(row.renter_id),
    renterDisplayName: text(row.renter_display_name),
    renterCategory: text(row.renter_category),
    contactName: text(row.contact_name),
    contactPhone: text(row.contact_phone),
    contactEmail: text(row.contact_email),
    purpose: text(row.purpose),
    requestedVia: text(row.requested_via),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    units: int(row.units),
    amount: int(row.amount),
    chargeId: text(row.charge_id),
    status: text(row.status),
    cancellationDeadline: iso(row.cancellation_deadline),
    paymentDeadline: iso(row.payment_deadline),
    regulationsAcceptedAt: iso(row.regulations_accepted_at),
    regulationsAcceptedVia: text(row.regulations_accepted_via),
    needsReschedule: bool(row.needs_reschedule),
    notes: text(row.notes),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export function entryBanListItem(row: Row) {
  return {
    id: String(row.id),
    placeId: String(row.place_id),
    subjectType: text(row.subject_type),
    subjectId: text(row.subject_id),
    startsOn: day(row.starts_on),
    endsOn: day(row.ends_on),
    reason: text(row.reason),
    revokedAt: iso(row.revoked_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export const errorSchema = z.object({ error: z.string(), code: z.string().optional() }).loose()

export const updateResponseSchema = z.object({ ok: z.literal(true), id: z.uuid(), updatedAt: z.string() })

export const rescheduleCountsSchema = z
  .object({ sessions: z.number().int(), rentals: z.number().int() })
  .describe('What the save marked to be moved: planned sessions, and rentals (from E08-S02 on)')

export const zoneRuleListItemSchema = z.object({
  id: z.uuid(),
  placeId: z.uuid(),
  weekdays: z.array(z.number().int()),
  timeFrom: z.string(),
  timeTo: z.string(),
  zone: z.string().nullable(),
  priority: z.number().int(),
  source: z.string().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

export const closureListItemSchema = z.object({
  id: z.uuid(),
  placeId: z.uuid(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  reason: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

export const rentalRateListItemSchema = z.object({
  id: z.uuid(),
  placeId: z.uuid(),
  renterCategory: z.string().nullable(),
  pricePer90: z.number().int().describe('Minor units per 90-minute unit'),
  seasonFrom: z.string().nullable(),
  seasonTo: z.string().nullable(),
  includesLighting: z.boolean(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

export const rentalListItemSchema = z.object({
  id: z.uuid(),
  placeId: z.uuid(),
  renterType: z.string().nullable(),
  renterId: z.string().nullable(),
  renterDisplayName: z.string().nullable(),
  renterCategory: z.string().nullable(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  purpose: z.string().nullable(),
  requestedVia: z.string().nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  units: z.number().int(),
  amount: z.number().int().describe('Minor units'),
  chargeId: z.string().nullable(),
  status: z.string().nullable(),
  cancellationDeadline: z.string().nullable(),
  paymentDeadline: z.string().nullable(),
  regulationsAcceptedAt: z.string().nullable(),
  regulationsAcceptedVia: z.string().nullable(),
  needsReschedule: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

export const entryBanListItemSchema = z.object({
  id: z.uuid(),
  placeId: z.uuid(),
  subjectType: z.string().nullable(),
  subjectId: z.string().nullable(),
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  reason: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

/** A conflicting entry of a rental check (ids and times only). */
export const conflictViewSchema = z.object({
  kind: z.enum(['session', 'rental', 'closure']),
  id: z.uuid(),
  start: z.string(),
  end: z.string(),
})

/** The answer of a rental status action. */
export const rentalActionResponseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  status: z.string(),
  updatedAt: z.string(),
})
