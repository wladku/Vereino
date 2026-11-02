// The read model of `communication` (foundation III REQ-M06, REQ-M10; DD-M12, DD-M13; R15): who is reading
// (their person, household and staff grants), the threads they see with unread state, a thread with its messages as
// the reader may see them, the unread count of the "Messages" tile, and the delivery status of a message for the
// staff. Visibility = participants ∪ the coordinators of the thread's section ∪ the club administrator; a member
// sees the messages for everyone and their own household's replies only — never another family's. A case (REQ-M09)
// keeps the same visibility and carries who marked it and when; the case register is the list filtered by `isCase`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { findActingRole, hasKind, type Scope } from '@vereino/core'
import {
  contactResolver,
  foundationErrors,
  scopeContract,
  trustedScopeOf,
  type DispatchService,
  type PagedDeliveries,
} from '@/modules/foundation'
import { Thread, ThreadMessage } from '../data/entities'
import {
  messageStamps,
  participationsOf,
  readMarkersOf,
  visibleThreadHeaders,
  type ThreadFilters,
  type ThreadHeader,
} from '../data/queries'
import { mayMarkCase } from '../lib/case-rules'
import {
  THREAD_READ_KINDS,
  excerpt,
  grantIds,
  householdOf,
  isThreadStaff,
  isUnread,
  isVisibleTo,
  lastVisibleMessageAt,
  latestMessages,
  pageWindow,
  pagedEnvelope,
  selfPersonId,
  type MessageAudience,
  type MessageRow,
  type ThreadScopeType,
} from '../lib/thread-rules'
import { activeGuardians, findPersons, personName, type CommunicationScope } from './directory'
import { targetLabels } from './targets'

/** The reader: the trusted organization, their grants, their person and household. */
export type Viewer = {
  container: AwilixContainer
  scope: CommunicationScope
  /** The signed-in user (the feature check of "Mark as case"). */
  userId: string | null
  grants: Scope
  personId: string | null
  household: Set<string>
  clubWide: boolean
  sectionIds: string[]
}

/** The reader of a request, or null without a trusted organization. */
export async function viewerOf(ctx: CommandRuntimeContext): Promise<Viewer | null> {
  const scope = trustedScopeOf(ctx)
  if (!scope) return null
  const grants = await scopeContract.resolve(ctx)
  const personId = selfPersonId(grants)
  const wardIds = grantIds(grants, 'guardian')
  const selfIds = personId ? [personId] : []
  let guardians = new Map<string, string[]>()
  if (selfIds.length + wardIds.length > 0) {
    const club = await contactResolver(ctx.container).club({ container: ctx.container, ...scope, scope: grants })
    guardians = await activeGuardians(ctx.container, scope, [...selfIds, ...wardIds], club.today)
  }
  return {
    container: ctx.container,
    scope,
    userId: ctx.auth?.sub ?? null,
    grants,
    personId,
    household: householdOf(selfIds, wardIds, guardians),
    clubWide: hasKind(grants, 'club_admin'),
    sectionIds: grantIds(grants, 'coordinator'),
  }
}

const isId = (value: string | null): value is string => value !== null

/** The feature of marking a case (club spec ACL; the route of `communication.threads.mark_case` requires it). */
const CASE_FEATURE = 'communication.cases.manage'

/** Whether the reader holds a feature in the organization (wildcard-aware, the platform's check). */
async function hasFeature(viewer: Viewer, feature: string): Promise<boolean> {
  if (!viewer.userId) return false
  const rbac = viewer.container.resolve<RbacService>('rbacService')
  return rbac.userHasAllFeatures(viewer.userId, [feature], viewer.scope)
}

function emOf(viewer: Viewer): EntityManager {
  return viewer.container.resolve<EntityManager>('em').fork()
}

function headerTarget(
  viewer: Viewer,
  header: Pick<ThreadHeader, 'id' | 'sectionId' | 'groupId' | 'scopeType' | 'scopeId'>,
) {
  return {
    id: header.id,
    ...viewer.scope,
    sectionId: header.sectionId,
    groupId: header.groupId,
    occurrenceId: header.scopeType === 'occurrence' ? header.scopeId : null,
  }
}

/** The staff grant (coordinator of the section, club administrator) the reader holds on a thread, or null. */
export function staffRoleOn(
  viewer: Viewer,
  header: Pick<ThreadHeader, 'id' | 'sectionId' | 'groupId' | 'scopeType' | 'scopeId'>,
) {
  return findActingRole(viewer.grants, THREAD_READ_KINDS, headerTarget(viewer, header))
}

