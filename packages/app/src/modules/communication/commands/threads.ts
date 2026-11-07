// The `communication` commands (foundation III REQ-M06, REQ-M07, REQ-M10; DD-M06, DD-M10…DD-M13; club spec REQ-009,
// R01, R15). Every one is non-undoable (DD-M11):
// - `communication.threads.create` — an announcement: a sent e-mail cannot be recalled;
// - `communication.threads.start_direct` — a member's direct thread to the staff (REQ-M12, DD-M18): the same;
// - `communication.threads.reply` — a reply: the same;
// - `communication.messages.revise` / `communication.messages.delete` — they append a revision or a tombstone; the
//   history is the record (an undo would have to remove an append-only row); both refuse a case's message (409
//   `case_immutable`, REQ-M09);
// - `communication.threads.mark_case` — marks a thread as a case (REQ-M09, DD-M11): an undo would unmark the case,
//   and no unmark command exists;
// - `communication.threads.mark_read` — no business state (not logged);
// - `communication.threads.record_cancellation` — the session thread of a cancellation, run by the subscriber under
//   the `system_job` source: the e-mail cannot be recalled.
// Recipients come from the foundation's `resolveAudience` (P-29), delivery from its `dispatch` (P-30) with the
// templates in `emails/`, enqueued in the command's transaction and published after the commit.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { cancellationCoordinatorIds, findActingRole, type AudienceSpec, type GrantKind } from '@vereino/core'
import {
  authorizeScoped,
  contactResolver,
  type TargetLock,
  foundationErrors,
  resolveAudience,
  resolveMembers,
  scopeContract,
  scopeDenialCode,
  trustedScopeOf,
} from '@/modules/foundation'
import { communicationErrors } from '../api/errors'
import { Thread, ThreadMessage, ThreadParticipant } from '../data/entities'
import {
  countDirectThreadsSince,
  insertParticipants,
  lockDirectThreadAuthor,
  lockOccurrenceThread,
  openCase,
  upsertReadMarker,
} from '../data/queries'
import {
  audienceSchema,
  cancellationSchema,
  directThreadSchema,
  messageDeleteSchema,
  messageReviseSchema,
  threadCreateSchema,
  threadMarkCaseSchema,
  threadReadSchema,
  threadReplySchema,
} from '../data/validators'
import {
  ORIGINAL_MESSAGE_KINDS,
  THREAD_READ_KINDS,
  audienceTarget,
  cancelledByOf,
  emailOnlyRecipients,
  isSystemMessage,
  isThreadStaff,
  participantRows,
  postingKinds,
  replyActingRole,
  replyRecipients,
  selfPersonId,
  staffParticipants,
  withExtraRecipients,
} from '../lib/thread-rules'
import { CASE_MANAGE_KINDS, messageChangeRefusal } from '../lib/case-rules'
import {
  addressedStaffIds,
  coachIdsOf,
  directLimitReached,
  directMembers,
  directParticipantRows,
  directWindowStart,
} from '../lib/direct-rules'
import { clubFacts, groupDirectory, personDirectory, scheduleDirectory } from '../services/directory'
import { resolveAudienceTarget, sessionLabel, type ResolvedTarget } from '../services/targets'
import {
  communicationLog,
  dispatchService,
  emitAfterCommit,
  inWriteTransaction,
  publishAfterCommit,
  threadTarget,
  type CommunicationScope,
} from './shared'

export const THREAD_RESOURCE_KIND = 'communication.thread'
export const MESSAGE_RESOURCE_KIND = 'communication.thread_message'

/** A member's (or staff's) read kinds of a thread they take part in: their own person, the section, the club. */
const PARTICIPANT_KINDS: readonly GrantKind[] = ['self', 'coordinator', 'club_admin']

export type ThreadCommandResult = {
  threadId: string
  messageId: string
  dispatchId: string | null
  actingRole: string
  scope: CommunicationScope
  threadUpdatedAt: string
  created?: boolean
  /** The reachable recipients of the message (the "Sent to {n} people" toast, E06-S20). */
  recipientCount?: number
}

function scopeOf(thread: { tenantId: string; organizationId: string }): CommunicationScope {
  return { tenantId: thread.tenantId, organizationId: thread.organizationId }
}

