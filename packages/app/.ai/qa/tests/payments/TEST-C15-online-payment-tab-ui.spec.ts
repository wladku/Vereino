import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { call, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { connectStripe, type PaymentsSettingsBody } from '../_fixtures/payments'
import { uiText } from '../_fixtures/ui-text'

// TEST-C15, B-20 part (payments parity spec phase 12, REQ-C14, AC-C14, Q-C01; issue #302 E12-S12); the API part is
// `TEST-C15-online-payment-methods.spec.ts`. On "Coaches and payments" the "Online payment" group shows the
// connection badge (not connected, then connected (test)), the methods as checkboxes, refuses an empty selection, saves
// BLIK, and shows the fee mode read-only with a link to club settings B-02.
test.describe.configure({ timeout: 300_000 })

// The visible Radix checkbox button, not its hidden native input (the card above it intercepts that click).
const methodBox = (page: Page, method: string) =>
  page
    .locator(
      `[data-crud-field-id="method_${method}"] button[role="checkbox"], [data-crud-field-id="method_${method}"] input[type="checkbox"]`,
    )
    .first()

test('TEST-C15 the "Online payment" group shows the connection, saves the methods and links to the fee setting', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-c15-ui')
  try {
    // Signing the browser in ends the administrator's API token: take a fresh one (lesson
    // `sign-in-browser-ends-the-api-token`).
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    const admin = await getAuthToken(request, club.tenant.email, password)
    await page.goto('/backend/payments/settings')
    const connection = page.getByTestId('payments-online-connection')
    await expect(connection).toHaveAttribute('data-connection', 'not_connected')
    await expect(connection).toContainText(uiText('payments.settings.online.connection.not_connected'))
    await expect(methodBox(page, 'card')).toBeChecked()
    await expect(methodBox(page, 'blik')).not.toBeChecked()
    await expect(methodBox(page, 'p24')).not.toBeChecked()

    // The fee mode is text, not a control, and links to club settings.
    const feeMode = page.getByTestId('payments-online-fee-mode')
    await expect(feeMode).toContainText(uiText('payments.settings.online.feeMode.club_pays'))
    await expect(feeMode.locator('input, select, button')).toHaveCount(0)
    await expect(page.getByRole('link', { name: uiText('payments.settings.online.feeMode.link') })).toHaveAttribute(
      'href',
      '/backend/club/settings',
    )

    // An empty selection is refused in the form; card and BLIK are saved.
    await methodBox(page, 'card').click()
    await page
      .getByRole('button', { name: uiText('payments.common.save') })
      .first()
      .click()
    await expect(page.getByText(uiText('payments.errors.online_methods_invalid')).first()).toBeVisible()
    await methodBox(page, 'card').click()
    await methodBox(page, 'blik').click()
    await page
      .getByRole('button', { name: uiText('payments.common.save') })
      .first()
      .click()
    await expect(page.getByText(uiText('payments.settings.flash.saved')).first()).toBeVisible()
    await expect
      .poll(async () => {
        const settings = await call<PaymentsSettingsBody>(request, 'GET', '/api/payments/settings', admin)
        return settings.body?.onlineMethods
      })
      .toEqual(['card', 'blik'])

    // With test keys stored the badge reads "connected (test)".
    await connectStripe(request, club, 'pk_test_vereinoC15ui', admin)
    await page.reload()
    await expect(connection).toHaveAttribute('data-connection', 'connected_test')
    await expect(connection).toContainText(uiText('payments.settings.online.connection.connected_test'))
    await expect(methodBox(page, 'blik')).toBeChecked()
  } finally {
    await club.cleanup()
  }
})
