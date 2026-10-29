// Helpers of the `groups` integration tests (club spec phase 2 step 2, TEST-030; issue #30): groups, memberships,
// seasons and external teams created through the API, and staff signed in with a coordinator or coach role — every
// record is created through the API like every other fixture.
import { expect, type APIRequestContext } from '@playwright/test'
import { OPTIMISTIC_LOCK_HEADER, assignRole, birthDateTurning, call, createStaff, signInAs, type Club } from './club'

export type GroupItem = {
  id: string
  sectionId: string | null
  sectionName?: string | null
  name: string | null
  kind: string | null
  league: string | null
  seasonId: string | null
  seasonName?: string | null
  isActive: boolean
  updatedAt: string | null
  actingRole?: string
  code?: string
}

export type MembershipItem = {
  id: string
  groupId: string | null
  personId: string | null
  person?: { firstName: string; lastName: string } | null
  role: string | null
  validFrom: string | null
  validTo: string | null
  updatedAt: string | null
}

type List<T> = { items?: T[]; total?: number }

export async function postGroup(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<{ id?: string; code?: string; fields?: string[] }>(request, 'POST', '/api/groups/groups', token, { data })
}

export async function createGroup(
  request: APIRequestContext,
  token: string,
  data: Record<string, unknown>,
): Promise<string> {
  const result = await postGroup(request, token, data)
  expect(result.status, `POST /api/groups/groups ${JSON.stringify(result.body)}`).toBe(201)
  return String(result.body?.id)
}

export async function listGroups(
  request: APIRequestContext,
  token: string,
  query = '',
): Promise<{ status: number; items: GroupItem[] }> {
  const result = await call<List<GroupItem>>(request, 'GET', `/api/groups/groups?pageSize=100${query}`, token)
  return { status: result.status, items: result.body?.items ?? [] }
}

export async function getGroup(request: APIRequestContext, token: string, id: string) {
  return call<GroupItem>(request, 'GET', `/api/groups/groups/${id}`, token)
}

/** `PUT /api/groups/groups` with the given lock token. */
export async function updateGroup(
  request: APIRequestContext,
  token: string,
  data: Record<string, unknown> & { id: string },
  lockToken: string | null | undefined,
) {
  return call<{ updatedAt?: string; code?: string; actingRole?: string }>(request, 'PUT', '/api/groups/groups', token, {
    data,
    headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {},
  })
}

export async function deleteGroup(
  request: APIRequestContext,
  token: string,
  id: string,
  lockToken: string | null | undefined,
) {
  return call<{ code?: string }>(request, 'DELETE', `/api/groups/groups?id=${id}`, token, {
    headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {},
  })
}

export async function postMembership(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<{ id?: string; code?: string }>(request, 'POST', '/api/groups/memberships', token, { data })
}

export async function addMembership(
  request: APIRequestContext,
  token: string,
  data: { groupId: string; personId: string; role: string; validFrom: string; validTo?: string | null },
): Promise<string> {
  const result = await postMembership(request, token, data)
  expect(result.status, `POST /api/groups/memberships ${JSON.stringify(result.body)}`).toBe(201)
  return String(result.body?.id)
}

export async function roster(
  request: APIRequestContext,
  token: string,
  groupId: string,
  query = '',
): Promise<{ status: number; items: MembershipItem[] }> {
  const result = await call<List<MembershipItem>>(
    request,
    'GET',
    `/api/groups/memberships?pageSize=100&groupId=${groupId}${query}`,
    token,
  )
  return { status: result.status, items: result.body?.items ?? [] }
}

export async function endMembership(
  request: APIRequestContext,
  token: string,
  id: string,
  lockToken: string | null | undefined,
  validTo?: string,
) {
  return call<MembershipItem & { code?: string; actingRole?: string }>(
    request,
    'POST',
    `/api/groups/memberships/${id}/end`,
    token,
    { data: validTo ? { validTo } : {}, headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {} },
  )
}

export async function createSeason(
  request: APIRequestContext,
  token: string,
  data: { name: string; startsOn: string; endsOn: string },
): Promise<string> {
  const result = await call<{ id?: string }>(request, 'POST', '/api/groups/seasons', token, { data })
  expect(result.status, `POST /api/groups/seasons ${JSON.stringify(result.body)}`).toBe(201)
  return String(result.body?.id)
}

/** A person with an account, a role assignment (`coordinator` of `sectionId`, or `coach`) and a fresh token. */
export async function signedInStaff(
  request: APIRequestContext,
  club: Club,
  input: { firstName: string; lastName: string; role: 'coordinator' | 'coach'; sectionId?: string },
): Promise<{ personId: string; userId: string; token: string }> {
  const staff = await createStaff(request, club, {
    firstName: input.firstName,
    lastName: input.lastName,
    birthDate: birthDateTurning(35),
  })
  await assignRole(request, club.adminToken, {
    personId: staff.personId,
    role: input.role,
    ...(input.sectionId ? { sectionId: input.sectionId } : {}),
    validFrom: '2020-01-01',
  })
  // The role sync runs after the assignment commits; a fresh token after the password reflects the new roles.
  await expect
    .poll(
      async () => {
        const result = await call<{ items?: { id: string; roles?: string[] }[] }>(
          request,
          'GET',
          `/api/auth/users?id=${staff.userId}`,
          club.superToken,
        )
        return result.body?.items?.find((item) => item.id === staff.userId)?.roles ?? []
      },
      { timeout: 20_000 },
    )
    .toContain(input.role === 'coach' ? 'vereino_coach' : 'vereino_coordinator')
  const token = await signInAs(request, club, staff.userId, staff.email)
  return { personId: staff.personId, userId: staff.userId, token }
}
