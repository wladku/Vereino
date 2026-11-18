// Pure rules of leaving the club (people life-cycle spec REQ-L03, DD-L03…DD-L05, *Domain Vocabulary* rows *Departure*,
// *Last day*, *Blocker*, *Primary payer hand-over*, *Former person*, *Departure request*; phase L4, #306): the last day,
// what ends and how, the blockers, the payer hand-over, the persons the preview suggests and the requests a member may
// file (the preview token is `departure-token.ts`, server only). Time is a parameter (engineering standards S3.5).
import { addDays, isAdultOn, type CalendarDate } from '@vereino/core'

/** A row with a validity period (role assignment, guardianship, membership); `validTo` null = open-ended. */
export type Period = { validFrom: CalendarDate; validTo: CalendarDate | null }

export type DepartureGuardianship = Period & {
  id: string
  guardianPersonId: string
  wardPersonId: string
  isPrimaryPayer: boolean
}

export type DeparturePersonFacts = { id: string; birthDate: CalendarDate | null; leftOn: CalendarDate | null }

/**
 * Why a departure cannot be confirmed (*Blocker*): the person already left or is leaving on a recorded day; a staying
 * minor ward would have no active guardian; the person is the club's last active administrator.
 */
export type DepartureBlocker =
  | { code: 'already_left'; personId: string; leftOn: CalendarDate }
  | { code: 'ward_without_guardian'; personId: string; wardPersonId: string }
  | { code: 'last_club_admin'; personId: string }

/** A leaving primary payer of a staying ward, and the staying guardians who may become the next payer. */
export type PayerChoice = { wardPersonId: string; personId: string; candidateGuardianPersonIds: string[] }

export type SuggestedPerson = { personId: string; reason: 'guardian_of_nobody_else' | 'ward_of_leaving_guardian' }

/** The last day must be today or later in the club's zone (Q-L08): 422 `departure_date_in_past`. */
export function isDepartureDateInPast(lastDay: CalendarDate, today: CalendarDate): boolean {
  return lastDay < today
}

/** Accounts close the day after the last day (Q-L09). */
export function accountClosingDay(lastDay: CalendarDate): CalendarDate {
  return addDays(lastDay, 1)
}

/** A former person: `left_on` set and reached (*Former person*). */
export function isFormer(leftOn: CalendarDate | null | undefined, today: CalendarDate): boolean {
  return Boolean(leftOn) && (leftOn as CalendarDate) <= today
}

/** A departure may be undone only until its last day (Q-L20); afterwards 409 `departure_undo_expired`. */
export function isDepartureUndoExpired(lastDay: CalendarDate, today: CalendarDate): boolean {
  return today > lastDay
}

/** Whether the row is still active on some day after `lastDay`, i.e. the departure has to end it. */
export function activeAfter(row: Period, lastDay: CalendarDate): boolean {
  return row.validTo === null || row.validTo > lastDay
}

/**
 * How the departure ends a row active after the last day: `end` sets `valid_to` to the last day; a row that starts
 * after the last day cannot end before it starts, so it is `remove`d (a soft delete the undo reverts).
 */
export function endAction(row: Period, lastDay: CalendarDate): 'end' | 'remove' {
  return row.validFrom > lastDay ? 'remove' : 'end'
}

/** A ward without a known birth date counts as a minor here: the blocker is the cautious side (DD-L04). */
function isMinorAfter(person: DeparturePersonFacts | undefined, lastDay: CalendarDate): boolean {
  if (!person?.birthDate) return true
  return !isAdultOn(person.birthDate, accountClosingDay(lastDay))
}

/**
 * The blockers of a departure of `leavingIds` with `lastDay`. `clubAdminIds` hold an active `club_admin` role and
 * `activeAccountAdminIds` are those among them whose account is active (signed in, not blocked): a leaving
 * administrator is blocked when no administrator with an active account stays.
 */
export function departureBlockers(input: {
  leavingIds: readonly string[]
  persons: ReadonlyMap<string, DeparturePersonFacts>
  guardianships: readonly DepartureGuardianship[]
  lastDay: CalendarDate
  clubAdminIds: readonly string[]
  activeAccountAdminIds: readonly string[]
}): DepartureBlocker[] {
  const leaving = new Set(input.leavingIds)
  const blockers: DepartureBlocker[] = []
  for (const personId of [...leaving].sort()) {
    const leftOn = input.persons.get(personId)?.leftOn
    if (leftOn) blockers.push({ code: 'already_left', personId, leftOn })
  }
  const live = input.guardianships.filter((row) => activeAfter(row, input.lastDay))
  const wards = [...new Set(live.map((row) => row.wardPersonId))].filter((id) => !leaving.has(id)).sort()
  for (const wardPersonId of wards) {
    if (!isMinorAfter(input.persons.get(wardPersonId), input.lastDay)) continue
    const guardians = live.filter((row) => row.wardPersonId === wardPersonId).map((row) => row.guardianPersonId)
    if (guardians.some((id) => !leaving.has(id))) continue
    for (const personId of [...new Set(guardians)].sort()) {
      blockers.push({ code: 'ward_without_guardian', personId, wardPersonId })
    }
  }
  const leavingAdmins = input.clubAdminIds.filter((id) => leaving.has(id))
  const adminStays = input.activeAccountAdminIds.some((id) => !leaving.has(id))
  if (!adminStays) {
    for (const personId of [...new Set(leavingAdmins)].sort()) blockers.push({ code: 'last_club_admin', personId })
  }
  return blockers
}

