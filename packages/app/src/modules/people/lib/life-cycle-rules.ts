// The rules of the daily life-cycle job (people life-cycle spec REQ-L06, REQ-L07, DD-L08, DD-L09, *Events, Jobs* steps
// 1–4; phase L8, #310): the 18th birthday and the 30 days before it, the end of the guardianships and the consent
// carry-over, the account age, the dispatch keys that make every notice "sent once", and the notice lines the member
// pages show. Pure: `today` is the club's calendar date (S3.5: time is a parameter).
import { ADULT_AGE, addDays, ageOn, isActiveAt, isCalendarDate, type CalendarDate } from '@vereino/core'
import { CONSENT_KINDS, type ConsentKind, type StoredConsentEntry, type StoredConsents } from './people-rules'

/** How many days ahead the family hears about an 18th birthday (Q-L12). */
export const TURNS_18_NOTICE_DAYS = 30

/** How many days after the 18th birthday the adult's profile still shows the "you decide alone now" card. */
export const CAME_OF_AGE_CARD_DAYS = 30

/**
 * The steps of the job in the order they run. Step 5 (erasure step two: the name of an anonymised person is cleared the
 * day after the retention hold) was registered by phase L6 (gap c9, #308), which adds the columns it reads.
 */
export const LIFE_CYCLE_STEPS = [
  'turns_18_soon',
  'came_of_age',
  'account_age',
  'departed_accounts',
  'erasure_names',
] as const
export type LifeCycleStep = (typeof LIFE_CYCLE_STEPS)[number]

/** The birth date as a calendar date, or null when it is unknown or malformed. */
export function knownBirthDate(birthDate: string | null | undefined): CalendarDate | null {
  const date = birthDate ? birthDate.slice(0, 10) : null
  return date !== null && isCalendarDate(date) ? date : null
}

/**
 * The 18th birthday: the first day on which the person is an adult (`isAdultOn`). Someone born on 29 February comes of
 * age on 1 March of a common year, as `ageOn` counts it.
 */
export function eighteenthBirthday(birthDate: CalendarDate): CalendarDate {
  const year = String(Number(birthDate.slice(0, 4)) + ADULT_AGE).padStart(4, '0')
  const sameDay = `${year}${birthDate.slice(4)}`
  return isCalendarDate(sameDay) ? sameDay : `${year}-03-01`
}

/** The day a guardianship ended by the job ends on: the day before the 18th birthday (DD-L08). */
export function guardianshipEndDay(birthDate: CalendarDate): CalendarDate {
  return addDays(eighteenthBirthday(birthDate), -1)
}

/** True when the 18th birthday falls after `today` and at most `TURNS_18_NOTICE_DAYS` later (step 1). */
export function turns18Soon(birthDate: CalendarDate, today: CalendarDate): boolean {
  const birthday = eighteenthBirthday(birthDate)
  return birthday > today && birthday <= addDays(today, TURNS_18_NOTICE_DAYS)
}

/** One guardianship as the job reads it. */
export type LifeCycleGuardianship = {
  readonly id: string
  readonly guardianPersonId: string
  readonly validFrom: CalendarDate
  readonly validTo: CalendarDate | null
  readonly consents: StoredConsents
}

/**
 * The guardianships step 2 ends for a ward on `today`: none before the 18th birthday; from it, every guardianship
 * active on `today` that started before the birthday. One created on or after it is deliberate and stays (Q-L03).
 * Missed days are caught up: the comparison is `today >= birthday`, and an ended guardianship is no longer active.
 */
export function guardianshipsEndingAt18<T extends LifeCycleGuardianship>(
  birthDate: CalendarDate,
  guardianships: readonly T[],
  today: CalendarDate,
): T[] {
  const birthday = eighteenthBirthday(birthDate)
  if (today < birthday) return []
  return guardianships.filter(
    (row) => row.validFrom < birthday && isActiveAt({ validFrom: row.validFrom, validTo: row.validTo }, today),
  )
}

/**
 * The consent carry-over of DD-L08: per kind, the most recent decision among the ending guardianships, copied with
 * `granted`, `at` and `by_person_id`. A decision the adult already made themself (`own`) is kept. Returns the new own
 * consents and the kinds copied.
 */