export type ThreadListItem = {
  id: string
  scopeType: ThreadScopeType
  scopeId: string | null
  scopeLabel: string | null
  subject: string
  authorName: string | null
  isCase: boolean
  caseOpenedAt: string | null
  caseOpenedByName: string | null
  lastMessageAt: string
  createdAt: string
  messageCount: number
  unread: boolean
}

export type ThreadListQuery = {
  page?: number
  pageSize?: number
  filters: ThreadFilters
  unreadOnly: boolean
  /** `member`: the inbox — the reader's own threads only, whatever their staff grants allow. */
  participantOnly: boolean
}

type Summary = { header: ThreadHeader; unread: boolean; messageCount: number; lastAt: Date }

async function summaries(em: EntityManager, viewer: Viewer, headers: readonly ThreadHeader[]): Promise<Summary[]> {
  const ids = headers.map((header) => header.id)
  const [stamps, participations, reads] = await Promise.all([
    messageStamps(em, viewer.scope, ids),
    viewer.personId ? participationsOf(em, viewer.scope, viewer.personId, ids) : new Map<string, string[]>(),
    viewer.personId ? readMarkersOf(em, viewer.scope, viewer.personId, ids) : new Map<string, Date>(),
  ])
  const byThread = new Map<string, typeof stamps>()
  for (const stamp of stamps) byThread.set(stamp.threadId, [...(byThread.get(stamp.threadId) ?? []), stamp])
  return headers.map((header) => {
    const staff = isThreadStaff({
      viewerPersonId: viewer.personId,
      authorPersonId: header.authorPersonId,
      participantReasons: participations.get(header.id) ?? null,
      staffRole: staffRoleOn(viewer, header),
    })
    const reader = { personId: viewer.personId, staff, household: viewer.household }
    const threadStamps = byThread.get(header.id) ?? []
    const lastVisible = lastVisibleMessageAt(threadStamps, reader)
    const messageCount = threadStamps.filter((stamp) => stamp.kind === 'message' && isVisibleTo(stamp, reader)).length
    return {
      header,
      unread: viewer.personId ? isUnread(lastVisible, reads.get(header.id) ?? null) : false,
      messageCount,
      lastAt: lastVisible && lastVisible > header.createdAt ? lastVisible : header.createdAt,
    }
  })
}

function visibility(viewer: Viewer, participantOnly: boolean) {
  return { personId: viewer.personId, clubWide: viewer.clubWide, sectionIds: viewer.sectionIds, participantOnly }
}

/** The subjects of threads, decrypted, by id. */
async function subjectsOf(em: EntityManager, viewer: Viewer, ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const rows = await findWithDecryption(
    em,
    Thread,
    { id: { $in: [...ids] }, ...viewer.scope },
    { fields: ['id', 'subject', 'tenantId', 'organizationId'] },
    viewer.scope,
  )
  return new Map(rows.map((row) => [row.id, row.subject]))
}

/** The threads the reader sees, newest activity first, in the S6.4 envelope. */
export async function listThreads(viewer: Viewer, query: ThreadListQuery) {
  const em = emOf(viewer)
  const window = pageWindow(query.page, query.pageSize)
  const headers = await visibleThreadHeaders(em, viewer.scope, visibility(viewer, query.participantOnly), query.filters)
  const all = (await summaries(em, viewer, headers)).sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
  const matching = query.unreadOnly ? all.filter((summary) => summary.unread) : all
  const page = matching.slice(window.offset, window.offset + window.pageSize)
  const ids = page.map((summary) => summary.header.id)
  const [subjects, labels, authors] = await Promise.all([
    subjectsOf(em, viewer, ids),
    targetLabels(
      viewer.container,
      viewer.scope,
      page.map((summary) => summary.header),
    ),
    findPersons(
      viewer.container,
      viewer.scope,
      page.flatMap(({ header }) => [header.authorPersonId, header.caseOpenedByPersonId].filter(isId)),
    ),
  ])
  const items: ThreadListItem[] = page.map(({ header, unread, messageCount, lastAt }) => ({
    id: header.id,
    scopeType: header.scopeType,
    scopeId: header.scopeId,
    scopeLabel: header.scopeId ? (labels.get(`${header.scopeType}:${header.scopeId}`) ?? null) : null,
    subject: subjects.get(header.id) ?? '',
    authorName: header.authorPersonId ? personName(authors.get(header.authorPersonId)) : null,
    isCase: header.isCase,
    caseOpenedAt: header.caseOpenedAt?.toISOString() ?? null,
    caseOpenedByName: header.caseOpenedByPersonId ? personName(authors.get(header.caseOpenedByPersonId)) : null,
    lastMessageAt: lastAt.toISOString(),
    createdAt: header.createdAt.toISOString(),
    messageCount,
    unread,
  }))
  return pagedEnvelope(items, matching.length, window)
}

