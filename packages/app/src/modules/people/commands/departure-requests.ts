// Departure requests (people life-cycle spec *Departure request*, DD-L06, *API* rows `/api/people/me/departure-requests`
// and `/api/people/departure-requests`; J-L02 step 1; phase L4, #306). A member asks to leave from the phone — for
// themself and/or their own active wards, never as a minor — and may withdraw the open request; the club administrator
// records a request from a letter or the club's own decision, and declines one with a reason. Only the administrator
// decides: a request changes nothing else (the departure itself is `people.persons.depart`, which closes the requests
// of its persons). One open request per subject (409 `departure_request_exists`, backed by the partial unique index).
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { findActingRole, type ActingRole } from '@vereino/core'
import { authorizeScoped, foundationErrors, trustedScopeOf, type TargetLock } from '@/modules/foundation'
import { peopleErrors } from '../api/errors'
import { DepartureRequest, Person } from '../data/entities'
import {
  declineDepartureRequestSchema,
  memberDepartureRequestSchema,
  recordDepartureRequestSchema,
  withdrawDepartureRequestSchema,
} from '../data/validators'
import { emitPeopleEvent } from '../events'
import { isDepartureDateInPast, mayFileDepartureRequest, requesterKind } from '../lib/departure-rules'
import { clubToday } from '../services/club-clock'
import { notifyDepartureDeclined } from '../services/departure-notices'
import { actorPersonId, inWriteTransaction, isUniqueViolation, loadPersonLocked, personTarget } from './shared'

const logger = createLogger('people').child({ component: 'departure-requests' })

const RESOURCE_KIND = 'people.departure_request'

type ClubScope = { tenantId: string; organizationId: string }

export type DepartureRequestCommandResult = {
  batchId: string
  requestIds: string[]
  subjectPersonIds: string[]
  tenantId: string
  organizationId: string
  actingRole: ActingRole
}

/** The person linked to the session's user, row-locked; 404 `person_not_linked` without one. */
async function loadOwnPersonLocked(em: EntityManager, ctx: CommandRuntimeContext, lock: TargetLock): Promise<Person> {
  const scope = trustedScopeOf(ctx)
  const userId = ctx.auth?.sub
  const person =
    scope && userId ? await findOneWithDecryption(em, Person, { userId, ...scope, deletedAt: null }, lock, scope) : null
  if (!person) return peopleErrors.throw('person_not_linked')
  return person
}

/** 409 `departure_request_exists` when a subject already has an open request. */
async function assertNoOpenRequest(em: EntityManager, scope: ClubScope, subjectIds: readonly string[]) {
  const open = await em.find(
    DepartureRequest,
    { ...scope, subjectPersonId: { $in: [...subjectIds] }, status: 'open', deletedAt: null },
    { fields: ['id', 'subjectPersonId'] },
  )
  if (open.length > 0) {
    await peopleErrors.throw('departure_request_exists', { subjectPersonIds: open.map((row) => row.subjectPersonId) })
  }
}

/** The partial unique index on open requests backs the check: its violation answers the same 409. */
async function mapRequestViolation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error: unknown) {
    if (isUniqueViolation(error)) return peopleErrors.throw('departure_request_exists')
    throw error
  }
}

async function requestLog(result: DepartureRequestCommandResult, labelKey: string, fallback: string) {
  const { translate } = await resolveTranslations()
  return {
    actionLabel: translate(labelKey, fallback),
    resourceKind: RESOURCE_KIND,
    resourceId: result.batchId,
    tenantId: result.tenantId,
    organizationId: result.organizationId,
    context: {
      actingRole: result.actingRole,
      requestIds: result.requestIds,
      subjectPersonIds: result.subjectPersonIds,
    },
  }
}

/**
 * `people.departure_requests.file` — a member's request for themself and/or their own active wards (403 for anyone
 * else, 422 `departure_request_minor` for a minor caller). Not undoable: the member withdraws it.
 */
