import { describe, expect, it } from '@jest/globals'
import {
  ROLLOVER_GROUP_ACTIONS,
  ROLLOVER_RECORD_ACTIONS,
  closedGroupIds,
  continuedGroupIds,
  copyEndsOn,
  membershipOutcome,
  recordActionFor,
  rolloverPlanProblem,
  runsPast,
  type RolloverGroupRow,
  type RolloverRecordRow,
} from '../season-rollover'
import {
  ROLLOVER_PREVIEW_TTL_MS,
  canonicalJson,
  checkRolloverToken,
  issueRolloverToken,
  type RolloverBinding,
} from '../rollover-token'

const FROM = { id: 'old', startsOn: '2026-07-01', endsOn: '2027-06-30' }
const TO = { id: null, startsOn: '2027-07-01', endsOn: '2028-06-30' }
const SEASON_GROUPS = new Set(['g1', 'g2', 'g3'])
const RECORD_GROUPS = new Map([
  ['a1', 'g1'],
  ['f1', 'g1'],
  ['a3', 'g3'],
])

function problem(
  groups: RolloverGroupRow[],
  records: RolloverRecordRow[] = [],
  overrides: Partial<{
    from: typeof FROM
    to: { id: string | null; startsOn: string; endsOn: string }
    forApply: boolean
  }> = {},
) {
  return rolloverPlanProblem({
    from: overrides.from ?? FROM,
    to: overrides.to ?? TO,
    groups,
    records,
    seasonGroupIds: SEASON_GROUPS,
    recordGroups: RECORD_GROUPS,
    forApply: overrides.forApply ?? true,
  })
}

describe('the actions', () => {
  it('lists the group and record actions of the vocabulary', () => {
    expect(ROLLOVER_GROUP_ACTIONS).toEqual(['continue', 'rename', 'close', 'copy'])
    expect(ROLLOVER_RECORD_ACTIONS).toEqual(['end', 'end_and_copy', 'keep'])
  })
})

describe('rolloverPlanProblem', () => {
  it('accepts a plan with continue, rename, close and copy, and records of continued groups', () => {
    expect(
      problem(
        [
          { groupId: 'g1', action: 'continue' },
          { groupId: 'g1', action: 'copy', name: 'Copy' },
          { groupId: 'g2', action: 'rename', name: 'Orliki' },
          { groupId: 'g3', action: 'close' },
        ],
        [
          { recordId: 'a1', action: 'end_and_copy' },
          { recordId: 'f1', action: 'end' },
        ],
      ),
    ).toBeNull()
  })

  it('refuses the old season as the new one', () => {
    expect(problem([], [], { to: { ...TO, id: 'old' } })).toEqual({ code: 'rollover_same_season', field: 'season' })
  })

  it('refuses a new season that starts on or before the old last day', () => {
    expect(problem([], [], { to: { id: 'new', startsOn: '2027-06-30', endsOn: '2028-06-30' } })).toEqual({
      code: 'rollover_season_overlap',
      field: 'season.startsOn',
    })
  })

  it('refuses a group outside the old season', () => {
    expect(problem([{ groupId: 'x', action: 'continue' }])).toEqual({
      code: 'rollover_group_unknown',
      field: 'groups.0.groupId',
    })
  })

  it('needs a name to rename or copy', () => {
    expect(problem([{ groupId: 'g1', action: 'rename', name: ' ' }])).toEqual({
      code: 'rollover_name_required',
      field: 'groups.0.name',
    })
    expect(problem([{ groupId: 'g1', action: 'copy' }])).toEqual({
      code: 'rollover_name_required',
      field: 'groups.0.name',
    })
  })

  it('refuses two moving actions for one group, but allows several copies', () => {
    expect(
      problem([
        { groupId: 'g1', action: 'copy', name: 'A' },
        { groupId: 'g1', action: 'copy', name: 'B' },
        { groupId: 'g1', action: 'continue' },
        { groupId: 'g1', action: 'close' },
      ]),
    ).toEqual({ code: 'rollover_group_action_duplicate', field: 'groups.3.action' })
  })

  it('refuses a record of a group that does not go on, an unknown record and a repeated one', () => {
    expect(problem([{ groupId: 'g3', action: 'close' }], [{ recordId: 'a3', action: 'keep' }])).toEqual({
      code: 'rollover_record_unknown',
      field: 'records.0.recordId',
    })
    expect(problem([{ groupId: 'g1', action: 'continue' }], [{ recordId: 'zz', action: 'keep' }])).toEqual({
      code: 'rollover_record_unknown',
      field: 'records.0.recordId',
    })
    expect(
      problem(
        [{ groupId: 'g1', action: 'continue' }],
        [
          { recordId: 'a1', action: 'keep' },
          { recordId: 'a1', action: 'end' },
        ],
      ),
    ).toEqual({ code: 'rollover_record_action_duplicate', field: 'records.1.action' })
  })

  it('refuses an empty plan to apply, not to preview', () => {
    expect(problem([])).toEqual({ code: 'rollover_plan_empty', field: 'groups' })
    expect(problem([], [], { forApply: false })).toBeNull()
  })
})

