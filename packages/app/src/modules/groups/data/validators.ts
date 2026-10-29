// Request schemas of `groups`, shared by routes (OpenAPI) and commands. Public schemas never accept tenant or
// organization ids (`.strict()` rejects them). The team-only fields are checked against the group's kind in the
// commands (the kind of an update comes from the stored row), so a class group with team fields answers 422.
import { z } from 'zod'
import { calendarDateSchema, refineValidity, validityShape } from '@/modules/foundation'
import { GROUP_KINDS, MEMBERSHIP_ROLES } from '../lib/groups-rules'

const nameSchema = z.string().trim().min(1).max(200)
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()
const booleanQuery = z.enum(['true', 'false']).optional()

const listQueryBase = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortDir: z.enum(['asc', 'desc']).optional(),
  ids: z.string().optional(),
}

const searchQuery = z.string().trim().min(1).max(200).optional()

// --- Groups ---

export const groupCreateSchema = z
  .object({
    sectionId: z.uuid(),
    name: nameSchema,
    kind: z.enum(GROUP_KINDS),
    league: optionalText(200),
    seasonId: z.uuid().nullable().optional(),
    description: optionalText(4000),
    isActive: z.boolean().optional(),
  })
  .strict()

export const groupUpdateSchema = z
  .object({
    id: z.uuid(),
    sectionId: z.uuid().optional(),
    name: nameSchema.optional(),
    kind: z.enum(GROUP_KINDS).optional(),
    league: optionalText(200),
    seasonId: z.uuid().nullable().optional(),
    description: optionalText(4000),
    isActive: z.boolean().optional(),
  })
  .strict()

export const groupDeleteSchema = z.object({ id: z.uuid() }).strict()

export const groupListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['name', 'kind', 'createdAt', 'updatedAt']).optional(),
  search: searchQuery,
  sectionId: z.uuid().optional(),
  kind: z.enum(GROUP_KINDS).optional(),
  seasonId: z.uuid().optional(),
  isActive: booleanQuery,
})

// --- Memberships ---

export const membershipCreateSchema = z
  .object({
    groupId: z.uuid(),
    personId: z.uuid(),
    role: z.enum(MEMBERSHIP_ROLES),
    ...validityShape,
  })
  .strict()
  .superRefine(refineValidity)

export const membershipUpdateSchema = z
  .object({
    id: z.uuid(),
    role: z.enum(MEMBERSHIP_ROLES).optional(),
    validFrom: calendarDateSchema.optional(),
    validTo: calendarDateSchema.nullable().optional(),
  })
  .strict()

/** Ends a membership: `validTo` is its last active day (default: today in the club zone). */
export const membershipEndSchema = z
  .object({
    id: z.uuid(),
    validTo: calendarDateSchema.optional(),
  })
  .strict()

export const membershipListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['validFrom', 'createdAt', 'updatedAt']).optional(),
  groupId: z.uuid().optional(),
  personId: z.uuid().optional(),
  role: z.enum(MEMBERSHIP_ROLES).optional(),
  /** Only the memberships active on this calendar day. */
  activeOn: calendarDateSchema.optional(),
})

// --- Seasons ---

export const seasonCreateSchema = z
  .object({
    name: nameSchema,
    startsOn: calendarDateSchema,
    endsOn: calendarDateSchema,
  })
  .strict()

export const seasonUpdateSchema = z
  .object({
    id: z.uuid(),
    name: nameSchema.optional(),
    startsOn: calendarDateSchema.optional(),
    endsOn: calendarDateSchema.optional(),
  })
  .strict()

export const seasonDeleteSchema = z.object({ id: z.uuid() }).strict()

export const seasonListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['name', 'startsOn', 'createdAt', 'updatedAt']).optional(),
  search: searchQuery,
})

// --- External teams ---

export const externalTeamCreateSchema = z
  .object({
    name: nameSchema,
    clubName: optionalText(200),
    institutionId: z.uuid().nullable().optional(),
    contact: optionalText(1000),
    notes: optionalText(4000),
  })
  .strict()

export const externalTeamUpdateSchema = z
  .object({
    id: z.uuid(),
    name: nameSchema.optional(),
    clubName: optionalText(200),
    institutionId: z.uuid().nullable().optional(),
    contact: optionalText(1000),
    notes: optionalText(4000),
  })
  .strict()

export const externalTeamDeleteSchema = z.object({ id: z.uuid() }).strict()

export const externalTeamListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['name', 'createdAt', 'updatedAt']).optional(),
  search: searchQuery,
})
