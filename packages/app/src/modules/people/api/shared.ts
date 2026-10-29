// Shared pieces of the `people` routes: the grant kinds each read allows, their list column maps, serializers and
// OpenAPI schemas. Lists filter with `scopeWhere` and detail routes guard with `assertInScope` on the same kinds and
// options, so a list and a detail agree by construction (foundation spec P-03).
import { z } from 'zod'
import type { ActingRole, GrantKind, ScopeColumnMap, ScopeMatchOptions } from '@vereino/core'
import type { Guardianship, Person, RoleAssignment } from '../data/entities'
import { GUARDIAN_RELATIONS, consentsView, parseStoredConsents, type ConsentsView } from '../lib/people-rules'

/**
 * Who may read a person: the person, a guardian of the person, the club administrator, and a section coordinator,
 * who reads the club's people records club-wide but only their basic data — no contact details, notes, PESEL or
 * consents (club spec *Users, Permissions, and Scope*; #26). The acting role picks the view, so the coordinator's
 * club-wide grant comes last: a reader who is also the guardian or the administrator gets the full record.
 */
export const PERSON_READ_KINDS: readonly GrantKind[] = ['self', 'guardian', 'club_admin', 'coordinator']
export const PERSON_COLUMNS: ScopeColumnMap = { personId: 'id' }
/** The coordinator's read of people records is club-wide (basic data only). */
export const PEOPLE_READ_OPTIONS: ScopeMatchOptions = { clubWideKinds: ['coordinator'] }

/** The acting role of a read that sees only the basic data of a person or a guardianship (no consents). */
export function isBasicRead(actingRole: ActingRole): boolean {
  return actingRole === 'coordinator'
}

/**
 * Who may read a guardianship: the ward (`self`), a guardian of the ward, the club administrator and — club-wide,
 * without the consents — a section coordinator. The target is the ward, like the guardianship commands'.
 */
export const GUARDIANSHIP_READ_KINDS: readonly GrantKind[] = PERSON_READ_KINDS
export const GUARDIANSHIP_COLUMNS: ScopeColumnMap = { personId: 'ward_person_id' }

/**
 * Consents are returned only to a reader with `people.manage` (the club administrator) or to a guardian of the ward
 * (club spec API table: `people.view` alone — the coordinator — never gets them; the ward does not either).
 */
export function consentsVisible(actingRole: ActingRole, canManage: boolean): boolean {
  return canManage || actingRole === 'guardian'
}

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

/** The basic data of a person: what a coordinator reads (no contact details, notes or PESEL). */
export type PersonBasicView = {
  id: string
  access: 'basic' | 'full'
  firstName: string
  lastName: string
  preferredLocale: string | null
  birthDate: string | null
  hasAccount: boolean
  createdAt: string | null
  updatedAt: string | null
}

export type PersonView = PersonBasicView & {
  email: string | null
  phone: string | null
  notes: string | null
  userId: string | null
  pesel?: string | null
  /** The person's own consents as a guardian (#27): the instant each was given, null when not given. */
  shareContactWithCoachesAt: string | null
  sharePresenceWithGuardiansAt: string | null
}

export function personBasicView(person: Person): PersonBasicView {
  return {
    id: person.id,
    access: 'basic',
    firstName: person.firstName,
    lastName: person.lastName,
    preferredLocale: person.preferredLocale ?? null,
    birthDate: person.birthDate ?? null,
    hasAccount: Boolean(person.userId),
    createdAt: iso(person.createdAt),
    updatedAt: iso(person.updatedAt),
  }
}

export function personView(person: Person, options: { withPesel: boolean }): PersonView {
  return {
    ...personBasicView(person),
    access: 'full',
    email: person.email ?? null,
    phone: person.phone ?? null,
    notes: person.notes ?? null,
    userId: person.userId ?? null,
    ...(options.withPesel ? { pesel: person.pesel ?? null } : {}),
    shareContactWithCoachesAt: iso(person.shareContactWithCoachesAt),
    sharePresenceWithGuardiansAt: iso(person.sharePresenceWithGuardiansAt),
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

/** A guardianship as the API returns it; `consents` only when `consentsVisible` allows it. */
export type GuardianshipView = {
  id: string
  guardianPersonId: string
  wardPersonId: string
  relation: string
  isPrimaryPayer: boolean
  validFrom: string | null
  validTo: string | null
  consents?: ConsentsView
  createdAt: string | null
  updatedAt: string | null
}

export function guardianshipView(row: Guardianship, options: { withConsents: boolean }): GuardianshipView {
  return {
    id: row.id,
    guardianPersonId: row.guardianPersonId,
    wardPersonId: row.wardPersonId,
    relation: row.relation,
    isPrimaryPayer: row.isPrimaryPayer,
    validFrom: row.validFrom,
    validTo: row.validTo ?? null,
    ...(options.withConsents ? { consents: consentsView(parseStoredConsents(row.consents)) } : {}),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

/** A row of the query engine as the list item of `GET /api/people/guardianships` (never with consents). */
export function guardianshipListItem(row: Record<string, unknown>): GuardianshipView {
  return {
    id: String(row.id),
    guardianPersonId: String(row.guardian_person_id),
    wardPersonId: String(row.ward_person_id),
    relation: String(row.relation),
    isPrimaryPayer: row.is_primary_payer === true,
    validFrom: dateText(row.valid_from),
    validTo: dateText(row.valid_to),
    createdAt: iso(row.created_at as Date | string | null),
    updatedAt: iso(row.updated_at as Date | string | null),
  }
}

export const errorSchema = z.object({ error: z.string(), code: z.string().optional() }).loose()

export const personViewSchema = z.object({
  id: z.uuid(),
  access: z.enum(['basic', 'full']),
  firstName: z.string(),
  lastName: z.string(),
  preferredLocale: z.string().nullable(),
  birthDate: z.string().nullable(),
  hasAccount: z.boolean(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  pesel: z.string().nullable().optional(),
  shareContactWithCoachesAt: z.string().nullable().optional().describe('Full view only'),
  sharePresenceWithGuardiansAt: z.string().nullable().optional().describe('Full view only'),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

const consentViewSchema = z.object({
  granted: z.boolean(),
  at: z.string().nullable(),
  byPersonId: z.string().nullable(),
})

export const consentsViewSchema = z.object({
  regulations: consentViewSchema,
  image: consentViewSchema,
  trips: consentViewSchema,
})

export const guardianshipViewSchema = z.object({
  id: z.uuid(),
  guardianPersonId: z.uuid(),
  wardPersonId: z.uuid(),
  relation: z.enum(GUARDIAN_RELATIONS),
  isPrimaryPayer: z.boolean(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  consents: consentsViewSchema.optional().describe('Only for people.manage or a guardian of the ward'),
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