const fileCommand: CommandHandler<Record<string, unknown>, DepartureRequestCommandResult> = {
  id: 'people.departure_requests.file',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await mapRequestViolation(() =>
      inWriteTransaction(ctx, 'people.departure_requests.file', async (em) => {
        const authorized = await authorizeScoped(
          {
            input: memberDepartureRequestSchema,
            resourceKind: RESOURCE_KIND,
            allowedKinds: ['self'],
            loadTarget: (_parsed, txEm, lock) => loadOwnPersonLocked(txEm, ctx, lock),
            resolveTarget: (_parsed, entity) => personTarget(entity as Person),
            lock: 'none',
          },
          rawInput,
          ctx,
          em,
        )
        const caller = authorized.entity as Person
        const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
        const input = authorized.parsed
        const subjectIds = [...new Set(input.subjectPersonIds)].sort()
        for (const subjectId of subjectIds) {
          const target = { id: subjectId, ...scope, personId: subjectId }
          if (!findActingRole(authorized.scope, ['self', 'guardian'], target)) {
            await foundationErrors.throw('scope_denied')
          }
        }
        const today = await clubToday(ctx.container, scope)
        if (!mayFileDepartureRequest(caller.birthDate, today)) await peopleErrors.throw('departure_request_minor')
        if (input.lastDay && isDepartureDateInPast(input.lastDay, today)) {
          await peopleErrors.throw('departure_date_in_past', { field: 'lastDay' })
        }
        await assertNoOpenRequest(em, scope, subjectIds)
        const batchId = randomUUID()
        const rows = subjectIds.map((subjectId) =>
          em.create(DepartureRequest, {
            id: randomUUID(),
            ...scope,
            batchId,
            subjectPersonId: subjectId,
            requestedByPersonId: caller.id,
            requesterKind: requesterKind(subjectId, caller.id),
            requestedLastDay: input.lastDay ?? null,
            erasureRequested: input.erasure,
            note: input.note || null,
          }),
        )
        for (const row of rows) em.persist(row)
        await em.flush()
        return {
          batchId,
          requestIds: rows.map((row) => row.id),
          subjectPersonIds: subjectIds,
          ...scope,
          actingRole: authorized.actingRole,
        }
      }),
    )
    await emitPeopleEvent(
      'people.departure_request.created',
      {
        id: result.batchId,
        tenantId: result.tenantId,
        organizationId: result.organizationId,
        batchId: result.batchId,
        subjectPersonIds: result.subjectPersonIds,
      },
      { persistent: true, tenantId: result.tenantId, organizationId: result.organizationId },
    )
    return result
  },
  buildLog: ({ result }) => requestLog(result, 'people.audit.departureRequests.file', 'Ask to leave the club'),
}

/** `people.departure_requests.withdraw` — the member deletes the open rows of their own request (soft delete). */
const withdrawCommand: CommandHandler<Record<string, unknown>, DepartureRequestCommandResult> = {
  id: 'people.departure_requests.withdraw',
  isUndoable: false,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'people.departure_requests.withdraw', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: withdrawDepartureRequestSchema,
          resourceKind: RESOURCE_KIND,
          allowedKinds: ['self'],
          loadTarget: (_parsed, txEm, lock) => loadOwnPersonLocked(txEm, ctx, lock),
          resolveTarget: (_parsed, entity) => personTarget(entity as Person),
          lock: 'none',
        },
        rawInput,
        ctx,
        em,
      )
      const caller = authorized.entity as Person
      const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
      const rows = await em.find(DepartureRequest, {
        ...scope,
        batchId: authorized.parsed.batchId,
        requestedByPersonId: caller.id,
        status: 'open',
        deletedAt: null,
      })
      if (rows.length === 0) return peopleErrors.throw('departure_request_not_open')
      for (const row of rows) {
        row.deletedAt = new Date()
        row.updatedAt = new Date()
      }
      return {
        batchId: authorized.parsed.batchId,
        requestIds: rows.map((row) => row.id),
        subjectPersonIds: rows.map((row) => row.subjectPersonId).sort(),
        ...scope,
        actingRole: authorized.actingRole,
      }
    })
  },
  buildLog: ({ result }) =>
    requestLog(result, 'people.audit.departureRequests.withdraw', 'Withdraw a request to leave the club'),
}

/**
 * `people.departure_requests.record` — the administrator records a request from a letter, a talk or the club's own
 * decision (`requesterKind: club`), with a note. Not undoable: the administrator declines it.
 */
