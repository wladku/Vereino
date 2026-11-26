// The e-mail templates of `payments` (foundation III P-31; payments spec REQ-031, API row `payments.cash.record` →
// "confirmation email to each payer"; issue #114): the confirmation of cash accepted with its receipt number, the
// amount, the day and the charges it paid. `optOut: 'never'` (a confirmation of the payer's own money). The params are
// encrypted at rest in the dispatch outbox (foundation `encryption.ts`), so the charge descriptions may travel in them.
// On the dispatch worker's import graph, so it imports no `.tsx` and nothing of `@vereino/ui` (lesson
// `worker-runtime-imports-and-notification-strategies`).
import * as React from 'react'
import { z } from 'zod'
import type { TranslateWithFallbackFn } from '@open-mercato/shared/lib/i18n/translate'
import { clubText, defineEmailTemplate } from '@/modules/foundation'
import { formatZloty } from '../lib/charge-ledger'
import { orderLinkPath } from '../lib/orders'

const h = React.createElement

const cashReceivedParams = z
  .object({
    receiptNumber: z.string().min(1).max(40),
    amount: z.number().int(),
    paidOn: z.string().min(10).max(10),
    collectorName: z.string().max(200).nullable(),
    lines: z
      .array(z.object({ description: z.string().max(500), amount: z.number().int(), remaining: z.number().int() }))
      .max(50),
  })
  .strict()

export type CashReceivedParams = z.output<typeof cashReceivedParams>

function lineText(t: TranslateWithFallbackFn, line: CashReceivedParams['lines'][number]): string {
  return line.remaining > 0
    ? t('payments.email.cashReceived.linePartial', '{description}: {amount} (still to pay {remaining})', {
        description: line.description,
        amount: formatZloty(line.amount),
        remaining: formatZloty(line.remaining),
      })
    : t('payments.email.cashReceived.linePaid', '{description}: {amount} (paid)', {
        description: line.description,
        amount: formatZloty(line.amount),
      })
}

function copy(t: TranslateWithFallbackFn, params: CashReceivedParams) {
  const values = { amount: formatZloty(params.amount), receipt: params.receiptNumber, date: params.paidOn }
  return {
    subject: t('payments.email.cashReceived.subject', 'Cash received: {amount} — receipt {receipt}', values),
    lead: t(
      'payments.email.cashReceived.lead',
      'We received {amount} in cash on {date}. Receipt number: {receipt}.',
      values,
    ),
    collector: params.collectorName
      ? t('payments.email.cashReceived.collector', 'Received by: {name}', { name: params.collectorName })
      : null,
    paysFor: t('payments.email.cashReceived.paysFor', 'The payment covers:'),
    lines: params.lines.map((line) => lineText(t, line)),
  }
}

/** `payments.cash_received`: the payer's confirmation of cash with its KP number (REQ-031). */
export const cashReceivedTemplate = defineEmailTemplate<CashReceivedParams>({
  id: 'payments.cash_received',
  notificationType: 'payments.cash_received',
  optOut: 'never',
  params: cashReceivedParams,
  subject: (t, params) => copy(t, params).subject,
  preheader: (t, params) => copy(t, params).lead,
  body: (t, params) => {
    const text = copy(t, params)
    return h(
      'div',
      null,
      h('p', { style: { margin: '0 0 12px', fontWeight: 600 } }, text.lead),
      text.collector ? h('p', { style: { margin: '0 0 12px' } }, text.collector) : null,
      h('p', { style: { margin: '0 0 4px' } }, text.paysFor),
      h(
        'ul',
        { style: { margin: '0', paddingLeft: '20px' } },
        ...text.lines.map((line, index) => h('li', { key: String(index) }, line)),
      ),
    )
  },
  text: (t, params) => {
    const text = copy(t, params)
    return [text.lead, text.collector, '', text.paysFor, ...text.lines.map((line) => `- ${line}`)]
      .filter((line): line is string => line !== null)
      .join('\n')
  },
  link: () => '/club',
})

const orderReminderParams = z
  .object({
    campaignId: z.uuid(),
    campaignName: z.string().min(1).max(200),
    closesOn: z.string().min(10).max(10),
  })
  .strict()

export type OrderReminderParams = z.output<typeof orderReminderParams>

