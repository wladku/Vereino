import { expect, test, type Page } from '@playwright/test'
import {
  createRoleFixture,
  createUserFixture,
  deleteRoleIfExists,
  deleteUserIfExists,
  setRoleAclFeatures,
} from '@open-mercato/core/helpers/integration/authFixtures'
import { prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { createClub, uniqueSuffix } from '../_fixtures/club'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { uiText } from '../_fixtures/ui-text'

// TEST-N03 (navigation spec REQ-N02, AC-N02, DD-N02; issue #256): B-07, B-18, B-26, B-27 and B-28 are pages with tabs.
// From the dashboard each tab is two clicks away (the menu item, then the tab); the URL is the tab's own route while the
// page title (the breadcrumb's current page) names the page; the mockup's `?tab=` on the first route redirects to the
// tab's route. The facility group has six items. A user with `club_core.manage` and without
// `club_core.contracts.manage` sees no Contracts tab (so no strip at all) and the contracts route answers 403. Axe at
// 1280 px, en and pl, light and dark. Tabs are picked by role (lesson `tabs-primitives-drop-data-testid`).
test.describe.configure({ timeout: 600_000 })

type TabbedPage = {
  menu: RegExp
  title: RegExp
  tabs: { name: RegExp; path: string }[]
  alias: { tab: string; path: string }
}

const PAGES: TabbedPage[] = [
  {
    menu: /^Institutions and contracts$/,
    title: uiText('club_core.institutions.tabs.label', { exact: true }),
    tabs: [
      { name: uiText('club_core.institutions.tabs.institutions', { exact: true }), path: '/backend/club/institutions' },
      { name: uiText('club_core.institutions.tabs.contracts', { exact: true }), path: '/backend/club/contracts' },
    ],
    alias: { tab: 'contracts', path: '/backend/club/contracts' },
  },
  {
    menu: /^Threads and cases$/,
    title: uiText('communication.threads.tabs.label', { exact: true }),
    tabs: [
      {
        name: uiText('communication.threads.tabs.all', { exact: true }),
        path: '/backend/communication/threads',
      },
      { name: uiText('communication.threads.tabs.cases', { exact: true }), path: '/backend/communication/cases' },
    ],
    alias: { tab: 'cases', path: '/backend/communication/cases' },
  },
  {
    menu: /^Zones and rates$/,
    title: uiText('facilities.rules.tabs.label', { exact: true }),
    tabs: [
      { name: uiText('facilities.rules.tabs.zones', { exact: true }), path: '/backend/facilities/zones' },
      { name: uiText('facilities.rules.tabs.closures', { exact: true }), path: '/backend/facilities/closures' },
      { name: uiText('facilities.rules.tabs.rates', { exact: true }), path: '/backend/facilities/rates' },
    ],
    alias: { tab: 'rates', path: '/backend/facilities/rates' },
  },
  {
    menu: /^Log and incidents$/,
    title: uiText('facilities.records.tabs.label', { exact: true }),
    tabs: [
      { name: uiText('facilities.records.tabs.logs', { exact: true }), path: '/backend/facilities/logs' },
      { name: uiText('facilities.records.tabs.incidents', { exact: true }), path: '/backend/facilities/incidents' },
      { name: uiText('facilities.records.tabs.bans', { exact: true }), path: '/backend/facilities/bans' },
      {
        name: uiText('facilities.records.tabs.maintenance', { exact: true }),
        path: '/backend/facilities/maintenance',
      },
    ],
    alias: { tab: 'maint', path: '/backend/facilities/maintenance' },
  },
  {
    menu: /^Municipality report$/,
    title: uiText('facilities.reports.tabs.label', { exact: true }),
    tabs: [
      { name: uiText('facilities.reports.tabs.owner', { exact: true }), path: '/backend/facilities/reports/owner' },
      {
        name: uiText('facilities.reports.tabs.rentedHours', { exact: true }),
        path: '/backend/facilities/reports/rented-hours',
      },
    ],
    alias: { tab: 'rented-hours', path: '/backend/facilities/reports/rented-hours' },
  },
]

const FACILITY_ITEMS = [
  '/backend/facilities/calendar',
  '/backend/facilities/rentals',
  '/backend/facilities/requests',
  '/backend/facilities/zones',
  '/backend/facilities/logs',
  '/backend/facilities/reports/owner',
]

function pageTitle(page: Page) {
  return page.locator('header [aria-current="page"]')
}

async function chromeReady(page: Page) {
  await expect(page.getByTestId('backend-chrome-ready')).toHaveAttribute('data-ready', 'true')
}

test('TEST-N03 five admin pages with tabs: two clicks, tab routes, ?tab= aliases, hidden tabs and 403', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-n03-tabs')
  let limitedRoleId: string | null = null
  let limitedUserId: string | null = null
  try {
    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 1280, height: 900 })
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)

    // The facility group has six items; the secondary tab routes have no item of their own.
    await page.goto('/backend')
    await chromeReady(page)
    const sidebar = page.getByTestId('sidebar')
    const facilityGroup = sidebar
      .locator('[data-sidebar-group="true"]')
      .filter({ has: page.getByRole('button', { name: /^(Facilities|Obiekty|Facility|Obiekt)$/ }) })
    await expect(facilityGroup).toHaveCount(1)
    const facilityLinks = facilityGroup.locator('a[href^="/backend/facilities"]')
    await expect(facilityLinks).toHaveCount(FACILITY_ITEMS.length)
    expect(await facilityLinks.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')))).toEqual(
      FACILITY_ITEMS,
    )
    for (const hidden of [
      '/backend/club/contracts',
      '/backend/communication/cases',
      '/backend/facilities/closures',
      '/backend/facilities/rates',
      '/backend/facilities/incidents',
      '/backend/facilities/bans',
      '/backend/facilities/maintenance',
      '/backend/facilities/reports/rented-hours',
    ]) {
      await expect(sidebar.locator(`a[href="${hidden}"]`)).toHaveCount(0)
    }

    // Every tab is two clicks from the dashboard: the menu item, then the tab. The URL follows the tab, the title
    // keeps naming the page.
    for (const tabbed of PAGES) {
      for (const tab of tabbed.tabs) {
        await page.goto('/backend')
        await chromeReady(page)
        // The Facility group is the last of the mockup's group order (#494): its last item sits under the platform's
        // "scroll to bottom" chevron, which takes the pointer, so the item is opened from the keyboard.
        const item = page.getByTestId('sidebar').getByRole('link', { name: tabbed.menu })
        await item.focus()
        await page.keyboard.press('Enter')
        await expect(page).toHaveURL(new RegExp(`${tabbed.tabs[0].path}$`))
        const strip = page.getByRole('tablist', { name: tabbed.title })
        await expect(strip.getByRole('tab')).toHaveText(tabbed.tabs.map((entry) => entry.name))
        await strip.getByRole('tab', { name: tab.name }).click()
        await expect(page).toHaveURL(new RegExp(`${tab.path}$`))
        await expect(strip.getByRole('tab', { name: tab.name })).toHaveAttribute('aria-selected', 'true')
        await expect(pageTitle(page)).toHaveText(tabbed.title)
        await expect(page.getByText(uiText('auth.accessDenied.title'))).toHaveCount(0)
      }
    }

    // The mockup's `?tab=` on the first route redirects to the tab's route; an unknown value stays on the page.
    for (const tabbed of PAGES) {
      await page.goto(`${tabbed.tabs[0].path}?tab=${tabbed.alias.tab}`)
      await expect(page).toHaveURL(new RegExp(`${tabbed.alias.path}$`))
    }
    await page.goto('/backend/club/institutions?tab=unknown')
    await expect(page.getByRole('tablist', { name: PAGES[0].title })).toBeVisible()
    await expect(page).toHaveURL(/\/backend\/club\/institutions\?tab=unknown$/)

    // Axe on each page at 1280 px, en and pl, light and dark.
    await prepareForAccessibilityScan(page)
    const violations: Record<string, unknown> = {}
    for (const locale of ['en', 'pl']) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: new URL(page.url()).origin }])
      for (const tabbed of PAGES) {
        await page.goto(tabbed.tabs[0].path)
        Object.assign(
          violations,
          await scanInColorSchemes(
            page,
            testInfo,
            `${tabbed.tabs[0].path} ${locale}`,
            async () => {
              await expect(page.getByRole('tablist', { name: tabbed.title }).getByRole('tab')).toHaveCount(
                tabbed.tabs.length,
              )
            },
            { platformBaseline: true },
          ),
        )
      }
    }
    expect(violations).toEqual({})
    await page.context().addCookies([{ name: 'locale', value: 'en', url: new URL(page.url()).origin }])

    // Negative: `club_core.manage` without `club_core.contracts.manage` — no Contracts tab, so no strip, and 403.
    limitedRoleId = await createRoleFixture(request, club.superToken, {
      name: `test-n03-limited-${uniqueSuffix()}`,
      tenantId: club.tenant.tenantId,
    })
    await setRoleAclFeatures(request, club.superToken, {
      roleId: limitedRoleId,
      features: ['club_core.view', 'club_core.manage'],
    })
    const limitedEmail = `test-n03-limited-${uniqueSuffix()}@example.org`
    limitedUserId = await createUserFixture(request, club.superToken, {
      email: limitedEmail,
      password: `Vereino-${uniqueSuffix()}-Aa1!`,
      organizationId: club.tenant.organizationId,
      roles: [limitedRoleId],
    })
    await switchBrowserUser(page, request, club, limitedUserId, limitedEmail)
    await page.goto('/backend/club/institutions')
    await chromeReady(page)
    await expect(pageTitle(page)).toHaveText(PAGES[0].title)
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: uiText('club_core.institutions.tabs.institutions', { exact: true }),
      }),
    ).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('tablist')).toHaveCount(0)
    await expect(page.getByRole('tab', { name: uiText('club_core.contracts.title', { exact: true }) })).toHaveCount(0)
    await page.goto('/backend/club/contracts')
    await expect(page.getByText(uiText('auth.accessDenied.title'))).toBeVisible()
  } finally {
    if (limitedUserId) await deleteUserIfExists(request, club.superToken, limitedUserId)
    if (limitedRoleId) await deleteRoleIfExists(request, club.superToken, limitedRoleId)
    await club.cleanup()
  }
})
