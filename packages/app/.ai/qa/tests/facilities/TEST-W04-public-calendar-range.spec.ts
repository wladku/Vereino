import { expect, test, type Page } from '@playwright/test'
import { addDays } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { calendarDate, createClub } from '../_fixtures/club'
import { publicPitch } from '../_fixtures/public-places'
import { uiText } from '../_fixtures/ui-text'

// TEST-W04 (calendar range switch spec REQ-W04, DD-W03, DD-W05, DD-W08, AC-W01, AC-W03; #784): the public facility
// calendar P-04 with the shared Day / Week / Month switch. A phone opens on Day (today), a desktop on Week; the view
// and the day live in the address, so a reload and a copied link reopen them. Day lists the day's stretches with
// "Request a booking"; Week is a list of the week's days on a phone and one row of seven cells from `md`, with the
// request button too; "Earlier", "Today" and "Later" move by the view's unit; an old `?month=` link opens that month.
// Light and dark pass an axe scan; the page does not scroll sideways at 375 px.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

async function setGuestLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

/** The Monday of the week of `date`. */
function mondayOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, -((weekday + 6) % 7))
}

test('TEST-W04 P-04 Day / Week / Month: phone Day and desktop Week defaults, address state, request buttons, old month link', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-w04-public-range')
  try {
    const slug = `test-w04-${club.tenant.organizationId.slice(0, 8)}`
    const setup = await publicPitch(request, club, slug)
    const path = `/p/${slug}/places/${setup.placeSlug}`
    const today = calendarDate()
    const switcher = page.getByTestId('public-schedule-switch')

    page.setDefaultTimeout(30_000)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await prepareForAccessibilityScan(page)
    await setGuestLocale(page, 'en')

    // A phone opens on Day, today; the switch reads Day / Week / Month with Day current.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(path)
    await expect(switcher).toHaveAttribute('data-range', 'day')
    await expect(switcher).toHaveAttribute('data-date', today)
    await expect(page.getByTestId('public-schedule-switch-view-day')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('public-schedule-switch-view-day')).toHaveText(uiText('facilities.rangeSwitch.day'))
    await expect(page.getByTestId('public-schedule-switch-view-week')).toHaveText(uiText('facilities.rangeSwitch.week'))
    await expect(page.getByTestId('public-schedule-switch-view-month')).toHaveText(
      uiText('facilities.rangeSwitch.month'),
    )
    await expect(page.getByTestId(`public-schedule-day-${today}`)).toHaveAttribute('aria-current', 'date')
    await expect(page.getByTestId('public-schedule-switch-today')).toHaveCount(0)

    // The fixture's day: its stretches and a request button.
    await page.goto(`${path}?range=day&date=${setup.day}`)
    const day = page.getByTestId(`public-schedule-day-${setup.day}`)
    await expect(day).toContainText('Taken by the club')
    await expect(day).toContainText('Booked')
    await expect(day).toContainText('Requested — pending')
    await expect(day.locator(`[data-testid^="public-request-open-${setup.day}-"]`).first()).toBeVisible()
    await page.getByTestId('public-schedule-switch-next').click()
    await expect(page).toHaveURL(new RegExp(`range=day&date=${setup.closedDay}`))
    await expect(page.getByTestId(`public-schedule-day-${setup.closedDay}`)).toContainText('Closed')
    await page.getByTestId('public-schedule-switch-today').click()
    await expect(switcher).toHaveAttribute('data-date', today)

    // Week on a phone: the list of the week's days, the request button on the fixture's day.
    await page.goto(`${path}?range=day&date=${setup.day}`)
    await page.getByTestId('public-schedule-switch-view-week').click()
    await expect(page).toHaveURL(new RegExp(`range=week&date=${setup.day}`))
    const list = page.getByTestId('public-schedule-list')
    await expect(list).toBeVisible()
    await expect(page.getByTestId('public-schedule-grid')).toBeHidden()
    await expect(list.getByTestId(`public-schedule-day-${setup.day}`)).toContainText('Booked')
    await expect(list.getByTestId(`public-schedule-day-${setup.closedDay}`)).toContainText('Closed')
    await expect(list.locator(`[data-testid^="public-request-open-${setup.day}-"]`).first()).toBeVisible()
    await expect(page.getByTestId('public-schedule-switch-range')).toBeVisible()
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations = await scanInColorSchemes(page, testInfo, 'P-04 week phone', async () => {
      await expect(list).toBeVisible()
    })
    expect(violations).toEqual({})
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

    // A reload and the back button keep the view; "Earlier" moves a whole week.
    await page.reload()
    await expect(switcher).toHaveAttribute('data-range', 'week')
    await page.getByTestId('public-schedule-switch-previous').click()
    await expect(switcher).toHaveAttribute('data-date', addDays(setup.day, -7))
    await page.goBack()
    await expect(switcher).toHaveAttribute('data-range', 'day')

    // Month on a phone: the list of the month.
    await page.goto(`${path}?range=week&date=${setup.day}`)
    await page.getByTestId('public-schedule-switch-view-month').click()
    await expect(switcher).toHaveAttribute('data-range', 'month')
    await expect(page.getByTestId('public-schedule-list')).toBeVisible()

    // A desktop opens on Week: one row of seven cells, Monday first.
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(path)
    await expect(switcher).toHaveAttribute('data-range', 'week')
    const grid = page.getByTestId('public-schedule-grid')
    await expect(grid).toBeVisible()
    await expect(page.getByTestId(`public-schedule-cell-${mondayOf(today)}`)).toBeVisible()
    await expect(grid.locator('[data-testid^="public-schedule-cell-"]')).toHaveCount(7)
    // The fixture's week from a copied link: the cells with their states and the request button.
    await page.goto(`${path}?range=week&date=${setup.day}`)
    const cell = page.getByTestId(`public-schedule-cell-${setup.day}`)
    await expect(cell).toContainText('Taken by the club')
    await expect(cell.locator(`[data-testid^="public-request-open-${setup.day}-"]`).first()).toBeVisible()
    await expect(page.getByTestId(`public-schedule-cell-${setup.closedDay}`)).toContainText('Closed')
    const desktop = await scanInColorSchemes(page, testInfo, 'P-04 week desktop', async () => {
      await expect(cell).toBeVisible()
    })
    expect(desktop).toEqual({})
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

    // An old `?month=` permalink still opens that month.
    await page.goto(`${path}?month=${setup.month}`)
    await expect(switcher).toHaveAttribute('data-range', 'month')
    await expect(page.getByTestId(`public-schedule-cell-${setup.day}`)).toContainText('Booked')

    // Polish: the same switch in Polish.
    await setGuestLocale(page, 'pl')
    await page.goto(`${path}?range=week&date=${setup.day}`)
    await expect(page.getByTestId('public-schedule-switch-view-week')).toHaveText('Tydzień')
    await expect(page.getByTestId(`public-schedule-cell-${setup.day}`)).toContainText('Zajęte przez klub')
    expect(consoleErrors).toEqual([])
  } finally {
    await club.cleanup()
  }
})
