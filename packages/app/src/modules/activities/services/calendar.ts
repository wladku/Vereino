// The role calendars behind `GET /api/activities/calendar` and the member session view (club spec REQ-006, API row
// `/api/activities/calendar`, `/club`, `/club/calendar`, `/club/occurrences/[id]`; foundation II P-23; #32): a
// participant's own sessions (`as=self`), one calendar of every ward across every section (`as=guardian`), a coach's
// groups and substitutions (`as=coach`), a coordinator's sections (`as=coordinator`). Member reads never use
// `activities.view`: they are narrowed to the caller's own or wards' participant memberships, so a session outside
// them does not exist for the caller (404). Each item carries the declaration kind of its activity type, whether
// declarations are still open, the concerned persons' declarations and what they may do, and — for a guardian under
// `show_called_up_children = consented` — the names of the other called-up children whose guardians consented.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import {
  isServedCalendarRange,
  scopeWhere,
  type CalendarDate,
  type DateWindow,
  type GrantKind,
  type Scope,
} from '@vereino/core'
import { foundationErrors, scopeContract } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { Activity, Attendance, AttendancePolicy, Occurrence } from '../data/entities'
import type { CalendarPerspective } from '../data/validators'
import type { ActivityType, OccurrenceStatus } from '../lib/activities-rules'
import {
  declarationOutcome,
  declarationSummary,
  declarationWindow,
  isMinorOn,
  resolvePolicy,
  type Declared,
  type DeclarationKind,
  type DeclarationStatus,
  type DeclarationSummary,
} from '../lib/policy'
import { policyRows } from '../commands/attendance'
import {
  activeGuardians,
  attendanceSettings,
  findPersons,
  findPlaces,
  membershipsOf,
  presenceConsents,
  rosterOn,
  type ActivitiesScope,
} from './directory'
import { activityLabels, nameMaps } from './read'

export type CalendarDeclarationView = {
  attendanceId: string
  declared: Declared
  declarationStatus: DeclarationStatus
  declaredAt: string | null
  pendingUntil: string | null
  guardianDecidedAt: string | null
  updatedAt: string
}

/** One person the item concerns (the caller, or a ward) with their declaration and what they may do now. */
export type CalendarPersonView = {
  personId: string
  firstName: string
  lastName: string
  declaration: CalendarDeclarationView | null
  /** The person may declare now: declarations are open and the policy does not reserve it for the guardian. */
  canDeclare: boolean
  /** A declaration by this minor waits for the guardian (`guardian_confirm`). */
  needsGuardianConfirmation: boolean
  /** Only the guardian declares for this minor (`guardian_only`). */
  guardianOnly: boolean
}

export type CalendarOccurrenceView = {
  id: string
  activityId: string
  activityName: string | null
  activityType: ActivityType | null
  groupId: string
  groupName: string | null
  sectionId: string
  sectionName: string | null
  occurrenceDate: CalendarDate
  startAt: string
  endAt: string
  placeId: string
  placeName: string | null
  placeAddress: string | null
  placeGeoLat: number | null
  placeGeoLng: number | null
  coachPersonId: string | null
  coachName: string | null
  status: OccurrenceStatus
  cancelReason: string | null
  isDetached: boolean
  needsReschedule: boolean
  updatedAt: string
}

export type CalendarEntry = {
  occurrence: CalendarOccurrenceView
  declarationKind: DeclarationKind
  declarationsOpen: boolean
  /** The caller (`self`) or the wards the session concerns (`guardian`); empty for staff perspectives. */
  persons: CalendarPersonView[]
  /** Staff perspectives: the session's declaration counts per the kind (AC-007). */
  summary?: DeclarationSummary
  /** `as=guardian` under `show_called_up_children = consented`: other children whose guardian consented. */
  calledUpChildren?: { personId: string; firstName: string; lastName: string }[]
}

