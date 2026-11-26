// The notices of the two-sided cash handover (payments spec REQ-033a, DD-31a, *Events, Jobs, Notifications*; D-042,
// #791), in the app and by e-mail through the foundation `dispatch`: a sent handover is announced to the club
// administrators and treasurers of the day (`payments.cash_handover_sent`), and the collector is told when their
// handover was confirmed, rejected (with the reason, by e-mail) or settled without them (the one-sided fallback). Sent
// after the command committed, like `people`'s departure notices; the key `payments:cash-handover:{id}:{step}` is the
// "sent" marker, so a retried call sends nothing twice. A failed notice is logged and never undoes the handover.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { resolveMembers, type DispatchService } from '@/modules/foundation'
import {
  CASH_HANDOVER_CONFIRMED_TEMPLATE,
  CASH_HANDOVER_REJECTED_TEMPLATE,
  CASH_HANDOVER_SENT_TEMPLATE,
  CASH_HANDOVER_SETTLED_TEMPLATE,
  type CashHandoverDecisionParams,
  type CashHandoverParams,
} from '../emails/templates'
import { handoverConfirmerIds } from '../lib/cash-handovers'
import { clubClock, findPersons, handoverConfirmerRoles, type PaymentsScope } from './directory'

const logger = createLogger('payments').child({ component: 'cash-handover-notices' })

const FOUNDATION_DISPATCH = 'foundationDispatch'

/** What a notice says about the handover. */
export type HandoverNoticeSubject = {
  id: string
  number: string
  amount: number
  paymentCount: number
  collectorPersonId: string
}

/** The collector's outcome notices. */
export type HandoverOutcome = 'confirmed' | 'rejected' | 'settled'

const OUTCOME_TEMPLATES: Record<HandoverOutcome, string> = {
  confirmed: CASH_HANDOVER_CONFIRMED_TEMPLATE,
  rejected: CASH_HANDOVER_REJECTED_TEMPLATE,
  settled: CASH_HANDOVER_SETTLED_TEMPLATE,
}

async function nameOf(container: AwilixContainer, scope: PaymentsScope, personId: string | null) {
  if (!personId) return null
  const person = (await findPersons(container, scope, [personId])).get(personId)
  return person ? `${person.firstName} ${person.lastName}` : null
}

/** Enqueues and publishes one notice to `personIds`; the number of reachable recipients of a new dispatch. */
async function send(
  container: AwilixContainer,
  scope: PaymentsScope,
  notice: {
    template: string
    params: CashHandoverParams | CashHandoverDecisionParams
    personIds: readonly string[]
    handoverId: string
    key: string
  },
): Promise<number> {
  if (notice.personIds.length === 0) return 0
  const context = { container, ...scope, scope: [{ kind: 'system_job' as const }] }
  const audience = await resolveMembers(
    [...new Set(notice.personIds)].map((personId) => ({ personId, reason: 'direct' as const })),
    context,
  )
  const recipients = audience.recipients.filter((recipient) => recipient.channels.length > 0)
  if (recipients.length === 0) return 0
  const dispatch = container.resolve<DispatchService>(FOUNDATION_DISPATCH)
  const em = container.resolve<EntityManager>('em').fork()
  const enqueued = await em.transactional((tx) =>
    dispatch.enqueue(
      tx,
      {
        template: notice.template,
        params: notice.params,
        recipients,
        source: { module: 'payments', type: 'payments:cash_handover', id: notice.handoverId },
        idempotencyKey: notice.key,
        actor: { userId: null, actingRole: 'system' },
      },
      { ...context, em: tx },
    ),
  )
  if (!enqueued.created) return 0
  await dispatch.publish(enqueued.dispatchId, scope)
  return recipients.length
}

function baseParams(handover: HandoverNoticeSubject, collectorName: string | null): CashHandoverParams {
  return {
    handoverId: handover.id,
    number: handover.number,
    amount: handover.amount,
    paymentCount: handover.paymentCount,
    collectorName,
  }
}

/** A collector sent a handover: the club administrators and treasurers of the day are told. */
export async function notifyHandoverSent(
  container: AwilixContainer,
  scope: PaymentsScope,
  handover: HandoverNoticeSubject,
): Promise<number> {
  try {
    const { today } = await clubClock(container, scope)
    const roles = await handoverConfirmerRoles(container, scope, today)
    const personIds = handoverConfirmerIds({ ...roles, collectorPersonId: handover.collectorPersonId })
    return await send(container, scope, {
      template: CASH_HANDOVER_SENT_TEMPLATE,
      params: baseParams(handover, await nameOf(container, scope, handover.collectorPersonId)),
      personIds,
      handoverId: handover.id,
      key: `payments:cash-handover:${handover.id}:sent`,
    })
  } catch (error: unknown) {
    logger.warn('The cash handover notice to the confirmers failed', { ...scope, handoverId: handover.id, err: error })
    return 0
  }
}

/** The collector is told their handover was confirmed, rejected (with the reason) or settled without them. */
export async function notifyHandoverOutcome(
  container: AwilixContainer,
  scope: PaymentsScope,
  handover: HandoverNoticeSubject,
  outcome: HandoverOutcome,
  decision: { deciderPersonId: string | null; reason: string | null },
): Promise<number> {
  try {
    const params: CashHandoverDecisionParams = {
      ...baseParams(handover, null),
      reason: decision.reason,
      deciderName: await nameOf(container, scope, decision.deciderPersonId),
    }
    return await send(container, scope, {
      template: OUTCOME_TEMPLATES[outcome],
      params,
      personIds: [handover.collectorPersonId],
      handoverId: handover.id,
      key: `payments:cash-handover:${handover.id}:${outcome}`,
    })
  } catch (error: unknown) {
    logger.warn('The cash handover notice to the collector failed', { ...scope, handoverId: handover.id, err: error })
    return 0
  }
}
