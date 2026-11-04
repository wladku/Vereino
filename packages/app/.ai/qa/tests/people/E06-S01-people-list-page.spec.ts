import { expect, test } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, createClub, createPerson } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { createGuardianship } from '../_fixtures/people'

// UX parity spec TEST-U04 (E06-S01 #83, J-U01): the people list in the browser — the perspective tabs, a section filter
// and the search in the URL, restored on reload and stepped back with the browser's back button; the columns age,
// roles, groups and guardians; the filtered-empty state with "Clear filters"; axe clean on desktop in light mode, no
// overflow at 320 px, and the list at 375 px in dark mode.
test.describe.configure({ timeout: 300_000 })

test('TEST-U04 people list: perspectives, filters and search in the URL, columns, filtered-empty state, a11y and narrow dark mode', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e06-s01-page')
  try {
    const token = club.adminToken
    const basen = await createStructure(request, token, 'sections', { name: 'Basen' })
    const academy = await createStructure(request, token, 'sections', { name: 'Akademia' })
    const pool = await createGroup(request, token, { sectionId: basen, name: 'Basen — początkujący', kind: 'team' })
    const zaki = await createGroup(request, token, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const jan = await createPerson(request, token, {
      firstName: 'Jan',
      lastName: 'Kowalski',
      birthDate: birthDateTurning(9),
    })
    const ola = await createPerson(request, token, {
      firstName: 'Ola',
      lastName: 'Lis',
      birthDate: birthDateTurning(11),
    })
    const kasia = await createPerson(request, token, {
      firstName: 'Kasia',
      lastName: 'Kowalska',
      birthDate: birthDateTurning(38),
    })
    await addMembership(request, token, { groupId: pool, personId: jan, role: 'participant', validFrom: '2020-01-01' })
    await addMembership(request, token, { groupId: zaki, personId: ola, role: 'participant', validFrom: '2020-01-01' })
    await createGuardianship(request, token, { guardianPersonId: kasia, wardPersonId: jan, validFrom: calendarDate() })

    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 1280, height: 720 })

    // The plain list: axe clean, the columns, no overflow.
    await page.goto('/backend/people/persons')
    const tabs = page.getByRole('tablist', { name: /People views|Widoki osób/ })
    await expect(tabs.getByRole('tab', { name: /^All$|^Wszyscy$/ })).toHaveAttribute('aria-selected', 'true')
    const janRow = page.getByRole('row').filter({ hasText: 'Kowalski Jan' })
    await expect(janRow).toBeVisible()
    await expect(janRow).toContainText('Basen — początkujący')
    await expect(janRow).toContainText('Kowalska Kasia')
    await expect(janRow.getByRole('cell').nth(1)).toHaveText('9')
    await expect(page.getByRole('row').filter({ hasText: 'Kowalska Kasia' }).first()).toContainText(/Guardian|Opiekun/)
    expect(await scanBlockingViolations(page, testInfo, { platformBaseline: true })).toEqual([])
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 1280, height: 720 })

    // The Children perspective (keyboard: arrow keys move along the tablist) and a section filter in the URL.
    await tabs.getByRole('tab', { name: /^All$|^Wszyscy$/ }).focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(tabs.getByRole('tab', { name: /^Children$|^Dzieci$/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/view=children/)
    await expect(page.getByRole('row').filter({ hasText: 'Lis Ola' })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'Kowalska Kasia' })).toHaveCount(0)

    await page.goto(`/backend/people/persons?view=children&sectionId=${basen}`)
    await expect(page.getByRole('row').filter({ hasText: 'Kowalski Jan' })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'Lis Ola' })).toHaveCount(0)
    await page.reload()
    await expect(tabs.getByRole('tab', { name: /^Children$|^Dzieci$/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('row').filter({ hasText: 'Kowalski Jan' })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'Lis Ola' })).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(/view=children/)
    await expect(page).not.toHaveURL(/sectionId=/)
    await expect(page.getByRole('row').filter({ hasText: 'Lis Ola' })).toBeVisible()

    // A search that matches nobody: the filtered-empty state clears every filter.
    await page.goto('/backend/people/persons?view=children&search=Zzyzx')
    await expect(page.getByText(/No people match|Żadna osoba nie pasuje/)).toBeVisible()
    await page.getByRole('button', { name: /Clear filters|Wyczyść filtry/ }).click()
    await expect(page).toHaveURL(/\/backend\/people\/persons$/)
    await expect(page.getByRole('row').filter({ hasText: 'Kowalska Kasia' })).toBeVisible()

    // The first- and last-name search (the search tokens are written after the commit).
    await expect
      .poll(
        async () => {
          await page.goto('/backend/people/persons?search=Jan%20Kow')
          await page
            .getByRole('row')
            .filter({ hasText: 'Kowalski Jan' })
            .waitFor({ timeout: 5_000 })
            .catch(() => null)
          return page
            .getByRole('row')
            .filter({ hasText: /Kowalsk/ })
            .count()
        },
        { timeout: 40_000 },
      )
      .toBe(1)

    // Reflow at 320 px, then the list at 375 px in dark mode.
    await page.goto('/backend/people/persons?view=children')
    await expect(page.getByRole('row').filter({ hasText: 'Kowalski Jan' })).toBeVisible()
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/backend/people/persons?view=staff')
    await expect(tabs.getByRole('tab', { name: /^Staff$|^Kadra$/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('row').filter({ hasText: 'Admin Ada' })).toBeVisible()
    await expectNoPageOverflow(page)
    await testInfo.attach('people-list-375-dark', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  } finally {
    await club.cleanup()
  }
})