export type CalendarResult = {
  items: CalendarEntry[]
  timeZone: string
  from: CalendarDate
  to: CalendarDate
}

type CalendarQuery = {
  from: CalendarDate
  to: CalendarDate
  as: CalendarPerspective
  personId?: string
  sectionId?: string
}

function iso(value: Date): string {
  return value.toISOString()
}

function grantIds(scope: Scope, kind: GrantKind): string[] {
  return scope.filter((grant) => grant.kind === kind).flatMap((grant) => [...(grant.ids ?? [])])
}

/** The persons a member perspective reads for: the caller (`self`) or the wards (`guardian`, optionally one). */
async function memberPersons(scope: Scope, as: 'self' | 'guardian', personId?: string): Promise<string[]> {
  if (as === 'self') {
    const self = grantIds(scope, 'self')[0]
    if (!self) return foundationErrors.throw('scope_denied')
    if (personId && personId !== self) return foundationErrors.throw('scope_denied')
    return [self]
  }
  const wards = grantIds(scope, 'guardian')
  if (personId) {
    if (!wards.includes(personId)) return foundationErrors.throw('scope_denied')
    return [personId]
  }
  return wards
}

async function assertStaffFeature(ctx: CommandRuntimeContext, scope: ActivitiesScope, feature: string): Promise<void> {
  const userId = ctx.auth?.sub
  if (!userId) return foundationErrors.throw('scope_denied')
  const rbac = ctx.container.resolve<RbacService>('rbacService')
  if (!(await rbac.userHasAllFeatures(userId, [feature], scope))) return foundationErrors.throw('scope_denied')
}

type Names = Awaited<ReturnType<typeof nameMaps>> & { activities: Awaited<ReturnType<typeof activityLabels>> }

async function loadNames(ctx: CommandRuntimeContext, scope: ActivitiesScope, rows: Occurrence[]): Promise<Names> {
  const [names, activities] = await Promise.all([
    nameMaps(ctx.container, scope, {
      groupIds: rows.map((row) => row.groupId),
      sectionIds: rows.map((row) => row.sectionId),
      placeIds: rows.map((row) => row.placeId),
      personIds: rows.flatMap((row) => (row.coachPersonId ? [row.coachPersonId] : [])),
    }),
    activityLabels(
      ctx.container,
      scope,
      rows.map((row) => row.activityId),
    ),
  ])
  return { ...names, activities }
}

function placeDetails(ctx: CommandRuntimeContext, scope: ActivitiesScope, placeIds: string[]) {
  return findPlaces(ctx.container, scope, placeIds)
}

function occurrenceView(
  row: Occurrence,
  names: Names,
  places: Awaited<ReturnType<typeof placeDetails>>,
): CalendarOccurrenceView {
  const activity = names.activities.get(row.activityId)
  const place = places.get(row.placeId)
  return {
    id: row.id,
    activityId: row.activityId,
    activityName: activity?.name ?? null,
    activityType: (activity?.type as ActivityType | undefined) ?? null,
    groupId: row.groupId,
    groupName: names.groups.get(row.groupId) ?? null,
    sectionId: row.sectionId,
    sectionName: names.sections.get(row.sectionId) ?? null,
    occurrenceDate: row.occurrenceDate,
    startAt: iso(row.startAt),
    endAt: iso(row.endAt),
    placeId: row.placeId,
    placeName: place?.name ?? null,
    placeAddress: place?.address ?? null,
    placeGeoLat: place?.geoLat ?? null,
    placeGeoLng: place?.geoLng ?? null,
    coachPersonId: row.coachPersonId ?? null,
    coachName: row.coachPersonId ? (names.persons.get(row.coachPersonId) ?? null) : null,
    status: row.status,
    cancelReason: row.cancelReason ?? null,
    isDetached: row.isDetached,
    needsReschedule: row.needsReschedule,
    updatedAt: iso(row.updatedAt),
  }
}

