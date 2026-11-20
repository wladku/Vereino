// Pure rules of the `people` module (club spec *Domain Vocabulary*; foundation spec P-03, P-04, P-07, P-08): the
// club-zone calendar date, PESEL checks, role-assignment scope, the record scope of a person, the payer rule,
// overlapping periods and the guardianship consents. Time is a parameter (engineering standards S3.5).
import {
  ageOn,
  endsBefore,
  grantConsent,
  isActiveAt,
  isAdultOn,
  isCalendarDate,
  periodsOverlap,
  roleCatalogue,
  withdrawConsent,
  type ConsentState,
  type AssignableRole,
  type CalendarDate,
  type RoleAssignmentPeriod,
  type Scope,
  type ScopeGrant,
  type Validity,
} from '@vereino/core'

/** The calendar date (`YYYY-MM-DD`) of `now` in the IANA time zone `timeZone` (moved to `@vereino/core`, #30). */
export { calendarDateInZone } from '@vereino/core'

const PESEL_WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3] as const

/** True for an 11-digit PESEL whose check digit matches (the date part is not validated). */
export function isValidPesel(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false
  const sum = PESEL_WEIGHTS.reduce((total, weight, index) => total + weight * Number(value[index]), 0)
  return (10 - (sum % 10)) % 10 === Number(value[10])
}

/** Spaces, hyphens, dots and parentheses people type between the digits of a phone number. */
const PHONE_SEPARATORS = /[\s\-.()]/g

/**
 * True for a phone number in the Polish national format (nine digits, not starting with 0, optionally after `0048`)
 * or in E.164 (`+`, a country code and up to 15 digits in total), with separators allowed between the digits
 * (README M-10 validation; E06-S22 #104).
 */
export function isValidPhone(value: string): boolean {
  const compact = value.trim().replace(PHONE_SEPARATORS, '')
  return /^(?:0048)?[1-9]\d{8}$/.test(compact) || /^\+[1-9]\d{6,14}$/.test(compact)
}

/**
 * True when a write of `next` over the stored `current` must be refused with `phone_invalid` — the one phone rule of
 * the profile, the person form and the import (#191): a blank value clears the phone and an unchanged one is kept, so
 * only a new number is checked and a value stored before the rule does not block other changes.
 */
export function isRejectedPhone(next: string | null | undefined, current: string | null | undefined): boolean {
  if (!next?.trim() || next === (current ?? null)) return false
  return !isValidPhone(next)
}

/**
 * Why a role assignment's section or place does not fit its role: a coordinator needs a section, a facility attendant
 * a place (#126); a role takes no record it does not require.
 */
export type RoleScopeProblem = 'required' | 'unexpected'

export type RoleScopeRecords = { readonly sectionId?: string | null; readonly placeId?: string | null }

export function roleScopeProblem(role: AssignableRole, records: RoleScopeRecords): RoleScopeProblem | null {
  const requires = roleCatalogue[role].requiresScope
  const needed = requires === 'section' ? records.sectionId : requires === 'place' ? records.placeId : null
  if (requires && !needed) return 'required'
  const extraSection = requires !== 'section' && !!records.sectionId
  const extraPlace = requires !== 'place' && !!records.placeId
  return extraSection || extraPlace ? 'unexpected' : null
}

/** The CLDR plural forms the people catalogs carry for counted text (en: one, other; pl: one, few, many). */
export type PluralForm = 'one' | 'few' | 'many' | 'other'

/**
 * The age in the person record's header (README B-10, navigation spec REQ-N12; #262): completed years on the club's
 * `today` and the locale's catalog plural form ("1 rok", "3 lata", "12 lat"); null without a valid birth date.
 */
export function personAge(
  birthDate: string | null | undefined,
  today: CalendarDate,
  locale: string,
): { years: number; form: PluralForm } | null {
  if (!birthDate || !isCalendarDate(birthDate)) return null
  const years = ageOn(birthDate, today)
  const form = new Intl.PluralRules(locale).select(years)
  return { years, form: form === 'one' || form === 'few' || form === 'many' ? form : 'other' }
}

/** The roles only an adult may hold (navigation spec REQ-N12, V-N05; #262): the section coordinator. */
export const ADULT_ONLY_ROLES: readonly AssignableRole[] = ['coordinator']

