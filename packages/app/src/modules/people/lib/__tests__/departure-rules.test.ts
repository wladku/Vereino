import { describe, expect, it } from '@jest/globals'
import {
  accountClosingDay,
  activeAfter,
  departureBlockers,
  endAction,
  isDepartureDateInPast,
  isDepartureUndoExpired,
  invalidHandOvers,
  isFormer,
  mayFileDepartureRequest,
  missingHandOvers,
  missingPayerChoices,
  payerChoices,
  requesterKind,
  subjectsOutsideScope,
  suggestedPersons,
  type DepartureGuardianship,
  type DeparturePersonFacts,
} from '../departure-rules'

const LAST_DAY = '2026-11-30'

function guardianship(
  id: string,
  guardianPersonId: string,
  wardPersonId: string,
  extra: Partial<DepartureGuardianship> = {},
): DepartureGuardianship {
  return {
    id,
    guardianPersonId,
    wardPersonId,
    isPrimaryPayer: false,
    validFrom: '2026-01-01',
    validTo: null,
    ...extra,
  }
}

function persons(...rows: DeparturePersonFacts[]): Map<string, DeparturePersonFacts> {
  return new Map(rows.map((row) => [row.id, row]))
}

const child = (id: string, birthDate: string | null = '2017-05-01'): DeparturePersonFacts => ({
  id,
  birthDate,
  leftOn: null,
})

describe('dates of a departure (Q-L08, Q-L09, Q-L20)', () => {
  it('refuses a last day before today and accepts today', () => {
    expect(isDepartureDateInPast('2026-11-17', '2026-11-18')).toBe(true)
    expect(isDepartureDateInPast('2026-11-18', '2026-11-18')).toBe(false)
  })

  it('closes accounts the day after the last day, also across a month', () => {
    expect(accountClosingDay('2026-11-30')).toBe('2026-12-01')
  })

  it('reads a person as former once the left-on day is reached', () => {
    expect(isFormer('2026-11-18', '2026-11-18')).toBe(true)
    expect(isFormer('2026-11-19', '2026-11-18')).toBe(false)
    expect(isFormer(null, '2026-11-18')).toBe(false)
    expect(isFormer(undefined, '2026-11-18')).toBe(false)
  })

  it('allows the undo until the last day only', () => {
    expect(isDepartureUndoExpired(LAST_DAY, LAST_DAY)).toBe(false)
    expect(isDepartureUndoExpired(LAST_DAY, '2026-12-01')).toBe(true)
  })
})

describe('what a departure ends', () => {
  it('ends rows active after the last day and leaves rows that end by then', () => {
    expect(activeAfter({ validFrom: '2026-01-01', validTo: null }, LAST_DAY)).toBe(true)
    expect(activeAfter({ validFrom: '2026-01-01', validTo: '2026-12-31' }, LAST_DAY)).toBe(true)
    expect(activeAfter({ validFrom: '2026-01-01', validTo: LAST_DAY }, LAST_DAY)).toBe(false)
  })

  it('removes a row that starts after the last day and ends the others', () => {
    expect(endAction({ validFrom: '2026-12-01', validTo: null }, LAST_DAY)).toBe('remove')
    expect(endAction({ validFrom: LAST_DAY, validTo: null }, LAST_DAY)).toBe('end')
  })
})

