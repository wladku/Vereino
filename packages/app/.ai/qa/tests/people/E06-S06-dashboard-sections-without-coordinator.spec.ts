import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  createRoleFixture,
  createUserFixture,
  deleteRoleIfExists,
  deleteUserIfExists,
  setRoleAclFeatures,
} from '@open-mercato/core/helpers/integration/authFixtures'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { assignRole, calendarDate, call, createClub, uniqueSuffix } from '../_fixtures/club'
import { create, signInBrowser } from '../_fixtures/club-structure'

// E06-S06 (issue #88; README B-01, note 4): the dashboard widget "Sections without a coordinator" counts the active
// sections without an active coordinator and lists them, each linking to the section's Coordinators tab; it shows its
// own empty text and its own error with "Try again"; a user without `club_core.manage` is not offered the widget.
// 375 px, light and dark, axe.
test.describe.configure({ timeout: 300_000 })

const WIDGET_ID = 'people.dashboard.sectionsWithoutCoordinator'

type LayoutBody = { allowedWidgetIds?: string[]; layout?: { items?: { widgetId: string }[] } }

test('E06-S06 dashboard widget: sections without a coordinator, empty, error and retry, not offered without manage', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e06-s06-dashboard')
  let limitedRoleId: string | null = null
  let limitedUserId: string | null = null
  try {
    page.setDefaultTimeout(30_000)
    let token = club.adminToken
    const pool = await create(request, token, 'sections', { name: 'Basen' })
    const chess = await create(request, token, 'sections', { name: 'Szachy' })
    const zumba = await create(request, token, 'sections', { name: 'Zumba' })
    await create(request, token, 'sections', { name: 'Cheerleader', isActive: false })
    await assignRole(request, token, {
      personId: club.adminPersonId,
      role: 'coordinator',
      sectionId: zumba,
      validFrom: calendarDate(),
    })

    // The administrator is offered the widget and gets it on a new dashboard.
    const layout = await call<LayoutBody>(request, 'GET', '/api/dashboards/layout', token)
    expect(layout.status, JSON.stringify(layout.body)).toBe(200)
    expect(layout.body?.allowedWidgetIds).toContain(WIDGET_ID)
    expect(layout.body?.layout?.items?.map((item) => item.widgetId)).toContain(WIDGET_ID)

    // Negative: a user with the dashboard and the club read features but without `club_core.manage`.
    limitedRoleId = await createRoleFixture(request, club.superToken, {
      name: `e06-s06-limited-${uniqueSuffix()}`,
      tenantId: club.tenant.tenantId,
    })
    await setRoleAclFeatures(request, club.superToken, {
      roleId: limitedRoleId,
      features: ['dashboards.view', 'club_core.view', 'people.view'],
    })
    const limitedEmail = `e06-s06-limited-${uniqueSuffix()}@example.org`
    const limitedPassword = `Vereino-${uniqueSuffix()}-Aa1!`
    limitedUserId = await createUserFixture(request, club.superToken, {
      email: limitedEmail,
      password: limitedPassword,
      organizationId: club.tenant.organizationId,
      roles: [limitedRoleId],
    })
    const limitedToken = await getAuthToken(request, limitedEmail, limitedPassword)
    const limitedLayout = await call<LayoutBody>(request, 'GET', '/api/dashboards/layout', limitedToken)
    expect(limitedLayout.status, JSON.stringify(limitedLayout.body)).toBe(200)
    expect(limitedLayout.body?.allowedWidgetIds ?? []).not.toContain(WIDGET_ID)
    expect((limitedLayout.body?.layout?.items ?? []).map((item) => item.widgetId)).not.toContain(WIDGET_ID)

    // The browser: the count 2 and both names, linking to the Coordinators tab; Zumba and the inactive one are absent.
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 1280, height: 900 })
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    token = await getAuthToken(request, club.tenant.email, password)
    club.adminToken = token
    await page.goto('/backend')
    const widget = page.getByTestId('sections-without-coordinator')
    await expect(widget.getByTestId('sections-without-coordinator-count')).toHaveText('2')
    await expect(widget.getByRole('link', { name: 'Basen' })).toHaveAttribute(
      'href',
      `/backend/club/sections/${pool}/edit?tab=coordinators`,
    )
    await expect(widget.getByRole('link', { name: 'Szachy' })).toHaveAttribute(
      'href',
      `/backend/club/sections/${chess}/edit?tab=coordinators`,
    )
    await expect(widget.getByRole('link', { name: 'Zumba' })).toHaveCount(0)
    await expect(widget.getByRole('link', { name: 'Cheerleader' })).toHaveCount(0)
    await expect(page.getByText(/^(Sections without a coordinator|Sekcje bez koordynatora)$/)).toBeVisible()
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      'dashboard with the widget',
      async () => {
        await expect(page.getByTestId('sections-without-coordinator-count')).toHaveText('2')
      },
      { platformBaseline: true },
    )

    // A row opens the section on its Coordinators tab.
    await page.getByTestId('sections-without-coordinator').getByRole('link', { name: 'Basen' }).click()
    await expect(page).toHaveURL(new RegExp(`/backend/club/sections/${pool}/edit\\?tab=coordinators`))

    // The API fails: the widget shows its own error with "Try again"; the dashboard around it stays.
    await page.route('**/api/club_core/sections?**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }),
    )
    await page.goto('/backend')
    const retry = page.getByRole('button', { name: /^(Try again|Spróbuj ponownie)$/ })
    await expect(retry).toBeVisible()
    await expect(page.getByText(/^(The sections could not be loaded\.|Nie udało się wczytać sekcji\.)$/)).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.unroute('**/api/club_core/sections?**')
    await retry.click()
    await expect(page.getByTestId('sections-without-coordinator-count')).toHaveText('2')

    // Every section gets a coordinator: the empty text.
    for (const sectionId of [pool, chess]) {
      await assignRole(request, token, {
        personId: club.adminPersonId,
        role: 'coordinator',
        sectionId,
        validFrom: calendarDate(),
      })
    }
    await page.reload()
    await expect(page.getByTestId('sections-without-coordinator-count')).toHaveText('0')
    await expect(page.getByText(/^(Every section has a coordinator\.|Każda sekcja ma koordynatora\.)$/)).toBeVisible()

    // 375 px: the widget reflows without horizontal overflow.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.reload()
    await expect(page.getByTestId('sections-without-coordinator-count')).toHaveText('0')
    await expectNoPageOverflow(page)

    expect(violations).toEqual({})
  } finally {
    await deleteUserIfExists(request, club.superToken, limitedUserId)
    await deleteRoleIfExists(request, club.superToken, limitedRoleId)
    await club.cleanup()
  }
})
