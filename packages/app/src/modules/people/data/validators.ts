// Request schemas of `people`, shared by routes (OpenAPI) and commands. Public schemas never accept tenant or
// organization ids (`.strict()` rejects them).
import { z } from 'zod'
import { calendarDateSchema, refineValidity, validityShape } from '@/modules/foundation'
import { IMPORT_FIELDS, type ImportField } from '../lib/import-mapping'
import { IMPORT_CLASSIFICATIONS, IMPORT_DECISIONS } from '../lib/import-rules'
import { GUARDIAN_RELATIONS, type ConsentKind } from '../lib/people-rules'

const nameSchema = z.string().trim().min(1).max(200)
const localeSchema = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/)
const emailSchema = z.email().max(320)
const peselSchema = z.string().trim().max(32)
const phoneSchema = z.string().trim().max(50)
const notesSchema = z.string().max(4000)
/** An identifier from an import file for a person without a PESEL (#28). */
const externalIdSchema = z.string().trim().min(1).max(100)

export const ASSIGNABLE_ROLES = ['club_admin', 'coordinator', 'coach'] as const

const personFields = {
  firstName: nameSchema,
  lastName: nameSchema,
  preferredLocale: localeSchema.nullable().optional(),
  birthDate: calendarDateSchema.nullable().optional(),
  email: emailSchema.nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  notes: notesSchema.nullable().optional(),
  pesel: peselSchema.nullable().optional(),
  externalId: externalIdSchema.nullable().optional(),
}

export const personCreateSchema = z.object(personFields).strict()

export const personUpdateSchema = z
  .object({
    id: z.uuid(),
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    preferredLocale: personFields.preferredLocale,
    birthDate: personFields.birthDate,
    email: personFields.email,
    phone: personFields.phone,
    notes: personFields.notes,
    pesel: personFields.pesel,
    externalId: personFields.externalId,
    /** The lock token in the body (S5.2), for a caller without the platform header: the import commit. */
    expectedUpdatedAt: z.string().max(64).optional(),
  })
  .strict()

export const roleAssignmentCreateSchema = z
  .object({
    personId: z.uuid(),
    role: z.enum(ASSIGNABLE_ROLES),
    sectionId: z.uuid().nullable().optional(),
    ...validityShape,
  })
  .strict()
  .superRefine(refineValidity)

export const roleAssignmentUpdateSchema = z
  .object({
    id: z.uuid(),
    role: z.enum(ASSIGNABLE_ROLES).optional(),
    sectionId: z.uuid().nullable().optional(),
    validFrom: calendarDateSchema.optional(),
    validTo: calendarDateSchema.nullable().optional(),
  })
  .strict()

/** Ends an assignment: `validTo` is its last active day (default: today in the club zone). */
export const roleAssignmentEndSchema = z
  .object({
    id: z.uuid(),
    validTo: calendarDateSchema.optional(),
  })
  .strict()

const relationSchema = z.enum(GUARDIAN_RELATIONS)

/** The requested consent states: true grants, false withdraws, an absent key keeps the consent as it is. */
export const consentChangesSchema = z
  .object({
    regulations: z.boolean().optional(),
    image: z.boolean().optional(),
    trips: z.boolean().optional(),
  } satisfies Record<ConsentKind, z.ZodOptional<z.ZodBoolean>>)
  .strict()

export const guardianshipCreateSchema = z
  .object({
    guardianPersonId: z.uuid(),
    wardPersonId: z.uuid(),
    relation: relationSchema.default('parent'),
    isPrimaryPayer: z.boolean().default(false),
    consents: consentChangesSchema.optional(),
    ...validityShape,
  })
  .strict()
  .superRefine(refineValidity)

export const guardianshipUpdateSchema = z
  .object({
    id: z.uuid(),
    relation: relationSchema.optional(),
    isPrimaryPayer: z.boolean().optional(),
    consents: consentChangesSchema.optional(),
    validFrom: calendarDateSchema.optional(),
    validTo: calendarDateSchema.nullable().optional(),
  })
  .strict()

/** Ends a guardianship: `validTo` is its last active day (default: today in the club zone). */
export const guardianshipEndSchema = z
  .object({
    id: z.uuid(),
    validTo: calendarDateSchema.optional(),
  })
  .strict()

/** A guardian's (or the administrator's) change of the consents (club spec glossary *Consents*). */
export const guardianshipConsentsSchema = z
  .object({
    id: z.uuid(),
    consents: consentChangesSchema,
  })
  .strict()

