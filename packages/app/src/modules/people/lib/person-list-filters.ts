// The people list's filters and perspectives (UX parity spec REQ-U01, DD-U01, DD-U03; B-09): pure translations of the
// query into birth-date bounds, account conditions and the id predicates the route resolves, plus the role badges of a
// row. `today` is the club's calendar date (S3.5: time is a parameter).
import { ADULT_AGE, addDays, assertCalendarDate, isCalendarDate, type CalendarDate } from '@vereino/core'
import { TURNS_18_NOTICE_DAYS } from './life-cycle-rules'

/**
 * The perspectives of the people list (B-09): all, staff (has a role), children (under 18), without an account, and
 * former persons (people life-cycle spec REQ-L03, DD-L05; #306), whom every other perspective leaves out.
 */
export const PERSON_LIST_VIEWS = ['all', 'staff', 'children', 'no_account', 'former'] as const
export type PersonListView = (typeof PERSON_LIST_VIEWS)[number]

/**
 * The roles the list filters by: the assignable roles (the facility attendant `facility_operator` since #262,
 * navigation spec REQ-N12), a guardian (has wards) and a participant (a membership).
 */
export const PERSON_FILTER_ROLES = [
  'club_admin',
  'coordinator',
  'coach',
  'facility_operator',
  'guardian',
  'participant',
] as const
export type PersonFilterRole = (typeof PERSON_FILTER_ROLES)[number]

/**
 * The "Needs attention" filter values of the list (people life-cycle spec B-09): `missing_consents` — participants
 * whose `regulations` consent is not given (REQ-L10, #309); phase L8 (#310): `account_age` — minors without an account
 * whose age reached the club's `own_account_min_age` (REQ-L07); `turns_18_soon` — persons whose 18th birthday is
 * within 30 days (REQ-L06); `adult_without_contact` — adults with neither an account nor an e-mail address.
 */
export const PERSON_ATTENTION_FILTERS = [
  'missing_consents',
  'account_age',
  'turns_18_soon',
  'adult_without_contact',
] as const
export type PersonAttentionFilter = (typeof PERSON_ATTENTION_FILTERS)[number]

/** Above this many candidate ids the list refuses with 422 `people_filter_too_broad` instead of loading them. */
export const PERSON_FILTER_ID_LIMIT = 10_000

/** The query parameters of `GET /api/people/persons` this module turns into predicates. */
export type PersonListFilterQuery = {
  view?: PersonListView
  role?: PersonFilterRole
  sectionId?: string
  groupId?: string
  hasAccount?: 'true' | 'false'
  ageFrom?: number
  ageTo?: number
  search?: string
  attention?: PersonAttentionFilter
}

/** Inclusive upper (`onOrBefore`) and exclusive lower (`after`) birth-date bounds; null when a side is open. */
export type BirthDateRange = { onOrBefore: CalendarDate | null; after: CalendarDate | null }

/**
 * The plan of a list query:
 * - `birthDates` — the age bounds as birth dates, or null without an age condition;
 * - `accountConditions` — each entry requires `user_id` to exist (true) or not (false); two opposite ones match nobody;
 * - `staff`, `role`, `sectionId`, `groupId`, `missingConsents` — the id predicates the route resolves and intersects;
 * - `former` — `only` former persons (`left_on` reached), `exclude` them, or `any` (a typed name in the "all"
 *   perspective searches every perspective, so an administrator finds someone who left).
 */
export type PersonListPlan = {
  birthDates: BirthDateRange | null
  accountConditions: boolean[]
  staff: boolean
  role: PersonFilterRole | null
  sectionId: string | null
  groupId: string | null
  former: 'only' | 'exclude' | 'any'
  /** Participants whose `regulations` consent is not given (REQ-L10). */
  missingConsents: boolean
  /** Persons without a contact e-mail (`adult_without_contact`, #310). */
  withoutEmail: boolean
}

/**
 * The calendar date `years` before `today`. 29 February of a common year becomes 28 February: no date lies between
 * them, so the bounds below keep their meaning.
 */
export function yearsBefore(today: CalendarDate, years: number): CalendarDate {
  assertCalendarDate(today, 'today')
  const year = String(Number(today.slice(0, 4)) - years).padStart(4, '0')
  const sameDay = `${year}${today.slice(4)}`
  return isCalendarDate(sameDay) ? sameDay : `${year}-02-28`
}

/**
 * The birth dates of the people whose age in completed years on `today` is within `ageFrom`–`ageTo` (inclusive),
 * narrowed to minors when `minorsOnly`. Age ≥ N means born on or before `today` − N years; age ≤ M means born after
 * `today` − (M + 1) years. Returns null without any bound.
 */
