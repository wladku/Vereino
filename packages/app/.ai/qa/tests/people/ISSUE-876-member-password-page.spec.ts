import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { familyFor } from '../_fixtures/attendance'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { call, createClub, uniqueSuffix } from '../_fixtures/club'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { getMe, putMe } from '../_fixtures/members'
import { uiTextIn } from '../_fixtures/ui-text'

// ISSUE-876 (#876; README M-10): a member changes their password on the phone, in the member app. The API part: the
// platform's `PUT /api/auth/profile`, which the page uses, answers a member's wrong current password with 400 and an
// issue on `currentPassword`, a password below the policy with 400 and an issue on `password`, and a common password
// with 422 `password_too_common`; each time the old password still signs in. The browser part at 375 px: "Change
// password" on `/club/profile` opens `/club/profile/password` in the member layout (bottom bar, no `/backend` link);
// in Polish and English, light and dark (axe), an empty send, a wrong current password, a password below the policy,
// a common password and a repeat that differs each show their message under the field and in the summary; a valid
// change returns to `/club/profile` with the message and keeps this device signed in while a session from before the
// change ends; the old password no longer signs in and the new one does.
// Q1 (default applied 2026-11-27): the member who opens the panel page `/backend/profile/change-password` lands on the
// member page; the club administrator keeps the panel page.
test.describe.configure({ timeout: 420_000 })

// Refused new passwords: below the 12-character policy, and on the common-password list.
const SHORT = 'short'
const COMMON = 'Qwerty123456'
const GOOD = () => `blue harbour lantern ${uniqueSuffix()}`

async function signsIn(request: APIRequestContext, email: string, password: string): Promise<boolean> {
  const response = await request.post('/api/auth/login', { form: { email, password } })
  return response.ok()
}

async function fillForm(page: Page, current: string, next: string, repeat: string): Promise<void> {
  await page.locator('#club-password-current').fill(current)
  await page.locator('#club-password-new').fill(next)
  await page.locator('#club-password-repeat').fill(repeat)
  await page.getByTestId('club-password-save').click()
}