function reminderCopy(t: TranslateWithFallbackFn, params: OrderReminderParams) {
  const values = { name: params.campaignName, date: params.closesOn }
  return {
    subject: t('payments.email.orderReminder.subject', 'Reminder: order "{name}" by {date}', values),
    lead: t(
      'payments.email.orderReminder.lead',
      'Your child has no order in "{name}" yet. Orders close on {date}.',
      values,
    ),
    action: t('payments.email.orderReminder.action', 'Open the order form in the club app.'),
  }
}

/**
 * `payments.order_reminder` ("Remind everyone", B-32; REQ-032, #115): a guardian of a child without an order in an
 * open campaign is reminded of its name and deadline. `optOut: 'never'`: a club's own service message about the
 * guardian's child, sent only on the administrator's request.
 */
export const orderReminderTemplate = defineEmailTemplate<OrderReminderParams>({
  id: 'payments.order_reminder',
  notificationType: 'payments.order_reminder',
  optOut: 'never',
  params: orderReminderParams,
  subject: (t, params) => reminderCopy(t, params).subject,
  preheader: (t, params) => reminderCopy(t, params).lead,
  body: (t, params) => {
    const text = reminderCopy(t, params)
    return h(
      'div',
      null,
      h('p', { style: { margin: '0 0 12px', fontWeight: 600 } }, text.lead),
      h('p', { style: { margin: '0' } }, text.action),
    )
  },
  text: (t, params) => {
    const text = reminderCopy(t, params)
    return [text.lead, '', text.action].join('\n')
  },
  link: (params) => `/club/orders/${params.campaignId}`,
})
const orderCopyParams = z
  .object({
    campaignId: z.uuid(),
    campaignName: z.string().min(1).max(200),
    childName: z.string().max(200),
    lines: z.array(z.object({ text: z.string().max(500), amount: z.number().int() })).max(50),
    total: z.number().int(),
    printName: z.string().max(40).nullable(),
    printNumber: z.number().int().nullable(),
    closesOn: z.string().min(10).max(10),
    paymentDueOn: z.string().min(10).max(10),
    payerCode: z.string().max(20).nullable(),
    changed: z.boolean(),
  })
  .strict()

export type OrderCopyParams = z.output<typeof orderCopyParams>

function orderCopy(t: TranslateWithFallbackFn, params: OrderCopyParams) {
  const values = {
    name: params.campaignName,
    child: params.childName,
    total: formatZloty(params.total),
    closes: params.closesOn,
    due: params.paymentDueOn,
    code: params.payerCode ?? '',
  }
  const print = [params.printName, params.printNumber === null ? null : String(params.printNumber)]
    .filter((part): part is string => !!part)
    .join(' ')
  return {
    subject: params.changed
      ? t('payments.email.orderCopy.subjectChanged', 'Order changed: {name} — {child}', values)
      : t('payments.email.orderCopy.subject', 'Your order: {name} — {child}', values),
    lead: t('payments.email.orderCopy.lead', 'Order for {child} in "{name}". Total: {total}.', values),
    lines: params.lines.map((line) => `${line.text}: ${formatZloty(line.amount)}`),
    print: print ? t('payments.email.orderCopy.print', 'Print: {print}', { print }) : null,
    pay: params.payerCode
      ? t(
          'payments.email.orderCopy.payWithCode',
          'Pay by {due}: online in the app, by transfer with the code {code} in the title, or in cash to the coach.',
          values,
        )
      : t(
          'payments.email.orderCopy.pay',
          'Pay by {due}: online in the app, by transfer or in cash to the coach.',
          values,
        ),
    change: t('payments.email.orderCopy.change', 'You can change or cancel the order until {closes}.', values),
  }
}

/**
 * `payments.order_copy` (M-17; REQ-032, #116): the copy of a placed or changed kit order — the lines with their
 * prices, the print, the total and how to pay. `optOut: 'never'`: the guardian's own order, sent to the address they
 * entered on it.
 */