/**
 * The payer hand-overs the departure needs (*Primary payer hand-over*): a leaving primary payer of a staying ward who
 * has another staying guardian. A ward with no staying guardian is a blocker (a minor) or pays themself (an adult).
 */
export function payerChoices(input: {
  leavingIds: readonly string[]
  guardianships: readonly DepartureGuardianship[]
  lastDay: CalendarDate
}): PayerChoice[] {
  const leaving = new Set(input.leavingIds)
  const live = input.guardianships.filter((row) => activeAfter(row, input.lastDay))
  const choices: PayerChoice[] = []
  const payers = live.filter(
    (row) => row.isPrimaryPayer && leaving.has(row.guardianPersonId) && !leaving.has(row.wardPersonId),
  )
  for (const payer of payers) {
    const candidates = live
      .filter((row) => row.wardPersonId === payer.wardPersonId && !leaving.has(row.guardianPersonId))
      .map((row) => row.guardianPersonId)
    if (candidates.length === 0) continue
    choices.push({
      wardPersonId: payer.wardPersonId,
      personId: payer.guardianPersonId,
      candidateGuardianPersonIds: [...new Set(candidates)].sort(),
    })
  }
  return choices.sort((a, b) => a.wardPersonId.localeCompare(b.wardPersonId))
}

/**
 * The wards whose payer hand-over is missing or names a guardian who is not a candidate; empty when every choice is
 * answered (else 422 `departure_payer_required`).
 */
export function missingPayerChoices(
  choices: readonly PayerChoice[],
  given: ReadonlyArray<{ wardPersonId: string; guardianPersonId: string }>,
): string[] {
  return choices
    .filter((choice) => {
      const answer = given.find((entry) => entry.wardPersonId === choice.wardPersonId)
      return !answer || !choice.candidateGuardianPersonIds.includes(answer.guardianPersonId)
    })
    .map((choice) => choice.wardPersonId)
}

/**
 * The persons the preview offers to add (J-L02 step 2): a staying guardian whose every live guardianship is of a
 * leaving ward (they would be the guardian of nobody), and a staying ward of a leaving guardian.
 */
export function suggestedPersons(input: {
  leavingIds: readonly string[]
  guardianships: readonly DepartureGuardianship[]
  lastDay: CalendarDate
}): SuggestedPerson[] {
  const leaving = new Set(input.leavingIds)
  const live = input.guardianships.filter((row) => activeAfter(row, input.lastDay))
  const found = new Map<string, SuggestedPerson['reason']>()
  for (const row of live) {
    if (!leaving.has(row.wardPersonId) || leaving.has(row.guardianPersonId)) continue
    const own = live.filter((other) => other.guardianPersonId === row.guardianPersonId)
    if (own.every((other) => leaving.has(other.wardPersonId)))
      found.set(row.guardianPersonId, 'guardian_of_nobody_else')
  }
  for (const row of live) {
    if (leaving.has(row.guardianPersonId) && !leaving.has(row.wardPersonId) && !found.has(row.wardPersonId)) {
      found.set(row.wardPersonId, 'ward_of_leaving_guardian')
    }
  }
  return [...found.entries()]
    .map(([personId, reason]) => ({ personId, reason }))
    .sort((a, b) => a.personId.localeCompare(b.personId))
}

/**
 * Who a member may name in a departure request (*Departure request*, DD-L06): themself and their own active wards.
 * Returns the ids outside that set (403 when any).
 */
export function subjectsOutsideScope(
  subjectIds: readonly string[],
  callerPersonId: string,
  wardIds: readonly string[],
): string[] {
  const allowed = new Set([callerPersonId, ...wardIds])
  return [...new Set(subjectIds)].filter((id) => !allowed.has(id)).sort()
}

/** The requester kind of one subject of a member's request: the member themself or their ward. */
export function requesterKind(subjectPersonId: string, callerPersonId: string): 'self' | 'guardian' {
  return subjectPersonId === callerPersonId ? 'self' : 'guardian'
}

/** A minor asks for nothing (*Security → Who may start what*); an unknown birth date counts as an adult here. */
export function mayFileDepartureRequest(birthDate: CalendarDate | null | undefined, today: CalendarDate): boolean {
  return !birthDate || isAdultOn(birthDate, today)
}

export const DEPARTURE_REQUEST_STATUSES = ['open', 'done', 'declined'] as const
export type DepartureRequestStatus = (typeof DEPARTURE_REQUEST_STATUSES)[number]
