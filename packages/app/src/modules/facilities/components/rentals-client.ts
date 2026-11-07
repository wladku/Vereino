// Client-side helpers of the staff rentals (facilities spec B-23, B-24; #122): the row and quote types as the API
// returns them, the live quote (debounced, nothing is saved), the rental status actions with the lock token, local
// date and time handling of the browser, and the reading of the occupancy conflicts a refusal or a quote carries.
// Authorization stays on the routes and commands.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import type { LookupSelectItem } from '@open-mercato/ui/backend/inputs'
import {
  apiCallOrThrow,
  readApiResultOrThrow,
  withScopedApiRequestHeaders,
} from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { errorCodeOf } from '@vereino/core'
import { MOVABLE_RENTAL_STATUSES, type RentalStatus } from '../lib/rentals'
import { instantLabel, type Translate } from './facilities-client'

export const RENTALS_API = 'facilities/rentals'
export const RENTALS_URL = '/api/facilities/rentals'
export const RENTAL_QUOTE_URL = '/api/facilities/rentals/quote'

/** The query key prefix of every rental read, invalidated after a write. */
export const RENTALS_KEY = 'facilities-rentals'

/** One row of `GET /api/facilities/rentals`. */
export type RentalRow = {
  id: string
  placeId: string
  renterType: 'institution' | 'person' | 'unregistered'
  renterId: string | null
  renterDisplayName: string | null
  renterCategory: string | null
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  purpose: string | null
  requestedVia: string | null
  startsAt: string
  endsAt: string
  units: number
  amount: number | null
  chargeId: string | null
  status: RentalStatus
  cancellationDeadline: string | null
  paymentDeadline: string | null
  regulationsAcceptedAt: string | null
  regulationsAcceptedVia: string | null
  needsReschedule: boolean
  notes: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type ConflictKind = 'session' | 'rental' | 'closure'
export type RentalConflict = { kind: ConflictKind; id: string; start: string; end: string }
export type QuoteIssue = { code: string; conflicts?: RentalConflict[] }

/** `POST /api/facilities/rentals/quote` → 200. */
export type RentalQuote = {
  endsAt: string
  amount: number | null
  rateId: string | null
  appliedCategory: string | null
  cancellationDeadline: string | null
  paymentDeadline: string | null
  issues: QuoteIssue[]
}

export type QuoteInput = {
  placeId: string
  renterCategory: string
  startsAt: string
  units: number
  renterType?: string
  renterId?: string
  ignoreRentalId?: string
}

/** The status actions of B-24. */
export type RentalAction = 'confirm' | 'cancel' | 'move' | 'noShow'

/** The actions a rental in `status` offers: Confirm only while `requested`; Cancel, Move and No-show while it occupies. */
export function rentalActions(status: RentalStatus): RentalAction[] {
  if (!MOVABLE_RENTAL_STATUSES.includes(status)) return []
  return status === 'requested' ? ['confirm', 'cancel', 'move', 'noShow'] : ['cancel', 'move', 'noShow']
}

const STATUS_VARIANTS: Partial<Record<RentalStatus, StatusBadgeVariant>> = {
  pending_verification: 'info',
  pending_approval: 'info',
  requested: 'warning',
  confirmed: 'success',
  done: 'neutral',
  rejected: 'error',
  expired: 'neutral',
  superseded: 'neutral',
  cancelled_free: 'neutral',
  cancelled_late: 'error',
  no_show: 'error',
}

export function rentalStatusVariant(status: string): StatusBadgeVariant {
  return STATUS_VARIANTS[status as RentalStatus] ?? 'neutral'
}

export function rentalStatusLabel(t: Translate, status: string): string {
  return t(`facilities.rentals.status.${status}`)
}

// --- Local date and time (the browser's zone; the club zone is not exposed to the client) ---

const pad = (value: number) => String(value).padStart(2, '0')

/** `YYYY-MM-DD` of an instant in the browser's zone; '' when there is none. */
export function localDateOf(iso: string | null | undefined): string {
  return instantLabel(iso).slice(0, 10)
}

/** `HH:MM` of an instant in the browser's zone; '' when there is none. */
export function localTimeOf(iso: string | null | undefined): string {
  return instantLabel(iso).slice(11, 16)
}

/** A local date and wall time as an ISO instant (UTC offset), or null when either is missing or invalid. */
export function localInstant(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const value = new Date(`${date}T${time}`)
  return Number.isNaN(value.getTime()) ? null : value.toISOString()
}

/** The local midnight starting `date` as an ISO instant. */
export function localDayStart(date: string): string {
  return new Date(`${date}T00:00`).toISOString()
}

/** "2027-01-05 17:00–20:00" — a slot in the browser's zone. */
export function slotLabel(startsAt: string, endsAt: string): string {
  const startDate = localDateOf(startsAt)
  const endDate = localDateOf(endsAt)
  const end = endDate && endDate !== startDate ? `${endDate} ${localTimeOf(endsAt)}` : localTimeOf(endsAt)
  return `${startDate} ${localTimeOf(startsAt)}–${end}`
}

/** True when `now` is past the free cancellation deadline: the cancellation is late and the charge is forfeited. */
export function cancellationIsLate(deadline: string | null, now: Date): boolean {
  if (!deadline) return false
  const time = new Date(deadline).getTime()
  return !Number.isNaN(time) && now.getTime() > time
}

export function nowLocalTime(): string {
  const now = new Date()
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`
}

// --- Quote ---

/** `value` after it stopped changing for `delay` ms. */
export function useDebouncedValue<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value)
    }, delay)
    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])
  return debounced
}

/** The live quote of `input` (debounced); idle while `input` is null. */
export function useRentalQuote(input: QuoteInput | null) {
  const key = input ? JSON.stringify(input) : null
  const debouncedKey = useDebouncedValue(key)
  return useQuery({
    queryKey: [RENTALS_KEY, 'quote', debouncedKey],
    enabled: debouncedKey !== null,
    staleTime: 0,
    queryFn: () =>
      readApiResultOrThrow<RentalQuote>(RENTAL_QUOTE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: debouncedKey ?? '{}',
      }),
  })
}

// --- Conflicts and coded errors ---

function isConflict(entry: unknown): entry is RentalConflict {
  if (typeof entry !== 'object' || entry === null) return false
  const value = entry as Partial<RentalConflict>
  return (
    (value.kind === 'session' || value.kind === 'rental' || value.kind === 'closure') &&
    typeof value.start === 'string' &&
    typeof value.end === 'string'
  )
}

/** The occupancy conflicts a refused save carries (409 `rental_conflict`, `place_closed`); [] when none. */
export function conflictsOf(error: unknown): RentalConflict[] {
  const list = (error as { conflicts?: unknown } | null)?.conflicts
  return Array.isArray(list) ? list.filter(isConflict) : []
}

/** The coded issue of a refused save as a quote issue (so a form shows both the same way); null for other errors. */
export function issueOfError(error: unknown): QuoteIssue | null {
  const code = errorCodeOf(error)
  if (!code) return null
  const conflicts = conflictsOf(error)
  return conflicts.length > 0 ? { code, conflicts } : { code }
}

/** "Session 2027-01-05 17:00–18:30" — one conflict in words. */
export function conflictLabel(t: Translate, conflict: RentalConflict): string {
  return t('facilities.rentals.conflict.item', {
    kind: t(`facilities.rentals.conflict.kind.${conflict.kind}`),
    slot: slotLabel(conflict.start, conflict.end),
  })
}

// --- Status actions ---

const ACTION_PATHS: Record<Exclude<RentalAction, 'move'>, string> = {
  confirm: 'confirm',
  cancel: 'cancel',
  noShow: 'no-show',
}

export type RentalActionResult = { ok: true; id: string; status: RentalStatus; updatedAt: string | null }

/** Runs a status action with the rental's lock token; throws the API error (409 conflicts, coded refusals). */
export async function runRentalAction(
  row: Pick<RentalRow, 'id' | 'updatedAt'>,
  action: Exclude<RentalAction, 'move'> | 'move',
  body: Record<string, unknown>,
  errorMessage: string,
): Promise<RentalActionResult | null> {
  const path = action === 'move' ? 'move' : ACTION_PATHS[action]
  const call = await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
    apiCallOrThrow<RentalActionResult>(
      `${RENTALS_URL}/${encodeURIComponent(row.id)}/${path}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
      { errorMessage },
    ),
  )
  return call.result ?? null
}