function declarationView(row: Attendance | undefined): CalendarDeclarationView | null {
  if (!row) return null
  return {
    attendanceId: row.id,
    declared: row.declared,
    declarationStatus: row.declarationStatus,
    declaredAt: row.declaredAt?.toISOString() ?? null,
    pendingUntil: row.pendingUntil?.toISOString() ?? null,
    guardianDecidedAt: row.guardianDecidedAt?.toISOString() ?? null,
    updatedAt: iso(row.updatedAt),
  }
}

const activeOn = (period: { validFrom: CalendarDate; validTo: CalendarDate | null }, date: CalendarDate): boolean =>
  period.validFrom <= date && (period.validTo === null || period.validTo >= date)

/**
 * The member calendar: the sessions of the groups the persons are participants of on each session date, in the window,
 * with each concerned person's declaration and options.
 */
async function memberCalendar(
  ctx: CommandRuntimeContext,
  scope: ActivitiesScope,
  as: 'self' | 'guardian',
  personIds: string[],
  window: DateWindow,
  now: Date,
  onlyOccurrenceId?: string,
): Promise<CalendarEntry[]> {
  if (personIds.length === 0) return []
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const memberships = (await membershipsOf(ctx.container, scope, personIds, window)).filter(
    (membership) => membership.role === 'participant',
  )
  const groupIds = [...new Set(memberships.map((membership) => membership.groupId))]
  if (groupIds.length === 0) return []
  const rows = await em.find(
    Occurrence,
    {
      ...scope,
      deletedAt: null,
      groupId: { $in: groupIds },
      occurrenceDate: { $gte: window.from, $lte: window.to },
      ...(onlyOccurrenceId ? { id: onlyOccurrenceId } : {}),
    },
    { orderBy: { startAt: 'asc', id: 'asc' } },
  )
  const concerned = new Map<string, string[]>()
  for (const row of rows) {
    const persons = [
      ...new Set(
        memberships
          .filter((membership) => membership.groupId === row.groupId && activeOn(membership, row.occurrenceDate))
          .map((membership) => membership.personId),
      ),
    ].sort()
    if (persons.length > 0) concerned.set(row.id, persons)
  }
  const visible = rows.filter((row) => concerned.has(row.id))
  if (visible.length === 0) return []
  const [names, places, persons, settings, policies, declarations] = await Promise.all([
    loadNames(ctx, scope, visible),
    placeDetails(
      ctx,
      scope,
      visible.map((row) => row.placeId),
    ),
    findPersons(ctx.container, scope, personIds),
    attendanceSettings(ctx.container, scope),
    em.find(AttendancePolicy, { ...scope, deletedAt: null }).then(policyRows),
    em.find(Attendance, {
      ...scope,
      deletedAt: null,
      occurrenceId: { $in: visible.map((row) => row.id) },
      personId: { $in: personIds },
    }),
  ])
  const declarationByKey = new Map(declarations.map((row) => [`${row.occurrenceId}:${row.personId}`, row]))
  const calledUp =
    as === 'guardian' && settings.showCalledUpChildren === 'consented'
      ? await calledUpChildren(ctx, scope, visible, personIds)
      : null
  return visible.map((row) => {
    const activity = names.activities.get(row.activityId)
    const activityType = (activity?.type as ActivityType | undefined) ?? 'other'
    const kind = settings.declarationKinds[activityType] ?? 'confirm'
    const open = declarationWindow(row, now) === 'open'
    const policy = resolvePolicy(policies, { groupId: row.groupId, activityType, isAway: false })
    const personViews = (concerned.get(row.id) ?? []).map((personId): CalendarPersonView => {
      const person = persons.get(personId)
      const minor = isMinorOn(person?.birthDate ?? null, row.occurrenceDate)
      const selfOutcome = declarationOutcome({ actingRole: 'self', isMinor: minor, policy, now })
      const guardianOnly = as === 'self' && selfOutcome.kind === 'guardian_only'
      return {
        personId,
        firstName: person?.firstName ?? '',
        lastName: person?.lastName ?? '',
        declaration: declarationView(declarationByKey.get(`${row.id}:${personId}`)),
        canDeclare: open && !guardianOnly,
        needsGuardianConfirmation: as === 'self' && selfOutcome.kind === 'pending_guardian',
        guardianOnly,
      }
    })
    return {
      occurrence: occurrenceView(row, names, places),
      declarationKind: kind,
      declarationsOpen: open,
      persons: personViews,
      ...(calledUp ? { calledUpChildren: calledUp.get(row.id) ?? [] } : {}),
    }
  })
}

