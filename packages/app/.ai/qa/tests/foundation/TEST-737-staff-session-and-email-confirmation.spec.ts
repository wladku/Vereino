import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test'
import { createUserFixture } from '@open-mercato/core/helpers/integration/authFixtures'
import { OPTIMISTIC_LOCK_HEADER, call, createClub, getPerson, uniqueSuffix, type Club } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { uiText } from '../_fixtures/ui-text'

// TEST-737 (E25-S03, S8.5, ENG-Q-12 answered 2026-11-26): a staff account cannot keep a long session — "remember me"
// gives it no refresh token and no `session_token` cookie, and its session expires the idle timeout after the last
// activity report, never past 8 hours after sign-in — while a member keeps "remember me". Changing one's own login
// e-mail needs the current password: the platform's profile route and the person record's account route refuse an own change
// (403 `email_change_confirmation_required`), `PUT /api/foundation/profile/email` refuses a wrong password and accepts
// the right one; an administrator still changes another user's e-mail. The backend profile page asks for the current
// password before it saves a new e-mail, and a staff page reports activity.
test.describe.configure({ timeout: 300_000 })

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000

type Coded = { code?: string; error?: string }
type Activity = { staff: boolean; expiresAt: string | null; idleTimeoutSeconds: number | null }
type Login = { ok?: boolean; token?: string; refreshToken?: string }

async function addUser(request: APIRequestContext, club: Club, roles: string[]) {
  const email = `t737-${uniqueSuffix()}@example.org`
  const password = `Vereino-${uniqueSuffix()}-Aa1!`
  const userId = await createUserFixture(request, club.superToken, {
    email,
    password,
    organizationId: club.tenant.organizationId,
    roles,
  })
  club.extraUserIds.push(userId)
  return { userId, email, password }
}

async function signIn(request: APIRequestContext, email: string, password: string) {
  const response = await request.post('/api/auth/login', { form: { email, password, remember: 'on' } })
  expect(response.status(), `POST /api/auth/login ${String(response.status())}`).toBe(200)
  const body = (await response.json()) as Login
  return { body, token: String(body.token), cookies: setCookies(response) }
}

function setCookies(response: APIResponse): string[] {
  return response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => header.value)
}

