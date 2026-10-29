import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createAccount,
  createClub,
  createPerson,
  getPerson,
  uniqueSuffix,
} from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { getMe, putMe } from '../_fixtures/members'
import { createGuardianship } from '../_fixtures/people'

// TEST-006 (club spec *Integration Coverage*; REQ-001, REQ-002; phase 1 step 5): the administrator's people list,
// person record, guardianship and account, and the member pages `/club`, `/club/profile` and
// `/club/wards/[personId]` — loading, empty, error and version-conflict states, keyboard use, a narrow screen (375 px,
// reflow at 320 px), light and dark mode, and no critical or serious axe violation outside the platform baseline.
test.describe.configure({ timeout: 300_000 })

const CONFLICT = /modified by someone else|zmodyfikowany przez/

/**
 * Scans the page in the given colour schemes. The page is reloaded after each switch: a scheme changed on a rendered
 * page fades its colours, and a scan during the fade reports half-blended colours as contrast violations.
 */
async function scanInSchemes(
  page: Page,
  testInfo: Parameters<typeof scanBlockingViolations>[1],
  label: string,
  ready: () => Promise<void>,
  schemes: readonly ('light' | 'dark')[] = ['light', 'dark'],
) {
  const found: Record<string, unknown> = {}
  for (const colorScheme of schemes) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.reload()
    await ready()
    const violations = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
    if (violations.length > 0) found[`${label} (${colorScheme})`] = violations
  }
  return found
}

test('TEST-006 the administrator: people list, person record with guardianship and account, version conflict, keyboard, 375 px, light and dark', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-006-admin')
  try {
    const parentId = await createPerson(request, club.adminToken, {
      firstName: 'Lena',
      lastName: 'Rekordowa',
      birthDate: birthDateTurning(36),
    })
    const childId = await createPerson(request, club.adminToken, {
      firstName: 'Kuba',
      lastName: 'Rekordowy',
      birthDate: birthDateTurning(8),
    })
    await createGuardianship(request, club.adminToken, {
      guardianPersonId: parentId,
      wardPersonId: childId,
      isPrimaryPayer: true,
      consents: { regulations: true },
      validFrom: calendarDate(),
    })
    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, password)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}

    // The list and the record render in light and dark mode; the axe scan runs in light mode as for the other
    // admin pages of #26 (ENG-TEST-25 pattern), the member pages below are scanned in both.
    await page.goto('/backend/people/persons')
    const listReady = () => expect(page.getByRole('link', { name: /Lena Rekordowa/ })).toBeVisible()
    await listReady()
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await page.reload()
    await listReady()
    Object.assign(violations, await scanInSchemes(page, testInfo, 'list', listReady, ['light']))
    await page.goto(`/backend/people/persons/${parentId}`)
    const recordReady = () => expect(page.getByRole('heading', { level: 1, name: /Lena Rekordowa/ })).toBeVisible()
    await recordReady()
    Object.assign(violations, await scanInSchemes(page, testInfo, 'record', recordReady, ['light']))
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await page.reload()
    await recordReady()
    await page.getByRole('tab', { name: /Guardianship|Opieka/ }).click()
    await expect(page.getByText(/Primary payer|Główny płatnik/).first()).toBeVisible()

    // Version conflict: the record changes elsewhere while the form is open; saving shows the conflict bar.
    await page.getByRole('tab', { name: /^Details$|^Dane$/ }).click()
    const before = (await getPerson(request, club.adminToken, parentId)).body as { updatedAt?: string }
    const elsewhere = await call(request, 'PUT', '/api/people/persons', club.adminToken, {
      data: { id: parentId, phone: '+48 500 100 200' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(before.updatedAt) },
    })
    expect(elsewhere.status, JSON.stringify(elsewhere.body)).toBe(200)
    await page.locator('[data-crud-field-id="firstName"] input').fill('Helena')
    await page
      .getByRole('button', { name: /^Save$|^Zapisz$/ })
      .first()
      .click()
    await expect(page.getByText(CONFLICT).first()).toBeVisible()
    expect((await getPerson(request, club.adminToken, parentId)).body).toMatchObject({ firstName: 'Lena' })

    // The account tab, by keyboard: type the address, Tab to "Create account", press Enter.
    await page.goto(`/backend/people/persons/${parentId}`)
    await page.getByRole('tab', { name: /^Account$|^Konto$/ }).click()
    const address = page.getByLabel(/E-mail for the invitation|E-mail do zaproszenia/)
    await address.fill(`lena-${uniqueSuffix()}@example.org`)
    const createButton = page.getByRole('button', { name: /Create account|Utwórz konto/ })
    await expect(createButton).toBeEnabled()
    await address.press('Tab')
    await expect(createButton).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByText(/This person has an account|Ta osoba ma konto/)).toBeVisible()
    const created = (await getPerson(request, club.adminToken, parentId)).body as { userId?: string }
    if (created.userId) club.extraUserIds.push(created.userId)
    await expectNoPageOverflow(page)
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})

