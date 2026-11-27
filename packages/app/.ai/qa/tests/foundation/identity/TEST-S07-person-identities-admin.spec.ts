import { expect, test, type Page } from '@playwright/test'
import { scanInColorSchemes } from '../../_fixtures/axe'
import { createClub, createStaff, signInAs, uniqueSuffix } from '../../_fixtures/club'
import { signInBrowser } from '../../_fixtures/club-structure'
import { uiText } from '../../_fixtures/ui-text'
import { startOAuthFake, type OAuthFake } from './_fixtures/google-fake'
import { cleanHttp, probeClearPassword, probeLink, roundTrip, sessionJar } from './_fixtures/identity'

// TEST-S07 (social sign-in spec person-record UI row; REQ-S02, AC-S02 and the backend-surface criterion; #848), at
// 375 px: the club administrator opens a person's Account tab and finds "Sign-in methods" (`person-identities`,
// `foundation.injection.person-identities`) listing the person's Google link with the e-mail shared at link time and no
// "Connect" button; a list that cannot load shows the error with "Try again", which recovers; an unlink against a
// stale version is refused (409) and announced while the list reloads; Escape cancels the confirmation, and the
// keyboard unlinks the link (announced, empty state); for a person whose only sign-in method is Google, "Unlink" is
// disabled and explained. The section is axe-clean in light and dark mode.
test.describe.configure({ timeout: 300_000, mode: 'serial' })

let fake: OAuthFake
test.beforeAll(async () => {
  fake = await startOAuthFake()
})
test.afterAll(async () => {
  await fake.stop()
})

const LIST = '**/api/foundation/identity?personId=*'

async function openAccountTab(page: Page, personId: string): Promise<void> {
  await page.goto(`/backend/people/persons/${personId}?tab=account`)
  await expect(page.getByTestId('person-identities')).toBeVisible()
}

test("TEST-S07 the administrator lists and unlinks a person's sign-in methods at 375 px, by keyboard and in both themes", async ({
  page,
  request,
  playwright,
  baseURL,
}, testInfo) => {
  const http = cleanHttp(playwright.request, String(baseURL))
  const club = await createClub(request, 'test-s07')
  try {
    const marker = uniqueSuffix()
    const linkGoogle = async (userId: string, email: string, subject: string) => {
      const token = await signInAs(request, club, userId, email)
      fake.next({ sub: subject, email: `${subject}@gmail.test` })
      expect((await roundTrip(http, sessionJar(token))).target).toBe('/club/profile?identity=linked&provider=google')
    }
    const ola = await createStaff(request, club, {
      firstName: 'Ola',
      lastName: `S07${marker}`,
      birthDate: '1988-03-03',
    })
    const olaSubject = `google-ola-s07-${marker}`
    await linkGoogle(ola.userId, ola.email, olaSubject)
    const jan = await createStaff(request, club, {
      firstName: 'Jan',
      lastName: `S07${marker}`,
      birthDate: '1979-09-09',
    })
    await linkGoogle(jan.userId, jan.email, `google-jan-s07-${marker}`)
    probeClearPassword(jan.userId)

    await page.setViewportSize({ width: 375, height: 812 })
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)

    // The list: Ola's Google link with the shared e-mail, "Unlink" enabled, no "Connect" (not the account holder).
    await openAccountTab(page, ola.personId)
    const section = page.getByTestId('person-identities')
    await expect(section.getByRole('heading', { name: uiText('foundation.identity.admin.title') })).toBeVisible()
    const row = section.getByTestId('identity-link-google')
    await expect(row).toContainText(`${olaSubject}@gmail.test`)
    const unlink = section.getByTestId('identity-unlink-google')
    await expect(unlink).toBeEnabled()
    await expect(unlink).toHaveText(uiText('foundation.identity.unlink', { params: { provider: 'Google' } }))
    expect((await unlink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    await expect(section.locator('[data-testid^="identity-connect-"]')).toHaveCount(0)
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(scroll, 'no horizontal scroll at 375 px').toBeLessThanOrEqual(0)
    expect(
      await scanInColorSchemes(
        page,
        testInfo,
        'person identities',
        async () => {
          await expect(page.getByTestId('identity-link-google')).toBeVisible()
        },
        { platformBaseline: true },
      ),
    ).toEqual({})
    await page.emulateMedia({ colorScheme: 'light' })

    // Error: the list cannot load → the message and "Try again", which recovers once the API answers again.
    await page.route(LIST, (route) => route.abort())
    await page.reload()
    await expect(section.getByText(uiText('foundation.identity.errors.load'))).toBeVisible({ timeout: 30_000 })
    await page.unroute(LIST)
    const retry = section.getByRole('button', { name: uiText('foundation.identity.retry') })
    await retry.focus()
    await page.keyboard.press('Enter')
    await expect(row).toBeVisible()

    // Conflict: the page holds a stale version of the link; the unlink is refused (409) and announced, the list reloads.
    await page.route(LIST, async (route) => {
      const response = await route.fetch()
      const body = (await response.json()) as { items: Array<{ updatedAt: string }> }
      for (const item of body.items) item.updatedAt = '2020-01-01T00:00:00.000Z'
      await route.fulfill({ response, json: body })
    })
    await page.reload()
    await expect(row).toBeVisible()
    await page.unroute(LIST)
    await unlink.click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Control+Enter')
    const outcome = section.getByTestId('identity-outcome')
    await expect(outcome).toHaveText(uiText('foundation.identity.errors.conflict', { exact: true }))
    await expect(section.locator('[role="status"][aria-live="polite"]')).toContainText(
      uiText('foundation.identity.errors.conflict'),
    )
    await expect(row).toBeVisible()
    expect(probeLink('google', olaSubject).count).toBe(1)

    // Keyboard: Escape cancels the confirmation (the link stays); Ctrl+Enter confirms; the unlink is announced.
    await unlink.focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(row).toBeVisible()
    await unlink.focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Control+Enter')
    await expect(outcome).toHaveText(
      uiText('foundation.identity.flash.unlinked', { params: { provider: 'Google' }, exact: true }),
    )
    await expect(section.getByTestId('identity-links-empty')).toHaveText(
      uiText('foundation.identity.empty', { exact: true }),
    )
    expect(probeLink('google', olaSubject).count).toBe(0)

    // The last sign-in method: "Unlink" disabled and explained, in light and dark mode.
    await openAccountTab(page, jan.personId)
    const janUnlink = section.getByTestId('identity-unlink-google')
    await expect(janUnlink).toBeDisabled()
    await expect(janUnlink).toHaveAttribute('aria-describedby', 'identity-last-method')
    await expect(section.getByTestId('identity-last-method')).toHaveText(
      uiText('foundation.identity.lastMethodAdmin', { exact: true }),
    )
    expect(
      await scanInColorSchemes(
        page,
        testInfo,
        'person identities, last method',
        async () => {
          await expect(page.getByTestId('identity-last-method')).toBeVisible()
        },
        { platformBaseline: true },
      ),
    ).toEqual({})
  } finally {
    await club.cleanup()
  }
})
