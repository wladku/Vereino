import { expect, test } from '@playwright/test'
import { addDays, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { postInternalBooking, rentalPitch } from '../_fixtures/facilities'
import { addMembership, signedInStaff } from '../_fixtures/groups'
import { signInBrowserContext } from '../_fixtures/auth'

// TEST-W06 (calendar range switch spec REQ-W05, DD-W05, DD-W06, AC-W04; D-040; #784): the facility calendar B-23 and
// a place's page M-11 offer Day / Week / Month. On a desktop B-23 opens on Week: seven day axes side by side, the
// legend once, each day's heading opening that Day, and a free hour opening the slot dialog with that day; Month is a
// list of the days that have entries, each linking to its Day. On a phone M-11 lists a week's and a month's days with
// entries, and an entry opens its details. Light and dark pass an axe scan; no sideways page scroll at 375 px.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

test('TEST-W06 B-23 week axes and month list, M-11 week and month lists on a phone', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-w06-facility-range')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const pitch = setup.pitch
    const today = calendarDate()
    const saturday = nextWeekday(addDays(today, 7), 'SA')
    const monday = addDays(saturday, -5)
    const booking = await postInternalBooking(request, setup.coordinator, {
      placeId: pitch,
      startsAt: zoneInstant(saturday, '15:00'),
      endsAt: zoneInstant(saturday, '16:30'),
      sectionId: setup.academy,
      purpose: 'Trening bramkarzy W06',
    })
    expect(booking.status, JSON.stringify(booking.body)).toBe(201)
    const bookingId = String(booking.body?.id)

    await signInBrowserContext(page.request, club.tenant.email, club.tenant.password)
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    const range = page.getByTestId('facilities-calendar-range')

    // B-23 on a desktop opens on Week; an old `?date=` link opens the week holding it (DD-W08).
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/backend/facilities/calendar?place=${pitch}&date=${saturday}`)
    await expect(range).toHaveAttribute('data-range', 'week')
    const axes = page.getByTestId('facilities-week-axes')
    await expect(axes).toBeVisible()
    await expect(axes.getByTestId('facilities-axis-legend')).toHaveCount(1)
    await expect(axes.locator('[data-testid^="facilities-week-day-open-"]')).toHaveCount(7)
    await expect(page.getByTestId(`facilities-week-day-open-${monday}`)).toBeVisible()
    // The booking on Saturday's axis; every axis on one hour scale.
    const saturdayColumn = page.getByTestId(`facilities-week-day-${saturday}`)
    await expect(saturdayColumn.getByTestId(`facilities-axis-entry-${bookingId}`)).toBeVisible()
    const scales = await axes
      .getByTestId('facilities-axis')
      .evaluateAll((all) =>
        all.map((axis) => `${axis.getAttribute('data-from') ?? ''}-${axis.getAttribute('data-to') ?? ''}`),
      )
    expect(new Set(scales).size).toBe(1)
    // A free hour of Saturday opens the slot dialog on Saturday.
    await saturdayColumn.getByTestId('facilities-axis-hour-09:00').click()
    const dialog = page.getByTestId('facilities-slot-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('facilities-slot-start')).toHaveValue('09:00')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    const desktopViolations = await scanInColorSchemes(page, testInfo, 'B-23 week', async () => {
      await expect(axes).toBeVisible()
    })
    expect(desktopViolations).toEqual({})
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    // A day's heading opens its Day with the chips.
    await page.getByTestId(`facilities-week-day-open-${saturday}`).click()
    await expect(page).toHaveURL(new RegExp(`range=day&date=${saturday}`))
    await expect(range).toHaveAttribute('data-range', 'day')
    await expect(page.getByTestId('facilities-day-axis')).toBeVisible()
    await expect(page.getByTestId('facilities-calendar-day')).toBeVisible()

    // Month: the list of days with entries; a day's heading opens its Day.
    await page.getByTestId('facilities-calendar-range-view-month').click()
    await expect(page).toHaveURL(new RegExp(`range=month&date=${saturday}`))
    const day = page.locator(`[data-testid="facilities-range-day"][data-date="${saturday}"]`)
    await expect(day.getByTestId(`facilities-day-entry-${bookingId}`)).toContainText('Trening bramkarzy W06')
    await expect(page.getByTestId('facilities-calendar-day')).toHaveCount(0)
    await day.getByTestId(`facilities-range-day-open-${saturday}`).click()
    await expect(range).toHaveAttribute('data-range', 'day')

    // B-23 Week below `lg`: the list of days.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/backend/facilities/calendar?place=${pitch}&range=week&date=${saturday}`)
    await expect(page.getByTestId('facilities-week-axes')).toHaveCount(0)
    await expect(page.getByTestId('facilities-range-list')).toBeVisible()
    await expectNoPageOverflow(page)

    // M-11 on a phone as a coach of Żaki: Day by default; Week and Month list the days with entries.
    const coach = await signedInStaff(request, club, { firstName: 'Rafał', lastName: 'Trener', role: 'coach' })
    await addMembership(request, admin, {
      groupId: setup.zaki,
      personId: coach.personId,
      role: 'coach',
      validFrom: addDays(today, -30),
    })
    await signInBrowser(page, request, club, coach.userId, coach.email)
    await page.setViewportSize({ width: 375, height: 812 })
    const placeRange = page.getByTestId('club-place-range')
    await page.goto(`/club/places/${pitch}?date=${saturday}`)
    await expect(placeRange).toHaveAttribute('data-range', 'day')
    await expect(page.getByTestId('facilities-day-axis')).toBeVisible()
    await page.getByTestId('club-place-range-view-week').click()
    await expect(placeRange).toHaveAttribute('data-range', 'week')
    expect(new URL(page.url()).searchParams.get('range')).toBe('week')
    expect(new URL(page.url()).searchParams.get('date')).toBe(saturday)
    const weekDay = page.locator(`[data-testid="facilities-range-day"][data-date="${saturday}"]`)
    await expect(weekDay).toBeVisible()
    await weekDay.getByTestId(`facilities-day-entry-open-details-${bookingId}`).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByTestId('club-place-range-view-month').click()
    await expect(placeRange).toHaveAttribute('data-range', 'month')
    await expect(page.locator(`[data-testid="facilities-range-day"][data-date="${saturday}"]`)).toBeVisible()
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const phoneViolations = await scanInColorSchemes(page, testInfo, 'M-11 month', async () => {
      await expect(page.getByTestId('facilities-range-list')).toBeVisible()
    })
    expect(phoneViolations).toEqual({})
    expect(consoleErrors).toEqual([])
  } finally {
    await club.cleanup()
  }
})
