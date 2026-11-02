// P-30 dispatch (foundation III REQ-M02, REQ-M03, DD-M02…DD-M04, DD-M08): every outbound message of a Vereino module.
// The caller enqueues inside its own command transaction (one dispatch per idempotency key, one delivery per recipient
// and channel, secrets encrypted on the e-mail rows), publishes from its post-commit side effects, and the worker
// `foundation:dispatch-deliver` delivers at least once. Jobs carry ids and the trusted scope only.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { createModuleQueue, type Queue } from '@open-mercato/queue'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import type { ActingRole, AudienceReason, AudienceSpec, Recipient, RecipientChannel } from '@vereino/core'
import { foundationErrors } from '../api/errors'
import { Delivery, Dispatch } from '../data/entities'
import { lockDispatchKey, markPublished, queuedDeliveriesOf, type DispatchScope } from '../data/queries'
import { chunk, planDeliveries, type DeliveryStatus, type FailureCode, type SkipReason } from '../lib/dispatch-rules'
import { isOptOutAvailable } from '../lib/email-templates'
import { contactResolver, resolveAudience, type AudienceContext } from './audience'
import { resolveEmailTemplate } from './email-templates'

const logger = createLogger('foundation').child({ component: 'dispatch' })

/** The queue of `foundation:dispatch-deliver` (concurrency 5). */
export const DISPATCH_QUEUE = 'foundation-dispatch'

/** A delivery job: one e-mail delivery, or the in-app deliveries of one dispatch — ids and the scope the server wrote. */
export type DispatchJob =
  | { deliveryId: string; tenantId: string; organizationId: string }
  | { dispatchId: string; tenantId: string; organizationId: string }

let dispatchQueue: Queue<DispatchJob> | null = null

/** The process-wide queue (`QUEUE_STRATEGY` local or async), created once. */
export function getDispatchQueue(): Queue<DispatchJob> {
  dispatchQueue ??= createModuleQueue<DispatchJob>(DISPATCH_QUEUE, { concurrency: 5 })
  return dispatchQueue
}

export type DispatchRequest = {
  /** A registered template id (`vereino.emailTemplate.<id>`). */
  template: string
  /** Params common to every recipient, validated with the template's schema; ids and the club text it needs. */
  params: unknown
  /** The recipients, already resolved (e.g. by the composer's preview); otherwise `audience` is resolved here. */
  recipients?: readonly Recipient[]
  audience?: AudienceSpec
  /** Person ids to drop from a resolved `audience` (the author). */
  exclude?: readonly string[]
  /** The record that caused the message, e.g. `{ module: 'communication', type: 'communication:thread_message', id }`. */
  source: { module: string; type: string; id: string }
  /** One dispatch per key and organization, e.g. `communication:thread:${messageId}` or `…:${eventId}`. */
  idempotencyKey: string
  /** Per-recipient secret params by person id (a raw link token), attached to the e-mail delivery only (DD-M04). */
  secrets?: ReadonlyMap<string, Record<string, unknown>>
  /** From `authorizeScoped`: the acting user (null for a job) and the acting role. */
  actor: { userId: string | null; actingRole: ActingRole }
}

export type EnqueueResult = { dispatchId: string; created: boolean }

/** A delivery as a staff list shows it: never the address or a secret (DD-M09). */
export type DeliveryView = {
  id: string
  personId: string | null
  name: string | null
  channel: RecipientChannel
  reasons: AudienceReason[]
  status: DeliveryStatus
  skipReason: SkipReason | null
  failureCode: FailureCode | null
  attempts: number
  lastAttemptAt: string | null
}

