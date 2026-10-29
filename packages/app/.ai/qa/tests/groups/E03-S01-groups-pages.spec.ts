import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { birthDateTurning, createClub, createPerson, createStaff } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup, createSeason } from '../_fixtures/groups'

// Issue #30 pages (club spec UI table: `/backend/groups/groups` + `create`, `[id]`, tabs "Seasons" and "External
// teams"): the list, a group created through the form, the group record with its roster at 375 px in dark mode, the
// tabs, no new critical or serious axe violation outside the platform baseline and no page overflow at 320 px; a
// member without `groups.view` gets the permission-denied state.
test.describe.configure({ timeout: 300_000 })

test('E03-S01 groups pages: list, create, record with roster at 375 px in dark mode, seasons and external teams; Access denied without groups.view', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e03-s01-pages')
  try {
    const academy = await createStructure(request, club.adminToken, 'sections', { name: 'Akademia piłkarska' })
    await createSeason(request, club.adminToken, { name: '2026/2027', startsOn: '2026-08-01', endsOn: '2027-06-30' })
    const team = await createGroup(request, club.adminToken, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const child = await createPerson(request, club.adminToken, {
      firstName: 'Jan',
      lastName: 'Kowalski',
      birthDate: birthDateTurning(8),
    })
    await addMembership(request, club.adminToken, {
      groupId: team,
      personId: child,
      role: 'participant',
      validFrom: '2026-01-01',
    })

    page.setDefaultTimeout(30_000)
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    // Setting the password ends the administrator's earlier sessions: later API calls use a fresh token.
    club.adminToken = await getAuthToken(request, club.tenant.email, adminPassword)
    // Accessibility (desktop, light, before the narrow pass collapses the sidebar) and reflow at 320 px on every
    // groups page.
    await prepareForAccessibilityScan(page)
    const viewport = { width: 1280, height: 720 }
    const violationsByPage: Record<string, unknown> = {}
    for (const { path, shows } of [
      { path: '/backend/groups/groups', shows: 'Żaki' },
      { path: '/backend/groups/groups/create' },
      { path: `/backend/groups/groups/${team}`, shows: 'Jan Kowalski' },
      { path: '/backend/groups/seasons', shows: '2026/2027' },
      { path: '/backend/groups/seasons/create' },
      { path: '/backend/groups/external-teams' },
      { path: '/backend/groups/external-teams/create' },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto(path)
      if (shows) await expect(page.getByText(shows).first()).toBeVisible()
      await expect(page.getByText(/Access Denied|Brak dostępu/)).toHaveCount(0)
      const violations = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      if (violations.length > 0) violationsByPage[path] = violations
      await expectNoPageOverflow(page)
    }
    expect(violationsByPage).toEqual({})

    // The narrow pass: 375 px in dark mode.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ colorScheme: 'dark' })

    // The list with its tabs.
    await page.goto('/backend/groups/groups')
    await expect(page.getByRole('heading', { level: 1, name: /^Groups$|^Grupy$/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Żaki' })).toBeVisible()
    for (const name of [/^Groups$|^Grupy$/, /^Seasons$|^Sezony$/, /External teams|Drużyny zewnętrzne/]) {
      await expect(page.getByRole('tab', { name })).toBeVisible()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

    // A class group created through the form opens its record.
    await page.goto('/backend/groups/groups/create')
    // CrudForm labels are not bound to their inputs; its field containers carry `data-crud-field-id`.
    await page.locator('[data-crud-field-id="name"] input').fill('Basen — początkujący')
    await page.locator('[data-crud-field-id="kind"] [role="combobox"]').click()
    await page.getByRole('option', { name: /Class group|Grupa zajęciowa/ }).click()
    await page.locator('[data-crud-field-id="sectionId"] [role="combobox"]').click()
    await page.getByRole('option', { name: 'Akademia piłkarska' }).click()
    // The team fields are hidden for a class group.
    await expect(page.locator('[data-crud-field-id="league"]')).toHaveCount(0)
    await page
      .getByRole('button', { name: /^Create$|^Utwórz$/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/backend\/groups\/groups\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Basen — początkujący' })).toBeVisible()
    await expect(page.getByText(/Nobody belongs to this group yet|Nikt jeszcze nie należy/)).toBeVisible()

    // The team's record: the roster with the person, the role, the period and the end action.
    await page.goto(`/backend/groups/groups/${team}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Żaki' })).toBeVisible()
    await expect(page.getByText('Jan Kowalski')).toBeVisible()
    await expect(
      page.getByRole('button', { name: /End membership: Jan Kowalski|Zakończ członkostwo: Jan Kowalski/ }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /^Add to group$|^Dodaj do grupy$/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await page.getByRole('tab', { name: /^Details$|^Szczegóły$/ }).click()
    await expect(page.locator('[data-crud-field-id="league"]')).toBeVisible()

    // The seasons and external teams tabs.
    await page.goto('/backend/groups/groups')
    await page.getByRole('tab', { name: /^Seasons$|^Sezony$/ }).click()
    await expect(page).toHaveURL(/\/backend\/groups\/seasons$/)
    await expect(page.getByText('2026/2027')).toBeVisible()
    await page.goto('/backend/groups/external-teams')
    await expect(page.getByRole('heading', { level: 1, name: /External teams|Drużyny zewnętrzne/ })).toBeVisible()

    // A member without groups.view gets the platform's permission-denied state and no group data.
    const member = await createStaff(request, club, {
      firstName: 'Michal',
      lastName: 'Czlonek',
      birthDate: birthDateTurning(30),
    })
    await page.context().clearCookies()
    await signInBrowser(page, request, club, member.userId, member.email)
    for (const path of ['/backend/groups/groups', `/backend/groups/groups/${team}`, '/backend/groups/seasons']) {
      await page.goto(path)
      await expect(page.getByText(/Access Denied|Brak dostępu/)).toBeVisible()
      await expect(page.getByText('Jan Kowalski')).toHaveCount(0)
    }
  } finally {
    await club.cleanup()
  }
})
