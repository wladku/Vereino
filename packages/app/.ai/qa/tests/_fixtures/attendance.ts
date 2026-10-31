// Helpers of the member calendar and declaration integration tests of issue #32 (club spec phase 2 steps 4, 5 and 10;
// TEST-008, TEST-009, TEST-011, TEST-055 presence part): the role calendars, declarations, guardian decisions and
// policies through the API, the expiry job through the module CLI, and the TEST-008 family — two sections, a guardian
// of two wards, a second family, a coach, an instructor and the coordinator of each section.
import { expect, type APIRequestContext } from '@playwright/test'
import {
  addDays,
  createActivity,
  listOccurrences,
  nextWeekday,
  type OccurrenceItem,
  type WeekdayCode,
} from './activities'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createAccount,
  createPerson,
  mercato,
  signInAs,
  uniqueSuffix,
  userRoles,
  type Club,
} from './club'
import { create as createStructure } from './club-structure'
import { addMembership, createGroup, signedInStaff } from './groups'
import { updateClubSettings } from './members'
import { createGuardianship } from './people'

export type CodedBody = { error?: string; code?: string }

export type CalendarDeclaration = {
  attendanceId: string
  declared: 'yes' | 'no' | 'unknown'
  declarationStatus: 'final' | 'pending_guardian' | 'rejected_by_guardian'
  declaredAt: string | null
  pendingUntil: string | null
  guardianDecidedAt: string | null
  updatedAt: string
}

export type CalendarPerson = {
  personId: string
  firstName: string
  lastName: string
  declaration: CalendarDeclaration | null
  canDeclare: boolean
  needsGuardianConfirmation: boolean
  guardianOnly: boolean
}

export type CalendarSummary = {
  kind: 'absence_only' | 'confirm'
  expected: number
  absent: number
  confirmed: number
  declined: number
  unanswered: number
}

export type CalendarEntry = {
  occurrence: {
    id: string
    activityId: string
    activityName: string | null
    activityType: string | null
    groupId: string
    groupName: string | null
    sectionId: string
    sectionName: string | null
    occurrenceDate: string
    startAt: string
    endAt: string
    placeId: string
    placeName: string | null
    placeAddress: string | null
    placeGeoLat: number | null
    placeGeoLng: number | null
    coachPersonId: string | null
    coachName: string | null
    status: string
    updatedAt: string
  }
  declarationKind: 'absence_only' | 'confirm'
  declarationsOpen: boolean
  persons: CalendarPerson[]
  summary?: CalendarSummary
  calledUpChildren?: { personId: string; firstName: string; lastName: string }[]
}

export type CalendarResult = CodedBody & { items?: CalendarEntry[]; timeZone?: string; from?: string; to?: string }

export type AttendanceResult = CodedBody & {
  id?: string
  occurrenceId?: string
  personId?: string
  declared?: string
  declaredByPersonId?: string | null
  declaredAt?: string | null
  declarationStatus?: 'final' | 'pending_guardian' | 'rejected_by_guardian'
  guardianDecidedAt?: string | null
  pendingUntil?: string | null
  source?: 'app' | 'link' | 'staff'
  updatedAt?: string
  actingRole?: string
  created?: boolean
}

export type PolicyItem = {
  id: string
  scope: string | null
  groupId: string | null
  groupName?: string | null
  activityType: string | null
  minorDeclarationMode: string | null
  confirmTimeoutHours: number | null
  defaultAfterTimeout: string | null
  updatedAt: string | null
}

// --- Calendars ---

/** `GET /api/activities/calendar?<query>` (`query` without the leading `?`, e.g. `from=…&to=…&as=guardian`). */
export async function readCalendar(request: APIRequestContext, token: string, query: string) {
  return call<CalendarResult>(request, 'GET', `/api/activities/calendar?${query}`, token)
}

/** The calendar entries of a query (200 expected). */
export async function calendarItems(
  request: APIRequestContext,
  token: string,
  query: string,
): Promise<CalendarEntry[]> {
  const result = await readCalendar(request, token, query)
  expect(result.status, `GET /api/activities/calendar?${query} ${JSON.stringify(result.body)}`).toBe(200)
  return result.body?.items ?? []
}

