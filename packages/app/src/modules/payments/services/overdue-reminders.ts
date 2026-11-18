// The daily overdue reminders (payments parity spec DD-C09, *Domain Vocabulary* → Overdue reminder; REQ-C13; #301):
// the job command `payments.charges.remind_overdue` runs this for one club. Each payer with a charge due a reminder
// gets one dispatch of `payments.charge_reminder` — an e-mail listing every overdue charge of theirs with the payer
// code, and the in-app notice `payments.charge_overdue` when they have an account. The marker (`reminder_count`,
// `last_reminded_at`) is written in the transaction that enqueues the dispatch, by a conditional UPDATE on the count
// read, so a concurrent run reminds nobody twice and a failed delivery is the dispatch's retry, never a second
// reminder. Rental charges and charges without a payer are never reminded.
import { createHash } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { calendarDateInZone, type Recipient } from '@vereino/core'
import { contactResolver, type DispatchService } from '@/modules/foundation'
import { Charge } from '../data/entities'
import type { ChargeReminderParams } from '../emails/templates'
import { OPEN_CHARGE_STATUSES, amountDueOf, remainingOf } from '../lib/charge-ledger'
import { MAX_REMINDERS, reminderBatches, type ReminderCandidate } from '../lib/payments-rules'
import { clubClock, findPersons, type PaymentsScope } from './directory'
import { paidTotals } from './ledger'
import { ensurePayerCode } from './payer-overview'
import { storedPaymentsSettings } from './read'

const logger = createLogger('payments').child({ component: 'overdue-reminders' })

/** The template's limit of listed charges; the total still covers them all. */
const MAX_LISTED_CHARGES = 50

export type OverdueReminderCounts = {
  /** Payers with a charge due a reminder today. */
  payers: number
  /** Payers reminded (one dispatch each). */
  reminded: number
  /** Charges listed in the sent reminders (their marker moved on). */
  charges: number
  /** Payers without an e-mail address or an account: nothing sent, nothing marked. */
  unreachable: number
  /** Payers whose reminder failed or met a concurrent run; the next run looks again. */
  failed: number
}

export type OverdueRemindersRun = { switchedOff: boolean; today: string; counts: OverdueReminderCounts }

class ConcurrentReminder extends Error {}

function freshEm(container: AwilixContainer): EntityManager {
  return container.resolve<EntityManager>('em').fork()
}

function calendarDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

/** One dispatch per payer, day and listed charges with their counts: a retried run re-uses the first dispatch. */
function reminderKey(payerPersonId: string, today: string, charges: readonly ReminderCandidate[]): string {
  const digest = createHash('sha256')
    .update(charges.map((charge) => `${charge.id}:${String(charge.reminderCount)}`).join(','))
    .digest('hex')
    .slice(0, 24)
  return `payments:overdue-reminder:${payerPersonId}:${today}:${digest}`
}

/** The overdue charges of the club the reminder rule looks at, with what remains of each. */
async function reminderCandidates(
  container: AwilixContainer,
  scope: PaymentsScope,
  today: string,
  timeZone: string,
): Promise<{ candidates: ReminderCandidate[]; rows: Map<string, Charge> }> {
  const rows = await freshEm(container).find(
    Charge,
    {
      ...scope,
      deletedAt: null,
      status: { $in: [...OPEN_CHARGE_STATUSES] },
      sourceType: { $ne: 'rental' as const },
      payerPersonId: { $ne: null },
      dueDate: { $lt: today },
      reminderCount: { $lt: MAX_REMINDERS },
    },
    { orderBy: { id: 'asc' } },
  )
  const paid = await paidTotals(
    container,
    scope,
    rows.map((row) => row.id),
  )
  const candidates = rows.map<ReminderCandidate>((row) => ({
    id: row.id,
    sourceType: row.sourceType,
    status: row.status,
    payerPersonId: row.payerPersonId ?? null,
    dueDate: calendarDate(row.dueDate),
    remaining: remainingOf(amountDueOf(row), paid.get(row.id) ?? 0),
    reminderCount: row.reminderCount,
    lastRemindedOn: row.lastRemindedAt ? calendarDateInZone(row.lastRemindedAt, timeZone) : null,
  }))
  return { candidates, rows: new Map(rows.map((row) => [row.id, row])) }
}

