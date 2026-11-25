// The medical certificate date of the training outlines and medical expiry spec, phase 1 (#682): the guardian's and the
// adult's `medical` consent, the date route, the status route and the daily job — shared by TEST-O01…TEST-O04.
import { expect, type APIRequestContext } from '@playwright/test'
import { OPTIMISTIC_LOCK_HEADER, call, mercato, type Club } from './club'
import { getMe } from './members'

export type MedicalStatusItem = {
  personId: string
  status: 'red' | 'orange' | 'green'
  state: 'missing' | 'unknown' | 'expired' | 'expiring' | 'valid'
  validUntil: string | null
}

type Coded = { code?: string; error?: string }
type MeMedical = { validUntil: string | null; status: string; consentInForce: boolean; updatedAt: string | null }
type MeWard = {
  personId: string
  guardianship: { id: string; updatedAt: string | null; consents: Record<string, { granted: boolean }> }
  medical?: MeMedical
}

/** The guardian's view of one ward on `GET /api/people/me`. */
export async function wardOf(request: APIRequestContext, guardianToken: string, wardId: string): Promise<MeWard> {
  const me = await getMe(request, guardianToken)
  expect(me.status, JSON.stringify(me.body)).toBe(200)
  const ward = ((me.body as { wards?: MeWard[] } | null)?.wards ?? []).find((entry) => entry.personId === wardId)
  if (!ward) throw new Error(`[test] ${wardId} is not a ward of the caller`)
  return ward
}

/** `POST /api/people/guardianships/{id}/consents` with only the `medical` consent. */
export async function setGuardianshipMedicalConsent(
  request: APIRequestContext,
  token: string,
  guardianship: { id: string; updatedAt: string | null },
  granted: boolean,
) {
  return call<Coded>(request, 'POST', `/api/people/guardianships/${guardianship.id}/consents`, token, {
    data: { consents: { medical: granted } },
    headers: guardianship.updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: guardianship.updatedAt } : {},
  })
}

/** A guardian gives (or withdraws) the `medical` consent for a ward; asserts 200. */
export async function guardianMedicalConsent(
  request: APIRequestContext,
  guardianToken: string,
  wardId: string,
  granted: boolean,
): Promise<void> {
  const ward = await wardOf(request, guardianToken, wardId)
  const result = await setGuardianshipMedicalConsent(request, guardianToken, ward.guardianship, granted)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
}

/** The person's lock token as the club administrator reads it. */
export async function personVersion(request: APIRequestContext, adminToken: string, personId: string): Promise<string> {
  const read = await call<{ updatedAt?: string }>(request, 'GET', `/api/people/persons/${personId}`, adminToken)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return String(read.body?.updatedAt)
}

/** `PUT /api/people/persons/{id}/medical` with the given lock token. */
export async function putMedical(
  request: APIRequestContext,
  token: string,
  personId: string,
  validUntil: string | null,
  lock: string | null,
) {
  return call<Coded & { validUntil?: string | null; updatedAt?: string | null }>(
    request,
    'PUT',
    `/api/people/persons/${personId}/medical`,
    token,
    { data: { validUntil }, headers: lock ? { [OPTIMISTIC_LOCK_HEADER]: lock } : {} },
  )
}

/** `GET /api/people/medical-status?personIds=…`; the items by person id. */
export async function medicalStatuses(
  request: APIRequestContext,
  token: string,
  personIds: readonly string[],
): Promise<{ status: number; byId: Map<string, MedicalStatusItem> }> {
  const read = await call<{ items?: MedicalStatusItem[] }>(
    request,
    'GET',
    `/api/people/medical-status?personIds=${personIds.join(',')}`,
    token,
  )
  return { status: read.status, byId: new Map((read.body?.items ?? []).map((item) => [item.personId, item])) }
}

export type MedicalRemindersResult = {
  today: string
  dryRun: boolean
  counts: {
    reminded: number
    clearedNoConsent: number
    clearedRetention: number
    clearedDeparted: number
    failed: number
  }
}

/** One run of the daily `people:medical-reminders` job through its CLI. */
export function runMedicalReminders(club: Club, today: string): MedicalRemindersResult {
  return mercato([
    'people',
    'medical-reminders',
    '--tenant',
    club.tenant.tenantId,
    '--org',
    club.tenant.organizationId,
    '--today',
    today,
  ]) as MedicalRemindersResult
}
