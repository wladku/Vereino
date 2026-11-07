// The e-mail template of `payments` (foundation III P-31; payments spec REQ-031, API row `payments.cash.record` →
// "confirmation email to each payer"; issue #114): the confirmation of cash accepted with its receipt number, the
// amount, the day and the charges it paid. `optOut: 'never'` (a confirmation of the payer's own money). The params are
// encrypted at rest in the dispatch outbox (foundation `encryption.ts`), so the charge descriptions may travel in them.
// On the dispatch worker's import graph, so it imports no `.tsx` and nothing of `@vereino/ui` (lesson
// `worker-runtime-imports-and-notification-strategies`).
import * as React from 'react'
import { z } from 'zod'
import type { TranslateWithFallbackFn } from '@open-mercato/shared/lib/i18n/translate'
import { defineEmailTemplate } from '@/modules/foundation'
import { formatZloty } from '../lib/charge-ledger'

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

export const paymentsEmailTemplates = [cashReceivedTemplate]
