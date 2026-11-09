// Request schemas of `facilities` (#121), shared by routes (OpenAPI) and commands. Public schemas never accept tenant
// or organization ids (`.strict()` rejects them). The schemas check the shape only; the business rules — time order,
// the 90-minute window, opening hours, overlaps, seasons — are checked in the commands and answer 422 or 409 with a
// code (`.ai/lessons/business-rule-422-not-in-zod-schema.md`). Wall times are club-zone `HH:mm` (or `HH:mm:ss`).
import { z } from 'zod'
import { calendarDateSchema, refineValidity, validityShape } from '@/modules/foundation'
import { CLOSURE_REASONS } from '../lib/closures'
import { PURPOSE_MAX_LENGTH, PURPOSE_MIN_LENGTH } from '../lib/internal-bookings'
import { RENTER_CATEGORIES } from '../lib/rates'
import {
  APPROVAL_NOTE_MAX_LENGTH,
  REJECT_REASON_MAX_LENGTH,
  REJECT_REASON_MIN_LENGTH,
  REQUESTER_NAME_MAX_LENGTH,
  REQUESTER_NAME_MIN_LENGTH,
  REQUEST_PURPOSE_MAX_LENGTH,
} from '../lib/requests'
import {
  ENTRY_BAN_SUBJECT_TYPES,
  RENTAL_STATUSES,
  RENTAL_TABS,
  RENTER_TYPES,
  STAFF_REQUESTED_VIA,
} from '../lib/rentals'
import { MAX_ZONE_PRIORITY, ZONES, ZONE_SOURCES } from '../lib/zones'

const wallTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$|^24:00(?::00)?$/)
const weekdaySchema = z.number().int().min(1).max(7)
const instantSchema = z.iso.datetime({ offset: true })
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()

const listQueryBase = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sortDir: z.enum(['asc', 'desc']).optional(),
  ids: z.string().optional(),
}

// --- Zone rules ---

const zoneRuleShape = {
  placeId: z.uuid(),
  weekdays: z.array(weekdaySchema).min(1).max(7),
  timeFrom: wallTimeSchema,
  timeTo: wallTimeSchema,
  zone: z.enum(ZONES),
  priority: z.number().int().min(1).max(MAX_ZONE_PRIORITY),
  source: z.enum(ZONE_SOURCES).optional(),
  ...validityShape,
}

export const zoneRuleCreateSchema = z.object(zoneRuleShape).strict().superRefine(refineValidity)

export const zoneRuleUpdateSchema = z
  .object({
    id: z.uuid(),
    weekdays: zoneRuleShape.weekdays.optional(),
    timeFrom: wallTimeSchema.optional(),
    timeTo: wallTimeSchema.optional(),
    zone: zoneRuleShape.zone.optional(),
    priority: zoneRuleShape.priority.optional(),
    validFrom: calendarDateSchema.optional(),
    validTo: calendarDateSchema.nullable().optional(),
  })
  .strict()

export const zoneRuleDeleteSchema = z.object({ id: z.uuid() }).strict()

export const zoneRuleListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['priority', 'validFrom', 'createdAt', 'updatedAt']).optional(),
  placeId: z.uuid().optional(),
  zone: z.enum(ZONES).optional(),
  source: z.enum(ZONE_SOURCES).optional(),
})

/**
 * `POST /api/facilities/zone-rules/bulk` (REQ-029): the same hours for several days, or different hours per day, for
 * one or more places. `weekdays` are the days "replace" clears (default: the days of the windows); a day in
 * `weekdays` without a window only removes its availability.
 */
export const availabilityBulkSchema = z
  .object({
    placeIds: z.array(z.uuid()).min(1).max(20),
    mode: z.enum(['replace', 'append']).default('replace'),
    validFrom: calendarDateSchema,
    validTo: calendarDateSchema.nullable().optional(),
    weekdays: z.array(weekdaySchema).max(7).optional(),
    windows: z.array(z.object({ weekday: weekdaySchema, from: wallTimeSchema, to: wallTimeSchema }).strict()).max(21),
  })
  .strict()
  .superRefine(refineValidity)

// --- Closures ---

const closureShape = {
  placeId: z.uuid(),
  startsAt: instantSchema,
  endsAt: instantSchema,
  reason: z.enum(CLOSURE_REASONS),
  note: optionalText(2000),
}

export const closureCreateSchema = z.object(closureShape).strict()

export const closureUpdateSchema = z
  .object({
    id: z.uuid(),
    placeId: closureShape.placeId.optional(),
    startsAt: instantSchema.optional(),
    endsAt: instantSchema.optional(),
    reason: closureShape.reason.optional(),
    note: optionalText(2000),
  })
  .strict()

export const closureDeleteSchema = z.object({ id: z.uuid() }).strict()

