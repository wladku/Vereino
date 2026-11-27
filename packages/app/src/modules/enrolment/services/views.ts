// The reads of `enrolment` (sign-up form spec P-J2, P-J4, M-J1…M-J3, B-J1, REQ-J10, REQ-J11, REQ-J17; #799):
// - the public form of a section: the club's header, the reference date, the texts and the offered groups with their
//   fit rule and a `full` flag only (Q-J04: no counts);
// - the applicant's status view, read through the status link inside the slug's club (DD-J07): only that application;
// - the coordinator's list and detail: the sections the caller decides (BR-J5), the flags (REQ-J11), the computed
//   waiting numbers (DD-J09), the overdue rule (*Answer time*). Names are encrypted without a hash, so `q` filters in
//   memory over the already scoped rows (at most `LIST_CAP`); the Closed tab is not searchable.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { CalendarDate, Scope } from '@vereino/core'
import type { ApplicationTarget } from '../../groups/services/application-targets'
import type { PublicClubFrame } from '../../club_core/services/public-site'
import { Application } from '../data/entities'
import type { ApplicationListQuery } from '../data/validators'
import { deciderSections } from '../lib/access'
import { ageFitOf, ageOnReference, ageReferenceDate } from '../lib/age'
import {
  applicationFlags,
  closedTabSince,
  comparableName,
  isGroupFull,
  isOverdue,
  tabOf,
  tabStates,
  waitingNumbers,
  type ApplicationFlag,
  type ApplicationTab,
} from '../lib/applications'
import { isDecidableState } from '../lib/states'
import {
  applicationTargets,
  candidatePersons,
  clubDay,
  groupFees,
  type GroupFee,
  enrolmentSettings,
  isOfferedGroup,
  publicSite,
  sectionNames,
  type EnrolmentScope,
} from './directory'
import { applicationLinks } from './links'

/** The most rows a list reads before it filters and pages in memory. */
export const LIST_CAP = 500

// --- The public form (P-J2) ---

export type PublicFormGroup = {
  id: string
  name: string
  kind: string
  ageFrom: number | null
  ageTo: number | null
  ageCategoryLabel: string | null
  fitRule: ApplicationTarget['fitRule']
  full: boolean
}

export type PublicFormView = {
  club: PublicClubFrame['club']
  section: { name: string; slug: string }
  referenceDate: CalendarDate
  today: CalendarDate
  answerDays: number
  informationText: string | null
  rulesUrl: string | null
  privacyPolicyUrl: string | null
  contactPhone: string | null
  groups: PublicFormGroup[]
}

export type PublicFormResult =
  { status: 'ok'; value: PublicFormView } | { status: 'closed'; club: PublicClubFrame['club'] | null }

/** REQ-J03: the form while the section and at least one public, active group accept applications. */
export async function publicForm(
  container: AwilixContainer,
  clubSlug: string,
  sectionSlug: string,
  now: Date = new Date(),
): Promise<PublicFormResult> {
  const found = await publicSite(container).applicationSection(clubSlug, sectionSlug)
  if (found.status !== 'ok') return { status: 'closed', club: found.frame?.club ?? null }
  const { frame, section } = found.value
  if (!section.acceptsApplications) return { status: 'closed', club: frame.club }
  const scope: EnrolmentScope = { tenantId: frame.tenantId, organizationId: frame.organizationId }
  const settings = await enrolmentSettings(container, scope)
  const today = clubDay(settings, now)
  const referenceDate = ageReferenceDate(today, settings.referenceDay)
  const [offered, todays] = await Promise.all([
    applicationTargets(container, scope, { sectionId: section.id, date: referenceDate }),
    applicationTargets(container, scope, { sectionId: section.id, date: today }),
  ])
  const fullToday = new Map(todays.map((target) => [target.groupId, isGroupFull(target)]))
  const groups = offered.filter(isOfferedGroup).map((target) => ({
    id: target.groupId,
    name: target.name,
    kind: target.kind,
    ageFrom: target.ageFrom,
    ageTo: target.ageTo,
    ageCategoryLabel: target.ageCategoryLabel,
    fitRule: target.fitRule,
    full: fullToday.get(target.groupId) ?? false,
  }))
  if (groups.length === 0) return { status: 'closed', club: frame.club }
  return {
    status: 'ok',
    value: {
      club: frame.club,
      section: { name: section.name, slug: section.slug },
      referenceDate,
      today,
      answerDays: settings.answerDays,
      informationText: settings.informationText,
      rulesUrl: settings.rulesUrl,
      privacyPolicyUrl: settings.privacyPolicyUrl,
      contactPhone: settings.contactPhone,
      groups,
    },
  }
}

// --- The status page (P-J4) ---

