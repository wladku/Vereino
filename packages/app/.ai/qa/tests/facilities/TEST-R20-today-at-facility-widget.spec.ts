import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { zoneInstant } from '../_fixtures/activities'
import { prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { calendarDate, call, createClub } from '../_fixtures/club'
import { create as createStructure, signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { runRequestProbe, staffCalendar } from '../_fixtures/facilities'
import { signedInStaff } from '../_fixtures/groups'
import { uiText } from '../_fixtures/ui-text'

// Issue #290 (E11-S16), facilities parity spec phase 16, TEST-R20 (REQ-R20, AC-R16; README B-01, widget 8 of the
// navigation spec's role table). A club with ten entries today on Boisko A, Boisko B and the hall, and a second club
// without entries.
// - API: "Today at the facility" is on the dashboard of the administrator, the coordinator and the attendant of
//   Boisko A; today's calendar without `placeId` holds the ten entries for the administrator and the coordinator and
//   only Boisko A's four for the attendant.
// - UI: the administrator and the coordinator see eight entries by start and "and 2 more"; the attendant only Boisko
//   A's four and no "more" line; the second club's administrator "Nothing scheduled". "Open calendar" opens B-23 on
//   the first entry's place and today. The widget stands beside "Requests awaiting approval", axe at 1280 px in Polish
//   and English, light and dark.
test.describe.configure({ timeout: 420_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const WIDGET = 'facilities.dashboard.todayAtFacility'

type Club = Awaited<ReturnType<typeof createClub>>
type Staff = Awaited<ReturnType<typeof signedInStaff>>
type LayoutBody = { layout?: { items?: { widgetId: string }[] } }

async function layoutWidgets(request: APIRequestContext, token: string): Promise<string[]> {
  const layout = await call<LayoutBody>(request, 'GET', '/api/dashboards/layout', token)
  expect(layout.status, JSON.stringify(layout.body)).toBe(200)
  return (layout.body?.layout?.items ?? []).map((item) => item.widgetId)
}

async function setLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

/** Today's window in the club zone, as the widget reads it. */
function todayWindow(): string {
  const today = calendarDate()
  return `from=${zoneInstant(today, '00:00')}&to=${zoneInstant(calendarDate(1), '00:00')}`
}

/**
 * Boisko A (four rentals today, the first at 08:00), Boisko B (three) and the hall (three); the coordinator of the
 * academy and the attendant of Boisko A.
 */
async function seed(
  request: APIRequestContext,
  club: Club,
): Promise<{ pitchA: string; pitchB: string; hall: string; coordinator: Staff; attendant: Staff }> {
  const admin = club.adminToken
  const today = calendarDate()
  const academy = await createStructure(request, admin, 'sections', { name: 'Akademia' })
  const pitchA = await createStructure(request, admin, 'places', { name: 'Boisko A', kind: 'pitch' })
  const pitchB = await createStructure(request, admin, 'places', { name: 'Boisko B', kind: 'pitch' })
  const hall = await createStructure(request, admin, 'places', { name: 'Hala', kind: 'hall' })
  const renterId = await createStructure(request, admin, 'institutions', { name: 'KS Sąsiedzi', type: 'club' })
  const rentals: [string, string, string][] = [
    [pitchA, '08:00', '09:00'],
    [pitchA, '09:30', '10:30'],
    [pitchA, '11:00', '12:00'],
    [pitchA, '12:30', '13:30'],
    [pitchB, '08:30', '09:30'],
    [pitchB, '10:00', '11:00'],
    [pitchB, '11:30', '12:30'],
    [hall, '09:00', '10:00'],
    [hall, '10:30', '11:30'],
    [hall, '13:00', '14:00'],
  ]
  for (const [placeId, from, to] of rentals) {
    runRequestProbe(club, {
      op: 'rental',
      placeId,
      startsAt: zoneInstant(today, from),
      endsAt: zoneInstant(today, to),
      renterId,
      renterDisplayName: `Wynajem ${from}`,
      contactName: 'Jan Kontakt',
      contactPhone: '600 000 001',
    })
  }
  const coordinator = await signedInStaff(request, club, {
    firstName: 'Krystyna',
    lastName: 'Koordynator',
    role: 'coordinator',
    sectionId: academy,
  })
  const attendant = await signedInStaff(request, club, {
    firstName: 'Adam',
    lastName: 'Gospodarz',
    role: 'facility_operator',
    placeId: pitchA,
  })
  return { pitchA, pitchB, hall, coordinator, attendant }
}

test('TEST-R20 API: the widget on each role dashboard and today’s calendar in each scope', async ({ request }) => {
  const club = await createClub(request, 'test-r20-api')
  const empty = await createClub(request, 'test-r20-empty')
  try {
    const { pitchA, pitchB, hall, coordinator, attendant } = await seed(request, club)
    for (const token of [club.adminToken, coordinator.token, attendant.token, empty.adminToken]) {
      expect(await layoutWidgets(request, token)).toContain(WIDGET)
    }
    // Beside "Requests awaiting approval" on the administrator's dashboard.
    const adminLayout = await layoutWidgets(request, club.adminToken)
    expect(adminLayout.indexOf(WIDGET) - adminLayout.indexOf('facilities.dashboard.requestsAwaitingApproval')).toBe(1)

    const placesOf = async (token: string) => {
      const read = await staffCalendar(request, token, todayWindow())
      expect(read.status, JSON.stringify(read.body)).toBe(200)
      return (read.body?.entries ?? []).filter((entry) => entry.kind === 'rental').map((entry) => entry.placeId)
    }
    for (const token of [club.adminToken, coordinator.token]) {
      const places = await placesOf(token)
      expect(places).toHaveLength(10)
      expect(new Set(places)).toEqual(new Set([pitchA, pitchB, hall]))
    }
    expect(await placesOf(attendant.token)).toEqual([pitchA, pitchA, pitchA, pitchA])
    expect(await placesOf(empty.adminToken)).toEqual([])
  } finally {
    await empty.cleanup()
    await club.cleanup()
  }
})

test('TEST-R20 UI: today’s entries by start, the more line, the attendant’s place, the empty text, the click', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-r20-ui')
  const empty = await createClub(request, 'test-r20-ui-empty')
  try {
    page.setDefaultTimeout(30_000)
    const { pitchA, coordinator, attendant } = await seed(request, club)
    const today = calendarDate()
    const widget = page.getByTestId('facilities-widget-today')
    const rows = widget.getByTestId('facilities-widget-today-entry')

    // --- The administrator: eight entries by start, "and 2 more", beside "Requests awaiting approval" ---
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 1280, height: 900 })
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await setLocale(page, 'pl')
    await page.goto('/backend')
    await expect(rows).toHaveCount(8)
    await expect(rows.first()).toContainText('08:00–09:00')
    await expect(rows.first()).toContainText('Wynajem 08:00')
    await expect(rows.first()).toContainText('Boisko A')
    await expect(rows.nth(1)).toContainText('Wynajem 08:30')
    await expect(rows.nth(7)).toContainText('Wynajem 11:30')
    await expect(widget.getByTestId('facilities-widget-today-more')).toHaveText(
      uiText('facilities.dashboard.today.more', { exact: true, params: { count: 2 } }),
    )
    await expect(page.getByTestId('facilities-widget-requests')).toBeVisible()

    const violations: Record<string, unknown> = {}
    for (const locale of ['pl', 'en'] as const) {
      await setLocale(page, locale)
      Object.assign(
        violations,
        await scanInColorSchemes(
          page,
          testInfo,
          `/backend today at the facility (${locale})`,
          async () => {
            await expect(page.getByText(uiText(`${WIDGET}.title`, { exact: true }))).toBeVisible()
            await expect(rows).toHaveCount(8)
            await expect(page.getByTestId('facilities-widget-requests')).toBeVisible()
          },
          { platformBaseline: true },
        ),
      )
      await page.screenshot({ path: testInfo.outputPath(`b01-today-${locale}.png`), fullPage: true })
    }
    expect(violations).toEqual({})

    // The click opens B-23 on the first entry's place and today.
    const open = widget.getByTestId('facilities-widget-today-open')
    await expect(open).toHaveAttribute('href', `/backend/facilities/calendar?place=${pitchA}&date=${today}`)
    await open.click()
    await expect(page).toHaveURL(new RegExp(`/backend/facilities/calendar\\?place=${pitchA}&date=${today}$`))

    // --- The coordinator: the club's places, as the administrator ---
    await switchBrowserUser(page, request, club, coordinator.userId, coordinator.email)
    await page.goto('/backend')
    await expect(rows).toHaveCount(8)
    await expect(widget.getByTestId('facilities-widget-today-more')).toBeVisible()

    // --- The attendant of Boisko A: only its four entries and no "more" line ---
    await switchBrowserUser(page, request, club, attendant.userId, attendant.email)
    await page.goto('/backend')
    await expect(rows).toHaveCount(4)
    for (const from of ['08:00', '09:30', '11:00', '12:30']) await expect(widget).toContainText(`Wynajem ${from}`)
    await expect(widget).not.toContainText('Boisko B')
    await expect(widget.getByTestId('facilities-widget-today-more')).toHaveCount(0)

    // --- Negative: a club without entries today shows the empty text ---
    await switchBrowserUser(page, request, empty, empty.adminUserId, empty.tenant.email)
    await page.goto('/backend')
    await expect(widget.getByTestId('facilities-widget-today-empty')).toHaveText(
      uiText('facilities.dashboard.today.empty', { exact: true }),
    )
    await expect(rows).toHaveCount(0)
  } finally {
    await empty.cleanup()
    await club.cleanup()
  }
})