/** `GET /api/activities/calendar/{id}?<query>` (`as=self|guardian[&personId=…]`). */
export async function readCalendarItem(request: APIRequestContext, token: string, id: string, query: string) {
  return call<CalendarEntry & CodedBody & { timeZone?: string }>(
    request,
    'GET',
    `/api/activities/calendar/${id}?${query}`,
    token,
  )
}

/** The calendar entry of one session in a result (fails when it is absent). */
export function entryOf(items: CalendarEntry[], occurrenceId: string): CalendarEntry {
  const entry = items.find((item) => item.occurrence.id === occurrenceId)
  if (!entry) throw new Error(`[test] session ${occurrenceId} is not in the calendar: ${JSON.stringify(items)}`)
  return entry
}

/** The declaration of one person in a calendar entry (fails when the person is absent). */
export function personOf(entry: CalendarEntry, personId: string): CalendarPerson {
  const person = entry.persons.find((item) => item.personId === personId)
  if (!person) throw new Error(`[test] person ${personId} is not in the entry: ${JSON.stringify(entry)}`)
  return person
}

// --- Declarations ---

export async function declare(
  request: APIRequestContext,
  token: string,
  data: { occurrenceId: string; personId: string; declared: 'yes' | 'no' | 'unknown' },
) {
  return call<AttendanceResult>(request, 'POST', '/api/activities/attendance/declare', token, { data })
}

/** The guardian's decision against the declaration's version (`lockToken`, the row's `updatedAt`; S5.2). */
export async function guardianDecide(
  request: APIRequestContext,
  token: string,
  attendanceId: string,
  approve: boolean,
  lockToken: string | null | undefined,
) {
  return call<AttendanceResult>(
    request,
    'POST',
    `/api/activities/attendance/${attendanceId}/guardian-decision`,
    token,
    {
      data: { approve },
      headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {},
    },
  )
}

// --- Policies ---

export async function listPolicies(
  request: APIRequestContext,
  token: string,
  query = '',
): Promise<{ status: number; items: PolicyItem[] }> {
  const result = await call<{ items?: PolicyItem[] }>(
    request,
    'GET',
    `/api/activities/attendance-policies?pageSize=100${query}`,
    token,
  )
  return { status: result.status, items: result.body?.items ?? [] }
}

export async function postPolicy(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<CodedBody & { id?: string }>(request, 'POST', '/api/activities/attendance-policies', token, { data })
}

/** Creates a policy (201 expected) and returns its id. */
export async function createPolicy(
  request: APIRequestContext,
  token: string,
  data: Record<string, unknown>,
): Promise<string> {
  const result = await postPolicy(request, token, data)
  expect(result.status, `POST /api/activities/attendance-policies ${JSON.stringify(result.body)}`).toBe(201)
  return String(result.body?.id)
}

/** `PUT /api/activities/attendance-policies` with the given lock token. */
export async function updatePolicy(
  request: APIRequestContext,
  token: string,
  data: Record<string, unknown> & { id: string },
  lockToken: string | null | undefined,
) {
  return call<CodedBody & { ok?: boolean; updatedAt?: string; actingRole?: string }>(
    request,
    'PUT',
    '/api/activities/attendance-policies',
    token,
    { data, headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {} },
  )
}

/** The policies a club starts with (`lib/policy.ts` `DEFAULT_POLICIES`): the club `immediate`, matches, tournaments, camps and away trips `guardian_confirm`. */
const DEFAULT_POLICY_ROWS: readonly Record<string, unknown>[] = [
  { scope: 'club', minorDeclarationMode: 'immediate', confirmTimeoutHours: 24, defaultAfterTimeout: 'declared' },
  ...['match', 'tournament', 'camp'].map((activityType) => ({
    scope: 'activity_type',
    activityType,
    minorDeclarationMode: 'guardian_confirm',
    confirmTimeoutHours: 24,
    defaultAfterTimeout: 'declared',
  })),
  {
    scope: 'away_trip',
    minorDeclarationMode: 'guardian_confirm',
    confirmTimeoutHours: 24,
    defaultAfterTimeout: 'declared',
  },
]

/**
 * Makes sure the club has the default policies `setup.ts` seeds for a club set up by `mercato init`. A tenant created
 * through the API runs no `seedDefaults` (lesson `scoped-crud-lists-and-api-created-tenants`), so a missing row is
 * created here through the API; a club that already has them is left as it is.
 */