describe('departureBlockers (DD-L04)', () => {
  const base = { lastDay: LAST_DAY, clubAdminIds: [], activeAccountAdminIds: ['admin'] }

  it('blocks a person who already left or is leaving on a recorded day', () => {
    const blockers = departureBlockers({
      ...base,
      leavingIds: ['p1', 'p2'],
      persons: persons({ id: 'p1', birthDate: null, leftOn: '2026-10-31' }, child('p2')),
      guardianships: [],
    })
    expect(blockers).toEqual([{ code: 'already_left', personId: 'p1', leftOn: '2026-10-31' }])
  })

  it('blocks the only guardian of a staying minor, naming the ward', () => {
    const blockers = departureBlockers({
      ...base,
      leavingIds: ['mother'],
      persons: persons(child('jan')),
      guardianships: [guardianship('g1', 'mother', 'jan')],
    })
    expect(blockers).toEqual([{ code: 'ward_without_guardian', personId: 'mother', wardPersonId: 'jan' }])
  })

  it('treats a ward without a birth date as a minor and lets an adult ward stay alone', () => {
    const blockers = departureBlockers({
      ...base,
      leavingIds: ['mother'],
      persons: persons(child('jan', null), child('ola', '2000-01-01')),
      guardianships: [guardianship('g1', 'mother', 'jan'), guardianship('g2', 'mother', 'ola')],
    })
    expect(blockers).toEqual([{ code: 'ward_without_guardian', personId: 'mother', wardPersonId: 'jan' }])
  })

  it('does not block when another guardian stays, the ward leaves too, or the guardianship already ended', () => {
    expect(
      departureBlockers({
        ...base,
        leavingIds: ['mother'],
        persons: persons(child('jan')),
        guardianships: [guardianship('g1', 'mother', 'jan'), guardianship('g2', 'father', 'jan')],
      }),
    ).toEqual([])
    expect(
      departureBlockers({
        ...base,
        leavingIds: ['mother', 'jan'],
        persons: persons(child('jan')),
        guardianships: [guardianship('g1', 'mother', 'jan')],
      }),
    ).toEqual([])
    expect(
      departureBlockers({
        ...base,
        leavingIds: ['mother'],
        persons: persons(child('jan')),
        guardianships: [guardianship('g1', 'mother', 'jan', { validTo: '2026-11-01' })],
      }),
    ).toEqual([])
  })

  it('names each leaving guardian when both guardians of a staying minor leave', () => {
    const blockers = departureBlockers({
      ...base,
      leavingIds: ['mother', 'father'],
      persons: persons(child('jan')),
      guardianships: [guardianship('g1', 'mother', 'jan'), guardianship('g2', 'father', 'jan')],
    })
    expect(blockers.map((row) => row.personId)).toEqual(['father', 'mother'])
  })

  it('blocks the last administrator with an active account and lets one leave while another stays', () => {
    expect(
      departureBlockers({
        leavingIds: ['admin'],
        persons: persons(),
        guardianships: [],
        lastDay: LAST_DAY,
        clubAdminIds: ['admin', 'blocked-admin'],
        activeAccountAdminIds: ['admin'],
      }),
    ).toEqual([{ code: 'last_club_admin', personId: 'admin' }])
    expect(
      departureBlockers({
        leavingIds: ['admin'],
        persons: persons(),
        guardianships: [],
        lastDay: LAST_DAY,
        clubAdminIds: ['admin', 'other'],
        activeAccountAdminIds: ['admin', 'other'],
      }),
    ).toEqual([])
  })
})

describe('payerChoices and missingPayerChoices (*Primary payer hand-over*)', () => {
  const guardianships = [
    guardianship('g1', 'mother', 'jan', { isPrimaryPayer: true }),
    guardianship('g2', 'father', 'jan'),
    guardianship('g3', 'grandma', 'jan'),
    guardianship('g4', 'mother', 'ola', { isPrimaryPayer: true }),
    guardianship('g5', 'father', 'ola', { validTo: '2026-11-01' }),
  ]

  it('asks for the next payer of a staying ward that has another staying guardian', () => {
    expect(payerChoices({ leavingIds: ['mother'], guardianships, lastDay: LAST_DAY })).toEqual([
      { wardPersonId: 'jan', personId: 'mother', candidateGuardianPersonIds: ['father', 'grandma'] },
    ])
  })

  it('asks nothing when the ward leaves too or the payer stays', () => {
    expect(payerChoices({ leavingIds: ['mother', 'jan', 'ola'], guardianships, lastDay: LAST_DAY })).toEqual([])
    expect(payerChoices({ leavingIds: ['father'], guardianships, lastDay: LAST_DAY })).toEqual([])
  })

  it('sorts the choices by ward', () => {
    const rows = [
      guardianship('a', 'mother', 'zoe', { isPrimaryPayer: true }),
      guardianship('b', 'father', 'zoe'),
      guardianship('c', 'mother', 'adam', { isPrimaryPayer: true }),
      guardianship('d', 'father', 'adam'),
    ]
    expect(
      payerChoices({ leavingIds: ['mother'], guardianships: rows, lastDay: LAST_DAY }).map((c) => c.wardPersonId),
    ).toEqual(['adam', 'zoe'])
  })

  it('reports a missing answer and an answer naming a non-candidate', () => {
    const choices = payerChoices({ leavingIds: ['mother'], guardianships, lastDay: LAST_DAY })
    expect(missingPayerChoices(choices, [])).toEqual(['jan'])
    expect(missingPayerChoices(choices, [{ wardPersonId: 'jan', guardianPersonId: 'stranger' }])).toEqual(['jan'])
    expect(missingPayerChoices(choices, [{ wardPersonId: 'jan', guardianPersonId: 'grandma' }])).toEqual([])
  })
})