/**
 * The other called-up children a guardian may see (REQ-006, R15, A09): the session's participants other than the
 * caller's own wards whose active guardian gave `share_presence_with_guardians_at` — first and last names only.
 */
async function calledUpChildren(
  ctx: CommandRuntimeContext,
  scope: ActivitiesScope,
  rows: Occurrence[],
  ownWardIds: readonly string[],
): Promise<Map<string, { personId: string; firstName: string; lastName: string }[]>> {
  const own = new Set(ownWardIds)
  const rosters = await Promise.all(
    rows.map(async (row) => ({
      occurrenceId: row.id,
      date: row.occurrenceDate,
      participants: (await rosterOn(ctx.container, scope, row.groupId, row.occurrenceDate))
        .filter((member) => member.role === 'participant' && !own.has(member.personId))
        .map((member) => member.personId),
    })),
  )
  const childIds = [...new Set(rosters.flatMap((roster) => roster.participants))]
  if (childIds.length === 0) return new Map()
  // Guardianships are checked on each session's date; one lookup per distinct date keeps it bounded.
  const dates = [...new Set(rosters.map((roster) => roster.date))]
  const guardiansByDate = new Map(
    await Promise.all(
      dates.map(async (date) => [date, await activeGuardians(ctx.container, scope, childIds, date)] as const),
    ),
  )
  const guardianIds = [...new Set([...guardiansByDate.values()].flatMap((byWard) => [...byWard.values()].flat()))]
  const consenting = await presenceConsents(ctx.container, scope, guardianIds)
  const persons = await findPersons(ctx.container, scope, childIds)
  const result = new Map<string, { personId: string; firstName: string; lastName: string }[]>()
  for (const roster of rosters) {
    const byWard = guardiansByDate.get(roster.date) ?? new Map<string, string[]>()
    const shown = roster.participants
      .filter((childId) => (byWard.get(childId) ?? []).some((guardianId) => consenting.has(guardianId)))
      .flatMap((childId) => {
        const person = persons.get(childId)
        return person ? [{ personId: childId, firstName: person.firstName, lastName: person.lastName }] : []
      })
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
    result.set(roster.occurrenceId, shown)
  }
  return result
}