/** The trusted tenant and organization of a session context, or 403 before anything is read. */
function trusted(ctx: CommandRuntimeContext): CommunicationScope {
  const scope = trustedScopeOf(ctx)
  if (!scope) throw new Error('[internal] communication commands need a trusted scope')
  return scope
}

async function loadThread(
  em: EntityManager,
  scope: CommunicationScope,
  threadId: string,
  lock?: TargetLock,
): Promise<Thread | null> {
  return em.findOne(Thread, { id: threadId, ...scope, deletedAt: null }, lock)
}

async function participantsOf(
  em: EntityManager,
  scope: CommunicationScope,
  threadId: string,
): Promise<ThreadParticipant[]> {
  return em.find(ThreadParticipant, { ...scope, threadId }, { orderBy: { personId: 'asc' } })
}

// --- communication.threads.create ---------------------------------------------------------------------------------

/** The grant kinds an announcement to the input's audience needs; an unparsable input falls through to validation. */
function kindsForInput(rawInput: unknown): { kinds: readonly GrantKind[]; persons: boolean } {
  const parsed = audienceSchema.safeParse((rawInput as { audience?: unknown } | null)?.audience)
  if (!parsed.success) return { kinds: ['club_admin'], persons: false }
  return { kinds: postingKinds(parsed.data.kind), persons: parsed.data.kind === 'persons' }
}

