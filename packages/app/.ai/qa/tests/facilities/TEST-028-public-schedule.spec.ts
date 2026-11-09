import { expect, test, type Page } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { createClub } from '../_fixtures/club'
import { publish } from '../_fixtures/publication'
import { PRIVATE_NAMES, publicPitch } from '../_fixtures/public-places'

// Issue #124 (E08-S04), facilities spec P-03, P-04, REQ-014, TEST-028: a guest without a session opens the club page,
// follows "Facilities" to the club's public facilities (the public pitch, never the hall that is not public) and opens
// the pitch's month through a permalink `?month=`. On a phone the month is a list of days: the Wednesday shows "Taken
// by the club", "Booked" and "Requested — pending", the Thursday "Closed"; a text legend explains every state and no
// renter, contact, event or closure detail reaches the page. From `md` up the month is a grid. "Later" is reached with
// Tab and moves the month with Enter. An unknown place shows the 404 text; a club that stops publishing its facility
// calendars shows "The club does not share facility calendars". Light and dark mode pass an axe scan.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

async function setGuestLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

/** The month after `YYYY-MM`. */
function monthAfter(month: string): string {
  const [year, number] = month.split('-').map(Number)
  return number === 12 ? `${String(year + 1)}-01` : `${String(year)}-${String(number + 1).padStart(2, '0')}`
}

async function expectNoPrivateNames(page: Page) {
  // `textContent` includes the hidden layout (the grid on a phone, the list on a desktop).
  const text = (await page.locator('body').textContent()) ?? ''
  for (const name of Object.values(PRIVATE_NAMES)) expect(text, name).not.toContain(name)
}