export async function ensureDefaultPolicies(request: APIRequestContext, club: Club): Promise<void> {
  const existing = await listPolicies(request, club.adminToken)
  expect(existing.status, 'GET /api/activities/attendance-policies').toBe(200)
  const present = new Set(existing.items.map((item) => `${item.scope ?? ''}:${item.activityType ?? ''}`))
  for (const row of DEFAULT_POLICY_ROWS) {
    const key = `${String(row.scope)}:${typeof row.activityType === 'string' ? row.activityType : ''}`
    if (present.has(key)) continue
    await createPolicy(request, club.adminToken, row)
  }
}

// --- The expiry job ---

export type ExpiryResult = { now: string; processed: number; skipped: number; failed: number; changedIds: string[] }

/** Runs `yarn mercato activities expire-guardian-confirmations` for the club as of `nowIso`. */
export function runExpiry(club: Club, nowIso: string): ExpiryResult {
  const result = mercato([
    'activities',
    'expire-guardian-confirmations',
    '--tenant',
    club.tenant.tenantId,
    '--org',
    club.tenant.organizationId,
    '--now',
    nowIso,
  ]) as ExpiryResult | null
  if (!result) throw new Error('[internal] activities expire-guardian-confirmations printed no result')
  return result
}

/** An ISO instant `hours` after `instant`. */
export function hoursAfter(instant: string, hours: number): string {
  return new Date(Date.parse(instant) + hours * 3_600_000).toISOString()
}

// --- Members and sessions ---

export type Member = { personId: string; userId: string; email: string; token: string }

/**
 * Creates the person's account, waits for the role sync to give it `vereino_member` (the feature gates `people.self`
 * and `activities.attendance.declare` come from it) and signs in with a fresh token.
 */
export async function memberAccount(
  request: APIRequestContext,
  club: Club,
  personId: string,
  label: string,
): Promise<Member> {
  const email = `${label}-${uniqueSuffix()}@example.org`
  const account = await createAccount(request, club.adminToken, personId, email)
  expect(account.status, `create account ${label} ${JSON.stringify(account.body)}`).toBe(201)
  const userId = String(account.body?.userId)
  club.extraUserIds.push(userId)
  await expect.poll(() => userRoles(request, club, userId), { timeout: 20_000 }).toContain('vereino_member')
  const token = await signInAs(request, club, userId, email)
  return { personId, userId, email, token }
}

/** The planned sessions of an activity (read as the club administrator), oldest first. */
export async function sessionsOf(
  request: APIRequestContext,
  club: Club,
  activityId: string,
): Promise<OccurrenceItem[]> {
  const result = await listOccurrences(request, club.adminToken, `&activityId=${activityId}`)
  expect(result.status, `GET /api/activities/occurrences?activityId=${activityId}`).toBe(200)
  return result.items
}

/** The sessions that start more than an hour from now (declarations stay open for the whole test). */
export function upcoming(sessions: readonly OccurrenceItem[]): OccurrenceItem[] {
  const limit = Date.now() + 3_600_000
  return sessions.filter((session) => session.status === 'planned' && Date.parse(String(session.startAt)) > limit)
}

/** The first session on or after `date` (a future one-off's own session, or the next in a series). */
export function firstSession(sessions: readonly OccurrenceItem[]): OccurrenceItem {
  const session = upcoming(sessions).at(0)
  if (!session) throw new Error(`[test] no upcoming session: ${JSON.stringify(sessions)}`)
  return session
}

/**
 * A weekly series from today to 30 June next year (`FREQ=WEEKLY;BYDAY=<weekday>`), created by `token`; returns the
 * activity id and its generated sessions.
 */
export async function weeklySeries(
  request: APIRequestContext,
  club: Club,
  token: string,
  input: {
    groupId: string
    placeId: string
    name: string
    type: string
    weekday: WeekdayCode
    start: string
    end: string
  },
): Promise<{ activityId: string; sessions: OccurrenceItem[] }> {
  const today = calendarDate()
  const year = Number(today.slice(0, 4)) + 1
  const { id } = await createActivity(request, token, {
    groupId: input.groupId,
    name: input.name,
    type: input.type,
    placeId: input.placeId,
    recurrenceRule: `FREQ=WEEKLY;BYDAY=${input.weekday};UNTIL=${String(year)}0630`,
    startsOn: today,
    startTime: input.start,
    endTime: input.end,
  })
  return { activityId: id, sessions: await sessionsOf(request, club, id) }
}

