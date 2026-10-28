// Club fixture for the foundation and people integration tests (foundation spec *Integration Coverage*): an isolated
// tenant set up the way `mercato init` sets up a club — encryption maps (`entities seed-encryption`), the
// `vereino_*` roles with their features and the role-expiry schedule, and a first club administrator
// (`people bootstrap-admin`) — plus small API helpers. Everything is created through the API or the module CLI.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  createOrganizationFixture,
  createUserFixture,
  deleteOrganizationIfExists,
  deleteUserIfExists,
  setRoleAclFeatures,
} from '@open-mercato/core/helpers/integration/authFixtures'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'
import { createIsolatedTenant, type IsolatedTenant } from './tenant'

export const OPTIMISTIC_LOCK_HEADER = 'x-om-ext-optimistic-lock-expected-updated-at'

function findAppRoot(start: string): string {
  let dir = start
  for (;;) {
    const manifest = path.join(dir, 'package.json')
    if (fs.existsSync(manifest)) {
      const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { name?: string }
      if (parsed.name === '@vereino/app') return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error('[internal] packages/app not found above the working directory')
    dir = parent
  }
}

export const APP_ROOT = findAppRoot(process.cwd())

function lastJsonLine(stdout: string): unknown {
  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((entry) => entry.trim().startsWith('{'))
  return line ? (JSON.parse(line) as unknown) : null
}

/** Runs `yarn mercato <args>` in the app (the module CLI) and returns the last JSON line it printed. */
export function mercato(args: string[]): unknown {
  const result = spawnSync('yarn', ['mercato', ...args], {
    cwd: APP_ROOT,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 180_000,
  })
  if (result.status !== 0) {
    throw new Error(`[internal] yarn mercato ${args.join(' ')} exited ${String(result.status)}: ${result.stderr}`)
  }
  return lastJsonLine(result.stdout)
}

/** The same as `mercato`, without blocking the test (for races with API calls). */
export function mercatoAsync(args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn('yarn', ['mercato', ...args], {
      cwd: APP_ROOT,
      env: process.env,
      shell: process.platform === 'win32',
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`[internal] yarn mercato ${args.join(' ')} exited ${String(code)}: ${stderr}`))
      else resolve(lastJsonLine(stdout))
    })
  })
}

export type ApiResult<T = Record<string, unknown>> = { status: number; body: T | null; response: APIResponse }

