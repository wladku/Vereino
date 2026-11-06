import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { birthDateTurning, calendarDate, createClub, createPerson, createStaff, signInAs } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
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
} from '../_fixtures/payments'

// TEST-057 (payments spec phase 4 step 4, DD-42, Q-049, Q-050; issue #110 E07-S03) with the gateway test adapter:
// (a) the attempt fails (`payment.failed` → "interrupted"), then the provider captures without an event: the next
//     fulfilment books it once (late capture);
// (c) one charge is paid in cash between the checkout and the capture: its share becomes an online overpayment "to
//     refund" and the other charge is paid;
// (d) the amount captured differs from the checkout total: nothing is booked and the checkout is flagged;
// (e) a partial and a full refund of an online payment, a retry with the same operation id returning the same refund,
//     a refund above the remainder (422), a cash payment (409), and the refund of the overpayment.
// (b) — a `created` checkout expiring after 24 hours — is decided by `isExpirable` (unit test); the sweep runs the same
// fulfilment as the refresh used here.
test.describe.configure({ timeout: 300_000 })

test('TEST-057 late capture, cash in between, amount mismatch and online refunds', async ({ request }) => {
  const club = await createClub(request, 'test-057')
  try {
    const admin = club.adminToken
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const kasia = await createStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Wiśniewska',
      birthDate: birthDateTurning(36),
    })
    for (const firstName of ['Ola', 'Jaś']) {
      const ward = await createPerson(request, admin, {
        firstName,
        lastName: 'Wiśniewska',
        birthDate: birthDateTurning(firstName === 'Ola' ? 11 : 7),
      })
      await createGuardianship(request, admin, {
        guardianPersonId: kasia.personId,
        wardPersonId: ward,
        relation: 'parent',
        isPrimaryPayer: true,
        validFrom: calendarDate(-62),
      })
      await addMembership(request, admin, {
        groupId: zaki,
        personId: ward,
        role: 'participant',
        validFrom: calendarDate(-62),
      })
    }
    await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 10,
      validFrom: calendarDate(-62),
    })
    for (const period of [periodFromNow(-1), periodFromNow(0)]) {
      expect((await generate(request, admin, period)).body).toMatchObject({ created: 2 })
    }
    const token = await signInAs(request, club, kasia.userId, kasia.email)
    const [a, b, c, d] = ((await myCharges(request, token)).body?.items ?? []).map((item) => item.id)
    expect([a, b, c, d].every(Boolean)).toBe(true)

    // (a) A failed attempt, then a capture the provider reports without an event: booked once by the fulfilment.
    const late = await checkout(request, token, [a])
    await gatewayWebhook(request, { sessionId: late.sessionId, status: 'failed' })
    await expect
      .poll(async () => (await refreshCheckout(request, token, late.checkoutId)).body?.state, { timeout: 20_000 })
      .toBe('interrupted')
    expect((await getCharge(request, admin, a)).status).toBe('open')
    await gatewayWebhook(request, { sessionId: late.sessionId, status: 'captured', amountReceived: 150, notify: false })
    expect((await refreshCheckout(request, token, late.checkoutId)).body).toMatchObject({
      status: 'completed',
      state: 'received',
    })
    expect((await refreshCheckout(request, token, late.checkoutId)).body?.state).toBe('received')
    const lateCharge = await getCharge(request, admin, a)
    expect(lateCharge).toMatchObject({ status: 'paid', paid: 15000 })
    expect(lateCharge.payments).toHaveLength(1)

    // (c) Cash for B between the checkout and the capture: B's share is an overpayment to refund, C is paid.
    const both = await checkout(request, token, [b, c])
    const bBefore = await getCharge(request, admin, b)
    const cash = await recordPayment(request, admin, b, bBefore.updatedAt, {
      amount: 15000,
      method: 'cash',
      paidOn: calendarDate(),
    })
    expect(cash.status, JSON.stringify(cash.body)).toBe(201)
    await gatewayWebhook(request, { sessionId: both.sessionId, status: 'captured', amountReceived: 300 })
    await expect.poll(async () => (await getCharge(request, admin, c)).status, { timeout: 20_000 }).toBe('paid')
    const bAfter = await getCharge(request, admin, b)
    expect(bAfter).toMatchObject({ status: 'paid', paid: 15000, remaining: 0 })
    const overpayment = bAfter.payments.find((payment) => payment.method === 'online')
    expect(overpayment).toMatchObject({ amount: 15000, overpayment: true })
    const cashPayment = bAfter.payments.find((payment) => payment.method === 'cash')
    const cAfter = await getCharge(request, admin, c)
    expect(cAfter.payments).toHaveLength(1)
    const online = cAfter.payments[0]
    expect(online).toMatchObject({ method: 'online', amount: 15000, overpayment: false })

    // (d) A capture of a different amount: nothing booked, the checkout flagged.
    const mismatch = await checkout(request, token, [d])
    await gatewayWebhook(request, { sessionId: mismatch.sessionId, status: 'captured', amountReceived: 100 })
    await expect
      .poll(async () => (await refreshCheckout(request, token, mismatch.checkoutId)).body?.amountMismatch, {
        timeout: 20_000,
      })
      .toBe(true)
    expect((await refreshCheckout(request, token, mismatch.checkoutId)).body).toMatchObject({ status: 'created' })
    expect(await getCharge(request, admin, d)).toMatchObject({ status: 'open', paid: 0, payments: [] })

    // (e) Refunds of C's online payment: partial, retried with the same operation id, too much, then the rest.
    const operation = randomUUID()
    const partial = await refundPayment(request, admin, online.id, cAfter.updatedAt, {
      amount: 5000,
      reason: 'Fee waived in part',
      operationId: operation,
    })
    expect(partial.status, JSON.stringify(partial.body)).toBe(201)
    expect(partial.body).toMatchObject({ refunded: 5000, chargeStatus: 'partially_paid' })
    expect(partial.body?.gatewayRefundId).toBeTruthy()
    const afterPartial = await getCharge(request, admin, c)
    const retried = await refundPayment(request, admin, online.id, afterPartial.updatedAt, {
      amount: 5000,
      reason: 'Fee waived in part',
      operationId: operation,
    })
    expect(retried.status, JSON.stringify(retried.body)).toBe(201)
    expect(retried.body?.paymentId).toBe(partial.body?.paymentId)
    expect(retried.body?.gatewayRefundId).toBe(partial.body?.gatewayRefundId)
    expect((await getCharge(request, admin, c)).payments).toHaveLength(2)
    const tooMuch = await refundPayment(request, admin, online.id, (await getCharge(request, admin, c)).updatedAt, {
      amount: 20000,
      reason: 'Too much',
      operationId: randomUUID(),
    })
    expect(tooMuch.status, JSON.stringify(tooMuch.body)).toBe(422)
    expect(tooMuch.body?.code).toBe('refund_exceeds_remaining')
    const rest = await refundPayment(request, admin, online.id, (await getCharge(request, admin, c)).updatedAt, {
      reason: 'Left the club',
      operationId: randomUUID(),
    })
    expect(rest.status, JSON.stringify(rest.body)).toBe(201)
    expect(rest.body).toMatchObject({ refunded: 10000, chargeStatus: 'open' })
    const refunded = await getCharge(request, admin, c)
    expect(refunded).toMatchObject({ status: 'open', paid: 0, remaining: 15000 })
    expect(refunded.payments.filter((payment) => payment.reversesPaymentId === online.id)).toHaveLength(2)

    // A cash payment is not refunded online; the overpayment of B is, and B stays paid by the cash.
    const notOnline = await refundPayment(request, admin, String(cashPayment?.id), bAfter.updatedAt, {
      reason: 'No',
      operationId: randomUUID(),
    })
    expect(notOnline.status, JSON.stringify(notOnline.body)).toBe(409)
    expect(notOnline.body?.code).toBe('payment_not_refundable')
    const back = await refundPayment(
      request,
      admin,
      String(overpayment?.id),
      (await getCharge(request, admin, b)).updatedAt,
      {
        reason: 'Paid twice',
        operationId: randomUUID(),
      },
    )
    expect(back.status, JSON.stringify(back.body)).toBe(201)
    expect(await getCharge(request, admin, b)).toMatchObject({ status: 'paid', paid: 15000 })
  } finally {
    await club.cleanup()
  }
})
