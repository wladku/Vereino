// Maintenance fixtures (#128, facilities spec phase 5 step 9; REQ-022, DD-36): the maintenance tasks, their
// completion, the place maintainers, a person who maintains a place (the derived role) and the reminder CLI.
import { expect, type APIRequestContext } from '@playwright/test'
import { OPTIMISTIC_LOCK_HEADER, call, mercato, signInAs, userRoles, type Club } from './club'
import type { CodedError } from './facilities'

type List<T> = { items?: T[]; total?: number }

export type Flagged = { sessions: number; rentals: number; bookings: number }

export type MaintenanceTaskItem = {
  id: string
  placeId: string
  kind: string
  scheduleType: string
  startsAt: string | null
  endsAt: string | null
  dueDate: string | null
  usageCountedFrom: string | null
  usageHours: number | null
  seriesId: string | null
  status: string
  plannedByName: string | null
  doneAt: string | null
  updatedAt: string
}

export async function postMaintenance(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<CodedError & { id?: string; updatedAt?: string; flagged?: Flagged }>(
    request,
    'POST',
    '/api/facilities/maintenance-tasks',
    token,
    { data },
  )
}

export async function putMaintenance(
  request: APIRequestContext,
  token: string,
  data: Record<string, unknown>,
  lockToken: string | null | undefined,
) {
  return call<CodedError & { id?: string; updatedAt?: string; status?: string; flagged?: Flagged }>(
    request,
    'PUT',
    '/api/facilities/maintenance-tasks',
    token,
    { data, headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {} },
  )
}

export async function completeMaintenance(
  request: APIRequestContext,
  token: string,
  id: string,
  lockToken: string | null | undefined,
  data: Record<string, unknown> = {},
) {
  return call<CodedError & { status?: string; nextTaskId?: string | null }>(
    request,
    'POST',
    `/api/facilities/maintenance-tasks/${id}/complete`,
    token,
    { data, headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {} },
  )
}

export async function listMaintenance(
  request: APIRequestContext,
  token: string,
  query = '',
): Promise<MaintenanceTaskItem[]> {
  const result = await call<List<MaintenanceTaskItem>>(
    request,
    'GET',
    `/api/facilities/maintenance-tasks?pageSize=100${query}`,
    token,
  )
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body?.items ?? []
}

export async function addMaintainer(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<CodedError & { id?: string }>(request, 'POST', '/api/facilities/place-maintainers', token, { data })
}

export async function removeMaintainer(request: APIRequestContext, token: string, id: string) {
  return call<CodedError & { ok?: boolean }>(request, 'DELETE', `/api/facilities/place-maintainers?id=${id}`, token)
}

/**
 * Assigns `personId` to maintain `placeId` (201 expected) and waits for the role sync to give the user the derived
 * role `vereino_maintenance_planner`; returns the assignment id and a fresh token of the user.
 */
export async function makeMaintainer(
  request: APIRequestContext,
  club: Club,
  staff: { personId: string; userId: string; email: string },
  placeId: string,
): Promise<{ assignmentId: string; token: string }> {
  const added = await addMaintainer(request, club.adminToken, { placeId, personId: staff.personId })
  expect(added.status, JSON.stringify(added.body)).toBe(201)
  await expect
    .poll(() => userRoles(request, club, staff.userId), { timeout: 20_000 })
    .toContain('vereino_maintenance_planner')
  const token = await signInAs(request, club, staff.userId, staff.email)
  return { assignmentId: String(added.body?.id), token }
}

export type ReminderResult = { now: string; sent: number; skipped: number; failed: number }

/** Runs `yarn mercato facilities maintenance-reminders` for the club as of `nowIso` (DD-46). */
export function runMaintenanceReminders(club: Club, nowIso: string): ReminderResult {
  const result = mercato([
    'facilities',
    'maintenance-reminders',
    '--tenant',
    club.tenant.tenantId,
    '--org',
    club.tenant.organizationId,
    '--now',
    nowIso,
  ]) as ReminderResult | null
  if (!result) throw new Error('[internal] facilities maintenance-reminders printed no result')
  return result
}