/**
 * Sends today's overdue reminders of one club as of `now` (the club's calendar). Off when the club turned
 * `overdue_reminders` off. A failing payer is counted and left to the next run; the others still go out.
 */
export async function sendOverdueReminders(
  container: AwilixContainer,
  scope: PaymentsScope,
  now: Date,
): Promise<OverdueRemindersRun> {
  const counts: OverdueReminderCounts = { payers: 0, reminded: 0, charges: 0, unreachable: 0, failed: 0 }
  const { today, timeZone } = await clubClock(container, scope, now)
  const settings = await storedPaymentsSettings(container, scope)
  if (settings && !settings.overdueReminders) return { switchedOff: true, today, counts }

  const { candidates, rows } = await reminderCandidates(container, scope, today, timeZone)
  const batches = reminderBatches(candidates, today)
  counts.payers = batches.size
  if (batches.size === 0) return { switchedOff: false, today, counts }

  const debtorIds = [...new Set([...batches.values()].flat().flatMap((charge) => rows.get(charge.id)?.personId ?? []))]
  const persons = await findPersons(container, scope, debtorIds)
  const resolverCtx = { container, ...scope, scope: [{ kind: 'system_job' as const }] }
  const contacts = new Map(
    (await contactResolver(container).contacts([...batches.keys()], resolverCtx)).map((row) => [row.personId, row]),
  )
  const dispatch = container.resolve<DispatchService>('foundationDispatch')

  for (const [payerPersonId, listed] of batches) {
    try {
      const contact = contacts.get(payerPersonId)
      const channels: Recipient['channels'][number][] = [
        ...(contact?.email ? (['email'] as const) : []),
        ...(contact?.userId ? (['in_app'] as const) : []),
      ]
      if (!contact || channels.length === 0) {
        counts.unreachable += 1
        continue
      }
      const recipient: Recipient = {
        personId: contact.personId,
        userId: contact.userId,
        email: contact.email,
        locale: contact.locale,
        reasons: ['direct'],
        channels,
      }
      const names = [
        ...new Set(
          listed.flatMap((charge) => {
            const person = persons.get(rows.get(charge.id)?.personId ?? '')
            return person ? [`${person.firstName} ${person.lastName}`] : []
          }),
        ),
      ]
      const params: ChargeReminderParams = {
        childName: names.join(', '),
        lines: listed.slice(0, MAX_LISTED_CHARGES).map((charge) => ({
          description: rows.get(charge.id)?.description ?? '',
          remaining: charge.remaining,
          dueDate: charge.dueDate,
        })),
        total: listed.reduce((sum, charge) => sum + charge.remaining, 0),
        payerCode: await ensurePayerCode(container, scope, payerPersonId),
      }
      const enqueued = await freshEm(container).transactional(async (tx) => {
        for (const charge of listed) {
          // The marker moves only from the count this run read: a concurrent run that got there first rolls us back.
          const updated = await tx.nativeUpdate(
            Charge,
            { id: charge.id, ...scope, reminderCount: charge.reminderCount },
            { reminderCount: charge.reminderCount + 1, lastRemindedAt: now },
          )
          if (updated !== 1) throw new ConcurrentReminder()
        }
        return dispatch.enqueue(
          tx,
          {
            template: 'payments.charge_reminder',
            params,
            recipients: [recipient],
            source: { module: 'payments', type: 'payments:charge', id: listed[0].id },
            idempotencyKey: reminderKey(payerPersonId, today, listed),
            actor: { userId: null, actingRole: 'system' },
          },
          { ...resolverCtx, em: tx },
        )
      })
      await dispatch.publish(enqueued.dispatchId, scope)
      counts.reminded += 1
      counts.charges += listed.length
    } catch (error: unknown) {
      counts.failed += 1
      if (!(error instanceof ConcurrentReminder)) {
        logger.warn('Overdue reminder failed for one payer; the next run retries it', { ...scope, err: error })
      }
    }
  }
  return { switchedOff: false, today, counts }
}
