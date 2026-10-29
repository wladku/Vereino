// Helpers of the member-side integration tests of issue #27 (club spec phase 1 steps 4, 4a and 5; TEST-003, TEST-006,
// TEST-047, TEST-055): the member profile (`/api/people/me`), the captured invitation e-mails, the password set through
// the invitation link, the R10 payments gate through its operator CLI, and the sign-in through the real form.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { OPTIMISTIC_LOCK_HEADER, call, mercato, uniqueSuffix, type Club } from './club'

export type SelfConsent = { granted: boolean; at: string | null }
export type WardConsent = { granted: boolean; at: string | null; byPersonId: string | null }

export type MemberProfile = {
  person: {
    id: string
    firstName: string
    lastName: string
    birthDate: string | null
    email: string | null
    phone: string | null
    preferredLocale: string | null
    consents: { shareContactWithCoaches: SelfConsent; sharePresenceWithGuardians: SelfConsent }
    updatedAt: string | null
  }
  wards: {
    personId: string
    firstName: string
    lastName: string
    birthDate: string | null
    hasAccount: boolean
    guardianship: {
      id: string
      relation: string
      isPrimaryPayer: boolean
      consents: { regulations: WardConsent; image: WardConsent; trips: WardConsent }
      updatedAt: string | null
    }
  }[]
  roles: { role: string; sectionId: string | null }[]
  contexts: string[]
  locale: string
  club: { shortName: string | null; defaultLocale: string; timezone: string }
  paymentsVisible: boolean
  code?: string
}

export async function getMe(request: APIRequestContext, token: string, headers?: Record<string, string>) {
  return call<MemberProfile>(request, 'GET', '/api/people/me', token, { headers })
}

/** `PUT /api/people/me` with the person's lock token (omitted when null). */
export async function putMe(
  request: APIRequestContext,
  token: string,
  data: Record<string, unknown>,
  lockToken: string | null | undefined,
) {
  return call<{ person?: MemberProfile['person']; locale?: string; actingRole?: string; code?: string }>(
    request,
    'PUT',
    '/api/people/me',
    token,
    { data, headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {} },
  )
}

/** `PUT /api/club_core/settings` as the club administrator (partial update). */
export async function updateClubSettings(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const result = await call<{ code?: string }>(request, 'PUT', '/api/club_core/settings', token, { data })
  return result
}

const capturePath =
  process.env.OM_TEST_EMAIL_CAPTURE_PATH?.trim() || path.join(os.tmpdir(), 'open-mercato-email-capture.jsonl')

export type CapturedEmail = { to: string; subject: string; links: string[]; text: string }

/** The e-mails the app captured for `address` (`OM_TEST_MODE`), oldest first. */
export function capturedEmails(address: string): CapturedEmail[] {
  if (!fs.existsSync(capturePath)) return []
  return fs
    .readFileSync(capturePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line) as CapturedEmail)
    .filter((entry) => entry.to === address)
}

/**
 * Waits for the invitation e-mail of `address`, sets a password through its `/reset/<token>` link (the platform's
 * `POST /api/auth/reset/confirm`) and returns the password — the password-setup path a guardian takes.
 */
export async function acceptInvitation(request: APIRequestContext, address: string): Promise<string> {
  await expect.poll(() => capturedEmails(address).length, { timeout: 20_000 }).toBeGreaterThan(0)
  const invitation = capturedEmails(address).at(-1) as CapturedEmail
  const link = invitation.links.find((href) => href.includes('/reset/'))
  expect(link, `invitation link in ${JSON.stringify(invitation)}`).toBeTruthy()
  const token = decodeURIComponent(String(link).split('/reset/')[1].split(/[?#]/)[0])
  const password = `Vereino-${uniqueSuffix()}-Aa1!`
  const confirm = await request.post('/api/auth/reset/confirm', { form: { token, password } })
  expect(confirm.status(), await confirm.text()).toBe(200)
  return password
}

/** Runs the R10 gate of the phase 4 payments routes (`yarn mercato people check-own-payments`). */
export function checkOwnPayments(club: Club, userId: string): { allowed: boolean; status?: number; code?: string } {
  const result = mercato([
    'people',
    'check-own-payments',
    '--tenant',
    club.tenant.tenantId,
    '--org',
    club.tenant.organizationId,
    '--user',
    userId,
  ]) as { allowed: boolean; status?: number; code?: string } | null
  if (!result) throw new Error('[internal] people check-own-payments printed no result')
  return result
}

/**
 * Gives a user a per-user ACL in the club's tenant (it replaces the user's role features). The tenant is passed
 * explicitly: without it, `PUT /api/auth/users/acl` as the superadmin writes the ACL into the superadmin's own tenant,
 * where it never applies.
 */
export async function setUserFeatures(
  request: APIRequestContext,
  club: Club,
  userId: string,
  features: string[],
): Promise<void> {
  const result = await call<{ ok?: boolean }>(request, 'PUT', '/api/auth/users/acl', club.superToken, {
    data: { userId, tenantId: club.tenant.tenantId, organizations: null, features },
  })
  expect(result.status, JSON.stringify(result.body)).toBe(200)
}

/** Whether the token's user holds every feature (`POST /api/auth/feature-check`). */
export async function hasFeatures(request: APIRequestContext, token: string, features: string[]): Promise<boolean> {
  const result = await call<{ ok?: boolean }>(request, 'POST', '/api/auth/feature-check', token, {
    data: { features },
  })
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body?.ok === true
}

/** Signs in through the real `/login` form and waits until the app has left the sign-in page. */
export async function signInThroughForm(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('input[name="password"]').press('Enter')
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
}