export type PagedDeliveries = {
  items: DeliveryView[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** A 500 with a fingerprint for a programming error (an unknown template, a template class that cannot be sent). */
function internalError(fingerprint: string, message: string): Error {
  const error = Object.assign(new Error(`[internal] ${message}`), { fingerprint })
  getTelemetryRuntime()?.reportError(error, { module: 'foundation', code: fingerprint })
  return error
}

/**
 * Writes the dispatch and its deliveries with the caller's transactional `em` (REQ-M02). A repeated key returns the
 * first dispatch and writes nothing. Refuses an unknown template (500 `foundation.dispatch.unknown_template`), a
 * `preferences` template (500 `foundation.dispatch.optout_unavailable`, Q15 = B) and params that fail the template's
 * schema (422 `dispatch_params_invalid`). Nothing is sent before the caller commits and calls `publish`.
 */
export async function enqueueDispatch(
  em: EntityManager,
  request: DispatchRequest,
  ctx: AudienceContext,
): Promise<EnqueueResult> {
  if (!em.isInTransaction()) throw new Error('[internal] dispatch.enqueue must run inside the caller’s transaction')
  const template = resolveEmailTemplate(ctx.container, request.template)
  if (!template) {
    throw internalError('foundation.dispatch.unknown_template', `unknown e-mail template ${request.template}`)
  }
  if (!isOptOutAvailable(template.optOut)) {
    throw internalError(
      'foundation.dispatch.optout_unavailable',
      `e-mail template ${template.id} needs an opt-out mechanism that does not exist yet`,
    )
  }
  const parsed = template.params.safeParse(request.params)
  if (!parsed.success) return foundationErrors.throw('dispatch_params_invalid')

  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  await lockDispatchKey(em, scope.organizationId, request.idempotencyKey)
  const existing = await em.findOne(Dispatch, { ...scope, idempotencyKey: request.idempotencyKey }, { fields: ['id'] })
  if (existing) return { dispatchId: existing.id, created: false }

  const recipients =
    request.recipients ??
    (request.audience
      ? (await resolveAudience(request.audience, { ...ctx, em }, { exclude: request.exclude })).recipients
      : [])
  const rows = planDeliveries(recipients, request.secrets)
  const skipped = rows.filter((row) => row.status === 'skipped').length
  const dispatch = em.create(Dispatch, {
    id: randomUUID(),
    ...scope,
    templateId: template.id,
    sourceModule: request.source.module,
    sourceType: request.source.type,
    sourceId: request.source.id,
    idempotencyKey: request.idempotencyKey,
    audience: request.audience ? { kind: request.audience.kind, ids: [...(request.audience.ids ?? [])] } : null,
    params: JSON.stringify(parsed.data),
    actorUserId: request.actor.userId,
    actingRole: request.actor.actingRole,
    recipientCount: recipients.length,
    skippedCount: skipped,
    // Nothing to deliver (every recipient unreachable): the dispatch is final at once.
    status: skipped === rows.length ? 'done' : 'queued',
  })
  em.persist(dispatch)
  for (const row of rows) {
    em.persist(
      em.create(Delivery, {
        ...scope,
        dispatchId: dispatch.id,
        personId: row.personId,
        userId: row.userId,
        channel: row.channel,
        email: row.email,
        // Present (null) so the platform's encryption fills the lookup hash of the address on insert.
        emailHash: null,
        locale: row.locale,
        reasons: row.reasons,
        status: row.status,
        skipReason: row.skipReason,
        secretParams: row.secret ? JSON.stringify(row.secret) : null,
      }),
    )
  }
  await em.flush()
  return { dispatchId: dispatch.id, created: true }
}

/**
 * Enqueues the jobs of a committed dispatch: one per queued e-mail delivery and one for its in-app deliveries. A
 * failure is logged and left to the sweeper (`foundation:dispatch-sweep`), never thrown into the caller's response.
 */
export async function publishDispatch(
  container: AwilixContainer,
  dispatchId: string,
  scope: DispatchScope,
): Promise<void> {
  try {
    const em = container.resolve<EntityManager>('em').fork()
    const { emailIds, hasInApp } = await queuedDeliveriesOf(em, scope, dispatchId)
    const queue = getDispatchQueue()
    if (hasInApp) await queue.enqueue({ dispatchId, ...scope })
    for (const batch of chunk(emailIds, 100)) {
      await Promise.all(batch.map((deliveryId) => queue.enqueue({ deliveryId, ...scope })))
    }
    await markPublished(em, scope, dispatchId)
  } catch (error: unknown) {
    logger.warn('Dispatch publish failed; the sweeper will resume it', { dispatchId, err: error })
  }
}

/**
 * The deliveries of one dispatch for a staff status list (`DeliveryStatusList`), problems (failed or skipped) only on
 * request; names come from the contact resolver, addresses never leave the row.
 */
export async function deliveriesOf(
  dispatchId: string,
  page: { page?: number; pageSize?: number; problemsOnly?: boolean },
  ctx: AudienceContext,
): Promise<PagedDeliveries> {
  const pageSize = Math.min(Math.max(page.pageSize ?? 50, 1), 100)
  const pageNo = Math.max(page.page ?? 1, 1)
  const em = ctx.em ?? ctx.container.resolve<EntityManager>('em').fork()
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const where = {
    ...scope,
    dispatchId,
    ...(page.problemsOnly ? { status: { $in: ['failed', 'skipped'] as DeliveryStatus[] } } : {}),
  }
  const [rows, total] = await em.findAndCount(Delivery, where, {
    fields: [
      'id',
      'personId',
      'channel',
      'reasons',
      'status',
      'skipReason',
      'failureCode',
      'attempts',
      'sentAt',
      'failedAt',
      'updatedAt',
    ],
    orderBy: { personId: 'asc', channel: 'asc' },
    limit: pageSize,
    offset: (pageNo - 1) * pageSize,
  })
  const personIds = [...new Set(rows.flatMap((row) => (row.personId ? [row.personId] : [])))]
  const names = new Map(
    (personIds.length > 0 ? await contactResolver(ctx.container).contacts(personIds, ctx) : []).map((contact) => [
      contact.personId,
      contact.name,
    ]),
  )
  return {
    items: rows.map((row) => ({
      id: row.id,
      personId: row.personId ?? null,
      name: row.personId ? (names.get(row.personId) ?? null) : null,
      channel: row.channel,
      reasons: row.reasons as AudienceReason[],
      status: row.status,
      skipReason: row.skipReason ?? null,
      failureCode: row.failureCode ?? null,
      attempts: row.attempts,
      lastAttemptAt: (row.sentAt ?? row.failedAt ?? (row.attempts > 0 ? row.updatedAt : null))?.toISOString() ?? null,
    })),
    total,
    page: pageNo,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/** Reads one dispatch with its params decrypted, in the job's scope; null when absent there. */
export async function loadDispatch(
  em: EntityManager,
  scope: DispatchScope,
  dispatchId: string,
): Promise<Dispatch | null> {
  const rows = await findWithDecryption(em, Dispatch, { id: dispatchId, ...scope }, {}, scope)
  return rows.length > 0 ? rows[0] : null
}

/** Reads one delivery with its address and secret decrypted, in the job's scope; null when absent there. */
export async function loadDelivery(
  em: EntityManager,
  scope: DispatchScope,
  deliveryId: string,
): Promise<Delivery | null> {
  const rows = await findWithDecryption(em, Delivery, { id: deliveryId, ...scope }, {}, scope)
  return rows.length > 0 ? rows[0] : null
}

/** The `foundationDispatch` service a module resolves from DI (`dispatchService(container)`). */
export type DispatchService = {
  enqueue(em: EntityManager, request: DispatchRequest, ctx: Omit<AudienceContext, 'container'>): Promise<EnqueueResult>
  publish(dispatchId: string, scope: DispatchScope): Promise<void>
  deliveriesOf(
    dispatchId: string,
    page: { page?: number; pageSize?: number; problemsOnly?: boolean },
    ctx: Omit<AudienceContext, 'container'>,
  ): Promise<PagedDeliveries>
}

export function createDispatchService(container: AwilixContainer): DispatchService {
  return {
    enqueue: (em, request, ctx) => enqueueDispatch(em, request, { ...ctx, container }),
    publish: (dispatchId, scope) => publishDispatch(container, dispatchId, scope),
    deliveriesOf: (dispatchId, page, ctx) => deliveriesOf(dispatchId, page, { ...ctx, container }),
  }
}
