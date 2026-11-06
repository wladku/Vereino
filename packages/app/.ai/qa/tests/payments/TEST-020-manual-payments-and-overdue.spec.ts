import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { birthDateTurning, calendarDate, createClub, createPerson } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'
import { actionLogEntries, createGuardianship } from '../_fixtures/people'
import {
  type ChargeItem,
  cancelCharge,
  chargeOf,
  createFee,
  generate,
  getCharge,
  listCharges,
  periodFromNow,
  recordPayment,
  reversePayment,
} from '../_fixtures/payments'

// TEST-020 (payments spec phase 4 step 3, REQ-011, REQ-012; issue #109 E07-S02): a charge of PLN 150 past its due date.
// PLN 100 in cash makes it `partially_paid` with PLN 50 remaining; PLN 60 more → 422 "The amount exceeds the remaining
// 50 zł"; a future date → 422; no lock token → 400, a stale one → 409; cancelling it → 409 (it has a payment). The
// Overdue perspective lists only charges still to pay past their due date; PLN 50 by transfer makes it `paid`. The
// cash payment is reversed with a reason (a negative entry; the charge is `partially_paid` again), once only, and a
// reversing entry cannot be reversed; the Cash payments perspective follows. An open charge cancelled with a reason
// keeps the reason on the charge and in the audit log, and takes no payment. The charge list is searchable by surname;
// a coordinator may not record payments.
test.describe.configure({ timeout: 300_000 })

const ids = (charges: readonly ChargeItem[]) => charges.map((charge) => charge.id).sort()

