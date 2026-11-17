import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { calendarDate, call, createClub } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addDays, createActivity } from '../_fixtures/activities'
import { ageCategoryOptions, createGroup, getGroup, listGroups, seedAgeCategories } from '../_fixtures/groups'
import { uiText } from '../_fixtures/ui-text'

// TEST-A01 (groups and activities parity spec REQ-A01, REQ-A02, AC-A01; issue #266; README B-11, B-12): the groups list
// filters "Public: yes" and shows the "Public" badge, the kind as a badge and "Category / level" (a team's age category,
// a class group's level); the group record keeps its tab under `?tab=` across a reload, saves the level on Details, and
// "Activities" opens the activities list filtered to the group, where "New activity" preselects it.
test.describe.configure({ timeout: 300_000 })

test('TEST-A01 groups list: Public filter and badge, Category / level; record tabs in the URL, the level on Details, the Activities link with a preselected group', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-a01-groups')
  try {
    const token = club.adminToken
    seedAgeCategories(club)
    const options = await ageCategoryOptions(request, token)
    const orlik = String(options.items.find((item) => item.value === 'orlik')?.id)
    const academy = await createStructure(request, token, 'sections', { name: 'Akademia piłkarska' })
    const pool = await createStructure(request, token, 'sections', { name: 'Basen' })
    const pitch = await createStructure(request, token, 'places', {
      name: 'Boisko A',
      kind: 'pitch',
      capacityGroups: 1,
    })
    const team = await createGroup(request, token, {
      sectionId: academy,
      name: 'Orliki 2016',
      kind: 'team',
      ageCategoryEntryId: orlik,
    })
    const swimmers = await createGroup(request, token, {
      sectionId: pool,
      name: 'Basen — początkujący',
      kind: 'class_group',
      isPublic: true,
      levelLabel: 'Fale 1',
    })
    const retired = await createGroup(request, token, {
      sectionId: academy,
      name: 'Żaki 2015',
      kind: 'team',
      isActive: false,
    })
    const mlodziki = await createGroup(request, token, { sectionId: academy, name: 'Młodziki 2013', kind: 'team' })
    const today = calendarDate()
    await createActivity(request, token, {
      groupId: team,
      name: 'Trening Orlików',
      type: 'training',
      placeId: pitch,
      startsOn: addDays(today, 7),
      startTime: '17:00',
      endTime: '18:00',
    })
    await createActivity(request, token, {
      groupId: mlodziki,
      name: 'Trening Młodzików',
      type: 'training',
      placeId: pitch,
      startsOn: addDays(today, 8),
      startTime: '17:00',
      endTime: '18:00',
    })

    // API: `isPublic` filters inside the record scope; the list carries the level.
    const publicOnly = await listGroups(request, token, '&isPublic=true')
    expect(publicOnly.status).toBe(200)
    expect(publicOnly.items.map((item) => item.id)).toEqual([swimmers])
    expect(publicOnly.items[0]).toMatchObject({ isPublic: true, levelLabel: 'Fale 1', kind: 'class_group' })
    expect((await listGroups(request, token, '&isPublic=false')).items.map((item) => item.id).sort()).toEqual(
      [team, retired, mlodziki].sort(),
    )
    expect((await call(request, 'GET', '/api/groups/groups?isPublic=yes', token)).status).toBe(400)

    // UI: the administrator.
    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, password)
    await prepareForAccessibilityScan(page)

    // B-11: the subtitle, the kind badge and "Category / level" per row.
    await page.goto('/backend/groups/groups')
    await expect(page.getByTestId('groups-subtitle')).toHaveText(uiText('groups.groups.subtitle', { exact: true }))
    await expect(page.getByRole('columnheader', { name: uiText('groups.groups.columns.categoryLevel') })).toBeVisible()
    const teamRow = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'Orliki 2016' }) })
    await expect(teamRow).toContainText('Orlik (U10–U11)')
    await expect(teamRow).toContainText(uiText('groups.groups.kind.team'))
    await expect(teamRow).toContainText(uiText('groups.common.no'))

    // "Public: yes" (the filter state lives in the URL, as every filter of the list): only the public class group, with
    // its level and the "Public" badge; it survives a reload.
    await page.goto('/backend/groups/groups?isPublic=true')
    const swimmersRow = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'Basen — początkujący' }) })
    await expect(swimmersRow).toContainText('Fale 1')
    await expect(swimmersRow).toContainText(uiText('groups.common.yes'))
    await expect(swimmersRow).toContainText(uiText('groups.groups.kind.class_group'))
    await expect(page.getByRole('link', { name: 'Orliki 2016' })).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('link', { name: 'Basen — początkujący' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Orliki 2016' })).toHaveCount(0)
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      'groups list',
      async () => {
        await expect(page.getByRole('link', { name: 'Basen — początkujący' })).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})

    // B-12: the tabs in the mockup's order; `?tab=details` survives a reload; the default is Roster.
    await page.goto(`/backend/groups/groups/${team}?tab=details`)
    const tabs = page.getByRole('tablist', { name: uiText('groups.groups.tabs.label', { exact: true }) })
    await expect(tabs.getByRole('tab')).toHaveText([
      uiText('groups.groups.tabs.details', { exact: true }),
      uiText('groups.groups.tabs.roster', { exact: true }),
      uiText('groups.groups.tabs.public', { exact: true }),
    ])
    const detailsTab = tabs.getByRole('tab', { name: uiText('groups.groups.tabs.details', { exact: true }) })
    await expect(detailsTab).toHaveAttribute('aria-selected', 'true')
    await page.reload()
    await expect(detailsTab).toHaveAttribute('aria-selected', 'true')
    await tabs.getByRole('tab', { name: uiText('groups.groups.tabs.roster', { exact: true }) }).click()
    await expect(page).toHaveURL(/\?tab=roster$/)
    await page.goto(`/backend/groups/groups/${team}`)
    await expect(tabs.getByRole('tab', { name: uiText('groups.groups.tabs.roster', { exact: true }) })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    // The level on Details; "Edit age categories" beside the category for those who edit the dictionary.
    await page.goto(`/backend/groups/groups/${team}?tab=details`)
    await page.locator('[data-crud-field-id="levelLabel"] input').fill('zaawansowani')
    await page
      .getByRole('button', { name: uiText('groups.common.save', { exact: true }) })
      .first()
      .click()
    await expect
      .poll(async () => (await getGroup(request, club.adminToken, team)).body?.levelLabel)
      .toBe('zaawansowani')
    const dictionaryCheck = await call<{ granted?: string[] }>(
      request,
      'POST',
      '/api/auth/feature-check',
      club.adminToken,
      { data: { features: ['dictionaries.manage'] } },
    )
    const editsDictionary = (dictionaryCheck.body?.granted ?? []).length > 0
    await expect(page.getByTestId('group-age-categories-link')).toHaveCount(editsDictionary ? 1 : 0)
    await expectNoPageOverflow(page)

    // "Activities" opens the activities of the group; "New activity" preselects it.
    await page.getByTestId('group-activities-link').click()
    await expect(page).toHaveURL(new RegExp(`/backend/activities/activities\\?groupId=${team}$`))
    await expect(page.getByRole('link', { name: 'Trening Orlików' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Trening Młodzików' })).toHaveCount(0)
    await page.getByRole('link', { name: uiText('activities.activities.actions.create', { exact: true }) }).click()
    await expect(page).toHaveURL(new RegExp(`/backend/activities/activities/create\\?groupId=${team}$`))
    await expect(page.locator('[data-crud-field-id="groupId"]')).toContainText('Orliki 2016')

    // The list at 375 px.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/backend/groups/groups')
    await expect(page.getByRole('link', { name: 'Orliki 2016' })).toBeVisible()
    await expectNoPageOverflow(page)
  } finally {
    await club.cleanup()
  }
})
