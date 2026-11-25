// The sports medical certificate's "valid until" date (training outlines and medical expiry spec, phase 1; D-038,
// REQ-O01…REQ-O05, DD-O01, DD-O02, DD-O04, BR-O1; #682): the three-colour status PZPN's academy system uses, the
// reminder thresholds with their dispatch keys, the retention cut-off (R20) and whether a `medical` consent is in force.
// The status is computed, never stored. Time is a parameter (engineering standards S3.5).
import { addDays, isActiveAt, isCalendarDate, type CalendarDate, type Validity } from '@vereino/core'
import { eighteenthBirthday, guardianshipEndDay, knownBirthDate } from './life-cycle-rules'
import { holdsOwnConsents, type StoredConsents } from './people-rules'

/** Days before the date from which the status is orange and the first reminder goes out ("under a month"). */
export const MEDICAL_WARNING_DAYS = 30

/** Days the job looks back for a missed reminder day (a job down for a day still sends; the key sends once). */
export const MEDICAL_REMINDER_LOOKBACK_DAYS = 3

/** Days a guardian's `medical` consent stays in force after the ward's 18th birthday (BR-O1). */
export const MEDICAL_COME_OF_AGE_GRACE_DAYS = 30

/** Months after a date passed without renewal when the daily job clears it (retention R20). */
export const MEDICAL_RETENTION_MONTHS = 12

/** The colour of the status (`StatusTag` error / warning / success). */
export type MedicalStatusColor = 'red' | 'orange' | 'green'

/** Why the status has its colour: no date, an unreadable one, passed, under a month left, valid. */
export type MedicalStatusState = 'missing' | 'unknown' | 'expired' | 'expiring' | 'valid'

export type MedicalStatus = { status: MedicalStatusColor; state: MedicalStatusState; validUntil: CalendarDate | null }

/** A stored `medical_valid_until` as a calendar date, or null when it is not one. */
export function medicalDate(value: string | null | undefined): CalendarDate | null {
  if (typeof value !== 'string') return null
  const day = value.trim().slice(0, 10)
  return isCalendarDate(day) ? day : null
}

/**
 * DD-O02: red when the date is missing or before `today`, orange from `today` to `today + 30` inclusive, green after.
 * A stored value that is not a date (a failed decryption) reads red `unknown`.
 */
export function medicalStatus(value: string | null | undefined, today: CalendarDate): MedicalStatus {
  if (value === null || value === undefined || value === '')
    return { status: 'red', state: 'missing', validUntil: null }
  const validUntil = medicalDate(value)
  if (!validUntil) return { status: 'red', state: 'unknown', validUntil: null }
  if (validUntil < today) return { status: 'red', state: 'expired', validUntil }
  if (validUntil <= addDays(today, MEDICAL_WARNING_DAYS)) return { status: 'orange', state: 'expiring', validUntil }
  return { status: 'green', state: 'valid', validUntil }
}

/** The two reminders: a month before the date and on the date. */
export type MedicalReminderKind = 'expiring' | 'expired'

/** The day each reminder is due for a date. */
export function medicalReminderDay(validUntil: CalendarDate, kind: MedicalReminderKind): CalendarDate {
  return kind === 'expiring' ? addDays(validUntil, -MEDICAL_WARNING_DAYS) : validUntil
}

/**
 * The reminders due on `today` for a date: each from its day through `MEDICAL_REMINDER_LOOKBACK_DAYS` later, so a
 * missed run is caught up (the look-back is shorter than the month between them, so they never overlap).
 */
export function medicalRemindersDue(validUntil: CalendarDate, today: CalendarDate): MedicalReminderKind[] {
  const due: MedicalReminderKind[] = []
  for (const kind of ['expiring', 'expired'] as const) {
    const day = medicalReminderDay(validUntil, kind)
    if (today < day || today > addDays(day, MEDICAL_REMINDER_LOOKBACK_DAYS)) continue
    due.push(kind)
  }
  return due
}

