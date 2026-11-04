import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { OPTIMISTIC_LOCK_HEADER, call, createClub } from '../_fixtures/club'
import { create, getOne, list, signInBrowser } from '../_fixtures/club-structure'

// Issue #87 (E06-S05) acceptance criteria: the time zone is a known IANA zone (422 otherwise), the account age
// threshold is 13–18 (Q1; 422 with a field error otherwise), the club name is editable (Q2: the platform
// organization's name), B-03 always shows the public address with a "Preview" that says why it is disabled, and an
// institution's bank account is an NRB (422 "Account number must have 26 digits") with a type filter on the list.
test.describe.configure({ timeout: 300_000 })

type Settings = Record<string, unknown> & { updatedAt?: string | null }
type ErrorBody = { code?: string; error?: string; fieldErrors?: Record<string, string> }

test('E06-S05 settings: an unknown zone and a threshold outside 13–18 answer 422; the club name is editable', async ({
  request,
}) => {
  const club = await createClub(request, 'e06-s05-settings')
  try {
    const read = () => call<Settings>(request, 'GET', '/api/club_core/settings', club.adminToken)
    const put = async (data: Record<string, unknown>) => {
      const current = await read()
      return call<Settings & ErrorBody>(request, 'PUT', '/api/club_core/settings', club.adminToken, {
        data,
        headers: current.body?.updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: current.body.updatedAt } : {},
      })
    }
    const initial = await read()
    expect(initial.status).toBe(200)
    expect(typeof initial.body?.clubName).toBe('string')

    const zone = await put({ timezone: 'Mars/Olympus' })
    expect(zone.status, JSON.stringify(zone.body)).toBe(422)
    expect(zone.body).toMatchObject({ code: 'timezone_unknown' })
    expect(zone.body?.fieldErrors?.timezone).toBeTruthy()

    for (const age of [12, 19]) {
      const threshold = await put({ ownAccountMinAge: age })
      expect(threshold.status, JSON.stringify(threshold.body)).toBe(422)
      expect(threshold.body).toMatchObject({ code: 'account_age_threshold_out_of_range' })
      expect(threshold.body?.fieldErrors?.ownAccountMinAge).toBeTruthy()
    }
    expect((await read()).body).toMatchObject({ timezone: 'Europe/Warsaw', ownAccountMinAge: 16 })

    const saved = await put({ timezone: 'Europe/Berlin', ownAccountMinAge: 13, clubName: 'Dev Academy E06' })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect(saved.body).toMatchObject({ timezone: 'Europe/Berlin', ownAccountMinAge: 13, clubName: 'Dev Academy E06' })
    expect((await read()).body).toMatchObject({ clubName: 'Dev Academy E06' })

    const blankName = await put({ clubName: '  ' })
    expect(blankName.status, JSON.stringify(blankName.body)).toBe(422)
    expect(blankName.body).toMatchObject({ code: 'club_name_invalid' })
    expect((await read()).body).toMatchObject({ clubName: 'Dev Academy E06' })
  } finally {
    await club.cleanup()
  }
})

test('E06-S05 institutions: NRB bank accounts, 422 for 25 digits, and a type filter', async ({ request, page }) => {
  const club = await createClub(request, 'e06-s05-institutions')
  try {
    const short = await call<ErrorBody>(request, 'POST', '/api/club_core/institutions', club.adminToken, {
      data: { name: 'Szkoła 25', type: 'school', bankAccount: '6110901014000007121981287' },
    })
    expect(short.status, JSON.stringify(short.body)).toBe(422)
    expect(short.body).toMatchObject({ code: 'bank_account_invalid' })
    expect(short.body?.error).toMatch(/Account number must have 26 digits|Numer rachunku musi mieć 26 cyfr/)
    expect(short.body?.fieldErrors?.bankAccount).toBeTruthy()

    const schoolId = await create(request, club.adminToken, 'institutions', {
      name: 'Szkoła Podstawowa nr 1',
      type: 'school',
      bankAccount: 'PL 61 1090 1014 0000 0712 1981 2874',
    })
    await create(request, club.adminToken, 'institutions', { name: 'Gmina Testowo', type: 'municipality' })
    expect(await getOne(request, club.adminToken, 'institutions', schoolId)).toMatchObject({
      bankAccount: '61109010140000071219812874',
    })

    const schools = await list(request, club.adminToken, 'institutions', '&type=school')
    expect(schools.items.map((item) => item.name)).toEqual(['Szkoła Podstawowa nr 1'])
    const municipalities = await list(request, club.adminToken, 'institutions', '&type=municipality')
    expect(municipalities.items.map((item) => item.name)).toEqual(['Gmina Testowo'])

    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await page.goto('/backend/club/institutions')
    await expect(page.getByText('61 1090 1014 0000 0712 1981 2874')).toBeVisible()
  } finally {
    await club.cleanup()
  }
})

test('E06-S05 publication: the address is shown and "Preview" says why it is disabled', async ({ request, page }) => {
  const club = await createClub(request, 'e06-s05-publication')
  try {
    // Signing the browser in resets the password, which revokes the fixture's token: take a fresh one.
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    const adminToken = await getAuthToken(request, club.tenant.email, password)
    await page.goto('/backend/club/publication')
    await expect(page.getByTestId('publication-address')).toBeVisible()
    await expect(page.getByTestId('publication-preview-disabled')).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByTestId('publication-address')).toContainText(
      /Available once the club has a page address|Dostępny, gdy klub ma ustawiony adres strony/,
    )

    const slug = `e06-s05-${Date.now().toString(36)}`
    const current = await call<Settings>(request, 'GET', '/api/club_core/settings', adminToken)
    const saved = await call(request, 'PUT', '/api/club_core/settings', adminToken, {
      data: { publicSlug: slug },
      headers: current.body?.updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: current.body.updatedAt } : {},
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    await page.reload()
    await expect(page.getByTestId('publication-address')).toContainText(`/p/${slug}`)
    await expect(page.getByTestId('publication-preview-disabled')).toBeVisible()
    await expect(page.getByTestId('publication-address')).toContainText(
      /Available once the club page is enabled|Dostępny po włączeniu/,
    )
    await expect(page.getByTestId('publication-public-link')).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
