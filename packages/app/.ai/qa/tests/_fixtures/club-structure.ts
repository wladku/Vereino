// Helpers of the `club_core` integration tests (club spec TEST-001, TEST-032; issue #25): club structure records
// created through the API, the list reads, a password sign-in for the browser and the leaf-rule CLI.
import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { OPTIMISTIC_LOCK_HEADER, call, mercato, uniqueSuffix, type Club } from './club'

export type SectionItem = {
  id: string
  name: string | null
  description: string | null
  isActive: boolean
  updatedAt: string | null
  _people?: {
    coordinators: { assignmentId: string; personId: string; lastName: string | null; active: boolean }[]
    coordinatorMissing: boolean
  }
}

export type PlaceItem = {
  id: string
  name: string | null
  kind: string | null
  parentPlaceId: string | null
  ownerInstitutionId: string | null
  capacityGroups: number
  contacts: { role: string | null; name: string; phone: string | null }[]
  description: string | null
  geoLat: number | null
  updatedAt: string | null
}

export type InstitutionItem = {
  id: string
  name: string | null
  type: string | null
  contactName: string | null
  bankAccount: string | null
  notes: string | null
  updatedAt: string | null
}

type List<T> = { items?: T[]; total?: number }

export async function create(
  request: APIRequestContext,
  token: string,
  resource: 'sections' | 'places' | 'institutions',
  data: Record<string, unknown>,
): Promise<string> {
  const result = await call<{ id?: string }>(request, 'POST', `/api/club_core/${resource}`, token, { data })
  expect(result.status, `POST /api/club_core/${resource} ${JSON.stringify(result.body)}`).toBe(201)
  return String(result.body?.id)
}

type ItemOf = { sections: SectionItem; places: PlaceItem; institutions: InstitutionItem }

export async function list<R extends keyof ItemOf>(
  request: APIRequestContext,
  token: string,
  resource: R,
  query = '',
): Promise<{ status: number; items: ItemOf[R][] }> {
  const result = await call<List<ItemOf[R]>>(request, 'GET', `/api/club_core/${resource}?pageSize=100${query}`, token)
  return { status: result.status, items: result.body?.items ?? [] }
}

export async function getOne<R extends keyof ItemOf>(
  request: APIRequestContext,
  token: string,
  resource: R,
  id: string,
): Promise<ItemOf[R] | undefined> {
  const { status, items } = await list(request, token, resource, `&ids=${id}`)
  expect(status).toBe(200)
  return items.find((item) => item.id === id)
}

/** `PUT` with the record's current lock token (or the given one). */
export async function update(
  request: APIRequestContext,
  token: string,
  resource: 'sections' | 'places' | 'institutions',
  data: Record<string, unknown> & { id: string },
  lockToken: string | null | undefined,
) {
  return call<{ updatedAt?: string; code?: string }>(request, 'PUT', `/api/club_core/${resource}`, token, {
    data,
    headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {},
  })
}

export async function remove(
  request: APIRequestContext,
  token: string,
  resource: 'sections' | 'places' | 'institutions',
  id: string,
  lockToken: string | null | undefined,
) {
  return call<{ code?: string }>(request, 'DELETE', `/api/club_core/${resource}?id=${id}`, token, {
    headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {},
  })
}

/** Runs the leaf rule through the `clubCorePlaces` DI service (`yarn mercato club_core check-bookable-place`). */
export function checkBookablePlace(club: Club, placeId: string): { bookable: boolean; status?: number; code?: string } {
  const result = mercato([
    'club_core',
    'check-bookable-place',
    '--tenant',
    club.tenant.tenantId,
    '--org',
    club.tenant.organizationId,
    '--place',
    placeId,
  ]) as { bookable: boolean; status?: number; code?: string } | null
  if (!result) throw new Error('[internal] club_core check-bookable-place printed no result')
  return result
}

/** Sets a password for a user (as superadmin), signs the browser page in with it and returns the password. */
export async function signInBrowser(
  page: Page,
  request: APIRequestContext,
  club: Club,
  userId: string,
  email: string,
): Promise<string> {
  const password = `Vereino-${uniqueSuffix()}-Aa1!`
  const reset = await call(request, 'PUT', '/api/auth/users', club.superToken, { data: { id: userId, password } })
  expect(reset.status, `PUT /api/auth/users ${JSON.stringify(reset.body)}`).toBe(200)
  const login = await page.request.post('/api/auth/login', { form: { email, password } })
  expect(login.ok(), `POST /api/auth/login ${String(login.status())}`).toBe(true)
  return password
}
