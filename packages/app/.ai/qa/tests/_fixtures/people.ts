// Helpers of the `people` integration tests of issue #26 (club spec phase 1 step 3; TEST-002, TEST-004): guardianships
// and their reads, person and assignment lists, created through the API like every other fixture.
import { expect, type APIRequestContext } from '@playwright/test'
import { OPTIMISTIC_LOCK_HEADER, call } from './club'

export type ConsentView = { granted: boolean; at: string | null; byPersonId: string | null }

export type GuardianshipItem = {
  id: string
  guardianPersonId: string
  wardPersonId: string
  relation: string
  isPrimaryPayer: boolean
  validFrom: string | null
  validTo: string | null
  consents?: { regulations: ConsentView; image: ConsentView; trips: ConsentView }
  updatedAt: string
}

export type PersonItem = Record<string, unknown> & { id: string; updatedAt?: string }

export async function createGuardianship(
  request: APIRequestContext,
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const result = await call<{ id?: string }>(request, 'POST', '/api/people/guardianships', token, { data: input })
  expect(result.status, `POST /api/people/guardianships ${JSON.stringify(result.body)}`).toBe(201)
  return String(result.body?.id)
}

export async function guardianships(
  request: APIRequestContext,
  token: string,
  query: string,
): Promise<{ status: number; items: GuardianshipItem[]; raw: string }> {
  const result = await call<{ items?: GuardianshipItem[] }>(
    request,
    'GET',
    `/api/people/guardianships?pageSize=100&${query}`,
    token,
  )
  return { status: result.status, items: result.body?.items ?? [], raw: JSON.stringify(result.body) }
}

export async function getGuardianship(request: APIRequestContext, token: string, id: string) {
  return call<GuardianshipItem & { code?: string }>(request, 'GET', `/api/people/guardianships/${id}`, token)
}

/** `PUT /api/people/guardianships` with the record's current lock token. */
export async function updateGuardianship(
  request: APIRequestContext,
  token: string,
  data: Record<string, unknown> & { id: string },
  lockToken: string | null | undefined,
) {
  return call<{ updatedAt?: string; code?: string; actingRole?: string }>(
    request,
    'PUT',
    '/api/people/guardianships',
    token,
    { data, headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {} },
  )
}

export async function setConsents(
  request: APIRequestContext,
  token: string,
  id: string,
  consents: Record<string, boolean>,
  lockToken: string | null | undefined,
) {
  return call<GuardianshipItem & { code?: string; actingRole?: string }>(
    request,
    'POST',
    `/api/people/guardianships/${id}/consents`,
    token,
    { data: { consents }, headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {} },
  )
}

export async function endGuardianship(
  request: APIRequestContext,
  token: string,
  id: string,
  lockToken: string | null | undefined,
  validTo?: string,
) {
  return call<GuardianshipItem & { code?: string }>(request, 'POST', `/api/people/guardianships/${id}/end`, token, {
    data: validTo ? { validTo } : {},
    headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {},
  })
}

export async function persons(
  request: APIRequestContext,
  token: string,
  query = '',
): Promise<{ status: number; items: PersonItem[]; raw: string }> {
  const result = await call<{ items?: PersonItem[] }>(request, 'GET', `/api/people/persons?pageSize=100${query}`, token)
  return { status: result.status, items: result.body?.items ?? [], raw: JSON.stringify(result.body) }
}

export async function roleAssignments(
  request: APIRequestContext,
  token: string,
  query = '',
): Promise<{ status: number; items: { id: string; personId: string; sectionId: string | null; role: string }[] }> {
  const result = await call<{ items?: { id: string; personId: string; sectionId: string | null; role: string }[] }>(
    request,
    'GET',
    `/api/people/role-assignments?pageSize=100${query}`,
    token,
  )
  return { status: result.status, items: result.body?.items ?? [] }
}

/** The action-log entries of a resource visible to the token's user, with their undo tokens. */
export async function actionLogEntries(
  request: APIRequestContext,
  token: string,
  resourceId: string,
): Promise<{ commandId?: string; undoToken?: string | null; context?: Record<string, unknown> | null }[]> {
  const result = await call<{
    items?: { commandId?: string; undoToken?: string | null; context?: Record<string, unknown> | null }[]
  }>(request, 'GET', `/api/audit_logs/audit-logs/actions?resourceId=${resourceId}`, token)
  expect(result.status, `GET actions ${JSON.stringify(result.body)}`).toBe(200)
  return result.body?.items ?? []
}

/** The sensitive person fields a basic (coordinator) read never carries. */
export const SENSITIVE_PERSON_FIELDS = ['email', 'phone', 'notes', 'pesel', 'userId'] as const