test('TEST-006 the member pages: Today, profile and ward with loading, error, empty and conflict states, keyboard, 375 px, light and dark', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-006-member')
  try {
    const guardianId = await createPerson(request, club.adminToken, {
      firstName: 'Monika',
      lastName: 'Mobilna',
      birthDate: birthDateTurning(34),
    })
    const wardId = await createPerson(request, club.adminToken, {
      firstName: 'Staś',
      lastName: 'Mobilny',
      birthDate: birthDateTurning(7),
    })
    await createGuardianship(request, club.adminToken, {
      guardianPersonId: guardianId,
      wardPersonId: wardId,
      isPrimaryPayer: true,
      validFrom: calendarDate(),
    })
    const email = `monika-${uniqueSuffix()}@example.org`
    const account = await createAccount(request, club.adminToken, guardianId, email)
    expect(account.status, JSON.stringify(account.body)).toBe(201)
    const userId = String(account.body?.userId)
    club.extraUserIds.push(userId)

    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, userId, email)
    const token = await getAuthToken(request, email, password)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}

    // Loading (a slow profile), then an error (no network) with a working "Try again".
    await page.route('**/api/people/me', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      await route.continue()
    })
    await page.goto('/club')
    await expect(page.getByText(/Loading your profile|Wczytywanie profilu/)).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: /Monika/ })).toBeVisible()
    await page.unroute('**/api/people/me')
    await page.route('**/api/people/me', (route) => route.abort())
    await page.reload()
    await expect(page.getByText(/could not be loaded|Nie udało się wczytać/)).toBeVisible()
    await page.unroute('**/api/people/me')
    await page.getByRole('button', { name: /Try again|Spróbuj ponownie/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: /Monika/ })).toBeVisible()

    // Today: the calendar entry point's empty state, the profile entry point and the ward.
    await expect(page.getByTestId('club-tile-calendar')).toBeVisible()
    await expect(page.getByTestId('club-ward')).toHaveCount(1)
    const todayReady = () => expect(page.getByTestId('club-ward')).toBeVisible()
    Object.assign(violations, await scanInSchemes(page, testInfo, '/club', todayReady))
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // The ward by keyboard: switch the image consent with Space, save with Enter.
    await page.getByTestId('club-ward').click()
    const wardReady = () => expect(page.getByRole('switch', { name: /Image|Wizerunek/ })).toBeVisible()
    await wardReady()
    Object.assign(violations, await scanInSchemes(page, testInfo, '/club/wards', wardReady))
    const image = page.getByRole('switch', { name: /Image|Wizerunek/ })
    await image.focus()
    await page.keyboard.press('Space')
    await expect(image).toBeChecked()
    await page.getByRole('button', { name: /Save consents|Zapisz zgody/ }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText(/consents have been saved|Zgody zostały zapisane/)).toBeVisible()
    await expect
      .poll(async () => (await getMe(request, token)).body?.wards[0]?.guardianship.consents.image.granted)
      .toBe(true)
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // The profile: a change made elsewhere meanwhile makes the save answer with the conflict bar.
    await page.goto('/club/profile')
    const profileReady = () => expect(page.getByTestId('club-profile-consents')).toBeVisible()
    await profileReady()
    Object.assign(violations, await scanInSchemes(page, testInfo, '/club/profile', profileReady))
    const current = (await getMe(request, token)).body?.person.updatedAt
    const elsewhere = await putMe(request, token, { phone: '+48 600 700 800' }, current)
    expect(elsewhere.status, JSON.stringify(elsewhere.body)).toBe(200)
    await page.getByRole('switch', { name: /coaches|trenerom/ }).click()
    await page.getByRole('button', { name: /Save profile|Zapisz profil/ }).click()
    await expect(page.getByText(CONFLICT).first()).toBeVisible()
    expect((await getMe(request, token)).body?.person.consents.shareContactWithCoaches.granted).toBe(false)
    // After a reload the form starts from the stored values and the save goes through.
    await page.reload()
    await page.getByRole('switch', { name: /coaches|trenerom/ }).click()
    await page.getByRole('button', { name: /Save profile|Zapisz profil/ }).click()
    await expect(page.getByText(/profile has been saved|Profil został zapisany/)).toBeVisible()
    await expect(page.getByText(/^Given on |^Udzielona /).first()).toBeVisible()
    expect((await getMe(request, token)).body?.person.consents.shareContactWithCoaches.granted).toBe(true)
    await expectNoPageOverflow(page)
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