const createThreadCommand: CommandHandler<Record<string, unknown>, ThreadCommandResult> = {
  id: 'communication.threads.create',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const threadId = randomUUID()
    const messageId = randomUUID()
    const { kinds, persons } = kindsForInput(rawInput)
    const result = await inWriteTransaction(ctx, 'communication.threads.create', async (em) => {
      const orgScope = trusted(ctx)
      const authorized = await authorizeScoped(
        {
          input: threadCreateSchema,
          resourceKind: THREAD_RESOURCE_KIND,
          allowedKinds: kinds,
          // A `persons` audience has no single target: the `people` provider keeps only the persons inside the
          // author's scope and the foundation refuses the request when one is missing (403 `scope_denied`).
          ...(persons ? { matchOptions: { clubWideKinds: ['coach', 'coordinator'] as GrantKind[] } } : {}),
          loadTarget: async (parsed, txEm) => ({
            target: await resolveAudienceTarget(ctx.container, orgScope, parsed.audience, txEm),
          }),
          lock: 'none',
          resolveTarget: (_parsed, holder, scope) => audienceTarget(threadId, scope, holder?.target ?? {}),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, actingRole, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const target = (authorized.entity as { target: ResolvedTarget }).target
      const authorPersonId = selfPersonId(authorized.scope)
      if (!authorPersonId) return foundationErrors.throw(scopeDenialCode(authorized.scope))
      const audience: AudienceSpec = { kind: parsed.audience.kind, ids: parsed.audience.ids ?? [] }
      const resolved = await resolveAudience(
        audience,
        { container: ctx.container, ...scope, scope: authorized.scope, em },
        { exclude: [authorPersonId] },
      )
      const now = new Date()
      const thread = em.create(Thread, {
        id: threadId,
        ...scope,
        scopeType: target.scopeType,
        scopeId: target.scopeId,
        sectionId: target.sectionId,
        groupId: target.groupId,
        subject: parsed.subject,
        authorPersonId,
        lastMessageAt: now,
      })
      em.persist(thread)
      await em.flush()
      const { dispatchId } = await dispatchService(ctx).enqueue(
        em,
        {
          template: 'communication.announcement',
          params: { threadId, subject: parsed.subject, body: parsed.body },
          recipients: resolved.recipients,
          audience,
          source: { module: 'communication', type: 'communication:thread_message', id: messageId },
          idempotencyKey: `communication:thread:${messageId}`,
          actor: { userId: ctx.auth?.sub ?? null, actingRole },
        },
        { ...scope, scope: authorized.scope, em },
      )
      em.persist(
        em.create(ThreadMessage, {
          id: messageId,
          ...scope,
          threadId,
          kind: 'message',
          authorPersonId,
          actingRole,
          audience: 'all',
          body: parsed.body,
          dispatchId,
          recipientCount: resolved.counts.recipients,
        }),
      )
      await em.flush()
      await insertParticipants(
        em,
        scope,
        threadId,
        participantRows(resolved.recipients, { personId: authorPersonId, reason: 'author' }),
      )
      return {
        threadId,
        messageId,
        dispatchId,
        actingRole,
        scope,
        threadUpdatedAt: thread.updatedAt.toISOString(),
        recipientCount: resolved.counts.recipients,
      }
    })
    await publishAfterCommit(ctx, result.dispatchId, result.scope)
    await emitAfterCommit('communication.thread.created', result.scope, { id: result.threadId })
    await emitAfterCommit('communication.message.posted', result.scope, {
      id: result.messageId,
      threadId: result.threadId,
    })
    return result
  },
  buildLog: ({ result }) =>
    communicationLog({
      labelKey: 'communication.audit.threads.create',
      fallback: 'Post an announcement',
      resourceKind: THREAD_RESOURCE_KIND,
      resourceId: result.threadId,
      scope: result.scope,
      actingRole: result.actingRole,
      context: { messageId: result.messageId, dispatchId: result.dispatchId },
    }),
}

// --- communication.threads.start_direct ---------------------------------------------------------------------------

/** A member writes as themself (`self`) or for a ward (`guardian`), never through a staff grant (DD-M18). */
const DIRECT_KINDS: readonly GrantKind[] = ['self', 'guardian']

/**
 * A member's direct thread (foundation III REQ-M12, DD-M18; #138): a guardian or a participant with an account writes
 * about a household member (`personId`: themself or a ward, matched by their `self` / `guardian` grant) to the
 * coaches of a group that member takes part in today, or to the coordinators of its section. The subject must hold a
 * live `participant` membership of the group active today (club time), else 403 `scope_denied`; no staff → 422
 * `direct_no_recipients`; the 21st direct thread of the member in 24 hours → 429 `direct_thread_limit` (counted under
 * an advisory lock on the organization and the author). The audience is the subject and the staff, expanded by
 * `resolveMembers` (a minor adds their active guardians). The thread's `scope_id` is the subject, so a guardian's ward
 * filter lists it under exactly that ward, with or without an account (#187). Not undoable for the reason of
 * `threads.create`: a sent e-mail cannot be recalled.
 */
const startDirectCommand: CommandHandler<Record<string, unknown>, ThreadCommandResult> = {
  id: 'communication.threads.start_direct',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const threadId = randomUUID()
    const messageId = randomUUID()
    const result = await inWriteTransaction(ctx, 'communication.threads.start_direct', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: directThreadSchema,
          resourceKind: THREAD_RESOURCE_KIND,
          allowedKinds: DIRECT_KINDS,
          lock: 'none',
          resolveTarget: (parsed, _entity, scope) => ({ id: threadId, ...scope, personId: parsed.personId }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, actingRole, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const authorPersonId = selfPersonId(authorized.scope)
      if (!authorPersonId) return foundationErrors.throw('scope_denied')
      const audienceCtx = { container: ctx.container, ...scope, scope: authorized.scope, em }
      const { today } = await contactResolver(ctx.container).club(audienceCtx)
      const groups = groupDirectory(ctx.container)
      const group = (await groups.findGroups(scope, [parsed.groupId], em)).get(parsed.groupId)
      const memberships = await groups.membershipsOf(scope, [parsed.personId], { from: today, to: today }, em)
      const takesPart = memberships.some(
        (membership) => membership.groupId === parsed.groupId && membership.role === 'participant',
      )
      if (!group || !takesPart) return foundationErrors.throw('scope_denied')
      const candidates =
        parsed.to === 'coaches'
          ? coachIdsOf(await groups.rosterOn(scope, group.id, today, em))
          : await personDirectory(ctx.container).sectionCoordinatorIdsOn(scope, group.sectionId, today, em)
      const staffIds = addressedStaffIds(candidates, authorPersonId)
      if (staffIds.length === 0) return communicationErrors.throw('direct_no_recipients')
      await lockDirectThreadAuthor(em, organizationId, authorPersonId)
      const now = new Date()
      if (directLimitReached(await countDirectThreadsSince(em, scope, authorPersonId, directWindowStart(now)))) {
        return communicationErrors.throw('direct_thread_limit')
      }
      const members = directMembers(parsed.personId, staffIds)
      const resolved = await resolveMembers(members, audienceCtx, { exclude: [authorPersonId] })
      const thread = em.create(Thread, {
        id: threadId,
        ...scope,
        scopeType: 'direct',
        scopeId: parsed.personId,
        sectionId: group.sectionId,
        groupId: parsed.to === 'coaches' ? group.id : null,
        subject: parsed.subject,
        authorPersonId,
        lastMessageAt: now,
      })
      em.persist(thread)
      await em.flush()
      const { dispatchId } = await dispatchService(ctx).enqueue(
        em,
        {
          template: 'communication.announcement',
          params: { threadId, subject: parsed.subject, body: parsed.body },
          recipients: resolved.recipients,
          audience: { kind: 'persons', ids: members.map((member) => member.personId) },
          source: { module: 'communication', type: 'communication:thread_message', id: messageId },
          idempotencyKey: `communication:thread:${messageId}`,
          actor: { userId: ctx.auth?.sub ?? null, actingRole },
        },
        { ...scope, scope: authorized.scope, em },
      )
      em.persist(
        em.create(ThreadMessage, {
          id: messageId,
          ...scope,
          threadId,
          kind: 'message',
          authorPersonId,
          actingRole,
          audience: 'all',
          body: parsed.body,
          dispatchId,
          recipientCount: resolved.counts.recipients,
        }),
      )
      await em.flush()
      await insertParticipants(
        em,
        scope,
        threadId,
        directParticipantRows(resolved.recipients, authorPersonId, staffIds),
      )
      await upsertReadMarker(em, scope, threadId, authorPersonId, now)
      return {
        threadId,
        messageId,
        dispatchId,
        actingRole,
        scope,
        threadUpdatedAt: thread.updatedAt.toISOString(),
      }
    })
    await publishAfterCommit(ctx, result.dispatchId, result.scope)
    await emitAfterCommit('communication.thread.created', result.scope, { id: result.threadId })
    await emitAfterCommit('communication.message.posted', result.scope, {
      id: result.messageId,
      threadId: result.threadId,
    })
    return result
  },
  buildLog: ({ result }) =>
    communicationLog({
      labelKey: 'communication.audit.threads.start_direct',
      fallback: 'Write to the coach',
      resourceKind: THREAD_RESOURCE_KIND,
      resourceId: result.threadId,
      scope: result.scope,
      actingRole: result.actingRole,
      context: { messageId: result.messageId, dispatchId: result.dispatchId },
    }),
}

