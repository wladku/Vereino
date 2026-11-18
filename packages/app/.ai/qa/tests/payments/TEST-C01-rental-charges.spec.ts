import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { addDays, nextWeekday, weekdayOf, zoneInstant } from '../_fixtures/activities'
import { birthDateTurning, calendarDate, call, createClub, createStaff, signInAs } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { getRental, phoneRental, postRental, rentalAction, rentalPitch } from '../_fixtures/facilities'
import { setUserFeatures } from '../_fixtures/members'
import {
  acceptCash,
  chargeServiceInProbe,
  getCharge,
  myCharges,
  quote,
  recordPayment,
  startCheckout,
  type ChargeItem,
} from '../_fixtures/payments'
import { uiText } from '../_fixtures/ui-text'

// Issue #291 (E12-S01), payments parity spec phase 1: TEST-C01, the rental parts of TEST-C02 and TEST-C03. With
// `payments` and `facilities` enabled, a staff rental writes one `rental` charge payable to the facility owner in the
// rental's transaction — the payer is the renter institution, person or typed-in name — and `Rental.chargeId` names it.
// A free cancellation cancels the charge, a late one forfeits it, and a charge with a recorded payment stays as it is
// with the warning `charge_paid`. The service itself (probe): no payer → 422 `charge_payer_required` and nothing
// written; `payments.charge.created` only after commit; a second create returns the same charge; the typed-in name is
// encrypted at rest; `statusOf` leaves out another tenant's and unknown ids. The renter person never sees the charge
// on "My charges" and the checkout answers 403. B-21 lists it under "Rentals (municipality)" and B-22 reads "to the
// account of the facility owner" while `facilities` passes no owner (until the facilities parity spec, E11-S11).
test.describe.configure({ timeout: 600_000 })

const HALF_HOUR = 30 * 60_000

/** A bookable start less than 24 hours ahead (inside the free-cancellation deadline), as TEST-023 picks it. */
function startWithinADay(): string {
  const now = Date.now()
  for (const date of [calendarDate(), calendarDate(1)]) {
    const weekend = ['SA', 'SU'].includes(weekdayOf(date))
    for (let minutes = weekend ? 9 * 60 : 8 * 60; minutes <= (weekend ? 19 * 60 : 14 * 60 + 30); minutes += 30) {
      const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
      const instant = zoneInstant(date, time)
      const at = Date.parse(instant)
      if (at >= now + HALF_HOUR && at <= now + 46 * HALF_HOUR) return instant
    }
  }
  throw new Error('[internal] no bookable start within a day')
}

type ChargeList = { items?: ChargeItem[]; meta?: { rentalsPerspective?: boolean; toRefundCount?: number } }

