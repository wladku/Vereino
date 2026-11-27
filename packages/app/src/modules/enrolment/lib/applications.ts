// The rules of an application beyond its states and ages (sign-up form spec *Domain Vocabulary*, BR-J1, BR-J3, BR-J4,
// DD-J09, *Answer time*, *Anonymised application*, R22–R23, M-J2; #799): the normalised contact data, the identity a
// duplicate is told by, a full group, where a confirmed application goes, the computed waiting numbers, the flags, the
// tabs of the coordinator's list and the retention cut-offs. Pure and client-safe: time is a parameter.
import type { ApplicationState } from './states'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** An unconfirmed application is deleted 24 hours after it was sent (R22). */
export const UNCONFIRMED_RETENTION_HOURS = 24

/** A closed application is anonymised 30 days after it closed (R23); its status link expires then too (DD-J07). */
export const CLOSED_RETENTION_DAYS = 30

/** The confirmation link works for one hour (DD-J06, REQ-J07). */
export const CONFIRMATION_TTL_MS = HOUR_MS

/** The status link is issued with this time to live and cut to closing + 30 days when the application closes. */
export const STATUS_LINK_TTL_MS = 548 * DAY_MS

/** Field limits of the form (BR-J1). */
export const NAME_MAX = 100
export const EMAIL_MAX = 254
export const NOTE_MAX = 500
export const REASON_MAX = 500

