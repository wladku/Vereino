import { expect, test, type APIRequestContext } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { expectNoPageOverflow, scanInColorSchemes } from '../_fixtures/axe'
import { call, createClub, type Club } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { createGroup, createSeason, seedAgeCategories, signedInStaff } from '../_fixtures/groups'
import { actionLogEntries } from '../_fixtures/people'
import { uiText } from '../_fixtures/ui-text'

// People life-cycle spec phase L12 (#384; REQ-L16, DD-L17, Q-L25, Q-L26, J-L10, AC-L16): TEST-L23 — the seeded age
// categories carry their PZPN "U" ranges; for a season starting 2026-09-01 Orlik U10–U11 shows the birth years
// 2016–2017. The club administrator adds "Orlik młodszy" U10–U10 in one step; a team created with it gets "Age from 9,
// to 10" proposed on its public tab and reads "Rocznik 2017" in season 2026/27. An inverted range answers 422
// `age_range_inverted`, a coordinator changing or adding one 403, a duplicate name 409; a range stays attached to its
// entry when the category is renamed on the platform page; the set is undoable. TEST-L20 — the new routes fail closed
// for another club (404, no data). The roster's "Fits" filter of REQ-L15 (#383) is out of this story's scope.
test.describe.configure({ timeout: 420_000 })

type RangeItem = {
  entryId: string
  value: string
  label: string
  uFrom: number | null
  uTo: number | null
  birthYears: { from: number | null; to: number } | null
  updatedAt: string | null
}
type RangeList = { items?: RangeItem[]; referenceYear?: number; season?: { id: string; name: string } | null }
type ErrorBody = { code?: string; error?: string }

function listRanges(request: APIRequestContext, token: string, seasonId?: string) {
  return call<RangeList>(request, 'GET', `/api/groups/age-categories${seasonId ? `?seasonId=${seasonId}` : ''}`, token)
}

function setRange(
  request: APIRequestContext,
  token: string,
  entryId: string,
  data: { uFrom: number; uTo?: number | null; updatedAt?: string | null },
) {
  return call<RangeItem & ErrorBody>(request, 'PUT', `/api/groups/age-categories/${entryId}/range`, token, { data })
}

function addCategory(
  request: APIRequestContext,
  token: string,
  data: { label: string; uFrom: number; uTo?: number | null },
) {
  return call<RangeItem & ErrorBody>(request, 'POST', '/api/groups/age-categories', token, { data })
}

async function rangeRowId(club: Club, entryId: string): Promise<string> {
  return withClient(async (client) => {
    const rows = await client.query<{ id: string }>(
      `select id from groups_age_category_ranges where tenant_id = $1 and entry_id = $2 and deleted_at is null`,
      [club.tenant.tenantId, entryId],
    )
    return rows.rows[0]?.id ?? ''
  })
}

