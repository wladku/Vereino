// Pure rules of the public request form (facilities spec P-04, REQ-024; #125) and of the request queue's time to
// expiry (B-25, the B-01 widget). Client-safe: no `node:*` import, no database, no clock (S3.5) — the caller passes the
// current minute and instant.
//
// The start of a request: the start of the bookable stretch, or any later full or half hour inside it, from which at
// least one 90-minute unit still fits before the stretch ends, and after the current minute on today's date. The units:
// whole 90-minute units from that start to the end of the stretch, at most 4. The indicative amount: the public rate of
// the category on the date — the seasonal rate covering the date first, else the all-year one — times the units.
import { minutesOfDay, seasonCovers, type CalendarDate } from '@vereino/core'
import type { RenterCategory } from './rates'
import { MAX_RENTAL_UNITS } from './rentals'
import { MIN_AVAILABILITY_MINUTES } from './zones'

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

/** The grid of the start times the form offers, in minutes. */
export const REQUEST_START_STEP_MINUTES = 30

/** One rental unit, in minutes. */
export const REQUEST_UNIT_MINUTES = MIN_AVAILABILITY_MINUTES

const MINUTES_PER_DAY = 24 * 60

/** A public stretch `HH:MM`–`HH:MM` in minutes of the day; an end at `00:00` or `24:00` reads as midnight (1440). */
export function stretchMinutes(slot: { from: string; to: string }): { from: number; to: number } {
  const end = minutesOfDay(slot.to)
  return { from: minutesOfDay(slot.from), to: end === 0 ? MINUTES_PER_DAY : end }
}

/** `HH:MM` of a minute of the day. */
export function wallTimeOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/**
 * The start minutes a guest may choose in a stretch: its start and every later half hour, each leaving room for one
 * unit before the stretch ends and later than `notBefore` (the current minute today, -1 on a later day).
 */
export function requestStartMinutes(stretch: { from: number; to: number }, notBefore: number): number[] {
  const firstGrid = Math.ceil(stretch.from / REQUEST_START_STEP_MINUTES) * REQUEST_START_STEP_MINUTES
  const candidates = [stretch.from]
  for (let minute = firstGrid; minute < stretch.to; minute += REQUEST_START_STEP_MINUTES) {
    if (minute > stretch.from) candidates.push(minute)
  }
  return candidates.filter((minute) => minute > notBefore && minute + REQUEST_UNIT_MINUTES <= stretch.to)
}

/** The most units that fit from `start` to the end of the stretch (0 when none, at most 4). */
export function requestMaxUnits(start: number, end: number): number {
  return Math.max(0, Math.min(MAX_RENTAL_UNITS, Math.floor((end - start) / REQUEST_UNIT_MINUTES)))
}

/** The minute the form compares starts with: the current minute on today's date, -1 on a later one. */
export function requestNotBefore(date: CalendarDate, now: { date: CalendarDate; minute: number }): number {
  return date === now.date ? now.minute : -1
}

/** A public rate as the schedule sends it. */
export type IndicativeRate = {
  category: RenterCategory
  pricePer90: number
  seasonFrom: string | null
  seasonTo: string | null
}

/**
 * The indicative amount of `units` for a category on a date (minor units), or null without a rate: the first public
 * rate of the category whose season covers the date, else its first all-year rate.
 */
export function indicativeAmount(
  rates: readonly IndicativeRate[],
  category: RenterCategory,
  date: CalendarDate,
  units: number,
): number | null {
  const own = rates.filter((rate) => rate.category === category)
  const seasonal = own.find(
    (rate) =>
      rate.seasonFrom !== null &&
      rate.seasonTo !== null &&
      seasonCovers({ from: rate.seasonFrom, to: rate.seasonTo }, date),
  )
  const rate = seasonal ?? own.find((rate) => rate.seasonFrom === null || rate.seasonTo === null)
  return rate ? rate.pricePer90 * units : null
}

/** The whole hours and minutes until `expiresAt`, or null once it has passed (B-25 "time to expiry"). */
export function timeToExpiry(expiresAt: Date, now: Date): { hours: number; minutes: number } | null {
  const left = Math.floor((expiresAt.getTime() - now.getTime()) / 60_000)
  if (Number.isNaN(left) || left <= 0) return null
  return { hours: Math.floor(left / 60), minutes: left % 60 }
}