// --- communication.threads.reply ----------------------------------------------------------------------------------

/** The thread the caller takes part in or reads as staff, with their participation, loaded in the transaction. */
type ThreadAccess = { thread: Thread; selfPersonId: string | null; reasons: string[] | null; updatedAt: Date }

async function loadThreadAccess(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  threadId: string,
  lock: TargetLock | undefined,
): Promise<ThreadAccess | null> {
  const scope = trusted(ctx)
  const thread = await loadThread(em, scope, threadId, lock)
  if (!thread) return null
  const self = selfPersonId(await scopeContract.resolve(ctx))
  const participation = self ? await em.findOne(ThreadParticipant, { ...scope, threadId, personId: self }) : null
  return {
    thread,
    selfPersonId: self,
    reasons: participation ? participation.reasons : null,
    updatedAt: thread.updatedAt,
  }
}

/** A participant is matched through their own person (`self` grant); staff through the section or the club. */
function accessTarget(access: ThreadAccess | null, id: string, scope: CommunicationScope) {
  if (!access) return { id, ...scope }
  return threadTarget(access.thread, access.reasons ? access.selfPersonId : null)
}

const replyCommand: CommandHandler<Record<string, unknown>, ThreadCommandResult> = {
  id: 'communication.threads.reply',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const messageId = randomUUID()
    const result = await inWriteTransaction(ctx, 'communication.threads.reply', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: threadReplySchema,
          resourceKind: THREAD_RESOURCE_KIND,
          allowedKinds: PARTICIPANT_KINDS,
          loadTarget: (parsed, txEm, lock) => loadThreadAccess(ctx, txEm, parsed.threadId, lock),
          // A reply appends to its thread; the thread is not a versioned record the replier edits.
          lock: 'none',
          resolveTarget: (parsed, access, scope) => accessTarget(access, parsed.threadId, scope),
        },
        rawInput,
        ctx,
        em,
      )
      const access = authorized.entity as ThreadAccess
      const { thread } = access
      const scope = scopeOf(thread)
      const authorPersonId = access.selfPersonId
      if (!authorPersonId) return foundationErrors.throw(scopeDenialCode(authorized.scope))
      const staffRole = findActingRole(authorized.scope, THREAD_READ_KINDS, threadTarget(thread))
      const staff = isThreadStaff({
        viewerPersonId: authorPersonId,
        authorPersonId: thread.authorPersonId ?? null,
        participantReasons: access.reasons,
        staffRole,
      })
      const firstMessage = await em.findOne(
        ThreadMessage,
        { ...scope, threadId: thread.id, kind: 'message' },
        { orderBy: { createdAt: 'asc' }, fields: ['id', 'actingRole'] },
      )
      const actingRole = replyActingRole(
        staffRole ?? authorized.actingRole,
        access.reasons ?? [],
        firstMessage?.actingRole ?? null,
      )
      // A coordinator or the administrator who was not addressed joins the thread as staff.
      if (!access.reasons) {
        await insertParticipants(em, scope, thread.id, [{ personId: authorPersonId, reasons: ['staff'] }])
      }
      const participants = await participantsOf(em, scope, thread.id)
      const addressed = staff ? participants : staffParticipants(participants)
      const contacts = await contactResolver(ctx.container).contacts(
        addressed.map((participant) => participant.personId),
        { container: ctx.container, ...scope, scope: authorized.scope, em },
      )
      const recipients = replyRecipients(
        addressed,
        new Map(contacts.map((contact) => [contact.personId, contact])),
        authorPersonId,
      )
      const { dispatchId } = await dispatchService(ctx).enqueue(
        em,
        {
          template: 'communication.reply',
          params: { threadId: thread.id, subject: thread.subject, body: authorized.parsed.body },
          recipients,
          source: { module: 'communication', type: 'communication:thread_message', id: messageId },
          idempotencyKey: `communication:thread:${messageId}`,
          actor: { userId: ctx.auth?.sub ?? null, actingRole: authorized.actingRole },
        },
        { ...scope, scope: authorized.scope, em },
      )
      em.persist(
        em.create(ThreadMessage, {
          id: messageId,
          ...scope,
          threadId: thread.id,
          kind: 'message',
          authorPersonId,
          actingRole,
          audience: staff ? 'all' : 'staff',
          body: authorized.parsed.body,
          dispatchId,
          recipientCount: recipients.filter((recipient) => recipient.channels.length > 0).length,
        }),
      )
      thread.lastMessageAt = new Date()
      await em.flush()
      await upsertReadMarker(em, scope, thread.id, authorPersonId, thread.lastMessageAt)
      return {
        threadId: thread.id,
        messageId,
        dispatchId,
        actingRole,
        scope,
        threadUpdatedAt: thread.updatedAt.toISOString(),
      }
    })
    await publishAfterCommit(ctx, result.dispatchId, result.scope)
    await emitAfterCommit('communication.message.posted', result.scope, {
      id: result.messageId,
      threadId: result.threadId,
    })
    return result
  },
  buildLog: ({ result }) =>
    communicationLog({
      labelKey: 'communication.audit.threads.reply',
      fallback: 'Reply in a thread',
      resourceKind: MESSAGE_RESOURCE_KIND,
      resourceId: result.messageId,
      scope: result.scope,
      actingRole: result.actingRole,
      parent: { resourceKind: THREAD_RESOURCE_KIND, resourceId: result.threadId },
      context: { dispatchId: result.dispatchId },
    }),
}

