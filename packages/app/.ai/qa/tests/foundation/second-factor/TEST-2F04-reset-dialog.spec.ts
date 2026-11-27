import { expect, test, type Page } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../../_fixtures/axe'
import { getAuthToken } from '../../_fixtures/auth'
import { createClub, uniqueSuffix } from '../../_fixtures/club'
import { signInBrowser } from '../../_fixtures/club-structure'
import { uiText } from '../../_fixtures/ui-text'
import { startOAuthFake, type OAuthFake } from '../identity/_fixtures/google-fake'
import { cleanHttp, probeLink, roundTrip, sessionJar } from '../identity/_fixtures/identity'
import { staffAccount } from './_fixtures/second-factor'

// TEST-2F04 (staff second factor spec UI row "Sign-in methods"; REQ-2F04; J-2F03; #736): on the person record's
// Account tab the administrator sees "Reset second factor" for a treasurer, and not on their own record nor for a
// coach. The dialog's Reset stays disabled until a note and the "I verified this person" box are filled; success shows
// the flash. At 375 px, in English and Polish, with no blocking axe violation in the open dialog. Phase 2 (#841): once
// the treasurer connected Google, the record's "Unlink Google" says why and opens the same reset dialog (the link
// stays when it is cancelled), and the administrator's own "Connected accounts" on `/club/profile` shows the line that
// the role signs in with Google or the password and an e-mail code.
test.describe.configure({ timeout: 240_000 })

let fake: OAuthFake
test.beforeAll(async () => {
  fake = await startOAuthFake()
})
test.afterAll(async () => {
  await fake.stop()
})

async function setLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

async function openAccount(page: Page, personId: string) {
  await page.goto(`/backend/people/persons/${personId}?tab=account`)
  await expect(page.getByTestId('person-identities')).toBeVisible()
  // The list request settles before the action decides whether to show.
  await expect(
    page.getByTestId('identity-links-empty').or(page.locator('[data-testid^="identity-link-"]')).first(),
  ).toBeVisible()
}

test('TEST-2F04 the reset dialog: shown for a treasurer only, note and confirmation required, flash on success', async ({
  page,
  request,
  playwright,
  baseURL,
}, testInfo) => {
  const club = await createClub(request, 'test-2f04')
  try {
    const treasurer = await staffAccount(request, club, 'Ewa', 'treasurer')
    const coach = await staffAccount(request, club, 'Tomek', 'coach')
    await page.setViewportSize({ width: 375, height: 800 })
    await prepareForAccessibilityScan(page)
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)

    for (const locale of ['en', 'pl'] as const) {
      await setLocale(page, locale)

      await openAccount(page, club.adminPersonId)
      await expect(page.getByTestId('second-factor-reset-open')).toHaveCount(0)
      await openAccount(page, coach.personId)
      await expect(page.getByTestId('second-factor-reset-open')).toHaveCount(0)

      await openAccount(page, treasurer.personId)
      await page.getByTestId('second-factor-reset-open').click()
      const dialog = page.getByTestId('second-factor-reset-dialog')
      await expect(dialog).toBeVisible()
      const confirm = page.getByTestId('second-factor-reset-confirm')
      await expect(confirm).toBeDisabled()
      await page.getByTestId('second-factor-reset-note').fill('phoned back')
      await expect(confirm).toBeDisabled()
      await page.getByTestId('second-factor-reset-verified').click()
      await expect(confirm).toBeEnabled()
      await expectNoPageOverflow(page, 375)
      if (locale === 'en') expect(await scanBlockingViolations(page, testInfo)).toEqual([])

      await confirm.click()
      await expect(dialog).toBeHidden()
      await expect(page.getByText(uiText('foundation.secondFactor.reset.success', { exact: true }))).toBeVisible()
    }

    // Phase 2: the treasurer's Google link is her second factor; "Unlink Google" opens the reset instead.
    const subject = `google-ewa-2f04-${uniqueSuffix()}`
    const treasurerToken = await getAuthToken(request, treasurer.email, treasurer.password)
    fake.next({ sub: subject, email: `${subject}@gmail.test` })
    const http = cleanHttp(playwright.request, String(baseURL))
    expect((await roundTrip(http, sessionJar(treasurerToken))).target).toBe(
      '/club/profile?identity=linked&provider=google',
    )
    await openAccount(page, treasurer.personId)
    await expect(page.getByTestId('identity-second-factor-unlink')).toHaveText(
      uiText('foundation.secondFactor.reset.unlinkGoogle', { exact: true }),
    )
    const unlinkGoogle = page.getByTestId('identity-unlink-google')
    await expect(unlinkGoogle).toBeEnabled()
    await unlinkGoogle.click()
    const routed = page.getByTestId('second-factor-reset-dialog')
    await expect(routed).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(routed).toBeHidden()
    expect(probeLink('google', subject).count).toBe(1)

    // The administrator's own profile tells them how their role signs in.
    await page.goto('/club/profile')
    await expect(page.getByTestId('identity-second-factor-required')).toHaveText(
      uiText('foundation.secondFactor.profile.required', { exact: true }),
    )
    await expectNoPageOverflow(page, 375)
  } finally {
    await club.cleanup()
  }
})
