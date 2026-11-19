import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  birthDateTurning,
  call,
  calendarDate,
  createClub,
  createPerson,
  createStaff,
  signInAs,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { createGuardianship } from '../_fixtures/people'
import {
  checkout,
  createFee,
  gatewayWebhook,
  generate,
  getCharge,
  myCharges,
  periodFromNow,
  recordPayment,
  refreshCheckout,
  refundPayment,
  type ChargeItem,
  type CodedBody,
} from '../_fixtures/payments'
import { uiText } from '../_fixtures/ui-text'

// TEST-C09 (payments parity spec phase 6, REQ-C08, AC-C08, DD-C10; J-C05 step 4; issue #296 E12-S06) with the gateway
// test adapter `vereino_test`. Kasia pays Ola's two fees online:
// - fee A is captured late, after a failed attempt (TEST-057 a): its gateway transaction is terminal, so its refund is
//   refused by the gateway — 502, nothing booked, the B-22 dialog stays open with the message;
// - fee B is paid in cash before the capture (TEST-057 c): its online share is an overpayment "to refund".
// B-21 shows "To refund" with B alone (`toRefund=1`, `meta.toRefundCount`); a retry with the same operation id returns
// the same refund; on B-22 an amount above the refundable part answers 422 on the field, a part and then the rest are
// refunded through the dialog, and every refund is a reversing entry with a `gateway_refund_id`. After the full refund
// "To refund" disappears.
test.describe.configure({ timeout: 300_000 })

type ToRefundList = CodedBody & {
  items?: ChargeItem[]
  meta?: { rentalsPerspective?: boolean; toRefundCount?: number }
}

