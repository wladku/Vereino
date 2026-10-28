// Pure rules of the `people` module (club spec *Domain Vocabulary*; foundation spec P-03, P-04, P-07): the club-zone
// calendar date, PESEL checks, role-assignment scope, the record scope of a person and the payer rule. Time is a
// parameter (engineering standards S3.5).
import {
  isActiveAt,
  isAdultOn,
  roleCatalogue,
  type AssignableRole,
  type CalendarDate,
  type RoleAssignmentPeriod,
  type Scope,
  type ScopeGrant,
  type Validity,
} from '@vereino/core'

/** The calendar date (`YYYY-MM-DD`) of `now` in the IANA time zone `timeZone`. */
export function calendarDateInZone(now: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const byType = Object.fromEntries(parts.map((entry) => [entry.type, entry.value])) as Record<string, string>
  return `${byType.year}-${byType.month}-${byType.day}`
}

const PESEL_WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3] as const

/** True for an 11-digit PESEL whose check digit matches (the date part is not validated). */
export function isValidPesel(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false
  const sum = PESEL_WEIGHTS.reduce((total, weight, index) => total + weight * Number(value[index]), 0)
  return (10 - (sum % 10)) % 10 === Number(value[10])
}

/** Why a role assignment's section does not fit its role: a coordinator needs one, other roles take none. */
export type RoleScopeProblem = 'required' | 'unexpected'

export function roleScopeProblem(role: AssignableRole, sectionId: string | null | undefined): RoleScopeProblem | null {
  const needsSection = roleCatalogue[role].requiresScope === 'section'
  if (needsSection && !sectionId) return 'required'
  if (!needsSection && sectionId) return 'unexpected'
  return null
}

export type AssignmentRecord = RoleAssignmentPeriod & { readonly sectionId: string | null }

export type GuardianshipRecord = Validity & { readonly wardPersonId: string }

export type PersonScopeInput = {
  readonly personId: string
  readonly assignments: readonly AssignmentRecord[]
  /** Guardianships in which the person is the guardian. */
  readonly guardianships: readonly GuardianshipRecord[]
}

/**
 * The record scope of a person on `today` (foundation spec *Grant kinds*): `club_admin` for an active club_admin
 * assignment; `coordinator` with the sections of the active coordinator assignments; `guardian` with the wards of
 * the active guardianships; `self` always. A `coach` grant carries group ids, which come from memberships (#30);
 * phase A1 has none, so no coach grant is returned and a coach sees only what `self` allows.
 */
export function personScope(input: PersonScopeInput, today: CalendarDate): Scope {
  const active = input.assignments.filter((assignment) => isActiveAt(assignment, today))
  const grants: ScopeGrant[] = []
  if (active.some((assignment) => assignment.role === 'club_admin')) grants.push({ kind: 'club_admin' })
  const sectionIds = uniqueSorted(
    active.filter((assignment) => assignment.role === 'coordinator').map((assignment) => assignment.sectionId),
  )
  if (sectionIds.length > 0) grants.push({ kind: 'coordinator', ids: sectionIds })
  const wardIds = uniqueSorted(
    input.guardianships.filter((guardianship) => isActiveAt(guardianship, today)).map((g) => g.wardPersonId),
  )
  if (wardIds.length > 0) grants.push({ kind: 'guardian', ids: wardIds })
  grants.push({ kind: 'self', ids: [input.personId] })
  return grants
}

function uniqueSorted(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))].sort()
}

export type PayerInput = {
  readonly birthDate: CalendarDate | null
  /** Guardianships in which the person is the guardian. */
  readonly guardianships: readonly Validity[]
}

/**
 * `vereino_payer` eligibility (club spec *Account payer*): an adult — from the 18th birthday — who is an active
 * guardian. Adult participants become payers through their memberships (#30); phase A1 has none. A person without
 * a birth date is never a payer.
 */
export function isPayerEligible(input: PayerInput, today: CalendarDate): boolean {
  if (!input.birthDate || !isAdultOn(input.birthDate, today)) return false
  return input.guardianships.some((guardianship) => isActiveAt(guardianship, today))
}
