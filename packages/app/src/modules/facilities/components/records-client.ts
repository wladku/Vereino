// Client-side helpers of the facility records (facilities spec B-27; REQ-016; E08-S06 #126): the daily logs, the
// incidents and the entry bans as `GET /api/facilities/logs`, `/incidents` and `/entry-bans` return them, the writes
// of the panel (a log's fields, an incident's actions and case, a ban and its revocation — each update with its
// version as the platform's optimistic-lock token), the case threads an incident may be linked to and the conversion
// between instants and the `datetime-local` input. Authorization stays on the routes and commands.
import { useQuery } from '@tanstack/react-query'
import type { CrudFieldOption } from '@open-mercato/ui/backend/CrudForm'
import {
  apiCall,
  apiCallOrThrow,
  readApiResultOrThrow,
  withScopedApiRequestHeaders,
} from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { updateCrud } from '@open-mercato/ui/backend/utils/crud'
import type { IncidentAction } from '../lib/incidents'
import { instantLabel } from './facilities-client'

export const LOGS_HREF = '/backend/facilities/logs'
export const INCIDENTS_HREF = '/backend/facilities/incidents'
export const BANS_HREF = '/backend/facilities/bans'

export const LOGS_API = 'facilities/logs'
export const INCIDENTS_API = 'facilities/incidents'
export const ENTRY_BANS_API = 'facilities/entry-bans'
export const ENTRY_BANS_URL = '/api/facilities/entry-bans'

/** The query key prefixes of the record reads, invalidated after a write. */
export const LOGS_KEY = 'facilities-logs'
export const INCIDENTS_KEY = 'facilities-incidents'
export const BANS_KEY = 'facilities-entry-bans'

/** A communication thread's page in the panel (the case an incident is followed in). */
export const caseHref = (threadId: string) => `/backend/communication/threads/${encodeURIComponent(threadId)}`

export type LogGroup = {
  occurrenceId: string | null
  rentalId: string | null
  headcount: number
  adultSupervisorPresent: boolean
}

/** One row of `GET /api/facilities/logs`. */
export type LogRow = {
  id: string
  placeId: string
  placeName: string | null
  logDate: string | null
  operatorPersonId: string | null
  operatorName: string | null
  openedAt: string | null
  closedAt: string | null
  conditionBefore: string | null
  conditionAfter: string | null
  groupsPresent: LogGroup[]
  remarks: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** One row of `GET /api/facilities/incidents`. */
export type IncidentRow = {
  id: string
  placeId: string
  placeName: string | null
  occurredAt: string | null
  reportedByPersonId: string | null
  reportedByName: string | null
  kind: string | null
  description: string | null
  involved: string | null
  actionTaken: string[]
  threadId: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** One row of `GET /api/facilities/entry-bans`. */
export type BanRow = {
  id: string
  placeId: string
  subjectType: string | null
  subjectId: string | null
  startsOn: string | null
  endsOn: string | null
  reason: string | null
  incidentId: string | null
  issuedByPersonId: string | null
  revokedAt: string | null
  createdAt: string | null
  updatedAt: string | null
  placeName: string | null
  subjectName: string | null
  issuedByName: string | null
}

// --- The `datetime-local` input ---

/** An instant as the value of a `datetime-local` input in the browser's zone; '' when there is none. */
export function localDateTimeValue(iso: string | null | undefined): string {
  return instantLabel(iso).replace(' ', 'T')
}

/** A `datetime-local` value as an ISO instant; null when it is blank or invalid. */
export function instantOfLocal(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** "17:05" of an instant in the browser's zone; '' when there is none. */
export function timeLabel(iso: string | null | undefined): string {
  return instantLabel(iso).slice(11, 16)
}

// --- Writes ---

/** A coded 403 (`log_edit_closed`, `scope_denied`) is shown where it happened instead of the platform's banner. */
export const OWN_FORBIDDEN: Record<string, string> = { 'x-om-forbidden-redirect': '0' }

/** Changes a log's fields with its version as the lock token; throws the API error. */
export function updateLogRecord(row: Pick<LogRow, 'id' | 'updatedAt'>, fields: Record<string, unknown>) {
  return withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
    updateCrud(LOGS_API, { id: row.id, ...fields }, { headers: OWN_FORBIDDEN }),
  )
}

/** Changes an incident's actions taken and case with its version as the lock token; throws the API error. */
export function updateIncidentRecord(
  row: Pick<IncidentRow, 'id' | 'updatedAt'>,
  fields: { actionTaken: IncidentAction[]; threadId: string | null },
) {
  return withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
    updateCrud(INCIDENTS_API, { id: row.id, ...fields }, { headers: OWN_FORBIDDEN }),
  )
}

/** Ends a ban with its version as the lock token; throws the API error (409 `entry_ban_revoked`). */
export function revokeBan(row: Pick<BanRow, 'id' | 'updatedAt'>, errorMessage: string) {
  return withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
    apiCallOrThrow(
      `${ENTRY_BANS_URL}/${encodeURIComponent(row.id)}/revoke`,
      { method: 'POST', headers: { ...OWN_FORBIDDEN, 'content-type': 'application/json' }, body: JSON.stringify({}) },
      { errorMessage },
    ),
  )
}

// --- Features and options ---

const FEATURES = ['facilities.incidents.manage'] as const

function grants(granted: readonly string[], feature: string): boolean {
  return granted.some(
    (entry) => entry === '*' || entry === feature || (entry.endsWith('.*') && feature.startsWith(entry.slice(0, -1))),
  )
}

/** Whether the signed-in user may change incidents and manage entry bans (`facilities.incidents.manage`). */
export function useIncidentsManage(): boolean {
  const query = useQuery({
    queryKey: ['feature-check', ...FEATURES],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const call = await apiCall<{ granted?: unknown[] }>('/api/auth/feature-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features: FEATURES }),
      })
      return call.ok && Array.isArray(call.result?.granted) ? call.result.granted.map(String) : []
    },
  })
  return grants(query.data ?? [], 'facilities.incidents.manage')
}

type CaseThread = { id: string; subject: string; scopeLabel: string | null }

/**
 * The communication cases an incident may be linked to (`GET /api/communication/threads?isCase=1`), newest first;
 * null when the reader may not list them (the dialog then takes the case id as text).
 */
export function useCaseOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['facilities-incident-cases'],
    enabled,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CrudFieldOption[] | null> => {
      const params = new URLSearchParams({ isCase: '1', pageSize: '100' })
      try {
        const data = await readApiResultOrThrow<{ items?: CaseThread[] }>(
          `/api/communication/threads?${params.toString()}`,
          { headers: OWN_FORBIDDEN },
        )
        return (data.items ?? []).map((item) => ({
          value: item.id,
          label: item.scopeLabel ? `${item.subject} (${item.scopeLabel})` : item.subject,
        }))
      } catch {
        return null
      }
    },
  })
}
