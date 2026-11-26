import { expect, test, type Page } from '@playwright/test'
import { assignRole, birthDateTurning, createClub, createStaff } from '../_fixtures/club'
import { create, signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { uiText, uiTextIn } from '../_fixtures/ui-text'

// TEST-N01, Club group part (navigation spec REQ-N01, DD-N01; issue #246): the test reads the sidebar itself, not
// URLs. The administrator's main sidebar lists the Club group — Sections, Places, Institutions and contracts (Contracts
// is its tab since #256, REQ-N02), Settings, Publication, in that order — after the chrome payload of
// `/api/auth/admin/nav` has replaced the layout's first paint, and a Club page never opens the settings sidebar. A coordinator sees Sections only. Fails on `a312199`,
// where `pageContext: 'settings'` on Publication made `/backend/club` a settings prefix and hid the group.
test.describe.configure({ timeout: 300_000 })

const CLUB_ITEMS = [
  '/backend/club/sections',
  '/backend/club/places',
  '/backend/club/institutions',
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
    .filter({ has: page.getByRole('button', { name: uiText('club_core.institutions.type.club', { exact: true }) }) })
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

    // The administrator on the dashboard: the five Club items in the mockup's order.
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
    // … and no Finance group (AC-N01, #602): no group is named Finanse / Finance and no item leads to a payments page.
    const sidebar = page.getByTestId('sidebar')
    await expect(
      sidebar
        .locator('[data-sidebar-group="true"]')
        .filter({ has: page.getByRole('button', { name: uiText('payments.nav.group', { exact: true }) }) }),
    ).toHaveCount(0)
    await expect(sidebar.locator('a[href^="/backend/payments"]')).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})

// TEST-N01, groups and items part (navigation spec REQ-N01 and its glossary, D-031 §1–2; issue #494): the
// administrator's sidebar starts with the mockup's six groups in the mockup's order — Klub, Ludzie, Zajęcia (one group
// for groups, activities and sessions, no "Harmonogram"), Komunikacja, Finanse, Obiekt — and each item carries the
// mockup's short menu label ("Ustawienia", not the page title "Ustawienia klubu"). Fails on `146858ee`. AC-N01 (#602):
// the order and the labels hold in pl and in en, each label being the exact text of that locale's catalog, and the
// platform's Dashboard item (the sidebar's home link to `/backend`) comes first, before the six groups.
const GROUPS: { key: string; items: [string, string][] }[] = [
  {
    key: 'club_core.nav.group',
    items: [
      ['/backend/club/sections', 'club_core.sections.title'],
      ['/backend/club/places', 'club_core.places.title'],
      ['/backend/club/institutions', 'club_core.institutions.page.title'],
      ['/backend/club/settings', 'club_core.nav.settings'],
      ['/backend/club/publication', 'club_core.nav.publication'],
    ],
  },
  {
    key: 'people.nav.group',
    items: [
      ['/backend/people/persons', 'people.persons.title'],
      ['/backend/enrolment/applications', 'enrolment.backend.title'],
    ],
  },
  {
    key: 'groups.nav.group',
    items: [
      ['/backend/groups/groups', 'groups.groups.title'],
      ['/backend/activities/activities', 'activities.activities.title'],
      ['/backend/activities/club-events', 'activities.clubEvents.title'],
      ['/backend/activities/occurrences', 'activities.occurrences.title'],
      ['/backend/training/outlines', 'training.list.title'],
      ['/backend/activities/reports/coach-units', 'activities.reports.coachUnits.title'],
      ['/backend/activities/reports/declaration-share', 'activities.reports.declarationShare.title'],
      ['/backend/activities/policies', 'activities.policies.title'],
    ],
  },
  { key: 'communication.nav.group', items: [['/backend/communication/threads', 'communication.threads.page.title']] },
  {
    key: 'payments.nav.group',
    items: [
      ['/backend/payments/fees', 'payments.fees.title'],
      ['/backend/payments/charges', 'payments.charges.title'],
      ['/backend/payments/bank', 'payments.bank.title'],
      ['/backend/payments/orders', 'payments.orders.title'],
      ['/backend/payments/cash-custody', 'payments.cashCustody.title'],
    ],
  },
  {
    key: 'facilities.nav.group',
    items: [
      ['/backend/facilities/calendar', 'facilities.nav.calendar'],
      ['/backend/facilities/rentals', 'facilities.rentals.title'],
      ['/backend/facilities/requests', 'facilities.nav.requests'],
      ['/backend/facilities/zones', 'facilities.rules.title'],
      ['/backend/facilities/logs', 'facilities.records.title'],
      ['/backend/facilities/reports/owner', 'facilities.reports.owner.title'],
    ],
  },
]

async function setLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

test('TEST-N01 the sidebar has Dashboard first, then the mockup groups in the mockup order, with the menu labels, in pl and en', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-n01-sidebar-groups')
  try {
    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 1280, height: 900 })
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    for (const locale of ['pl', 'en'] as const) {
      await setLocale(page, locale)
      await page.goto('/backend')
      await expect(page.getByTestId('backend-chrome-ready')).toHaveAttribute('data-ready', 'true')
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      const nav = page.getByTestId('sidebar')
      // Dashboard first: the first link of the sidebar column is the platform's Dashboard item, and the next one is the
      // first item of the first group (Klub → Sekcje), so nothing stands between Dashboard and the six groups.
      const column = await nav.evaluate((element) =>
        Array.from(element.closest('aside')?.querySelectorAll('a[href]') ?? []).map((anchor) => ({
          href: anchor.getAttribute('href'),
          label: anchor.getAttribute('aria-label'),
        })),
      )
      // Its accessible name is the brand followed by the catalog text ("Vereino – Przejdź do pulpitu").
      expect(column[0]?.href, `${locale}: Dashboard first`).toBe('/backend')
      expect(column[0]?.label, `${locale}: Dashboard first`).toContain(uiTextIn(locale, 'appShell.goToDashboard'))
      expect(column[1]?.href, `${locale}: the first group follows Dashboard`).toBe(GROUPS[0].items[0][0])
      const groups = nav.locator('[data-sidebar-group="true"]')
      // Every group's name (the first span of its toggle) and its items: href and the label span (the one without a class).
      const sidebar = await groups.evaluateAll((elements) =>
        elements.map((group) => ({
          name: group.querySelector('button > span')?.textContent?.trim() ?? '',
          items: Array.from(group.querySelectorAll('a[href]')).map((anchor) => ({
            href: anchor.getAttribute('href'),
            label:
              Array.from(anchor.children)
                .find((child) => child.tagName === 'SPAN' && !child.getAttribute('class'))
                ?.textContent?.trim() ?? '',
          })),
        })),
      )
      expect(sidebar.length).toBeGreaterThanOrEqual(GROUPS.length)
      GROUPS.forEach((expected, index) => {
        const actual = sidebar[index]
        expect(actual.name, `${locale}: ${expected.key}`).toBe(uiTextIn(locale, expected.key))
        expect(
          actual.items.map((item) => item.href),
          `${locale}: ${expected.key}`,
        ).toEqual(expected.items.map(([href]) => href))
        expected.items.forEach(([href, labelKey], itemIndex) => {
          expect(actual.items[itemIndex].label, `${locale}: ${href}`).toBe(uiTextIn(locale, labelKey))
        })
      })
    }
  } finally {
    await club.cleanup()
  }
})