// --- communication.messages.revise / communication.messages.delete ------------------------------------------------

type MessageAccess = { thread: Thread; message: ThreadMessage; deleted: boolean; updatedAt: Date }

async function loadMessageAccess(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  threadId: string,
  messageId: string,
  lock: TargetLock,
): Promise<MessageAccess | null> {
  const scope = trusted(ctx)
  const thread = await loadThread(em, scope, threadId, lock)
  if (!thread) return null
  const message = await em.findOne(ThreadMessage, {
    id: messageId,
    ...scope,
    threadId,
    kind: { $in: [...ORIGINAL_MESSAGE_KINDS] },
  })
  if (!message) return null
  const tombstone = await em.findOne(
    ThreadMessage,
    { ...scope, threadId, kind: 'tombstone', supersedesMessageId: messageId },
    { fields: ['id'] },
  )
  return { thread, message, deleted: tombstone !== null, updatedAt: thread.updatedAt }
}

/** The author edits through their own person (`self`); a coordinator of the section or the administrator too. */
function messageTarget(access: MessageAccess | null, id: string, scope: CommunicationScope) {
  if (!access) return { id, ...scope }
  return threadTarget(access.thread, access.message.authorPersonId ?? null)
}

function changeMessageCommand(
  kind: 'revision' | 'tombstone',
): CommandHandler<Record<string, unknown>, ThreadCommandResult> {
  const id = kind === 'revision' ? 'communication.messages.revise' : 'communication.messages.delete'
  return {
    id,
    isUndoable: false,
    async execute(rawInput, ctx) {
      const rowId = randomUUID()
      const result = await inWriteTransaction(ctx, id, async (em) => {
        const authorized = await authorizeScoped(
          {
            input: kind === 'revision' ? messageReviseSchema : messageDeleteSchema,
            resourceKind: THREAD_RESOURCE_KIND,
            allowedKinds: PARTICIPANT_KINDS,
            loadTarget: (parsed, txEm, lock) => loadMessageAccess(ctx, txEm, parsed.threadId, parsed.messageId, lock),
            resolveTarget: (parsed, access, scope) => messageTarget(access, parsed.threadId, scope),
          },
          rawInput,
          ctx,
          em,
        )
        const access = authorized.entity as MessageAccess
        const { thread, message } = access
        const scope = scopeOf(thread)
        // The thread is row-locked, so a marking that commits first is seen here (REQ-M09: a case refuses every change).
        const refusal = messageChangeRefusal({
          threadIsCase: thread.isCase,
          system: isSystemMessage({ kind: message.kind, authorPersonId: message.authorPersonId ?? null }),
          deleted: access.deleted,
        })
        if (refusal) return communicationErrors.throw(refusal)
        const editorPersonId = selfPersonId(authorized.scope)
        em.persist(
          em.create(ThreadMessage, {
            id: rowId,
            ...scope,
            threadId: thread.id,
            kind,
            supersedesMessageId: message.id,
            authorPersonId: editorPersonId,
            actingRole: authorized.actingRole,
            audience: message.audience,
            body: kind === 'revision' ? ((authorized.parsed as { body?: string }).body ?? null) : null,
          }),
        )
        thread.lastMessageAt = new Date()
        await em.flush()
        return {
          threadId: thread.id,
          messageId: message.id,
          dispatchId: null,
          actingRole: authorized.actingRole,
          scope,
          threadUpdatedAt: thread.updatedAt.toISOString(),
        }
      })
      await emitAfterCommit(
        kind === 'revision' ? 'communication.message.updated' : 'communication.message.deleted',
        result.scope,
        { id: result.messageId, threadId: result.threadId },
      )
      return result
    },
    buildLog: ({ result }) =>
      communicationLog({
        labelKey: kind === 'revision' ? 'communication.audit.messages.revise' : 'communication.audit.messages.delete',
        fallback: kind === 'revision' ? 'Edit a message' : 'Delete a message',
        resourceKind: MESSAGE_RESOURCE_KIND,
        resourceId: result.messageId,
        scope: result.scope,
        actingRole: result.actingRole,
        parent: { resourceKind: THREAD_RESOURCE_KIND, resourceId: result.threadId },
      }),
  }
}

