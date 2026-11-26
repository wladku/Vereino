// Shared steps of the staff second factor tests (#736): staff with a role and a known password, a challenged sign-in
// with its e-mailed code, and a clean API context without the shared request fixture's cookie jar.
import { expect, type APIRequest, type APIRequestContext } from '@playwright/test'
import { capturedCount, isChallenge, postLogin, waitForCode, type LoginAnswer } from '../../../_fixtures/auth'
import {
  assignRole,
  birthDateTurning,
  call,
  createStaff,
  uniqueSuffix,
  userRoles,
  type Club,
} from '../../../_fixtures/club'

/** A cookie-free API context, so one test's sessions never ride along into another's calls. */
export async function cleanApi(playwright: { request: APIRequest }, baseURL: string | undefined) {
  return playwright.request.newContext({ baseURL: String(baseURL) })
}

/** Sets a new password for `userId` (as the super-admin) and returns it. */
export async function setPassword(request: APIRequestContext, club: Club, userId: string): Promise<string> {
  const password = `Vereino-${uniqueSuffix()}-Aa1!`
  const result = await call(request, 'PUT', '/api/auth/users', club.superToken, { data: { id: userId, password } })
  expect(result.status, `PUT /api/auth/users ${JSON.stringify(result.body)}`).toBe(200)
  return password
}

export type StaffAccount = { personId: string; userId: string; email: string; password: string }

/** A person of the club with an account, the role (when given, synced to `auth`; a coordinator needs `sectionId`) and a known password. */
export async function staffAccount(
  request: APIRequestContext,
  club: Club,
  firstName: string,
  role?: 'treasurer' | 'coordinator' | 'coach' | 'club_admin',
  scope: { sectionId?: string } = {},
): Promise<StaffAccount> {
  const staff = await createStaff(request, club, { firstName, lastName: 'Second', birthDate: birthDateTurning(35) })
  if (role) await grantRole(request, club, staff.personId, staff.userId, role, scope)
  const password = await setPassword(request, club, staff.userId)
  return { ...staff, password }
}

/** Assigns `role` from 2020 on and waits until the role sync gave it to the user. */
export async function grantRole(
  request: APIRequestContext,
  club: Club,
  personId: string,
  userId: string,
  role: string,
  scope: { sectionId?: string } = {},
): Promise<void> {
  await assignRole(request, club.adminToken, { personId, role, validFrom: '2020-01-01', ...scope })
  await expect.poll(() => userRoles(request, club, userId), { timeout: 20_000 }).toContain(`vereino_${role}`)
}

export type Challenge = { answer: LoginAnswer; token: string; code: string; since: number }

/** A password sign-in that must answer a challenge; returns the provisional token and the e-mailed code. */
export async function challenged(
  api: APIRequestContext,
  email: string,
  password: string,
  headers: Record<string, string> = {},
): Promise<Challenge> {
  const since = capturedCount(email)
  const answer = await postLogin(api, email, password, {}, headers)
  expect(isChallenge(answer), `POST /api/auth/login ${answer.status} ${JSON.stringify(answer.body)}`).toBe(true)
  return { answer, token: String(answer.body?.token), code: await waitForCode(email, since), since }
}

/** A six-digit code that is not `code`. */
export function wrongCode(code: string): string {
  return code === '000000' ? '111111' : '000000'
}
