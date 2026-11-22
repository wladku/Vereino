import { expect, test } from '@playwright/test'
import { addDays, nextWeekday, weekdayOf, zoneInstant } from '../_fixtures/activities'
import { call, calendarDate, createClub } from '../_fixtures/club'
import { create, getOne, update } from '../_fixtures/club-structure'
import {
  listRentals,
  phoneRental,
  postRental,
  quoteRental,
  readRental,
  rentalPitch,
  runRentalLifecycle,
} from '../_fixtures/facilities'
import { awaitEmails, emailsTo } from '../_fixtures/communication'
import { uniqueAddress } from '../_fixtures/messaging'
import { getCharge, recordPayment } from '../_fixtures/payments'
import { uiText, uiTextIn } from '../_fixtures/ui-text'

// Issue #284 (E11-S10), facilities parity spec phase 10: TEST-R09 and the deadline part of TEST-R01 (REQ-R07, DD-R10,
// DD-R11, AC-R05). A management agreement (`facility_management` contract) with the owner institution of a place
// carries the payment days and the automatic expiry in its encrypted terms: 61 days answers 422
// `contract_terms_invalid` at the field; a rental of the owner's place is due 5 days before its start, a rental of a
// place whose owner has no agreement 3 days before. The lifecycle run cancels the unpaid rental free of charge with the
// reason `unpaid_after_deadline` and its charge cancelled, once; the partly paid rental stays `requested` with its
// charge untouched; the second owner's rental past its deadline stays on B-24's "unpaid" list. Issue #596 (AC-R05):
// the renter of the expired rental gets exactly one "unpaid" cancellation e-mail (#286, #386), none after the second
// run, the partly paid rental's renter none, and the partly paid rental past its deadline is on the "unpaid" list.
test.describe.configure({ timeout: 600_000 })

const DAY = 86_400_000

/**
 * A bookable start within a day and not before `notBefore`: entered then, its payment deadline is the entry itself
 * (TEST-R07).
 */
function soonStart(notBefore = 0): string {
  for (const date of [calendarDate(), calendarDate(1)]) {
    const weekend = ['SA', 'SU'].includes(weekdayOf(date))
    for (let minutes = weekend ? 540 : 480; minutes <= (weekend ? 1140 : 870); minutes += 30) {
      const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
      const at = Date.parse(zoneInstant(date, time))
      if (at >= Math.max(Date.now() + 1_800_000, notBefore) && at <= Date.now() + 82_800_000) {
        return zoneInstant(date, time)
      }
    }
  }
  throw new Error('[internal] no bookable start within a day')
}

/**
 * The longest fixed part of a Polish catalog text (the club's default language, which a staff entry's e-mails use),
 * so a check never depends on the place, the slot or the amount (as in TEST-R17).
 */
function pl(key: string): string {
  return uiTextIn('pl', key)
    .split(/{[^}]+}/)
    .reduce((longest, part) => (part.length > longest.length ? part : longest), '')
}

const CANCELLED = pl('facilities.email.rentalCancelled.subject')

const daysBefore = (startsAt: string, days: number): string => new Date(Date.parse(startsAt) - days * DAY).toISOString()