/** The comparable form of an e-mail address: trimmed, lower case. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** A name as typed, with surrounding and repeated spaces removed. */
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/** A name compared for duplicates: case, diacritics and spacing ignored. */
export function comparableName(name: string): string {
  return cleanName(name).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * A phone number in E.164 (BR-J1): spaces, dashes, dots and brackets dropped; `00` read as `+`; nine digits are a
 * Polish number (`+48`); anything else must be `+` and 8–15 digits. Null when it cannot be one.
 */
export function normalizePhone(phone: string): string | null {
  let value = phone.trim().replace(/[\s\-.()]/g, '')
  if (value.startsWith('00')) value = `+${value.slice(2)}`
  if (/^\d{9}$/.test(value)) return `+48${value}`
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : null
}

/**
 * The text the BR-J3 identity hash is computed over: the applicant's address and the participant's names and birth
 * date, normalised, so the same application typed twice gives the same key.
 */
export function applicantKeySource(input: {
  email: string
  firstName: string
  lastName: string
  birthDate: string
}): string {
  return [
    normalizeEmail(input.email),
    comparableName(input.firstName),
    comparableName(input.lastName),
    input.birthDate,
  ].join('|')
}

/** BR-J4: a group with a limit whose places taken reach it. */
export function isGroupFull(group: { placesLimit: number | null; occupied: number }): boolean {
  return group.placesLimit !== null && group.occupied >= group.placesLimit
}

/** DD-J09: a confirmed application goes to `waiting` only for a chosen group that is full on the confirmation day. */
export function confirmedState(chosen: { placesLimit: number | null; occupied: number } | null): 'new' | 'waiting' {
  return chosen && isGroupFull(chosen) ? 'waiting' : 'new'
}

export type WaitingRow = { id: string; groupId: string | null; waitingSince: Date | null }

/**
 * The waiting numbers (DD-J09): per group, 1 + the group's waiting applications with an earlier `waiting_since` (ties
 * by id). Only the rows passed count, so pass every `waiting` application of the groups asked about.
 */
export function waitingNumbers(rows: readonly WaitingRow[]): Map<string, number> {
  const byGroup = new Map<string, WaitingRow[]>()
  for (const row of rows) {
    if (!row.groupId || !row.waitingSince) continue
    const list = byGroup.get(row.groupId) ?? []
    list.push(row)
    byGroup.set(row.groupId, list)
  }
  const numbers = new Map<string, number>()
  for (const list of byGroup.values()) {
    list.sort(
      (a, b) => (a.waitingSince as Date).getTime() - (b.waitingSince as Date).getTime() || (a.id < b.id ? -1 : 1),
    )
    list.forEach((row, index) => numbers.set(row.id, index + 1))
  }
  return numbers
}

/** *Answer time*: a confirmed `new` (or `trial` with the session over) application older than the club's days. */
export function isOverdue(
  app: { state: string; confirmedAt: Date | null; trialOver?: boolean },
  answerDays: number,
  now: Date,
): boolean {
  const waitsForDecision = app.state === 'new' || (app.state === 'trial' && app.trialOver === true)
  if (!waitsForDecision || !app.confirmedAt) return false
  return now.getTime() - app.confirmedAt.getTime() > answerDays * DAY_MS
}

export const APPLICATION_FLAGS = [
  'group_closed',
  'outside_age',
  'group_full',
  'wants_trial',
  'possible_duplicate',
  'overdue',
] as const

export type ApplicationFlag = (typeof APPLICATION_FLAGS)[number]

export type FlagFacts = {
  /** The chosen group was closed by a season rollover (DD-J15a, phase 3): the coordinator picks another. */
  groupClosed?: boolean
  ageFit: string
  groupFull: boolean
  wantsTrial: boolean
  duplicates: number
  overdue: boolean
}

/** REQ-J11: the flags of an application, in display order. */
export function applicationFlags(facts: FlagFacts): ApplicationFlag[] {
  const flags: ApplicationFlag[] = []
  if (facts.groupClosed === true) flags.push('group_closed')
  if (facts.ageFit === 'outside') flags.push('outside_age')
  if (facts.groupFull) flags.push('group_full')
  if (facts.wantsTrial) flags.push('wants_trial')
  if (facts.duplicates > 0) flags.push('possible_duplicate')
  if (facts.overdue) flags.push('overdue')
  return flags
}

export const APPLICATION_TABS = ['new', 'trial', 'waiting', 'closed'] as const

export type ApplicationTab = (typeof APPLICATION_TABS)[number]

/** The states each tab of M-J2 lists (`trial` splits by whether the session is over, phase 4). */
export function tabStates(tab: ApplicationTab): ApplicationState[] {
  switch (tab) {
    case 'new':
      return ['new', 'trial']
    case 'trial':
      return ['trial']
    case 'waiting':
      return ['waiting']
    case 'closed':
      return ['accepted', 'rejected', 'withdrawn', 'expired']
  }
}

/** The tab an application shows in; null while unconfirmed (the club never sees it). */
export function tabOf(state: string, trialOver: boolean): ApplicationTab | null {
  switch (state) {
    case 'new':
      return 'new'
    case 'trial':
      return trialOver ? 'new' : 'trial'
    case 'waiting':
      return 'waiting'
    case 'unconfirmed':
      return null
    default:
      return 'closed'
  }
}

/** The Closed tab lists applications closed in the last 30 days. */
export function closedTabSince(now: Date): Date {
  return new Date(now.getTime() - CLOSED_RETENTION_DAYS * DAY_MS)
}

/** Unconfirmed applications created at or before this instant are deleted (R22). */
export function unconfirmedCutoff(now: Date): Date {
  return new Date(now.getTime() - UNCONFIRMED_RETENTION_HOURS * HOUR_MS)
}

/** Closed applications closed at or before this instant are anonymised (R23). */
export function anonymiseCutoff(now: Date): Date {
  return new Date(now.getTime() - CLOSED_RETENTION_DAYS * DAY_MS)
}

/** The status link of an application closed at `closedAt` works until then (DD-J07). */
export function closedLinkExpiry(closedAt: Date): Date {
  return new Date(closedAt.getTime() + CLOSED_RETENTION_DAYS * DAY_MS)
}

/** What an anonymised application keeps of the birth date (*Anonymised application*): its year, as 1 January. */
export function anonymisedBirthDate(birthDate: string | null): string | null {
  return birthDate ? `${birthDate.slice(0, 4)}-01-01` : null
}
