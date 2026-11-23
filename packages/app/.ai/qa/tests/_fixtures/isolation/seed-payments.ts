// payments records of the cross-club isolation guard (#628): two monthly fees of Żaki and a custom discount rule, the
// current period's generation (two charges each for the adult member and the child), a transfer and the
// administrator's cash on the member's first charge, the coach's cash on the child's first charge (held until a
// handover), the guardian's online payment of the child's second charge through the test gateway, and a bank statement
// whose payer-code transfer books the member's second charge, one unmatched transfer and one skipped transfer, and a
// charge entered by hand for a child without a guardian (no payer yet).
import { expect } from '@playwright/test'
import { birthDateTurning, calendarDate, createPerson } from '../club'
import {
  chargeOf,
  checkout,
  gatewayWebhook,
  importStatement,
  periodFromNow,
  refreshCheckout,
  type BankTransferItem,
  type ChargeDetail,
  type ChargeItem,
} from '../payments'
import type { ModuleSeed } from './seed'

type Custody = { items?: { collectorPersonId: string; payments: { paymentId: string; chargeId: string }[] }[] }

export const seedPayments: ModuleSeed = async ({ request, seeded, api }) => {
  const { refs, tokens } = seeded
  const since = calendarDate(-120)
  const fee = await api<{ id?: string }>('POST', '/api/payments/fees', {
    data: { name: 'Żaki', groupId: refs.group, period: 'monthly', amount: 15000, dueDay: 28, validFrom: since },
    status: 201,
  })
  refs.fee = String(fee.body?.id)
  const fee2 = await api<{ id?: string }>('POST', '/api/payments/fees', {
    data: { name: 'Żaki wyjazd', groupId: refs.group, period: 'monthly', amount: 15000, dueDay: 10, validFrom: since },
    status: 201,
  })
  refs.fee2 = String(fee2.body?.id)

  const generated = await api<{ generationId?: string; created?: number }>('POST', '/api/payments/charges/generate', {
    data: { period: periodFromNow(0) },
    status: 200,
  })
  refs.generation = String(generated.body?.generationId)
  const listed = await api<{ items?: ChargeItem[] }>(
    'GET',
    `/api/payments/charges?pageSize=100&generationId=${refs.generation}`,
  )
  const charges = listed.body?.items ?? []
  refs.charge = chargeOf(charges, refs.memberPerson, refs.fee).id
  refs.bankCharge = chargeOf(charges, refs.memberPerson, refs.fee2).id
  refs.childCharge = chargeOf(charges, refs.childPerson, refs.fee).id
  refs.onlineCharge = chargeOf(charges, refs.childPerson, refs.fee2).id

  const discount = await api<{ id?: string }>('POST', '/api/payments/discount-rules', {
    data: {
      name: 'Indywidualna',
      kind: 'custom',
      percent: 10,
      conditions: { personIds: [refs.memberPerson] },
      validFrom: refs.nextWeek,
    },
    status: 201,
  })
  refs.discountRule = String(discount.body?.id)

  const detail = async (id: string) =>
    (await api<ChargeDetail>('GET', `/api/payments/charges/${id}`)).body as ChargeDetail
  const lock = (updatedAt: string) => ({ 'x-om-ext-optimistic-lock-expected-updated-at': updatedAt })

  // The member's first charge: a transfer recorded by the administrator, then cash the administrator accepts.
  const recorded = await api<{ paymentId?: string }>('POST', `/api/payments/charges/${refs.charge}/payments`, {
    data: { amount: 5000, method: 'transfer', paidOn: refs.today, reference: 'Przelew 628' },
    headers: lock((await detail(refs.charge)).updatedAt),
    status: 201,
  })
  refs.payment = String(recorded.body?.paymentId)
  const cash = await api<{ payments?: { paymentId: string }[] }>('POST', '/api/payments/cash', {
    data: {
      payerPersonId: refs.memberPerson,
      chargeIds: [refs.charge],
      amount: 1000,
      paidOn: refs.today,
      notify: false,
    },
    status: 201,
  })
  refs.adminCashPayment = String(cash.body?.payments?.[0]?.paymentId)

  // The coach takes cash for the child's first charge: it stays with the coach until a handover.
  await api('POST', '/api/payments/group-charges/cash', {
    token: tokens.coach,
    data: {
      groupId: refs.group,
      participantPersonId: refs.childPerson,
      chargeIds: [refs.childCharge],
      amount: 5000,
      paidOn: refs.today,
      notify: false,
    },
    status: 201,
  })
  const custody = await api<Custody>('GET', '/api/payments/cash-custody')
  const held = custody.body?.items?.find((item) => item.collectorPersonId === refs.coachPerson)
  refs.cashPayment = String(held?.payments.find((payment) => payment.chargeId === refs.childCharge)?.paymentId)
  expect(held, `club ${seeded.label}: the coach holds the cash`).toBeTruthy()

  // The guardian pays the child's second charge online; the refresh books the captured payment.
  const started = await checkout(request, tokens.guardian, [refs.onlineCharge])
  seeded.responses.push(started.body)
  refs.checkout = started.checkoutId
  await gatewayWebhook(request, {
    sessionId: started.sessionId,
    status: 'captured',
    amountReceived: (started.body?.total ?? 15000) / 100,
    notify: false,
  })
  const refreshed = await refreshCheckout(request, tokens.guardian, refs.checkout)
  seeded.responses.push(refreshed.body)
  expect(refreshed.body?.status, `club ${seeded.label}: ${JSON.stringify(refreshed.body)}`).toBe('completed')
  const online = (await detail(refs.onlineCharge)).payments.find((payment) => payment.method === 'online')
  expect(online, `club ${seeded.label}: the online payment is booked`).toBeTruthy()
  refs.onlinePayment = String(online?.id)

  // A statement: the member's payer code books the second charge; a donation stays unmatched; a third is skipped.
  const payers = await api<{ items?: { payerPersonId: string; payerCode: string }[] }>(
    'GET',
    '/api/payments/bank-payers',
  )
  const code = payers.body?.items?.find((item) => item.payerPersonId === refs.memberPerson)?.payerCode
  expect(code, `club ${seeded.label}: the member has a payer code`).toBeTruthy()
  const statement = [
    'Data;Kwota;Nadawca;Tytuł',
    `${refs.today};150,00;Iga Dorosła;${String(code)} wyjazd`,
    `${refs.today};500,00;Firma XYZ;Darowizna na klub`,
    `${refs.today};75,00;Ktoś;Wpłata bez kodu`,
  ].join('\n')
  const imported = await importStatement(request, tokens.admin, statement, {}, 'statement-628.csv')
  seeded.responses.push(imported.body)
  expect(imported.status, `club ${seeded.label}: ${JSON.stringify(imported.body)}`).toBe(201)
  refs.bankImport = String(imported.body?.importId)
  const transfers = await api<{ items?: BankTransferItem[] }>(
    'GET',
    `/api/payments/bank-transactions?pageSize=100&importId=${refs.bankImport}`,
  )
  const byTitle = (fragment: string) => {
    const found = transfers.body?.items?.find((item) => item.title.includes(fragment))
    expect(found, `club ${seeded.label}: the transfer "${fragment}"`).toBeTruthy()
    return found as BankTransferItem
  }
  const booked = byTitle('wyjazd')
  expect(booked.status, `club ${seeded.label}: the payer-code transfer is booked`).toBe('booked')
  refs.bankBooked = booked.id
  const unmatched = byTitle('Darowizna')
  refs.bankUnmatched = unmatched.id
  refs.bankUnmatchedUpdatedAt = unmatched.updatedAt
  const skipped = byTitle('bez kodu')
  await api('POST', `/api/payments/bank-transactions/${skipped.id}/ignore`, {
    data: { reason: 'other' },
    headers: lock(skipped.updatedAt),
  })
  refs.bankIgnored = skipped.id

  // The lock tokens the probes that name a club B record in a club A record's request send.
  refs.chargeUpdatedAt = (await detail(refs.charge)).updatedAt
  const fees = await api<{ items?: { id: string; updatedAt?: string; updated_at?: string }[] }>(
    'GET',
    '/api/payments/fees?pageSize=100',
  )
  const ownFee = fees.body?.items?.find((item) => item.id === refs.fee)
  refs.feeUpdatedAt = String(ownFee?.updatedAt ?? ownFee?.updated_at)
  expect(ownFee, `club ${seeded.label}: the fee is listed`).toBeTruthy()
  const rules = await api<{ items?: { id: string; updatedAt?: string; updated_at?: string }[] }>(
    'GET',
    '/api/payments/discount-rules?pageSize=100',
  )
  const ownRule = rules.body?.items?.find((item) => item.id === refs.discountRule)
  expect(ownRule, `club ${seeded.label}: the discount rule is listed`).toBeTruthy()
  refs.discountRuleUpdatedAt = String(ownRule?.updatedAt ?? ownRule?.updated_at)

  // A charge entered by hand for a child without a guardian has no payer: the payer assignment's target.
  refs.orphanPerson = await createPerson(request, tokens.admin, {
    firstName: 'Ala',
    lastName: 'Bezopieki',
    birthDate: birthDateTurning(10),
  })
  const manual = await api<{ chargeId?: string; payerMissing?: boolean }>('POST', '/api/payments/charges', {
    data: { personId: refs.orphanPerson, description: 'Opłata ręczna', amount: 2000, dueDate: refs.nextWeek },
    status: 201,
  })
  expect(manual.body?.payerMissing, `club ${seeded.label}: the manual charge has no payer`).toBe(true)
  refs.payerlessCharge = String(manual.body?.chargeId)
  refs.payerlessChargeUpdatedAt = (await detail(refs.payerlessCharge)).updatedAt
}
