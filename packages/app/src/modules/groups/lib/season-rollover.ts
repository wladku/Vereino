// The rules of the season rollover (people life-cycle spec REQ-L08, DD-L10, *Vocabulary* → "Season rollover plan";
// phase L9, #311): which plan rows are valid, what happens to a membership of a closed group, how long a copy runs.
// Pure functions: the command and the preview route (`commands/season-rollover.ts`) and the contributors of
// `activities` and `payments` read them. TEST-L19 keeps this file at 100 % coverage.

/** One action per group of the old season (a group may also be copied any number of times). */
export const ROLLOVER_GROUP_ACTIONS = ['continue', 'rename', 'close', 'copy'] as const
export type RolloverGroupAction = (typeof ROLLOVER_GROUP_ACTIONS)[number]

/** One action per recurring activity and fee of a continued or renamed group. */
export const ROLLOVER_RECORD_ACTIONS = ['end', 'end_and_copy', 'keep'] as const
export type RolloverRecordAction = (typeof ROLLOVER_RECORD_ACTIONS)[number]

export type RolloverGroupRow = { groupId: string; action: RolloverGroupAction; name?: string | null }
export type RolloverRecordRow = { recordId: string; action: RolloverRecordAction }

export type RolloverSeasonDates = { id: string | null; startsOn: string; endsOn: string }

/** The first problem of a plan, as the error code the command throws and the field it names. */
export type RolloverPlanProblem = {
  code:
    | 'rollover_same_season'
    | 'rollover_season_overlap'
    | 'rollover_group_unknown'
    | 'rollover_group_action_duplicate'
    | 'rollover_name_required'
    | 'rollover_record_unknown'
    | 'rollover_record_action_duplicate'
    | 'rollover_plan_empty'
  field: string
}

/**
 * The first problem of the plan, or null. `seasonGroupIds` are the live groups of the old season (any section);
 * `recordGroups` maps each recurring activity and fee the contributors offer to its group. `forApply` refuses a plan
 * that changes nothing (the preview of an empty plan only lists the groups).
 */
export function rolloverPlanProblem(input: {
  from: RolloverSeasonDates
  to: RolloverSeasonDates
  groups: readonly RolloverGroupRow[]
  records: readonly RolloverRecordRow[]
  seasonGroupIds: ReadonlySet<string>
  recordGroups: ReadonlyMap<string, string>
  forApply: boolean
}): RolloverPlanProblem | null {
  if (input.to.id !== null && input.to.id === input.from.id) return { code: 'rollover_same_season', field: 'season' }
  if (input.to.startsOn <= input.from.endsOn) return { code: 'rollover_season_overlap', field: 'season.startsOn' }
  const moving = new Set<string>()
  for (const [index, row] of input.groups.entries()) {
    if (!input.seasonGroupIds.has(row.groupId)) {
      return { code: 'rollover_group_unknown', field: `groups.${String(index)}.groupId` }
    }
    if ((row.action === 'rename' || row.action === 'copy') && !row.name?.trim()) {
      return { code: 'rollover_name_required', field: `groups.${String(index)}.name` }
    }
    if (row.action === 'copy') continue
    if (moving.has(row.groupId))
      return { code: 'rollover_group_action_duplicate', field: `groups.${String(index)}.action` }
    moving.add(row.groupId)
  }
  const continued = continuedGroupIds(input.groups)
  const seen = new Set<string>()
  for (const [index, row] of input.records.entries()) {
    const groupId = input.recordGroups.get(row.recordId)
    if (!groupId || !continued.has(groupId)) {
      return { code: 'rollover_record_unknown', field: `records.${String(index)}.recordId` }
    }
    if (seen.has(row.recordId))
      return { code: 'rollover_record_action_duplicate', field: `records.${String(index)}.action` }
    seen.add(row.recordId)
  }
  if (input.forApply && input.groups.length === 0) return { code: 'rollover_plan_empty', field: 'groups' }
  return null
}

/** The groups that go on into the new season (continued or renamed): their activities and fees take record actions. */
export function continuedGroupIds(groups: readonly RolloverGroupRow[]): Set<string> {
  return new Set(groups.filter((row) => row.action === 'continue' || row.action === 'rename').map((row) => row.groupId))
}

/** The closed groups: their memberships, recurring activities and fees end on the old season's last day. */
export function closedGroupIds(groups: readonly RolloverGroupRow[]): Set<string> {
  return new Set(groups.filter((row) => row.action === 'close').map((row) => row.groupId))
}

/**
 * The action of a record of a group: `end` for a closed group, the plan's choice (default `keep`) for a continued or
 * renamed one, null for a group the plan leaves alone (or only copies).
 */
export function recordActionFor(
  groupAction: RolloverGroupAction | 'none' | undefined,
  choice: RolloverRecordAction | undefined,
): RolloverRecordAction | null {
  if (groupAction === 'close') return 'end'
  if (groupAction === 'continue' || groupAction === 'rename') return choice ?? 'keep'
  return null
}

/** A period still running after `lastDay`, so the rollover has something to end. */
export function runsPast(period: { validTo: string | null }, lastDay: string): boolean {
  return period.validTo === null || period.validTo > lastDay
}

/**
 * What a closed group's membership becomes (REQ-A03 "end on a chosen last day"): `end` (`valid_to` = the last day),
 * `remove` (it would only start after the last day: soft-deleted, as the departure does), or `none` (already over).
 */
export function membershipOutcome(
  period: { validFrom: string; validTo: string | null },
  lastDay: string,
): 'end' | 'remove' | 'none' {
  if (!runsPast(period, lastDay)) return 'none'
  return period.validFrom > lastDay ? 'remove' : 'end'
}

/** A copy runs open-ended when its original did, else to the new season's last day. */
export function copyEndsOn(originalEnd: string | null, newSeasonEndsOn: string): string | null {
  return originalEnd === null ? null : newSeasonEndsOn
}
