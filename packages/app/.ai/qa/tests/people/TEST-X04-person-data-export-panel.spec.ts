import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { assignRole, birthDateTurning, createClub, createPerson, createStaff } from '../_fixtures/club'
import { create, signInBrowser, signOutBrowser } from '../_fixtures/club-structure'
import { exportLogRows } from '../_fixtures/data-export'
import { uiText } from '../_fixtures/ui-text'

// Person data export spec (#527, phase X3, J-X01): TEST-X04 — on the person record's Details tab the club
// administrator presses "Export personal data" in English and in Polish, at 375 px, and the browser downloads
// `person-data-YYYY-MM-DD.json` with the person's data; the success flash says the export was logged. A coordinator
// (without `people.persons.export`) does not see the panel. Axe reports no blocking violation in light and dark mode.
test.describe.configure({ timeout: 360_000 })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

test('TEST-X04 the administrator exports a person from the record; the panel is hidden for a coordinator', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-x04-export-panel')
  try {
    const person = await createPerson(request, club.adminToken, {
      firstName: 'Zosia',
      lastName: 'Eksportowa',
      birthDate: birthDateTurning(25),
      email: 'zosia-eksportowa@example.org',
    })
    // A coordinator (set up before the browser sign-in, which ends the administrator's API token).
    const sectionId = await create(request, club.adminToken, 'sections', { name: 'Sekcja panelu' })
    const coordinator = await createStaff(request, club, {
      firstName: 'Celina',
      lastName: 'Koordynatorka',
      birthDate: birthDateTurning(44),
    })
    await assignRole(request, club.adminToken, {
      personId: coordinator.personId,
      role: 'coordinator',
      sectionId,
      validFrom: '2020-01-01',
    })
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 800 })

    for (const locale of ['en', 'pl'] as const) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
      await page.goto(`/backend/people/persons/${person}?tab=details`)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      const panel = page.getByTestId('people-data-export-panel')
      await expect(panel).toContainText(uiText('people.dataExport.title'))
      const button = panel.getByTestId('people-data-export-button')
      await expect(button).toHaveText(uiText('people.dataExport.action', { exact: true }))
      const downloading = page.waitForEvent('download')
      await button.click()
      const download = await downloading
      expect(download.suggestedFilename()).toMatch(/^person-data-\d{4}-\d{2}-\d{2}\.json$/)
      const file = JSON.parse(await readFile(await download.path(), 'utf8')) as {
        format: string
        subject: { id: string; firstName: string }
      }
      expect(file.format).toBe('vereino.person-data-export')
      expect(file.subject).toMatchObject({ id: person, firstName: 'Zosia' })
      await expect(page.getByText(uiText('people.dataExport.flash.done'))).toBeVisible()
      await expect(button).toBeEnabled()
    }
    expect(await exportLogRows(person)).toHaveLength(2)

    const violations = await scanInColorSchemes(
      page,
      testInfo,
      'B-10 ?tab=details data requests',
      async () => {
        await expect(page.getByTestId('people-data-export-panel')).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})

    // A coordinator reads the record without the panel.
    await signOutBrowser(page)
    await signInBrowser(page, request, club, coordinator.userId, coordinator.email)
    await page.goto(`/backend/people/persons/${person}?tab=details`)
    await expect(page.locator('h1').first()).toContainText('Zosia')
    await expect(page.getByTestId('people-data-export-panel')).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
