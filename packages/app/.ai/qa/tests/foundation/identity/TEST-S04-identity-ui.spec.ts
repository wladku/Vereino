import { expect, test, type Page } from '@playwright/test'
import { scanInColorSchemes } from '../../_fixtures/axe'
import { createClub, createStaff, uniqueSuffix } from '../../_fixtures/club'
import { signInBrowser, signOutBrowser } from '../../_fixtures/club-structure'
import { uiText } from '../../_fixtures/ui-text'
import { startOAuthFake, type OAuthFake } from './_fixtures/google-fake'
import { probeClearPassword } from './_fixtures/identity'

// TEST-S04 (social sign-in spec; REQ-S01, REQ-S02; J-S01, J-S02; #566, #567), at 375 px: `/login` shows one button per
// enabled provider (Google, then Facebook since phase 2) at least 44 px high after the password form; `?identity=unlinked|invalid|failed`
// all show the same sentence in the form's polite alert area; a member connects Google from "Connected accounts" on
// `/club/profile` (outcome announced) and then signs in with the keyboard on the Google button and reaches `/club`; for
// a member whose only sign-in method is Google, "Disconnect" is disabled with the explanation. `/login` and
// `/club/profile` are axe-clean in light and dark mode.
test.describe.configure({ timeout: 300_000, mode: 'serial' })

let fake: OAuthFake
test.beforeAll(async () => {
  fake = await startOAuthFake()
})
test.afterAll(async () => {
  await fake.stop()
})

async function openLogin(page: Page, query = ''): Promise<void> {
  await page.goto(`/login${query}`)
  await expect(page.locator('form[data-auth-ready="1"]')).toBeVisible()
}

test('TEST-S04 the Google button, the generic sentence and connected accounts work at 375 px, by keyboard and in both themes', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-s04')
  try {
    const marker = uniqueSuffix()
    const subject = `google-marta-${marker}`
    await page.setViewportSize({ width: 375, height: 812 })

    // `/login`: a Google and a Facebook button below the form, full width, at least 44 px high.
    await openLogin(page)
    const google = page.getByTestId('login-identity-google')
    await expect(google).toBeVisible()
    await expect(google).toContainText(
      uiText('foundation.identity.login.signInWith', { params: { provider: 'Google' } }),
    )
    const facebook = page.getByTestId('login-identity-facebook')
    await expect(facebook).toBeVisible()
    await expect(facebook).toContainText(
      uiText('foundation.identity.login.signInWith', { params: { provider: 'Facebook' } }),
    )
    expect((await facebook.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    const box = await google.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    const passwordBox = await page.locator('input[name="password"]').boundingBox()
    expect(box?.y ?? 0).toBeGreaterThan(passwordBox?.y ?? Number.POSITIVE_INFINITY)
    expect(
      await scanInColorSchemes(
        page,
        testInfo,
        '/login',
        async () => {
          await expect(page.getByTestId('login-identity-google')).toBeVisible()
        },
        { platformBaseline: true },
      ),
    ).toEqual({})
    await page.emulateMedia({ colorScheme: 'light' })

    // The three outcomes read the same sentence, in the form's polite alert area.
    for (const outcome of ['unlinked', 'invalid', 'failed']) {
      await openLogin(page, `?identity=${outcome}`)
      const alert = page.locator('form [role="alert"]')
      await expect(alert, outcome).toHaveText(uiText('foundation.identity.login.generic', { exact: true }))
      await expect(alert).toHaveAttribute('aria-live', 'polite')
    }

    // J-S01: Marta connects Google from her profile; the outcome is announced and the link listed.
    const marta = await createStaff(request, club, {
      firstName: 'Marta',
      lastName: `S04${marker}`,
      birthDate: '1986-07-07',
    })
    await signInBrowser(page, request, club, marta.userId, marta.email)
    await page.goto('/club/profile')
    const section = page.getByTestId('club-profile-identities')
    await expect(section).toBeVisible()
    await expect(section.getByTestId('identity-links-empty')).toHaveText(
      uiText('foundation.identity.empty', { exact: true }),
    )
    fake.next({ sub: subject, email: `marta.${marker}@gmail.test` })
    await section.getByTestId('identity-connect-google').click()
    await page.waitForURL((url) => url.pathname === '/club/profile' && url.searchParams.get('identity') === 'linked')
    await expect(page.getByTestId('identity-outcome')).toHaveText(
      uiText('foundation.identity.flash.linked', { params: { provider: 'Google' } }),
    )
    await expect(page.getByTestId('identity-link-google')).toContainText(`marta.${marker}@gmail.test`)
    await expect(page.getByTestId('identity-unlink-google')).toBeEnabled()
    await expect(page.getByTestId('identity-connect-google')).toHaveCount(0)
    expect(
      await scanInColorSchemes(page, testInfo, '/club/profile', async () => {
        await expect(page.getByTestId('identity-link-google')).toBeVisible()
      }),
    ).toEqual({})
    await page.emulateMedia({ colorScheme: 'light' })

    // J-S01 step 2: signed out, Marta signs in with the keyboard on the Google button and reaches `/club`.
    await signOutBrowser(page)
    await openLogin(page)
    fake.next({ sub: subject })
    await page.getByTestId('login-identity-google').focus()
    await page.keyboard.press('Enter')
    await page.waitForURL((url) => url.pathname.startsWith('/club'), { timeout: 30_000 })
    expect(new URL(page.url()).pathname).toBe('/club')

    // Google as the only sign-in method: "Disconnect" is disabled and explained.
    probeClearPassword(marta.userId)
    await page.goto('/club/profile')
    await expect(page.getByTestId('identity-link-google')).toBeVisible()
    await expect(page.getByTestId('identity-unlink-google')).toBeDisabled()
    await expect(page.getByTestId('identity-last-method')).toHaveText(
      uiText('foundation.identity.lastMethod', { exact: true }),
    )
  } finally {
    await club.cleanup()
  }
})