export type StatusView = {
  club: PublicClubFrame['club']
  state: string
  kind: string
  sectionName: string
  groupName: string | null
  waitingNumber: number | null
  decisionReason: string | null
  confirmedAt: string | null
  decidedAt: string | null
  closedAt: string | null
  canWithdraw: boolean
  answerDays: number
}

export type StatusResult =
  | { status: 'ok'; value: StatusView }
  | { status: 'expired' | 'used'; club: PublicClubFrame['club'] | null }
  | { status: 'unknown' }

/** DD-J07: the application behind a status link, looked up within the slug's club only. */
export async function statusView(container: AwilixContainer, clubSlug: string, token: string): Promise<StatusResult> {
  const club = await publicSite(container).clubFrame(clubSlug)
  if (club.status !== 'ok') return { status: 'unknown' }
  const scope: EnrolmentScope = { tenantId: club.value.tenantId, organizationId: club.value.organizationId }
  const em = container.resolve<EntityManager>('em').fork()
  const inspected = await applicationLinks(container).inspect(em, token, { scope })
  if (!inspected) return { status: 'unknown' }
  if (inspected.state !== 'active') return { status: inspected.state, club: club.value.club }
  const row = (
    await findWithDecryption(
      em,
      Application,
      { id: inspected.view.link.applicationId, ...scope, deletedAt: null },
      {},
      scope,
    )
  ).at(0)
  if (!row || row.state === 'unconfirmed') return { status: 'unknown' }
  const settings = await enrolmentSettings(container, scope)
  const [names, groups, number] = await Promise.all([
    sectionNames(container, scope, [row.sectionId], em),
    row.groupId
      ? applicationTargets(container, scope, {
          sectionId: row.sectionId,
          date: row.referenceDate,
          groupIds: [row.groupId],
        })
      : Promise.resolve([]),
    waitingNumberFor(em, scope, row),
  ])
  return {
    status: 'ok',
    value: {
      club: club.value.club,
      state: row.state,
      kind: row.kind,
      sectionName: names.get(row.sectionId) ?? '—',
      groupName: groups[0]?.name ?? null,
      waitingNumber: number,
      decisionReason: row.state === 'rejected' ? (row.decisionReason ?? null) : null,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      canWithdraw: isDecidableState(row.state),
      answerDays: settings.answerDays,
    },
  }
}

async function waitingNumberFor(
  em: EntityManager,
  scope: EnrolmentScope,
  row: Pick<Application, 'id' | 'groupId' | 'state'>,
): Promise<number | null> {
  if (row.state !== 'waiting' || !row.groupId) return null
  const rows = await em.find(
    Application,
    { ...scope, groupId: row.groupId, state: 'waiting', deletedAt: null },
    { fields: ['id', 'groupId', 'waitingSince'] },
  )
  return (
    waitingNumbers(
      rows.map((entry) => ({ id: entry.id, groupId: entry.groupId ?? null, waitingSince: entry.waitingSince ?? null })),
    ).get(row.id) ?? null
  )
}

// --- The coordinator's list and detail (M-J2, M-J3, B-J1) ---

export type ApplicationListItem = {
  id: string
  sectionId: string
  sectionName: string
  groupId: string | null
  groupName: string | null
  chooseForUs: boolean
  kind: string
  state: string
  tab: ApplicationTab | null
  participantName: string
  age: number | null
  referenceDate: string
  confirmedAt: string | null
  closedAt: string | null
  waitingNumber: number | null
  flags: ApplicationFlag[]
  updatedAt: string
}

