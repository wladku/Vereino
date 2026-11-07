// Request schemas of `club_core`, shared by routes (OpenAPI) and commands. Public schemas never accept tenant or
// organization ids (`.strict()` rejects them); `null` clears a nullable field.
import { z } from 'zod'
import { isCalendarDate, isInvertedPeriod } from '@vereino/core'
import { CONTRACT_KINDS, CONTRACT_PARTY_TYPES, MAX_RATE_GROSZ, type CoachTermField } from '../lib/contracts'
import { PLACE_KINDS, placeContactsSchema } from '../lib/places'
import { PLACE_FILE_KINDS } from '../lib/files'
import { publicSlugSchema, publicationPatchSchema } from '../lib/publication'
import { clubSettingsPatchSchema } from '../lib/settings'

/** Institution types (club spec *Data Models* → `club_core_institutions.type`). */
export const INSTITUTION_TYPES = ['municipality', 'school', 'club', 'company', 'sponsor', 'other'] as const
export type InstitutionType = (typeof INSTITUTION_TYPES)[number]

const nameSchema = z.string().trim().min(1).max(200)

/**
 * A section's name (UX parity spec DD-U07): section-only, so the shared `nameSchema` of places, institutions and
 * materials keeps its 1–200 range. It accepts the stored range (1–200) because the edit form resends the name on every
 * save; the commands apply the 2–80 rule on create and rename (`lib/section-usage.ts` `sectionNameProblem`).
 */
const sectionNameSchema = z.string().trim().min(1).max(200)

/** Optional text: blank or null clears the field. */
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null))

/** An optional e-mail address: blank or null clears it. */
const nullableEmail = z
  .union([z.email().max(320), z.literal(''), z.null()])
  .transform((value) => (value ? value : null))

/** A public slug (`lib/publication.ts`); blank or null clears it. */
const nullableSlug = z.union([z.literal('').transform(() => null), z.null(), publicSlugSchema])

/**
 * Body of `PUT /api/club_core/settings`: any subset of the settings, the club's public slug, description and phone,
 * and a partial `publication` (#29; the route also requires `club_core.publication.manage` for it); unknown keys (e.g.
 * scope ids or the logo, which has its own route) are rejected.
 */
export const clubSettingsUpdateSchema = clubSettingsPatchSchema
  .extend({
    // Well-formed only here; an unknown zone or a threshold outside 13–18 is a 422 business error of the command
    // (`clubSettingsRuleProblem`, #87).
    timezone: z.string().trim().min(1).max(100).optional(),
    ownAccountMinAge: z.number().int().optional(),
    publicSlug: nullableSlug.optional(),
    publicDescription: nullableText(4000).optional(),
    contactPhone: nullableText(50).optional(),
    publication: publicationPatchSchema.optional(),
  })
  .strict()

const listQueryBase = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortDir: z.enum(['asc', 'desc']).optional(),
  ids: z.string().optional(),
  search: z.string().trim().min(1).max(200).optional(),
}

// --- Sections ---

const sectionFields = {
  name: sectionNameSchema,
  description: nullableText(4000).optional(),
  isActive: z.boolean().optional(),
}

export const sectionCreateSchema = z.object(sectionFields).strict()

export const sectionUpdateSchema = z
  .object({
    id: z.uuid(),
    name: sectionNameSchema.optional(),
    description: sectionFields.description,
    isActive: z.boolean().optional(),
  })
  .strict()

export const sectionDeleteSchema = z.object({ id: z.uuid() }).strict()

/**
 * Body of `PUT /api/club_core/sections/{id}/public` (#29): the section's public fields, written by the club
 * administrator or the section's coordinator (`club_core.sections.public_content`).
 */
export const sectionPublicUpdateSchema = z
  .object({
    id: z.uuid(),
    isPublic: z.boolean().optional(),
    publicSlug: nullableSlug.optional(),
    publicDescription: nullableText(8000).optional(),
    publicConditions: nullableText(8000).optional(),
    publicContactName: nullableText(200).optional(),
    publicContactEmail: nullableEmail.optional(),
    publicContactPhone: nullableText(50).optional(),
    shortDescription: nullableText(160).optional(),
  })
  .strict()

