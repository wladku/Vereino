import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { assignRole, birthDateTurning, createClub, createStaff, expectRoles, uniqueSuffix } from '../_fixtures/club'
import { create, getOne, signInBrowser } from '../_fixtures/club-structure'
import { createGroup } from '../_fixtures/groups'
import { publish, putSectionPublic } from '../_fixtures/publication'

// TEST-U07 (UX parity spec REQ-U02, J-U02, AC-U03, AC-U04; issue #85): the sections list shows the Groups and Public
// columns; Deactivate goes through a confirmation and a refused deactivation lists the active groups; the section
// page opens the tab named by `?tab=`; a coordinator assignment takes an "until" date; the section's coordinator sets
// the short description, which the public club page shows on the section tile. 375 px, light and dark, axe.
test.describe.configure({ timeout: 300_000 })

test('TEST-U07 sections list, deactivation dialog, tabs, coordinator end date, short description on P-01', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-u07-sections')
  try {
    page.setDefaultTimeout(30_000)
    let token = club.adminToken
    const slug = `u07-${uniqueSuffix()}`
    const pool = await create(request, token, 'sections', { name: 'Basen' })
    const chess = await create(request, token, 'sections', { name: 'Szachy' })
    await createGroup(request, token, { sectionId: pool, name: 'Basen — początkujący', kind: 'class_group' })
    await createGroup(request, token, { sectionId: pool, name: 'Basen — zaawansowani', kind: 'class_group' })
    expect((await putSectionPublic(request, token, pool, { isPublic: true, publicSlug: 'basen' })).status).toBe(200)
    await publish(request, token, slug, [], { shortName: 'Klub Delfin' })
    const marek = await createStaff(request, club, {
      firstName: 'Marek',
      lastName: 'Basenowy',
      birthDate: birthDateTurning(40),
    })
    await createStaff(request, club, { firstName: 'Ewa', lastName: 'Wrona', birthDate: birthDateTurning(35) })

    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 1280, height: 900 })
    const violations: Record<string, unknown> = {}
    // The browser sign-in sets a new password, which ends the earlier API session: sign the API in again.
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    token = await getAuthToken(request, club.tenant.email, password)
    club.adminToken = token

    // The list: Groups 2 and 0, Public yes and no.
    await page.goto('/backend/club/sections')
    await expect(page.getByTestId(`section-groups-${pool}`)).toHaveText('2')
    await expect(page.getByTestId(`section-groups-${chess}`)).toHaveText('0')
    const poolRow = page.getByRole('row').filter({ hasText: 'Basen' })
    await expect(poolRow.getByText(/^(Yes|Tak)$/)).toBeVisible()
    await expect(
      page
        .getByRole('row')
        .filter({ hasText: 'Szachy' })
        .getByText(/^(No|Nie)$/),
    ).toBeVisible()
    Object.assign(
      violations,
      await scanInColorSchemes(
        page,
        testInfo,
        'sections list',
        async () => {
          await expect(page.getByTestId(`section-groups-${pool}`)).toHaveText('2')
        },
        { platformBaseline: true },
      ),
    )

    // Deactivate the pool: confirm, then the 409 dialog lists both groups; the section stays active.
    await poolRow.getByRole('button', { name: /Open actions|Otwórz akcje/ }).click()
    await page.getByRole('menuitem', { name: /^(Deactivate|Dezaktywuj)$/ }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /^(Deactivate|Dezaktywuj)$/ })
      .click()
    const dialog = page.getByTestId('section-in-use-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'Basen — początkujący' })).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'Basen — zaawansowani' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect((await getOne(request, token, 'sections', pool))?.isActive).toBe(true)

    // Deactivating the section without groups succeeds.
    const chessRow = page.getByRole('row').filter({ hasText: 'Szachy' })
    await chessRow.getByRole('button', { name: /Open actions|Otwórz akcje/ }).click()
    await page.getByRole('menuitem', { name: /^(Deactivate|Dezaktywuj)$/ }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /^(Deactivate|Dezaktywuj)$/ })
      .click()
    await expect(chessRow.getByText(/^(Inactive|Nieaktywna)$/)).toBeVisible()

    // `?tab=coordinators` opens the Coordinators tab; an assignment with an end date shows it.
    await page.goto(`/backend/club/sections/${pool}/edit?tab=coordinators`)
    await expect(page.getByRole('tab', { name: /^(Coordinators|Koordynatorzy)$/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const panel = page.getByRole('region', { name: /^Coordinators$|^Koordynatorzy$/ })
    await panel.getByPlaceholder(/Search by last name|Szukaj po nazwisku/).fill('Wrona')
    await panel.getByRole('option', { name: /Ewa Wrona/ }).click()
    await panel.getByTestId('section-coordinator-valid-to').fill('2030-06-30')
    await panel.getByRole('button', { name: /Assign coordinator|Przypisz koordynatora/ }).click()
    await expect(panel.getByRole('listitem').filter({ hasText: 'Ewa Wrona' })).toContainText('2030-06-30')
    Object.assign(
      violations,
      await scanInColorSchemes(
        page,
        testInfo,
        'section page (coordinators tab)',
        async () => {
          await expect(page.getByRole('tab', { name: /^(Coordinators|Koordynatorzy)$/ })).toHaveAttribute(
            'aria-selected',
            'true',
          )
        },
        { platformBaseline: true },
      ),
    )
    // Switching tabs updates the URL.
    await page.getByRole('tab', { name: /^(Public page|Strona publiczna)$/ }).click()
    await expect(page).toHaveURL(/tab=public/)

    // The section's coordinator sets the short description; the club page tile shows it.
    await assignRole(request, token, {
      personId: marek.personId,
      role: 'coordinator',
      sectionId: pool,
      validFrom: '2020-01-01',
    })
    await expectRoles(request, club, marek.userId, ['vereino_coordinator', 'vereino_member'])
    await page.context().clearCookies()
    await signInBrowser(page, request, club, marek.userId, marek.email)
    await page.goto(`/backend/club/sections/${pool}/edit?tab=public`)
    await expect(page.getByRole('tab', { name: /^(Public page|Strona publiczna)$/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const publicPanel = page.getByTestId('section-public-panel')
    await publicPanel.locator('[data-crud-field-id="shortDescription"] textarea').fill('Nauka pływania od 6 lat.')
    await publicPanel
      .getByRole('button', { name: /Save public page|Zapisz stronę publiczną/ })
      .first()
      .click()
    await expect(page.getByText(/Public page saved|Strona publiczna zapisana/).first()).toBeVisible()
    await page.goto(`/p/${slug}`)
    await expect(page.getByTestId('public-section-basen-short')).toHaveText('Nauka pływania od 6 lat.')

    // 375 px: the section page's tabs and the list stay usable, and the pages reflow at 320 px.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/backend/club/sections/${pool}/edit?tab=public`)
    await expect(page.getByRole('tab', { name: /^(Public page|Strona publiczna)$/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    Object.assign(
      violations,
      await scanInColorSchemes(
        page,
        testInfo,
        'section page (public tab, coordinator, 375 px)',
        async () => {
          await expect(page.getByTestId('section-public-panel')).toBeVisible()
        },
        { platformBaseline: true },
      ),
    )
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/backend/club/sections')
    await expect(page.getByRole('heading', { level: 1, name: /^(Sections|Sekcje)$/ })).toBeVisible()
    await expectNoPageOverflow(page)

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