test('TEST-L23 the age categories carry their PZPN birth years and a team proposes its age range from its category', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-l23-age-categories')
  const other = await createClub(request, 'test-l23-other-club')
  try {
    const admin = club.adminToken
    expect(seedAgeCategories(club)).toEqual({ created: true })
    expect(seedAgeCategories(other)).toEqual({ created: true })
    const season = await createSeason(request, admin, { name: '2026/27', startsOn: '2026-09-01', endsOn: '2027-08-31' })
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Ewa',
      lastName: 'Koordynator',
      role: 'coordinator',
      sectionId: academy,
    })

    // Given the seeded categories and a season starting 2026-09-01: Orlik U10–U11 shows 2016–2017, Senior is open.
    const seeded = await listRanges(request, admin, season)
    expect(seeded.status, JSON.stringify(seeded.body)).toBe(200)
    expect(seeded.body?.referenceYear).toBe(2026)
    expect(seeded.body?.season?.name).toBe('2026/27')
    expect(seeded.body?.items?.map((item) => [item.value, item.uFrom, item.uTo])).toEqual([
      ['kids', 4, 5],
      ['skrzat', 6, 7],
      ['zak', 8, 9],
      ['orlik', 10, 11],
      ['mlodzik', 12, 13],
      ['trampkarz', 14, 15],
      ['junior_mlodszy', 16, 17],
      ['junior_starszy', 18, 19],
      ['senior', 20, null],
    ])
    const orlik = seeded.body?.items?.find((item) => item.value === 'orlik') as RangeItem
    expect(orlik.birthYears).toEqual({ from: 2016, to: 2017 })
    expect(seeded.body?.items?.find((item) => item.value === 'senior')?.birthYears).toEqual({ from: null, to: 2007 })
    // The coordinator reads the same list; an unknown season answers 404.
    expect((await listRanges(request, coordinator.token, season)).body?.items?.length).toBe(9)
    expect((await listRanges(request, admin, orlik.entryId)).status).toBe(404)

    // Negative cases: an inverted range → 422; a coordinator changing or adding one → 403; a range edited without its
    // version → 400; an id outside the club's age category dictionary → 404.
    const inverted = await setRange(request, admin, orlik.entryId, { uFrom: 11, uTo: 10, updatedAt: orlik.updatedAt })
    expect(inverted.status, JSON.stringify(inverted.body)).toBe(422)
    expect(inverted.body?.code).toBe('age_range_inverted')
    const byCoordinator = await setRange(request, coordinator.token, orlik.entryId, {
      uFrom: 10,
      uTo: 12,
      updatedAt: orlik.updatedAt,
    })
    expect(byCoordinator.status).toBe(403)
    expect((await addCategory(request, coordinator.token, { label: 'Żak młodszy', uFrom: 8, uTo: 8 })).status).toBe(403)
    expect((await setRange(request, admin, orlik.entryId, { uFrom: 10, uTo: 12 })).status).toBe(400)
    expect((await setRange(request, admin, season, { uFrom: 10, uTo: 12 })).status).toBe(404)

    // TEST-L20: another club neither reads nor writes this club's categories.
    const foreign = await listRanges(request, other.adminToken)
    expect(foreign.status).toBe(200)
    expect(foreign.body?.items?.map((item) => item.entryId)).not.toContain(orlik.entryId)
    const foreignSet = await setRange(request, other.adminToken, orlik.entryId, { uFrom: 10, uTo: 12 })
    expect(foreignSet.status).toBe(404)

    // The administrator changes a range (the undo restores it) and adds "Orlik młodszy" U10–U10 in one step.
    const changed = await setRange(request, admin, orlik.entryId, { uFrom: 10, uTo: 12, updatedAt: orlik.updatedAt })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect(changed.body).toMatchObject({ entryId: orlik.entryId, uFrom: 10, uTo: 12 })
    const log = (await actionLogEntries(request, admin, await rangeRowId(club, orlik.entryId))).find(
      (entry) => entry.commandId === 'groups.age_category_ranges.set',
    )
    expect(log?.undoToken).toBeTruthy()
    const undone = await undoByToken(request, admin, String(log?.undoToken))
    expect(undone.status(), await undone.text()).toBe(200)
    const afterUndo = (await listRanges(request, admin, season)).body?.items?.find((item) => item.value === 'orlik')
    expect([afterUndo?.uFrom, afterUndo?.uTo, afterUndo?.birthYears]).toEqual([10, 11, { from: 2016, to: 2017 }])

    const added = await addCategory(request, admin, { label: 'Orlik młodszy', uFrom: 10, uTo: 10 })
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    const orlikMlodszy = String(added.body?.entryId)
    expect((await addCategory(request, admin, { label: 'orlik młodszy', uFrom: 10, uTo: 10 })).body?.code).toBe(
      'age_category_name_taken',
    )
    const addInverted = await addCategory(request, admin, { label: 'Odwrócona', uFrom: 12, uTo: 10 })
    expect(addInverted.status).toBe(422)
    expect(addInverted.body?.code).toBe('age_range_inverted')
    const withNew = await listRanges(request, admin, season)
    expect(withNew.body?.items?.at(-1)).toMatchObject({
      entryId: orlikMlodszy,
      label: 'Orlik młodszy',
      uFrom: 10,
      uTo: 10,
      birthYears: { from: 2017, to: 2017 },
    })
    // The team picker offers it at once (the platform's cached entry list is flushed after the create).
    const dictionaries = await call<{ items?: { id: string; key: string }[] }>(
      request,
      'GET',
      '/api/dictionaries',
      admin,
    )
    const dictionaryId = String(dictionaries.body?.items?.find((item) => item.key === 'groups.age_categories')?.id)
    const entries = await call<{ items?: { id: string; label: string }[] }>(
      request,
      'GET',
      `/api/dictionaries/${dictionaryId}/entries`,
      admin,
    )
    expect(entries.body?.items?.map((item) => item.label)).toContain('Orlik młodszy')

    // Given a category renamed on the platform page, its range stays attached to the same entry.
    const renamed = await call(request, 'PATCH', `/api/dictionaries/${dictionaryId}/entries/${orlik.entryId}`, admin, {
      data: { label: 'Orlik (rocznik starszy)' },
    })
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200)
    expect(
      (await listRanges(request, admin, season)).body?.items?.find((item) => item.entryId === orlik.entryId),
    ).toMatchObject({ label: 'Orlik (rocznik starszy)', uFrom: 10, uTo: 11 })

    // The coordinator creates "Orliki 2017" with Orlik młodszy in season 2026/27.
    const team = await createGroup(request, coordinator.token, {
      sectionId: academy,
      name: 'Orliki 2017',
      kind: 'team',
      ageCategoryEntryId: orlikMlodszy,
      seasonId: season,
    })

    // B-12 public tab as the coordinator: "Age from 9, to 10" proposed, "Rocznik 2017 w sezonie 2026/27"; saving keeps it.
    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, coordinator.userId, coordinator.email)
    await page.goto(`/backend/groups/groups/${team}?tab=public`)
    await page.getByRole('tab', { name: uiText('groups.groups.tabs.public', { exact: true }) }).click()
    await expect(page.locator('[data-crud-field-id="ageFrom"] input')).toHaveValue('9')
    await expect(page.locator('[data-crud-field-id="ageTo"] input')).toHaveValue('10')
    const hint = page.getByTestId('group-public-age-hint')
    await expect(hint).toContainText('2017')
    await expect(hint).toContainText('2026/27')
    await page
      .getByRole('button', { name: uiText('groups.common.save', { exact: true }) })
      .first()
      .click()
    await expect
      .poll(async () => {
        const record = await call<{ ageFrom?: number | null; ageTo?: number | null }>(
          request,
          'GET',
          `/api/groups/groups/${team}`,
          admin,
        )
        return [record.body?.ageFrom, record.body?.ageTo]
      })
      .toEqual([9, 10])
    // A value already set is never overwritten: after the save the tab shows the stored ages, not a new proposal.
    await page.reload()
    await page.getByRole('tab', { name: uiText('groups.groups.tabs.public', { exact: true }) }).click()
    await expect(page.locator('[data-crud-field-id="ageFrom"] input')).toHaveValue('9')

    // B-11 "Age categories" as the coordinator: read-only (no editor, no add), the birth years shown.
    await page.goto(`/backend/groups/age-categories`)
    await expect(page.getByTestId('age-birth-years-orlik')).toHaveText('2016–2017')
    await expect(page.getByTestId('age-range-editor-orlik')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: uiText('groups.ageCategories.actions.create', { exact: true }) }),
    ).toHaveCount(0)

    // B-11 as the club administrator, desktop and 375 px, light and dark: edit a range in its row; the season choice.
    const staffAdmin = await signedInStaff(request, club, { firstName: 'Aneta', lastName: 'Admin', role: 'club_admin' })
    await page.goto('about:blank')
    await page.context().clearCookies()
    await signInBrowser(page, request, club, staffAdmin.userId, staffAdmin.email)
    await page.goto('/backend/groups/age-categories')
    const tabs = page.getByRole('tablist', { name: uiText('groups.nav.tabs.label', { exact: true }) })
    await expect(tabs.getByRole('tab', { selected: true })).toHaveText(
      uiText('groups.nav.tabs.ageCategories', { exact: true }),
    )
    await page.locator('#age-categories-season').selectOption({ label: '2026/27' })
    await expect(page.getByTestId('age-birth-years-orlik')).toHaveText('2016–2017')
    const skrzat = page.getByTestId('age-range-editor-skrzat')
    await skrzat.locator('input').nth(1).fill('5')
    await skrzat.getByRole('button', { name: uiText('groups.common.save', { exact: true }) }).click()
    await expect(skrzat.getByRole('alert')).toBeVisible()
    await skrzat.locator('input').nth(1).fill('8')
    await skrzat.getByRole('button', { name: uiText('groups.common.save', { exact: true }) }).click()
    await expect(page.getByTestId('age-birth-years-skrzat')).toHaveText('2019–2021')

    const violations = await scanInColorSchemes(
      page,
      testInfo,
      'age categories',
      async () => {
        await expect(page.getByTestId('age-birth-years-orlik')).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})
    await page.setViewportSize({ width: 375, height: 812 })
    await page.reload()
    await expect(page.getByTestId('age-birth-years-orlik')).toBeVisible()
    await expectNoPageOverflow(page)
  } finally {
    await other.cleanup()
    await club.cleanup()
  }
})