describe('group and record actions', () => {
  const groups: RolloverGroupRow[] = [
    { groupId: 'g1', action: 'continue' },
    { groupId: 'g2', action: 'rename', name: 'R' },
    { groupId: 'g3', action: 'close' },
    { groupId: 'g4', action: 'copy', name: 'C' },
  ]

  it('splits continued and closed groups', () => {
    expect([...continuedGroupIds(groups)]).toEqual(['g1', 'g2'])
    expect([...closedGroupIds(groups)]).toEqual(['g3'])
  })

  it('ends the records of a closed group, takes the choice (default keep) of a continued one, else nothing', () => {
    expect(recordActionFor('close', 'keep')).toBe('end')
    expect(recordActionFor('continue', 'end_and_copy')).toBe('end_and_copy')
    expect(recordActionFor('rename', undefined)).toBe('keep')
    expect(recordActionFor('copy', 'end')).toBeNull()
    expect(recordActionFor('none', undefined)).toBeNull()
    expect(recordActionFor(undefined, undefined)).toBeNull()
  })
})

describe('dates', () => {
  it('runs past the last day when open-ended or ending later', () => {
    expect(runsPast({ validTo: null }, '2027-06-30')).toBe(true)
    expect(runsPast({ validTo: '2027-07-01' }, '2027-06-30')).toBe(true)
    expect(runsPast({ validTo: '2027-06-30' }, '2027-06-30')).toBe(false)
  })

  it('ends, removes or leaves a membership of a closed group', () => {
    expect(membershipOutcome({ validFrom: '2026-09-01', validTo: null }, '2027-06-30')).toBe('end')
    expect(membershipOutcome({ validFrom: '2027-07-10', validTo: null }, '2027-06-30')).toBe('remove')
    expect(membershipOutcome({ validFrom: '2026-09-01', validTo: '2027-01-31' }, '2027-06-30')).toBe('none')
  })

  it('keeps a copy open-ended when its original was', () => {
    expect(copyEndsOn(null, '2028-06-30')).toBeNull()
    expect(copyEndsOn('2027-06-30', '2028-06-30')).toBe('2028-06-30')
  })
})

describe('the preview token', () => {
  const binding: RolloverBinding = {
    tenantId: 't',
    organizationId: 'o',
    actorUserId: 'u',
    plan: { b: 1, a: [1, { y: undefined, x: null }] },
    content: 'c',
  }

  it('writes canonical JSON', () => {
    expect(canonicalJson({ b: 1, a: [1, { y: undefined, x: null }] })).toBe('{"a":[1,{"x":null}],"b":1}')
    expect(canonicalJson(undefined)).toBe('null')
    expect(canonicalJson('s')).toBe('"s"')
  })

  it('confirms the same binding within 15 minutes', () => {
    const token = issueRolloverToken(binding, 1000)
    expect(checkRolloverToken(token, binding, 1000 + ROLLOVER_PREVIEW_TTL_MS)).toBe('valid')
    expect(checkRolloverToken(token, { ...binding, content: 'changed' }, 1000)).toBe('stale')
    expect(checkRolloverToken(token, binding, 1001 + ROLLOVER_PREVIEW_TTL_MS)).toBe('expired')
    expect(checkRolloverToken('nonsense', binding, 1000)).toBe('malformed')
  })
})