export async function call<T = Record<string, unknown>>(
  request: APIRequestContext,
  method: string,
  url: string,
  token: string,
  options: { data?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResult<T>> {
  const response = await apiRequest(request, method, url, { token, data: options.data, headers: options.headers })
  return { status: response.status(), body: await readJsonSafe<T>(response), response }
}

/** `YYYY-MM-DD` of today (plus `offsetDays`) in the club zone. */
export function calendarDate(offsetDays = 0, timeZone = 'Europe/Warsaw'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(Date.now() + offsetDays * 86_400_000))
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<string, string>
  return `${byType.year}-${byType.month}-${byType.day}`
}

/** The birth date of someone who turns `years` old on `calendarDate(offsetDays)`. */
export function birthDateTurning(years: number, offsetDays = 0): string {
  const day = calendarDate(offsetDays)
  return `${String(Number(day.slice(0, 4)) - years).padStart(4, '0')}${day.slice(4)}`
}

export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export type Club = {
  tenant: IsolatedTenant
  superToken: string
  adminToken: string
  adminUserId: string
  adminPersonId: string
  /** Extra users and organizations to remove in `cleanup`. */
  extraUserIds: string[]
  extraOrganizationIds: string[]
  cleanup: () => Promise<void>
}

type BootstrapResult = { personId: string; userId: string; created: boolean; roleSync: string }

/** Sets up the club's `people` defaults and makes `userId` its club administrator (idempotent). */
export function bootstrapAdmin(scope: { tenantId: string; organizationId: string }, userId: string): BootstrapResult {
  const result = mercato([
    'people',
    'bootstrap-admin',
    '--tenant',
    scope.tenantId,
    '--org',
    scope.organizationId,
    '--user',
    userId,
    '--first-name',
    'Ada',
    '--last-name',
    'Admin',
  ]) as BootstrapResult | null
  if (!result?.personId) throw new Error('[internal] people bootstrap-admin printed no result')
  return result
}

/**
 * A tenant with one organization whose user is the club administrator. Its platform role (outside `vereino_*`) gets
 * the audit features the undo tests need; every role sync must keep it.
 */
export async function createClub(request: APIRequestContext, label: string): Promise<Club> {
  const tenant = await createIsolatedTenant(request, label)
  const superToken = await getAuthToken(request, 'superadmin')
  const extraUserIds: string[] = []
  const extraOrganizationIds: string[] = []
  const cleanup = async (): Promise<void> => {
    for (const userId of extraUserIds) await deleteUserIfExists(request, superToken, userId)
    for (const organizationId of extraOrganizationIds) {
      await deleteOrganizationIfExists(request, superToken, organizationId)
    }
    await tenant.cleanup()
  }
  try {
    await setRoleAclFeatures(request, superToken, {
      roleId: tenant.roleId,
      features: ['audit_logs.view_self', 'audit_logs.undo_self'],
    })
    mercato(['entities', 'seed-encryption', '--tenant', tenant.tenantId])
    const boot = bootstrapAdmin(tenant, tenant.userId)
    const adminToken = await getAuthToken(request, tenant.email, tenant.password)
    return {
      tenant,
      superToken,
      adminToken,
      adminUserId: tenant.userId,
      adminPersonId: boot.personId,
      extraUserIds,
      extraOrganizationIds,
      cleanup,
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}

export async function createPerson(
  request: APIRequestContext,
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const result = await call<{ id?: string }>(request, 'POST', '/api/people/persons', token, { data: input })
  expect(result.status, `POST /api/people/persons ${JSON.stringify(result.body)}`).toBe(201)
  return String(result.body?.id)
}

export async function assignRole(
  request: APIRequestContext,
  token: string,
  input: { personId: string; role: string; sectionId?: string; validFrom: string; validTo?: string | null },
): Promise<string> {
  const result = await call<{ id?: string }>(request, 'POST', '/api/people/role-assignments', token, { data: input })
  expect(result.status, `POST /api/people/role-assignments ${JSON.stringify(result.body)}`).toBe(201)
  return String(result.body?.id)
}

export async function getPerson(request: APIRequestContext, token: string, id: string) {
  return call(request, 'GET', `/api/people/persons/${id}`, token)
}

export async function getAssignment(request: APIRequestContext, token: string, id: string) {
  return call(request, 'GET', `/api/people/role-assignments/${id}`, token)
}

/** Creates the person's account; returns the API result (201 `{ userId, warning? }` or a coded error). */
export async function createAccount(
  request: APIRequestContext,
  token: string,
  personId: string,
  email: string,
  headers?: Record<string, string>,
) {
  return call<{ userId?: string; warning?: string; code?: string }>(
    request,
    'POST',
    `/api/people/persons/${personId}/account`,
    token,
    { data: { email }, headers },
  )
}

/** Sets a password for an invited user (as superadmin) so the test can sign in as that user. */
export async function signInAs(request: APIRequestContext, club: Club, userId: string, email: string): Promise<string> {
  const password = `Vereino-${uniqueSuffix()}-Aa1!`
  const result = await call(request, 'PUT', '/api/auth/users', club.superToken, { data: { id: userId, password } })
  expect(result.status, `PUT /api/auth/users ${JSON.stringify(result.body)}`).toBe(200)
  return getAuthToken(request, email, password)
}

/** A person with an account the test can sign in as. */
export async function createStaff(
  request: APIRequestContext,
  club: Club,
  input: { firstName: string; lastName: string; birthDate: string },
): Promise<{ personId: string; userId: string; email: string }> {
  const personId = await createPerson(request, club.adminToken, input)
  const email = `${input.firstName.toLowerCase()}-${uniqueSuffix()}@example.org`
  const account = await createAccount(request, club.adminToken, personId, email)
  expect(account.status, `create account ${JSON.stringify(account.body)}`).toBe(201)
  const userId = String(account.body?.userId)
  club.extraUserIds.push(userId)
  return { personId, userId, email }
}

/** The user's `auth` role names (as superadmin). */
export async function userRoles(request: APIRequestContext, club: Club, userId: string): Promise<string[]> {
  const result = await call<{ items?: { id: string; roles?: string[] }[] }>(
    request,
    'GET',
    `/api/auth/users?id=${userId}`,
    club.superToken,
  )
  expect(result.status).toBe(200)
  const user = result.body?.items?.find((item) => item.id === userId)
  return [...(user?.roles ?? [])].sort()
}

/** Polls until the user's role set equals `expected` (the role sync runs after the command commits). */
export async function expectRoles(
  request: APIRequestContext,
  club: Club,
  userId: string,
  expected: string[],
): Promise<void> {
  await expect.poll(() => userRoles(request, club, userId), { timeout: 20_000 }).toEqual([...expected].sort())
}

/** A second organization in the club's tenant with its own club administrator (a user of that organization). */
export async function createSecondOrganization(
  request: APIRequestContext,
  club: Club,
): Promise<{ organizationId: string; adminToken: string; adminUserId: string }> {
  const organizationId = await createOrganizationFixture(request, club.superToken, {
    name: `Vereino IT second club ${uniqueSuffix()}`,
    tenantId: club.tenant.tenantId,
  })
  club.extraOrganizationIds.push(organizationId)
  const email = `second-admin-${uniqueSuffix()}@example.org`
  const password = `Vereino-${uniqueSuffix()}-Aa1!`
  const adminUserId = await createUserFixture(request, club.superToken, {
    email,
    password,
    organizationId,
    roles: [club.tenant.roleId],
  })
  club.extraUserIds.unshift(adminUserId)
  bootstrapAdmin({ tenantId: club.tenant.tenantId, organizationId }, adminUserId)
  return { organizationId, adminToken: await getAuthToken(request, email, password), adminUserId }
}

/** The action-log entries of a resource visible to the token's user (`audit_logs.view_self`). */
export async function actionLogs(
  request: APIRequestContext,
  token: string,
  resourceId: string,
): Promise<{ commandId?: string; context?: Record<string, unknown> | null }[]> {
  const result = await call<{ items?: { commandId?: string; context?: Record<string, unknown> | null }[] }>(
    request,
    'GET',
    `/api/audit_logs/audit-logs/actions?resourceId=${resourceId}`,
    token,
  )
  expect(result.status, `GET actions ${JSON.stringify(result.body)}`).toBe(200)
  return result.body?.items ?? []
}
