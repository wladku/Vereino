// Pure rules of the online booking requests (facilities spec glossary *External request*, REQ-024, R06, DD-44, DD-46,
// V-10; #125): the request form's limits (P-04), the 1-hour confirmation link, the 48-hour hold, the per-e-mail rate
// limit of the public request route, the entry-ban name hint of the B-25 queue and the approval's amount rule. Nothing
// here reads the database or the clock (S3.5): `now` is a parameter.
import { createHash } from 'node:crypto'
import { intervalsOverlap } from '@vereino/core'
import type { RentalStatus } from './rentals'

/** The requester's organisation or name (P-04: 2–120 characters). */
export const REQUESTER_NAME_MIN_LENGTH = 2
export const REQUESTER_NAME_MAX_LENGTH = 120

/** The purpose of a request (P-04: at most 300 characters). */
export const REQUEST_PURPOSE_MAX_LENGTH = 300

/** A rejection reason (B-25: 5–500 characters). */
export const REJECT_REASON_MIN_LENGTH = 5
export const REJECT_REASON_MAX_LENGTH = 500

/** The note an amount change needs (B-25). */
export const APPROVAL_NOTE_MAX_LENGTH = 500

/** The confirmation link works for 1 hour (DD-44); an unconfirmed request is purged after it (DD-46). */
export const REQUEST_VERIFICATION_TTL_MS = 60 * 60 * 1000

/** A confirmed request holds its slot against other requests for 48 hours at most (R06). */
export const REQUEST_HOLD_HOURS = 48

const HOUR_MS = 60 * 60 * 1000

/** When the hold of a request confirmed at `verifiedAt` ends. */
export function holdExpiry(verifiedAt: Date): Date {
  return new Date(verifiedAt.getTime() + REQUEST_HOLD_HOURS * HOUR_MS)
}

/** True while a `pending_approval` request still holds its slot (the expiry job may not have run yet). */
export function holdActive(request: { status: RentalStatus; holdExpiresAt: Date | null }, now: Date): boolean {
  return (
    request.status === 'pending_approval' &&
    request.holdExpiresAt !== null &&
    request.holdExpiresAt.getTime() > now.getTime()
  )
}

/** A request as the hold check reads it. */
export type RequestHoldShape = {
  readonly id: string
  readonly status: RentalStatus
  readonly holdExpiresAt: Date | null
  readonly start: Date
  readonly end: Date
}

/** The other requests whose valid hold overlaps the window (409 `slot_unavailable` for a request or a confirmation). */
export function blockingHolds<T extends RequestHoldShape>(
  requests: readonly T[],
  window: { start: Date; end: Date },
  now: Date,
  ignoreId: string | null = null,
): T[] {
  return requests.filter(
    (request) => request.id !== ignoreId && holdActive(request, now) && intervalsOverlap(request, window),
  )
}

/**
 * The per-e-mail limit of `POST …/requests` (V-10, TEST-036): 5 requests an hour per address, whatever the IP. The key
 * is the SHA-256 of the normalized address alone, so rotating IPs does not reset it and the store never holds the
 * address; the check fails closed (503 when the store is down).
 */
export const REQUEST_EMAIL_RATE_LIMIT = { points: 5, duration: 60 * 60, keyPrefix: 'facilities_request_email' }

export type RequestEmailLimit = {
  config: typeof REQUEST_EMAIL_RATE_LIMIT
  key: string
  options: { failClosed: true }
}

export function requestEmailLimit(email: string): RequestEmailLimit {
  const key = createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
  return { config: REQUEST_EMAIL_RATE_LIMIT, key, options: { failClosed: true } }
}

/**
 * A name compared for the entry-ban hint: case, diacritics and spacing ignored; dots and apostrophes dropped ("K.S."
 * reads "ks"), any other punctuation read as a space.
 */
export function comparableName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * True when a requester's name (organisation or contact) equals the name of a renter banned from the place (B-25
 * "ban-register check"): a hint for the administrator only — the request is never refused for it (TEST-036).
 */
export function entryBanNameMatch(requesterNames: readonly string[], bannedNames: readonly string[]): boolean {
  const banned = new Set(bannedNames.map(comparableName).filter((name) => name.length > 0))
  return requesterNames.some((name) => banned.has(comparableName(name)))
}

/** The amount an approval stores and whether its note is missing (B-25: an amount change requires a note). */
export function approvalAmount(
  quoted: number | null,
  override: number | null,
  note: string | null,
): { amount: number | null; noteMissing: boolean } {
  if (override === null) return { amount: quoted, noteMissing: false }
  const changed = override !== quoted
  return { amount: override, noteMissing: changed && (note === null || note.trim().length === 0) }
}

/** An amount in minor units as the e-mails and P-05 show it, e.g. `120,00 zł`. */
export function formatAmount(minor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100)
}

/** A slot in the club zone as the e-mails show it, e.g. `12.11.2026, 19:30–21:00`. */
export function formatSlot(startsAt: Date, endsAt: Date, timeZone: string, locale: string): string {
  const day = new Intl.DateTimeFormat(locale, { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${day.format(startsAt)}, ${time.format(startsAt)}–${time.format(endsAt)}`
}

/** An instant in the club zone with its date and time, e.g. `14.11.2026, 19:30` (deadlines, the hold's end). */
export function formatInstant(instant: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant)
}
