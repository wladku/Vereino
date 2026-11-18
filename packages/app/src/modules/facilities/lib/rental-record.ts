// Pure rules of a rental as a record (facilities parity spec phase 5: REQ-R04, REQ-R05, DD-R08; glossary *Rental
// correction*, *Charge state of a rental*, *Unpaid after the deadline*, *To be moved*; #279): which fields a
// correction may change in which status, the two B-24 perspectives as list filters, the charge state a list item
// carries, and the B-24 address state (`?status=&view=&place=&page=`). Nothing here reads the database or the clock.
import { MOVABLE_RENTAL_STATUSES, localSlotOf, type RentalStatus } from './rentals'

/** The statuses in which the contact, the purpose and the renter may be corrected; the notes also later (DD-R08). */
export const CORRECTABLE_RENTAL_STATUSES: readonly RentalStatus[] = ['requested', 'confirmed']

/** What a correction may change: the contact, the purpose, the notes and the renter record of an unregistered renter. */
export const RENTAL_CORRECTION_FIELDS = [
  'contactName',
  'contactPhone',
  'contactEmail',
  'purpose',
  'notes',
  'renter',
] as const
export type RentalCorrectionField = (typeof RENTAL_CORRECTION_FIELDS)[number]

/**
 * True when a correction of `fields` is refused in `status` (409 `rental_closed`): any field but the notes needs a
 * rental that still holds its slot (`requested` or `confirmed`); the notes may be written in every status.
 */
export function correctionClosed(status: RentalStatus, fields: readonly RentalCorrectionField[]): boolean {
  if (CORRECTABLE_RENTAL_STATUSES.includes(status)) return false
  return fields.some((field) => field !== 'notes')
}

/** The B-24 perspectives (`?view=`): "Do przeniesienia" and "Nieopłacone po terminie". */
export const RENTAL_VIEWS = ['to_move', 'unpaid'] as const
export type RentalView = (typeof RENTAL_VIEWS)[number]

export function isRentalView(value: unknown): value is RentalView {
  return typeof value === 'string' && (RENTAL_VIEWS as readonly string[]).includes(value)
}

/**
 * The list filter of a perspective, in the query engine's column names: *To be moved* is a flagged rental that still
 * holds its slot; *Unpaid after the deadline* is a `requested` rental whose payment deadline has passed (a rental whose
 * charge is already paid waits for `facilities.rentals.confirm_paid` of phase 11, which confirms it).
 */
export function rentalViewWhere(view: RentalView, now: Date): Record<string, unknown> {
  if (view === 'to_move') return { needs_reschedule: true, status: { $in: [...MOVABLE_RENTAL_STATUSES] } }
  return { status: 'requested', payment_deadline: { $lt: now.toISOString() } }
}

/** The charge state of a rental (glossary *Charge state of a rental*). */
export const RENTAL_CHARGE_STATES = ['none', 'open', 'partially_paid', 'paid', 'cancelled', 'forfeited'] as const
export type RentalChargeState = (typeof RENTAL_CHARGE_STATES)[number]

/**
 * `none` when the rental has no charge, or the charge service does not know it (`payments` off, a foreign or deleted
 * charge); otherwise the charge's own status.
 */
export function rentalChargeState(
  chargeId: string | null | undefined,
  statuses: ReadonlyMap<string, string>,
): RentalChargeState {
  const status = chargeId ? statuses.get(chargeId) : undefined
  return CHARGE_STATUSES.find((state) => state === status) ?? 'none'
}

const CHARGE_STATUSES = RENTAL_CHARGE_STATES.filter((state) => state !== 'none')

/** The charge states in which a rental waits for its payment (DD-R09): the charge exists and is not yet paid. */
export const AWAITING_CHARGE_STATES: readonly RentalChargeState[] = ['open', 'partially_paid']

/**
 * True when a direct confirm of the rental is refused (409 `rental_awaits_payment`, DD-R09): it has a charge the
 * charge service reports `open` or `partially_paid`. A rental without a charge, a `paid` charge (the repair path for a
 * missed payment event), a cancelled or forfeited charge, or a charge the service does not know is confirmed at once.
 */
export function awaitsPayment(chargeId: string | null | undefined, state: RentalChargeState): boolean {
  return Boolean(chargeId) && AWAITING_CHARGE_STATES.includes(state)
}

/** The translator the charge description is rendered with (the club's default locale). */
type DescriptionTranslate = (key: string, fallback?: string, params?: Record<string, string>) => string

/**
 * The description of a rental's charge (facilities parity spec *Charge of a rental*; the mockup's `charge.rentalDesc`):
 * "Wynajem: {place}, {date} {start}–{end}" with the date and wall times of the slot in the club zone.
 */
export function rentalChargeDescription(
  t: DescriptionTranslate,
  input: { placeName: string; startsAt: Date; endsAt: Date; timeZone: string; locale: string },
): string {
  const date = new Intl.DateTimeFormat(input.locale, {
    timeZone: input.timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(input.startsAt)
  const slot = localSlotOf(input.startsAt, input.endsAt, input.timeZone)
  return t('facilities.charge.rentalDesc', 'Rental: {place}, {date} {start}–{end}', {
    place: input.placeName,
    date,
    start: slot.from,
    end: slot.to,
  })
}

// --- The B-24 address (`/backend/facilities/rentals?status=&view=&place=&page=`) ---

/** The B-24 tabs as the address names them (the mockup's `?status=`); Active is the default. */
export const RENTAL_LIST_STATUSES = ['active', 'pending_approval', 'all'] as const
export type RentalListStatus = (typeof RENTAL_LIST_STATUSES)[number]

export type RentalListUrlState = {
  status: RentalListStatus
  view: RentalView | ''
  placeId: string
  page: number
}

/** The list state a B-24 address holds; unknown values fall back to the defaults. */
export function readRentalListUrl(get: (key: string) => string | null): RentalListUrlState {
  const status = get('status')
  const view = get('view')
  const page = Number(get('page'))
  return {
    status: (RENTAL_LIST_STATUSES as readonly string[]).includes(status ?? '')
      ? (status as RentalListStatus)
      : 'active',
    view: isRentalView(view) ? view : '',
    placeId: get('place') ?? '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/** The address parameters of a list state; the defaults are left out. */
export function rentalListUrlParams(state: RentalListUrlState): Record<string, string> {
  const params: Record<string, string> = {}
  if (state.status !== 'active') params.status = state.status
  if (state.view) params.view = state.view
  if (state.placeId) params.place = state.placeId
  if (state.page > 1) params.page = String(state.page)
  return params
}

/** The `GET /api/facilities/rentals` parameters of a list state (the API names the pending tab `awaiting_approval`). */
export function rentalListQuery(state: RentalListUrlState): Record<string, string> {
  const query: Record<string, string> = {}
  if (state.status === 'active') query.tab = 'active'
  if (state.status === 'pending_approval') query.tab = 'awaiting_approval'
  if (state.view) query.view = state.view
  if (state.placeId) query.placeId = state.placeId
  return query
}
