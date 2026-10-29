import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  birthDateTurning,
  calendarDate,
  call,
  createAccount,
  createClub,
  createPerson,
  getPerson,
  uniqueSuffix,
  type Club,
} from '../_fixtures/club'
import { acceptInvitation, getMe, signInThroughForm, updateClubSettings } from '../_fixtures/members'
import { createGuardianship } from '../_fixtures/people'

// TEST-047 (club spec *Integration Coverage*; REQ-035, DD-34, V-11), the member part of phase 1: a club whose
// `default_locale` is `pl`, guardian A with `preferred_locale = en` and guardian B without a preference. A signs in
// from a Polish browser and gets the English interface, B from an English browser gets the Polish one (person →
// club default → Accept-Language → en); the club's content (its short name) stays as the club wrote it; dates follow
// the locale; A switches to Polish in the profile; an unknown locale is refused with 422. Not covered here: the
// public section page with the guest switcher (step 6), the session-cancellation e-mail (phase 3), and the
// invitation e-mail's locale — `auth.users.create` renders it in the request locale (foundation AC-F04 deviation,
// TEST-F10). The missing-key fallback is guaranteed by the catalog parity of `yarn verify`.
test.describe.configure({ timeout: 300_000 })
test.use({ locale: 'pl-PL' })

const CLUB_NAME = 'Klub Sportowy Orły'

async function guardianWithWard(
  request: Parameters<typeof createPerson>[0],
  club: Club,
  input: { firstName: string; preferredLocale?: string },
) {
  const personId = await createPerson(request, club.adminToken, {
    firstName: input.firstName,
    lastName: 'Językowa',
    birthDate: birthDateTurning(37),
    ...(input.preferredLocale ? { preferredLocale: input.preferredLocale } : {}),
  })
  const wardId = await createPerson(request, club.adminToken, {
    firstName: `Dziecko${input.firstName}`,
    lastName: 'Językowe',
    birthDate: '2016-03-05',
  })
  await createGuardianship(request, club.adminToken, {
    guardianPersonId: personId,
    wardPersonId: wardId,
    validFrom: calendarDate(),
  })
  const email = `${input.firstName.toLowerCase()}-${uniqueSuffix()}@example.org`
  const account = await createAccount(request, club.adminToken, personId, email)
  expect(account.status, JSON.stringify(account.body)).toBe(201)
  const userId = String(account.body?.userId)
  club.extraUserIds.push(userId)
  return { personId, userId, email }
}

test('TEST-047 member locale: preferred English in a Polish club, club default over Accept-Language, club content unchanged, switch in the profile', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-047')
  try {
    const settings = await updateClubSettings(request, club.adminToken, { defaultLocale: 'pl', shortName: CLUB_NAME })
    expect(settings.status, JSON.stringify(settings.body)).toBe(200)
    const unknownDefault = await updateClubSettings(request, club.adminToken, { defaultLocale: 'xx' })
    expect(unknownDefault.status).toBe(422)
    expect(unknownDefault.body?.code).toBe('locale_unsupported')
    const unknownPreferred = await call<{ code?: string }>(request, 'POST', '/api/people/persons', club.adminToken, {
      data: { firstName: 'Jan', lastName: 'Kowalski', preferredLocale: 'xx' },
    })
    expect(unknownPreferred.status).toBe(422)
    expect(unknownPreferred.body?.code).toBe('locale_unsupported')
    const regional = await createPerson(request, club.adminToken, {
      firstName: 'Jan',
      lastName: 'Kowalski',
      preferredLocale: 'en-US',
    })
    expect((await getPerson(request, club.adminToken, regional)).body).toMatchObject({ preferredLocale: 'en' })

    const a = await guardianWithWard(request, club, { firstName: 'Alice', preferredLocale: 'en' })
    const b = await guardianWithWard(request, club, { firstName: 'Bogna' })
    const aPassword = await acceptInvitation(request, a.email)
    const bPassword = await acceptInvitation(request, b.email)

    // The API resolves the member's locale: A → en (preferred), B → pl (club default), whatever the browser says.
    const aToken = await getAuthToken(request, a.email, aPassword)
    expect((await getMe(request, aToken, { 'Accept-Language': 'pl-PL' })).body?.locale).toBe('en')
    const bToken = await getAuthToken(request, b.email, bPassword)
    const bMe = await getMe(request, bToken, { 'Accept-Language': 'en-US' })
    expect(bMe.body?.locale).toBe('pl')
    expect(bMe.body?.club).toMatchObject({ shortName: CLUB_NAME, defaultLocale: 'pl' })

    // A, from a Polish browser, gets the English interface and the club's own name.
    page.setDefaultTimeout(30_000)
    await signInThroughForm(page, a.email, aPassword)
    await expect(page).toHaveURL(/\/club$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Hello, Alice' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByTestId('club-name')).toHaveText(CLUB_NAME)
    const aBirth =
      (await page
        .getByText(/^Born /)
        .first()
        .textContent()) ?? ''
    expect(aBirth).toMatch(/2016/)

    // A switches to Polish in the profile: the interface follows.
    await page.getByRole('link', { name: 'Profile', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()
    await page.getByLabel('Interface language').click()
    await page.getByRole('option', { name: 'Polski', exact: true }).click()
    await page.getByRole('button', { name: 'Save profile' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Profil' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
    await expect(page.getByTestId('club-name')).toHaveText(CLUB_NAME)
    expect((await getMe(request, aToken)).body?.person.preferredLocale).toBe('pl')

    // B, from an English browser, gets the club default: Polish, with the same club name and Polish dates.
    await page.context().clearCookies()
    await page.context().setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })
    await signInThroughForm(page, b.email, bPassword)
    await expect(page).toHaveURL(/\/club$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Cześć, Bogna' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
    await expect(page.getByTestId('club-name')).toHaveText(CLUB_NAME)
    const bBirth =
      (await page
        .getByText(/^Urodzony\(-a\) /)
        .first()
        .textContent()) ?? ''
    expect(bBirth).toMatch(/2016/)
    expect(bBirth.replace(/^Urodzony\(-a\) /, '')).not.toBe(aBirth.replace(/^Born /, ''))
  } finally {
    await club.cleanup()
  }
})