/**
 * Why a person may not take a role: an adult-only role for someone under 18 on the day the role takes effect — the
 * later of `validFrom` and `today`. A person without a birth date is not a known minor and passes.
 */
export function roleAgeProblem(input: {
  role: AssignableRole
  birthDate: CalendarDate | null | undefined
  validFrom: CalendarDate
  today: CalendarDate
}): 'role_requires_adult' | null {
  if (!ADULT_ONLY_ROLES.includes(input.role) || !input.birthDate) return null
  const effective = input.validFrom > input.today ? input.validFrom : input.today
  return isAdultOn(input.birthDate, effective) ? null : 'role_requires_adult'
}

export type AssignmentRecord = RoleAssignmentPeriod & {
  readonly sectionId: string | null
  /** The place of a `facility_operator` assignment (#126); absent or null for the other roles. */
  readonly placeId?: string | null
}

export type GuardianshipRecord = Validity & { readonly wardPersonId: string }

export type PersonScopeInput = {
  readonly personId: string
  readonly assignments: readonly AssignmentRecord[]
  /** Guardianships in which the person is the guardian. */
  readonly guardianships: readonly GuardianshipRecord[]
  /**
   * Groups the person leads on `today` through an active `coach` or `assistant` membership (`coached_group_ids`),
   * as the optional `groups` contribution returns them; absent or empty without `groups`.
   */
  readonly coachedGroupIds?: readonly string[]
  /**
   * Places the person maintains (`facilities_place_maintainers`, facilities spec DD-36, #128), as the optional
   * `facilities.maintainerScopeProvider` returns them; absent or empty without `facilities` (fail closed).
   */
  readonly maintenancePlaceIds?: readonly string[]
  /**
   * The descendants of each assigned place (`club_core`'s live place tree, by place id), so a facility attendant's
   * grant covers the place and every place under it (club spec *Record scope* → `place_ids`); a place missing here
   * covers itself only.
   */
  readonly placeDescendants?: Readonly<Record<string, readonly string[]>>
}

/**
 * The record scope of a person on `today` (foundation spec *Grant kinds*): `club_admin` for an active club_admin
 * assignment; `coordinator` with the sections of the active coordinator assignments; `coach` with the groups of the
 * active `coach`/`assistant` memberships (#30 — a `coach` role assignment alone grants only the `auth` role, not a
 * group); `guardian` with the wards of the active guardianships; `maintenance_planner` with the places the person
 * maintains (#128); `facility_operator` with the places of the active facility attendant assignments and their
 * descendants (#126); `treasurer` for an active treasurer assignment — club-wide where `payments` allows it, nowhere
 * else (payments spec DD-33, #245); `self` always.
 */
export function personScope(input: PersonScopeInput, today: CalendarDate): Scope {
  const active = input.assignments.filter((assignment) => isActiveAt(assignment, today))
  const grants: ScopeGrant[] = []
  if (active.some((assignment) => assignment.role === 'club_admin')) grants.push({ kind: 'club_admin' })
  if (active.some((assignment) => assignment.role === 'treasurer')) grants.push({ kind: 'treasurer' })
  const sectionIds = uniqueSorted(
    active.filter((assignment) => assignment.role === 'coordinator').map((assignment) => assignment.sectionId),
  )
  if (sectionIds.length > 0) grants.push({ kind: 'coordinator', ids: sectionIds })
  const groupIds = uniqueSorted(input.coachedGroupIds ?? [])
  if (groupIds.length > 0) grants.push({ kind: 'coach', ids: groupIds })
  const wardIds = uniqueSorted(
    input.guardianships.filter((guardianship) => isActiveAt(guardianship, today)).map((g) => g.wardPersonId),
  )
  if (wardIds.length > 0) grants.push({ kind: 'guardian', ids: wardIds })
  const maintainedPlaceIds = uniqueSorted(input.maintenancePlaceIds ?? [])
  if (maintainedPlaceIds.length > 0) grants.push({ kind: 'maintenance_planner', ids: maintainedPlaceIds })
  const attendedPlaceIds = uniqueSorted(
    active
      .filter((assignment) => assignment.role === 'facility_operator')
      .flatMap((assignment) =>
        assignment.placeId ? [assignment.placeId, ...(input.placeDescendants?.[assignment.placeId] ?? [])] : [],
      ),
  )
  if (attendedPlaceIds.length > 0) grants.push({ kind: 'facility_operator', ids: attendedPlaceIds })
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
  /** The person has a `participant` membership active on `today` (the optional `groups` contribution, #30). */
  readonly activeParticipant?: boolean
}