/** The number of the reader's own threads with an unread message (the "Messages" tile, DD-M13). */
export async function unreadCount(viewer: Viewer): Promise<number> {
  if (!viewer.personId) return 0
  const em = emOf(viewer)
  const headers = await visibleThreadHeaders(em, viewer.scope, visibility(viewer, true), {})
  return (await summaries(em, viewer, headers)).filter((summary) => summary.unread).length
}

export type ThreadMessageItem = {
  id: string
  authorName: string | null
  own: boolean
  actingRole: string
  audience: MessageAudience
  body: string | null
  createdAt: string
  editedAt: string | null
  deleted: boolean
  system: boolean
  recipientCount: number
  hasDeliveries: boolean
}

export type ThreadDetail = {
  id: string
  scopeType: ThreadScopeType
  scopeId: string | null
  scopeLabel: string | null
  subject: string
  authorName: string | null
  isCase: boolean
  caseOpenedAt: string | null
  caseOpenedByName: string | null
  createdAt: string
  updatedAt: string
  lastMessageAt: string
  /** The reader is the thread's staff: they see every reply and the delivery status. */
  staff: boolean
  /** The reader may see the delivery status (the author, the section's coordinator, the administrator). */
  canSeeDeliveries: boolean
  /** The reader may mark the thread as a case (REQ-M09): not a case yet, a staff grant on it and the feature. */
  canMarkCase: boolean
  unread: boolean
  messages: ThreadMessageItem[]
}

/** A thread the reader may open, or 404 (unknown) / 403 `scope_denied` (not theirs). */
async function visibleHeader(em: EntityManager, viewer: Viewer, threadId: string) {
  const thread = await findOneWithDecryption(
    em,
    Thread,
    { id: threadId, ...viewer.scope, deletedAt: null },
    undefined,
    viewer.scope,
  )
  if (!thread) return null
  const header: ThreadHeader = {
    id: thread.id,
    scopeType: thread.scopeType,
    scopeId: thread.scopeId ?? null,
    sectionId: thread.sectionId ?? null,
    groupId: thread.groupId ?? null,
    authorPersonId: thread.authorPersonId ?? null,
    isCase: thread.isCase,
    caseOpenedAt: thread.caseOpenedAt ?? null,
    caseOpenedByPersonId: thread.caseOpenedByPersonId ?? null,
    lastMessageAt: thread.lastMessageAt,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  }
  const participations = viewer.personId
    ? await participationsOf(em, viewer.scope, viewer.personId, [thread.id])
    : new Map<string, string[]>()
  const reasons = participations.get(thread.id) ?? null
  const staffRole = staffRoleOn(viewer, header)
  if (!reasons && !staffRole) return foundationErrors.throw('scope_denied')
  const staff = isThreadStaff({
    viewerPersonId: viewer.personId,
    authorPersonId: header.authorPersonId,
    participantReasons: reasons,
    staffRole,
  })
  return { thread, header, staff, staffRole, reasons }
}