/**
 * A one-off activity on the first `weekday` at least `fromDaysAhead` days ahead (a match or a sparring on a team),
 * created by `token`; returns the activity id and its single session.
 */
export async function oneOff(
  request: APIRequestContext,
  club: Club,
  token: string,
  input: {
    groupId: string
    placeId: string
    name: string
    type: string
    weekday: WeekdayCode
    fromDaysAhead: number
    start: string
    end: string
  },
): Promise<{ activityId: string; date: string; session: OccurrenceItem }> {
  const date = nextWeekday(addDays(calendarDate(), input.fromDaysAhead), input.weekday)
  const { id } = await createActivity(request, token, {
    groupId: input.groupId,
    name: input.name,
    type: input.type,
    placeId: input.placeId,
    startsOn: date,
    startTime: input.start,
    endTime: input.end,
  })
  const sessions = await sessionsOf(request, club, id)
  const session = sessions.at(0)
  if (!session) throw new Error(`[internal] the one-off activity ${id} has no session`)
  expect(session.occurrenceDate).toBe(date)
  return { activityId: id, date, session }
}

// --- The TEST-008 family ---

export const PITCH_ADDRESS = 'ul. Sportowa 1, 00-001 Warszawa'
export const PITCH_GEO = { lat: 52.2297, lng: 21.0122 }
export const POOL_ADDRESS = 'al. Pływacka 7, 00-002 Warszawa'
export const POOL_GEO = { lat: 52.2401, lng: 21.0005 }

export type Family = {
  /** The section ids. */
  academy: string
  pool: string
  /** The places: the pitch (with an address and coordinates), the pool and a locker room no series uses. */
  pitch: string
  poolPlace: string
  lockerRoom: string
  /** The groups: Żaki (`team`, academy) and "Basen — początkujący" (`class_group`, pool). */
  zaki: string
  poolGroup: string
  /** The guardian of two wards, signed in. */
  guardian: Member
  /** The 14-year-old ward (Żaki and the pool group), without an account. */
  younger: { personId: string; firstName: string; lastName: string }
  /** The 16-year-old ward (Żaki only), with an account. */
  elder: Member & { firstName: string; lastName: string }
  /** The unrelated family: a guardian with an account and a child in Żaki. */
  other: { guardian: Member; child: { personId: string; firstName: string; lastName: string } }
  /** The coach of Żaki (`vereino_coach` role and a `coach` membership). */
  coach: { personId: string; userId: string; token: string }
  /** The instructor of the pool group (`vereino_coach` role and a `coach` membership). */
  instructor: { personId: string; userId: string; token: string }
  academyCoordinator: { personId: string; userId: string; token: string }
  poolCoordinator: { personId: string; userId: string; token: string }
}

/**
 * The TEST-008 family (club spec *Integration Coverage*): two sections — the football academy with the `team` group Żaki
 * on a pitch with an address and coordinates, and the pool with the `class_group` "Basen — początkujący" on a pool
 * place — a guardian of two wards (a 14-year-old in both groups, a 16-year-old with an account in Żaki), a second
 * unrelated family with a child in Żaki, the coach of Żaki, the instructor of the pool group and the coordinator of
 * each section. `own_account_min_age` is lowered to 13 first and the default declaration policies are ensured.
 */