/** The target of a logo command: the club, or one section. */
export const logoTargetSchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('club') }).strict(),
  z.object({ target: z.literal('section'), sectionId: z.uuid() }).strict(),
])

/** The fields of a material upload (the file itself travels next to the command input). */
export const materialCreateSchema = z
  .object({
    sectionId: z.uuid(),
    title: nameSchema,
    isPublic: z.boolean().default(false),
  })
  .strict()

export const materialUpdateSchema = z
  .object({
    id: z.uuid(),
    sectionId: z.uuid(),
    title: nameSchema.optional(),
    isPublic: z.boolean().optional(),
  })
  .strict()

export const materialDeleteSchema = z.object({ id: z.uuid(), sectionId: z.uuid() }).strict()

export const sectionListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['name', 'createdAt', 'updatedAt']).optional(),
  isActive: z.enum(['true', 'false']).optional(),
})

// --- Places ---

const coordinateSchema = (limit: number) => z.number().min(-limit).max(limit).nullable()

/**
 * The shape of a place's opening hours (facilities spec DD-41): seasons `MM-DD`–`MM-DD` with per-weekday windows
 * `HH:MM`. Only the shape is checked here; ordered windows, overlaps and seasons covering a date twice are the rule of
 * `openingHoursProblem` (`@vereino/core`), which the place commands answer with 422 `place_opening_hours_invalid`.
 */
const wallTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/)
const monthDaySchema = z.string().regex(/^\d{2}-\d{2}$/)
export const openingHoursSchema = z
  .object({
    seasons: z
      .array(
        z
          .object({
            from: monthDaySchema,
            to: monthDaySchema,
            windows: z
              .array(
                z
                  .object({ weekday: z.number().int().min(1).max(7), from: wallTimeSchema, to: wallTimeSchema })
                  .strict(),
              )
              .max(50),
          })
          .strict(),
      )
      .max(12),
  })
  .strict()

const placeFields = {
  parentPlaceId: z.uuid().nullable().optional(),
  kind: z.enum(PLACE_KINDS),
  name: nameSchema,
  surface: nullableText(200).optional(),
  address: nullableText(500).optional(),
  geoLat: coordinateSchema(90).optional(),
  geoLng: coordinateSchema(180).optional(),
  description: nullableText(4000).optional(),
  ownerInstitutionId: z.uuid().nullable().optional(),
  managedByClub: z.boolean().optional(),
  isExternal: z.boolean().optional(),
  rentedByClub: z.boolean().optional(),
  capacityGroups: z.number().int().min(1).max(100).optional(),
  contacts: placeContactsSchema.nullable().optional(),
  openingHours: openingHoursSchema.nullable().optional(),
  isActive: z.boolean().optional(),
  /** The place's rules as plain text (UX parity spec, REQ-U03). */
  regulationsText: nullableText(20000).optional(),
}

export const placeCreateSchema = z.object(placeFields).strict()

export const placeUpdateSchema = z
  .object({ ...placeFields, id: z.uuid(), kind: placeFields.kind.optional(), name: nameSchema.optional() })
  .strict()

export const placeDeleteSchema = z.object({ id: z.uuid() }).strict()

export const placeListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['name', 'kind', 'createdAt', 'updatedAt']).optional(),
  kind: z.enum(PLACE_KINDS).optional(),
  parentPlaceId: z.uuid().optional(),
  isActive: z.enum(['true', 'false']).optional(),
})

/** A place file upload (UX parity spec, REQ-U03): the file itself travels next to the command input. */
export const placeFileAddSchema = z.object({ placeId: z.uuid(), kind: z.enum(PLACE_FILE_KINDS) }).strict()

export const placeFileDeleteSchema = z.object({ id: z.uuid(), placeId: z.uuid() }).strict()

// --- Institutions ---

