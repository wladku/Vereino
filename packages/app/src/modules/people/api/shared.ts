// Shared pieces of the `people` routes: the grant kinds each read allows, their list column maps, serializers and
// OpenAPI schemas. Lists filter with `scopeWhere` and detail routes guard with `assertInScope` on the same kinds, so
// a list and a detail agree by construction (foundation spec P-03).
import { z } from 'zod'
import type { GrantKind, ScopeColumnMap } from '@vereino/core'
import type { Person, RoleAssignment } from '../data/entities'

/** Who may read a person: the person, a guardian of the person, the club administrator. */
export const PERSON_READ_KINDS: readonly GrantKind[] = ['self', 'guardian', 'club_admin']
export const PERSON_COLUMNS: ScopeColumnMap = { personId: 'id' }

/**
 * Who may read a role assignment: its person, the coordinator of its section, the club administrator. A coach grant
 * carries group ids (#30) and matches no assignment.
 */
export const ASSIGNMENT_READ_KINDS: readonly GrantKind[] = ['self', 'coordinator', 'club_admin']
export const ASSIGNMENT_COLUMNS: ScopeColumnMap = { personId: 'person_id', sectionId: 'section_id' }

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export type PersonView = {
  id: string
  firstName: string
  lastName: string
  preferredLocale: string | null
  birthDate: string | null
  email: string | null
  userId: string | null
  hasAccount: boolean
  pesel?: string | null
  createdAt: string | null
  updatedAt: string | null
}

export function personView(person: Person, options: { withPesel: boolean }): PersonView {
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    preferredLocale: person.preferredLocale ?? null,
    birthDate: person.birthDate ?? null,
    email: person.email ?? null,
    userId: person.userId ?? null,
    hasAccount: Boolean(person.userId),
    ...(options.withPesel ? { pesel: person.pesel ?? null } : {}),
    createdAt: iso(person.createdAt),
    updatedAt: iso(person.updatedAt),
  }
}

/** A row of the query engine (snake_case columns) as the list item of `GET /api/people/persons`. */
export function personListItem(row: Record<string, unknown>) {
  const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
  return {
    id: String(row.id),
    firstName: text(row.first_name),
    lastName: text(row.last_name),
    preferredLocale: text(row.preferred_locale),
    birthDate: text(row.birth_date),
    userId: text(row.user_id),
    hasAccount: typeof row.user_id === 'string',
    createdAt: iso(row.created_at as Date | string | null),
    updatedAt: iso(row.updated_at as Date | string | null),
  }
}

export function roleAssignmentView(row: RoleAssignment) {
  return {
    id: row.id,
    personId: row.personId,
    role: row.role,
    sectionId: row.sectionId ?? null,
    validFrom: row.validFrom,
    validTo: row.validTo ?? null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

export function roleAssignmentListItem(row: Record<string, unknown>) {
  const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
  return {
    id: String(row.id),
    personId: String(row.person_id),
    role: String(row.role),
    sectionId: text(row.section_id),
    validFrom: dateText(row.valid_from),
    validTo: dateText(row.valid_to),
    createdAt: iso(row.created_at as Date | string | null),
    updatedAt: iso(row.updated_at as Date | string | null),
  }
}

/** A `date` column as `YYYY-MM-DD`, whether the driver returned a string or a Date. */
function dateText(value: unknown): string | null {
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return null
}

export const errorSchema = z.object({ error: z.string(), code: z.string().optional() }).loose()

export const personViewSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  preferredLocale: z.string().nullable(),
  birthDate: z.string().nullable(),
  email: z.string().nullable().optional(),
  userId: z.string().nullable(),
  hasAccount: z.boolean(),
  pesel: z.string().nullable().optional(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

export const roleAssignmentViewSchema = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  role: z.string(),
  sectionId: z.string().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})