/**
 * `vereino_payer` eligibility (club spec *Account payer*): an adult — from the 18th birthday — who is an active
 * guardian or an active participant of a group (their own payer). A person without a birth date is never a payer.
 */
export function isPayerEligible(input: PayerInput, today: CalendarDate): boolean {
  if (!input.birthDate || !isAdultOn(input.birthDate, today)) return false
  if (input.activeParticipant === true) return true
  return input.guardianships.some((guardianship) => isActiveAt(guardianship, today))
}

/** A coordinator assignment of a section with the person's name, as the section list shows it. */
export type SectionCoordinator = {
  readonly assignmentId: string
  readonly personId: string
  readonly firstName: string | null
  readonly lastName: string | null
  readonly validFrom: CalendarDate
  readonly validTo: CalendarDate | null
  /** The assignment's lock token (ending it sends it back). */
  readonly updatedAt: string
  /** Active on `today` (false for an assignment that starts later). */
  readonly active: boolean
}

export type SectionCoordinatorCandidate = Omit<SectionCoordinator, 'active'> & { readonly sectionId: string | null }

/**
 * The coordinators of one section on `today` (club spec glossary *Section*): the assignments of that section that
 * have not ended, active ones first, then by start date; `coordinatorMissing` flags an active section without an
 * active coordinator (a warning, the section still works).
 */