export function carriedOverConsents(
  own: StoredConsents,
  ending: readonly StoredConsents[],
): { consents: StoredConsents; copied: ConsentKind[] } {
  const next: Partial<Record<ConsentKind, StoredConsentEntry>> = { ...own }
  const copied: ConsentKind[] = []
  for (const kind of CONSENT_KINDS) {
    if (own[kind]) continue
    let latest: StoredConsentEntry | null = null
    for (const consents of ending) {
      const entry = consents[kind]
      if (entry && (!latest || Date.parse(entry.at) > Date.parse(latest.at))) latest = entry
    }
    if (!latest) continue
    next[kind] = { granted: latest.granted, at: latest.at, by_person_id: latest.by_person_id }
    copied.push(kind)
  }
  return { consents: next, copied }
}

/**
 * Step 3 (REQ-L07): a minor without an account whose age reached the club's `own_account_min_age`. An adult is not a
 * "child reaching the account age": the 18th birthday has its own notice.
 */
export function accountAgeReached(input: {
  readonly birthDate: CalendarDate
  readonly threshold: number
  readonly hasAccount: boolean
  readonly today: CalendarDate
}): boolean {
  if (input.hasAccount) return false
  const age = ageOn(input.birthDate, input.today)
  return age >= input.threshold && age < ADULT_AGE
}

/** The dispatch key of the T−30 notice: one per person, ever (step 1). */
export function turns18SoonKey(personId: string): string {
  return `people:turns-18-soon:${personId}`
}

/** The dispatch key of the notice on the 18th birthday (step 2). */
export function cameOfAgeKey(personId: string): string {
  return `people:came-of-age:${personId}`
}

/** The dispatch key of the account-age notice: one per person and threshold (step 3). */
export function accountAgeKey(personId: string, threshold: number): string {
  return `people:account-age:${personId}:${String(threshold)}`
}

/**
 * The account-age keys that would mean the person was already told: one per threshold from 0 up to the person's age.
 * A notice sent under any threshold the person had reached still holds after the club changes it, so a lowered
 * threshold reaches only the newly eligible (TEST-L10). The job looks them up in one query.
 */
export function accountAgeKeysUpTo(personId: string, age: number): string[] {
  const keys: string[] = []
  for (let threshold = 0; threshold <= Math.min(age, ADULT_AGE - 1); threshold += 1) {
    keys.push(accountAgeKey(personId, threshold))
  }
  return keys
}

/** The notice lines of a ward on the guardian's phone (M-10 ward card and `/club/wards/[personId]`). */
export type WardNotice =
  { readonly kind: 'may_have_account' } | { readonly kind: 'turns_18'; readonly on: CalendarDate }

/** "May have an own account — ask the club" and "Turns 18 on {date}" for one ward on `today`. */
export function wardNotices(input: {
  readonly birthDate: string | null | undefined
  readonly hasAccount: boolean
  readonly threshold: number
  readonly today: CalendarDate
}): WardNotice[] {
  const birthDate = knownBirthDate(input.birthDate)
  if (!birthDate) return []
  const notices: WardNotice[] = []
  if (accountAgeReached({ birthDate, threshold: input.threshold, hasAccount: input.hasAccount, today: input.today })) {
    notices.push({ kind: 'may_have_account' })
  }
  if (turns18Soon(birthDate, input.today)) notices.push({ kind: 'turns_18', on: eighteenthBirthday(birthDate) })
  return notices
}

/** The notice card on a member's own profile before and after their 18th birthday (M-10). */
export type OwnNotice =
  { readonly kind: 'turns_18'; readonly on: CalendarDate } | { readonly kind: 'came_of_age'; readonly on: CalendarDate }

/**
 * `turns_18` in the 30 days before the 18th birthday, `came_of_age` from the birthday for `CAME_OF_AGE_CARD_DAYS`
 * days; null otherwise or without a birth date.
 */
export function ownNotice(birthDate: string | null | undefined, today: CalendarDate): OwnNotice | null {
  const date = knownBirthDate(birthDate)
  if (!date) return null
  const birthday = eighteenthBirthday(date)
  if (turns18Soon(date, today)) return { kind: 'turns_18', on: birthday }
  if (birthday <= today && today < addDays(birthday, CAME_OF_AGE_CARD_DAYS))
    return { kind: 'came_of_age', on: birthday }
  return null
}