test('TEST-C09 an administrator refunds an online payment from B-22 and finds overpayments under "To refund"', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-c09')
  try {
    let admin = club.adminToken
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const kasia = await createStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Wiśniewska',
      birthDate: birthDateTurning(36),
    })
    const ola = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Wiśniewska',
      birthDate: birthDateTurning(11),
    })
    await createGuardianship(request, admin, {
      guardianPersonId: kasia.personId,
      wardPersonId: ola,
      relation: 'parent',
      isPrimaryPayer: true,
      validFrom: calendarDate(-62),
    })
    await addMembership(request, admin, {
      groupId: zaki,
      personId: ola,
      role: 'participant',
      validFrom: calendarDate(-62),
    })
    await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 10,
      validFrom: calendarDate(-62),
    })
    for (const period of [periodFromNow(-1), periodFromNow(0)]) {
      expect((await generate(request, admin, period)).body).toMatchObject({ created: 1 })
    }
    const toRefund = async () => {
      const listed = await call<ToRefundList>(request, 'GET', '/api/payments/charges?toRefund=1&pageSize=50', admin)
      expect(listed.status, JSON.stringify(listed.body)).toBe(200)
      return { ids: (listed.body?.items ?? []).map((item) => item.id), count: listed.body?.meta?.toRefundCount }
    }
    expect(await toRefund()).toEqual({ ids: [], count: 0 })

    const token = await signInAs(request, club, kasia.userId, kasia.email)
    const [a, b] = ((await myCharges(request, token)).body?.items ?? []).map((item) => item.id)
    expect([a, b].every(Boolean)).toBe(true)

    // Fee A: a failed attempt, then a capture without an event, booked by the fulfilment on a terminal transaction.
    const late = await checkout(request, token, [a])
    await gatewayWebhook(request, { sessionId: late.sessionId, status: 'failed' })
    await expect
      .poll(async () => (await refreshCheckout(request, token, late.checkoutId)).body?.state, { timeout: 20_000 })
      .toBe('interrupted')
    await gatewayWebhook(request, { sessionId: late.sessionId, status: 'captured', amountReceived: 150, notify: false })
    expect((await refreshCheckout(request, token, late.checkoutId)).body).toMatchObject({ status: 'completed' })
    const lateCharge = await getCharge(request, admin, a)
    expect(lateCharge.payments).toHaveLength(1)
    expect(lateCharge.payments[0]).toMatchObject({
      source: 'online',
      overpayment: false,
      refundable: 15000,
      refunds: [],
    })

    // Fee B: cash between the checkout and the capture, so the online share is an overpayment to refund.
    const both = await checkout(request, token, [b])
    const bBefore = await getCharge(request, admin, b)
    const cash = await recordPayment(request, admin, b, bBefore.updatedAt, {
      amount: 15000,
      method: 'cash',
      paidOn: calendarDate(),
    })
    expect(cash.status, JSON.stringify(cash.body)).toBe(201)
    await gatewayWebhook(request, { sessionId: both.sessionId, status: 'captured', amountReceived: 150 })
    await expect
      .poll(async () => (await getCharge(request, admin, b)).payments.some((payment) => payment.method === 'online'), {
        timeout: 20_000,
      })
      .toBe(true)
    const overpaid = await getCharge(request, admin, b)
    const overpayment = overpaid.payments.find((payment) => payment.method === 'online')
    expect(overpayment).toMatchObject({ source: 'online', overpayment: true, refundable: 15000, refunds: [] })
    expect(overpaid.payments.find((payment) => payment.method === 'cash')).toMatchObject({ refundable: 0, refunds: [] })
    const overpaymentId = String(overpayment?.id)

    // "To refund" lists B alone: A's online payment paid its charge, it is no overpayment.
    expect(await toRefund()).toEqual({ ids: [b], count: 1 })

    // A retry with the same operation id returns the same refund and books nothing twice.
    const operationId = randomUUID()
    const first = await refundPayment(request, admin, overpaymentId, overpaid.updatedAt, {
      amount: 2000,
      reason: 'Zapłacone dwa razy',
      operationId,
    })
    expect(first.status, JSON.stringify(first.body)).toBe(201)
    const retried = await refundPayment(request, admin, overpaymentId, (await getCharge(request, admin, b)).updatedAt, {
      amount: 2000,
      reason: 'Zapłacone dwa razy',
      operationId,
    })
    expect(retried.status, JSON.stringify(retried.body)).toBe(201)
    expect(retried.body?.paymentId).toBe(first.body?.paymentId)
    expect(retried.body?.gatewayRefundId).toBe(first.body?.gatewayRefundId)
    const afterRetry = (await getCharge(request, admin, b)).payments.find((payment) => payment.id === overpaymentId)
    expect(afterRetry).toMatchObject({ refundable: 13000 })
    expect(afterRetry?.refunds).toHaveLength(1)
    expect(await toRefund()).toEqual({ ids: [b], count: 1 })

    // B-21 as the administrator: "To refund" with one row.
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    admin = await getAuthToken(request, club.tenant.email, adminPassword)
    const toRefundTab = page.getByRole('tab', {
      name: uiText('payments.charges.perspectives.to_refund', { exact: true }),
    })
    await page.goto('/backend/payments/charges')
    await expect(toRefundTab).toBeVisible()
    await toRefundTab.click()
    await expect(page).toHaveURL(/perspective=to_refund/)
    await expect(page.getByTestId('charge-open')).toHaveCount(1)
    await page.getByTestId('charge-open').click()
    await expect(page).toHaveURL(new RegExp(`/backend/payments/charges/${b}$`))

    // B-22: one Refund action (the cash payment is reversed, not refunded), the suggested amount is what is left.
    const refundOpen = page.getByTestId('refund-payment-open')
    await expect(refundOpen).toHaveCount(1)
    await refundOpen.click()
    const dialog = page.getByTestId('refund-payment-dialog')
    const amount = dialog.getByTestId('refund-payment-amount')
    await expect(amount).toHaveValue('130')
    // A reason is required.
    await dialog.getByTestId('refund-payment-confirm').click()
    await expect(dialog.getByTestId('refund-payment-problem')).toHaveText(uiText('payments.ledger.reasonRequired'))
    await dialog.getByTestId('refund-payment-reason').fill('Zapłacone dwa razy: gotówka u trenera')
    // Above the refundable part: 422 on the amount field.
    await amount.fill('200')
    await dialog.getByTestId('refund-payment-confirm').click()
    await expect(dialog.getByTestId('refund-payment-problem')).toHaveText(uiText('payments.ledger.refund.exceeds'))
    await expect(amount).toHaveAttribute('aria-invalid', 'true')
    // A part …
    await amount.fill('30')
    await dialog.getByTestId('refund-payment-confirm').click()
    await expect(dialog).toBeHidden()
    const overpaymentRow = page
      .getByTestId('charge-payment-row')
      .filter({ has: page.getByTestId('refund-payment-open') })
    await expect(overpaymentRow.getByTestId('charge-payment-refund')).toHaveCount(2)
    // … and the rest.
    await refundOpen.click()
    await expect(dialog.getByTestId('refund-payment-amount')).toHaveValue('100')
    await dialog.getByTestId('refund-payment-reason').fill('Reszta nadpłaty')
    await dialog.getByTestId('refund-payment-confirm').click()
    await expect(dialog).toBeHidden()
    await expect(refundOpen).toHaveCount(0)
    await expect(page.getByTestId('charge-payment-refund')).toHaveCount(3)

    const refunded = await getCharge(request, admin, b)
    const refundedOverpayment = refunded.payments.find((payment) => payment.id === overpaymentId)
    expect(refundedOverpayment).toMatchObject({ refundable: 0 })
    expect(refundedOverpayment?.refunds?.map((refund) => refund.amount)).toEqual([2000, 3000, 10000])
    const reversing = refunded.payments.filter((payment) => payment.reversesPaymentId === overpaymentId)
    expect(reversing).toHaveLength(3)
    expect(reversing.every((payment) => payment.method === 'online' && !!payment.gatewayRefundId)).toBe(true)
    // The cash still pays B; the overpayment never counted.
    expect(refunded).toMatchObject({ status: 'paid', paid: 15000, remaining: 0 })

    // "To refund" disappears after the full refund; a link to it opens the default perspective.
    expect(await toRefund()).toEqual({ ids: [], count: 0 })
    await page.goto('/backend/payments/charges?perspective=to_refund')
    await expect(
      page.getByRole('tab', { name: uiText('payments.charges.perspectives.fees', { exact: true }) }),
    ).toHaveAttribute('aria-selected', 'true')
    await expect(toRefundTab).toHaveCount(0)
    await expect(page).not.toHaveURL(/perspective=to_refund/)

    // The gateway refuses A's late capture: 502, nothing booked, the dialog stays open with the message.
    await page.goto(`/backend/payments/charges/${a}`)
    await page.getByTestId('refund-payment-open').click()
    await expect(dialog.getByTestId('refund-payment-amount')).toHaveValue('150')
    await dialog.getByTestId('refund-payment-reason').fill('Rezygnacja z zajęć')
    await dialog.getByTestId('refund-payment-confirm').click()
    await expect(dialog.getByTestId('refund-payment-problem')).toHaveText(
      uiText('payments.ledger.refund.gatewayRefused'),
    )
    await expect(dialog).toBeVisible()
    const refused = await getCharge(request, admin, a)
    expect(refused.payments).toHaveLength(1)
    expect(refused).toMatchObject({ status: 'paid', paid: 15000 })
    expect(refused.payments[0]).toMatchObject({ refundable: 15000, refunds: [] })
    // The API answers 502 too (a fresh operation, the record's current lock token).
    const direct = await refundPayment(request, admin, refused.payments[0].id, refused.updatedAt, {
      reason: 'Rezygnacja z zajęć',
      operationId: randomUUID(),
    })
    expect(direct.status, JSON.stringify(direct.body)).toBe(502)
    expect(direct.body?.code).toBe('gateway_unavailable')
    expect((await getCharge(request, admin, a)).payments).toHaveLength(1)
  } finally {
    await club.cleanup()
  }
})
