import { expect, test } from '@playwright/test'
import { addDays, nextWeekday, weekdayOf, zoneDate, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { calendarDate, createClub } from '../_fixtures/club'
import { listRentals, phoneRental, postRental, rentalPitch } from '../_fixtures/facilities'

// Issue #122 (E08-S02; README B-23, B-24, flow F-10): the club administrator's rental pages. B-24 lists rentals in the
// Active tab and has no critical or serious axe violation outside the platform baseline and reflows at 320 px; from
// a "bookable" slot of the B-23 calendar the administrator enters a rental (for next week) for an unregistered renter, sees the live
// quote with the amount and the deadlines, and saves it; cancelling a rental less than 24 h before its start states
// in the dialog that the charge is forfeited. B-24 reflows at 320 px in Polish too.
test.describe.configure({ timeout: 300_000 })
// The browser runs 11 or 12 hours behind the club zone (Europe/Warsaw): a dialog or a list that read wall times in
// the browser's zone would save 08:00 typed in the dialog as an evening slot and label every slot hours off (#221 L3).
test.use({ timezoneId: 'Pacific/Honolulu' })

/** A bookable start within the next day (weekdays 08:00–14:30, weekends 09:00–19:00), at least 30 minutes away. */
function soonStart(): string {
  for (const date of [calendarDate(), calendarDate(1)]) {
    const weekend = ['SA', 'SU'].includes(weekdayOf(date))
    for (let minutes = weekend ? 540 : 480; minutes <= (weekend ? 1140 : 870); minutes += 30) {
      const instant = zoneInstant(
        date,
        `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
      )
      const at = Date.parse(instant)
      if (at >= Date.now() + 1_800_000 && at <= Date.now() + 82_800_000) return instant
    }
  }
  throw new Error('[internal] no bookable start within a day')
}

test('E08-S02 rental pages: B-24 list, new rental from a B-23 slot with the live quote, late cancellation dialog', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e08-s02-pages')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const laterDate = nextWeekday(addDays(calendarDate(), 7), 'WE')
    const later = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(laterDate, '08:00'), 2),
    )
    expect(later.status, JSON.stringify(later.body)).toBe(201)
    const soonAt = soonStart()
    const soon = await postRental(request, admin, phoneRental(setup.pitch, setup.neighbours, soonAt))
    expect(soon.status, JSON.stringify(soon.body)).toBe(201)

    const login = await page.request.post('/api/auth/login', {
      form: { email: club.tenant.email, password: club.tenant.password },
    })
    expect(login.ok(), `POST /api/auth/login ${String(login.status())}`).toBe(true)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await prepareForAccessibilityScan(page)

    // B-24: both rentals in the Active tab; accessibility and reflow.
    await page.goto('/backend/facilities/rentals')
    await page.waitForLoadState('networkidle')
    const table = page.getByTestId('facilities-rentals-table')
    await expect(table).toContainText('KS Sąsiedzi')
    await expect(page.getByTestId(`facilities-rental-actions-${String(soon.body?.id)}`)).toBeVisible()
    // The slot is labelled in the club zone, not the browser's.
    await expect(table).toContainText(`${laterDate} 08:00–`)
    expect(await scanBlockingViolations(page, testInfo, { platformBaseline: true })).toEqual([])
    await page.setViewportSize({ width: 320, height: 800 })
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 1280, height: 800 })

    // Given a saved rental, it appears on the day axis of B-23 and in "Wpisy dnia" (#276).
    const soonDate = zoneDate(soonAt)
    await page.goto(`/backend/facilities/calendar?place=${setup.pitch}&date=${soonDate}`)
    await expect(page.getByTestId(`facilities-axis-entry-${String(soon.body?.id)}`)).toBeVisible()
    await expect(page.getByTestId(`facilities-day-entry-${String(soon.body?.id)}`)).toContainText('KS Sąsiedzi')
    await page.goto('/backend/facilities/rentals')

    // Given a cancellation under 24 h before, the dialog states that the charge is forfeited.
    await page
      .getByTestId(`facilities-rental-actions-${String(soon.body?.id)}`)
      .getByRole('button')
      .click()
    await page.getByRole('menuitem', { name: 'Cancel rental' }).click()
    const cancelDialog = page.getByTestId('facilities-rental-cancel-dialog')
    await expect(cancelDialog).toBeVisible()
    await expect(cancelDialog.getByTestId('facilities-rental-cancel-forfeited')).toContainText(/forfeited/)
    await cancelDialog.getByTestId('facilities-rental-cancel-confirm').click()
    await expect(cancelDialog).toBeHidden()
    await expect.poll(async () => (await listRentals(request, admin, '&status=cancelled_late')).length).toBe(1)

    // B-23: a rental from a free hour of next week's Thursday on the day axis (the slot dialog, #277), the live
    // quote, save.
    const enteredDate = nextWeekday(addDays(calendarDate(), 7), 'TH')
    await page.goto(`/backend/facilities/calendar?place=${setup.pitch}&date=${enteredDate}`)
    await page.waitForLoadState('networkidle')
    await page.locator('[data-testid^="facilities-axis-hour-"]').first().click()
    const dialog = page.getByTestId('facilities-slot-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('facilities-slot-start').fill('08:00')
    await dialog.getByTestId('facilities-slot-renter-mode').click()
    await dialog.getByTestId('facilities-rental-renter-name').fill('Drużyna Firmowa')
    await dialog.getByTestId('facilities-rental-category').click()
    await page.getByRole('option', { name: 'Municipal club', exact: true }).click()
    await dialog.getByTestId('facilities-rental-contact-phone').fill('600 000 002')
    await dialog.getByTestId('facilities-rental-regulations').click()
    // A municipal club is quoted the winter-lighting rate (all-year season in the fixture): 180 zł for one unit.
    await expect(dialog.getByTestId('facilities-rental-quote-amount')).toContainText('180')
    await expect(dialog.getByTestId('facilities-rental-quote-payment-deadline')).not.toBeEmpty()
    await expect(dialog.getByTestId('facilities-rental-quote-cancellation-deadline')).not.toBeEmpty()
    await dialog.getByTestId('facilities-slot-submit').click()
    await expect(dialog).toBeHidden()
    const entered = (await listRentals(request, admin, '&tab=active')).find(
      (rental) => rental.renterDisplayName === 'Drużyna Firmowa',
    )
    expect(entered).toMatchObject({ renterType: 'unregistered', status: 'requested', contactPhone: '600 000 002' })
    expect(entered?.regulationsAcceptedAt).not.toBeNull()
    // 08:00 typed in the dialog is 08:00 in the club zone.
    expect(Date.parse(String(entered?.startsAt))).toBe(Date.parse(zoneInstant(enteredDate, '08:00')))

    // B-24 in Polish (the longer locale) reflows at 320 px.
    await page.setViewportSize({ width: 320, height: 800 })
    await page.context().addCookies([{ name: 'locale', value: 'pl', url: new URL(page.url()).origin }])
    await page.goto('/backend/facilities/rentals')
    await expect(page.getByTestId('facilities-rentals-tabs').getByRole('tablist')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Aktywne' })).toBeVisible()
    await expectNoPageOverflow(page)
    expect(consoleErrors).toEqual([])
  } finally {
    await club.cleanup()
  }
})