export const orderCopyTemplate = defineEmailTemplate<OrderCopyParams>({
  id: 'payments.order_copy',
  notificationType: 'payments.order_copy',
  optOut: 'never',
  params: orderCopyParams,
  subject: (t, params) => orderCopy(t, params).subject,
  preheader: (t, params) => orderCopy(t, params).lead,
  body: (t, params) => {
    const text = orderCopy(t, params)
    return h(
      'div',
      null,
      h('p', { style: { margin: '0 0 12px', fontWeight: 600 } }, text.lead),
      h(
        'ul',
        { style: { margin: '0 0 12px', paddingLeft: '20px' } },
        ...text.lines.map((line, index) => h('li', { key: String(index) }, line)),
      ),
      text.print ? h('p', { style: { margin: '0 0 12px' } }, text.print) : null,
      h('p', { style: { margin: '0 0 12px' } }, text.pay),
      h('p', { style: { margin: '0' } }, text.change),
    )
  },
  text: (t, params) => {
    const text = orderCopy(t, params)
    return [text.lead, '', ...text.lines.map((line) => `- ${line}`), '', text.print, text.pay, text.change]
      .filter((line): line is string => line !== null)
      .join('\n')
  },
  link: (params) => `/club/orders/${params.campaignId}`,
})

const orderLinkParams = z
  .object({
    campaignName: z.string().min(1).max(200),
    closesOn: z.string().min(10).max(10),
  })
  .strict()

export type OrderLinkParams = z.output<typeof orderLinkParams>

function orderLinkCopy(t: TranslateWithFallbackFn, params: OrderLinkParams) {
  const values = { name: params.campaignName, date: params.closesOn }
  return {
    subject: t('payments.email.orderLink.subject', 'Your order link: {name}', values),
    lead: t(
      'payments.email.orderLink.lead',
      'Here is your personal link to order "{name}" for your child. It works until {date}, without signing in.',
      values,
    ),
    hint: t('payments.email.orderLink.hint', 'Do not forward this e-mail: the link lets anyone order for your child.'),
  }
}

/**
 * `payments.order_link` (M-19; REQ-032, #116): a personal link to `/club/o/<token>`, sent on request to a guardian of
 * a child in the campaign's groups. The raw token reaches the template only through the delivery's secret.
 */
export const orderLinkTemplate = defineEmailTemplate<OrderLinkParams>({
  id: 'payments.order_link',
  notificationType: 'payments.order_link',
  optOut: 'never',
  params: orderLinkParams,
  subject: (t, params) => orderLinkCopy(t, params).subject,
  preheader: (t, params) => orderLinkCopy(t, params).lead,
  body: (t, params) => {
    const text = orderLinkCopy(t, params)
    return h(
      'div',
      null,
      h('p', { style: { margin: '0 0 12px', fontWeight: 600 } }, text.lead),
      h('p', { style: { margin: '0' } }, text.hint),
    )
  },
  text: (t, params) => {
    const text = orderLinkCopy(t, params)
    return `${text.lead}\n\n${text.hint}`
  },
  link: (_params, ctx) => (typeof ctx.secrets.token === 'string' ? orderLinkPath(ctx.secrets.token) : null),
  actionLabel: (t) => t('payments.email.orderLink.action', 'Open the order form'),
})

const chargeReminderParams = z
  .object({
    childName: z.string().max(200),
    lines: z
      .array(
        z.object({
          description: z.string().max(500),
          remaining: z.number().int(),
          dueDate: z.string().min(10).max(10),
        }),
      )
      .min(1)
      .max(50),
    total: z.number().int(),
    /** The payer's code `GW-XXXX` for the transfer title; the automatic reminder sends it (#301). */
    payerCode: z.string().min(1).max(20).nullable().optional(),
  })
  .strict()

export type ChargeReminderParams = z.output<typeof chargeReminderParams>

function chargeReminderCopy(t: TranslateWithFallbackFn, params: ChargeReminderParams) {
  const values = { name: params.childName, total: formatZloty(params.total) }
  return {
    subject: t('payments.email.chargeReminder.subject', 'Reminder: {total} overdue for {name}', values),
    lead: t(
      'payments.email.chargeReminder.lead',
      'These payments for {name} are past their due date ({total} in total):',
      values,
    ),
    lines: params.lines.map((line) =>
      t('payments.email.chargeReminder.line', '{description}: {amount}, due {date}', {
        description: line.description,
        amount: formatZloty(line.remaining),
        date: line.dueDate,
      }),
    ),
    action: t(
      'payments.email.chargeReminder.action',
      'Pay online in the club app, by transfer with your payer code, or in cash to the coach.',
    ),
    payerCode: params.payerCode
      ? t('payments.email.chargeReminder.payerCode', 'Your payer code for the transfer title: {code}', {
          code: params.payerCode,
        })
      : null,
  }
}

