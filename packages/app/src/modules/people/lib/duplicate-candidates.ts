// Possible duplicates of a new applicant among a club's persons (section sign-up form spec DD-J11, Q-J05): the pure
// matching behind the optional DI contract `people.duplicateCandidates`. Names, e-mail and phone are encrypted without a
// lookup hash, so the service reads candidate rows decrypted and this file compares normalised values in memory.
import { ADULT_AGE, ageOn, isCalendarDate, type CalendarDate } from '@vereino/core'

/** What the caller knows about the applicant (a child or a guardian). `birthDate` is `YYYY-MM-DD`. */
export type DuplicateQuery = {
  firstName: string
  lastName: string
  birthDate?: string | null
  email?: string | null
  phone?: string | null
}

/** Why a person is a possible duplicate; also the order of the result. */
export type DuplicateReason = 'name_birth_date' | 'email' | 'phone'

export type DuplicateCandidate = { personId: string; reason: DuplicateReason; isMinor: boolean }

/** A live person of the club, decrypted, as the service reads it. */
export type DuplicateCandidateRow = {
  id: string
  firstName: string | null
  lastName: string | null
  birthDate: string | null
  email: string | null
  phone: string | null
}

const REASON_ORDER: readonly DuplicateReason[] = ['name_birth_date', 'email', 'phone']

/** A name for comparison: NFKD, combining marks removed, lower case, whitespace collapsed and trimmed. */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** An e-mail address for comparison: trimmed and lower case. */
export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

/**
 * A phone number for comparison: digits only; a leading international `00` is dropped and a 9-digit (Polish national)
 * number gets the `48` country code, so `+48 600 100 200`, `0048600100200` and `600-100-200` compare equal.
 */
export function normalizePhone(value: string | null | undefined): string {
  let digits = (value ?? '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 9) digits = `48${digits}`
  return digits
}

/** True while the person is under 18 on `today`; a person without a birth date counts as an adult. */
export function isMinorOn(birthDate: CalendarDate | null | undefined, today: CalendarDate): boolean {
  return birthDate ? ageOn(birthDate, today) < ADULT_AGE : false
}

/**
 * The latest birth date of an adult on `today` (a person born on or before it is 18 or older); on 29 February the
 * birthday 18 years back falls on 28 February.
 */
export function adultBirthDateCutoff(today: CalendarDate): CalendarDate {
  const year = String(Number(today.slice(0, 4)) - ADULT_AGE).padStart(4, '0')
  const sameDay = `${year}${today.slice(4)}`
  return isCalendarDate(sameDay) ? sameDay : `${year}-02-28`
}

/**
 * The possible duplicates of `query` among `rows`: `name_birth_date` when the birth dates are equal and the normalised
 * first and last names match; `email` and `phone` only for adults (18 or older on `today`, or without a birth date)
 * whose normalised value equals the query's — an empty value never matches. One entry per person and reason, ordered by
 * reason, then person id; a row repeated in `rows` counts once.
 */
export function matchDuplicateCandidates(
  query: DuplicateQuery,
  rows: readonly DuplicateCandidateRow[],
  today: CalendarDate,
): DuplicateCandidate[] {
  const firstName = normalizeName(query.firstName)
  const lastName = normalizeName(query.lastName)
  const email = normalizeEmail(query.email)
  const phone = normalizePhone(query.phone)
  const found = new Map<string, DuplicateCandidate>()
  const add = (row: DuplicateCandidateRow, reason: DuplicateReason, isMinor: boolean) => {
    found.set(`${reason}:${row.id}`, { personId: row.id, reason, isMinor })
  }
  for (const row of rows) {
    const isMinor = isMinorOn(row.birthDate, today)
    if (
      query.birthDate &&
      row.birthDate === query.birthDate &&
      lastName !== '' &&
      normalizeName(row.firstName) === firstName &&
      normalizeName(row.lastName) === lastName
    ) {
      add(row, 'name_birth_date', isMinor)
    }
    if (isMinor) continue
    if (email !== '' && normalizeEmail(row.email) === email) add(row, 'email', false)
    if (phone !== '' && normalizePhone(row.phone) === phone) add(row, 'phone', false)
  }
  // Entries are unique per (reason, person), so two with the same reason never share a person id.
  return [...found.values()].sort(
    (a, b) => REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason) || (a.personId < b.personId ? -1 : 1),
  )
}