// --- Renter search ---

type InstitutionItem = {
  id: string
  name: string | null
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
}
type PersonItem = { id: string; firstName: string | null; lastName: string | null; birthDate: string | null }

/** What the dialog keeps of a found renter: its name and, for an institution, its contact for prefilling. */
export type RenterChoice = {
  id: string
  name: string
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
}

export async function searchInstitutions(query: string): Promise<{ items: LookupSelectItem[]; found: RenterChoice[] }> {
  const params = new URLSearchParams({ pageSize: '20', sortField: 'name', sortDir: 'asc' })
  if (query.trim()) params.set('search', query.trim())
  const data = await readApiResultOrThrow<{ items?: InstitutionItem[] }>(
    `/api/club_core/institutions?${params.toString()}`,
  )
  const found = (data.items ?? []).map((item) => ({
    id: item.id,
    name: item.name ?? '',
    contactName: item.contactName,
    contactPhone: item.contactPhone,
    contactEmail: item.contactEmail,
  }))
  return {
    found,
    items: found.map((item) => ({ id: item.id, title: item.name, subtitle: item.contactName ?? null })),
  }
}

export async function searchPersons(query: string): Promise<{ items: LookupSelectItem[]; found: RenterChoice[] }> {
  const params = new URLSearchParams({ pageSize: '20' })
  if (query.trim()) params.set('search', query.trim())
  const data = await readApiResultOrThrow<{ items?: PersonItem[] }>(`/api/people/persons?${params.toString()}`)
  const found = (data.items ?? []).map((item) => ({
    id: item.id,
    name: [item.firstName, item.lastName].filter(Boolean).join(' '),
    contactName: null,
    contactPhone: null,
    contactEmail: null,
  }))
  return {
    found,
    items: (data.items ?? []).map((item, index) => ({
      id: item.id,
      title: found[index]?.name ?? '',
      subtitle: item.birthDate,
    })),
  }
}
