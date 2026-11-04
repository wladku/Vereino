import { expect, test } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { call, createClub } from '../_fixtures/club'
import { create, signInBrowser } from '../_fixtures/club-structure'

// Issue #86 (E06-S04; README B-06; UX parity spec REQ-U03, TEST-U08 and TEST-U09 list part, AC-U05 list part): the
// places list filters by kind, parent and active state; each row carries the owner institution's name and the parent's
// name; the page shows a child indented under its parent (`↳`) with the owner, and an External badge for a place
// outside the club; the kind filter chosen in the filter overlay is kept in the URL and survives a reload; the empty
// state offers "Add place". 375 px, light and dark, axe.
test.describe.configure({ timeout: 300_000 })

type ListedPlace = {
  id: string
  name: string | null
  kind: string | null
  parentPlaceId: string | null
  ownerName?: string | null
  parentName?: string | null
  isExternal: boolean
  isActive: boolean
}

test('E06-S04 places list: kind, parent and active filters, owner and parent names, hierarchy and External badge, filter in the URL', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e06-s04-places')
  try {
    page.setDefaultTimeout(30_000)
    const token = club.adminToken
    const municipality = await create(request, token, 'institutions', {
      name: 'Gmina Przykładowo',
      type: 'municipality',
    })
    const orlik = await create(request, token, 'places', {
      name: 'Orlik',
      kind: 'complex',
      ownerInstitutionId: municipality,
    })
    const pitch = await create(request, token, 'places', {
      name: 'Boisko piłkarskie',
      kind: 'pitch',
      parentPlaceId: orlik,
      ownerInstitutionId: municipality,
      capacityGroups: 2,
    })
    const lockers = await create(request, token, 'places', {
      name: 'Zaplecze szatniowe',
      kind: 'locker_room',
      parentPlaceId: orlik,
      isActive: false,
    })
    const away = await create(request, token, 'places', {
      name: 'Boisko Wisły Liszki',
      kind: 'pitch',
      isExternal: true,
    })
    const hall = await create(request, token, 'places', { name: 'Hala sportowa', kind: 'hall' })

    const listPlaces = async (query: string) => {
      const result = await call<{ items?: ListedPlace[] }>(
        request,
        'GET',
        `/api/club_core/places?pageSize=100&sortField=name&sortDir=asc${query}`,
        token,
      )
      expect(result.status, `GET places ${query} ${JSON.stringify(result.body)}`).toBe(200)
      return result.body?.items ?? []
    }
    const ids = (items: ListedPlace[]) => items.map((item) => item.id).sort()

    // API: each filter alone and combined; the owner and parent names on every row.
    expect(ids(await listPlaces('&kind=pitch'))).toEqual([pitch, away].sort())
    expect(ids(await listPlaces(`&parentPlaceId=${orlik}`))).toEqual([pitch, lockers].sort())
    expect(ids(await listPlaces('&isActive=false'))).toEqual([lockers])
    expect(ids(await listPlaces(`&kind=pitch&parentPlaceId=${orlik}&isActive=true`))).toEqual([pitch])
    const all = new Map((await listPlaces('')).map((item) => [item.id, item]))
    expect(all.get(orlik)).toMatchObject({ ownerName: 'Gmina Przykładowo', parentName: null })
    expect(all.get(pitch)).toMatchObject({ ownerName: 'Gmina Przykładowo', parentName: 'Orlik' })
    expect(all.get(lockers)).toMatchObject({ ownerName: null, parentName: 'Orlik', isActive: false })
    expect(all.get(away)).toMatchObject({ ownerName: null, parentName: null, isExternal: true })
    expect(all.get(hall)).toMatchObject({ ownerName: null, parentName: null, isExternal: false })
    // Negative case: an unknown kind is refused, not ignored.
    const refused = await call(request, 'GET', '/api/club_core/places?kind=stadium', token)
    expect(refused.status).toBe(400)

    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 1280, height: 900 })
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)

    // The whole list: the pitch is indented under Orlik and shows the owner; the away pitch carries the badge.
    await page.goto('/backend/club/places')
    const cells = page.getByTestId('place-name-cell')
    await expect(cells).toHaveCount(5)
    await expect(cells).toHaveText([
      /^Boisko Wisły Liszki\s*(External|Zewnętrzny)$/,
      /^Hala sportowa$/,
      /^Orlik$/,
      /^↳\s*Boisko piłkarskie$/,
      /^↳\s*Zaplecze szatniowe$/,
    ])
    await expect(cells.nth(3)).toHaveAttribute('data-depth', '1')
    const pitchRow = page.getByRole('row').filter({ hasText: 'Boisko piłkarskie' })
    await expect(pitchRow).toContainText('Gmina Przykładowo')
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      'places list',
      async () => {
        await expect(page.getByTestId('place-name-cell')).toHaveCount(5)
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})

    // The kind filter from the overlay: only pitches, and the URL keeps it through a reload.
    await page.getByRole('button', { name: /^(Filters|Filtry)/ }).click()
    // The overlay is an inline panel (not a dialog); each filter is a block with its label and a select.
    await page
      .locator('div.space-y-2')
      .filter({ has: page.getByText(/^(Kind|Rodzaj)$/) })
      .filter({ has: page.getByRole('combobox') })
      .last()
      .getByRole('combobox')
      .first()
      .click()
    await page.getByRole('option', { name: /^(Pitch|Boisko)$/ }).click()
    await page
      .getByRole('button', { name: /^(Apply|Zastosuj)$/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/backend\/club\/places\?kind=pitch$/)
    // The pitch under Orlik is on the page without its parent: the cell names the parent after the arrow.
    // A branch whose parent is elsewhere sorts by its own name ("piłkarskie" before "Wisły" in Polish order).
    await expect(cells).toHaveText([
      /^↳\s*Orlik ›\s*Boisko piłkarskie$/,
      /^Boisko Wisły Liszki\s*(External|Zewnętrzny)$/,
    ])
    await page.reload()
    await expect(cells).toHaveCount(2)
    await expect(page.getByRole('row').filter({ hasText: 'Hala sportowa' })).toHaveCount(0)

    // Parent and status in the URL; a filter that matches nothing offers "Clear filters".
    await page.goto(`/backend/club/places?parentPlaceId=${orlik}&isActive=false`)
    await expect(cells).toHaveText([/^↳\s*Orlik ›\s*Zaplecze szatniowe$/])
    await page.goto('/backend/club/places?kind=pool')
    await expect(page.getByTestId('places-empty-filtered')).toBeVisible()
    await page.getByRole('button', { name: /^(Clear filters|Wyczyść filtry)$/ }).click()
    await expect(page).toHaveURL(/\/backend\/club\/places$/)
    await expect(cells).toHaveCount(5)

    // 375 px: the list stays usable and the page reflows.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/backend/club/places')
    await expect(page.getByRole('heading', { level: 1, name: /^(Places|Obiekty)$/ })).toBeVisible()
    await expectNoPageOverflow(page)

    // The empty state of a club without places offers "Add place".
    const empty = await createClub(request, 'e06-s04-empty')
    try {
      await page.context().clearCookies()
      await signInBrowser(page, request, empty, empty.adminUserId, empty.tenant.email)
      await page.goto('/backend/club/places')
      await expect(page.getByTestId('places-empty')).toBeVisible()
      await expect(
        page.getByTestId('places-empty').getByRole('link', { name: /^(Add place|Dodaj obiekt)$/ }),
      ).toBeVisible()
    } finally {
      await empty.cleanup()
    }
  } finally {
    await club.cleanup()
  }
})
