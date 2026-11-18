// Client-side helpers of the staff rentals (facilities spec B-23, B-24; #122): the row and quote types as the API
// returns them, the live quote (debounced, nothing is saved), the rental status actions with the lock token, date and
// time handling in the club zone, and the reading of the occupancy conflicts a refusal or a quote carries.
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
import { errorCodeOf, isCalendarDate, isLocalTime, zonedInstant } from '@vereino/core'
import { browserTimeZone, useClubTimeZone } from '@vereino/ui'
import { awaitsPayment, type RentalChargeState } from '../lib/rental-record'
import { MOVABLE_RENTAL_STATUSES, type RentalStatus } from '../lib/rentals'
import { timeOf, zoneWallTime } from './club-places/places-client'
import type { Translate } from './facilities-client'

export const RENTALS_API = 'facilities/rentals'
export const RENTALS_URL = '/api/facilities/rentals'
export const RENTAL_QUOTE_URL = '/api/facilities/rentals/quote'

/** The query key prefix of every rental read, invalidated after a write. */
export const RENTALS_KEY = 'facilities-rentals'

/** B-24 and the rental page (#279). */
export const RENTALS_HREF = '/backend/facilities/rentals'
export const REQUESTS_HREF = '/backend/facilities/requests'

/** B-22, the charge record of `payments`, where the payment of a rental with a charge is recorded (DD-R09, #285). */
export function chargeHref(chargeId: string): string {
  return `/backend/payments/charges/${encodeURIComponent(chargeId)}`
}

/** The charge to record the payment on when "Confirm payment" leads there (DD-R09), else null (confirm at once). */
export function chargeAwaitingPayment(row: Pick<RentalRow, 'chargeId' | 'chargeState'>): string | null {
  return awaitsPayment(row.chargeId, row.chargeState) ? row.chargeId : null
}

export function rentalHref(id: string): string {
  return `${RENTALS_HREF}/${encodeURIComponent(id)}`
}

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
  emailVerifiedAt: string | null
  decisionReason: string | null
  needsReschedule: boolean
  notes: string | null
  createdAt: string | null
  updatedAt: string | null
  /** The owner institution the rental is paid to; null = the club's own account (#279). */
  payee: { institutionId: string; name: string } | null
  chargeState: RentalChargeState
}

export type ConflictKind = 'session' | 'rental' | 'closure' | 'maintenance'
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

/** B-24 shows "Confirm payment" and "Cancel" as buttons; Move and No-show stay in the row menu (#279). */
export const VISIBLE_RENTAL_ACTIONS: readonly RentalAction[] = ['confirm', 'cancel']

const CHARGE_STATE_VARIANTS: Record<RentalChargeState, StatusBadgeVariant> = {
  none: 'neutral',
  open: 'warning',
  partially_paid: 'warning',
  paid: 'success',
  cancelled: 'neutral',
  forfeited: 'error',
}

export function chargeStateVariant(state: RentalChargeState): StatusBadgeVariant {
  return CHARGE_STATE_VARIANTS[state]
}

/** "to: Gmina Przykładowo" or "to the club's account" (glossary *Payee of a rental*). */
export function payeeLabel(t: Translate, payee: RentalRow['payee']): string {
  return payee ? t('facilities.rentals.payee.owner', { name: payee.name }) : t('facilities.rentals.payee.club')
}

/** `PUT /api/facilities/rentals` body of a correction (#279). */
export type RentalCorrection = {
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  purpose: string | null
  notes: string | null
  renterType?: 'institution' | 'person'
  renterId?: string
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

// --- Club date and time (#221 L3) ---
// A rental's date and wall times are the club's (the quote and the zones are read in the club zone on the server), so
// the dialogs, the week and the labels read and write them in the club zone the page provides (#231), whatever zone
// the browser is in.

/** The club's IANA zone for rental wall times: the page's club zone, the browser's while none or an unknown one. */
export function useRentalTimeZone(): string {
  const timeZone = useClubTimeZone()
  return React.useMemo(() => knownZoneOr(timeZone, browserTimeZone()), [timeZone])
}

/** `timeZone` when the runtime knows it, otherwise `fallback`. */
export function knownZoneOr(timeZone: string | null, fallback: string): string {
  if (!timeZone) return fallback
  try {
    new Intl.DateTimeFormat('en', { timeZone })
    return timeZone
  } catch {
    return fallback
  }
}

/** The club-zone date and wall time of an instant; null when there is none. */
function wallOf(iso: string | null | undefined, timeZone: string): { date: string; time: string } | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const wall = zoneWallTime(at, timeZone)
  return { date: wall.date, time: timeOf(wall.minutes) }
}

/** `YYYY-MM-DD` of an instant in the club zone; '' when there is none. */
export function clubDateOf(iso: string | null | undefined, timeZone: string): string {
  return wallOf(iso, timeZone)?.date ?? ''
}

/** `HH:MM` of an instant in the club zone; '' when there is none. */
export function clubTimeOf(iso: string | null | undefined, timeZone: string): string {
  return wallOf(iso, timeZone)?.time ?? ''
}

/** A club-zone date and wall time as an ISO instant, or null when either is missing or invalid. */
export function clubInstant(date: string, time: string, timeZone: string): string | null {
  if (!isCalendarDate(date) || !/^\d{2}:\d{2}$/.test(time) || !isLocalTime(time)) return null
  return zonedInstant(date, time, timeZone).toISOString()
}

/** The club-zone midnight starting `date` as an ISO instant. */
export function clubDayStart(date: string, timeZone: string): string {
  return zonedInstant(date, '00:00', timeZone).toISOString()
}

/** "2027-01-05 17:00–20:00" — a slot in the club zone. */
export function slotLabel(startsAt: string, endsAt: string, timeZone: string): string {
  const startDate = clubDateOf(startsAt, timeZone)
  const endDate = clubDateOf(endsAt, timeZone)
  const endTime = clubTimeOf(endsAt, timeZone)
  const end = endDate && endDate !== startDate ? `${endDate} ${endTime}` : endTime
  return `${startDate} ${clubTimeOf(startsAt, timeZone)}–${end}`
}

/** True when `now` is past the free cancellation deadline: the cancellation is late and the charge is forfeited. */
export function cancellationIsLate(deadline: string | null, now: Date): boolean {
  if (!deadline) return false
  const time = new Date(deadline).getTime()
  return !Number.isNaN(time) && now.getTime() > time
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
    (value.kind === 'session' || value.kind === 'rental' || value.kind === 'closure' || value.kind === 'maintenance') &&
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
export function conflictLabel(t: Translate, conflict: RentalConflict, timeZone: string): string {
  return t('facilities.rentals.conflict.item', {
    kind: t(`facilities.rentals.conflict.kind.${conflict.kind}`),
    slot: slotLabel(conflict.start, conflict.end, timeZone),
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
