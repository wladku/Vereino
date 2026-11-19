import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { createUserFixture } from '@open-mercato/core/helpers/integration/authFixtures'
import { createActivity } from '../_fixtures/activities'
import { prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { calendarDate, call, createClub, uniqueSuffix } from '../_fixtures/club'
import { create as createStructure, signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { runRequestProbe } from '../_fixtures/facilities'
import { createGroup, signedInStaff } from '../_fixtures/groups'
import { setUserFeatures } from '../_fixtures/members'
import { postCampaign } from '../_fixtures/orders'
import { importStatement } from '../_fixtures/payments'
import { uiText } from '../_fixtures/ui-text'

// TEST-N04 (navigation spec phase 6, REQ-N03, REQ-N04, AC-N03, AC-N04, DD-N05; issue #260; mockup `backendShell`,
// `screenDashboard`). One session of the academy without a coach in the next days, two unmatched bank transfers, one
// open order campaign and one rental request awaiting approval.
// - Counts: the administrator's sidebar shows 1, 2, 1 and 1 on Sessions, Bank statements, Order campaigns and
//   Requests, each read aloud as "{n} waiting"; the academy's coordinator sees 1 on Sessions; the coordinator of
//   another section sees no count on Sessions (zero shows nothing).
// - Dashboard: the layout of each role holds exactly its widgets (role table of the spec) and no platform widget —
//   the coordinator the two sessions widgets, the attendant none, so the attendant's dashboard says "Nothing needs
//   action today".
// - Greeting and link: the administrator linked to a person is greeted by first name with today's date, and "Member
//   interface" links to `/club` (also in the "More" menu under 768 px); an account linked to no person gets the
//   greeting without a name and no link. axe at 1280 px in English and Polish, light and dark.
test.describe.configure({ timeout: 420_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const SESSIONS = '/backend/activities/occurrences'
const BANK = '/backend/payments/bank'
const ORDERS = '/backend/payments/orders'
const REQUESTS = '/backend/facilities/requests'

const UNLINKED_PASSWORD = `Vereino-${uniqueSuffix()}-Aa1!`

/** The query of the Sessions count widget (`sessionsNavBadgeQuery`): the "Needing a coach" window, one row. */
function sessionsQuery(): string {
  return new URLSearchParams({
    page: '1',
    pageSize: '1',
    sortField: 'startAt',
    sortDir: 'asc',
    unassigned: '1',
    from: calendarDate(),
    to: calendarDate(14),
  }).toString()
}

type LayoutBody = { layout?: { items?: { widgetId: string }[] } }

async function layoutWidgets(request: Parameters<typeof call>[0], token: string): Promise<string[]> {
  const layout = await call<LayoutBody>(request, 'GET', '/api/dashboards/layout', token)
  expect(layout.status, JSON.stringify(layout.body)).toBe(200)
  return (layout.body?.layout?.items ?? []).map((item) => item.widgetId).sort()
}

async function setLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

function sidebarLink(page: Page, href: string) {
  return page.getByTestId('sidebar').locator(`a[href="${href}"]`)
}

/** Opens the dashboard and waits until the Sessions menu count (the one-row read) has answered once. */
async function openDashboard(page: Page) {
  const read = page.waitForResponse(
    (response) => response.url().includes('/api/activities/occurrences?') && response.url().includes('pageSize=1&'),
  )
  await page.goto('/backend')
  await expect(page.getByTestId('backend-chrome-ready')).toHaveAttribute('data-ready', 'true')
  await read
}

type Club = Awaited<ReturnType<typeof createClub>>
type Staff = Awaited<ReturnType<typeof signedInStaff>>

/**
 * The fixture of both tests: the academy and the pool, the academy's coordinator Krystyna, the pool's coordinator
 * Marek, the attendant Jan of the pitch, one Żaki session without a coach the day after tomorrow, two unmatched
 * transfers, one open campaign, one held online request, and an account linked to no person.
 */
async function seed(
  request: APIRequestContext,
  club: Club,
): Promise<{ krystyna: Staff; marek: Staff; jan: Staff; unlinkedId: string; unlinkedEmail: string }> {
  const admin = club.adminToken
  const academy = await createStructure(request, admin, 'sections', { name: 'Akademia' })
  const pool = await createStructure(request, admin, 'sections', { name: 'Basen' })
  const pitch = await createStructure(request, admin, 'places', { name: 'Boisko A', kind: 'pitch', capacityGroups: 1 })
  const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
  const krystyna = await signedInStaff(request, club, {
    firstName: 'Krystyna',
    lastName: 'Koordynator',
    role: 'coordinator',
    sectionId: academy,
  })
  const marek = await signedInStaff(request, club, {
    firstName: 'Marek',
    lastName: 'Basenowy',
    role: 'coordinator',
    sectionId: pool,
  })
  const jan = await signedInStaff(request, club, {
    firstName: 'Jan',
    lastName: 'Obiektowy',
    role: 'facility_operator',
    placeId: pitch,
  })

  // One Żaki session without a coach the day after tomorrow.
  await createActivity(request, admin, {
    groupId: zaki,
    name: 'Trening Żaków',
    type: 'training',
    placeId: pitch,
    startsOn: calendarDate(2),
    startTime: '17:00',
    endTime: '18:00',
  })
  // Two transfers nobody's code or name matches.
  const today = calendarDate()
  const imported = await importStatement(
    request,
    admin,
    ['Data;Kwota;Nadawca;Tytuł', `${today};500,00;Firma XYZ;Darowizna`, `${today};120,00;Jan Obcy;Zwrot`].join('\n'),
  )
  expect(imported.status, JSON.stringify(imported.body)).toBe(201)
  expect(imported.body).toMatchObject({ unmatched: 2 })
  // One open order campaign.
  const campaign = await postCampaign(request, admin, {
    name: 'Stroje Akademii',
    sectionId: academy,
    groupIds: [zaki],
    closesOn: calendarDate(14),
    paymentDueOn: calendarDate(21),
    open: true,
    products: [{ key: 'shirt', name: 'Koszulka', sizesChild: ['116', '128'], priceChild: 6000 }],
  })
  expect(campaign.status, JSON.stringify(campaign.body)).toBe(201)
  // One online request held for approval.
  runRequestProbe(club, {
    op: 'seed',
    placeId: pitch,
    startsAt: `${calendarDate(9)}T10:00:00.000Z`,
    endsAt: `${calendarDate(9)}T11:30:00.000Z`,
  })

  // --- An account linked to no person (created before any browser sign-in ends the tokens) ---
  const unlinkedEmail = `n04-unlinked-${uniqueSuffix()}@example.org`
  const unlinkedId = await createUserFixture(request, club.superToken, {
    email: unlinkedEmail,
    password: UNLINKED_PASSWORD,
    organizationId: club.tenant.organizationId,
    roles: [club.tenant.roleId],
  })
  club.extraUserIds.push(unlinkedId)
  await setUserFeatures(request, club, unlinkedId, ['dashboards.view', 'people.self'])

  return { krystyna, marek, jan, unlinkedId, unlinkedEmail }
}

test('TEST-N04 API: the count reads of the four menu items and the dashboard layout of each role', async ({
  request,
}) => {
  const club = await createClub(request, 'test-n04-api')
  try {
    const { krystyna, marek, jan, unlinkedEmail } = await seed(request, club)
    const admin = club.adminToken
    // --- The dashboard of each role: exactly its widgets and no platform widget (API) ---
    const adminWidgets = await layoutWidgets(request, admin)
    // The administrator: widgets 1, 2, 4, 5, 7 and 9 of the role table built so far, bank and campaigns (3, 6), and the
    // departure requests of `people` (#121) and its "People needing attention" (row 11, #310); no platform widget.
    expect(adminWidgets).toEqual([
      'activities.dashboard.sessionsNeedingCoach',
      'activities.dashboard.unsettledSessions',
      'facilities.dashboard.requestsAwaitingApproval',
      'payments.dashboard.bank',
      'payments.dashboard.orderCampaigns',
      'payments.dashboard.overdue',
      'payments.dashboard.withoutPayer',
      'people.dashboard.departureRequests',
      'people.dashboard.peopleNeedingAttention',
      'people.dashboard.sectionsWithoutCoordinator',
    ])
    for (const coordinator of [krystyna, marek]) {
      expect(await layoutWidgets(request, coordinator.token)).toEqual([
        'activities.dashboard.sessionsNeedingCoach',
        'activities.dashboard.unsettledSessions',
      ])
    }
    expect(await layoutWidgets(request, jan.token)).toEqual([])

    // --- The reads behind the menu counts, with the query each widget sends ---
    const sessionsTotal = async (token: string) => {
      const read = await call<{ total?: number }>(
        request,
        'GET',
        `/api/activities/occurrences?${sessionsQuery()}`,
        token,
      )
      expect(read.status, JSON.stringify(read.body)).toBe(200)
      return read.body?.total
    }
    expect(await sessionsTotal(admin)).toBe(1)
    expect(await sessionsTotal(krystyna.token)).toBe(1)
    // Negative: the coordinator of another section counts nothing (zero shows nothing).
    expect(await sessionsTotal(marek.token)).toBe(0)
    const payments = await call(request, 'GET', '/api/payments/dashboard?only=counts', admin)
    expect(payments.status, JSON.stringify(payments.body)).toBe(200)
    expect(payments.body).toEqual({ bank: { toDecide: 2 }, campaignsRunning: 1 })
    const requests = await call<{ total?: number }>(
      request,
      'GET',
      '/api/facilities/rentals/requests?page=1&pageSize=1',
      admin,
    )
    expect(requests.status, JSON.stringify(requests.body)).toBe(200)
    expect(requests.body?.total).toBe(1)
    // Neither the coordinator nor the attendant mounts the payments or the requests count: the routes refuse them.
    for (const token of [krystyna.token, jan.token]) {
      expect((await call(request, 'GET', '/api/payments/dashboard?only=counts', token)).status).toBe(403)
      expect((await call(request, 'GET', '/api/facilities/rentals/requests?page=1&pageSize=1', token)).status).toBe(403)
    }

    // --- The link condition: a person for the administrator, 404 `person_not_linked` for the unlinked account ---
    expect((await call(request, 'GET', '/api/people/me', admin)).status).toBe(200)
    const unlinkedToken = await getAuthToken(request, unlinkedEmail, UNLINKED_PASSWORD)
    const unlinkedMe = await call<{ code?: string }>(request, 'GET', '/api/people/me', unlinkedToken)
    expect(unlinkedMe.status).toBe(404)
    expect(unlinkedMe.body?.code).toBe('person_not_linked')
  } finally {
    await club.cleanup()
  }
})

test('TEST-N04 UI: menu counts, the dashboard of each role, the greeting and the member-interface link', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-n04-ui')
  try {
    page.setDefaultTimeout(30_000)
    const { krystyna, marek, jan, unlinkedId, unlinkedEmail } = await seed(request, club)

    // --- The administrator (Ada, linked to a person) at 1280 px ---
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 1280, height: 900 })
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await setLocale(page, 'pl')
    await openDashboard(page)
    const counts: [string, string, number][] = [
      [SESSIONS, 'activities.nav.badge.waiting', 1],
      [BANK, 'payments.nav.badge.waiting', 2],
      [ORDERS, 'payments.nav.badge.waiting', 1],
      [REQUESTS, 'facilities.nav.badge.waiting', 1],
    ]
    for (const [href, key, count] of counts) {
      await expect(
        sidebarLink(page, href).getByLabel(uiText(key, { exact: true, params: { count } })),
        href,
      ).toHaveText(String(count))
    }
    const date = new Intl.DateTimeFormat('pl', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Warsaw',
    }).format(new Date())
    await expect(page.getByTestId('backend-greeting-title')).toHaveText(
      uiText('vereino.dashboard.greeting', { exact: true, params: { name: 'Ada' } }),
    )
    await expect(page.getByTestId('backend-greeting-subtitle')).toHaveText(
      uiText('vereino.dashboard.subtitle', { exact: true, params: { date } }),
    )
    const memberLink = page.getByTestId('backend-member-interface-link')
    await expect(memberLink).toHaveAttribute('href', '/club')
    await expect(memberLink).toHaveText(uiText('vereino.backend.memberInterface', { exact: true }))

    const violations: Record<string, unknown> = {}
    for (const locale of ['pl', 'en'] as const) {
      await setLocale(page, locale)
      Object.assign(
        violations,
        await scanInColorSchemes(
          page,
          testInfo,
          `/backend (${locale})`,
          async () => {
            await expect(page.getByTestId('backend-member-interface-link')).toBeVisible()
            await expect(
              sidebarLink(page, SESSIONS).getByLabel(uiText('activities.nav.badge.waiting', { exact: true })),
            ).toBeVisible()
          },
          { platformBaseline: true },
        ),
      )
      await page.screenshot({ path: testInfo.outputPath(`b01-admin-${locale}.png`), fullPage: true })
    }
    expect(violations).toEqual({})

    // Under 768 px the link moves into the top bar's "More" menu.
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/backend')
    await page.getByRole('button', { name: uiText('appShell.moreActions', { exact: true }) }).click()
    await expect(
      page.getByRole('link', { name: uiText('vereino.backend.memberInterface', { exact: true }) }),
    ).toHaveAttribute('href', '/club')
    await page.setViewportSize({ width: 1280, height: 900 })

    // --- The academy's coordinator: the Sessions count, the two widgets, the link ---
    await switchBrowserUser(page, request, club, krystyna.userId, krystyna.email)
    await openDashboard(page)
    await expect(
      sidebarLink(page, SESSIONS).getByLabel(
        uiText('activities.nav.badge.waiting', { exact: true, params: { count: 1 } }),
      ),
    ).toHaveText('1')
    await expect(page.getByTestId('activities-widget-sessionsNeedingCoach')).toBeVisible()
    await expect(page.getByTestId('backend-greeting-title')).toHaveText(
      uiText('vereino.dashboard.greeting', { exact: true, params: { name: 'Krystyna' } }),
    )
    await expect(page.getByTestId('backend-member-interface-link')).toHaveAttribute('href', '/club')

    // --- Negative: the coordinator of another section sees no count (zero shows nothing) ---
    await switchBrowserUser(page, request, club, marek.userId, marek.email)
    await openDashboard(page)
    await expect(page.getByTestId('activities-widget-sessionsNeedingCoach-count')).toHaveText('0')
    await expect(sidebarLink(page, SESSIONS)).toBeVisible()
    await expect(
      sidebarLink(page, SESSIONS).getByLabel(uiText('activities.nav.badge.waiting', { exact: true })),
    ).toHaveCount(0)

    // --- The facility attendant: an empty dashboard with "Nothing needs action today" ---
    await switchBrowserUser(page, request, club, jan.userId, jan.email)
    await page.goto('/backend')
    await expect(page.getByText(uiText('dashboard.empty.readonly', { exact: true }))).toBeVisible()
    await expect(page.getByTestId('backend-greeting-title')).toHaveText(
      uiText('vereino.dashboard.greeting', { exact: true, params: { name: 'Jan' } }),
    )

    // --- An account linked to no person: the greeting without a name and no link ---
    await switchBrowserUser(page, request, club, unlinkedId, unlinkedEmail)
    await page.goto('/backend')
    await expect(page.getByTestId('backend-greeting-title')).toHaveText(
      uiText('vereino.dashboard.greetingNoName', { exact: true }),
    )
    await expect(page.getByTestId('backend-member-interface-link')).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