const recordCommand: CommandHandler<Record<string, unknown>, DepartureRequestCommandResult> = {
  id: 'people.departure_requests.record',
  isUndoable: false,
  async execute(rawInput, ctx) {
    return mapRequestViolation(() =>
      inWriteTransaction(ctx, 'people.departure_requests.record', async (em) => {
        const authorized = await authorizeScoped(
          {
            input: recordDepartureRequestSchema,
            resourceKind: RESOURCE_KIND,
            allowedKinds: ['club_admin'],
            loadTarget: (parsed, txEm, lock) => loadPersonLocked(txEm, ctx, parsed.subjectPersonId, lock),
            resolveTarget: (_parsed, entity) => personTarget(entity as Person),
            lock: 'none',
          },
          rawInput,
          ctx,
          em,
        )
        const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
        const input = authorized.parsed
        const today = await clubToday(ctx.container, scope)
        if (input.lastDay && isDepartureDateInPast(input.lastDay, today)) {
          await peopleErrors.throw('departure_date_in_past', { field: 'lastDay' })
        }
        await assertNoOpenRequest(em, scope, [input.subjectPersonId])
        const batchId = randomUUID()
        const row = em.create(DepartureRequest, {
          id: randomUUID(),
          ...scope,
          batchId,
          subjectPersonId: input.subjectPersonId,
          requestedByPersonId: null,
          requesterKind: input.requesterKind,
          requestedLastDay: input.lastDay ?? null,
          erasureRequested: input.erasure,
          note: input.note || null,
        })
        em.persist(row)
        await em.flush()
        return {
          batchId,
          requestIds: [row.id],
          subjectPersonIds: [input.subjectPersonId],
          ...scope,
          actingRole: authorized.actingRole,
        }
      }),
    )
  },
  buildLog: ({ result }) =>
    requestLog(result, 'people.audit.departureRequests.record', 'Record a request to leave the club'),
}

type LockedRequest = { request: DepartureRequest; updatedAt: Date }

/**
 * `people.departure_requests.decline` — the administrator declines an open request with a reason (encrypted; shown
 * to the member in the app, never in the message). The request's version is checked (409). The member is told.
 */
const declineCommand: CommandHandler<Record<string, unknown>, DepartureRequestCommandResult & { updatedAt: string }> = {
  id: 'people.departure_requests.decline',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'people.departure_requests.decline', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: declineDepartureRequestSchema,
          resourceKind: RESOURCE_KIND,
          allowedKinds: ['club_admin'],
          loadTarget: async (parsed, txEm, lock): Promise<LockedRequest | null> => {
            const scope = trustedScopeOf(ctx)
            if (!scope) return null
            const request = await txEm.findOne(DepartureRequest, { id: parsed.id, ...scope, deletedAt: null }, lock)
            return request ? { request, updatedAt: request.updatedAt } : null
          },
          resolveTarget: (_parsed, entity) => {
            const { request } = entity as LockedRequest
            return personTarget({
              id: request.subjectPersonId,
              tenantId: request.tenantId,
              organizationId: request.organizationId,
            })
          },
        },
        rawInput,
        ctx,
        em,
      )
      const { request } = authorized.entity as LockedRequest
      if (request.status !== 'open') return peopleErrors.throw('departure_request_not_open')
      request.status = 'declined'
      request.declineReason = authorized.parsed.reason
      request.decidedByPersonId = actorPersonId(authorized.scope)
      request.decidedAt = new Date()
      request.updatedAt = new Date()
      return {
        request,
        batchId: request.batchId,
        requestIds: [request.id],
        subjectPersonIds: [request.subjectPersonId],
        tenantId: authorized.tenantId,
        organizationId: authorized.organizationId,
        actingRole: authorized.actingRole,
      }
    })
    const { request, ...rest } = result
    try {
      await notifyDepartureDeclined(ctx.container, rest, {
        id: request.id,
        batchId: request.batchId,
        requestedByPersonId: request.requestedByPersonId ?? null,
      })
    } catch (error: unknown) {
      logger.warn('The decline notice could not be sent', { err: error })
      getTelemetryRuntime()?.reportError(error, { module: 'people', code: 'people.departure.notice_failed' })
    }
    return { ...rest, updatedAt: request.updatedAt.toISOString() }
  },
  buildLog: ({ result }) =>
    requestLog(result, 'people.audit.departureRequests.decline', 'Decline a request to leave the club'),
}

registerCommand(fileCommand)
registerCommand(withdrawCommand)
registerCommand(recordCommand)
registerCommand(declineCommand)
