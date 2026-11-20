// A leaving coach's sessions and default-coach activities (people life-cycle spec REQ-L04, *Hand-over choice*, the
// `activities` row of the contributor table; phase L5, #307): which groups need a choice, what each session and
// activity gets, the kind of the substitution entry the hand-over writes, and whether the undo may restore a row. Pure.
import { assignmentKind, type SubstitutionKind, type SubstitutionStep } from './substitutions'

/** A future planned session led by a leaving person, or an activity whose default coach they are. */
export type LedRecord = { coachPersonId: string; groupId: string }

export type HandOverNeed = { personId: string; groupId: string; sessions: number; activities: number }

/** Per leaving person and group: how many future sessions they lead and how many activities they are default coach of. */
export function handOverNeeds(sessions: readonly LedRecord[], activities: readonly LedRecord[]): HandOverNeed[] {
  const needs = new Map<string, HandOverNeed>()
  const need = (row: LedRecord): HandOverNeed => {
    const key = `${row.coachPersonId}:${row.groupId}`
    const found = needs.get(key) ?? { personId: row.coachPersonId, groupId: row.groupId, sessions: 0, activities: 0 }
    needs.set(key, found)
    return found
  }
  for (const row of sessions) need(row).sessions += 1
  for (const row of activities) need(row).activities += 1
  return [...needs.values()].sort((a, b) => a.personId.localeCompare(b.personId) || a.groupId.localeCompare(b.groupId))
}

/**
 * The coach a group's records get: the chosen coach, null to leave them unassigned, or `undefined` when no choice
 * names the group (the record is left alone; `people` refuses a departure with a missing choice first).
 */
export function handOverTarget(
  choices: ReadonlyArray<{ groupId: string; toPersonId: string | null }>,
  groupId: string,
): string | null | undefined {
  const choice = choices.find((entry) => entry.groupId === groupId)
  return choice ? choice.toPersonId : undefined
}

/**
 * The kind of the entry a hand-over writes: no coach is an absence (the session goes to "Needing a coach"); another
 * coach is a substitute, or `coach_restored` when the session goes back to the coach it belonged to.
 */
export function handOverEntryKind(
  steps: readonly SubstitutionStep[],
  currentCoachPersonId: string | null,
  newCoachPersonId: string | null,
): SubstitutionKind {
  return newCoachPersonId === null ? 'absence_reported' : assignmentKind(steps, currentCoachPersonId, newCoachPersonId)
}

/** The undo restores a value only while it is still the one the departure wrote; a row changed since is left alone. */
export function restorable(current: string | null | undefined, written: string | null): boolean {
  return (current ?? null) === written
}
