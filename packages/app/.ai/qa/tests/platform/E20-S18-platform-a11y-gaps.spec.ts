import { expect, test, type Page } from '@playwright/test'
import {
  expectNoPageOverflow,
  prepareForAccessibilityScan,
  scanBlockingViolations,
  scanInColorSchemes,
} from '../_fixtures/axe'
import { birthDateTurning, createClub, createPerson, createStaff } from '../_fixtures/club'
import { create as createStructure, signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { uiText } from '../_fixtures/ui-text'

// E20-S18 (#497): gaps inside Open Mercato components, worked around on the Vereino side.
// - B-10 (person record), "Add person" and "New fee schedule": `CrudForm` controls are named by their labels, so axe
//   finds no `label` or `button-name` violation although the platform baseline no longer lists them; light and dark.
// - The table search box has a name; the AppShell breadcrumb and brand link pass axe without a baseline entry.
// - A list whose API answers 500 shows its own message with "Try again" — not the server's "Internal error" and no
//   loading text under it (negative case) — and "Try again" loads the rows; also at 375 px.
// - The access-denied page offers the dashboard and signing out.
// The 401 of `/api/auth/feature-check` on `/login` is the platform sign-in form's own session probe (`login.tsx`); it is
// reported upstream, not worked around (it would need the form ejected).
test.describe.configure({ timeout: 300_000 })

const SECTIONS_API = '**/api/club_core/sections?*'

async function setLocale(page: Page, locale: 'en' | 'pl'): Promise<void> {
  if (!page.url().startsWith('http')) await page.goto('/backend')
  await page.context().addCookies([{ name: 'locale', value: locale, url: new URL(page.url()).origin }])
}

test('E20-S18 platform accessibility gaps are worked around in Vereino', async ({ page, request }, testInfo) => {
  const club = await createClub(request, 'e20-s18-platform-a11y')
  try {
    await createStructure(request, club.adminToken, 'sections', { name: 'Pływanie' })
    const person = await createPerson(request, club.adminToken, {
      firstName: 'Ola',
      lastName: 'Etykieta',
      birthDate: birthDateTurning(30),
    })
    // Created before the browser sign-in, which ends the admin's API token (lesson `sign-in-browser-ends-the-api-token`).
    const member = await createStaff(request, club, {
      firstName: 'Bez',
      lastName: 'Uprawnien',
      birthDate: birthDateTurning(30),
    })
    await prepareForAccessibilityScan(page)
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)

    for (const locale of ['pl', 'en'] as const) {
      await setLocale(page, locale)
      // CrudForm fields are reachable by their labels; the select trigger keeps its shown text in its name.
      await page.goto('/backend/people/persons/create')
      const firstName = page.locator('[data-crud-field-id="firstName"]')
      await expect(firstName.locator('input')).toBeVisible()
      const labelText = (await firstName.locator('label').first().innerText()).replace(/\s+/g, ' ').trim()
      await expect(page.getByLabel(labelText, { exact: true }).first()).toBeVisible()

      const violations: Record<string, unknown> = {}
      for (const [label, path, ready] of [
        ['add person', '/backend/people/persons/create', '[data-crud-field-id="firstName"] input'],
        ['new fee schedule', '/backend/payments/fees/create', '[data-crud-field-id] input'],
        ['person record (B-10)', `/backend/people/persons/${person}?tab=details`, '[data-crud-field-id] input'],
        ['sections list', '/backend/club/sections', 'table'],
      ] as const) {
        await page.goto(path)
        Object.assign(
          violations,
          await scanInColorSchemes(
            page,
            testInfo,
            `${label} ${locale}`,
            async () => {
              await expect(page.locator(ready).first()).toBeVisible()
            },
            { platformBaseline: true },
          ),
        )
      }
      expect(violations).toEqual({})
    }

    // The table search box is named, not only by its placeholder.
    await page.goto('/backend/club/sections')
    await expect(
      page.getByRole('searchbox', { name: uiText('club_core.sections.search', { exact: true }) }),
    ).toHaveAttribute('aria-label', uiText('club_core.sections.search', { exact: true }))

    // A list that cannot load: its own message, "Try again", no raw server text and no loading text below.
    let failing = true
    await page.route(SECTIONS_API, async (route) => {
      if (failing) await route.fulfill({ status: 500, json: { error: 'Internal error' } })
      else await route.continue()
    })
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/backend/club/sections')
      const failure = page.getByTestId('table-load-error')
      await expect(failure).toBeVisible({ timeout: 30_000 })
      await expect(failure).toContainText(uiText('club_core.sections.errors.load'))
      const retry = failure.getByRole('button', { name: uiText('club_core.common.retry') })
      await expect(retry).toBeVisible()
      // The table scrolls sideways at 375 px; the message and its action stay on screen, not centred off it.
      const box = await retry.boundingBox()
      expect(box && box.x >= 0 && box.x + box.width <= width).toBe(true)
      await expect(page.getByText('Internal error')).toHaveCount(0)
      await expect(page.getByText(uiText('ui.dataTable.loading'))).toHaveCount(0)
      await expect(page.locator('main').getByText(uiText('ui.spinner.srOnly'))).toHaveCount(0)
      const blocking = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      expect(blocking).toEqual([])
      if (width === 375) await expectNoPageOverflow(page)
    }
    await page.setViewportSize({ width: 1280, height: 800 })
    failing = false
    await page.getByTestId('table-load-error').getByRole('button').click()
    await expect(page.getByRole('cell', { name: 'Pływanie' })).toBeVisible()
    await expect(page.getByTestId('table-load-error')).toHaveCount(0)
    await page.unroute(SECTIONS_API)

    // Access denied: a way on besides the dashboard.
    await switchBrowserUser(page, request, club, member.userId, member.email)
    await page.goto('/backend/payments/fees')
    await expect(page.getByText(uiText('auth.accessDenied.title'))).toBeVisible()
    const actions = page.getByTestId('access-denied-actions')
    await expect(actions.getByRole('link', { name: uiText('auth.accessDenied.dashboard') })).toHaveAttribute(
      'href',
      '/backend',
    )
    await actions.getByRole('button', { name: uiText('vereino.accessDenied.signOut') }).click()
    await expect(page).toHaveURL(/\/login/)
  } finally {
    await club.cleanup()
  }
})
