// Client-side helpers of the maintenance pages (facilities spec B-27 maintenance tab, M-11 "Plan maintenance"; REQ-022,
// DD-36; #128): the task and maintainer rows as `GET /api/facilities/maintenance-tasks` and `/place-maintainers` return
// them, the places the caller may plan on (read from the staff calendar, which answers a maintainer with the places
// assigned to them), the writes — a plan, a change or cancellation and a completion, each change with the task's
// version as the platform's optimistic-lock token — and the wording of a schedule. Authorization stays on the routes
// and commands; these helpers only hide what the server would refuse.
import { useQuery } from '@tanstack/react-query'
import type { CrudFieldOption } from '@open-mercato/ui/backend/CrudForm'
import { apiCall, apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { createCrud, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import {
  parseMaintenanceRecurrence,
  type MaintenanceKind,
  type MaintenanceRecurrence,
  type MaintenanceScheduleType,
} from '../lib/maintenance'
import { instantLabel, type FlaggedCounts, type Translate } from './facilities-client'

export const MAINTENANCE_HREF = '/backend/facilities/maintenance'

export const MAINTENANCE_API = 'facilities/maintenance-tasks'
export const MAINTENANCE_URL = '/api/facilities/maintenance-tasks'
export const MAINTAINERS_API = 'facilities/place-maintainers'
export const MAINTAINERS_URL = '/api/facilities/place-maintainers'

/** The query key prefixes of the maintenance reads, invalidated after a write. */
export const MAINTENANCE_KEY = 'facilities-maintenance-tasks'
export const MAINTAINERS_KEY = 'facilities-place-maintainers'

/** A coded 403 (`scope_denied`) is shown where it happened instead of the platform's sign-in redirect. */
export const OWN_FORBIDDEN: Record<string, string> = { 'x-om-forbidden-redirect': '0' }

/** One row of `GET /api/facilities/maintenance-tasks`. */
export type MaintenanceTaskRow = {
  id: string
  placeId: string
  placeName: string | null
  kind: string
  responsible: string
  scheduleType: string
  startsAt: string | null
  endsAt: string | null
  dueDate: string | null
  recurrenceRule: string | null
  usageHoursThreshold: number | null
  usageCountedFrom: string | null
  usageHours: number | null
  status: string
  plannedByName: string | null
  doneAt: string | null
  doneByName: string | null
  cost: number | null
  notes: string | null
  updatedAt: string | null
}

/** One row of `GET /api/facilities/place-maintainers`. */
export type PlaceMaintainerRow = {
  id: string
  placeId: string
  placeName: string | null
  personId: string
  personName: string | null
  assignedAt: string | null
}

/** The recurrence units a recurring task offers ("every N days / weeks / months / years"). */
export const RECURRENCE_FREQUENCIES: readonly MaintenanceRecurrence['freq'][] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']

/** `FREQ=YEARLY;INTERVAL=5` of a unit and an interval (the interval is left out when it is 1). */
export function recurrenceRuleOf(freq: MaintenanceRecurrence['freq'], interval: number): string {
  return interval > 1 ? `FREQ=${freq};INTERVAL=${String(interval)}` : `FREQ=${freq}`
}

/** "Every 5 years" — the plural form of the locale picks the key (`one`, `few`, `many`, `other`). */
export function recurrenceLabel(t: Translate, locale: string, rule: string | null): string | null {
  const parsed = rule ? parseMaintenanceRecurrence(rule) : null
  if (!parsed) return null
  const form = new Intl.PluralRules(locale).select(parsed.interval)
  const plural = form === 'one' || form === 'few' || form === 'many' ? form : 'other'
  return t(`facilities.maintenance.recurrence.${parsed.freq}.${plural}`, { count: parsed.interval })
}

export function kindLabel(t: Translate, kind: string | null | undefined): string {
  return kind ? t(`facilities.maintenance.kinds.${kind}`) : t('facilities.common.empty')
}

/** The schedule of a task in words: its window, its due date (and recurrence) or its usage threshold. */
export function scheduleLabel(t: Translate, locale: string, row: MaintenanceTaskRow): string {
  const parts: string[] = []
  if (row.startsAt && row.endsAt) {
    parts.push(
      t('facilities.maintenance.schedule.window', { from: instantLabel(row.startsAt), to: instantLabel(row.endsAt) }),
    )
  }
  if (row.dueDate) parts.push(t('facilities.maintenance.schedule.due', { date: row.dueDate }))
  const recurrence = recurrenceLabel(t, locale, row.recurrenceRule)
  if (row.scheduleType === 'date_recurring' && recurrence) parts.push(recurrence)
  if (row.scheduleType === 'usage_hours' && row.usageHoursThreshold !== null) {
    parts.push(
      row.usageHours !== null
        ? t('facilities.maintenance.schedule.usageCounted', {
            threshold: row.usageHoursThreshold,
            hours: row.usageHours,
          })
        : t('facilities.maintenance.schedule.usage', { threshold: row.usageHoursThreshold }),
    )
  }
  return parts.length > 0 ? parts.join(' · ') : t('facilities.common.empty')
}

export function statusVariant(status: string): 'info' | 'success' | 'neutral' {
  if (status === 'planned') return 'info'
  if (status === 'done') return 'success'
  return 'neutral'
}

/** "Maintenance planned. Marked to be moved: n sessions, n rentals, n bookings." — or the plain message. */
export function flashFlagged(t: Translate, result: unknown, fallback: string): void {
  const flagged = (result as { flagged?: Partial<FlaggedCounts> } | null)?.flagged
  const total = (flagged?.sessions ?? 0) + (flagged?.rentals ?? 0) + (flagged?.bookings ?? 0)
  if (flagged && total > 0) {
    flash(
      t('facilities.maintenance.flash.flagged', {
        sessions: flagged.sessions ?? 0,
        rentals: flagged.rentals ?? 0,
        bookings: flagged.bookings ?? 0,
      }),
      'success',
    )
  } else {
    flash(fallback, 'success')
  }
}

// --- The places the caller may plan on ---

type CalendarAccessAnswer = {
  maintenance?: { canPlan?: boolean; planPlaceIds?: string[] | null }
  places?: Array<{ id: string; name: string; parentName: string | null }>
}

export type MaintenancePlaces = { options: CrudFieldOption[]; canPlan: boolean }

/**
 * The places a task may be planned on: the staff calendar of the next day answers the club administrator with every
 * active place and a maintainer with the places assigned to them (`maintenance.planPlaceIds`, null = every place).
 */
export function useMaintenancePlaces() {
  return useQuery({
    queryKey: [MAINTENANCE_KEY, 'places'],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<MaintenancePlaces> => {
      const from = new Date()
      const to = new Date(from.getTime() + 24 * 60 * 60 * 1000)
      const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
      const call = await apiCall<CalendarAccessAnswer>(`/api/facilities/calendar?${params.toString()}`, {
        headers: OWN_FORBIDDEN,
      })
      if (!call.ok || !call.result) return { options: [], canPlan: false }
      const allowed = call.result.maintenance?.planPlaceIds ?? null
      const options = (call.result.places ?? [])
        .filter((place) => allowed === null || allowed.includes(place.id))
        .map((place) => ({
          value: place.id,
          label: place.parentName ? `${place.parentName} › ${place.name}` : place.name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label))
      return { options, canPlan: call.result.maintenance?.canPlan === true }
    },
  })
}

// --- Writes ---

export type MaintenanceTaskInput = {
  placeId: string
  kind: MaintenanceKind
  responsible?: 'club' | 'owner'
  scheduleType: MaintenanceScheduleType
  startsAt?: string | null
  endsAt?: string | null
  dueDate?: string | null
  recurrenceRule?: string | null
  usageHoursThreshold?: number | null
  cost?: number | null
  notes?: string | null
}

export type MaintenanceWriteResult = { id?: string; updatedAt?: string; flagged?: FlaggedCounts }

/** Plans a task; throws the API error (422 / 403 coded). */
export function createMaintenanceTask(input: MaintenanceTaskInput) {
  return createCrud<MaintenanceWriteResult>(MAINTENANCE_API, input, { headers: OWN_FORBIDDEN })
}

/** Changes (or with `status: 'cancelled'` cancels) a planned task with its version as the lock token. */
export function updateMaintenanceTask(
  row: Pick<MaintenanceTaskRow, 'id' | 'updatedAt'>,
  fields: Record<string, unknown>,
) {
  return withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
    updateCrud<MaintenanceWriteResult>(MAINTENANCE_API, { id: row.id, ...fields }, { headers: OWN_FORBIDDEN }),
  )
}

/** Marks a planned task done with its version as the lock token; throws the API error. */
export function completeMaintenanceTask(
  row: Pick<MaintenanceTaskRow, 'id' | 'updatedAt'>,
  body: { doneAt?: string; cost?: number | null; notes?: string | null },
  errorMessage: string,
) {
  return withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
    apiCallOrThrow<{ nextTaskId?: string | null }>(
      `${MAINTENANCE_URL}/${encodeURIComponent(row.id)}/complete`,
      { method: 'POST', headers: { ...OWN_FORBIDDEN, 'content-type': 'application/json' }, body: JSON.stringify(body) },
      { errorMessage },
    ),
  )
}

/** The dialog field a coded refusal belongs to. */
export const MAINTENANCE_FIELD_OF_CODE: Record<string, string> = {
  maintenance_window_invalid: 'endsAt',
  maintenance_scheduled: 'startsAt',
  maintenance_schedule_invalid: 'dueDate',
  maintenance_usage_threshold_invalid: 'usageHoursThreshold',
  facilities_reference_invalid: 'placeId',
  maintainer_exists: 'personId',
  maintainer_person_invalid: 'personId',
}

/** The field a coded refusal names (`field` of the error body), or the default field of its code. */
export function fieldOfError(error: unknown, code: string | null): string | null {
  const field = (error as { field?: unknown } | null)?.field
  if (typeof field === 'string' && field) return field
  return code ? (MAINTENANCE_FIELD_OF_CODE[code] ?? null) : null
}