describe('suggestedPersons (J-L02 step 2)', () => {
  it('offers the other guardian of nobody else and the staying wards of a leaving guardian', () => {
    const guardianships = [
      guardianship('g1', 'kasia', 'jan'),
      guardianship('g2', 'piotr', 'jan'),
      guardianship('g3', 'kasia', 'ola'),
      guardianship('g4', 'anna', 'jan'),
      guardianship('g5', 'anna', 'tom'),
    ]
    expect(suggestedPersons({ leavingIds: ['kasia', 'jan'], guardianships, lastDay: LAST_DAY })).toEqual([
      { personId: 'ola', reason: 'ward_of_leaving_guardian' },
      { personId: 'piotr', reason: 'guardian_of_nobody_else' },
    ])
  })

  it('does not suggest a ward already suggested as a guardian, or rows that ended', () => {
    const guardianships = [
      guardianship('g1', 'kasia', 'jan'),
      guardianship('g2', 'piotr', 'jan'),
      guardianship('g3', 'piotr', 'kasia', { validTo: '2026-01-31' }),
    ]
    expect(suggestedPersons({ leavingIds: ['jan'], guardianships, lastDay: LAST_DAY })).toEqual([
      { personId: 'kasia', reason: 'guardian_of_nobody_else' },
      { personId: 'piotr', reason: 'guardian_of_nobody_else' },
    ])
    const crossed = [guardianship('g1', 'kasia', 'jan'), guardianship('g2', 'jan', 'kasia')]
    expect(suggestedPersons({ leavingIds: ['kasia'], guardianships: crossed, lastDay: LAST_DAY })).toEqual([
      { personId: 'jan', reason: 'guardian_of_nobody_else' },
    ])
  })
})

describe('departure requests (DD-L06)', () => {
  it('lets a member name themself and their wards only', () => {
    expect(subjectsOutsideScope(['me', 'ward', 'me'], 'me', ['ward'])).toEqual([])
    expect(subjectsOutsideScope(['me', 'stranger', 'other'], 'me', ['ward'])).toEqual(['other', 'stranger'])
  })

  it('records the requester kind per subject', () => {
    expect(requesterKind('me', 'me')).toBe('self')
    expect(requesterKind('ward', 'me')).toBe('guardian')
  })

  it('lets adults and persons without a birth date file and refuses a minor', () => {
    expect(mayFileDepartureRequest('2000-01-01', '2026-11-18')).toBe(true)
    expect(mayFileDepartureRequest(null, '2026-11-18')).toBe(true)
    expect(mayFileDepartureRequest('2010-01-01', '2026-11-18')).toBe(false)
  })
})

describe('hand-over choices (phase L5, #307)', () => {
  const needs = [
    { personId: 'w', groupId: 'g2' },
    { personId: 'w', groupId: 'g1' },
    { personId: 'x', groupId: 'g1' },
  ]

  it('lists every group that needs a choice and has none, once and sorted', () => {
    expect(missingHandOvers(needs, [])).toEqual(['g1', 'g2'])
    expect(missingHandOvers(needs, [{ groupId: 'g1', toPersonId: null }])).toEqual(['g2'])
    expect(
      missingHandOvers(needs, [
        { groupId: 'g1', toPersonId: 'm' },
        { groupId: 'g2', toPersonId: null },
        { groupId: 'g9', toPersonId: 'm' },
      ]),
    ).toEqual([])
    expect(missingHandOvers([], [])).toEqual([])
  })

  it('refuses a target who leaves too and two different choices for one group', () => {
    expect(invalidHandOvers([{ groupId: 'g1', toPersonId: 'm' }], ['w'])).toEqual([])
    expect(invalidHandOvers([{ groupId: 'g1', toPersonId: null }], ['w'])).toEqual([])
    expect(invalidHandOvers([{ groupId: 'g1', toPersonId: 'x' }], ['w', 'x'])).toEqual(['g1'])
    expect(
      invalidHandOvers(
        [
          { groupId: 'g2', toPersonId: 'm' },
          { groupId: 'g2', toPersonId: null },
          { groupId: 'g1', toPersonId: 'm' },
          { groupId: 'g1', toPersonId: 'm' },
        ],
        ['w'],
      ),
    ).toEqual(['g2'])
  })
})