test('TEST-R09 the agreement sets the payment days; an unpaid rental expires once, a partly paid one stays', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-r09-agreement-terms')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const today = calendarDate()
    const ownerA = await create(request, admin, 'institutions', { name: 'Gmina Przykładowo', type: 'municipality' })
    const ownerB = await create(request, admin, 'institutions', { name: 'Szkoła Podstawowa nr 1', type: 'school' })
    const setOwner = async (ownerInstitutionId: string) => {
      const place = await getOne(request, admin, 'places', setup.pitch)
      const saved = await update(request, admin, 'places', { id: setup.pitch, ownerInstitutionId }, place?.updatedAt)
      expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    }

    // Given terms of 61 days, when the agreement is saved, then 422 `contract_terms_invalid` at the field.
    const agreement = {
      partyType: 'institution',
      partyId: ownerA,
      kind: 'facility_management',
      validFrom: today,
      validTo: null,
    }
    const invalid = await call<{ code?: string; fieldErrors?: Record<string, string> }>(
      request,
      'POST',
      '/api/club_core/contracts',
      admin,
      { data: { ...agreement, terms: { paymentDeadlineDays: 61, autoExpireUnpaid: true } } },
    )
    expect(invalid.status, JSON.stringify(invalid.body)).toBe(422)
    expect(invalid.body?.code).toBe('contract_terms_invalid')
    expect(invalid.body?.fieldErrors?.paymentDeadlineDays).toBeTruthy()
    const saved = await call<{ id?: string }>(request, 'POST', '/api/club_core/contracts', admin, {
      data: { ...agreement, terms: { paymentDeadlineDays: 5, autoExpireUnpaid: true } },
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(201)
    const contractId = String(saved.body?.id)
    const stored = await call<{ items?: { terms: unknown }[] }>(
      request,
      'GET',
      `/api/club_core/contracts?ids=${contractId}`,
      admin,
    )
    expect(stored.body?.items?.[0]?.terms).toEqual({ paymentDeadlineDays: 5, autoExpireUnpaid: true })

    // Given the owner with the 5-day agreement, the quote's "wpłata do" and the rental's deadline are 5 days ahead.
    await setOwner(ownerA)
    const tuesday = nextWeekday(addDays(today, 7), 'TU')
    const first = zoneInstant(tuesday, '08:00')
    const quoted = await quoteRental(request, admin, {
      placeId: setup.pitch,
      renterCategory: 'external_commercial',
      startsAt: first,
      units: 1,
    })
    expect(quoted.status, JSON.stringify(quoted.body)).toBe(200)
    expect(quoted.body?.paymentDeadline).toBe(daysBefore(first, 5))
    const renter = uniqueAddress('renter-r09')
    const expiring = await postRental(request, admin, {
      ...phoneRental(setup.pitch, setup.neighbours, first),
      contactEmail: renter,
    })
    expect(expiring.status, JSON.stringify(expiring.body)).toBe(201)
    const expiringId = String(expiring.body?.id)
    expect(expiring.body?.paymentDeadline).toBe(daysBefore(first, 5))
    // The partly paid rental starts within a day, so its deadline has passed at once and B-24's "unpaid" view (which
    // reads the real clock) lists it below.
    const second = soonStart()
    const partlyRenter = uniqueAddress('renter-r09-partly')
    const partly = await postRental(request, admin, {
      ...phoneRental(setup.pitch, setup.neighbours, second),
      contactEmail: partlyRenter,
    })
    expect(partly.status, JSON.stringify(partly.body)).toBe(201)
    const partlyId = String(partly.body?.id)
    const partlyCharge = String(partly.body?.chargeId)
    const charge = await getCharge(request, admin, partlyCharge)
    const paid = await recordPayment(request, admin, partlyCharge, charge.updatedAt, {
      amount: 10_000,
      method: 'transfer',
      paidOn: today,
    })
    expect(paid.status, JSON.stringify(paid.body)).toBe(201)

    // When the lifecycle runs twice after both deadlines, then the unpaid rental is `cancelled_free` with the reason,
    // once, and its charge cancelled; the partly paid one stays `requested` with its charge untouched. Both deadlines
    // (5 days before the first start, and the entry of the partly paid one) are behind the run's clock.
    const afterFirstOwner = new Date(Date.parse(daysBefore(first, 5)) + 3_600_000).toISOString()
    const run = runRentalLifecycle(club, afterFirstOwner)
    expect(run.expiredIds).toEqual([expiringId])
    expect(run.expired).toBe(1)
    const again = runRentalLifecycle(club, afterFirstOwner)
    expect(again.expiredIds).toEqual([])
    expect(again.expired).toBe(0)
    const expired = await readRental(request, admin, expiringId)
    expect(expired).toMatchObject({ status: 'cancelled_free', decisionReason: 'unpaid_after_deadline' })
    expect((await getCharge(request, admin, String(expiring.body?.chargeId))).status).toBe('cancelled')
    expect((await readRental(request, admin, partlyId))?.status).toBe('requested')
    expect((await getCharge(request, admin, partlyCharge)).status).toBe('partially_paid')

    // The renter of the expired rental gets the "unpaid" cancellation e-mail; the count is checked again at the end,
    // long after the second run, which sends nothing.
    const expiryMail = (await awaitEmails(renter, CANCELLED))[0]
    expect(expiryMail.text).toContain(pl('facilities.email.rentalCancelled.unpaid'))
    expect(emailsTo(renter, CANCELLED)).toHaveLength(1)

    // Given the second owner without an agreement, the deadline is 3 days ahead; a rental entered within a day of its
    // start is due at once, so it is past its deadline right away. Neither expires: that owner has no agreement.
    await setOwner(ownerB)
    const third = zoneInstant(tuesday, '11:00')
    const defaulted = await postRental(request, admin, phoneRental(setup.pitch, setup.neighbours, third))
    expect(defaulted.status, JSON.stringify(defaulted.body)).toBe(201)
    expect(defaulted.body?.paymentDeadline).toBe(daysBefore(third, 3))
    // Three hours after the partly paid rental's start, so the two never share the slot.
    const overdueStart = soonStart(Date.parse(second) + 3 * 3_600_000)
    const overdue = await postRental(request, admin, phoneRental(setup.pitch, setup.neighbours, overdueStart))
    expect(overdue.status, JSON.stringify(overdue.body)).toBe(201)
    const overdueId = String(overdue.body?.id)
    const afterSecondOwner = new Date(Date.parse(daysBefore(third, 3)) + 3_600_000).toISOString()
    expect(runRentalLifecycle(club, afterSecondOwner).expiredIds).toEqual([])
    expect((await readRental(request, admin, String(defaulted.body?.id)))?.status).toBe('requested')

    // Given the second owner's rental and the partly paid rental past their deadlines, B-24's "unpaid" view lists both
    // and neither is cancelled; the expired rental is not on it.
    const unpaid = (await listRentals(request, admin, '&view=unpaid')).map((row) => row.id)
    expect(unpaid).toContain(overdueId)
    expect(unpaid).toContain(partlyId)
    expect(unpaid).not.toContain(expiringId)
    expect((await readRental(request, admin, overdueId))?.status).toBe('requested')

    // The contract form shows the agreement's rental terms; the rental page names the reason of the expiry.
    const login = await page.request.post('/api/auth/login', {
      form: { email: club.tenant.email, password: club.tenant.password },
    })
    expect(login.ok(), `POST /api/auth/login ${String(login.status())}`).toBe(true)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await page.goto(`/backend/club/contracts/${contractId}/edit`)
    await expect(page.getByText(uiText('club_core.contracts.groups.rentalTerms', { exact: true }))).toBeVisible()
    await expect(page.locator('[data-crud-field-id="paymentDeadlineDays"] input')).toHaveValue('5')
    await expect(page.locator('[data-crud-field-id="autoExpireUnpaid"] input[type="checkbox"]')).toBeChecked()
    await expect(page.locator('[data-crud-field-id="baseMonthly"]')).toHaveCount(0)
    await page.goto(`/backend/facilities/rentals/${expiringId}`)
    await expect(page.getByText(uiText('facilities.rentals.record.unpaidAfterDeadline', { exact: true }))).toBeVisible()
    expect(consoleErrors).toEqual([])

    // Still exactly one expiry e-mail after the second run, and none to the renter of the partly paid rental.
    expect(emailsTo(renter, CANCELLED)).toHaveLength(1)
    expect(emailsTo(partlyRenter, CANCELLED)).toHaveLength(0)
  } finally {
    await club.cleanup()
  }
})