const institutionFields = {
  name: nameSchema,
  type: z.enum(INSTITUTION_TYPES),
  address: nullableText(500).optional(),
  contactName: nullableText(200).optional(),
  contactPhone: nullableText(50).optional(),
  contactEmail: nullableEmail.optional(),
  bankAccount: nullableText(64).optional(),
  notes: nullableText(4000).optional(),
}

export const institutionCreateSchema = z.object(institutionFields).strict()

export const institutionUpdateSchema = z
  .object({
    ...institutionFields,
    id: z.uuid(),
    name: nameSchema.optional(),
    type: institutionFields.type.optional(),
  })
  .strict()

export const institutionDeleteSchema = z.object({ id: z.uuid() }).strict()

export const institutionListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['name', 'type', 'createdAt', 'updatedAt']).optional(),
  type: z.enum(INSTITUTION_TYPES).optional(),
})

// --- Contracts (#96) ---

// The client forms import this file, so it cannot import `@/modules/foundation` (server code). These mirror the
// foundation's `validityShape` / `refineValidity`: the coded issue still answers 422 `validity_inverted`.
const calendarDate = z.string().refine(isCalendarDate, { message: 'Expected a YYYY-MM-DD date' })
const validityShape = { validFrom: calendarDate, validTo: calendarDate.nullable().optional() }

function refineValidity(value: { validFrom: string; validTo?: string | null }, ctx: z.RefinementCtx): void {
  if (!isInvertedPeriod(value.validFrom, value.validTo)) return
  ctx.addIssue({
    code: 'custom',
    path: ['validTo'],
    message: 'validity_inverted',
    params: { errorCode: 'validity_inverted' },
  })
}

/** A rate in whole grosz, 0 – 1 000 000 zł. */
const rateSchema = z.number().int().min(0).max(MAX_RATE_GROSZ)

/**
 * A contract's terms: a coach's rates in grosz. Every rate is optional here; the command keeps the club model's rates
 * and requires each of them (422 `contract_terms_invalid`), and stores no terms for the other kinds.
 */
export const contractTermsSchema = z
  .object({
    baseMonthly: rateSchema.optional(),
    unitRate: rateSchema.optional(),
    matchRate: rateSchema.optional(),
    travelRate: rateSchema.optional(),
    sessionAmount: rateSchema.optional(),
    tripAmount: rateSchema.optional(),
  } satisfies Record<CoachTermField, z.ZodType>)
  .strict()

export const contractCreateSchema = z
  .object({
    partyType: z.enum(CONTRACT_PARTY_TYPES),
    partyId: z.uuid(),
    kind: z.enum(CONTRACT_KINDS),
    ...validityShape,
    terms: contractTermsSchema.nullable().optional(),
  })
  .strict()
  .superRefine(refineValidity)

/** The party and the kind are fixed once a contract exists; an edit changes its period and terms. */
export const contractUpdateSchema = z
  .object({ id: z.uuid(), ...validityShape, terms: contractTermsSchema.nullable().optional() })
  .strict()
  .superRefine(refineValidity)

export const contractDeleteSchema = z.object({ id: z.uuid() }).strict()

export const contractListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['validFrom', 'validTo', 'kind', 'createdAt', 'updatedAt']).optional(),
  kind: z.enum(CONTRACT_KINDS).optional(),
  partyId: z.uuid().optional(),
})

export type ContractCreateInput = z.output<typeof contractCreateSchema>
export type ContractUpdateInput = z.output<typeof contractUpdateSchema>

export type SectionCreateInput = z.output<typeof sectionCreateSchema>
export type SectionUpdateInput = z.output<typeof sectionUpdateSchema>
export type SectionPublicUpdateInput = z.output<typeof sectionPublicUpdateSchema>
export type LogoTarget = z.output<typeof logoTargetSchema>
export type PlaceCreateInput = z.output<typeof placeCreateSchema>
export type PlaceUpdateInput = z.output<typeof placeUpdateSchema>
export type InstitutionCreateInput = z.output<typeof institutionCreateSchema>
export type InstitutionUpdateInput = z.output<typeof institutionUpdateSchema>
