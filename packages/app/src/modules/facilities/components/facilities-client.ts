// Client-side helpers shared by the `facilities` backend pages (#121): row types as the API returns them, links, the
// place options, the write feature check, date, money and weekday formatting, and the reading of the module's coded
// API errors. Authorization stays on the routes and commands; these helpers only hide what the server would refuse.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import type { DataTableProps } from '@open-mercato/ui/backend/DataTable'
import type { CrudFieldOption } from '@open-mercato/ui/backend/CrudForm'
import { apiCall, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import type { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import type { Zone, ZoneSource } from '../lib/zones'
import { errorCodes } from '../lib/error-codes'

export type Translate = ReturnType<typeof useT>

/** The column definitions `DataTable` takes for rows of type `T`. */
export type TableColumns<T extends object> = DataTableProps<T>['columns']

export const CALENDAR_HREF = '/backend/facilities/calendar'
export const ZONES_HREF = '/backend/facilities/zones'
export const CLOSURES_HREF = '/backend/facilities/closures'
export const RATES_HREF = '/backend/facilities/rates'
export const RENTALS_HREF = '/backend/facilities/rentals'

export const editHref = (base: string, id: string) => `${base}/${encodeURIComponent(id)}/edit`

export const ZONE_RULES_API = 'facilities/zone-rules'
export const ZONE_RULES_BULK_URL = '/api/facilities/zone-rules/bulk'
export const CLOSURES_API = 'facilities/closures'
export const RATES_API = 'facilities/rental-rates'

/** One row of `GET /api/facilities/zone-rules`. */
export type ZoneRuleRow = {
  id: string
  placeId: string
  weekdays: number[]
  timeFrom: string
  timeTo: string
  zone: Zone | null
  priority: number
  source: ZoneSource | null
  validFrom: string | null
  validTo: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** One row of `GET /api/facilities/closures`. */
export type ClosureRow = {
  id: string
  placeId: string
  startsAt: string | null
  endsAt: string | null
  reason: string | null
  note: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** One row of `GET /api/facilities/rental-rates`. */
export type RateRow = {
  id: string
  placeId: string
  renterCategory: string | null
  pricePer90: number
  seasonFrom: string | null
  seasonTo: string | null
  includesLighting: boolean
  validFrom: string | null
  validTo: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** What a closure save marked to be moved. */
export type FlaggedCounts = { sessions: number; rentals: number; bookings?: number }

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** A trimmed text value, or null when blank (explicit clearing, S6.3). */
export function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** A select or text value as the API takes it; '' when nothing is chosen (the required check runs first). */
export const chosen = (value: unknown): string => (typeof value === 'string' ? value : '')

const pad = (value: number) => String(value).padStart(2, '0')

/** Today's local calendar date (`YYYY-MM-DD`): the default start of a validity and the preview week. */
export function localToday(): string {
  const now = new Date()
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** "2027-01-05 17:00" — an instant in the browser's local time; '' when there is none. */
export function instantLabel(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** "from 2027-01-01" or "2027-01-01 – 2027-06-30". */
export function validityLabel(t: Translate, validFrom: string | null, validTo: string | null): string {
  if (!validFrom) return t('facilities.common.empty')
  return validTo
    ? t('facilities.validity.range', { from: validFrom, to: validTo })
    : t('facilities.validity.open', { from: validFrom })
}

export function weekdaysLabel(t: Translate, weekdays: readonly number[]): string {
  if (weekdays.length === 0) return t('facilities.common.empty')
  return weekdays.map((day) => t(`facilities.weekdays.short.${String(day)}`)).join(', ')
}

export function zoneLabel(t: Translate, zone: string | null | undefined): string {
  return zone ? t(`facilities.zones.zone.${zone}`) : t('facilities.common.empty')
}

/** Grosz as "12.50" (two decimals, no currency sign — the unit is in the column header). */
export function minorToAmount(minor: number): string {
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(minor))
  return `${sign}${String(Math.floor(abs / 100))}.${pad(abs % 100)}`
}

/** "12,5" / "12.50" / "12" as grosz, or null when it is not a non-negative amount with at most two decimals. */
export function amountToMinor(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(text.replace(/\s/g, ''))
  if (!match) return null
  const whole = Number(match[1])
  const fraction = Number((match.at(2) ?? '').padEnd(2, '0'))
  return whole * 100 + fraction
}

// --- Places ---

type PlaceOptionRow = { id: string; name: string; parentName: string | null; isLeaf: boolean }

export type PlaceOptions = { options: CrudFieldOption[]; names: Map<string, string> }

/** The active places of the club (`GET /api/club_core/options/places`), labelled "Parent › Name". */
export async function loadPlaceOptions(): Promise<CrudFieldOption[]> {
  const data = await readApiResultOrThrow<{ items?: PlaceOptionRow[] }>('/api/club_core/options/places')
  return (data.items ?? [])
    .map((item) => ({ value: item.id, label: item.parentName ? `${item.parentName} › ${item.name}` : item.name }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** An option loader that answers an empty list when the source is not readable (the field then shows no options). */
export async function tolerantPlaceOptions(): Promise<CrudFieldOption[]> {
  try {
    return await loadPlaceOptions()
  } catch {
    return []
  }
}

/** The place options and an id → label map for the lists. */
export function usePlaceOptions() {
  const query = useQuery({
    queryKey: ['facilities-place-options'],
    staleTime: 60 * 1000,
    queryFn: tolerantPlaceOptions,
  })
  const data = query.data
  return React.useMemo(() => {
    const options = data ?? []
    return {
      options,
      names: new Map(options.map((option) => [option.value, option.label])),
      isLoading: data === undefined,
    }
  }, [data])
}

export function placeLabel(t: Translate, names: Map<string, string>, placeId: string | null | undefined): string {
  if (!placeId) return t('facilities.common.empty')
  return names.get(placeId) ?? t('facilities.common.unknownPlace')
}

/** The query key prefix of every zone-rule read, invalidated after a write. */
export const ZONE_RULES_KEY = 'facilities-zone-rules'

/** All zone rules of one place (up to 200, the list maximum), optionally of one source; idle without a place. */
export function usePlaceZoneRules(placeId: string | null, source?: ZoneSource) {
  return useQuery({
    queryKey: [ZONE_RULES_KEY, 'place', placeId, source ?? 'all'],
    enabled: Boolean(placeId),
    queryFn: () =>
      fetchCrudList<ZoneRuleRow>(ZONE_RULES_API, {
        placeId,
        pageSize: 200,
        sortField: 'priority',
        sortDir: 'asc',
        ...(source ? { source } : {}),
      }),
  })
}

// --- Features ---

const FEATURES = ['facilities.manage', 'facilities.rentals.manage'] as const

function grants(granted: readonly string[], feature: string): boolean {
  return granted.some(
    (entry) => entry === '*' || entry === feature || (entry.endsWith('.*') && feature.startsWith(entry.slice(0, -1))),
  )
}

function useGrantedFeatures(): readonly string[] {
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
  return query.data ?? []
}

/** Whether the signed-in user may write facility rules (`facilities.manage`, wildcard-aware). */
export function useFacilitiesManage(): boolean {
  return grants(useGrantedFeatures(), 'facilities.manage')
}

/** Whether the signed-in user may enter and manage rentals (`facilities.rentals.manage`, wildcard-aware). */
export function useRentalsManage(): boolean {
  return grants(useGrantedFeatures(), 'facilities.rentals.manage')
}

// --- Coded API errors ---

const OWN_CODES = new Set<string>([...errorCodes.map((entry) => entry.code), 'validity_inverted'])

/** The message of a coded error of this module, from the catalog; null for other errors. */
export function codedMessage(error: unknown, t: Translate): string | null {
  const code = errorCodeOf(error)
  if (!code || !OWN_CODES.has(code)) return null
  return code === 'validity_inverted' ? t('facilities.errors.validity_inverted') : t(`facilities.errors.${code}`)
}

/**
 * Turns a refused save into what a form shows: the module's coded 409/422 go to the field they belong to (or to the
 * form when `fieldOf` names none). Other errors — the optimistic-lock 409 among them — pass on unchanged for the
 * form's own handling.
 */
export function saveError(error: unknown, t: Translate, fieldOf: Record<string, string>): unknown {
  const message = codedMessage(error, t)
  if (!message) return error
  const code = errorCodeOf(error) as string
  const field = fieldOf[code]
  return createCrudFormError(message, field ? { [field]: message } : undefined)
}
