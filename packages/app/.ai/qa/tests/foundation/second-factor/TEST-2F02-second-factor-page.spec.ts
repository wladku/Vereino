import { expect, test, type Page } from '@playwright/test'
import { capturedCount, waitForCode } from '../../_fixtures/auth'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../../_fixtures/axe'
import { createClub } from '../../_fixtures/club'
import { uiText, uiTextIn } from '../../_fixtures/ui-text'
import { wrongCode } from './_fixtures/second-factor'

// TEST-2F02 (staff second factor spec UI row `/login/second-factor`; REQ-2F01; J-2F01; #736): at 375 px, in English and
// in Polish, with the keyboard only, the club administrator signs in on `/login`, lands on `/login/second-factor` with
// the masked address, sees a wrong code announced in the live region with the attempts left, sees the resend countdown,
// and the right code (Enter) lands on `/backend`. Without a provisional token the page sends the browser to `/login`
// with the expiry sentence. axe in light and dark finds nothing blocking; the console stays clean.
test.describe.configure({ timeout: 240_000 })

async function setGuestLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

async function typeSignIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  const form = page.locator('form[data-auth-ready="1"]')
  await expect(form).toBeVisible()
  await form.locator('input[name="email"]').fill(email)
  // Enter in the password field: a Tab could land on the injected "Sign in with Google" link instead.
  await form.locator('input[name="password"]').fill(password)
  await form.locator('input[name="password"]').press('Enter')
}

test('TEST-2F02 the code page works by keyboard at 375 px in both languages and both themes', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-2f02')
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    // The wrong code answers 400 on purpose; the browser logs that response as a failed resource.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
      consoleErrors.push(message.text())
    }
  })
  try {
    await page.setViewportSize({ width: 375, height: 800 })
    await prepareForAccessibilityScan(page)
    const email = club.tenant.email

    // Without a provisional token the page is over: `/login` with the expiry sentence.
    await page.goto('/login/second-factor')
    await expect(page).toHaveURL(/\/login\?second_factor=expired$/)
    await expect(page.getByText(uiText('foundation.secondFactor.login.expired', { exact: true }))).toBeVisible()

    for (const locale of ['en', 'pl'] as const) {
      await page.context().clearCookies()
      await setGuestLocale(page, locale)
      const since = capturedCount(email)
      await typeSignIn(page, email, club.tenant.password)
      await page.waitForURL(/\/login\/second-factor$/)
      const field = page.getByTestId('second-factor-code')
      await expect(field).toBeFocused()
      const masked = `${email[0]}•••${email.slice(email.lastIndexOf('@'))}`
      await expect(page.getByTestId('second-factor-hint')).toHaveText(
        uiTextIn(locale, 'foundation.secondFactor.page.sent').replace('{email}', masked),
      )
      await expect(page.getByTestId('second-factor-resend')).toBeDisabled()
      await expect(page.getByTestId('second-factor-resend')).toHaveText(
        new RegExp(uiTextIn(locale, 'foundation.secondFactor.page.resendIn').replace('{seconds}', '\\d+')),
      )
      await expectNoPageOverflow(page, 375)

      const code = await waitForCode(email, since)
      await page.keyboard.type(wrongCode(code))
      await page.keyboard.press('Enter')
      const status = page.getByTestId('second-factor-status')
      await expect(status).toHaveText(
        uiTextIn(locale, 'foundation.secondFactor.page.attemptsLeft').replace('{count}', '4'),
      )
      await expect(page.locator('[role="status"]').filter({ has: status })).toHaveAttribute('aria-live', 'polite')

      if (locale === 'en') {
        expect(
          await scanInColorSchemes(page, testInfo, '/login/second-factor', async () => {
            await expect(page.getByTestId('second-factor-code')).toBeVisible()
          }),
        ).toEqual({})
        await page.emulateMedia({ colorScheme: 'light' })
      }

      await field.fill('')
      await field.focus()
      await page.keyboard.type(code)
      await page.keyboard.press('Enter')
      await page.waitForURL((url) => url.pathname.startsWith('/backend'), { timeout: 30_000 })
    }
    expect(consoleErrors).toEqual([])
  } finally {
    await club.cleanup()
  }
})