// --- communication.threads.mark_case ------------------------------------------------------------------------------

export type MarkCaseResult = {
  threadId: string
  actingRole: string
  scope: CommunicationScope
  caseOpenedAt: string
  threadUpdatedAt: string
}

/**
 * Marks a thread as a case (foundation III REQ-M09, DD-M11; club spec REQ-010): the coordinator of the thread's section
 * or the administrator, with the thread's version (S5.2). Records who (`case_opened_by_person_id`), when
 * (`case_opened_at`) and the acting role (R01, the log's `context.actingRole`) with a conditional update, so a second
 * marking answers 409 `case_already_open`. Not undoable: an undo would unmark the case.
 */
const markCaseCommand: CommandHandler<Record<string, unknown>, MarkCaseResult> = {
  id: 'communication.threads.mark_case',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'communication.threads.mark_case', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: threadMarkCaseSchema,
          resourceKind: THREAD_RESOURCE_KIND,
          allowedKinds: CASE_MANAGE_KINDS,
          loadTarget: (parsed, txEm, lock) => loadThread(txEm, trusted(ctx), parsed.threadId, lock),
          resolveTarget: (parsed, thread, scope) => (thread ? threadTarget(thread) : { id: parsed.threadId, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const thread = authorized.entity as Thread
      const scope = scopeOf(thread)
      if (thread.isCase) return communicationErrors.throw('case_already_open')
      const openedByPersonId = selfPersonId(authorized.scope)
      if (!openedByPersonId) return foundationErrors.throw(scopeDenialCode(authorized.scope))
      const at = new Date()
      if (!(await openCase(em, scope, thread.id, openedByPersonId, at))) {
        return communicationErrors.throw('case_already_open')
      }
      return {
        threadId: thread.id,
        actingRole: authorized.actingRole,
        scope,
        caseOpenedAt: at.toISOString(),
        threadUpdatedAt: at.toISOString(),
      }
    })
    await emitAfterCommit('communication.case.opened', result.scope, { id: result.threadId })
    return result
  },
  buildLog: ({ result }) =>
    communicationLog({
      labelKey: 'communication.audit.threads.mark_case',
      fallback: 'Mark a thread as a case',
      resourceKind: THREAD_RESOURCE_KIND,
      resourceId: result.threadId,
      scope: result.scope,
      actingRole: result.actingRole,
      context: { caseOpenedAt: result.caseOpenedAt },
    }),
}