/**
 * `payments.charge_reminder` ("Send reminder" of M-18; REQ-033, #117): the payer of a child's overdue charges of the
 * coach's group gets their list and total. Since #301 (payments parity spec DD-C09) the daily overdue reminder sends
 * it too, for all the payer's overdue charges with the payer code, by e-mail and as the in-app notice
 * `payments.charge_overdue` (the coach's reminder stays e-mail only). `optOut: 'never'`: a club's own service message
 * about the payer's money. The descriptions travel in the encrypted params.
 */
export const chargeReminderTemplate = defineEmailTemplate<ChargeReminderParams>({
  id: 'payments.charge_reminder',
  notificationType: 'payments.charge_overdue',
  optOut: 'never',
  params: chargeReminderParams,
  subject: (t, params) => chargeReminderCopy(t, params).subject,
  preheader: (t, params) => chargeReminderCopy(t, params).lead,
  body: (t, params) => {
    const text = chargeReminderCopy(t, params)
    return h(
      'div',
      null,
      h('p', { style: { margin: '0 0 12px', fontWeight: 600 } }, text.lead),
      h(
        'ul',
        { style: { margin: '0 0 12px', paddingLeft: '20px' } },
        ...text.lines.map((line, index) => h('li', { key: String(index) }, line)),
      ),
      h('p', { style: { margin: '0' } }, text.action),
      text.payerCode ? h('p', { style: { margin: '12px 0 0', fontWeight: 600 } }, text.payerCode) : null,
    )
  },
  text: (t, params) => {
    const text = chargeReminderCopy(t, params)
    return [text.lead, ...text.lines.map((line) => `- ${line}`), '', text.action, text.payerCode]
      .filter((line): line is string => line !== null)
      .join('\n')
  },
  link: () => '/club/payments',
})

// --- The two-sided cash handover (D-042, REQ-033a, #791) ---

const handoverParams = z
  .object({
    handoverId: z.uuid(),
    number: z.string().min(1).max(40),
    amount: z.number().int(),
    paymentCount: z.number().int().min(1),
    collectorName: z.string().max(200).nullable(),
  })
  .strict()

export type CashHandoverParams = z.output<typeof handoverParams>

const handoverDecisionParams = handoverParams
  .extend({ reason: z.string().max(500).nullable(), deciderName: z.string().max(200).nullable() })
  .strict()

export type CashHandoverDecisionParams = z.output<typeof handoverDecisionParams>

/** The handover template ids: sent (to the confirmers), and the three outcomes the collector is told. */
export const CASH_HANDOVER_SENT_TEMPLATE = 'payments.cash_handover_sent'
export const CASH_HANDOVER_CONFIRMED_TEMPLATE = 'payments.cash_handover_confirmed'
export const CASH_HANDOVER_REJECTED_TEMPLATE = 'payments.cash_handover_rejected'
export const CASH_HANDOVER_SETTLED_TEMPLATE = 'payments.cash_handover_settled'

function handoverValues(params: CashHandoverParams) {
  return {
    number: params.number,
    amount: formatZloty(params.amount),
    count: params.paymentCount,
    name: params.collectorName ?? '',
  }
}

function sentCopy(t: TranslateWithFallbackFn, params: CashHandoverParams) {
  const values = handoverValues(params)
  return {
    subject: t('payments.email.cashHandoverSent.subject', 'Cash handover {number} to confirm: {amount}', values),
    lead: t(
      'payments.email.cashHandoverSent.lead',
      '{name} sent the cash handover {number}: {amount} in {count} payments. Count the cash and confirm or reject it.',
      values,
    ),
  }
}

/**
 * `payments.cash_handover_sent`: the club administrators and the treasurers are told a collector sent a handover that
 * waits for them; in the app too (`payments.cash_handover_sent`). `optOut: 'never'`: the club's own money.
 */
