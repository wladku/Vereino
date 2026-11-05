import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow } from '../_fixtures/axe'
import { call, createClub } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import {
  ageCategoryOptions,
  createGroup,
  getGroup,
  listGroups,
  postGroup,
  seedAgeCategories,
  signedInStaff,
  updateGroup,
} from '../_fixtures/groups'

// Issue #92 (E06-S10; club spec REQ-019, AC-019, TEST-030 age category part; README B-11, B-12): the club's PZPN age
// category dictionary (`dictionaries`, seeded with the PZPN defaults) gives a team its category; the coordinator picks
// "Orlik" and the list (B-11, column and filter) and the record (B-12) show it; a category on a class group → 422
// `group_team_fields_on_class_group`; an entry the club administrator adds to the dictionary is offered on the form.
test.describe.configure({ timeout: 300_000 })

/**
 * Picks an option of a `CrudForm` select. A click before the field's options have loaded opens nothing, so the open
 * and the pick are retried until the option is offered.
 */
async function pick(page: Page, fieldId: string, option: string | RegExp): Promise<void> {
  await expect(async () => {
    const combobox = page.locator(`[data-crud-field-id="${fieldId}"] [role="combobox"]`)
    if ((await combobox.getAttribute('aria-expanded')) !== 'true') await combobox.click()
    await page.getByRole('option', { name: option }).click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
}

test('E06-S10 a coordinator gives a team its PZPN age category; a class group refuses it with 422; an entry the administrator adds is offered', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'e06-s10-age-category')
  try {
    const token = club.adminToken
    // The seed creates the dictionary once; a second run leaves the club's dictionary as it is.
    expect(seedAgeCategories(club)).toEqual({ created: true })
    expect(seedAgeCategories(club)).toEqual({ created: false })

    const academy = await createStructure(request, token, 'sections', { name: 'Akademia piłkarska' })
    const pool = await createStructure(request, token, 'sections', { name: 'Basen' })
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Koordynator',
      role: 'coordinator',
      sectionId: academy,
    })
    const poolCoordinator = await signedInStaff(request, club, {
      firstName: 'Piotr',
      lastName: 'Basenowy',
      role: 'coordinator',
      sectionId: pool,
    })

    // The coordinator reads the PZPN categories, youngest first, without any `dictionaries` feature.
    const options = await ageCategoryOptions(request, coordinator.token)
    expect(options.status).toBe(200)
    expect(options.items.map((item) => item.label)).toEqual([
      'Skrzat (U6–U7)',
      'Żak (U8–U9)',
      'Orlik (U10–U11)',
      'Młodzik (U12–U13)',
      'Trampkarz (U14–U15)',
      'Junior młodszy (U16–U17)',
      'Junior starszy (U18–U19)',
      'Senior',
    ])
    const orlik = String(options.items.find((item) => item.value === 'orlik')?.id)
    const zak = String(options.items.find((item) => item.value === 'zak')?.id)
    expect((await call(request, 'GET', '/api/dictionaries', coordinator.token)).status).toBe(403)

    // Given a team, when the coordinator picks "Orlik", then the list and the record show it.
    const team = await createGroup(request, coordinator.token, {
      sectionId: academy,
      name: 'Orliki 2016',
      kind: 'team',
      ageCategoryEntryId: orlik,
    })
    const zaki = await createGroup(request, coordinator.token, {
      sectionId: academy,
      name: 'Żaki 2018',
      kind: 'team',
      ageCategoryEntryId: zak,
    })
    const listed = await listGroups(request, coordinator.token)
    expect(listed.items.find((item) => item.id === team)).toMatchObject({
      ageCategoryEntryId: orlik,
      ageCategoryName: 'Orlik (U10–U11)',
    })
    expect(
      (await listGroups(request, coordinator.token, `&ageCategoryEntryId=${orlik}`)).items.map((i) => i.id),
    ).toEqual([team])
    const record = await getGroup(request, coordinator.token, team)
    expect(record.body).toMatchObject({ ageCategoryEntryId: orlik, ageCategoryName: 'Orlik (U10–U11)' })
    // The category filter stays inside the record scope: the pool's coordinator sees no academy team.
    expect((await listGroups(request, poolCoordinator.token, `&ageCategoryEntryId=${orlik}`)).items).toEqual([])

    // Negative case: a class group with a category → 422, on create and on update.
    const onClass = await postGroup(request, poolCoordinator.token, {
      sectionId: pool,
      name: 'Basen — początkujący',
      kind: 'class_group',
      ageCategoryEntryId: orlik,
    })
    expect(onClass.status, JSON.stringify(onClass.body)).toBe(422)
    expect(onClass.body?.code).toBe('group_team_fields_on_class_group')
    const classGroup = await createGroup(request, poolCoordinator.token, {
      sectionId: pool,
      name: 'Basen — początkujący',
      kind: 'class_group',
    })
    const classRecord = await getGroup(request, poolCoordinator.token, classGroup)
    const categoryOnClass = await updateGroup(
      request,
      poolCoordinator.token,
      { id: classGroup, ageCategoryEntryId: orlik },
      classRecord.body?.updatedAt,
    )
    expect(categoryOnClass.status).toBe(422)
    expect(categoryOnClass.body?.code).toBe('group_team_fields_on_class_group')
    // A team turned into a class group keeps its category unless it is cleared.
    const zakiRecord = await getGroup(request, coordinator.token, zaki)
    const kindOnly = await updateGroup(
      request,
      coordinator.token,
      { id: zaki, kind: 'class_group' },
      zakiRecord.body?.updatedAt,
    )
    expect(kindOnly.status).toBe(422)
    expect(kindOnly.body?.code).toBe('group_team_fields_on_class_group')
    // An id outside the club's age category dictionary is refused.
    const unknown = await postGroup(request, coordinator.token, {
      sectionId: academy,
      name: 'Trampkarze',
      kind: 'team',
      ageCategoryEntryId: classGroup,
    })
    expect(unknown.status).toBe(422)
    expect(unknown.body?.code).toBe('groups_reference_invalid')

    // Given the dictionary edited by the administrator, when the coordinator opens the form, the new entry is offered.
    const dictionaries = await call<{ items?: { id: string; key: string }[] }>(
      request,
      'GET',
      '/api/dictionaries',
      token,
    )
    expect(dictionaries.status).toBe(200)
    const dictionary = dictionaries.body?.items?.find((item) => item.key === 'groups.age_categories')
    expect(dictionary).toBeTruthy()
    const added = await call(request, 'POST', `/api/dictionaries/${String(dictionary?.id)}/entries`, token, {
      data: { value: 'orlik_mlodszy', label: 'Orlik młodszy (U10)' },
    })
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    expect((await ageCategoryOptions(request, coordinator.token)).items.map((item) => item.label).at(-1)).toBe(
      'Orlik młodszy (U10)',
    )

    // B-11 as the coordinator: the category column and the category filter in the URL, surviving a reload.
    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, coordinator.userId, coordinator.email)
    // The sign-in resets the password, which ends the coordinator's earlier API token.
    const coordinatorToken = await getAuthToken(request, coordinator.email, password)
    await page.goto(`/backend/groups/groups?ageCategoryEntryId=${orlik}`)
    const orlikiLine = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'Orliki 2016' }) })
    await expect(orlikiLine).toContainText('Orlik (U10–U11)')
    await expect(page.getByRole('link', { name: 'Żaki 2018' })).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('link', { name: 'Orliki 2016' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Żaki 2018' })).toHaveCount(0)

    // B-12 at 375 px: the form offers the entry the administrator added; the record shows it; a class group hides it.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/backend/groups/groups/create')
    await page.locator('[data-crud-field-id="name"] input').fill('Orliki 2017')
    await pick(page, 'sectionId', 'Akademia piłkarska')
    await pick(page, 'ageCategoryEntryId', 'Orlik młodszy (U10)')
    await page
      .getByRole('button', { name: /^Create$|^Utwórz$/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/backend\/groups\/groups\/[0-9a-f-]{36}$/)
    const created = /([0-9a-f-]{36})$/.exec(page.url())?.[1]
    expect((await getGroup(request, coordinatorToken, String(created))).body?.ageCategoryName).toBe(
      'Orlik młodszy (U10)',
    )
    await page.getByRole('tab', { name: /^Details$|^Szczegóły$/ }).click()
    await expect(page.locator('[data-crud-field-id="ageCategoryEntryId"]')).toContainText('Orlik młodszy (U10)')
    await expectNoPageOverflow(page)
    await pick(page, 'kind', /Class group|Grupa zajęciowa/)
    await expect(page.locator('[data-crud-field-id="ageCategoryEntryId"]')).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
