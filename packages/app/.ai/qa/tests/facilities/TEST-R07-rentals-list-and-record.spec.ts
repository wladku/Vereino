import { expect, test } from '@playwright/test'
import { addDays, nextWeekday, weekdayOf, zoneInstant } from '../_fixtures/activities'
import { prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { calendarDate, createClub } from '../_fixtures/club'
import { confirmationToken, requestForm, submitRequest, verifyRequest } from '../_fixtures/facility-requests'
import { listRentals, postClosure, postRental, readRental, rentalAction } from '../_fixtures/facilities'
import { publicPitch } from '../_fixtures/public-places'
import { uiText } from '../_fixtures/ui-text'

// Issue #279 (E11-S05), facilities parity spec REQ-R04, REQ-R05, AC-R03, TEST-R07: given rentals in every status — one
// flagged by a closure, one unpaid past its deadline, one pending request — the administrator walks the B-24 tabs and
// perspectives and reloads: the address keeps tab and view; "Decide" on the pending row opens B-25; a row opens the
// rental page with every saved field. A purpose entered in the "New rental" dialog is on the rental page and is
// corrected there; "Confirm payment" and "Cancel" from the page update it.
test.describe.configure({ timeout: 400_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

/** A bookable start within the next day (weekdays 08:00–14:30, weekends 09:00–19:00), at least 30 minutes away. */
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

test('TEST-R07 B-24 tabs and views in the address, Decide, the rental page with its edit and actions', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-r07-rentals')
  try {
    const admin = club.adminToken
    const slug = `test-r07-${club.tenant.organizationId.slice(0, 8)}`
    const setup = await publicPitch(request, club, slug)
    // Three weeks ahead, clear of the entries `publicPitch` makes within the next two weeks.
    const week = addDays(calendarDate(), 21)
    const tuesday = nextWeekday(week, 'TU')
    const wednesday = nextWeekday(week, 'WE')
    const friday = nextWeekday(week, 'FR')
    const enter = async (name: string, startsAt: string) => {
      const created = await postRental(request, admin, {
        placeId: setup.pitch,
        renterType: 'unregistered',
        renterDisplayName: name,
        renterCategory: 'external_commercial',
        startsAt,
        units: 1,
        contactName: `Kontakt ${name}`,
        contactPhone: '600 000 007',
        requestedVia: 'phone',
        regulationsAccepted: true,
      })
      expect(created.status, JSON.stringify(created.body)).toBe(201)
      return String(created.body?.id)
    }
    const requested = await enter('Najemca Wtorek', zoneInstant(tuesday, '08:00'))
    const confirmed = await enter('Najemca Potwierdzony', zoneInstant(tuesday, '11:00'))
    expect((await rentalAction(request, admin, confirmed, 'confirm')).status).toBe(200)
    const cancelled = await enter('Najemca Odwołany', zoneInstant(tuesday, '13:00'))
    expect((await rentalAction(request, admin, cancelled, 'cancel')).status).toBe(200)
    const flagged = await enter('Najemca Do Przeniesienia', zoneInstant(wednesday, '08:00'))
    const closure = await postClosure(request, admin, {
      placeId: setup.pitch,
      startsAt: zoneInstant(wednesday, '07:00'),
      endsAt: zoneInstant(wednesday, '10:00'),
      reason: 'municipal_event',
    })
    expect(closure.body?.flagged?.rentals, JSON.stringify(closure.body)).toBe(1)
    // Entered within a day of its start, its payment deadline is the entry itself: unpaid past the deadline at once.
    const unpaid = await enter('Najemca Nieopłacony', soonStart())
    // A pending request: submitted and confirmed by e-mail, so it waits for the administrator (B-25).
    const guest = `r07-${club.tenant.organizationId.slice(0, 8)}@example.test`
    const submitted = await submitRequest(slug, setup.placeSlug, requestForm(zoneInstant(friday, '08:00'), guest))
    expect(submitted.status, submitted.text).toBe(202)
    const verified = await verifyRequest(await confirmationToken(guest))
    expect(verified.status, verified.text).toBe(200)
    const pending = (await listRentals(request, admin, '&tab=awaiting_approval')).find(
      (rental) => rental.startsAt === new Date(zoneInstant(friday, '08:00')).toISOString(),
    )
    if (!pending) throw new Error('[internal] the confirmed request is not awaiting approval')
    expect((await listRentals(request, admin, '&view=unpaid')).map((row) => row.id)).toEqual([unpaid])

    const login = await page.request.post('/api/auth/login', {
      form: { email: club.tenant.email, password: club.tenant.password },
    })
    expect(login.ok(), `POST /api/auth/login ${String(login.status())}`).toBe(true)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await prepareForAccessibilityScan(page)
    const row = (id: string) => page.getByTestId(`facilities-rental-open-${id}`)
    const tab = (key: string) => page.getByRole('tab', { name: uiText(key, { exact: true }) })

    // Active (default): the rentals holding a slot; the cancelled one and the pending request are elsewhere.
    await page.goto('/backend/facilities/rentals')
    for (const id of [requested, confirmed, flagged, unpaid]) await expect(row(id)).toBeVisible()
    await expect(row(cancelled)).toHaveCount(0)
    await expect(row(pending.id)).toHaveCount(0)
    await expect(page.getByTestId(`facilities-rental-confirm-${requested}`)).toBeVisible()
    await expect(page.getByTestId(`facilities-rental-cancel-${confirmed}`)).toBeVisible()
    await expect(page.getByTestId(`facilities-rental-confirm-${confirmed}`)).toHaveCount(0)
    expect(await scanBlockingViolations(page, testInfo, { platformBaseline: true })).toEqual([])

    // Awaiting approval → the address; "Decide" opens B-25.
    await tab('facilities.rentals.tabs.awaiting_approval').click()
    await expect(page).toHaveURL(/status=pending_approval/)
    await expect(row(pending.id)).toBeVisible()
    await page.reload()
    await expect(tab('facilities.rentals.tabs.awaiting_approval')).toHaveAttribute('aria-selected', 'true')
    await page.getByTestId(`facilities-rental-decision-${pending.id}`).click()
    await expect(page).toHaveURL(/\/backend\/facilities\/requests/)

    // All, then the perspectives; each survives a reload.
    await page.goto('/backend/facilities/rentals?status=all')
    await expect(row(cancelled)).toBeVisible()
    await page.getByTestId('facilities-rentals-view-to_move').click()
    await expect(page).toHaveURL(/view=to_move/)
    await expect(page).toHaveURL(/status=all/)
    await expect(row(flagged)).toBeVisible()
    await expect(row(requested)).toHaveCount(0)
    await page.reload()
    await expect(tab('facilities.rentals.tabs.all')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('facilities-rentals-view-to_move')).toHaveAttribute('aria-pressed', 'true')
    await expect(row(flagged)).toBeVisible()
    await page.getByTestId('facilities-rentals-view-unpaid').click()
    await expect(page).toHaveURL(/view=unpaid/)
    await expect(row(unpaid)).toBeVisible()
    await expect(row(flagged)).toHaveCount(0)

    // "New rental" from B-23 with a purpose; the purpose is on the rental page and is corrected there.
    const thursday = nextWeekday(week, 'TH')
    await page.goto(`/backend/facilities/calendar?place=${setup.pitch}&date=${thursday}`)
    await page.waitForLoadState('networkidle')
    await page.locator('[data-testid^="facilities-axis-hour-"]').first().click()
    const dialog = page.getByTestId('facilities-rental-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('facilities-rental-date').fill(thursday)
    await dialog.getByTestId('facilities-rental-time').fill('08:00')
    await dialog
      .getByTestId('facilities-rental-renter-type')
      .getByText(uiText('facilities.rentals.renterType.unregistered', { exact: true }))
      .click()
    await dialog.getByTestId('facilities-rental-renter-name').fill('Drużyna Celowa')
    await dialog.getByTestId('facilities-rental-category').click()
    await page
      .getByRole('option', { name: uiText('facilities.rates.category.external_commercial', { exact: true }) })
      .click()
    await dialog.getByTestId('facilities-rental-contact-phone').fill('600 000 008')
    await dialog.getByTestId('facilities-rental-purpose').fill('Turniej szóstek')
    await dialog.getByTestId('facilities-rental-save').click()
    await expect(dialog).toBeHidden()
    const entered = (await listRentals(request, admin, '&tab=active')).find(
      (rental) => rental.renterDisplayName === 'Drużyna Celowa',
    )
    expect(entered?.purpose).toBe('Turniej szóstek')
    const enteredId = String(entered?.id)

    // The row opens the rental page with every saved field.
    await page.goto('/backend/facilities/rentals?status=all')
    await row(enteredId).click()
    await expect(page).toHaveURL(new RegExp(`/backend/facilities/rentals/${enteredId}$`))
    const record = page.getByTestId('facilities-rental-record')
    await expect(page.getByTestId('facilities-rental-record-renter-name')).toHaveText('Drużyna Celowa')
    await expect(page.getByTestId('facilities-rental-record-slot')).toContainText(`${thursday} 08:00–09:30`)
    const form = page.getByTestId('facilities-rental-record-form')
    await expect(form.locator('[data-crud-field-id="purpose"] input')).toHaveValue('Turniej szóstek')
    await expect(form.locator('[data-crud-field-id="contactPhone"] input')).toHaveValue('600 000 008')
    await expect(page.getByTestId('facilities-rental-record-money')).toContainText('250')
    await expect(page.getByTestId('facilities-rental-record-money')).toContainText(
      uiText('facilities.rentals.payee.club'),
    )
    await expect(page.getByTestId('facilities-rental-record-history')).toContainText(
      uiText('facilities.rentals.requestedVia.phone'),
    )
    expect(await scanBlockingViolations(page, testInfo, { platformBaseline: true })).toEqual([])

    await form.locator('[data-crud-field-id="purpose"] input').fill('Turniej szóstek — finał')
    await form.locator('[data-crud-field-id="notes"] textarea').fill('Dwie bramki')
    await form.getByRole('button', { name: uiText('facilities.rentals.record.save', { exact: true }) }).click()
    await expect
      .poll(async () => (await readRental(request, admin, enteredId))?.purpose)
      .toBe('Turniej szóstek — finał')
    expect((await readRental(request, admin, enteredId))?.notes).toBe('Dwie bramki')

    // The actions from the page update it: Confirm payment, then Cancel.
    await page.getByTestId('facilities-rental-record-confirm').click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: uiText('facilities.rentals.actions.confirm', { exact: true }) })
      .click()
    await expect(record.getByText(uiText('facilities.rentals.status.confirmed', { exact: true }))).toBeVisible()
    await expect(page.getByTestId('facilities-rental-record-confirm')).toHaveCount(0)
    await page.getByTestId('facilities-rental-record-cancel').click()
    await page.getByTestId('facilities-rental-cancel-confirm').click()
    await expect(record.getByText(uiText('facilities.rentals.status.cancelled_free', { exact: true }))).toBeVisible()
    // A cancelled rental keeps only its notes editable.
    await expect(page.getByTestId('facilities-rental-record-closed')).toBeVisible()
    await expect(form.locator('[data-crud-field-id="purpose"]')).toHaveCount(0)
    expect(consoleErrors).toEqual([])
  } finally {
    await club.cleanup()
  }
})