test('TEST-028 public facility pages: P-01 link, P-03 cards, P-04 day list and month grid without names, keyboard month, 404 and disabled', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-028-public-schedule')
  try {
    const admin = club.adminToken
    const slug = `test-028-${club.tenant.organizationId.slice(0, 8)}`
    const setup = await publicPitch(request, club, slug)

    page.setDefaultTimeout(30_000)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await setGuestLocale(page, 'en')

    // P-01 → P-03: the club page links to its facilities.
    await page.goto(`/p/${slug}`)
    await page.getByTestId('public-club-places-link').click()
    await expect(page).toHaveURL(new RegExp(`/p/${slug}/places$`))
    await expect(page.getByTestId('public-places-title')).toHaveText('Facilities')
    const card = page.getByTestId(`public-place-${setup.placeSlug}`)
    await expect(card).toContainText('Boisko A')
    await expect(card.getByTestId(`public-place-${setup.placeSlug}-requests`)).toHaveText('Online requests')
    await expect(page.getByTestId('public-place-hala-zaplecza')).toHaveCount(0)
    await expect(page.getByTestId('public-places')).not.toContainText('Hala zaplecza')
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // P-03 → P-04, then the permalink of the fixture's month.
    await card.click()
    await expect(page).toHaveURL(new RegExp(`/p/${slug}/places/${setup.placeSlug}$`))
    await expect(page.getByTestId('public-place-title')).toHaveText('Boisko A')
    await page.goto(`/p/${slug}/places/${setup.placeSlug}?month=${setup.month}`)
    await expect(page.getByTestId('public-schedule-month')).toHaveAttribute('data-month', setup.month)

    // A phone: the day list, not the grid.
    await expect(page.getByTestId('public-schedule-list')).toBeVisible()
    await expect(page.getByTestId('public-schedule-grid')).toBeHidden()
    const day = page.getByTestId(`public-schedule-day-${setup.day}`)
    await expect(day).toContainText('17:30–19:00')
    await expect(day).toContainText('Taken by the club')
    await expect(day).toContainText('20:00–21:30')
    await expect(day).toContainText('Booked')
    await expect(day).toContainText('10:00–11:30')
    await expect(day).toContainText('Requested — pending')
    const closed = page.getByTestId(`public-schedule-day-${setup.closedDay}`)
    await expect(closed).toContainText('08:00–12:00')
    await expect(closed).toContainText('Closed')
    const legend = page.getByTestId('public-schedule-legend')
    for (const label of [
      'Open to the public',
      'Free — bookable',
      'Club training hours',
      'Taken by the club',
      'Booked',
      'Requested — pending',
      'Closed',
    ]) {
      await expect(legend).toContainText(label)
    }
    await expect(page.getByTestId('public-block-hours')).toContainText('All year')
    await expect(page.getByTestId('public-block-rates')).toContainText('Municipal club')
    await expect(page.getByTestId('public-block-rates')).toContainText('External / commercial')
    await expect(page.getByTestId('public-block-phone')).toContainText('600 000 000')
    await expectNoPrivateNames(page)
    await expectNoPageOverflow(page)

    // Light and dark mode: no blocking axe violation on P-04.
    const violations = await scanInColorSchemes(page, testInfo, 'P-04', async () => {
      await expect(page.getByTestId(`public-schedule-day-${setup.day}`)).toBeVisible()
    })
    expect(violations).toEqual({})
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

    // A desktop: the month grid.
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(page.getByTestId('public-schedule-grid')).toBeVisible()
    await expect(page.getByTestId('public-schedule-list')).toBeHidden()
    const cell = page.getByTestId(`public-schedule-cell-${setup.day}`)
    await expect(cell).toContainText('Taken by the club')
    await expect(cell).toContainText('Booked')
    await expect(cell).toContainText('Requested — pending')
    await expect(page.getByTestId(`public-schedule-cell-${setup.closedDay}`)).toContainText('Closed')

    // The keyboard: Tab reaches "Later", Enter moves to the next month and keeps it in the URL.
    await page.getByTestId('public-breadcrumb-places').focus()
    const later = page.getByTestId('public-schedule-later')
    let reached = false
    for (let step = 0; step < 10 && !reached; step += 1) {
      await page.keyboard.press('Tab')
      reached = await later.evaluate((element) => element === document.activeElement)
    }
    expect(reached, '"Later" is reachable with Tab').toBe(true)
    await page.keyboard.press('Enter')
    const next = monthAfter(setup.month)
    await expect(page).toHaveURL(new RegExp(`month=${next}`))
    await expect(page.getByTestId('public-schedule-month')).toHaveAttribute('data-month', next)

    // Polish: the state labels in Polish.
    await setGuestLocale(page, 'pl')
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/p/${slug}/places/${setup.placeSlug}?month=${setup.month}`)
    await expect(page.getByTestId(`public-schedule-day-${setup.day}`)).toContainText('Zajęte przez klub')
    await expect(page.getByTestId(`public-schedule-day-${setup.day}`)).toContainText('Wniosek — oczekuje')
    await expect(page.getByTestId(`public-schedule-day-${setup.closedDay}`)).toContainText('Zamknięte')
    await setGuestLocale(page, 'en')
    // The browser logs every 404 below as a failed resource, so the console is checked before them.
    expect(consoleErrors).toEqual([])

    // An unknown place: the 404 text, nothing about the club.
    await page.goto(`/p/${slug}/places/nie-ma-takiego`)
    await expect(page.getByTestId('public-schedule-not-found')).toContainText(
      'This facility does not exist or its calendar is not public.',
    )
    // The hall is not public: the same 404.
    await page.goto(`/p/${slug}/places/hala-zaplecza`)
    await expect(page.getByTestId('public-schedule-not-found')).toBeVisible()

    // The club stops publishing its facility calendars: no link on the club page, P-03 and P-04 say so.
    await publish(request, admin, slug, ['contact'], { contactPhone: '600 000 000' })
    await page.goto(`/p/${slug}`)
    await expect(page.getByTestId('public-club-name')).toBeVisible()
    await expect(page.getByTestId('public-club-places-link')).toHaveCount(0)
    await page.goto(`/p/${slug}/places`)
    await expect(page.getByTestId('public-places-disabled')).toContainText(
      'The club does not share facility calendars.',
    )
    await page.goto(`/p/${slug}/places/${setup.placeSlug}`)
    await expect(page.getByTestId('public-places-disabled')).toContainText(
      'The club does not share facility calendars.',
    )
  } finally {
    await club.cleanup()
  }
})
