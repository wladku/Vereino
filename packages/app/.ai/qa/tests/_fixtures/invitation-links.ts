// Personal invitation links (personal invitation link spec, TEST-IL01…TEST-IL05; #868): an invited guardian of a
// ward, taking a link as a staff member, starting the activation from it and setting the password.
import { expect, type APIRequestContext } from '@playwright/test'
import {
  birthDateTurning,
  calendarDate,
  call,
  createAccount,
  createPerson,
  testEmailFor,
  uniqueSuffix,
  type Club,
} from './club'
import { createGuardianship } from './people'

export type InvitedGuardian = { personId: string; userId: string; email: string; firstName: string; lastName: string }

/** A guardian of `wardPersonId` whose account was just created by the administrator: invited, no password yet. */
export async function invitedGuardianOf(
  request: APIRequestContext,
  club: Club,
  wardPersonId: string,
  names: { firstName: string; lastName: string },
): Promise<InvitedGuardian> {
  const personId = await createPerson(request, club.adminToken, { ...names, birthDate: birthDateTurning(38) })
  const email = testEmailFor(names.firstName)
  const created = await createAccount(request, club.adminToken, personId, email)
  expect(created.status, JSON.stringify(created.body)).toBe(201)
  const userId = String(created.body?.userId)
  club.extraUserIds.push(userId)
  await createGuardianship(request, club.adminToken, {
    guardianPersonId: personId,
    wardPersonId,
    isPrimaryPayer: false,
    consents: { regulations: true },
    validFrom: calendarDate(-30),
  })
  return { personId, userId, email, ...names }
}

export type LinkBody = { url?: string; expiresAt?: string; code?: string; retryAfterSeconds?: number; error?: string }

/** `POST /api/people/persons/{id}/account/invitation-link` as the token's user. */
export function takeLink(
  request: APIRequestContext,
  token: string,
  personId: string,
  headers?: Record<string, string>,
) {
  return call<LinkBody>(request, 'POST', `/api/people/persons/${personId}/account/invitation-link`, token, {
    data: {},
    headers,
  })
}

/** A link the token's user takes, expected to succeed; returns the absolute URL. */
export async function linkFor(request: APIRequestContext, token: string, personId: string): Promise<string> {
  const result = await takeLink(request, token, personId)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  expect(result.response.headers()['cache-control']).toContain('no-store')
  return String(result.body?.url)
}

/** The raw token of a link URL (`…/club/i/{token}`). */
export function tokenOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.split('/club/i/')[1] ?? '')
}

/** The page path of a link, on the test server's own address. */
export function pathOf(url: string): string {
  return new URL(url).pathname
}

/** `POST /api/people/invitations/{token}/start` without a session. */
export async function startLink(request: APIRequestContext, url: string) {
  const response = await request.post(`/api/people/invitations/${encodeURIComponent(tokenOf(url))}/start`, {
    data: {},
  })
  const body = (await response.json().catch(() => null)) as { url?: string; code?: string } | null
  return { status: response.status(), body, headers: response.headers() }
}

/** Sets the password through the platform's reset confirmation of a `/reset/{raw}` URL. */
export async function confirmPassword(request: APIRequestContext, resetUrl: string): Promise<string> {
  const token = decodeURIComponent(resetUrl.split('/reset/')[1]?.split(/[?#]/)[0] ?? '')
  expect(token.length).toBeGreaterThan(10)
  const password = `Vereino-${uniqueSuffix()}-Aa1!`
  const confirm = await request.post('/api/auth/reset/confirm', { form: { token, password } })
  expect(confirm.status(), await confirm.text()).toBe(200)
  return password
}

/** `GET /api/people/invitations/pending` as the token's user. */
export function pendingFamilies(request: APIRequestContext, token: string, query = '') {
  return call<{
    items?: {
      personId: string
      displayName: string
      invitedAt: string | null
      children: { firstName: string; groupName: string }[]
    }[]
    total?: number
  }>(request, 'GET', `/api/people/invitations/pending${query ? `?${query}` : ''}`, token)
}