export function birthDateRange(
  input: { ageFrom?: number; ageTo?: number; minorsOnly?: boolean },
  today: CalendarDate,
): BirthDateRange | null {
  const upperAges = [input.ageTo, input.minorsOnly ? ADULT_AGE - 1 : undefined].filter(
    (age): age is number => age !== undefined,
  )
  const maxAge = upperAges.length > 0 ? Math.min(...upperAges) : null
  const onOrBefore = input.ageFrom !== undefined ? yearsBefore(today, input.ageFrom) : null
  const after = maxAge !== null ? yearsBefore(today, maxAge + 1) : null
  if (onOrBefore === null && after === null) return null
  return { onOrBefore, after }
}

/** The range both bounds allow: the earlier inclusive upper bound and the later exclusive lower bound. */
export function intersectBirthDateRanges(
  first: BirthDateRange | null,
  second: BirthDateRange | null,
): BirthDateRange | null {
  if (!first || !second) return first ?? second
  const earlier = (a: CalendarDate | null, b: CalendarDate | null) => (a === null ? b : b === null || a < b ? a : b)
  const later = (a: CalendarDate | null, b: CalendarDate | null) => (a === null ? b : b === null || a > b ? a : b)
  return { onOrBefore: earlier(first.onOrBefore, second.onOrBefore), after: later(first.after, second.after) }
}

/**
 * The birth dates and the account condition of an L8 "Needs attention" value (#310); null for a value without them.
 * `turns_18_soon`: the 18th birthday after `today` and on or before `today` + 30 days, i.e. born after `today` − 18
 * years and on or before (`today` + 30 days) − 18 years.
 */
export function attentionBirthDates(
  attention: PersonAttentionFilter | undefined,
  today: CalendarDate,
  ownAccountMinAge: number,
): { birthDates: BirthDateRange; withoutAccount: boolean } | null {
  if (attention === 'account_age') {
    return {
      birthDates: birthDateRange({ ageFrom: ownAccountMinAge, ageTo: ADULT_AGE - 1 }, today) as BirthDateRange,
      withoutAccount: true,
    }
  }
  if (attention === 'turns_18_soon') {
    return {
      birthDates: {
        onOrBefore: yearsBefore(addDays(today, TURNS_18_NOTICE_DAYS), ADULT_AGE),
        after: yearsBefore(today, ADULT_AGE),
      },
      withoutAccount: false,
    }
  }
  if (attention === 'adult_without_contact') {
    return { birthDates: birthDateRange({ ageFrom: ADULT_AGE }, today) as BirthDateRange, withoutAccount: true }
  }
  return null
}

/**
 * The predicates of a list query (the perspective combines with the filters by AND). `ownAccountMinAge` is the club's
 * account age (`attention=account_age`).
 */
export function personListPlan(
  query: PersonListFilterQuery,
  today: CalendarDate,
  ownAccountMinAge = 16,
): PersonListPlan {
  const view = query.view ?? 'all'
  const accountConditions: boolean[] = []
  if (query.hasAccount) accountConditions.push(query.hasAccount === 'true')
  if (view === 'no_account' && !accountConditions.includes(false)) accountConditions.push(false)
  const attention = attentionBirthDates(query.attention, today, ownAccountMinAge)
  if (attention?.withoutAccount && !accountConditions.includes(false)) accountConditions.push(false)
  const ages = birthDateRange({ ageFrom: query.ageFrom, ageTo: query.ageTo, minorsOnly: view === 'children' }, today)
  return {
    birthDates: intersectBirthDateRanges(ages, attention?.birthDates ?? null),
    accountConditions,
    staff: view === 'staff',
    role: query.role ?? null,
    sectionId: query.sectionId ?? null,
    groupId: query.groupId ?? null,
    former: view === 'former' ? 'only' : view === 'all' && query.search?.trim() ? 'any' : 'exclude',
    missingConsents: query.attention === 'missing_consents',
    withoutEmail: query.attention === 'adult_without_contact',
  }
}

/** Whether the plan reads group memberships, which only the `groups` module can answer. */
export function planNeedsMemberships(plan: PersonListPlan): boolean {
  return plan.sectionId !== null || plan.groupId !== null || plan.role === 'participant' || plan.missingConsents
}

/**
 * The intersection of the candidate id sets; a null entry does not restrict. Null when nothing restricts, otherwise
 * the ids in every set (possibly none).
 */
