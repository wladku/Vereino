// Pure rules of a member's direct thread (foundation III REQ-M12, DD-M18; #138): whom a member may write about (their
// household: themself and their wards), whom they may address (the coaches of a group the subject takes part in today,
// or the coordinators of its section), the staff-aware participant rows, the daily limit, and the options the member
// page offers. The command and the `GET /api/communication/direct` read apply them; nothing here touches the database.
import type { AudienceMember, Recipient, Scope } from '@vereino/core'
import { grantIds, participantRows, type ParticipantReason } from './thread-rules'

/** Whom a direct thread addresses: the group's coaches (`coach`, `assistant`) or the section's coordinators. */
export const DIRECT_TARGETS = ['coaches', 'coordinator'] as const
export type DirectTarget = (typeof DIRECT_TARGETS)[number]

/** One member starts at most this many direct threads in `DIRECT_THREAD_WINDOW_MS` (429 `direct_thread_limit`). */
export const DIRECT_THREADS_PER_DAY = 20

/** The rolling window of the daily limit: 24 hours. */
export const DIRECT_THREAD_WINDOW_MS = 24 * 60 * 60 * 1000

/** The group roles a `coaches` thread addresses. */
const COACH_ROLES: readonly string[] = ['coach', 'assistant']

/**
 * The household members a viewer may start a direct thread about: their own person (`self`) first, then their wards
 * (`guardian` grants), deduplicated in that order.
 */
export function directSubjectIds(scope: Scope): string[] {
  return [...new Set([...grantIds(scope, 'self'), ...grantIds(scope, 'guardian')])]
}

/** The start of the rolling window the daily limit counts in. */
export function directWindowStart(now: Date): Date {
  return new Date(now.getTime() - DIRECT_THREAD_WINDOW_MS)
}

/** Whether a member who started `count` direct threads in the window may not start another one. */
export function directLimitReached(count: number): boolean {
  return count >= DIRECT_THREADS_PER_DAY
}

/** The coaches and assistants of a group's roster (person ids, deduplicated, sorted). */
export function coachIdsOf(roster: ReadonlyArray<{ personId: string; role: string }>): string[] {
  return [...new Set(roster.filter((entry) => COACH_ROLES.includes(entry.role)).map((entry) => entry.personId))].sort()
}

/** The addressed staff without the author (a coach writing about their own child does not address themself). */
export function addressedStaffIds(staffIds: readonly string[], authorPersonId: string): string[] {
  return [...new Set(staffIds)].filter((id) => id !== authorPersonId).sort()
}

/** The audience members of a direct thread: the subject (`direct`) and the addressed staff (`coach`). */
export function directMembers(subjectId: string, staffIds: readonly string[]): AudienceMember[] {
  return [
    { personId: subjectId, reason: 'direct' },
    ...staffIds.map((personId): AudienceMember => ({ personId, reason: 'coach' })),
  ]
}

/**
 * The participant rows of a direct thread (DD-M18, DD-M12): the author (`author`), the household with their audience
 * reasons, and the addressed staff with theirs plus `staff`, so a household member's staff-only reply reaches them.
 */
export function directParticipantRows(
  recipients: ReadonlyArray<Pick<Recipient, 'personId' | 'reasons'>>,
  authorPersonId: string,
  staffIds: readonly string[],
): Array<{ personId: string; reasons: ParticipantReason[] }> {
  const staff = new Set(staffIds)
  return participantRows(recipients, { personId: authorPersonId, reason: 'author' }).map((row) =>
    staff.has(row.personId) ? { personId: row.personId, reasons: [...row.reasons, 'staff' as const].sort() } : row,
  )
}

/** One option of the member page: a household member, a group they take part in today and the staff to address. */
export type DirectOption = {
  personId: string
  personName: string
  groupId: string
  groupName: string
  sectionId: string
  sectionName: string
  coachNames: string[]
  coordinatorNames: string[]
}

/** The facts `directOptions` joins, already read for the trusted organization and today. */
export type DirectOptionFacts = {
  subjectIds: readonly string[]
  /** The live memberships active today of the subjects (any role; only `participant` ones count). */
  memberships: ReadonlyArray<{ personId: string; groupId: string; role: string }>
  groups: ReadonlyMap<string, { id: string; sectionId: string; name: string }>
  sections: ReadonlyMap<string, { id: string; name: string }>
  coachIdsByGroup: ReadonlyMap<string, readonly string[]>
  coordinatorIdsBySection: ReadonlyMap<string, readonly string[]>
  names: ReadonlyMap<string, string>
}

/** The participant groups of the subjects today, as `groupId`s by subject (deduplicated, in membership order). */
export function participantGroupIds(
  subjectIds: readonly string[],
  memberships: ReadonlyArray<{ personId: string; groupId: string; role: string }>,
): Map<string, string[]> {
  const subjects = new Set(subjectIds)
  const bySubject = new Map<string, string[]>()
  for (const membership of memberships) {
    if (membership.role !== 'participant' || !subjects.has(membership.personId)) continue
    const groups = bySubject.get(membership.personId) ?? []
    if (!groups.includes(membership.groupId)) groups.push(membership.groupId)
    bySubject.set(membership.personId, groups)
  }
  return bySubject
}

function namesOf(ids: readonly string[] | undefined, names: ReadonlyMap<string, string>, exclude: string | null) {
  return [...new Set(ids ?? [])]
    .filter((id) => id !== exclude)
    .flatMap((id) => {
      const name = names.get(id)
      return name ? [name] : []
    })
    .sort((a, b) => a.localeCompare(b))
}

/**
 * The options of the member page (`GET /api/communication/direct`): for each subject in the given order, each group
 * they take part in today (a group or section that is not found is skipped), with the names of its coaches and of its
 * section's coordinators — staff names only, never another family's; the viewer is left out of the staff they address.
 * Ordered by subject, then section and group name.
 */
export function directOptions(facts: DirectOptionFacts, viewerPersonId: string | null): DirectOption[] {
  const groupsBySubject = participantGroupIds(facts.subjectIds, facts.memberships)
  const options: DirectOption[] = []
  for (const personId of facts.subjectIds) {
    const personName = facts.names.get(personId)
    if (!personName) continue
    const subjectOptions: DirectOption[] = []
    for (const groupId of groupsBySubject.get(personId) ?? []) {
      const group = facts.groups.get(groupId)
      const section = group ? facts.sections.get(group.sectionId) : undefined
      if (!group || !section) continue
      subjectOptions.push({
        personId,
        personName,
        groupId: group.id,
        groupName: group.name,
        sectionId: section.id,
        sectionName: section.name,
        coachNames: namesOf(facts.coachIdsByGroup.get(group.id), facts.names, viewerPersonId),
        coordinatorNames: namesOf(facts.coordinatorIdsBySection.get(section.id), facts.names, viewerPersonId),
      })
    }
    subjectOptions.sort((a, b) => a.sectionName.localeCompare(b.sectionName) || a.groupName.localeCompare(b.groupName))
    options.push(...subjectOptions)
  }
  return options
}
