import { expect, test, type APIRequestContext } from '@playwright/test'
import { addDays, nextWeekday, weekdayOf, zoneInstant } from '../_fixtures/activities'
import { calendarDate, call, createClub } from '../_fixtures/club'
import { create, getOne, update } from '../_fixtures/club-structure'
import { decide, queuedRequest } from '../_fixtures/facility-requests'
import {
  ORLIK_HOURS,
  bulkAvailability,
  getRental,
  phoneRental,
  postRate,
  postRental,
  rentalAction,
  rentalPitch,
  runChargeProbe,
  runRequestProbe,
  setOpeningHours,
} from '../_fixtures/facilities'
import { getCharge, recordPayment, reversePayment } from '../_fixtures/payments'
import { uiText } from '../_fixtures/ui-text'
import { signInBrowserContext } from '../_fixtures/auth'

// Issue #285 (E11-S11), facilities parity spec phase 11: TEST-R08 (REQ-R06, REQ-R11, AC-R04; DD-R09, DD-19). With
// `payments`, a staff rental of a registered renter, one of an unregistered renter and an approved request each carry
// a charge payable to the place's owner institution, with the renter (or the typed-in name) as payer, the
// `charge.rentalDesc` description in the club's default locale (Polish) and the payment deadline's date as due date.
// A direct confirm of an unpaid rental answers 409 `rental_awaits_payment` with the charge; a partial payment confirms
// nothing, the full one confirms the rental once (a replayed `confirm_paid` changes nothing); a reversed payment leaves
// the rental confirmed with its charge `open` again. A move re-dates the deadline and, with it, the unpaid charge's
// due date and description (#221 L2); a move to another place re-quotes the amount and the charge from that place's
// rates, and answers 422 `rental_rate_missing` where it has none; a rental whose charge holds a payment (even a
// reversed one) keeps its amount, its deadline and its charge; a rental without a charge gets a new deadline and keeps
// its amount on the same place; a cancellation cancels (free) or forfeits (late) the charge. With the charge
// service hidden (probe) a rental gets no charge, confirms at once and reads `chargeState: none`. The owner report
// names the owner and says `charges`, `rental_register` or `mixed`, with the partly paid rentals apart. B-24's
// "Confirm payment" of an unpaid rental opens its charge; a rental without one says "rental register". A rental with
// no payer of any kind is refused by the service and rolls back with it: covered by TEST-C01 (#291), because the
// facilities API always names a payer.
test.describe.configure({ timeout: 600_000 })

const TZ = 'Europe/Warsaw'

/** The club-zone calendar date of an instant (the charge's due date). */
const zoneDate = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  )

/** The Polish `charge.rentalDesc` of a rental of Boisko A (or of the named place). */
const description = (startsAt: string, from: string, to: string, place = 'Boisko A'): string =>
  `Wynajem: ${place}, ${new Intl.DateTimeFormat('pl', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(startsAt))} ${from}–${to}`

/** A bookable start within a day: a cancellation is late (TEST-R09). */
function soonStart(): string {
  for (const date of [calendarDate(), calendarDate(1)]) {
    const weekend = ['SA', 'SU'].includes(weekdayOf(date))
    for (let minutes = weekend ? 540 : 480; minutes <= (weekend ? 1140 : 870); minutes += 30) {
      const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
      const at = Date.parse(zoneInstant(date, time))
      if (at >= Date.now() + 1_800_000 && at <= Date.now() + 82_800_000) return zoneInstant(date, time)
    }
  }
  throw new Error('[internal] no bookable start within a day')
}

type Report = {
  owner: { institutionId: string; name: string } | null
  payments: { amount: number; count: number; source: string; partiallyPaidCount: number }
}

function ownerReport(request: APIRequestContext, token: string, placeId: string, from: string, to: string) {
  return call<Report>(request, 'GET', `/api/facilities/reports/owner?placeId=${placeId}&from=${from}&to=${to}`, token)
}

async function pay(request: APIRequestContext, token: string, chargeId: string, amount: number): Promise<string> {
  const charge = await getCharge(request, token, chargeId)
  const paid = await recordPayment(request, token, chargeId, charge.updatedAt, {
    amount,
    method: 'transfer',
    paidOn: calendarDate(),
  })
  expect(paid.status, JSON.stringify(paid.body)).toBe(201)
  return String(paid.body?.paymentId)
}