test('TEST-020 cash and transfer payments, overpayment 422, overdue list, reversal and cancellation with a reason', async ({
  request,
}) => {
  const club = await createClub(request, 'test-020')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const past = periodFromNow(-1)
    const next = periodFromNow(1)
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const anna = await createPerson(request, admin, {
      firstName: 'Anna',
      lastName: 'Nowak',
      birthDate: birthDateTurning(40),
    })
    const ola = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Nowak',
      birthDate: birthDateTurning(10),
    })
    const tomek = await createPerson(request, admin, {
      firstName: 'Tomek',
      lastName: 'Bezpłatnika',
      birthDate: birthDateTurning(9),
    })
    await createGuardianship(request, admin, {
      guardianPersonId: anna,
      wardPersonId: ola,
      relation: 'parent',
      isPrimaryPayer: true,
      validFrom: calendarDate(-62),
    })
    for (const personId of [ola, tomek]) {
      await addMembership(request, admin, {
        groupId: zaki,
        personId,
        role: 'participant',
        validFrom: calendarDate(-62),
      })
    }
    const fee = await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 10,
      validFrom: calendarDate(-62),
    })
    expect((await generate(request, admin, past)).body).toMatchObject({ created: 2 })
    expect((await generate(request, admin, next)).body).toMatchObject({ created: 2 })
    const pastCharges = await listCharges(request, admin, `&period=${past}`)
    const nextCharges = await listCharges(request, admin, `&period=${next}`)
    const olaPast = chargeOf(pastCharges, ola, fee)
    const olaNext = chargeOf(nextCharges, ola, fee)
    const tomekPast = chargeOf(pastCharges, tomek, fee)

    // The list carries what remains and the overdue marker.
    expect(olaPast).toMatchObject({ amountDue: 15000, status: 'open' })
    const listed = (await listCharges(request, admin, `&period=${past}`)).find((charge) => charge.id === olaPast.id)
    expect(listed).toMatchObject({ paid: 0, remaining: 15000, overdue: true, payee: 'club' })

    // PLN 100 in cash → partially paid, PLN 50 remaining.
    let charge = await getCharge(request, admin, olaPast.id)
    expect(charge).toMatchObject({ amountDue: 15000, paid: 0, remaining: 15000, overdue: true, payments: [] })
    const noLock = await recordPayment(request, admin, olaPast.id, null, {
      amount: 10000,
      method: 'cash',
      paidOn: today,
    })
    expect(noLock.status, JSON.stringify(noLock.body)).toBe(400)
    const cash = await recordPayment(request, admin, olaPast.id, charge.updatedAt, {
      amount: 10000,
      method: 'cash',
      paidOn: today,
      reference: 'KP 1',
    })
    expect(cash.status, JSON.stringify(cash.body)).toBe(201)
    expect(cash.body).toMatchObject({ chargeStatus: 'partially_paid', remaining: 5000 })
    const stale = await recordPayment(request, admin, olaPast.id, charge.updatedAt, {
      amount: 100,
      method: 'cash',
      paidOn: today,
    })
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)
    charge = await getCharge(request, admin, olaPast.id)
    expect(charge).toMatchObject({ status: 'partially_paid', paid: 10000, remaining: 5000 })
    expect(charge.payments).toHaveLength(1)
    expect(charge.payments[0]).toMatchObject({ amount: 10000, method: 'cash', paidOn: today, reference: 'KP 1' })

    // PLN 60 more → 422 with the remainder in the message; a future date → 422.
    const over = await recordPayment(request, admin, olaPast.id, charge.updatedAt, {
      amount: 6000,
      method: 'transfer',
      paidOn: today,
    })
    expect(over.status, JSON.stringify(over.body)).toBe(422)
    expect(over.body).toMatchObject({ code: 'payment_exceeds_remaining', remainingAmount: 5000 })
    expect(over.body?.error).toBe('The amount exceeds the remaining 50 zł')
    const future = await recordPayment(request, admin, olaPast.id, charge.updatedAt, {
      amount: 1000,
      method: 'cash',
      paidOn: calendarDate(1),
    })
    expect(future.status, JSON.stringify(future.body)).toBe(422)
    expect(future.body?.code).toBe('payment_date_in_future')

    // A charge with a payment cannot be cancelled.
    const withPayment = await cancelCharge(request, admin, olaPast.id, charge.updatedAt, { reason: 'Pomyłka' })
    expect(withPayment.status, JSON.stringify(withPayment.body)).toBe(409)
    expect(withPayment.body?.code).toBe('charge_has_payments')

    // Overdue: only charges still to pay past their due date (both past charges; not the next month's).
    const overdue = await listCharges(request, admin, '&overdue=1')
    expect(ids(overdue)).toEqual([olaPast.id, tomekPast.id].sort())
    for (const item of overdue) {
      expect(['open', 'partially_paid']).toContain(item.status)
      expect(String(item.dueDate) < today).toBe(true)
    }
    expect(ids(await listCharges(request, admin, '&paymentMethod=cash'))).toEqual([olaPast.id])

    // PLN 50 by transfer → paid; it leaves the Overdue perspective.
    const transfer = await recordPayment(request, admin, olaPast.id, charge.updatedAt, {
      amount: 5000,
      method: 'transfer',
      paidOn: calendarDate(-1),
      reference: 'Składka Ola Nowak',
    })
    expect(transfer.status, JSON.stringify(transfer.body)).toBe(201)
    expect(transfer.body).toMatchObject({ chargeStatus: 'paid', remaining: 0 })
    expect(ids(await listCharges(request, admin, '&overdue=1'))).toEqual([tomekPast.id])

    // The title is encrypted at rest.
    const stored = await withClient((client) =>
      client.query<{ reference: string }>('select reference from payments_payments where id = $1', [
        String(transfer.body?.paymentId),
      ]),
    )
    expect(stored.rows[0]?.reference).toBeTruthy()
    expect(stored.rows[0]?.reference).not.toBe('Składka Ola Nowak')

    // Reversing the cash payment: a negative entry with the reason; the charge is partially paid again.
    charge = await getCharge(request, admin, olaPast.id)
    const cashPayment = charge.payments.find((payment) => payment.method === 'cash')
    expect(cashPayment).toBeTruthy()
    const noReason = await reversePayment(request, admin, String(cashPayment?.id), charge.updatedAt, { reason: ' ' })
    expect(noReason.status, JSON.stringify(noReason.body)).toBe(400)
    const reversed = await reversePayment(request, admin, String(cashPayment?.id), charge.updatedAt, {
      reason: 'Wpłata zaksięgowana na złe dziecko',
    })
    expect(reversed.status, JSON.stringify(reversed.body)).toBe(201)
    expect(reversed.body).toMatchObject({ chargeStatus: 'partially_paid', remaining: 10000 })
    charge = await getCharge(request, admin, olaPast.id)
    expect(charge).toMatchObject({ status: 'partially_paid', paid: 5000, remaining: 10000, overdue: true })
    expect(charge.payments).toHaveLength(3)
    const reversal = charge.payments.find((payment) => payment.reversesPaymentId === cashPayment?.id)
    expect(reversal).toMatchObject({ amount: -10000, method: 'cash', paidOn: today })
    expect(reversal?.reference).toBe('Wpłata zaksięgowana na złe dziecko')
    expect(charge.payments.find((payment) => payment.id === cashPayment?.id)?.reversed).toBe(true)
    const again = await reversePayment(request, admin, String(cashPayment?.id), charge.updatedAt, { reason: 'Znowu' })
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    expect(again.body?.code).toBe('payment_already_reversed')
    const ofReversal = await reversePayment(request, admin, String(reversal?.id), charge.updatedAt, { reason: 'Nie' })
    expect(ofReversal.status, JSON.stringify(ofReversal.body)).toBe(409)
    expect(ofReversal.body?.code).toBe('payment_not_reversible')
    expect(await listCharges(request, admin, '&paymentMethod=cash')).toEqual([])
    expect(ids(await listCharges(request, admin, '&overdue=1'))).toEqual([olaPast.id, tomekPast.id].sort())

    // An open charge cancelled with a reason: kept on the charge and in the audit log; it then takes no payment.
    let nextCharge = await getCharge(request, admin, olaNext.id)
    const blank = await cancelCharge(request, admin, olaNext.id, nextCharge.updatedAt, { reason: '' })
    expect(blank.status, JSON.stringify(blank.body)).toBe(400)
    const cancelled = await cancelCharge(request, admin, olaNext.id, nextCharge.updatedAt, {
      reason: 'Rezygnacja z zajęć od nowego miesiąca',
    })
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    nextCharge = await getCharge(request, admin, olaNext.id)
    expect(nextCharge).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Rezygnacja z zajęć od nowego miesiąca',
      remaining: 0,
      overdue: false,
    })
    const cancelLog = (await actionLogEntries(request, admin, olaNext.id)).find(
      (entry) => entry.commandId === 'payments.charges.cancel',
    )
    expect(cancelLog?.context).toMatchObject({ reason: 'Rezygnacja z zajęć od nowego miesiąca' })
    const onCancelled = await recordPayment(request, admin, olaNext.id, nextCharge.updatedAt, {
      amount: 1000,
      method: 'cash',
      paidOn: today,
    })
    expect(onCancelled.status, JSON.stringify(onCancelled.body)).toBe(409)
    expect(onCancelled.body?.code).toBe('charge_not_payable')
    const twice = await cancelCharge(request, admin, olaNext.id, nextCharge.updatedAt, { reason: 'Znowu' })
    expect(twice.status).toBe(409)
    expect(twice.body?.code).toBe('charge_not_cancellable')

    // Search by surname: the debtor's or the payer's name (the name tokens are indexed after the write).
    await expect
      .poll(async () => ids(await listCharges(request, admin, '&search=Nowak')), { timeout: 30_000 })
      .toEqual([olaPast.id, olaNext.id].sort())
    await expect
      .poll(async () => ids(await listCharges(request, admin, '&search=Bezp')), { timeout: 30_000 })
      .toEqual(ids(await listCharges(request, admin, `&personId=${tomek}`)))

    // A coordinator may neither read the charge nor record a payment.
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Krystyna',
      lastName: 'Koordynator',
      role: 'coordinator',
      sectionId: academy,
    })
    const tomekCharge = await getCharge(request, admin, tomekPast.id)
    const denied = await recordPayment(request, coordinator.token, tomekPast.id, tomekCharge.updatedAt, {
      amount: 1000,
      method: 'cash',
      paidOn: today,
    })
    expect(denied.status).toBe(403)
  } finally {
    await club.cleanup()
  }
})