test('TEST-737 staff sessions end after the idle timeout; an own e-mail change needs the current password', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-737')
  try {
    const staff = await addUser(request, club, ['vereino_coach', 'vereino_member'])
    const member = await addUser(request, club, ['vereino_member'])

    // A staff sign-in with "remember me": no refresh token, no long-lived `session_token` cookie.
    const staffLogin = await signIn(request, staff.email, staff.password)
    expect(staffLogin.body.refreshToken).toBeUndefined()
    expect(staffLogin.cookies.some((cookie) => cookie.startsWith('session_token=') && /expires=/i.test(cookie))).toBe(
      false,
    )

    // Activity moves the staff session's expiry to the idle timeout after now, within 8 hours of sign-in.
    const before = Date.now()
    const staffActivity = await call<Activity>(request, 'POST', '/api/foundation/session/activity', staffLogin.token)
    expect(staffActivity.status, JSON.stringify(staffActivity.body)).toBe(200)
    expect(staffActivity.body?.staff).toBe(true)
    const idleMs = Number(staffActivity.body?.idleTimeoutSeconds) * 1000
    expect(idleMs).toBeGreaterThan(0)
    expect(idleMs).toBeLessThanOrEqual(EIGHT_HOURS_MS)
    const expiresAt = Date.parse(String(staffActivity.body?.expiresAt))
    expect(expiresAt).toBeGreaterThanOrEqual(before + idleMs - 5_000)
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + idleMs + 5_000)

    // A member keeps "remember me": the refresh token and a dated `session_token` cookie; activity changes nothing.
    const memberLogin = await signIn(request, member.email, member.password)
    expect(typeof memberLogin.body.refreshToken).toBe('string')
    expect(memberLogin.cookies.some((cookie) => cookie.startsWith('session_token=') && /expires=/i.test(cookie))).toBe(
      true,
    )
    const memberActivity = await call<Activity>(request, 'POST', '/api/foundation/session/activity', memberLogin.token)
    expect(memberActivity.status).toBe(200)
    expect(memberActivity.body).toEqual({ staff: false, expiresAt: null, idleTimeoutSeconds: null })

    // An own e-mail change without the password: refused on the platform profile route and the users admin route.
    const newMemberEmail = `t737-new-${uniqueSuffix()}@example.org`
    const viaProfile = await call<Coded>(request, 'PUT', '/api/auth/profile', memberLogin.token, {
      data: { email: newMemberEmail },
    })
    expect(viaProfile.status, JSON.stringify(viaProfile.body)).toBe(403)
    expect(viaProfile.body?.code).toBe('email_change_confirmation_required')
    expect(viaProfile.body?.error).toMatch(uiText('foundation.errors.email_change_confirmation_required'))
    const adminPerson = await getPerson(request, club.adminToken, club.adminPersonId)
    const ownViaAccountTab = await call<Coded>(
      request,
      'PUT',
      `/api/people/persons/${club.adminPersonId}/account`,
      club.adminToken,
      {
        data: { email: `t737-own-${uniqueSuffix()}@example.org` },
        headers: { [OPTIMISTIC_LOCK_HEADER]: String(adminPerson.body?.updatedAt) },
      },
    )
    expect(ownViaAccountTab.status, JSON.stringify(ownViaAccountTab.body)).toBe(403)
    expect(ownViaAccountTab.body?.code).toBe('email_change_confirmation_required')

    // The confirmed route: a wrong password is refused, the right one changes the e-mail.
    const wrong = await call<Coded>(request, 'PUT', '/api/foundation/profile/email', memberLogin.token, {
      data: { email: newMemberEmail, currentPassword: 'not-the-password' },
    })
    expect(wrong.status, JSON.stringify(wrong.body)).toBe(400)
    expect(wrong.body?.code).toBe('current_password_invalid')
    const right = await call<{ ok?: boolean; email?: string }>(
      request,
      'PUT',
      '/api/foundation/profile/email',
      memberLogin.token,
      { data: { email: newMemberEmail, currentPassword: member.password } },
    )
    expect(right.status, JSON.stringify(right.body)).toBe(200)
    expect(right.body).toEqual({ ok: true, email: newMemberEmail })
    const profile = await call<{ email?: string }>(request, 'GET', '/api/auth/profile', memberLogin.token)
    expect(profile.body?.email).toBe(newMemberEmail)

    // An administrator still changes another user's e-mail without a password.
    const byAdmin = await call<Coded>(request, 'PUT', '/api/auth/users', club.superToken, {
      data: { id: member.userId, email: `t737-admin-${uniqueSuffix()}@example.org` },
    })
    expect(byAdmin.status, JSON.stringify(byAdmin.body)).toBe(200)

    // The backend profile page: a staff page reports activity; a new e-mail needs the current password.
    const password = await signInBrowser(page, request, club, staff.userId, staff.email)
    const activityReport = page.waitForResponse(
      (response) => response.url().endsWith('/api/foundation/session/activity') && response.status() === 200,
    )
    await page.goto('/backend/auth/profile')
    await activityReport
    const form = page.getByTestId('vereino-profile-settings')
    await expect(form).toBeVisible()
    const newStaffEmail = `t737-page-${uniqueSuffix()}@example.org`
    await form.locator('[data-crud-field-id="email"] input').fill(newStaffEmail)
    await form.getByRole('button', { name: uiText('auth.profile.form.save', { exact: true }) }).click()
    await expect(form).toContainText(uiText('auth.profile.form.errors.currentPasswordRequired'))
    await form.locator('[data-crud-field-id="currentPassword"] input').fill(password)
    const saved = page.waitForResponse(
      (response) => response.url().endsWith('/api/foundation/profile/email') && response.request().method() === 'PUT',
    )
    await form.getByRole('button', { name: uiText('auth.profile.form.save', { exact: true }) }).click()
    expect((await saved).status()).toBe(200)
    await expect(page.getByText(uiText('auth.profile.form.success'))).toBeVisible()
    await expect(form.locator('[data-crud-field-id="email"] input')).toHaveValue(newStaffEmail)
  } finally {
    await club.cleanup()
  }
})
