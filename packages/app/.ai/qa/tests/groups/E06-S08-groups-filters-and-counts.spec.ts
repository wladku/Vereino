import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, createClub, createPerson } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup, createSeason, listGroups, roster, signedInStaff } from '../_fixtures/groups'

// Issue #90 (E06-S08; README B-11, B-12): the groups list filters by section, kind, season and status inside the
// record scope, keeps the filters and the perspective (All / Teams / Class groups) in the URL, and shows each group's
// coaches and active participants (an ended membership does not count); the roster shows the age and links the name
// to the person record; a coordinator filtering by another section sees no rows; the empty state offers "Add group".
test.describe.configure({ timeout: 300_000 })

test('E06-S08 groups list: filters, perspectives in the URL, coaches and participant counts, roster age and person link; no rows outside the scope', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e06-s08-groups')
  try {
    const token = club.adminToken
    const academy = await createStructure(request, token, 'sections', { name: 'Akademia piłkarska' })
    const pool = await createStructure(request, token, 'sections', { name: 'Basen' })
    const season = await createSeason(request, token, {
      name: '2026/2027',
      startsOn: '2026-08-01',
      endsOn: '2027-06-30',
    })
    const orliki = await createGroup(request, token, {
      sectionId: academy,
      name: 'Orliki',
      kind: 'team',
      seasonId: season,
    })
    const zaki = await createGroup(request, token, { sectionId: academy, name: 'Żaki', kind: 'team', isActive: false })
    const swimmers = await createGroup(request, token, {
      sectionId: pool,
      name: 'Basen — początkujący',
      kind: 'class_group',
    })

    // Orliki: 14 active participants, one ended membership, a coach and an assistant.
    const yesterday = calendarDate(-1)
    for (let index = 0; index < 15; index += 1) {
      const child = await createPerson(request, token, {
        firstName: `Dziecko${String(index + 1)}`,
        lastName: 'Orlik',
        birthDate: birthDateTurning(9),
      })
      await addMembership(request, token, {
        groupId: orliki,
        personId: child,
        role: 'participant',
        validFrom: '2025-09-01',
        ...(index === 14 ? { validTo: yesterday } : {}),
      })
    }
    const coach = await createPerson(request, token, {
      firstName: 'Wojciech',
      lastName: 'Trener',
      birthDate: birthDateTurning(40),
    })
    const assistant = await createPerson(request, token, {
      firstName: 'Anna',
      lastName: 'Pomocna',
      birthDate: birthDateTurning(22),
    })
    await addMembership(request, token, { groupId: orliki, personId: coach, role: 'coach', validFrom: '2025-09-01' })
    await addMembership(request, token, {
      groupId: orliki,
      personId: assistant,
      role: 'assistant',
      validFrom: '2025-09-01',
    })
    const swimmer = await createPerson(request, token, {
      firstName: 'Ola',
      lastName: 'Pływak',
      birthDate: birthDateTurning(7, 1),
    })
    await addMembership(request, token, {
      groupId: swimmers,
      personId: swimmer,
      role: 'participant',
      validFrom: '2025-09-01',
    })

    // API: the section filter, the kind, season and status filters, coaches and the active participant count.
    const bySection = await listGroups(request, token, `&sectionId=${academy}`)
    expect(bySection.status).toBe(200)
    expect(bySection.items.map((item) => item.name).sort()).toEqual(['Orliki', 'Żaki'])
    const orlikiRow = bySection.items.find((item) => item.id === orliki)
    expect(orlikiRow?.participantCount).toBe(14)
    expect(orlikiRow?.coaches?.map((item) => `${item.firstName} ${item.lastName}`)).toEqual([
      'Wojciech Trener',
      'Anna Pomocna',
    ])
    expect(bySection.items.find((item) => item.id === zaki)?.participantCount).toBe(0)
    expect((await listGroups(request, token, '&kind=class_group')).items.map((item) => item.id)).toEqual([swimmers])
    expect((await listGroups(request, token, `&seasonId=${season}`)).items.map((item) => item.id)).toEqual([orliki])
    expect(
      (await listGroups(request, token, `&sectionId=${academy}&isActive=false`)).items.map((item) => item.id),
    ).toEqual([zaki])

    // The roster: the age on the club day; a birthday tomorrow is not yet counted.
    const orlikiRoster = await roster(request, token, orliki)
    expect(orlikiRoster.items.find((item) => item.personId === coach)?.person?.age).toBe(40)
    expect((await roster(request, token, swimmers)).items[0]?.person?.age).toBe(6)

    // Negative case: a coordinator of the pool filtering by the academy sees no rows; their own section works.
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Koordynator',
      role: 'coordinator',
      sectionId: pool,
    })
    const foreign = await listGroups(request, coordinator.token, `&sectionId=${academy}`)
    expect(foreign.status).toBe(200)
    expect(foreign.items).toEqual([])
    expect((await listGroups(request, coordinator.token, '&kind=team')).items).toEqual([])
    expect((await listGroups(request, coordinator.token, `&sectionId=${pool}`)).items.map((item) => item.id)).toEqual([
      swimmers,
    ])

    // UI: the administrator at 375 px.
    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, password)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // The tab order: Groups, External teams, Seasons.
    await page.goto('/backend/groups/groups')
    const navTabs = page.getByRole('tablist', { name: /Groups, seasons and external teams|Grupy, sezony/ })
    await expect(navTabs.getByRole('tab')).toHaveText([
      /^Groups$|^Grupy$/,
      /External teams|Drużyny zewnętrzne/,
      /^Seasons$|^Sezony$/,
    ])

    // A section filter in the URL survives a reload; the counts and coaches are shown.
    await page.goto(`/backend/groups/groups?sectionId=${academy}`)
    await expect(page.getByRole('link', { name: 'Orliki' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Żaki' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Basen — początkujący' })).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('link', { name: 'Orliki' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Basen — początkujący' })).toHaveCount(0)

    // The "Class groups" perspective: only class groups, and the URL keeps the section filter beside it.
    await page.getByRole('tab', { name: /^Class groups$|^Grupy zajęciowe$/ }).click()
    await expect(page).toHaveURL(new RegExp(`kind=class_group&sectionId=${academy}`))
    await expect(page.getByTestId('groups-empty-filtered')).toBeVisible()
    await page.getByRole('button', { name: /^Clear filters$|^Wyczyść filtry$/ }).click()
    await expect(page).toHaveURL(/\/backend\/groups\/groups$/)
    await page.getByRole('tab', { name: /^Class groups$|^Grupy zajęciowe$/ }).click()
    await expect(page).toHaveURL(/\?kind=class_group$/)
    await expect(page.getByRole('link', { name: 'Basen — początkujący' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Orliki' })).toHaveCount(0)
    await page.goBack()
    await expect(page.getByRole('link', { name: 'Orliki' })).toBeVisible()

    // The Teams perspective with the columns; the accessibility scan in light and dark mode.
    await page.goto('/backend/groups/groups?kind=team')
    const orlikiLine = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'Orliki' }) })
    await expect(orlikiLine.getByTestId('group-participant-count')).toHaveText('14')
    await expect(orlikiLine).toContainText('Wojciech Trener, Anna Pomocna')
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      'groups list',
      async () => {
        await expect(page.getByRole('link', { name: 'Orliki' })).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})
    await expectNoPageOverflow(page)

    // The roster: the age and the name as a link to the person record.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/backend/groups/groups/${orliki}`)
    await expect(page.getByRole('link', { name: 'Wojciech Trener' })).toBeVisible()
    await expect(page.getByTestId('roster-age').first()).toBeVisible()
    await page.getByRole('link', { name: 'Wojciech Trener' }).click()
    await expect(page).toHaveURL(new RegExp(`/backend/people/persons/${coach}$`))

    // The empty state of a club without groups offers "Add group".
    const empty = await createClub(request, 'e06-s08-empty')
    try {
      await page.context().clearCookies()
      await signInBrowser(page, request, empty, empty.adminUserId, empty.tenant.email)
      await page.goto('/backend/groups/groups')
      await expect(page.getByTestId('groups-empty')).toBeVisible()
      await expect(
        page.getByTestId('groups-empty').getByRole('link', { name: /^Add group$|^Dodaj grupę$/ }),
      ).toBeVisible()
    } finally {
      await empty.cleanup()
    }
  } finally {
    await club.cleanup()
  }
})
