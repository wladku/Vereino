// The rules of erasure and removal (people life-cycle spec REQ-L05, DD-L06, DD-L07, *Anonymised person*, *Retention
// hold*, *Mistaken person*; phase L6, #308): when an anonymisation is refused, the typed last name that confirms it,
// how long the name stays under the retention hold, when the daily job clears it, why a person cannot be deleted, and
// the name a screen shows for an anonymised person. Pure: `today` is the club's calendar date (S3.5).
import type { CalendarDate } from '@vereino/core'

/** One reason an anonymisation or a deletion is refused; `recordId` names the record that resolves it. */
export type ErasureReason = {
  code: string
  module?: string
  recordId?: string
  params?: Record<string, string | number | null>
}

/** A notice a departure contributor reported for the person (`payments`: `cash_held`, `open_charges`). */
export type ContributorNotice = {
  module: string
  code: string
  recordId?: string
  params?: Record<string, string | number | null>
}

/** What `people.persons.anonymize` checks before it erases anything (*Anonymised person*). */
export type AnonymizeFacts = {
  leftOn: CalendarDate | null
  anonymizedAt: Date | null
  hasAccount: boolean
  activeGuardianships: number
  /** Whether the chosen request is a recorded erasure request of this person that was not declined. */
  requestRecorded: boolean
  /** The `payments` notices for the person: open charges and cash held block an erasure. */
  contributorNotices: readonly ContributorNotice[]
}

/** The contributor notices that refuse an erasure: an open charge as debtor or payer, cash still held. */
const BLOCKING_NOTICES = new Set(['open_charges', 'cash_held'])

/**
 * Why the person cannot be anonymised on `today`, in a stable order; empty = allowed. Refused unless the person left
 * (`left_on` reached), the account is closed, no charge is open, no cash is held, no guardianship is active and a
 * request is recorded. An anonymised person is refused once more (not undoable, never twice).
 */
export function anonymizeBlockers(facts: AnonymizeFacts, today: CalendarDate): ErasureReason[] {
  if (facts.anonymizedAt) return [{ code: 'already_anonymized' }]
  const reasons: ErasureReason[] = []
  if (!facts.leftOn || facts.leftOn > today) reasons.push({ code: 'not_left' })
  if (facts.hasAccount) reasons.push({ code: 'account_open' })
  if (facts.activeGuardianships > 0) {
    reasons.push({ code: 'active_guardianship', params: { count: facts.activeGuardianships } })
  }
  for (const notice of facts.contributorNotices) {
    if (!BLOCKING_NOTICES.has(notice.code)) continue
    reasons.push({
      code: notice.code,
      module: notice.module,
      ...(notice.recordId ? { recordId: notice.recordId } : {}),
      ...(notice.params ? { params: notice.params } : {}),
    })
  }
  if (!facts.requestRecorded) reasons.push({ code: 'request_missing' })
  return reasons
}

function normalizedName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl')
}

/**
 * Whether the typed text confirms the person's last name: case, surrounding and repeated spaces do not matter,
 * diacritics do ("Nowak" ≠ "Nówak"). An empty last name (already cleared) is never confirmed.
 */
export function lastNameConfirmed(typed: string, lastName: string): boolean {
  const expected = normalizedName(lastName)
  return expected.length > 0 && normalizedName(typed) === expected
}

/**
 * The day until which the name stays (DD-L07): the payments contributor's hold when it is today or later; null when
 * there is no payment or the hold has already passed — then the name goes at once with the rest.
 */
export function nameKeptUntil(hold: CalendarDate | null, today: CalendarDate): CalendarDate | null {
  return hold !== null && hold >= today ? hold : null
}

/** Step 5 of the daily job: the name of an anonymised person is cleared the day after the hold ends. */
export function nameErasureDue(hold: CalendarDate | null, today: CalendarDate): boolean {
  return hold !== null && hold < today
}

/** The person's own history in `people` (*Mistaken person*). */
export type OwnHistory = {
  hasAccount: boolean
  guardianships: number
  roleAssignments: number
  departureRequests: number
}

/**
 * Why the person cannot be deleted: their own records in `people` first, then every module that reports history, in
 * the given order. Empty = a mistaken person, deletable.
 */
export function personInUseReasons(own: OwnHistory, modulesWithHistory: readonly string[]): ErasureReason[] {
  const reasons: ErasureReason[] = []
  if (own.hasAccount) reasons.push({ code: 'account' })
  if (own.guardianships > 0) reasons.push({ code: 'guardianships', params: { count: own.guardianships } })
  if (own.roleAssignments > 0) reasons.push({ code: 'role_assignments', params: { count: own.roleAssignments } })
  if (own.departureRequests > 0) {
    reasons.push({ code: 'departure_requests', params: { count: own.departureRequests } })
  }
  for (const moduleId of modulesWithHistory) reasons.push({ code: 'history', module: moduleId })
  return reasons
}

export type NamedPerson = { firstName: string; lastName: string; anonymizedAt?: Date | string | null }

/**
 * The name a reader sees: an anonymised person reads as `formerMember` (the localised "Former member", in the first
 * name so `first last` joins read well) unless the reader may see a name still kept under the hold (`people.manage`).
 * A cleared name always reads as the label.
 */
export function visibleName(
  person: NamedPerson,
  formerMember: string,
  mayReadHeldName: boolean,
): { firstName: string; lastName: string } {
  if (!person.anonymizedAt) return { firstName: person.firstName, lastName: person.lastName }
  const kept = person.firstName.trim() !== '' || person.lastName.trim() !== ''
  if (kept && mayReadHeldName) return { firstName: person.firstName, lastName: person.lastName }
  return { firstName: formerMember, lastName: '' }
}