// --- communication.threads.mark_read ------------------------------------------------------------------------------

export type MarkReadResult = { threadId: string; lastReadAt: string }

const markReadCommand: CommandHandler<Record<string, unknown>, MarkReadResult> = {
  id: 'communication.threads.mark_read',
  isUndoable: false,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'communication.threads.mark_read', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: threadReadSchema,
          resourceKind: THREAD_RESOURCE_KIND,
          allowedKinds: PARTICIPANT_KINDS,
          loadTarget: (parsed, txEm) => loadThreadAccess(ctx, txEm, parsed.threadId, undefined),
          // A read marker is the reader's own state, not an edit of the thread.
          lock: 'none',
          resolveTarget: (parsed, access, scope) => accessTarget(access, parsed.threadId, scope),
        },
        rawInput,
        ctx,
        em,
      )
      const access = authorized.entity as ThreadAccess
      if (!access.selfPersonId) return foundationErrors.throw(scopeDenialCode(authorized.scope))
      const at = new Date()
      await upsertReadMarker(em, scopeOf(access.thread), access.thread.id, access.selfPersonId, at)
      return { threadId: access.thread.id, lastReadAt: at.toISOString() }
    })
  },
}

// --- communication.threads.record_cancellation (the subscriber `communication:session-cancelled`) -----------------

export type CancellationResult = ThreadCommandResult & { threadCreated: boolean }

