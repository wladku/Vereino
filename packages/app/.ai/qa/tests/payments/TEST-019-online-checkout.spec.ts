import { expect, test } from '@playwright/test'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  createStaff,
  signInAs,
} from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { createGuardianship } from '../_fixtures/people'
import {
  checkout,
  createFee,
  gatewayWebhook,
  generate,
  getCharge,
  listCharges,
  myCharges,
  periodFromNow,
  quote,
  refreshCheckout,
} from '../_fixtures/payments'

// TEST-019 (payments spec phase 4 step 4, DD-42, REQ-012; issue #110 E07-S03), with the checkout part of TEST-055 (club
// spec: `online_fee_mode` `payer_pays` with 1.5 % + 1 zł): a guardian with four open charges of two wards selects
// three. The quote has no fee line while the club pays; with `payer_pays` the fee line is percent plus fixed and the
// charges are still paid in full. The checkout answers the test gateway's embedded session; M-09's refresh says "in
// progress" while the webhook is delayed, the `captured` webhook books one online payment per charge, and the same
// webhook delivered again (and a second capture event) books nothing more. A payment cancelled at the provider leaves
// the fourth charge open and M-09 says "interrupted".
test.describe.configure({ timeout: 300_000 })

test('TEST-019 checkout, captured webhook, repeated webhook, fee line and a cancelled payment', async ({ request }) => {
  const club = await createClub(request, 'test-019')
  try {
    const admin = club.adminToken
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const kasia = await createStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Kowalska',
      birthDate: birthDateTurning(38),
    })
    const wards: string[] = []
    for (const firstName of ['Ola', 'Jaś']) {
      const ward = await createPerson(request, admin, {
        firstName,
        lastName: 'Kowalska',
        birthDate: birthDateTurning(firstName === 'Ola' ? 10 : 8),
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
      wards.push(ward)
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

    // Four open charges she pays, all selectable.
    const mine = await myCharges(request, token)
    expect(mine.status, JSON.stringify(mine.body)).toBe(200)
    expect(mine.body?.items).toHaveLength(4)
    expect(mine.body?.items?.every((item) => item.payable && item.status === 'open')).toBe(true)
    const [first, second, third, fourth] = (mine.body?.items ?? []).map((item) => item.id)
    const selected = [first, second, third]

    // The club pays the commission: no fee line.
    const clubPays = await quote(request, token, selected)
    expect(clubPays.status, JSON.stringify(clubPays.body)).toBe(200)
    expect(clubPays.body).toMatchObject({ amount: 45000, feeAmount: 0, total: 45000, feeMode: 'club_pays' })

    // TEST-055 (checkout part): `payer_pays` 1.5 % + 1 zł is a separate line; one 150 zł charge costs 152.25 zł.
    const settings = await call<{ updatedAt?: string }>(request, 'GET', '/api/club_core/settings', admin)
    const saved = await call(request, 'PUT', '/api/club_core/settings', admin, {
      data: { onlineFeeMode: 'payer_pays', onlineFeePercent: 1.5, onlineFeeFixed: 100 },
      headers: settings.body?.updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: settings.body.updatedAt } : {},
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect((await quote(request, token, [first])).body).toMatchObject({ amount: 15000, feeAmount: 325, total: 15325 })
    const payerPays = await quote(request, token, selected)
    expect(payerPays.body).toMatchObject({ amount: 45000, feeAmount: 775, total: 45775, feeMode: 'payer_pays' })

    // The checkout: the embedded session of the test gateway and the same amounts.
    const started = await checkout(request, token, selected)
    expect(started.body).toMatchObject({
      providerKey: 'vereino_test',
      amount: 45000,
      feeAmount: 775,
      total: 45775,
      clientSession: { type: 'embedded', rendererKey: 'vereino_test.form' },
    })

    // The webhook is delayed: M-09 says "in progress" and nothing is paid.
    const waiting = await refreshCheckout(request, token, started.checkoutId)
    expect(waiting.status, JSON.stringify(waiting.body)).toBe(200)
    expect(waiting.body).toMatchObject({ status: 'created', state: 'in_progress' })
    expect((await getCharge(request, admin, first)).status).toBe('open')

    // The webhook lands: one online payment per charge, every charge paid; the fee line is no payment of a charge.
    const eventId = `evt_captured_${started.checkoutId}`
    await gatewayWebhook(request, { sessionId: started.sessionId, status: 'captured', amountReceived: 457.75, eventId })
    await expect.poll(async () => (await getCharge(request, admin, third)).status, { timeout: 20_000 }).toBe('paid')
    for (const chargeId of selected) {
      const charge = await getCharge(request, admin, chargeId)
      expect(charge).toMatchObject({ status: 'paid', paid: 15000, remaining: 0 })
      expect(charge.payments).toHaveLength(1)
      expect(charge.payments[0]).toMatchObject({ method: 'online', amount: 15000, overpayment: false })
    }
    const received = await refreshCheckout(request, token, started.checkoutId)
    expect(received.body).toMatchObject({ status: 'completed', state: 'received', amountMismatch: false })

    // The same webhook again, and a second capture event: nothing more is booked.
    await gatewayWebhook(request, { sessionId: started.sessionId, status: 'captured', amountReceived: 457.75, eventId })
    await gatewayWebhook(request, { sessionId: started.sessionId, status: 'captured', amountReceived: 457.75 })
    expect((await refreshCheckout(request, token, started.checkoutId)).body).toMatchObject({ state: 'received' })
    for (const chargeId of selected) expect((await getCharge(request, admin, chargeId)).payments).toHaveLength(1)
    const online = await listCharges(request, admin, '&status=paid')
    expect(online.map((charge) => charge.id).sort()).toEqual([...selected].sort())

    // A payment cancelled at the provider: "interrupted", and the charge stays open and payable.
    const cancelled = await checkout(request, token, [fourth])
    await gatewayWebhook(request, { sessionId: cancelled.sessionId, status: 'cancelled' })
    await expect
      .poll(async () => (await refreshCheckout(request, token, cancelled.checkoutId)).body?.state, { timeout: 20_000 })
      .toBe('interrupted')
    expect((await getCharge(request, admin, fourth)).status).toBe('open')
    const after = await myCharges(request, token)
    expect(after.body?.items?.find((item) => item.id === fourth)).toMatchObject({ status: 'open', payable: true })
    expect(after.body?.items?.filter((item) => item.status === 'paid')).toHaveLength(3)
  } finally {
    await club.cleanup()
  }
})
