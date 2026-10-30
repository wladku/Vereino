// Request schemas of `club_core`, shared by routes (OpenAPI) and commands. Public schemas never accept tenant or
// organization ids (`.strict()` rejects them); `null` clears a nullable field.
import { z } from 'zod'
import { PLACE_KINDS, placeContactsSchema } from '../lib/places'
import { publicSlugSchema, publicationPatchSchema } from '../lib/publication'
import { clubSettingsPatchSchema } from '../lib/settings'

/** Institution types (club spec *Data Models* → `club_core_institutions.type`). */
export const INSTITUTION_TYPES = ['municipality', 'school', 'club', 'company', 'sponsor', 'other'] as const
export type InstitutionType = (typeof INSTITUTION_TYPES)[number]

const nameSchema = z.string().trim().min(1).max(200)

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
  name: nameSchema,
  description: nullableText(4000).optional(),
  isActive: z.boolean().optional(),
}

export const sectionCreateSchema = z.object(sectionFields).strict()

export const sectionUpdateSchema = z
  .object({
    id: z.uuid(),
    name: nameSchema.optional(),
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
  isActive: z.boolean().optional(),
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

export type SectionCreateInput = z.output<typeof sectionCreateSchema>
export type SectionUpdateInput = z.output<typeof sectionUpdateSchema>
export type SectionPublicUpdateInput = z.output<typeof sectionPublicUpdateSchema>
export type LogoTarget = z.output<typeof logoTargetSchema>
export type PlaceCreateInput = z.output<typeof placeCreateSchema>
export type PlaceUpdateInput = z.output<typeof placeUpdateSchema>
export type InstitutionCreateInput = z.output<typeof institutionCreateSchema>
export type InstitutionUpdateInput = z.output<typeof institutionUpdateSchema>
