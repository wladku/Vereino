import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { uniqueSuffix } from '../_fixtures/club'
import { capturedEmails, signInThroughForm } from '../_fixtures/members'
import { createIsolatedTenant, type IsolatedTenant } from '../_fixtures/tenant'
import { uiText } from '../_fixtures/ui-text'

// TEST-PW02 (password check spec, REQ-PW02, PW-AC-02; #779): the platform's browser forms state and check the server's
// policy (the runner sets 12 characters without character classes), not the platform default of 6 characters with a
// digit, an upper-case letter and a special character — the `PasswordPolicyBridge` hands it over. A lower-case
// passphrase is accepted; a common password shows the server's localized refusal.
test.describe.configure({ timeout: 180_000 })

async function expectServerPolicy(page: Page): Promise<void> {
  await expect(
    page.getByText(uiText('auth.password.requirements.minLength', { params: { min: 12 } })).first(),
  ).toBeVisible()
  await expect(page.getByText(uiText('auth.password.requirements.digit'))).toHaveCount(0)
  await expect(page.getByText(uiText('auth.password.requirements.uppercase'))).toHaveCount(0)
  await expect(page.getByText(uiText('auth.password.requirements.special'))).toHaveCount(0)
}

test('TEST-PW02 the reset and change-password forms use the server password policy', async ({ page, request }) => {
  let tenant: IsolatedTenant | null = null
  try {
    tenant = await createIsolatedTenant(request, 'test-pw02')
    const { email } = tenant

    // The reset link page.
    const before = capturedEmails(email).length
    const reset = await request.post('/api/auth/reset', { form: { email } })
    expect(reset.ok(), String(reset.status())).toBe(true)
    // Other e-mails to the address may arrive meanwhile: wait for the one with the reset link.
    const resetLink = () =>
      capturedEmails(email)
        .slice(before)
        .flatMap((entry) => entry.links)
        .find((href) => href.includes('/reset/'))
    await expect.poll(resetLink, { timeout: 20_000 }).toBeTruthy()
    const link = resetLink()
    expect(link).toBeTruthy()
    await page.goto(new URL(String(link)).pathname)
    const form = page.locator('form[data-auth-ready="1"]')
    await expect(form).toBeVisible()
    await expectServerPolicy(page)
    await expect(form.locator('#password')).toHaveAttribute('minlength', '12')

    await form.locator('#password').fill('Qwerty123456')
    await form.locator('#confirmPassword').fill('Qwerty123456')
    await form.locator('#confirmPassword').press('Enter')
    await expect(page.getByText(uiText('foundation.errors.password_too_common'))).toBeVisible()

    const resetPassword = `quiet river morning ${uniqueSuffix()}`
    await form.locator('#password').fill(resetPassword)
    await form.locator('#confirmPassword').fill(resetPassword)
    await form.locator('#confirmPassword').press('Enter')
    await page.waitForURL((url) => url.pathname.startsWith('/login'), { timeout: 30_000 })

    // The change-password page of the signed-in user.
    await signInThroughForm(page, email, resetPassword)
    await page.goto('/backend/profile/change-password')
    const passwordInput = page.locator('[data-crud-field-id="password"] input')
    await expect(passwordInput).toBeVisible()
    await expectServerPolicy(page)

    const changed = `amber forest trail ${uniqueSuffix()}`
    await page.locator('[data-crud-field-id="currentPassword"] input').fill(resetPassword)
    await passwordInput.fill(changed)
    await page.locator('[data-crud-field-id="confirmPassword"] input').fill(changed)
    await page
      .getByRole('button', { name: uiText('auth.profile.form.save', { exact: true }) })
      .first()
      .click()
    await expect(page.getByText(uiText('auth.profile.form.success')).first()).toBeVisible()
    expect(await getAuthToken(request, email, changed)).toBeTruthy()
  } finally {
    await tenant?.cleanup()
  }
})
