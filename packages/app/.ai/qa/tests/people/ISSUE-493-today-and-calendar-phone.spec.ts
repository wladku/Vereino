import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { addDays, createEvent, zoneInstant } from '../_fixtures/activities'
import { familyFor } from '../_fixtures/attendance'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { calendarDate, createClub, type Club } from '../_fixtures/club'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { updateClubSettings } from '../_fixtures/members'
import { uiTextIn } from '../_fixtures/ui-text'

// ISSUE-493 (E20-S14, epic #479; README M-02 and M-03; R01.5, R01.7, R06.1): Today and the calendar follow the mockup.
// Today opens with the club header — the club's name as text (next to the logo when the club has one) — and holds at
// most three tiles in the mockup's order, Calendar → Attendance → Messages; the sessions are rows with a line, not cards
// inside the card; payments, the profile and the wards are rows of the lists under the tiles. A guardian of two wards
// and a coach (the staff tiles within the same three) are checked in Polish at 375 px and English at 1440 px. The
// calendar opens on the upcoming list with Week and Month as the other tabs; the week has one set of navigation in one
// row and "Next week" once. Axe in light and dark; no horizontal scroll at 375 px.
test.describe.configure({ timeout: 480_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const TILE_ORDER = ['club-today-calendar-tile', 'club-today-attendance-tile', 'club-today-messages-tile']

/** With `EVIDENCE_DIR` set, the page is saved at 375 and 1440 px in both schemes; without it, nothing is written. */
async function evidence(page: Page, name: string): Promise<void> {
  const dir = process.env.EVIDENCE_DIR
  if (!dir) return
  const size = page.viewportSize()
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      // Evidence only (never in CI): let the colour transitions of the scheme switch settle before the picture.
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${dir}/${name}-${String(width)}-${colorScheme}.png`, fullPage: true })
    }
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  if (size) await page.setViewportSize(size)
}

/** The member pages follow the club's default locale, so it is set together with the cookie. */
async function useLocale(page: Page, request: APIRequestContext, club: Club, locale: 'en' | 'pl') {
  const settings = await updateClubSettings(request, club.adminToken, { defaultLocale: locale })
  expect(settings.status, JSON.stringify(settings.body)).toBe(200)
  await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
}

/** Today's tiles in their order: at most three, the first ones of the mockup's Calendar → Attendance → Messages. */
async function expectTiles(page: Page, expected: string[]) {
  const tiles = page.getByTestId('club-today-tiles').locator(':scope > *')
  await expect(tiles).toHaveCount(expected.length)
  const order = await tiles.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')))
  expect(order).toEqual(expected)
  expect(order.length).toBeLessThanOrEqual(3)
}

test('ISSUE-493 Today holds at most three tiles under the club header and the calendar opens on the upcoming list', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'issue-493')
  try {
    const family = await familyFor(request, club)
    const date = addDays(calendarDate(), 3)
    const created = await createEvent(request, club.adminToken, {
      groupId: family.zaki,
      type: 'other',
      name: 'Trening dodatkowy',
      placeId: family.pitch,
      startsAt: zoneInstant(date, '17:00'),
      endsAt: zoneInstant(date, '18:30'),
      coachPersonId: family.coach.personId,
    })
    expect(created.status, `POST /api/activities/events ${JSON.stringify(created.body)}`).toBe(201)

    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, family.guardian.userId, family.guardian.email)
    await prepareForAccessibilityScan(page)
    const violations: Record<string, unknown> = {}

    for (const [locale, width] of [
      ['pl', 375],
      ['en', 1440],
    ] as const) {
      await page.setViewportSize({ width, height: 900 })
      await useLocale(page, request, club, locale)

      // --- The guardian of two wards: the header, three tiles in order, the rows under them ---
      await page.goto('/club')
      const header = page.getByTestId('club-today-header')
      await expect(header).toBeVisible()
      await expect(page.getByTestId('club-today-club-name')).not.toBeEmpty()
      // The header comes before the greeting and the tiles.
      const headerBox = await header.boundingBox()
      const tilesBox = await page.getByTestId('club-today-tiles').boundingBox()
      expect(headerBox?.y ?? 0).toBeLessThan(tilesBox?.y ?? 0)
      await expectTiles(page, TILE_ORDER)
      await expect(page.getByTestId('club-today-calendar-tile').getByRole('heading', { level: 2 })).toHaveText(
        uiTextIn(locale, 'activities.club.today.calendar'),
      )
      await expect(page.getByTestId('club-today-nothing-waits')).toHaveText(
        uiTextIn(locale, 'activities.club.today.nothingWaits'),
      )
      // Payments and the profile are rows under the tiles, not tiles; the wards are rows too.
      const shortcuts = page.getByTestId('club-today-shortcuts')
      await expect(shortcuts.getByTestId('club-tile-payments')).toBeVisible()
      await expect(shortcuts.getByTestId('club-tile-profile')).toBeVisible()
      await expect(page.getByTestId('club-wards').getByTestId('club-ward')).toHaveCount(2)
      await expect(page.getByTestId('club-tile-coach')).toHaveCount(0)
      await expectNoPageOverflow(page)
      await evidence(page, `today-guardian-${locale}`)

      // --- The calendar: the upcoming list first, no arrows; the week tab has one set of navigation in one row ---
      await page.goto('/club/calendar')
      await expect(page.getByTestId('club-calendar-view-upcoming')).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByTestId('calendar-item').filter({ hasText: 'Trening dodatkowy' })).toHaveCount(1)
      await expect(page.getByTestId('club-calendar-next')).toHaveCount(0)
      await expectNoPageOverflow(page)
      await evidence(page, `calendar-upcoming-${locale}`)
      await page.getByTestId('club-calendar-view-week').click()
      await expect(page.getByTestId('club-calendar-view-week')).toHaveAttribute('aria-checked', 'true')
      const nextWeek = uiTextIn(locale, 'activities.club.calendar.next')
      await expect(page.getByRole('button', { name: nextWeek, exact: true })).toHaveCount(1)
      await expect(page.getByText(nextWeek, { exact: true })).toHaveCount(0)
      const boxes = await Promise.all(
        ['club-calendar-previous', 'club-calendar-current', 'club-calendar-next'].map((id) =>
          page.getByTestId(id).boundingBox(),
        ),
      )
      for (const box of boxes) {
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
        expect(Math.round(box?.y ?? -1)).toBe(Math.round(boxes[0]?.y ?? 0))
      }
      // No second "Next week" below the list (an empty week used to repeat it).
      await expect(page.getByTestId('club-calendar-empty-next')).toHaveCount(0)
      await expectNoPageOverflow(page)
      await evidence(page, `calendar-week-${locale}`)
    }

    Object.assign(
      violations,
      await scanInColorSchemes(
        page,
        testInfo,
        '/club guardian',
        async () => {
          await page.goto('/club')
          await expect(page.getByTestId('club-today-messages-tile')).toBeVisible()
        },
        { platformBaseline: true },
      ),
      await scanInColorSchemes(
        page,
        testInfo,
        '/club/calendar guardian',
        async () => {
          await page.goto('/club/calendar')
          await expect(page.getByTestId('calendar-item').first()).toBeVisible()
        },
        { platformBaseline: true },
      ),
    )

    // --- The coach (negative case for roles): the staff tiles stay within the three ---
    await switchBrowserUser(page, request, club, family.coach.userId, family.coach.email)
    for (const [locale, width] of [
      ['pl', 375],
      ['en', 1440],
    ] as const) {
      await page.setViewportSize({ width, height: 900 })
      await useLocale(page, request, club, locale)
      await page.goto('/club')
      await expect(page.getByTestId('club-today-header')).toBeVisible()
      await expectTiles(page, TILE_ORDER)
      const calendarTile = page.getByTestId('club-today-calendar-tile')
      await expect(calendarTile.getByTestId('club-tile-coach')).toBeVisible()
      await expect(calendarTile.getByTestId('club-tile-coach').getByRole('heading')).toHaveText(
        uiTextIn(locale, 'activities.club.today.coachSessions'),
      )
      await expect(page.getByTestId('club-tile-coach-payments')).toBeVisible()
      await expect(page.getByTestId('club-today-shortcuts').getByTestId('club-tile-coach-payments')).toBeVisible()
      await expectNoPageOverflow(page)
      await evidence(page, `today-coach-${locale}`)
    }
    Object.assign(
      violations,
      await scanInColorSchemes(
        page,
        testInfo,
        '/club coach',
        async () => {
          await page.goto('/club')
          await expect(page.getByTestId('club-tile-coach')).toBeVisible()
        },
        { platformBaseline: true },
      ),
    )

    // --- The section coordinator in the staff context: the section counts join the Attendance tile ---
    await switchBrowserUser(page, request, club, family.academyCoordinator.userId, family.academyCoordinator.email)
    await page.setViewportSize({ width: 375, height: 900 })
    await page.goto('/club')
    await expect(page.getByTestId('club-today-attendance-tile').getByTestId('club-tile-section')).toBeVisible()
    const tiles = await page
      .getByTestId('club-today-tiles')
      .locator(':scope > *')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')))
    expect(tiles.length).toBeLessThanOrEqual(3)
    await expectNoPageOverflow(page)

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