export type ApplicationList = {
  items: ApplicationListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

type ListContext = {
  container: AwilixContainer
  scope: EnrolmentScope
  grants: Scope
  now?: Date
}

function participantName(row: Application): string {
  return [row.participantFirstName, row.participantLastName].filter(Boolean).join(' ')
}

/** The facts the flags and numbers need, read once for a set of rows. */
async function listFacts(ctx: ListContext, em: EntityManager, rows: readonly Application[], today: CalendarDate) {
  const sectionIds = [...new Set(rows.map((row) => row.sectionId))]
  const groupIds = [...new Set(rows.flatMap((row) => (row.groupId ? [row.groupId] : [])))]
  const [names, waiting, ...targetLists] = await Promise.all([
    sectionNames(ctx.container, ctx.scope, sectionIds, em),
    groupIds.length > 0
      ? em.find(
          Application,
          { ...ctx.scope, groupId: { $in: groupIds }, state: 'waiting', deletedAt: null },
          { fields: ['id', 'groupId', 'waitingSince'] },
        )
      : Promise.resolve([]),
    ...sectionIds.map((sectionId) => applicationTargets(ctx.container, ctx.scope, { sectionId, date: today })),
  ])
  const targets = new Map(targetLists.flat().map((target) => [target.groupId, target]))
  const numbers = waitingNumbers(
    waiting.map((entry) => ({
      id: entry.id,
      groupId: entry.groupId ?? null,
      waitingSince: entry.waitingSince ?? null,
    })),
  )
  return { names, targets, numbers }
}

function listItem(
  row: Application,
  facts: Awaited<ReturnType<typeof listFacts>>,
  answerDays: number,
  now: Date,
): ApplicationListItem {
  const target = row.groupId ? facts.targets.get(row.groupId) : undefined
  const overdue = isOverdue({ state: row.state, confirmedAt: row.confirmedAt ?? null }, answerDays, now)
  return {
    id: row.id,
    sectionId: row.sectionId,
    sectionName: facts.names.get(row.sectionId) ?? '—',
    groupId: row.groupId ?? null,
    groupName: target?.name ?? null,
    chooseForUs: !row.groupId,
    kind: row.kind,
    state: row.state,
    tab: tabOf(row.state, false),
    participantName: participantName(row),
    age:
      row.participantBirthDate && !row.anonymizedAt
        ? ageOnReference(row.participantBirthDate, row.referenceDate)
        : null,
    referenceDate: row.referenceDate,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    waitingNumber: facts.numbers.get(row.id) ?? null,
    flags: applicationFlags({
      groupClosed: Boolean(target && !target.isActive) && isDecidableState(row.state),
      ageFit: row.ageFit,
      groupFull: Boolean(target && isGroupFull(target)) && isDecidableState(row.state),
      wantsTrial: row.wantsTrial,
      duplicates: row.duplicateCandidates?.length ?? 0,
      overdue,
    }),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function sortItems(tab: ApplicationTab, items: ApplicationListItem[]): ApplicationListItem[] {
  const time = (value: string | null) => (value ? Date.parse(value) : 0)
  if (tab === 'closed') return items.sort((a, b) => time(b.closedAt) - time(a.closedAt))
  if (tab === 'waiting') {
    return items.sort(
      (a, b) =>
        (a.groupName ?? '').localeCompare(b.groupName ?? '') ||
        (a.groupId ?? '').localeCompare(b.groupId ?? '') ||
        (a.waitingNumber ?? 0) - (b.waitingNumber ?? 0),
    )
  }
  return items.sort((a, b) => time(a.confirmedAt) - time(b.confirmedAt))
}

/** M-J2 / B-J1: the caller's applications of one tab, filtered, flagged and paged. */
export async function listApplications(ctx: ListContext, query: ApplicationListQuery): Promise<ApplicationList> {
  const now = ctx.now ?? new Date()
  const sections = deciderSections(ctx.grants)
  const empty = { items: [], total: 0, page: query.page, pageSize: query.pageSize, totalPages: 0 }
  if (sections !== 'all' && sections.length === 0) return empty
  const allowedSections =
    sections === 'all'
      ? query.sectionId
        ? [query.sectionId]
        : null
      : query.sectionId
        ? sections.filter((id) => id === query.sectionId)
        : sections
  if (allowedSections && allowedSections.length === 0) return empty
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const settings = await enrolmentSettings(ctx.container, ctx.scope)
  const today = clubDay(settings, now)
  const rows = await findWithDecryption(
    em,
    Application,
    {
      ...ctx.scope,
      deletedAt: null,
      state: { $in: tabStates(query.tab) },
      ...(allowedSections ? { sectionId: { $in: allowedSections } } : {}),
      ...(query.groupId ? { groupId: query.groupId } : {}),
      ...(query.tab === 'closed' ? { closedAt: { $gte: closedTabSince(now) } } : {}),
    },
    { orderBy: { confirmedAt: 'asc', id: 'asc' }, limit: LIST_CAP },
    ctx.scope,
  )
  const facts = await listFacts(ctx, em, rows, today)
  let items = rows.map((row) => listItem(row, facts, settings.answerDays, now)).filter((item) => item.tab === query.tab)
  if (query.overdue) items = items.filter((item) => item.flags.includes('overdue'))
  if (query.q && query.tab !== 'closed') {
    const words = comparableName(query.q).split(' ').filter(Boolean)
    items = items.filter((item) => {
      const name = comparableName(item.participantName)
      return words.every((word) => name.includes(word))
    })
  }
  items = sortItems(query.tab, items)
  const total = items.length
  const start = (query.page - 1) * query.pageSize
  return {
    items: items.slice(start, start + query.pageSize),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize),
  }
}

export type ApplicationDetail = ApplicationListItem & {
  participantFirstName: string | null
  participantLastName: string | null
  participantBirthDate: string | null
  guardianFirstName: string | null
  guardianLastName: string | null
  email: string | null
  phone: string | null
  note: string | null
  wantsTrial: boolean
  experience: string | null
  ageFit: string
  decisionReason: string | null
  decidedAt: string | null
  createdAt: string
  anonymized: boolean
  duplicates: {
    personId: string
    role: string
    reason: string
    /** The existing person's name and birth date (null when the person is gone), for the accept sheet (DD-J11). */
    name: string | null
    birthDate: string | null
    hasAccount: boolean
  }[]
  groups: {
    id: string
    name: string
    full: boolean
    placesLimit: number | null
    occupied: number
    ageFit: string
    /** The group's fees valid today (Q-J06); empty when the group is not public or has none. */
    fees: GroupFee[]
  }[]
  /** The club's today: the earliest start day of an acceptance (BR-J6). */
  today: string
  /** The last day of the season the application counts for (DD-J03); null without a season. */
  seasonEndsOn: string | null
  /** The person and membership an accepted application became (phase 3). */
  acceptedMembershipId: string | null
  acceptedChildPersonId: string | null
  acceptedGuardianPersonId: string | null
  canDecide: boolean
}

/** M-J3: one application of a section the caller decides; null for any other (404, BR-J5). */
export async function applicationDetail(ctx: ListContext, id: string): Promise<ApplicationDetail | null> {
  const now = ctx.now ?? new Date()
  const sections = deciderSections(ctx.grants)
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const row = (
    await findWithDecryption(
      em,
      Application,
      { id, ...ctx.scope, deletedAt: null, state: { $ne: 'unconfirmed' } },
      {},
      ctx.scope,
    )
  ).at(0)
  if (!row || (sections !== 'all' && !sections.includes(row.sectionId))) return null
  const settings = await enrolmentSettings(ctx.container, ctx.scope)
  const today = clubDay(settings, now)
  const facts = await listFacts(ctx, em, [row], today)
  const item = listItem(row, facts, settings.answerDays, now)
  const reference = await applicationTargets(ctx.container, ctx.scope, {
    sectionId: row.sectionId,
    date: row.referenceDate,
  })
  const birthDate = row.anonymizedAt ? null : (row.participantBirthDate ?? null)
  const stored = row.duplicateCandidates ?? []
  const [fees, candidates] = await Promise.all([
    groupFees(ctx.container, ctx.scope, row.sectionId),
    // The names of existing club persons go to the club administrator only, who alone accepts (`accept_requires_admin`).
    sections === 'all'
      ? candidatePersons(ctx.container, ctx.scope, [...new Set(stored.map((entry) => entry.personId))])
      : Promise.resolve(new Map<string, { name: string; birthDate: string | null; hasAccount: boolean }>()),
  ])
  const groups = reference
    .filter((target) => target.isActive)
    .map((target) => {
      const todays = facts.targets.get(target.groupId)
      return {
        id: target.groupId,
        name: target.name,
        full: todays ? isGroupFull(todays) : false,
        placesLimit: target.placesLimit,
        occupied: todays?.occupied ?? target.occupied,
        ageFit: birthDate ? ageFitOf(birthDate, row.referenceDate, target.fitRule) : 'unknown',
        fees: fees.get(target.groupId) ?? [],
      }
    })
  return {
    ...item,
    participantFirstName: row.participantFirstName ?? null,
    participantLastName: row.participantLastName ?? null,
    participantBirthDate: birthDate,
    guardianFirstName: row.guardianFirstName ?? null,
    guardianLastName: row.guardianLastName ?? null,
    email: row.guardianEmail ?? null,
    phone: row.guardianPhone ?? null,
    note: row.note ?? null,
    wantsTrial: row.wantsTrial,
    experience: row.experience ?? null,
    ageFit: row.ageFit,
    decisionReason: row.decisionReason ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    anonymized: Boolean(row.anonymizedAt),
    duplicates: stored.map((entry) => {
      const person = candidates.get(entry.personId)
      return {
        ...entry,
        name: person?.name ?? null,
        birthDate: person?.birthDate ?? null,
        hasAccount: person?.hasAccount ?? false,
      }
    }),
    groups,
    today,
    seasonEndsOn: reference[0]?.seasonEndsOn ?? null,
    acceptedMembershipId: row.acceptedMembershipId ?? null,
    acceptedChildPersonId: row.acceptedChildPersonId ?? null,
    acceptedGuardianPersonId: row.acceptedGuardianPersonId ?? null,
    canDecide: isDecidableState(row.state),
  }
}

/** REQ-J17: the club's overdue applications (the administrator's dashboard widget). */
export async function overdueCount(ctx: ListContext): Promise<number> {
  const list = await listApplications(ctx, {
    tab: 'new',
    overdue: '1',
    page: 1,
    pageSize: 1,
  })
  return list.total
}