export function intersectIdSets(sets: ReadonlyArray<ReadonlySet<string> | null>): Set<string> | null {
  let result: Set<string> | null = null
  for (const set of sets) {
    if (set === null) continue
    const current: Set<string> | null = result
    result = current === null ? new Set(set) : new Set([...current].filter((id: string) => set.has(id)))
  }
  return result
}

/** The badges of the Roles column, in a stable order; each carries text (never colour alone). */
export const PERSON_ROLE_BADGES = ['club_admin', 'coordinator', 'coach', 'facility_operator', 'guardian'] as const
export type PersonRoleBadge = (typeof PERSON_ROLE_BADGES)[number]

/**
 * The Roles column of a row: the person's active role assignments, "coach" also for an active `coach` or `assistant`
 * membership (`_groups`), and "guardian" when the person has wards.
 */
export function personRoleBadges(input: {
  roles: readonly string[]
  hasWards: boolean
  membershipRoles?: readonly string[]
}): PersonRoleBadge[] {
  const held = new Set<string>(input.roles)
  if ((input.membershipRoles ?? []).some((role) => role === 'coach' || role === 'assistant')) held.add('coach')
  if (input.hasWards) held.add('guardian')
  return PERSON_ROLE_BADGES.filter((badge) => held.has(badge))
}

/** The list's filters kept in the URL besides the perspective, the search and the page (DD-U03). */
export const PERSON_LIST_FILTER_KEYS = [
  'sectionId',
  'groupId',
  'role',
  'hasAccount',
  'ageFrom',
  'ageTo',
  'attention',
] as const
export type PersonListFilterKey = (typeof PERSON_LIST_FILTER_KEYS)[number]

/** The list page's state as the URL carries it. */
export type PersonListUrlState = {
  view: PersonListView
  search: string
  page: number
  filters: Partial<Record<PersonListFilterKey, string>>
}

function isView(value: string | null): value is PersonListView {
  return (PERSON_LIST_VIEWS as readonly string[]).includes(value ?? '')
}

/** The page state from the URL's query; unknown or blank values fall back to the defaults. */
export function readPersonListUrl(get: (key: string) => string | null): PersonListUrlState {
  const view = get('view')
  const page = Number(get('page'))
  const filters: PersonListUrlState['filters'] = {}
  for (const key of PERSON_LIST_FILTER_KEYS) {
    const value = get(key)?.trim()
    if (value) filters[key] = value
  }
  return {
    view: isView(view) ? view : 'all',
    search: get('search') ?? '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
    filters,
  }
}

/** The URL query of a page state, without the defaults (an empty query is the plain list). */
export function personListUrlParams(state: PersonListUrlState): Record<string, string> {
  const params: Record<string, string> = {}
  if (state.view !== 'all') params.view = state.view
  if (state.search.trim()) params.search = state.search
  for (const key of PERSON_LIST_FILTER_KEYS) {
    const value = state.filters[key]
    if (value) params[key] = value
  }
  if (state.page > 1) params.page = String(state.page)
  return params
}

/**
 * The list request's query of a page state: the URL parameters without the page, and the search only from two
 * characters on (the API's minimum).
 */
export function personListApiParams(state: PersonListUrlState): Record<string, string> {
  const params = personListUrlParams({ ...state, page: 1 })
  const search = state.search.trim()
  if (search.length >= 2) params.search = search
  else delete params.search
  return params
}

/** Whether any filter or a search narrows the list (the empty state then offers "Clear filters"). */
export function isPersonListFiltered(state: PersonListUrlState): boolean {
  return state.view !== 'all' || state.search.trim().length > 0 || Object.keys(state.filters).length > 0
}

/**
 * The page state without its most specific narrowing ("Remove last filter"): the last set filter in
 * `PERSON_LIST_FILTER_KEYS` order, else the perspective; the search stays. Back to page 1.
 */
export function withoutLastFilter(state: PersonListUrlState): PersonListUrlState {
  const last = [...PERSON_LIST_FILTER_KEYS].reverse().find((key) => state.filters[key] !== undefined)
  if (last === undefined) return { ...state, view: 'all', page: 1 }
  const filters = Object.fromEntries(
    Object.entries(state.filters).filter(([key]) => key !== last),
  ) as PersonListUrlState['filters']
  return { ...state, filters, page: 1 }
}

/** Whether "Remove last filter" has something to remove (a filter or a perspective). */
export function canRemoveLastFilter(state: PersonListUrlState): boolean {
  return state.view !== 'all' || Object.keys(state.filters).length > 0
}

/** A person's name as the list shows it: "Last First". */
export function listDisplayName(person: { firstName: string | null; lastName: string | null }): string {
  return [person.lastName, person.firstName].filter((part): part is string => Boolean(part)).join(' ')
}