test('ISSUE-876 members change their password in the phone app with every refusal readable', async ({
  page,
  request,
}, testInfo: TestInfo) => {
  const club = await createClub(request, 'issue-876')
  try {
    const family = await familyFor(request, club)
    const { email, userId } = family.guardian
    let password = await signInBrowser(page, request, club, userId, email)
    const token = await getAuthToken(request, email, password)

    // The API refusals of the route the page uses, each leaving the old password in place.
    const wrongCurrent = await call<{ issues?: Array<{ path?: unknown[] }> }>(
      request,
      'PUT',
      '/api/auth/profile',
      token,
      {
        data: { currentPassword: `${password}-wrong`, password: GOOD() },
      },
    )
    expect(wrongCurrent.status, JSON.stringify(wrongCurrent.body)).toBe(400)
    expect(wrongCurrent.body?.issues?.some((issue) => issue.path?.[0] === 'currentPassword')).toBe(true)
    const belowPolicy = await call<{ issues?: Array<{ path?: unknown[] }> }>(
      request,
      'PUT',
      '/api/auth/profile',
      token,
      {
        data: { currentPassword: password, password: SHORT },
      },
    )
    expect(belowPolicy.status, JSON.stringify(belowPolicy.body)).toBe(400)
    expect(belowPolicy.body?.issues?.some((issue) => issue.path?.[0] === 'password')).toBe(true)
    const common = await call<{ code?: string }>(request, 'PUT', '/api/auth/profile', token, {
      data: { currentPassword: password, password: COMMON },
    })
    expect(common.status, JSON.stringify(common.body)).toBe(422)
    expect(common.body?.code).toBe('password_too_common')
    expect(await signsIn(request, email, password)).toBe(true)

    // The phone: the profile link stays in the member app.
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/club/profile')
    await expect(page.getByTestId('club-profile-change-password')).toBeVisible()
    await expect(page.locator('main a[href^="/backend"]')).toHaveCount(0)
    await page.getByTestId('club-profile-change-password').click()
    await expect(page).toHaveURL(/\/club\/profile\/password$/)
    await expect(page.getByTestId('club-password-form')).toBeVisible()
    await expect(page.getByTestId('club-bottom-bar')).toBeVisible()

    const violations: Record<string, unknown> = {}
    for (const locale of ['pl', 'en'] as const) {
      const apiToken = await getAuthToken(request, email, password)
      const me = await getMe(request, apiToken)
      const saved = await putMe(request, apiToken, { preferredLocale: locale }, me.body?.person?.updatedAt)
      expect(saved.status, JSON.stringify(saved.body)).toBe(200)
      const text = (key: string) => uiTextIn(locale, key)
      await page.goto('/club/profile/password')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(text('people.club.password.title'))
      await expectNoPageOverflow(page)
      Object.assign(
        violations,
        await scanInColorSchemes(page, testInfo, `/club/profile/password (${locale})`, async () => {
          await expect(page.getByTestId('club-password-form')).toBeVisible()
        }),
      )
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

      // An empty send: the summary names both missing fields and the focus lands on the current password.
      await page.getByTestId('club-password-save').click()
      await expect(page.getByTestId('club-password-problems').getByRole('link')).toHaveText([
        text('people.club.password.errors.currentRequired'),
        text('people.club.password.errors.newRequired'),
      ])
      await expect(page.locator('#club-password-current')).toBeFocused()

      // A wrong current password (the server's answer).
      const fresh = GOOD()
      await fillForm(page, `${password}-wrong`, fresh, fresh)
      await expect(page.getByTestId('club-password-current-error')).toHaveText(
        text('people.club.password.errors.currentInvalid'),
      )
      await expect(page.locator('#club-password-current')).toBeFocused()
      Object.assign(
        violations,
        await scanInColorSchemes(page, testInfo, `/club/profile/password refused (${locale})`, async () => {
          await fillForm(page, `${password}-wrong`, 'x', 'x')
          await expect(page.getByTestId('club-password-new-error')).toBeVisible()
        }),
      )
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

      // A password below the policy (checked in the browser with the server's policy).
      await fillForm(page, password, SHORT, SHORT)
      await expect(page.getByTestId('club-password-new-error')).toHaveText(text('people.club.password.errors.policy'))
      await expect(page.locator('#club-password-new')).toBeFocused()

      // A common password: the server's Vereino check answers in the member's language.
      await fillForm(page, password, COMMON, COMMON)
      await expect(page.getByTestId('club-password-new-error')).toHaveText(
        text('foundation.errors.password_too_common'),
      )

      // A repeat that differs.
      const next = GOOD()
      await fillForm(page, password, next, `${next}x`)
      await expect(page.getByTestId('club-password-repeat-error')).toHaveText(
        text('people.club.password.errors.mismatch'),
      )
      await expect(page.locator('#club-password-repeat')).toBeFocused()
      expect(await signsIn(request, email, password)).toBe(true)
    }

    // A valid change: back on the profile with the message; this device stays signed in, every other session (an API
    // token taken before) ends; the old password no longer signs in, the new one does.
    const otherSession = await getAuthToken(request, email, password)
    const next = GOOD()
    await page.goto('/club/profile/password')
    await fillForm(page, password, next, next)
    await expect(page).toHaveURL(/\/club\/profile$/)
    await expect(page.getByTestId('club-profile-password-changed')).toHaveText(
      uiTextIn('en', 'people.club.profile.password.changed'),
    )
    await page.reload()
    await expect(page).toHaveURL(/\/club\/profile$/)
    await expect(page.getByTestId('club-profile-change-password')).toBeVisible()
    await expect(page.getByTestId('club-profile-password-changed')).toHaveCount(0)
    expect((await call(request, 'GET', '/api/people/me', otherSession)).status).toBe(401)
    expect(await signsIn(request, email, password)).toBe(false)
    expect(await signsIn(request, email, next)).toBe(true)
    password = next

    // Q1: the panel page sends the member to the member page; the club administrator keeps it.
    await page.goto('/backend/profile/change-password')
    await expect(page).toHaveURL(/\/club\/profile\/password$/)
    await expect(page.getByTestId('club-password-form')).toBeVisible()
    await switchBrowserUser(page, request, club, club.adminUserId, club.tenant.email)
    await page.goto('/backend/profile/change-password')
    await expect(page).toHaveURL(/\/backend\/profile\/change-password$/)
    await expect(page.getByTestId('vereino-profile-settings')).toBeVisible()

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