test('TEST-R08 a rental carries a charge payable to the owner and is confirmed when the charge is paid', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-r08-rental-charge')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const today = calendarDate()
    const owner = await create(request, admin, 'institutions', { name: 'Gmina Przykładowo', type: 'municipality' })
    const place = await getOne(request, admin, 'places', setup.pitch)
    const owned = await update(
      request,
      admin,
      'places',
      { id: setup.pitch, ownerInstitutionId: owner },
      place?.updatedAt,
    )
    expect(owned.status, JSON.stringify(owned.body)).toBe(200)
    const tuesday = nextWeekday(addDays(today, 7), 'TU')
    const wednesday = addDays(tuesday, 1)

    // --- Entry: a registered and an unregistered renter ---
    const registered = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(tuesday, '08:00')),
    )
    expect(registered.status, JSON.stringify(registered.body)).toBe(201)
    const registeredId = String(registered.body?.id)
    const registeredCharge = String(registered.body?.chargeId)
    expect(await getCharge(request, admin, registeredCharge)).toMatchObject({
      sourceType: 'rental',
      sourceId: registeredId,
      payeeInstitution: { id: owner, name: 'Gmina Przykładowo' },
      payerInstitution: { id: setup.neighbours },
      description: description(zoneInstant(tuesday, '08:00'), '08:00', '09:30'),
      dueDate: zoneDate(String(registered.body?.paymentDeadline)),
      amount: 25_000,
      status: 'open',
    })
    const unregistered = await postRental(request, admin, {
      ...phoneRental(setup.pitch, setup.neighbours, zoneInstant(tuesday, '09:30')),
      renterType: 'unregistered',
      renterId: undefined,
      renterDisplayName: 'Drużyna Podwórkowa',
    })
    expect(unregistered.status, JSON.stringify(unregistered.body)).toBe(201)
    const unregisteredId = String(unregistered.body?.id)
    const unregisteredCharge = String(unregistered.body?.chargeId)
    expect(await getCharge(request, admin, unregisteredCharge)).toMatchObject({
      payeeInstitution: { id: owner },
      payerInstitution: null,
      payerLabel: 'Drużyna Podwórkowa',
      description: description(zoneInstant(tuesday, '09:30'), '09:30', '11:00'),
    })

    // --- Approval of a request: the same charge ---
    const { id: requestId } = runRequestProbe(club, {
      op: 'seed',
      placeId: setup.pitch,
      startsAt: zoneInstant(tuesday, '11:00'),
      endsAt: zoneInstant(tuesday, '12:30'),
    }) as { id: string }
    const queued = await queuedRequest(request, admin, requestId)
    const approved = await decide(
      request,
      admin,
      requestId,
      'approve',
      { renterType: 'institution', renterId: setup.neighbours },
      queued.updatedAt,
    )
    expect(approved.status, JSON.stringify(approved.body)).toBe(200)
    const approvedRental = await getRental(request, admin, requestId)
    expect(approvedRental).toMatchObject({ status: 'requested', chargeState: 'open' })
    const approvedCharge = String(approvedRental.chargeId)
    expect(await getCharge(request, admin, approvedCharge)).toMatchObject({
      payeeInstitution: { id: owner },
      payerInstitution: { id: setup.neighbours },
      description: description(zoneInstant(tuesday, '11:00'), '11:00', '12:30'),
      dueDate: zoneDate(String(approvedRental.paymentDeadline)),
    })

    // --- Confirm: refused while unpaid, by the partial payment too; the full payment confirms once ---
    const direct = await rentalAction(request, admin, registeredId, 'confirm')
    expect(direct.status, JSON.stringify(direct.body)).toBe(409)
    expect(direct.body).toMatchObject({ code: 'rental_awaits_payment', chargeId: registeredCharge })
    await pay(request, admin, registeredCharge, 10_000)
    await expect.poll(async () => (await getRental(request, admin, registeredId)).chargeState).toBe('partially_paid')
    expect((await rentalAction(request, admin, registeredId, 'confirm')).body?.code).toBe('rental_awaits_payment')
    await pay(request, admin, registeredCharge, 15_000)
    await expect
      .poll(async () => (await getRental(request, admin, registeredId)).status, { timeout: 60_000 })
      .toBe('confirmed')
    expect((await getRental(request, admin, registeredId)).chargeState).toBe('paid')
    // A replayed payment event and a second confirm change nothing (DD-46).
    expect(runChargeProbe(club, { op: 'replay', chargeId: registeredCharge }).confirmedIds).toEqual([])
    expect((await rentalAction(request, admin, registeredId, 'confirm')).body?.code).toBe('invalid_transition')

    // A reversed payment: the rental stays confirmed, its charge is open again.
    const paymentId = await pay(request, admin, unregisteredCharge, 25_000)
    await expect
      .poll(async () => (await getRental(request, admin, unregisteredId)).status, { timeout: 60_000 })
      .toBe('confirmed')
    const paidCharge = await getCharge(request, admin, unregisteredCharge)
    const reversed = await reversePayment(request, admin, paymentId, paidCharge.updatedAt, { reason: 'Zwrot przelewu' })
    expect(reversed.status, JSON.stringify(reversed.body)).toBe(201)
    expect(await getRental(request, admin, unregisteredId)).toMatchObject({ status: 'confirmed', chargeState: 'open' })

    // --- Without the charge service (probe): no charge, confirmed at once, `chargeState: none` ---
    const thursday = addDays(tuesday, 9)
    const without = runChargeProbe(club, {
      op: 'without',
      rental: phoneRental(setup.pitch, setup.neighbours, zoneInstant(thursday, '08:00')),
    })
    expect(without).toMatchObject({ hidden: true, chargeId: null, created: 'requested', confirmed: 'confirmed' })
    const withoutId = String(without.id)
    expect(await getRental(request, admin, withoutId)).toMatchObject({ chargeId: null, chargeState: 'none' })

    // --- Move (#221 L2): the unpaid charge follows the new date; another place re-quotes the amount and the charge ---
    const beforeMove = await getRental(request, admin, requestId)
    const movedCharged = await rentalAction(request, admin, requestId, 'move', {
      startsAt: zoneInstant(wednesday, '08:00'),
    })
    expect(movedCharged.status, JSON.stringify(movedCharged.body)).toBe(200)
    const afterMove = await getRental(request, admin, requestId)
    expect(afterMove.amount).toBe(beforeMove.amount)
    expect(afterMove.paymentDeadline).not.toBe(beforeMove.paymentDeadline)
    expect(await getCharge(request, admin, approvedCharge)).toMatchObject({
      amount: beforeMove.amount,
      dueDate: zoneDate(String(afterMove.paymentDeadline)),
      description: description(zoneInstant(wednesday, '08:00'), '08:00', '09:30'),
      status: 'open',
    })
    // Boisko B has its own external rate and no owner; Boisko C has no rate at all.
    const pitchB = await create(request, admin, 'places', { name: 'Boisko B', kind: 'pitch' })
    await setOpeningHours(request, admin, pitchB, ORLIK_HOURS)
    const pitchBWindows = await bulkAvailability(request, admin, {
      placeIds: [pitchB],
      mode: 'replace',
      validFrom: today,
      windows: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, from: '08:00', to: '16:00' })),
    })
    expect(pitchBWindows.status, JSON.stringify(pitchBWindows.body)).toBe(200)
    const pitchBRate = await postRate(request, admin, {
      placeId: pitchB,
      validFrom: today,
      renterCategory: 'external_commercial',
      pricePer90: 30_000,
    })
    expect(pitchBRate.status, JSON.stringify(pitchBRate.body)).toBe(201)
    const pitchC = await create(request, admin, 'places', { name: 'Boisko C', kind: 'pitch' })
    const noRate = await rentalAction(request, admin, requestId, 'move', {
      placeId: pitchC,
      startsAt: zoneInstant(wednesday, '09:30'),
    })
    expect(noRate.status, JSON.stringify(noRate.body)).toBe(422)
    expect(noRate.body?.code).toBe('rental_rate_missing')
    const toB = await rentalAction(request, admin, requestId, 'move', {
      placeId: pitchB,
      startsAt: zoneInstant(wednesday, '09:30'),
    })
    expect(toB.status, JSON.stringify(toB.body)).toBe(200)
    const onB = await getRental(request, admin, requestId)
    expect(onB).toMatchObject({ placeId: pitchB, amount: 30_000, chargeState: 'open' })
    expect(await getCharge(request, admin, approvedCharge)).toMatchObject({
      amount: 30_000,
      payeeInstitution: null,
      dueDate: zoneDate(String(onB.paymentDeadline)),
      description: description(zoneInstant(wednesday, '09:30'), '09:30', '11:00', 'Boisko B'),
    })
    // A charge that held a payment (reversed since) keeps its terms, and so does its rental.
    const heldBefore = await getRental(request, admin, unregisteredId)
    const heldCharge = await getCharge(request, admin, unregisteredCharge)
    const movedHeld = await rentalAction(request, admin, unregisteredId, 'move', {
      placeId: pitchB,
      startsAt: zoneInstant(wednesday, '11:00'),
    })
    expect(movedHeld.status, JSON.stringify(movedHeld.body)).toBe(200)
    expect(await getRental(request, admin, unregisteredId)).toMatchObject({
      placeId: pitchB,
      amount: heldBefore.amount,
      paymentDeadline: heldBefore.paymentDeadline,
    })
    expect(await getCharge(request, admin, unregisteredCharge)).toMatchObject({
      amount: heldCharge.amount,
      dueDate: heldCharge.dueDate,
      description: heldCharge.description,
    })
    const beforePlain = await getRental(request, admin, withoutId)
    const movedPlain = await rentalAction(request, admin, withoutId, 'move', {
      startsAt: zoneInstant(addDays(thursday, 1), '08:00'),
    })
    expect(movedPlain.status, JSON.stringify(movedPlain.body)).toBe(200)
    const afterPlain = await getRental(request, admin, withoutId)
    expect(afterPlain.amount).toBe(beforePlain.amount)
    expect(afterPlain.paymentDeadline).not.toBe(beforePlain.paymentDeadline)

    // --- Cancel: free → the charge is cancelled; late → forfeited ---
    const free = await rentalAction(request, admin, requestId, 'cancel', { reason: 'Rezygnacja' })
    expect(free.body?.status).toBe('cancelled_free')
    expect((await getCharge(request, admin, approvedCharge)).status).toBe('cancelled')
    const soon = await postRental(request, admin, phoneRental(setup.pitch, setup.neighbours, soonStart()))
    expect(soon.status, JSON.stringify(soon.body)).toBe(201)
    const late = await rentalAction(request, admin, String(soon.body?.id), 'cancel')
    expect(late.body?.status).toBe('cancelled_late')
    expect((await getCharge(request, admin, String(soon.body?.chargeId))).status).toBe('forfeited')

    // --- Owner report: the owner, and the source of the payments figure ---
    const partly = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(tuesday, '13:00')),
    )
    expect(partly.status, JSON.stringify(partly.body)).toBe(201)
    await pay(request, admin, String(partly.body?.chargeId), 5_000)
    await expect
      .poll(async () => (await getRental(request, admin, String(partly.body?.id))).chargeState)
      .toBe('partially_paid')
    const charges = await ownerReport(request, admin, setup.pitch, tuesday, tuesday)
    expect(charges.status, JSON.stringify(charges.body)).toBe(200)
    // Tuesday: the paid registered rental counts; the open (reversed) and the partly paid charges do not.
    expect(charges.body).toMatchObject({
      owner: { institutionId: owner, name: 'Gmina Przykładowo' },
      payments: { amount: 25_000, count: 1, source: 'charges', partiallyPaidCount: 1 },
    })
    const register = await ownerReport(request, admin, setup.pitch, addDays(thursday, 1), addDays(thursday, 1))
    expect(register.body?.payments).toEqual({
      amount: 25_000,
      count: 1,
      source: 'rental_register',
      partiallyPaidCount: 0,
    })
    const mixed = await ownerReport(request, admin, setup.pitch, tuesday, addDays(thursday, 1))
    expect(mixed.body?.payments).toEqual({ amount: 50_000, count: 2, source: 'mixed', partiallyPaidCount: 1 })

    // --- B-24: "Confirm payment" of an unpaid rental opens its charge; without a charge, "rental register" ---
    await signInBrowserContext(page.request, club.tenant.email, club.tenant.password)
    await page.goto('/backend/facilities/rentals?status=all')
    const confirmLink = page.getByTestId(`facilities-rental-confirm-${String(partly.body?.id)}`)
    await expect(confirmLink).toHaveAttribute('href', `/backend/payments/charges/${String(partly.body?.chargeId)}`)
    const plainRow = page.getByRole('row').filter({ has: page.getByTestId(`facilities-rental-open-${withoutId}`) })
    await expect(plainRow).toContainText(uiText('facilities.rentals.chargeState.none'))
  } finally {
    await club.cleanup()
  }
})
