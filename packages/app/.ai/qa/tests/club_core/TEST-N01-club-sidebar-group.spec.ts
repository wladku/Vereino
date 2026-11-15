import { expect, test, type Page } from '@playwright/test'
import { assignRole, birthDateTurning, createClub, createStaff } from '../_fixtures/club'
import { create, signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'

// TEST-N01, Club group part (navigation spec REQ-N01, DD-N01; issue #246): the test reads the sidebar itself, not
// URLs. The administrator's main sidebar lists the Club group — Sections, Places, Institutions, Contracts, Settings,
// Publication, in that order — after the chrome payload of `/api/auth/admin/nav` has replaced the layout's first
// paint, and a Club page never opens the settings sidebar. A coordinator sees Sections only. Fails on `a312199`,
// where `pageContext: 'settings'` on Publication made `/backend/club` a settings prefix and hid the group.
test.describe.configure({ timeout: 300_000 })

const CLUB_ITEMS = [
  '/backend/club/sections',
  '/backend/club/places',
  '/backend/club/institutions',
  '/backend/club/contracts',
  '/backend/club/settings',
  '/backend/club/publication',
]

async function clubGroupLinks(page: Page, path: string) {
  await page.goto(path)
  // The chrome payload (with the platform's settings prefixes) has loaded, not only the first paint.
  await expect(page.getByTestId('backend-chrome-ready')).toHaveAttribute('data-ready', 'true')
  const group = page
    .getByTestId('sidebar')
    .locator('[data-sidebar-group="true"]')
    .filter({ has: page.getByRole('button', { name: /^(Club|Klub)$/ }) })
  await expect(group).toHaveCount(1)
  return group.locator('a[href^="/backend/club"]')
}

test('TEST-N01 the Club group is in the main sidebar for the administrator and the coordinator', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-n01-club-sidebar')
  try {
    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 1280, height: 900 })
    const pool = await create(request, club.adminToken, 'sections', { name: 'Basen' })
    const marek = await createStaff(request, club, {
      firstName: 'Marek',
      lastName: 'Koordynator',
      birthDate: birthDateTurning(41),
    })
    await assignRole(request, club.adminToken, {
      personId: marek.personId,
      role: 'coordinator',
      sectionId: pool,
      validFrom: '2020-01-01',
    })

    // The administrator on the dashboard: the six Club items in the mockup's order.
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    let links = await clubGroupLinks(page, '/backend')
    await expect(links).toHaveCount(CLUB_ITEMS.length)
    expect(await links.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')))).toEqual(
      CLUB_ITEMS,
    )

    // On the Places page the main sidebar is shown, not the settings sidebar, and the Places item is active.
    links = await clubGroupLinks(page, '/backend/club/places')
    await expect(page.getByTestId('appshell-section-sidebar')).toHaveCount(0)
    await expect(links.and(page.locator('.bg-muted.text-foreground'))).toHaveAttribute('href', '/backend/club/places')

    // Settings and Publication are items of the Club group (D-031 §1), not pages of the settings sidebar.
    for (const path of ['/backend/club/settings', '/backend/club/publication']) {
      links = await clubGroupLinks(page, path)
      await expect(page.getByTestId('appshell-section-sidebar')).toHaveCount(0)
      await expect(links.and(page.locator('.bg-muted.text-foreground'))).toHaveAttribute('href', path)
    }

    // A coordinator (`club_core.view`) sees Sections only.
    await switchBrowserUser(page, request, club, marek.userId, marek.email)
    links = await clubGroupLinks(page, '/backend')
    expect(await links.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')))).toEqual([
      '/backend/club/sections',
    ])
  } finally {
    await club.cleanup()
  }
})