test('TEST-C01 a rental gets its charge payable to the owner; cancellation, the paid warning and the service contract', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-c01-rental-charges')
  const other = await createClub(request, 'test-c01-other-tenant')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const tuesday = nextWeekday(addDays(calendarDate(), 7), 'TU')

    // Given a renter institution, when staff save a rental, then exactly one `rental` charge payable to the owner
    // institution with that payer exists, and the rental names it.
    const created = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(tuesday, '08:00')),
    )
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const rentalId = String(created.body?.id)
    const chargeId = String(created.body?.chargeId)
    expect(chargeId).toMatch(/^[0-9a-f-]{36}$/)
    expect((await getRental(request, admin, rentalId)).chargeId).toBe(chargeId)
    const charge = await getCharge(request, admin, chargeId)
    expect(charge).toMatchObject({
      sourceType: 'rental',
      sourceId: rentalId,
      payee: 'owner_institution',
      payeeInstitution: null,
      payerInstitution: { id: setup.neighbours, name: 'KS Sąsiedzi' },
      payerPersonId: null,
      payerLabel: null,
      payerMissing: false,
      personId: null,
      amount: 25_000,
      status: 'open',
    })

    // The list: one charge for the rental under the rentals perspective, which DD-C02 shows with `facilities`; a new
    // club holds no online overpayment, so nothing waits under "To refund" (#296).
    const list = await call<ChargeList>(request, 'GET', '/api/payments/charges?pageSize=100&sourceType=rental', admin)
    expect(list.status, JSON.stringify(list.body)).toBe(200)
    expect(list.body?.meta).toEqual({ rentalsPerspective: true, toRefundCount: 0 })
    expect(list.body?.items?.filter((item) => item.sourceId === rentalId)).toHaveLength(1)
    const owner = await call<ChargeList>(request, 'GET', '/api/payments/charges?pageSize=100&payee=club', admin)
    expect(owner.body?.items?.some((item) => item.id === chargeId)).toBe(false)

    // An unregistered renter is the payer by the typed-in name.
    const unregistered = await postRental(request, admin, {
      ...phoneRental(setup.pitch, setup.neighbours, zoneInstant(tuesday, '09:30')),
      renterType: 'unregistered',
      renterId: null,
      renterDisplayName: 'Jan Wynajmujący',
    })
    expect(unregistered.status, JSON.stringify(unregistered.body)).toBe(201)
    expect(await getCharge(request, admin, String(unregistered.body?.chargeId))).toMatchObject({
      payerInstitution: null,
      payerPersonId: null,
      payerLabel: 'Jan Wynajmujący',
    })

    // A renter person with an account: the payer of the charge, which "My charges" never lists and the checkout refuses.
    const renter = await createStaff(request, club, {
      firstName: 'Piotr',
      lastName: 'Najemca',
      birthDate: birthDateTurning(35),
    })
    const personal = await postRental(request, admin, {
      ...phoneRental(setup.pitch, setup.neighbours, zoneInstant(tuesday, '11:00')),
      renterType: 'person',
      renterId: renter.personId,
    })
    expect(personal.status, JSON.stringify(personal.body)).toBe(201)
    const personalCharge = String(personal.body?.chargeId)
    expect(await getCharge(request, admin, personalCharge)).toMatchObject({
      payerPersonId: renter.personId,
      payer: { firstName: 'Piotr', lastName: 'Najemca' },
    })
    await setUserFeatures(request, club, renter.userId, ['payments.view_own', 'payments.pay_online'])
    const renterToken = await signInAs(request, club, renter.userId, renter.email)
    const mine = await myCharges(request, renterToken)
    expect(mine.status, JSON.stringify(mine.body)).toBe(200)
    expect(mine.body?.items?.map((item) => item.id)).not.toContain(personalCharge)
    for (const result of [
      await quote(request, renterToken, [personalCharge]),
      await startCheckout(request, renterToken, [personalCharge]),
    ]) {
      expect(result.status, JSON.stringify(result.body)).toBe(403)
      expect(result.body?.code).toBe('checkout_charge_forbidden')
    }
    // Nor does the club take cash for it: the money goes to the owner's account.
    const cash = await acceptCash(request, admin, {
      payerPersonId: renter.personId,
      chargeIds: [personalCharge],
      amount: 1_000,
      paidOn: calendarDate(),
    })
    expect(cash.status, JSON.stringify(cash.body)).toBe(422)
    expect(cash.body?.code).toBe('cash_charges_invalid')

    // A free cancellation (more than 24 h ahead) cancels the charge.
    const free = await rentalAction(request, admin, String(unregistered.body?.id), 'cancel', { reason: 'Rezygnacja' })
    expect(free.status, JSON.stringify(free.body)).toBe(200)
    expect(free.body).toMatchObject({ status: 'cancelled_free' })
    expect((await getCharge(request, admin, String(unregistered.body?.chargeId))).status).toBe('cancelled')

    // A late cancellation (under 24 h) forfeits it.
    const soon = await postRental(request, admin, phoneRental(setup.pitch, setup.neighbours, startWithinADay()))
    expect(soon.status, JSON.stringify(soon.body)).toBe(201)
    const late = await rentalAction(request, admin, String(soon.body?.id), 'cancel')
    expect(late.status, JSON.stringify(late.body)).toBe(200)
    expect(late.body).toMatchObject({ status: 'cancelled_late' })
    expect((await getCharge(request, admin, String(soon.body?.chargeId))).status).toBe('forfeited')

    // Given a rental charge with a recorded payment, when the rental is cancelled, then the charge is untouched and the
    // response carries the warning `charge_paid`.
    const paid = await recordPayment(request, admin, chargeId, charge.updatedAt, {
      amount: 10_000,
      method: 'transfer',
      paidOn: calendarDate(),
    })
    expect(paid.status, JSON.stringify(paid.body)).toBe(201)
    const cancelPaid = await rentalAction(request, admin, rentalId, 'cancel', { reason: 'Rezygnacja' })
    expect(cancelPaid.status, JSON.stringify(cancelPaid.body)).toBe(200)
    expect(cancelPaid.body).toMatchObject({ status: 'cancelled_free', warning: 'charge_paid' })
    expect((await getCharge(request, admin, chargeId)).status).toBe('partially_paid')

    // The service contract, called as `facilities` calls it: no payer → 422 and nothing written; the created event only
    // after commit; a second create returns the same charge; the typed-in name encrypted; `statusOf` within the tenant.
    const otherSetup = await rentalPitch(request, other)
    const foreign = await postRental(
      request,
      other.adminToken,
      phoneRental(otherSetup.pitch, otherSetup.neighbours, zoneInstant(tuesday, '08:00')),
    )
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(201)
    const foreignCharge = String(foreign.body?.chargeId)
    const probe = chargeServiceInProbe(
      { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId },
      { userId: club.adminUserId, statusOf: [chargeId, foreignCharge] },
    )
    expect(probe.noPayer).toEqual({ status: 422, code: 'charge_payer_required' })
    expect(probe.noPayerRows).toBe(0)
    expect(probe.events).toEqual({ insideTransaction: 0, beforeAfterCommit: 0, afterCommit: 1, afterSecondCreate: 1 })
    expect(probe.againChargeId).toBe(probe.chargeId)
    expect(probe.rows).toBe(1)
    expect(probe.status).toBe('open')
    expect(probe.labelStored).toBe(true)
    expect(probe.labelStoredPlain).toBe(false)
    expect(probe.statusOf).toEqual({ [probe.chargeId]: 'open', [chargeId]: 'partially_paid' })

    // B-21: "Rentals (municipality)" lists the rental charges with the payer; B-22 names the payee's account.
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, adminPassword)
    await page.goto('/backend/payments/charges?perspective=rentals')
    const rentalsTab = page.getByRole('tab', { name: uiText('payments.charges.perspectives.rentals', { exact: true }) })
    await expect(rentalsTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('KS Sąsiedzi').first()).toBeVisible()
    await expect(page.getByText('Piotr Najemca').first()).toBeVisible()
    await page.goto(`/backend/payments/charges/${personalCharge}`)
    await expect(page.getByTestId('charge-payer')).toHaveText('Piotr Najemca')
    await expect(page.getByTestId('charge-payee')).toContainText(uiText('payments.ledger.payee.ownerUnknown'))
    await expect(page.getByTestId('charge-payee')).not.toContainText(uiText('payments.ledger.payee.club'))
    // Q-C16 (#292): no "Accept cash" on a rental charge, even with a person as payer; "Record payment" stays.
    await expect(page.getByTestId('record-payment-open')).toBeVisible()
    await expect(page.getByTestId('accept-cash-open')).toHaveCount(0)
  } finally {
    await other.cleanup()
    await club.cleanup()
  }
})