/** The staff calendars: a coach's groups and own sessions, a coordinator's sections — through the record scope. */
async function staffCalendar(
  ctx: CommandRuntimeContext,
  scope: ActivitiesScope,
  grants: Scope,
  as: 'coach' | 'coordinator',
  window: DateWindow,
  now: Date,
  sectionId?: string,
): Promise<CalendarEntry[]> {
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const kinds: readonly GrantKind[] = as === 'coach' ? ['coach'] : ['coordinator', 'club_admin']
  const scoped = scopeWhere(grants, kinds, { sectionId: 'sectionId', groupId: 'groupId', occurrenceId: 'id' })
  if ('id' in scoped && as === 'coordinator') return []
  const self = grantIds(grants, 'self')[0]
  const where =
    as === 'coach'
      ? 'id' in scoped
        ? self
          ? { coachPersonId: self }
          : null
        : self
          ? { $or: [scoped, { coachPersonId: self }] }
          : scoped
      : scoped
  if (where === null) return []
  const rows = await em.find(
    Occurrence,
    {
      ...scope,
      deletedAt: null,
      occurrenceDate: { $gte: window.from, $lte: window.to },
      // The requested section narrows the scope filter, never replaces it.
      $and: [where as object, ...(sectionId ? [{ sectionId }] : [])],
    },
    { orderBy: { startAt: 'asc', id: 'asc' } },
  )
  if (rows.length === 0) return []
  const [names, places, settings, declarations] = await Promise.all([
    loadNames(ctx, scope, rows),
    placeDetails(
      ctx,
      scope,
      rows.map((row) => row.placeId),
    ),
    attendanceSettings(ctx.container, scope),
    em.find(Attendance, { ...scope, deletedAt: null, occurrenceId: { $in: rows.map((row) => row.id) } }),
  ])
  const rosters = await Promise.all(
    rows.map(async (row) => [row.id, await rosterOn(ctx.container, scope, row.groupId, row.occurrenceDate)] as const),
  )
  const rosterById = new Map(rosters)
  return rows.map((row) => {
    const activity = names.activities.get(row.activityId)
    const activityType = (activity?.type as ActivityType | undefined) ?? 'other'
    const kind = settings.declarationKinds[activityType] ?? 'confirm'
    const participants = (rosterById.get(row.id) ?? [])
      .filter((member) => member.role === 'participant')
      .map((member) => member.personId)
    return {
      occurrence: occurrenceView(row, names, places),
      declarationKind: kind,
      declarationsOpen: declarationWindow(row, now) === 'open',
      persons: [],
      summary: declarationSummary(
        kind,
        participants,
        declarations.filter((declaration) => declaration.occurrenceId === row.id),
      ),
    }
  })
}

/** `GET /api/activities/calendar`. */
export async function readCalendar(
  ctx: CommandRuntimeContext,
  scope: ActivitiesScope,
  query: CalendarQuery,
  now: Date = new Date(),
): Promise<CalendarResult> {
  const window = { from: query.from, to: query.to }
  if (!isServedCalendarRange(window)) await activitiesErrors.throw('calendar_range_invalid')
  const grants = await scopeContract.resolve(ctx)
  const { timeZone } = await attendanceSettings(ctx.container, scope)
  let items: CalendarEntry[]
  if (query.as === 'self' || query.as === 'guardian') {
    const personIds = await memberPersons(grants, query.as, query.personId)
    items = await memberCalendar(ctx, scope, query.as, personIds, window, now)
  } else {
    await assertStaffFeature(ctx, scope, query.as === 'coach' ? 'activities.coach' : 'activities.view')
    items = await staffCalendar(ctx, scope, grants, query.as, window, now, query.sectionId)
  }
  return { items, timeZone, from: query.from, to: query.to }
}

/** `GET /api/activities/calendar/{id}`: one session of the member calendar, or null when it is not in it. */
export async function readCalendarItem(
  ctx: CommandRuntimeContext,
  scope: ActivitiesScope,
  id: string,
  as: 'self' | 'guardian',
  personId: string | undefined,
  now: Date = new Date(),
): Promise<(CalendarEntry & { timeZone: string }) | null> {
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const row = await em.findOne(Occurrence, { id, ...scope, deletedAt: null }, { fields: ['id', 'occurrenceDate'] })
  if (!row) return null
  const grants = await scopeContract.resolve(ctx)
  const personIds = await memberPersons(grants, as, personId)
  const window = { from: row.occurrenceDate, to: row.occurrenceDate }
  const item = (await memberCalendar(ctx, scope, as, personIds, window, now, row.id)).at(0)
  if (!item) return null
  const { timeZone } = await attendanceSettings(ctx.container, scope)
  return { ...item, timeZone }
}

/** The activity of a session, for callers that need its type outside the calendar (the Today tile's labels). */
export async function activityOf(
  em: EntityManager,
  scope: ActivitiesScope,
  activityId: string,
): Promise<Activity | null> {
  return em.findOne(Activity, { id: activityId, ...scope })
}
