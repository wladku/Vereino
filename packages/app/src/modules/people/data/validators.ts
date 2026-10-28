// Request schemas of `people`, shared by routes (OpenAPI) and commands. Public schemas never accept tenant or
// organization ids (`.strict()` rejects them).
import { z } from 'zod'
import { calendarDateSchema, refineValidity, validityShape } from '@/modules/foundation'

const nameSchema = z.string().trim().min(1).max(200)
const localeSchema = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/)
const emailSchema = z.email().max(320)
const peselSchema = z.string().trim().max(32)

export const ASSIGNABLE_ROLES = ['club_admin', 'coordinator', 'coach'] as const

const personFields = {
  firstName: nameSchema,
  lastName: nameSchema,
  preferredLocale: localeSchema.nullable().optional(),
  birthDate: calendarDateSchema.nullable().optional(),
  email: emailSchema.nullable().optional(),
  pesel: peselSchema.nullable().optional(),
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
    pesel: personFields.pesel,
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

export const guardianshipCreateSchema = z
  .object({
    guardianPersonId: z.uuid(),
    wardPersonId: z.uuid(),
    ...validityShape,
  })
  .strict()
  .superRefine(refineValidity)

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

export type PersonCreateInput = z.output<typeof personCreateSchema>
export type PersonUpdateInput = z.output<typeof personUpdateSchema>
export type RoleAssignmentCreateInput = z.output<typeof roleAssignmentCreateSchema>
export type RoleAssignmentUpdateInput = z.output<typeof roleAssignmentUpdateSchema>