const recordCancellationCommand: CommandHandler<Record<string, unknown>, CancellationResult | null> = {
  id: 'communication.threads.record_cancellation',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'communication.threads.record_cancellation', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: cancellationSchema,
          resourceKind: THREAD_RESOURCE_KIND,
          allowedKinds: ['system_job'],
          resolveTarget: (_parsed, _entity, scope) => ({ id: scope.organizationId, ...scope }),
          lock: 'none',
          scopeSource: { job: true },
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const directory = scheduleDirectory(ctx.container)
      if (!directory) return null
      const occurrence = (await directory.findOccurrences(scope, [parsed.occurrenceId], em)).get(parsed.occurrenceId)
      if (!occurrence || occurrence.status !== 'cancelled') return null
      await lockOccurrenceThread(em, organizationId, occurrence.id)
      const { timeZone } = await clubFacts(ctx.container, scope)
      let thread = await em.findOne(Thread, {
        ...scope,
        scopeType: 'occurrence',
        scopeId: occurrence.id,
        deletedAt: null,
      })
      const threadCreated = !thread
      const now = new Date()
      if (!thread) {
        thread = em.create(Thread, {
          id: randomUUID(),
          ...scope,
          scopeType: 'occurrence',
          scopeId: occurrence.id,
          sectionId: occurrence.sectionId,
          groupId: occurrence.groupId,
          subject: sessionLabel(occurrence.activityName, occurrence.startAt, timeZone),
          authorPersonId: null,
          lastMessageAt: now,
        })
        em.persist(thread)
        await em.flush()
      }
      const messageId = randomUUID()
      const audience: AudienceSpec = { kind: 'occurrence', ids: [occurrence.id] }
      const resolved = await resolveAudience(audience, {
        container: ctx.container,
        ...scope,
        scope: authorized.scope,
        em,
      })
      // #139: a coach's cancellation also reaches the section's live coordinators (as staff), never the canceller.
      const actorPersonId = parsed.actorPersonId ?? null
      const coordinatorIds = cancellationCoordinatorIds(
        parsed.actingRole ?? null,
        parsed.actingRole === 'coach'
          ? await personDirectory(ctx.container).sectionCoordinatorIdsOn(
              scope,
              occurrence.sectionId,
              occurrence.occurrenceDate,
              em,
            )
          : [],
        actorPersonId,
      )
      const coordinators =
        coordinatorIds.length > 0
          ? await resolveMembers(
              coordinatorIds.map((personId) => ({ personId, reason: 'coach' as const })),
              { container: ctx.container, ...scope, scope: authorized.scope, em },
            )
          : null
      const audienceRecipients = withExtraRecipients(resolved.recipients, coordinators?.recipients ?? [])
      // E-mail only: the in-app notice stays `activities.occurrence_cancelled` (REQ-M07).
      const recipients = emailOnlyRecipients(audienceRecipients, parsed.actorUserId ?? null)
      const reason = occurrence.cancelReason ?? ''
      // R01: the notice names who cancelled and in which role; an event older than #139 names nobody.
      const canceller = actorPersonId
        ? (await personDirectory(ctx.container).findPersons(scope, [actorPersonId], em)).get(actorPersonId)
        : undefined
      const cancelledBy = canceller ? cancelledByOf(canceller, parsed.actingRole ?? null) : null
      const { dispatchId, created } = await dispatchService(ctx).enqueue(
        em,
        {
          template: 'communication.session_cancelled',
          params: {
            threadId: thread.id,
            activityName: occurrence.activityName ?? '',
            startAt: occurrence.startAt.toISOString(),
            endAt: occurrence.endAt.toISOString(),
            gatheringAt: occurrence.gatheringAt?.toISOString() ?? null,
            timeZone,
            reason,
            ...(cancelledBy ? { cancelledByName: cancelledBy.name, cancelledByRole: cancelledBy.role } : {}),
          },
          recipients,
          audience,
          source: { module: 'communication', type: 'communication:thread_message', id: messageId },
          // Keyed by the cancellation event (S4.6): a replayed event finds this dispatch and adds nothing.
          idempotencyKey: `communication:cancel:${parsed.eventKey}`,
          actor: { userId: null, actingRole: 'system' },
        },
        { ...scope, scope: authorized.scope, em },
      )
      if (!created) {
        return {
          threadId: thread.id,
          messageId,
          dispatchId: null,
          actingRole: 'system',
          scope,
          threadUpdatedAt: thread.updatedAt.toISOString(),
          created: false,
          threadCreated,
        }
      }
      em.persist(
        em.create(ThreadMessage, {
          id: messageId,
          ...scope,
          threadId: thread.id,
          // A named canceller makes it a `cancellation` notice (#139); without one it stays the anonymous system message.
          kind: cancelledBy ? 'cancellation' : 'message',
          authorPersonId: cancelledBy ? actorPersonId : null,
          actingRole: cancelledBy?.role ?? 'system',
          audience: 'all',
          body: reason,
          dispatchId,
          recipientCount: recipients.filter((recipient) => recipient.channels.length > 0).length,
        }),
      )
      thread.lastMessageAt = now
      await em.flush()
      await insertParticipants(em, scope, thread.id, participantRows(audienceRecipients, null))
      return {
        threadId: thread.id,
        messageId,
        dispatchId,
        actingRole: 'system',
        scope,
        threadUpdatedAt: thread.updatedAt.toISOString(),
        created: true,
        threadCreated,
      }
    })
    if (!result?.created) return result
    await publishAfterCommit(ctx, result.dispatchId, result.scope)
    if (result.threadCreated)
      await emitAfterCommit('communication.thread.created', result.scope, { id: result.threadId })
    await emitAfterCommit('communication.message.posted', result.scope, {
      id: result.messageId,
      threadId: result.threadId,
    })
    return result
  },
}

registerCommand(createThreadCommand)
registerCommand(startDirectCommand)
registerCommand(replyCommand)
registerCommand(changeMessageCommand('revision'))
registerCommand(changeMessageCommand('tombstone'))
registerCommand(markCaseCommand)
registerCommand(markReadCommand)
registerCommand(recordCancellationCommand)