export async function threadDetail(viewer: Viewer, threadId: string): Promise<ThreadDetail | null> {
  const em = emOf(viewer)
  const found = await visibleHeader(em, viewer, threadId)
  if (!found) return null
  const { thread, header, staff, staffRole } = found
  const rows = await findWithDecryption(
    em,
    ThreadMessage,
    { ...viewer.scope, threadId: thread.id },
    { orderBy: { createdAt: 'asc' } },
    viewer.scope,
  )
  const byId = new Map(rows.map((row) => [row.id, row]))
  const reader = { personId: viewer.personId, staff, household: viewer.household }
  const views = latestMessages(
    rows.map((row): MessageRow => ({
      id: row.id,
      kind: row.kind,
      supersedesMessageId: row.supersedesMessageId ?? null,
      authorPersonId: row.authorPersonId ?? null,
      actingRole: row.actingRole,
      audience: row.audience,
      body: row.body ?? null,
      createdAt: row.createdAt,
    })),
  ).filter((view) => isVisibleTo(view, reader))
  const authorIds = [
    ...new Set([
      ...views.flatMap((view) => (view.authorPersonId ? [view.authorPersonId] : [])),
      ...[header.authorPersonId, header.caseOpenedByPersonId].filter(isId),
    ]),
  ]
  const [names, labels, reads, hasCaseFeature] = await Promise.all([
    findPersons(viewer.container, viewer.scope, authorIds),
    targetLabels(viewer.container, viewer.scope, [header]),
    viewer.personId ? readMarkersOf(em, viewer.scope, viewer.personId, [thread.id]) : new Map<string, Date>(),
    // Asked only when the marking is otherwise possible: a staff grant on a thread that is not a case yet.
    !header.isCase && staffRole ? hasFeature(viewer, CASE_FEATURE) : false,
  ])
  const lastVisible = lastVisibleMessageAt(
    rows.map((row) => ({
      authorPersonId: row.authorPersonId ?? null,
      audience: row.audience,
      createdAt: row.createdAt,
    })),
    reader,
  )
  const canSeeDeliveries = staffRole !== null || (viewer.personId !== null && viewer.personId === header.authorPersonId)
  return {
    id: thread.id,
    scopeType: header.scopeType,
    scopeId: header.scopeId,
    scopeLabel: header.scopeId ? (labels.get(`${header.scopeType}:${header.scopeId}`) ?? null) : null,
    subject: thread.subject,
    authorName: header.authorPersonId ? personName(names.get(header.authorPersonId)) : null,
    isCase: thread.isCase,
    caseOpenedAt: header.caseOpenedAt?.toISOString() ?? null,
    caseOpenedByName: header.caseOpenedByPersonId ? personName(names.get(header.caseOpenedByPersonId)) : null,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    lastMessageAt: thread.lastMessageAt.toISOString(),
    staff,
    canSeeDeliveries,
    canMarkCase: mayMarkCase({ isCase: header.isCase, staffRole, hasCaseFeature }),
    unread: viewer.personId ? isUnread(lastVisible, reads.get(thread.id) ?? null) : false,
    messages: views.map((view) => {
      const row = byId.get(view.id)
      return {
        id: view.id,
        authorName: view.authorPersonId ? personName(names.get(view.authorPersonId)) : null,
        own: viewer.personId !== null && view.authorPersonId === viewer.personId,
        actingRole: view.actingRole,
        audience: view.audience,
        body: view.body,
        createdAt: view.createdAt.toISOString(),
        editedAt: view.editedAt?.toISOString() ?? null,
        deleted: view.deleted,
        system: view.system,
        recipientCount: row?.recipientCount ?? 0,
        hasDeliveries: canSeeDeliveries && Boolean(row?.dispatchId),
      }
    }),
  }
}

/**
 * The delivery status of one message of a thread (the first one when none is named), for the author, the section's
 * coordinator and the administrator (DD-M12; `DeliveryStatusList`). Never an address.
 */
export async function threadDeliveries(
  viewer: Viewer,
  threadId: string,
  query: { messageId?: string; page?: number; pageSize?: number; problemsOnly: boolean },
): Promise<PagedDeliveries | null> {
  const em = emOf(viewer)
  const found = await visibleHeader(em, viewer, threadId)
  if (!found) return null
  const { header, staffRole } = found
  if (!staffRole && !(viewer.personId && viewer.personId === header.authorPersonId)) {
    return foundationErrors.throw('scope_denied')
  }
  const message = await em.findOne(
    ThreadMessage,
    {
      ...viewer.scope,
      threadId,
      kind: 'message',
      ...(query.messageId ? { id: query.messageId } : {}),
    },
    { orderBy: { createdAt: 'asc' }, fields: ['id', 'dispatchId'] },
  )
  if (!message?.dispatchId) return null
  const dispatch = viewer.container.resolve<DispatchService>('foundationDispatch')
  return dispatch.deliveriesOf(
    message.dispatchId,
    { page: query.page, pageSize: query.pageSize, problemsOnly: query.problemsOnly },
    { ...viewer.scope, scope: viewer.grants },
  )
}

/** The subject of a thread the reader may open, for the thread share text (DD-M14). */
export async function threadSubject(viewer: Viewer, threadId: string): Promise<string | null> {
  const em = emOf(viewer)
  const found = await visibleHeader(em, viewer, threadId)
  return found ? excerpt(found.thread.subject, 160) : null
}