export const closureListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['startsAt', 'createdAt', 'updatedAt']).optional(),
  placeId: z.uuid().optional(),
  reason: z.enum(CLOSURE_REASONS).optional(),
  /** Closures that end on or after this instant (e.g. "upcoming"). */
  endsAfter: instantSchema.optional(),
})

// --- Rental rates ---

const monthDaySchema = z.string().regex(/^\d{2}-\d{2}$/)

const rateShape = {
  placeId: z.uuid(),
  renterCategory: z.enum(RENTER_CATEGORIES),
  pricePer90: z.number().int().min(0).max(100_000_000),
  seasonFrom: monthDaySchema.nullable().optional(),
  seasonTo: monthDaySchema.nullable().optional(),
  includesLighting: z.boolean().optional(),
  ...validityShape,
}

export const rentalRateCreateSchema = z.object(rateShape).strict().superRefine(refineValidity)

export const rentalRateUpdateSchema = z
  .object({
    id: z.uuid(),
    pricePer90: rateShape.pricePer90.optional(),
    seasonFrom: rateShape.seasonFrom,
    seasonTo: rateShape.seasonTo,
    includesLighting: z.boolean().optional(),
    validFrom: calendarDateSchema.optional(),
    validTo: calendarDateSchema.nullable().optional(),
  })
  .strict()

export const rentalRateDeleteSchema = z.object({ id: z.uuid() }).strict()

export const rentalRateListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['renterCategory', 'validFrom', 'createdAt', 'updatedAt']).optional(),
  placeId: z.uuid().optional(),
  renterCategory: z.enum(RENTER_CATEGORIES).optional(),
})

// --- Rentals (#122) ---

/**
 * `POST /api/facilities/rentals` (`facilities.rentals.create`, B-24 "New rental"): a staff entry after a phone call.
 * `renterId` names the institution or person for those renter types; an unregistered renter carries its name. The
 * units (1–4), the renter and the slot are checked by the command (422 / 409 with a code).
 */
export const rentalCreateSchema = z
  .object({
    placeId: z.uuid(),
    renterType: z.enum(RENTER_TYPES),
    renterId: z.uuid().nullable().optional(),
    renterDisplayName: optionalText(200),
    renterCategory: z.enum(RENTER_CATEGORIES),
    startsAt: instantSchema,
    units: z.number().int(),
    contactName: optionalText(200),
    contactPhone: optionalText(50),
    contactEmail: z.email().max(320).nullable().optional(),
    purpose: optionalText(500),
    requestedVia: z.enum(STAFF_REQUESTED_VIA).default('phone'),
    /** "Rules accepted (by phone)": recorded with the time and the channel. */
    regulationsAccepted: z.boolean().default(false),
    notes: optionalText(2000),
  })
  .strict()

/** `POST /api/facilities/rentals/quote`: the same slot fields, nothing saved; the renter only for the ban check. */
export const rentalQuoteSchema = z
  .object({
    placeId: z.uuid(),
    renterType: z.enum(RENTER_TYPES).optional(),
    renterId: z.uuid().nullable().optional(),
    renterCategory: z.enum(RENTER_CATEGORIES),
    startsAt: instantSchema,
    units: z.number().int(),
    /** The rental being moved, left out of the conflict check. */
    ignoreRentalId: z.uuid().optional(),
  })
  .strict()

export const rentalActionSchema = z.object({ id: z.uuid() }).strict()

export const rentalCancelSchema = z.object({ id: z.uuid(), reason: optionalText(500) }).strict()

/** A move keeps the status and the amount; the units stay, so only the start and the place change. */
export const rentalMoveSchema = z
  .object({ id: z.uuid(), startsAt: instantSchema, placeId: z.uuid().optional() })
  .strict()

export const rentalListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['startsAt', 'amount', 'createdAt', 'updatedAt']).optional(),
  placeId: z.uuid().optional(),
  status: z.enum(RENTAL_STATUSES).optional(),
  /** B-24 tabs: `active` (requested, confirmed), `awaiting_approval` (pending approval); omitted = all. */
  tab: z.enum(Object.keys(RENTAL_TABS) as [keyof typeof RENTAL_TABS, ...Array<keyof typeof RENTAL_TABS>]).optional(),
  needsReschedule: z.enum(['true', 'false']).optional(),
  /** Rentals that end on or after / start before an instant (the calendar week). */
  endsAfter: instantSchema.optional(),
  startsBefore: instantSchema.optional(),
})

// --- Online requests (#125) ---

/**
 * `POST /api/facilities/public/{clubSlug}/places/{placeSlug}/requests` (P-04): the guest's form. The category is one
 * of the public ones (`municipal_club`, `external_commercial`; the winter-lighting rate is staff-only). `website` is
 * the hidden honeypot field — a filled one is refused by the command; `regulationsAccepted` must be true (422 from
 * the command, so the form shows it at the field). The units, the zone and the slot are checked by the command.
 */