export async function familyFor(request: APIRequestContext, club: Club): Promise<Family> {
  const admin = club.adminToken
  const settings = await updateClubSettings(request, admin, { ownAccountMinAge: 13 })
  expect(settings.status, `PUT /api/club_core/settings ${JSON.stringify(settings.body)}`).toBe(200)
  await ensureDefaultPolicies(request, club)

  const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
  const pool = await createStructure(request, admin, 'sections', { name: 'Basen' })
  const pitch = await createStructure(request, admin, 'places', {
    name: 'Boisko A',
    kind: 'pitch',
    address: PITCH_ADDRESS,
    geoLat: PITCH_GEO.lat,
    geoLng: PITCH_GEO.lng,
  })
  const poolPlace = await createStructure(request, admin, 'places', {
    name: 'Pływalnia miejska',
    kind: 'pool',
    address: POOL_ADDRESS,
    geoLat: POOL_GEO.lat,
    geoLng: POOL_GEO.lng,
  })
  const lockerRoom = await createStructure(request, admin, 'places', { name: 'Szatnia', kind: 'locker_room' })
  const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
  const poolGroup = await createGroup(request, admin, {
    sectionId: pool,
    name: 'Basen — początkujący',
    kind: 'class_group',
  })

  const guardianId = await createPerson(request, admin, {
    firstName: 'Anna',
    lastName: 'Kowalska',
    birthDate: birthDateTurning(39),
  })
  const youngerNames = { firstName: 'Hania', lastName: 'Kowalska' }
  const younger = {
    personId: await createPerson(request, admin, { ...youngerNames, birthDate: birthDateTurning(14) }),
    ...youngerNames,
  }
  const elderNames = { firstName: 'Kuba', lastName: 'Kowalski' }
  const elderId = await createPerson(request, admin, { ...elderNames, birthDate: birthDateTurning(16) })
  const otherGuardianId = await createPerson(request, admin, {
    firstName: 'Piotr',
    lastName: 'Nowak',
    birthDate: birthDateTurning(41),
  })
  const otherChildNames = { firstName: 'Stanislaw', lastName: 'Nowak' }
  const otherChild = {
    personId: await createPerson(request, admin, { ...otherChildNames, birthDate: birthDateTurning(12) }),
    ...otherChildNames,
  }

  const since = addDays(calendarDate(), -30)
  for (const wardId of [younger.personId, elderId]) {
    await createGuardianship(request, admin, {
      guardianPersonId: guardianId,
      wardPersonId: wardId,
      isPrimaryPayer: true,
      consents: { regulations: true },
      validFrom: since,
    })
  }
  await createGuardianship(request, admin, {
    guardianPersonId: otherGuardianId,
    wardPersonId: otherChild.personId,
    isPrimaryPayer: true,
    consents: { regulations: true },
    validFrom: since,
  })
  for (const [groupId, personId] of [
    [zaki, younger.personId],
    [poolGroup, younger.personId],
    [zaki, elderId],
    [zaki, otherChild.personId],
  ]) {
    await addMembership(request, admin, { groupId, personId, role: 'participant', validFrom: since })
  }

  const guardian = await memberAccount(request, club, guardianId, 'anna')
  const elder = { ...(await memberAccount(request, club, elderId, 'kuba')), ...elderNames }
  const otherGuardian = await memberAccount(request, club, otherGuardianId, 'piotr')

  const coach = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Trener', role: 'coach' })
  await addMembership(request, admin, { groupId: zaki, personId: coach.personId, role: 'coach', validFrom: since })
  const instructor = await signedInStaff(request, club, { firstName: 'Irena', lastName: 'Instruktor', role: 'coach' })
  await addMembership(request, admin, {
    groupId: poolGroup,
    personId: instructor.personId,
    role: 'coach',
    validFrom: since,
  })
  const academyCoordinator = await signedInStaff(request, club, {
    firstName: 'Krystyna',
    lastName: 'Koordynator',
    role: 'coordinator',
    sectionId: academy,
  })
  const poolCoordinator = await signedInStaff(request, club, {
    firstName: 'Bogdan',
    lastName: 'Basenowy',
    role: 'coordinator',
    sectionId: pool,
  })

  return {
    academy,
    pool,
    pitch,
    poolPlace,
    lockerRoom,
    zaki,
    poolGroup,
    guardian,
    younger,
    elder,
    other: { guardian: otherGuardian, child: otherChild },
    coach,
    instructor,
    academyCoordinator,
    poolCoordinator,
  }
}

/** Both sections' weekly series: Żaki training (Tuesdays 17:00–18:30 on the pitch) and the pool class (Thursdays 18:00–19:00). */
export async function bothSeries(
  request: APIRequestContext,
  club: Club,
  family: Family,
): Promise<{
  training: { activityId: string; sessions: OccurrenceItem[] }
  poolClass: { activityId: string; sessions: OccurrenceItem[] }
}> {
  const training = await weeklySeries(request, club, family.academyCoordinator.token, {
    groupId: family.zaki,
    placeId: family.pitch,
    name: 'Trening Żaków',
    type: 'training',
    weekday: 'TU',
    start: '17:00',
    end: '18:30',
  })
  const poolClass = await weeklySeries(request, club, family.poolCoordinator.token, {
    groupId: family.poolGroup,
    placeId: family.poolPlace,
    name: 'Nauka pływania',
    type: 'training',
    weekday: 'TH',
    start: '18:00',
    end: '19:00',
  })
  return { training, poolClass }
}