export function sectionCoordinators(
  section: { readonly id: string; readonly isActive: boolean },
  candidates: readonly SectionCoordinatorCandidate[],
  today: CalendarDate,
): { coordinators: SectionCoordinator[]; coordinatorMissing: boolean } {
  const coordinators = candidates
    .filter((candidate) => candidate.sectionId === section.id && !endsBefore(candidate, today))
    .map((candidate) => ({
      assignmentId: candidate.assignmentId,
      personId: candidate.personId,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      validFrom: candidate.validFrom,
      validTo: candidate.validTo,
      updatedAt: candidate.updatedAt,
      active: isActiveAt(candidate, today),
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.validFrom.localeCompare(b.validFrom))
  return {
    coordinators,
    coordinatorMissing: section.isActive && !coordinators.some((coordinator) => coordinator.active),
  }
}

/**
 * The first of `existing` whose period overlaps `candidate`, or null. Overlapping periods count as active at the same
 * time: a second assignment of the same role and section, or a second primary payer of one ward (club spec
 * glossary *Legal guardianship*; #26).
 */
export function firstOverlapping<T extends Validity>(candidate: Validity, existing: readonly T[]): T | null {
  return existing.find((period) => periodsOverlap(candidate, period)) ?? null
}

/** The guardian's relation to the ward (club spec *Data Models* → `people_guardianships.relation`). */
export const GUARDIAN_RELATIONS = ['parent', 'grandparent', 'legal_guardian', 'other'] as const
export type GuardianRelation = (typeof GUARDIAN_RELATIONS)[number]

/** The consents of a guardianship (club spec glossary *Consents*). */
export const CONSENT_KINDS = ['regulations', 'image', 'trips'] as const
export type ConsentKind = (typeof CONSENT_KINDS)[number]

/** One consent as `people_guardianships.consents` stores it: `{ granted, at, by_person_id }` (the spec's keys). */
export type StoredConsentEntry = {
  readonly granted: boolean
  readonly at: string
  readonly by_person_id: string | null
}
export type StoredConsents = { readonly [kind in ConsentKind]?: StoredConsentEntry }

/** One consent as the API returns it; `at` is the instant of the last grant or withdrawal, null when never set. */
export type ConsentView = { readonly granted: boolean; readonly at: string | null; readonly byPersonId: string | null }
export type ConsentsView = { readonly [kind in ConsentKind]: ConsentView }

/** The requested state per consent: true grants, false withdraws, absent leaves it as it is. */
export type ConsentChanges = { readonly [kind in ConsentKind]?: boolean }

function storedEntry(value: unknown): StoredConsentEntry | null {
  if (value === null || typeof value !== 'object') return null
  const { granted, at, by_person_id: byPersonId } = value as Record<string, unknown>
  if (typeof granted !== 'boolean' || typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null
  return { granted, at, by_person_id: typeof byPersonId === 'string' ? byPersonId : null }
}

/** The well-formed consents of a stored `consents` value; anything else is dropped (never granted). */
export function parseStoredConsents(raw: unknown): StoredConsents {
  if (raw === null || typeof raw !== 'object') return {}
  const result: Partial<Record<ConsentKind, StoredConsentEntry>> = {}
  for (const kind of CONSENT_KINDS) {
    const entry = storedEntry((raw as Record<string, unknown>)[kind])
    if (entry) result[kind] = entry
  }
  return result
}

/** Every consent kind with its state; a consent never set is not granted. */
export function consentsView(stored: StoredConsents): ConsentsView {
  const view = (kind: ConsentKind): ConsentView => {
    const entry = stored[kind]
    return entry
      ? { granted: entry.granted, at: entry.at, byPersonId: entry.by_person_id }
      : { granted: false, at: null, byPersonId: null }
  }
  return { regulations: view('regulations'), image: view('image'), trips: view('trips') }
}

function consentState(entry: StoredConsentEntry | undefined): ConsentState {
  return { grantedAt: entry?.granted ? new Date(entry.at) : null }
}

/**
 * Applies the requested consent states with the P-08 transitions at `now`: granting a granted consent keeps its
 * date, withdrawing a consent that is not granted changes nothing; a change records `now` and the acting person.
 * Returns the new stored value and the kinds that changed (the audit log keeps the dates of every change).
 */
export function applyConsentChanges(
  current: StoredConsents,
  changes: ConsentChanges,
  now: Date,
  byPersonId: string | null,
): { consents: StoredConsents; changed: ConsentKind[] } {
  const next: Partial<Record<ConsentKind, StoredConsentEntry>> = { ...current }
  const changed: ConsentKind[] = []
  for (const kind of CONSENT_KINDS) {
    const desired = changes[kind]
    if (desired === undefined) continue
    const state = consentState(current[kind])
    const transition = desired ? grantConsent(state, now) : withdrawConsent(state, now)
    if (!transition.changed) continue
    next[kind] = { granted: desired, at: now.toISOString(), by_person_id: byPersonId }
    changed.push(kind)
  }
  return { consents: next, changed }
}

/**
 * Whether a person holds their own consents on `today` (people life-cycle spec REQ-L10, *Own consents*): a known birth
 * date and 18 or more. Without a birth date the club cannot tell, so the person is treated as a minor (422
 * `consents_minor`).
 */
export function holdsOwnConsents(birthDate: string | null | undefined, today: CalendarDate): boolean {
  const date = birthDate ? birthDate.slice(0, 10) : null
  return date !== null && isCalendarDate(date) && isAdultOn(date, today)
}

/** The most recent decision among `entries` (the latest `at`), or null when none was ever made. */
function latestDecision(entries: ReadonlyArray<StoredConsentEntry | undefined>): StoredConsentEntry | null {
  let latest: StoredConsentEntry | null = null
  for (const entry of entries) {
    if (entry && (!latest || Date.parse(entry.at) > Date.parse(latest.at))) latest = entry
  }
  return latest
}

/** Whether each consent is given for a participant (REQ-L10). */
export type EffectiveConsents = { readonly [kind in ConsentKind]: boolean }

/**
 * The consents that hold for a participant: an adult's own decision when they made one (`own`, null for a minor);
 * otherwise the most recent decision among the guardianships active today (the carry-over rule of DD-L08 reads them the
 * same way). A consent nobody decided is not given.
 */
export function effectiveConsents(
  own: StoredConsents | null,
  guardianships: readonly StoredConsents[],
): EffectiveConsents {
  const given = (kind: ConsentKind): boolean => {
    const decision = own?.[kind] ?? latestDecision(guardianships.map((consents) => consents[kind]))
    return decision?.granted ?? false
  }
  return { regulations: given('regulations'), image: given('image'), trips: given('trips') }
}

/**
 * DD-L11: a consent given before the club last changed its text reads "given to an earlier wording" and stays valid.
 * False for a consent that is not given, has no date, or whose text was never changed.
 */
export function givenToEarlierWording(
  consent: { readonly granted: boolean; readonly at: string | null },
  textChangedAt: string | null | undefined,
): boolean {
  if (!consent.granted || !consent.at || !textChangedAt) return false
  return Date.parse(consent.at) < Date.parse(textChangedAt)
}