/** The dispatch idempotency key of a reminder (DD-O04): a changed date restarts the reminders. */
export function medicalReminderKey(personId: string, validUntil: CalendarDate, kind: MedicalReminderKind): string {
  return `medical:${personId}:${validUntil}:${kind}`
}

/** The same calendar day `months` months later; a day the month lacks becomes the month's last day. */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7)) - 1 + months
  const targetYear = year + Math.floor(month / 12)
  const targetMonth = ((month % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const day = Math.min(Number(date.slice(8, 10)), lastDay)
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** R20: a date that passed `MEDICAL_RETENTION_MONTHS` months before `today` without renewal is cleared. */
export function medicalRetentionPassed(validUntil: CalendarDate, today: CalendarDate): boolean {
  return addMonths(validUntil, MEDICAL_RETENTION_MONTHS) < today
}

export type MedicalConsentGuardianship = Validity & { readonly consents: StoredConsents }

/**
 * BR-O1: whether a `medical` consent is in force on `today`. An adult's own decision when they made one. A minor
 * (or a person without a birth date): the consent of any one guardian whose guardianship is active. An adult who made
 * no decision: a guardian's consent of a guardianship active on the day before the 18th birthday stays in force for
 * `MEDICAL_COME_OF_AGE_GRACE_DAYS` days from the birthday; after that, none.
 */
export function medicalConsentInForce(input: {
  readonly birthDate: string | null | undefined
  readonly own: StoredConsents
  readonly guardianships: readonly MedicalConsentGuardianship[]
  readonly today: CalendarDate
}): boolean {
  const { today } = input
  const granted = (row: MedicalConsentGuardianship) => row.consents.medical?.granted === true
  if (!holdsOwnConsents(input.birthDate, today)) {
    return input.guardianships.some((row) => granted(row) && isActiveAt(row, today))
  }
  const own = input.own.medical
  if (own) return own.granted
  const birthDate = knownBirthDate(input.birthDate) as CalendarDate
  const birthday = eighteenthBirthday(birthDate)
  if (today >= addDays(birthday, MEDICAL_COME_OF_AGE_GRACE_DAYS)) return false
  const lastMinorDay = guardianshipEndDay(birthDate)
  return input.guardianships.some((row) => granted(row) && isActiveAt(row, lastMinorDay))
}

/** A guardianship as the job reads it: the guardian, the period and the consents. */
export type MedicalGuardianRow = MedicalConsentGuardianship & { readonly guardianPersonId: string }

/** What the daily job does for one person with a date (step order of `services/medical-reminders.ts`). */
export type MedicalDecision =
  | { action: 'clear'; reason: 'no_consent' | 'departed' | 'retention' }
  | { action: 'remind'; kinds: MedicalReminderKind[]; validUntil: CalendarDate }
  | { action: 'none' }

/**
 * The job's decision on `today`: clear when no `medical` consent is in force (BR-O1), when the person left the club
 * before today, or 12 months after the date passed (R20); otherwise the reminders due. An unreadable value is kept:
 * the status shows "unknown" and the club re-enters it.
 */
export function decideMedical(
  person: {
    readonly birthDate?: string | null
    readonly consents: StoredConsents
    readonly medicalValidUntil?: string | null
    readonly leftOn?: string | null
  },
  guardianships: readonly MedicalConsentGuardianship[],
  today: CalendarDate,
): MedicalDecision {
  const own = person.consents
  if (!medicalConsentInForce({ birthDate: person.birthDate, own, guardianships, today })) {
    return { action: 'clear', reason: 'no_consent' }
  }
  if (person.leftOn && person.leftOn.slice(0, 10) < today) return { action: 'clear', reason: 'departed' }
  const validUntil = medicalDate(person.medicalValidUntil)
  if (!validUntil) return { action: 'none' }
  if (medicalRetentionPassed(validUntil, today)) return { action: 'clear', reason: 'retention' }
  const kinds = medicalRemindersDue(validUntil, today)
  return kinds.length > 0 ? { action: 'remind', kinds, validUntil } : { action: 'none' }
}