export const cashHandoverSentTemplate = defineEmailTemplate<CashHandoverParams>({
  id: CASH_HANDOVER_SENT_TEMPLATE,
  notificationType: CASH_HANDOVER_SENT_TEMPLATE,
  optOut: 'never',
  params: handoverParams,
  subject: (t, params) => sentCopy(t, params).subject,
  preheader: (t, params) => sentCopy(t, params).lead,
  body: (t, params) => h('div', null, h('p', { style: { margin: '0', fontWeight: 600 } }, sentCopy(t, params).lead)),
  text: (t, params) => sentCopy(t, params).lead,
  actionLabel: (t) => t('payments.email.cashHandoverSent.action', 'Open the handovers to confirm'),
  link: () => '/club/cash-handovers',
})

type DecisionOutcome = 'confirmed' | 'rejected' | 'settled'

function decisionCopy(t: TranslateWithFallbackFn, outcome: DecisionOutcome, params: CashHandoverDecisionParams) {
  const values = { ...handoverValues(params), decider: params.deciderName ?? '' }
  if (outcome === 'confirmed') {
    return {
      subject: t('payments.email.cashHandoverConfirmed.subject', 'Cash handover {number} confirmed', values),
      lead: t(
        'payments.email.cashHandoverConfirmed.lead',
        "{decider} confirmed receiving {amount} in cash (handover {number}, {count} payments). The cash is now the club's.",
        values,
      ),
      reason: null,
    }
  }
  if (outcome === 'rejected') {
    return {
      subject: t('payments.email.cashHandoverRejected.subject', 'Cash handover {number} rejected', values),
      lead: t(
        'payments.email.cashHandoverRejected.lead',
        '{decider} rejected the cash handover {number} ({amount}). The payments are with you again; correct the handover and send it again.',
        values,
      ),
      reason: params.reason
        ? t('payments.email.cashHandoverRejected.reason', 'Reason: {reason}', { reason: params.reason })
        : null,
    }
  }
  return {
    subject: t('payments.email.cashHandoverSettled.subject', 'Your cash was settled: {amount}', values),
    lead: t(
      'payments.email.cashHandoverSettled.lead',
      '{decider} recorded receiving {amount} in cash from you (handover {number}, {count} payments).',
      values,
    ),
    reason: null,
  }
}

function decisionTemplate(id: string, outcome: DecisionOutcome) {
  return defineEmailTemplate<CashHandoverDecisionParams>({
    id,
    notificationType: id,
    optOut: 'never',
    params: handoverDecisionParams,
    subject: (t, params) => decisionCopy(t, outcome, params).subject,
    preheader: (t, params) => decisionCopy(t, outcome, params).lead,
    body: (t, params) => {
      const copy = decisionCopy(t, outcome, params)
      // The reason is typed by the confirmer: escaped paragraphs (R09).
      return h(
        'div',
        null,
        h('p', { style: { margin: '0 0 12px', fontWeight: 600 } }, copy.lead),
        copy.reason ? clubText(copy.reason) : null,
      )
    },
    text: (t, params) => {
      const copy = decisionCopy(t, outcome, params)
      return [copy.lead, copy.reason].filter((line): line is string => line !== null).join('\n\n')
    },
    actionLabel: (t) => t('payments.email.cashHandover.action', "Open my groups' payments"),
    link: () => '/club/coach/payments',
  })
}

/** `payments.cash_handover_confirmed`: the collector's handover was confirmed (in the app too). */
export const cashHandoverConfirmedTemplate = decisionTemplate(CASH_HANDOVER_CONFIRMED_TEMPLATE, 'confirmed')
/** `payments.cash_handover_rejected`: the collector's handover was rejected; the e-mail carries the reason. */
export const cashHandoverRejectedTemplate = decisionTemplate(CASH_HANDOVER_REJECTED_TEMPLATE, 'rejected')
/** `payments.cash_handover_settled`: the club accepted the collector's cash one-sided (the fallback of REQ-033). */
export const cashHandoverSettledTemplate = decisionTemplate(CASH_HANDOVER_SETTLED_TEMPLATE, 'settled')

export const paymentsEmailTemplates = [
  cashReceivedTemplate,
  orderReminderTemplate,
  orderCopyTemplate,
  orderLinkTemplate,
  chargeReminderTemplate,
  cashHandoverSentTemplate,
  cashHandoverConfirmedTemplate,
  cashHandoverRejectedTemplate,
  cashHandoverSettledTemplate,
]
