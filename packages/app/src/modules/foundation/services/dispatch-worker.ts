// The delivery side of P-30 (foundation III DD-M03, DD-M04, DD-M07, DD-M09): what `foundation:dispatch-deliver` does
// with one job and what `foundation:dispatch-sweep` does for one organization. Every read and write is narrowed to the
// job's tenant and organization (a forged job reads nothing); a delivery is leased on its row with the attempt counted,
// so a crash is retried by the sweeper under either queue strategy; e-mails go through the `foundation.emailSender`
// seam at most 8 per second per process; the final state wipes the address and the secret and a failure emits one
// ids-only event. Logs carry ids and codes only.
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { z } from 'zod'
import { classifyOutboundError } from '@open-mercato/core/modules/communication_channels/lib/error-classification'
import { buildBatchNotificationFromType } from '@open-mercato/core/modules/notifications/lib/notificationBuilder'
import { getNotificationType } from '@open-mercato/core/modules/notifications/lib/notification-type-registry'
import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { AudienceReason } from '@vereino/core'
import {
  deliveryExists,
  dispatchExists,
  dueDeliveries,
  failExhaustedDeliveries,
  finalizeDeliveries,
  leaseEmailDelivery,
  leaseInAppDeliveries,
  refreshDispatchCounts,
  scheduleRetry,
  type DispatchScope,
  type FinalOutcome,
  type LeaseSpec,
} from '../data/queries'
import { emitFoundationEvent } from '../events'
import {
  EMAIL_SENDS_PER_SECOND,
  IN_APP_BATCH_SIZE,
  LEASE_SECONDS,
  MAX_DELIVERY_ATTEMPTS,
  attemptOutcome,
  chunk,
  createSendRateLimiter,
} from '../lib/dispatch-rules'
import { isOptOutAvailable } from '../lib/email-templates'
import { contactResolver } from './audience'
import { getDispatchQueue, loadDelivery, loadDispatch, type DispatchJob } from './dispatch'
import { emailSender, isEmailDeliveryDisabled } from './email-sender'
import { renderEmail } from './email-render'
import { resolveEmailTemplate } from './email-templates'

const logger = createLogger('foundation').child({ component: 'dispatch-worker' })

/**
 * One limiter per process (S12.4 as amended by DD-M17): ≤ 8 e-mails in any second, across concurrent jobs. The window
 * is 1.1 s, so a timer that fires a little late cannot squeeze a ninth send into a second.
 */
const sendRateLimiter = createSendRateLimiter({ max: EMAIL_SENDS_PER_SECOND, windowMs: 1100 })

const scopeShape = { tenantId: z.uuid(), organizationId: z.uuid() }
export const dispatchJobSchema = z.union([
  z.object({ deliveryId: z.uuid(), ...scopeShape }).strict(),
  z.object({ dispatchId: z.uuid(), ...scopeShape }).strict(),
])

export type DispatchJobOutcome =
  'invalid' | 'refused' | 'not_due' | 'sent' | 'retry' | 'failed' | 'skipped' | 'nothing_to_do'

function newLease(): LeaseSpec {
  return {
    owner: `${hostname()}:${String(process.pid)}:${randomUUID()}`,
    seconds: LEASE_SECONDS,
    maxAttempts: MAX_DELIVERY_ATTEMPTS,
  }
}

async function emitFailures(scope: DispatchScope, rows: ReadonlyArray<{ id: string; dispatchId: string }>) {
  for (const row of rows) {
    await emitFoundationEvent(
      'foundation.dispatch.delivery_failed',
      { id: row.id, dispatchId: row.dispatchId, ...scope },
      { persistent: true, ...scope },
    )
  }
}

/** Writes a final state under the lease; a failure emits the event once per delivery that changed. */
async function finalize(
  em: EntityManager,
  scope: DispatchScope,
  dispatchId: string,
  ids: readonly string[],
  owner: string,
  outcome: FinalOutcome,
): Promise<string[]> {
  const changed = await finalizeDeliveries(em, scope, ids, owner, outcome)
  if (outcome.status === 'failed')
    await emitFailures(
      scope,
      changed.map((id) => ({ id, dispatchId })),
    )
  await refreshDispatchCounts(em, scope, dispatchId)
  logger.info('Delivery finalized', {
    dispatchId,
    deliveryIds: changed,
    status: outcome.status,
    failureCode: outcome.status === 'failed' ? outcome.failureCode : null,
    skipReason: outcome.status === 'skipped' ? outcome.skipReason : null,
  })
  return changed
}