export const publicRequestSchema = z
  .object({
    startsAt: instantSchema,
    units: z.number().int(),
    renterDisplayName: z.string().trim().min(REQUESTER_NAME_MIN_LENGTH).max(REQUESTER_NAME_MAX_LENGTH),
    renterCategory: z.enum(['municipal_club', 'external_commercial']),
    contactName: z.string().trim().min(2).max(200),
    contactPhone: z.string().trim().min(5).max(50),
    contactEmail: z.email().max(320),
    purpose: z.string().trim().max(REQUEST_PURPOSE_MAX_LENGTH).nullable().optional(),
    regulationsAccepted: z.boolean(),
    /** The language of the form; the e-mails are sent in it (the club's default when unsupported). */
    locale: z.string().max(10).optional(),
    website: z.string().max(500).optional(),
  })
  .strict()

/** `POST /api/facilities/public/requests/verify` (P-05): the token in the body, never in the path (DD-44). */
export const requestVerifySchema = z.object({ token: z.string().min(1).max(200) }).strict()

/**
 * `POST /api/facilities/rentals/{id}/approve` (B-25): the renter — an existing institution or person, or a new
 * institution — optionally another category (the staff-only winter-lighting rate) and an amount; a changed amount
 * needs a note (422 `rental_amount_note_required` from the command).
 */
export const requestApproveSchema = z
  .object({
    id: z.uuid(),
    renterType: z.enum(['institution', 'person']).optional(),
    renterId: z.uuid().optional(),
    createInstitution: z
      .object({
        name: z.string().trim().min(1).max(200),
        type: z.enum(['municipality', 'school', 'club', 'company', 'sponsor', 'other']).default('club'),
      })
      .strict()
      .optional(),
    renterCategory: z.enum(RENTER_CATEGORIES).optional(),
    /** Minor units. */
    amountOverride: z.number().int().min(0).max(100_000_000).nullable().optional(),
    note: optionalText(APPROVAL_NOTE_MAX_LENGTH),
  })
  .strict()

/** `POST /api/facilities/rentals/{id}/reject` (B-25): a reason of 5–500 characters. */
export const requestRejectSchema = z
  .object({ id: z.uuid(), reason: z.string().trim().min(REJECT_REASON_MIN_LENGTH).max(REJECT_REASON_MAX_LENGTH) })
  .strict()

/** `GET /api/facilities/rentals/requests` (B-25, the B-01 widget): the requests awaiting approval, soonest expiry first. */
export const requestQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

// --- Entry bans (#122; the pages and revocation arrive with E08-S06) ---

export const entryBanCreateSchema = z
  .object({
    placeId: z.uuid(),
    subjectType: z.enum(ENTRY_BAN_SUBJECT_TYPES),
    subjectId: z.uuid(),
    startsOn: calendarDateSchema,
    endsOn: calendarDateSchema.nullable().optional(),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict()

export const entryBanListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['startsOn', 'createdAt', 'updatedAt']).optional(),
  placeId: z.uuid().optional(),
  subjectId: z.uuid().optional(),
})

// --- Internal bookings (#123) ---

/**
 * `POST /api/facilities/internal-bookings` (`facilities.internal_bookings.create`, M-11 "Book" → "General purpose"):
 * a place, a period (any length, within the opening hours), the purpose (3–120 characters) and the section the booking
 * is made for. The period, the opening hours and the occupancy are checked by the command (422 / 409 with a code).
 */
export const internalBookingCreateSchema = z
  .object({
    placeId: z.uuid(),
    startsAt: instantSchema,
    endsAt: instantSchema,
    sectionId: z.uuid(),
    purpose: z.string().trim().min(PURPOSE_MIN_LENGTH).max(PURPOSE_MAX_LENGTH),
  })
  .strict()

/** `DELETE /api/facilities/internal-bookings/{id}`: the booker, the section's coordinator or the administrator. */
export const internalBookingCancelSchema = z.object({ id: z.uuid(), reason: optionalText(500) }).strict()

/** `GET /api/facilities/calendar`: a window of at most 31 days; one place (with its timeline) or every bookable place. */
export const calendarQuerySchema = z.object({
  placeId: z.uuid().optional(),
  from: instantSchema,
  to: instantSchema,
})

export type RentalCreateInput = z.output<typeof rentalCreateSchema>
export type PublicRequestInput = z.output<typeof publicRequestSchema>
export type RentalQuoteInput = z.output<typeof rentalQuoteSchema>
export type AvailabilityBulkInput = z.output<typeof availabilityBulkSchema>