/**
 * `PUT /api/people/me` (`people.persons.update_self`; club spec API table): the member's own interface language
 * (null = the club default), contact details and the two consents (`true` gives, `false` withdraws, absent keeps).
 * `publishNameConsent` arrives with the public pages (#29); the lock token travels in the platform header.
 */
export const selfUpdateSchema = z
  .object({
    preferredLocale: localeSchema.nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    email: emailSchema.nullable().optional(),
    shareContactWithCoaches: z.boolean().optional(),
    sharePresenceWithGuardians: z.boolean().optional(),
  })
  .strict()

export const createAccountSchema = z
  .object({
    id: z.uuid(),
    email: emailSchema,
  })
  .strict()

/** Input of the job command; `today` is accepted only from the CLI and the worker (no HTTP route). */
export const syncRolesJobSchema = z.object({ today: calendarDateSchema.optional() }).strict()

/** Input of the first-administrator bootstrap (CLI only). */
export const bootstrapAdminSchema = z
  .object({
    userId: z.uuid(),
    firstName: nameSchema,
    lastName: nameSchema,
    email: emailSchema.optional(),
    validFrom: calendarDateSchema.optional(),
  })
  .strict()

export const personListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortField: z.enum(['createdAt', 'updatedAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  ids: z.string().optional(),
  lastName: z.string().trim().min(1).max(200).optional(),
  hasAccount: z.enum(['true', 'false']).optional(),
})

export const roleAssignmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortField: z.enum(['createdAt', 'updatedAt', 'validFrom']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  ids: z.string().optional(),
  personId: z.uuid().optional(),
  sectionId: z.uuid().optional(),
  role: z.enum(ASSIGNABLE_ROLES).optional(),
})

export const guardianshipListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortField: z.enum(['createdAt', 'updatedAt', 'validFrom']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  ids: z.string().optional(),
  /** Guardianships in which the person is the guardian or the ward. */
  personId: z.uuid().optional(),
  guardianPersonId: z.uuid().optional(),
  wardPersonId: z.uuid().optional(),
})

export type PersonCreateInput = z.output<typeof personCreateSchema>
export type PersonUpdateInput = z.output<typeof personUpdateSchema>
export type SelfUpdateInput = z.output<typeof selfUpdateSchema>
export type RoleAssignmentCreateInput = z.output<typeof roleAssignmentCreateSchema>
export type RoleAssignmentUpdateInput = z.output<typeof roleAssignmentUpdateSchema>

// --- Bulk import (club spec REQ-036, DD-38; #28) ---------------------------------------------------------------

/** Field → 0-based column of the file's header (`lib/import-mapping.ts`); unknown fields are refused. */
export const importMappingSchema = z
  .object(
    Object.fromEntries(IMPORT_FIELDS.map((field) => [field, z.number().int().min(0).max(1000).optional()])) as Record<
      ImportField,
      z.ZodOptional<z.ZodNumber>
    >,
  )
  .strict()

/** `people.imports.create`: the mapping as JSON text next to the multipart `file`. */
export const importCreateSchema = z.object({ mapping: importMappingSchema }).strict()

/** `people.imports.decide_row`: one decision on a staged row (the row's lock token in the platform header). */
export const importRowRefSchema = z.object({ importId: z.uuid(), rowId: z.uuid() }).strict()

export const importDecisionSchema = importRowRefSchema
  .extend({ action: z.enum(IMPORT_DECISIONS), personId: z.uuid().optional() })
  .strict()
  .refine((value) => (value.action === 'match') === (value.personId !== undefined), {
    message: 'personId is required for match and only for match',
    path: ['personId'],
  })

/** `people.imports.commit` and `people.imports.cancel`: the import (its lock token in the platform header). */
export const importActionSchema = z.object({ id: z.uuid() }).strict()

/** `people.imports.purge` (the `people:purge-import-rows` job); `now` only from the CLI and the worker. */
export const importPurgeJobSchema = z.object({ now: z.iso.datetime().optional() }).strict()

export const importListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['previewed', 'committed', 'cancelled']).optional(),
})

export const importRowListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  classification: z.enum(IMPORT_CLASSIFICATIONS).optional(),
  /** Only the rows that still need a decision. */
  pending: z.enum(['true', 'false']).optional(),
})