/** Fails the rows that used up their attempts (a worker that crashed every time) and refreshes their dispatches. */
async function failExhausted(
  em: EntityManager,
  scope: DispatchScope,
  where: Parameters<typeof failExhaustedDeliveries>[2],
): Promise<number> {
  const failed = await failExhaustedDeliveries(em, scope, where, MAX_DELIVERY_ATTEMPTS)
  await emitFailures(scope, failed)
  for (const dispatchId of new Set(failed.map((row) => row.dispatchId)))
    await refreshDispatchCounts(em, scope, dispatchId)
  if (failed.length > 0) {
    logger.info('Deliveries failed after their last attempt', {
      deliveryIds: failed.map((row) => row.id),
      failureCode: 'transport_unavailable',
    })
  }
  return failed.length
}

async function deliverEmail(
  container: AwilixContainer,
  scope: DispatchScope,
  deliveryId: string,
): Promise<DispatchJobOutcome> {
  const em = container.resolve<EntityManager>('em').fork()
  if (!(await deliveryExists(em, scope, deliveryId))) {
    logger.warn('Dispatch job refused: the delivery is not in the job’s organization', {
      deliveryId,
      code: 'foundation.dispatch.job_scope_mismatch',
    })
    return 'refused'
  }
  const lease = newLease()
  const attempts = await leaseEmailDelivery(em, scope, deliveryId, lease)
  if (attempts === null) {
    return (await failExhausted(em, scope, { deliveryIds: [deliveryId] })) > 0 ? 'failed' : 'not_due'
  }
  const delivery = (await loadDelivery(em, scope, deliveryId)) as NonNullable<Awaited<ReturnType<typeof loadDelivery>>>
  const dispatchId = delivery.dispatchId
  const done = async (outcome: FinalOutcome): Promise<DispatchJobOutcome> => {
    await finalize(em, scope, dispatchId, [deliveryId], lease.owner, outcome)
    return outcome.status
  }

  if (isEmailDeliveryDisabled()) return done({ status: 'skipped', skipReason: 'delivery_disabled' })
  if (!delivery.email) return done({ status: 'failed', failureCode: 'address_invalid' })

  let rendered: Awaited<ReturnType<typeof renderEmail>>
  try {
    const dispatch = await loadDispatch(em, scope, dispatchId)
    const template = dispatch ? resolveEmailTemplate(container, dispatch.templateId) : null
    if (!dispatch || !template || !isOptOutAvailable(template.optOut)) {
      throw new Error('[internal] the dispatch has no sendable template')
    }
    const club = await contactResolver(container).club({ container, ...scope, scope: [{ kind: 'system_job' }], em })
    rendered = await renderEmail(
      template,
      JSON.parse(dispatch.params) as unknown,
      {
        locale: delivery.locale,
        reasons: delivery.reasons as AudienceReason[],
        secrets: delivery.secretParams ? (JSON.parse(delivery.secretParams) as Record<string, unknown>) : {},
      },
      { name: club.name },
    )
  } catch (error: unknown) {
    logger.warn('E-mail render failed', {
      dispatchId,
      deliveryId,
      failureCode: 'render_failed',
      errorName: error instanceof Error ? error.name : typeof error,
    })
    return done({ status: 'failed', failureCode: 'render_failed' })
  }

  await sendRateLimiter.acquire()
  try {
    await emailSender(container).send({
      to: delivery.email,
      subject: rendered.subject,
      react: rendered.react,
      text: rendered.text,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })
  } catch (error: unknown) {
    const outcome = attemptOutcome(attempts, classifyOutboundError(error))
    if (outcome.kind === 'fail') return done({ status: 'failed', failureCode: outcome.failureCode })
    await scheduleRetry(em, scope, [deliveryId], lease.owner, outcome.delayMs)
    logger.info('E-mail send failed; retry scheduled', { dispatchId, deliveryId, attempts, delayMs: outcome.delayMs })
    return 'retry'
  }
  return done({ status: 'sent' })
}

