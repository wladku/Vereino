import { expect, test } from '@playwright/test'
import { addDays, nextWeekday, weekdayOf, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { calendarDate, createClub } from '../_fixtures/club'
import { listRentals, phoneRental, postRental, rentalPitch } from '../_fixtures/facilities'

// Issue #122 (E08-S02; README B-23, B-24, flow F-10): the club administrator's rental pages. B-24 lists rentals in the
// Active tab and has no critical or serious axe violation outside the platform baseline and reflows at 320 px; from
// a "bookable" slot of the B-23 calendar the administrator enters a rental for an unregistered renter, sees the live
// quote with the amount and the deadlines, and saves it; cancelling a rental less than 24 h before its start states
// in the dialog that the charge is forfeited. B-24 renders in Polish at 375 px.
test.describe.configure({ timeout: 300_000 })

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
    const later = await postRental(
      request,
      admin,
      phoneRental(
        setup.pitch,
        setup.neighbours,
        zoneInstant(nextWeekday(addDays(calendarDate(), 7), 'WE'), '08:00'),
        2,
      ),
    )
    expect(later.status, JSON.stringify(later.body)).toBe(201)
    const soon = await postRental(request, admin, phoneRental(setup.pitch, setup.neighbours, soonStart()))
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
    expect(await scanBlockingViolations(page, testInfo, { platformBaseline: true })).toEqual([])
    await page.setViewportSize({ width: 320, height: 800 })
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 1280, height: 800 })

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

    // B-23: "New rental" from a bookable slot, the live quote, save.
    await page.goto('/backend/facilities/calendar')
    await page.waitForLoadState('networkidle')
    await page.locator('[data-testid^="facilities-calendar-new-rental-"]').first().click()
    const dialog = page.getByTestId('facilities-rental-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('facilities-rental-renter-type').getByText('Unregistered').click()
    await dialog.getByTestId('facilities-rental-renter-name').fill('Drużyna Firmowa')
    await dialog.getByTestId('facilities-rental-category').click()
    await page.getByRole('option', { name: 'Municipal club', exact: true }).click()
    await dialog.getByTestId('facilities-rental-contact-phone').fill('600 000 002')
    await dialog.getByTestId('facilities-rental-regulations').click()
    // A municipal club is quoted the winter-lighting rate (all-year season in the fixture): 180 zł for one unit.
    await expect(dialog.getByTestId('facilities-rental-quote-amount')).toContainText('180')
    await expect(dialog.getByTestId('facilities-rental-quote-payment-deadline')).not.toBeEmpty()
    await expect(dialog.getByTestId('facilities-rental-quote-cancellation-deadline')).not.toBeEmpty()
    await dialog.getByTestId('facilities-rental-save').click()
    await expect(dialog).toBeHidden()
    const entered = (await listRentals(request, admin, '&tab=active')).find(
      (rental) => rental.renterDisplayName === 'Drużyna Firmowa',
    )
    expect(entered).toMatchObject({ renterType: 'unregistered', status: 'requested', contactPhone: '600 000 002' })
    expect(entered?.regulationsAcceptedAt).not.toBeNull()
    await expect(page.getByTestId(`facilities-calendar-rental-${String(entered?.id)}`)).toBeVisible()

    // B-24 in Polish at 375 px.
    await page.setViewportSize({ width: 375, height: 800 })
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