async function deliverInApp(
  container: AwilixContainer,
  scope: DispatchScope,
  dispatchId: string,
): Promise<DispatchJobOutcome> {
  const em = container.resolve<EntityManager>('em').fork()
  if (!(await dispatchExists(em, scope, dispatchId))) {
    logger.warn('Dispatch job refused: the dispatch is not in the job’s organization', {
      dispatchId,
      code: 'foundation.dispatch.job_scope_mismatch',
    })
    return 'refused'
  }
  const lease = newLease()
  const rows = await leaseInAppDeliveries(em, scope, dispatchId, lease)
  if (rows.length === 0) {
    return (await failExhausted(em, scope, { inAppOfDispatch: dispatchId })) > 0 ? 'failed' : 'nothing_to_do'
  }
  const ids = rows.map((row) => row.id)
  const dispatch = await loadDispatch(em, scope, dispatchId)
  const template = dispatch ? resolveEmailTemplate(container, dispatch.templateId) : null
  const type = template ? getNotificationType(template.notificationType) : undefined
  if (!dispatch || !type) {
    await finalize(em, scope, dispatchId, ids, lease.owner, { status: 'failed', failureCode: 'render_failed' })
    return 'failed'
  }
  const userIds = [...new Set(rows.flatMap((row) => (row.userId ? [row.userId] : [])))]
  try {
    for (const batch of chunk(userIds, IN_APP_BATCH_SIZE)) {
      // DD-M07: ids and generic keys only (the notifications tables are not encrypted); `channels: ['in_app']` on
      // every call, so an operator override that enables e-mail for the type never e-mails it a second time; the
      // dispatch id as `groupKey`, so a retried batch refreshes the notification instead of adding one.
      await resolveNotificationService(container).createBatch(
        {
          ...buildBatchNotificationFromType(type, {
            recipientUserIds: batch,
            sourceEntityType: dispatch.sourceType,
            sourceEntityId: dispatch.sourceId,
            groupKey: dispatchId,
          }),
          channels: ['in_app'],
        },
        scope,
      )
    }
  } catch (error: unknown) {
    const attempts = Math.max(...rows.map((row) => row.attempts))
    const outcome = attemptOutcome(attempts, classifyOutboundError(error))
    if (outcome.kind === 'fail') {
      await finalize(em, scope, dispatchId, ids, lease.owner, { status: 'failed', failureCode: outcome.failureCode })
      return 'failed'
    }
    await scheduleRetry(em, scope, ids, lease.owner, outcome.delayMs)
    logger.info('In-app delivery failed; retry scheduled', { dispatchId, attempts, delayMs: outcome.delayMs })
    return 'retry'
  }
  await finalize(em, scope, dispatchId, ids, lease.owner, { status: 'sent' })
  return 'sent'
}

/** Handles one `foundation-dispatch` job; never throws for a delivery problem (the row records it). */
export async function processDispatchJob(container: AwilixContainer, payload: unknown): Promise<DispatchJobOutcome> {
  const parsed = dispatchJobSchema.safeParse(payload)
  if (!parsed.success) {
    logger.warn('foundation:dispatch-deliver received a malformed job; skipped')
    return 'invalid'
  }
  const job: DispatchJob = parsed.data
  const scope = { tenantId: job.tenantId, organizationId: job.organizationId }
  return 'deliveryId' in job
    ? deliverEmail(container, scope, job.deliveryId)
    : deliverInApp(container, scope, job.dispatchId)
}

export type SweepResult = { republished: number; failed: number }

/**
 * The sweeper's run for one organization (DD-M03): fails the deliveries out of attempts and republishes the rest of
 * the due work — one job per e-mail delivery and one per dispatch with in-app rows; the lease makes a duplicate job a
 * no-op.
 */
export async function sweepDispatches(
  container: AwilixContainer,
  scope: DispatchScope,
  limit = 1000,
): Promise<SweepResult> {
  const em = container.resolve<EntityManager>('em').fork()
  const due = await dueDeliveries(em, scope, limit)
  const exhausted = due.filter((row) => row.attempts >= MAX_DELIVERY_ATTEMPTS).map((row) => row.id)
  const failed = await failExhausted(em, scope, { deliveryIds: exhausted })
  const queue = getDispatchQueue()
  const pending = due.filter((row) => row.attempts < MAX_DELIVERY_ATTEMPTS)
  const inAppDispatches = new Set(pending.filter((row) => row.channel === 'in_app').map((row) => row.dispatchId))
  for (const dispatchId of inAppDispatches) await queue.enqueue({ dispatchId, ...scope })
  const emailIds = pending.filter((row) => row.channel === 'email').map((row) => row.id)
  for (const deliveryId of emailIds) await queue.enqueue({ deliveryId, ...scope })
  const result = { republished: inAppDispatches.size + emailIds.length, failed }
  logger.info('Dispatch sweep finished', { organizationId: scope.organizationId, ...result })
  return result
}
