import { describe, expect, it } from '@jest/globals'
import type { ImportMapping } from '../import-mapping'
import {
  GROUPS_NOT_ENABLED,
  IMPORT_RETENTION_DAYS,
  classificationCounts,
  columnName,
  identityKeys,
  importPesel,
  importPurgeCutoff,
  normalizeImportRow,
  parseImportDate,
  personPatch,
  planImport,
  type ExistingDirectory,
  type ExistingPerson,
  type ImportDecision,
  type ImportPersonValues,
  type NormalizedImportRow,
} from '../import-rules'

// Synthetic numbers with valid check digits (engineering standards S5.9: no real PESEL in test data).
const PESEL_A = '90010100009'
const PESEL_B = '85020300017'
const PESEL_C = '92071514577'

const TODAY = '2026-10-30'

const header = [
  'Imię',
  'Nazwisko',
  'Data urodzenia',
  'PESEL',
  'Nr',
  'E-mail',
  'Telefon',
  'Imię rodzica',
  'Nazwisko rodzica',
  'PESEL rodzica',
  'E-mail rodzica',
  'Telefon rodzica',
  '',
  'Grupa',
]

const mapping: ImportMapping = {
  'participant.firstName': 0,
  'participant.lastName': 1,
  'participant.birthDate': 2,
  'participant.pesel': 3,
  'participant.externalId': 4,
  'participant.email': 5,
  'participant.phone': 6,
  'guardian1.firstName': 7,
  'guardian1.lastName': 8,
  'guardian1.pesel': 9,
  'guardian1.email': 10,
  'guardian1.phone': 11,
  'guardian2.firstName': 12,
  group: 13,
}

const options = { header, mapping, date1904: false, today: TODAY }

function cells(
  values: Partial<Record<number, string | number | boolean | null>>,
): (string | number | boolean | null)[] {
  return header.map((_, index) => values[index] ?? null)
}

function values(partial: Partial<ImportPersonValues>): ImportPersonValues {
  return {
    firstName: null,
    lastName: null,
    birthDate: null,
    pesel: null,
    externalId: null,
    email: null,
    phone: null,
    ...partial,
  }
}

function row(rowNo: number, persons: NormalizedImportRow['persons'], group: string | null = null): NormalizedImportRow {
  return { rowNo, persons, group, error: null }
}

function existing(partial: Partial<ExistingPerson> & { id: string }): ExistingPerson {
  return {
    firstName: 'X',
    lastName: 'Y',
    birthDate: null,
    email: null,
    phone: null,
    hasPesel: false,
    hasExternalId: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    guardians: [],
    wards: [],
    ...partial,
  }
}

function directory(persons: ExistingPerson[], identities: [string, string][]): ExistingDirectory {
  return { byIdentity: new Map(identities), persons: new Map(persons.map((person) => [person.id, person])) }
}

const EMPTY: ExistingDirectory = directory([], [])
const noDecisions = new Map<number, ImportDecision>()
const planOptions = { header, mapping }

describe('parseImportDate', () => {
  it('reads Excel serials of both date systems', () => {
    expect(parseImportDate(43831, false, TODAY)).toBe('2020-01-01')
    expect(parseImportDate(43831.75, false, TODAY)).toBe('2020-01-01')
    expect(parseImportDate(42369, true, TODAY)).toBe('2020-01-01')
    expect(parseImportDate(60, false, TODAY)).toBeNull()
    expect(parseImportDate(61, false, TODAY)).toBe('1900-03-01')
  })

  it('reads ISO and day-first text and refuses anything else', () => {
    expect(parseImportDate('2015-03-07', false, TODAY)).toBe('2015-03-07')
    expect(parseImportDate('2015-3-7T00:00:00Z', false, TODAY)).toBe('2015-03-07')
    expect(parseImportDate(' 7.3.2015 ', false, TODAY)).toBe('2015-03-07')
    expect(parseImportDate('07/03/2015', false, TODAY)).toBe('2015-03-07')
    expect(parseImportDate('07-03-2015', false, TODAY)).toBe('2015-03-07')
    expect(parseImportDate('31.02.2015', false, TODAY)).toBeNull()
    expect(parseImportDate('marzec 2015', false, TODAY)).toBeNull()
    expect(parseImportDate(true, false, TODAY)).toBeNull()
    expect(parseImportDate(null, false, TODAY)).toBeNull()
  })

  it('refuses dates before 1900 and after today', () => {
    expect(parseImportDate('1899-12-31', false, TODAY)).toBeNull()
    expect(parseImportDate('2026-10-31', false, TODAY)).toBeNull()
    expect(parseImportDate('2026-10-30', false, TODAY)).toBe('2026-10-30')
  })
})

describe('importPesel', () => {
  it('restores the leading zeros of a numeric cell and removes spaces', () => {
    expect(importPesel(2210100017)).toBe('02210100017')
    expect(importPesel(' 900101 00009 ')).toBe('90010100009')
    expect(importPesel('  ')).toBeNull()
    expect(importPesel(null)).toBeNull()
  })
})

describe('columnName', () => {
  it('names the mapped column, or null for an unmapped field or an unnamed column', () => {
    expect(columnName(options, 'participant.pesel')).toBe('PESEL')
    expect(columnName(options, 'guardian2.firstName')).toBeNull()
    expect(columnName(options, 'guardian2.email')).toBeNull()
  })
})

describe('normalizeImportRow', () => {
  it('reads the participant, a guardian and the group', () => {
    const normalized = normalizeImportRow(
      {
        rowNo: 2,
        cells: cells({
          0: ' Ola ',
          1: 'Nowak',
          2: 43831,
          3: Number(PESEL_A),
          4: 77,
          6: 600100200,
          7: 'Anna',
          8: 'Nowak',
          10: 'anna@example.org',
          13: 'Orliki',
        }),
      },
      options,
    )
    expect(normalized).toEqual({
      rowNo: 2,
      persons: {
        participant: values({
          firstName: 'Ola',
          lastName: 'Nowak',
          birthDate: '2020-01-01',
          pesel: PESEL_A,
          externalId: '77',
          phone: '600100200',
        }),
        guardian1: values({ firstName: 'Anna', lastName: 'Nowak', email: 'anna@example.org' }),
      },
      group: 'Orliki',
      error: null,
    })
  })

  it('reports the first problem with its column, never the value', () => {
    const problem = (data: Partial<Record<number, string | number | boolean | null>>) =>
      normalizeImportRow({ rowNo: 3, cells: cells({ 0: 'Ola', 1: 'Nowak', ...data }) }, options).error
    expect(problem({ 2: '31.02.2015' })).toEqual({ code: 'import_date_invalid', column: 'Data urodzenia' })
    expect(problem({ 3: '12345678901' })).toEqual({ code: 'import_pesel_invalid', column: 'PESEL' })
    expect(problem({ 5: 'not-an-email' })).toEqual({ code: 'import_email_invalid', column: 'E-mail' })
    expect(problem({ 6: '1'.repeat(51) })).toEqual({ code: 'import_value_too_long', column: 'Telefon' })
    expect(problem({ 13: 'G'.repeat(201) })).toEqual({ code: 'import_value_too_long', column: 'Grupa' })
    expect(problem({ 1: null })).toEqual({ code: 'import_name_missing', column: 'Nazwisko' })
    expect(problem({ 10: 'x@example.org' })).toEqual({ code: 'import_name_missing', column: 'Imię rodzica' })
    expect(problem({ 2: '1.1.2020', 3: '1' })).toEqual({ code: 'import_pesel_invalid', column: 'PESEL' })
  })

  it('reads a sheet without a group column and with short rows', () => {
    const withoutGroup: ImportMapping = Object.fromEntries(Object.entries(mapping).filter(([key]) => key !== 'group'))
    const normalized = normalizeImportRow({ rowNo: 4, cells: ['Ola', 'Nowak'] }, { ...options, mapping: withoutGroup })
    expect(normalized.group).toBeNull()
    expect(normalized.persons.guardian1).toBeUndefined()
    expect(normalized.persons.participant?.firstName).toBe('Ola')
  })
})

describe('identityKeys', () => {
  it('lists the PESEL first, then the import identifier', () => {
    expect(identityKeys(values({ pesel: PESEL_A, externalId: 'A-1' }))).toEqual([`pesel:${PESEL_A}`, 'ext:A-1'])
    expect(identityKeys(values({}))).toEqual([])
  })
})

describe('personPatch', () => {
  it('changes only what the file has and the record lacks or differs in', () => {
    const record = existing({ id: 'p1', firstName: 'Ola', lastName: 'Nowak', email: 'a@example.org', hasPesel: true })
    expect(personPatch(record, values({ firstName: 'Ola', lastName: 'Nowak', pesel: PESEL_A }))).toBeNull()
    expect(
      personPatch(record, values({ firstName: 'Ola', lastName: 'Nowak-Lis', phone: '600', externalId: 'X' })),
    ).toEqual({ lastName: 'Nowak-Lis', phone: '600', externalId: 'X' })
    expect(
      personPatch(existing({ id: 'p2', hasExternalId: true }), values({ pesel: PESEL_B, externalId: 'Y' })),
    ).toEqual({ pesel: PESEL_B })
  })
})

describe('planImport', () => {
  const child = (partial: Partial<ImportPersonValues> = {}) =>
    values({ firstName: 'Ola', lastName: 'Nowak', birthDate: '2016-05-01', pesel: PESEL_A, ...partial })
  const mother = (partial: Partial<ImportPersonValues> = {}) =>
    values({ firstName: 'Anna', lastName: 'Nowak', email: 'anna@example.org', ...partial })

  it('creates a new family once and links the first guardian as the primary payer', () => {
    const [plan] = planImport(
      [
        row(2, {
          participant: child(),
          guardian1: mother(),
          guardian2: values({ firstName: 'Jan', lastName: 'Nowak' }),
        }),
      ],
      EMPTY,
      noDecisions,
      planOptions,
    )
    expect(plan.classification).toBe('new')
    expect(plan.idle).toBe(false)
    expect(plan.persons.map((person) => [person.slot, person.ref.kind, Boolean(person.create)])).toEqual([
      ['participant', 'new', true],
      ['guardian1', 'new', true],
      ['guardian2', 'new', true],
    ])
    expect(plan.links.map((link) => [link.guardianSlot, link.isPrimaryPayer])).toEqual([
      ['guardian1', true],
      ['guardian2', false],
    ])
    expect(plan.matchedPersonId).toBeNull()
  })

  it('matches a family already in the club by PESEL and its guardian through the matched child', () => {
    const club = directory(
      [
        existing({
          id: 'child',
          firstName: 'Ola',
          lastName: 'Nowak',
          birthDate: '2016-05-01',
          hasPesel: true,
          guardians: [{ personId: 'mum', firstName: 'ANNA', lastName: ' nowak ', isPrimaryPayer: true }],
        }),
        existing({
          id: 'mum',
          firstName: 'Anna',
          lastName: 'Nowak',
          email: 'anna@example.org',
          wards: [{ personId: 'child', firstName: 'Ola', lastName: 'Nowak', isPrimaryPayer: true }],
        }),
      ],
      [[`pesel:${PESEL_A}`, 'child']],
    )
    const [plan] = planImport([row(2, { participant: child(), guardian1: mother() })], club, noDecisions, planOptions)
    expect(plan.classification).toBe('matched')
    expect(plan.matchedPersonId).toBe('child')
    expect(plan.persons.map((person) => [person.ref, person.update])).toEqual([
      [{ kind: 'existing', personId: 'child' }, null],
      [{ kind: 'existing', personId: 'mum' }, null],
    ])
    expect(plan.links).toEqual([])
  })

  it('matches a child with a changed surname by PESEL and plans the update', () => {
    const club = directory(
      [existing({ id: 'child', firstName: 'Ola', lastName: 'Nowak', hasPesel: true })],
      [[`pesel:${PESEL_A}`, 'child']],
    )
    const [plan] = planImport(
      [row(2, { participant: child({ lastName: 'Nowak-Lis' }) })],
      club,
      noDecisions,
      planOptions,
    )
    expect(plan.classification).toBe('matched')
    expect(plan.persons[0].update).toEqual({ lastName: 'Nowak-Lis', birthDate: '2016-05-01' })
  })

  it('anchors a child without an identifier through a matched guardian, and links a new guardian to a ward with a payer', () => {
    const club = directory(
      [
        existing({
          id: 'mum',
          hasPesel: true,
          wards: [{ personId: 'kid', firstName: 'Ola', lastName: 'Nowak', isPrimaryPayer: false }],
        }),
        existing({
          id: 'kid',
          firstName: 'Ola',
          lastName: 'Nowak',
          guardians: [{ personId: 'mum', firstName: 'Anna', lastName: 'Nowak', isPrimaryPayer: true }],
        }),
      ],
      [[`pesel:${PESEL_B}`, 'mum']],
    )
    const [plan] = planImport(
      [
        row(2, {
          participant: child({ pesel: null }),
          guardian1: mother({ pesel: PESEL_B }),
          guardian2: values({ firstName: 'Jan', lastName: 'Nowak' }),
        }),
      ],
      club,
      noDecisions,
      planOptions,
    )
    expect(plan.classification).toBe('new')
    expect(plan.persons.map((person) => person.ref)).toEqual([
      { kind: 'existing', personId: 'kid' },
      { kind: 'existing', personId: 'mum' },
      { kind: 'new', key: 'row:2:guardian2' },
    ])
    expect(plan.links).toEqual([
      {
        guardianSlot: 'guardian2',
        guardian: { kind: 'new', key: 'row:2:guardian2' },
        ward: { kind: 'existing', personId: 'kid' },
        isPrimaryPayer: false,
      },
    ])
  })

  it('creates a person without an identifier when no relative anchors it', () => {
    const club = directory([existing({ id: 'mum', hasPesel: true })], [[`pesel:${PESEL_B}`, 'mum']])
    const [plan] = planImport(
      [row(2, { participant: child({ pesel: null, birthDate: null }), guardian1: mother({ pesel: PESEL_B }) })],
      club,
      noDecisions,
      planOptions,
    )
    expect(plan.persons[0].ref).toEqual({ kind: 'new', key: 'row:2:participant' })
    expect(plan.links[0].isPrimaryPayer).toBe(true)
  })

  it('keys an unidentified child with a birth date by name and date inside the file', () => {
    const plans = planImport(
      [
        row(2, { participant: child({ pesel: null }), guardian1: mother({ pesel: PESEL_B }) }),
        row(3, { participant: child({ pesel: null }), guardian1: mother({ pesel: PESEL_C, firstName: 'Ewa' }) }),
      ],
      EMPTY,
      noDecisions,
      planOptions,
    )
    expect(plans[0].persons[0].ref).toEqual({ kind: 'new', key: 'same:p:ola|nowak|2016-05-01' })
    expect(plans[1].persons[0]).toEqual({
      slot: 'participant',
      ref: plans[0].persons[0].ref,
      create: null,
      update: null,
    })
  })

  it('reuses in-file people: siblings share a guardian by name and contact, a child listed twice is created once', () => {
    const plans = planImport(
      [
        row(2, { participant: child(), guardian1: mother() }),
        row(3, { participant: child({ firstName: 'Ala', pesel: PESEL_C }), guardian1: mother() }),
        row(4, { participant: child(), guardian2: values({ firstName: 'Jan', lastName: 'Nowak', phone: '600' }) }),
        row(5, { participant: child({ externalId: 'K-1' }), guardian1: mother({ email: null, phone: '601' }) }),
      ],
      EMPTY,
      noDecisions,
      planOptions,
    )
    expect(plans.map((plan) => plan.classification)).toEqual(['new', 'new', 'new', 'new'])
    const mum = plans[0].persons[1].ref
    expect(plans[1].persons[1]).toEqual({ slot: 'guardian1', ref: mum, create: null, update: null })
    expect(plans[2].persons[0].create).toBeNull()
    expect(plans[2].links.map((link) => link.isPrimaryPayer)).toEqual([false])
    // Row 5 adds an import identifier to the same child (same PESEL); the mother's other phone is another key.
    expect(plans[3].persons[0]).toEqual({
      slot: 'participant',
      ref: plans[0].persons[0].ref,
      create: null,
      update: null,
    })
    expect(plans[3].persons[1].create).toEqual(mother({ email: null, phone: '601' }))
    expect(plans[3].links.map((link) => link.isPrimaryPayer)).toEqual([false])
  })

  it('does not link a guardian twice or a person to themselves', () => {
    const plans = planImport(
      [
        row(2, { participant: child(), guardian1: mother() }),
        row(3, { participant: child(), guardian1: mother(), guardian2: child({ email: 'x@example.org' }) }),
      ],
      EMPTY,
      noDecisions,
      planOptions,
    )
    expect(plans[1].links).toEqual([])
  })

  it('puts a row without any identifier in the review queue until it is decided', () => {
    const club = directory(
      [
        existing({
          id: 'kid',
          guardians: [{ personId: 'mum', firstName: 'Anna', lastName: 'Nowak', isPrimaryPayer: true }],
        }),
      ],
      [],
    )
    const rows = [
      row(2, { participant: child({ pesel: null }), guardian1: mother() }),
      row(3, { participant: child({ pesel: null, firstName: 'Ela' }) }),
      row(4, { participant: child({ pesel: null, firstName: 'Iza' }) }),
      row(5, { participant: child({ pesel: null, firstName: 'Ewa' }) }),
      row(6, { participant: child({ pesel: null, firstName: 'Zoe' }) }),
    ]
    const undecided = planImport(rows, club, noDecisions, planOptions)
    expect(undecided.map((plan) => [plan.classification, plan.reviewReason, plan.needsDecision, plan.idle])).toEqual([
      ['review', 'identifier_missing', true, true],
      ['review', 'identifier_missing', true, true],
      ['review', 'identifier_missing', true, true],
      ['review', 'identifier_missing', true, true],
      ['review', 'identifier_missing', true, true],
    ])
    const decisions = new Map<number, ImportDecision>([
      [2, { action: 'match', personId: 'kid' }],
      [3, { action: 'create' }],
      [4, { action: 'skip' }],
      [5, { action: 'match', personId: 'gone' }],
    ])
    const decided = planImport(rows, club, decisions, planOptions)
    expect(decided.map((plan) => [plan.classification, plan.needsDecision, plan.idle])).toEqual([
      ['review', false, false],
      ['review', false, false],
      ['review', false, true],
      ['review', true, true],
      ['review', true, true],
    ])
    expect(decided[0].persons.map((person) => person.ref)).toEqual([
      { kind: 'existing', personId: 'kid' },
      { kind: 'existing', personId: 'mum' },
    ])
    expect(decided[0].matchedPersonId).toBe('kid')
    expect(decided[1].persons[0].ref).toEqual({ kind: 'new', key: 'row:3:participant' })
  })

  it('keeps the classification of a skipped identified row and writes nothing for it', () => {
    const [plan] = planImport(
      [row(2, { participant: child() })],
      EMPTY,
      new Map<number, ImportDecision>([[2, { action: 'skip' }]]),
      planOptions,
    )
    expect([plan.classification, plan.idle, plan.persons, plan.links]).toEqual(['new', true, [], []])
  })

  it('marks problems, repeated rows and identifier conflicts as errors', () => {
    const broken: NormalizedImportRow = {
      ...row(2, { participant: child() }, 'Orliki'),
      error: { code: 'import_date_invalid', column: 'Data urodzenia' },
    }
    const plans = planImport(
      [
        row(6, { participant: child({ firstName: 'Ela' }) }),
        broken,
        row(3, { participant: child() }, 'Orliki'),
        row(4, { participant: child({ email: 'OLA@example.org' }) }, 'orliki'),
        row(5, { participant: child({ email: 'ola@example.org' }) }, ' Orliki'),
        row(7, { participant: child({ firstName: 'Ola', birthDate: '2016-05-02', phone: '1' }) }),
        row(8, { participant: child({ pesel: null, birthDate: null, externalId: 'E-1' }) }),
        row(9, { participant: child({ pesel: null, birthDate: null, externalId: 'E-1', firstName: 'Ina' }) }),
      ],
      EMPTY,
      noDecisions,
      planOptions,
    )
    expect(plans.map((plan) => [plan.rowNo, plan.classification, plan.errorCode, plan.errorColumn])).toEqual([
      [2, 'error', 'import_date_invalid', 'Data urodzenia'],
      [3, 'new', null, null],
      [4, 'new', null, null],
      [5, 'error', 'import_row_duplicate', null],
      [6, 'error', 'import_identifier_conflict', 'PESEL'],
      [7, 'error', 'import_identifier_conflict', 'PESEL'],
      [8, 'new', null, null],
      [9, 'error', 'import_identifier_conflict', 'Nr'],
    ])
    expect(plans[0].group).toBe('Orliki')
  })

  it('refuses a row whose PESEL and import identifier name two different club members', () => {
    const club = directory(
      [existing({ id: 'a', hasPesel: true }), existing({ id: 'b', hasExternalId: true })],
      [
        [`pesel:${PESEL_A}`, 'a'],
        ['ext:B-1', 'b'],
      ],
    )
    const [plan] = planImport([row(2, { participant: child({ externalId: 'B-1' }) })], club, noDecisions, planOptions)
    expect([plan.classification, plan.errorCode, plan.errorColumn]).toEqual([
      'error',
      'import_identifier_conflict',
      'Nr',
    ])
  })

  it('matches by the import identifier and tolerates a directory without the record', () => {
    const club = directory([], [['ext:B-1', 'b']])
    const [plan] = planImport(
      [row(2, { participant: child({ pesel: null, externalId: 'B-1' }), guardian1: mother() })],
      club,
      noDecisions,
      planOptions,
    )
    expect(plan.persons[0]).toEqual({
      slot: 'participant',
      ref: { kind: 'existing', personId: 'b' },
      create: null,
      update: null,
    })
    expect(plan.persons[1].ref).toEqual({ kind: 'new', key: 'same:g:anna|nowak|anna@example.org' })
    expect(plan.links[0].isPrimaryPayer).toBe(true)
  })
})

describe('classificationCounts and retention', () => {
  it('counts every classification', () => {
    expect(
      classificationCounts([
        { classification: 'new' },
        { classification: 'new' },
        { classification: 'review' },
        { classification: 'error' },
      ]),
    ).toEqual({ new: 2, matched: 0, review: 1, error: 1 })
  })

  it('purges 30 days after the commit or the cancellation and names the membership status', () => {
    expect(IMPORT_RETENTION_DAYS).toBe(30)
    expect(importPurgeCutoff(new Date('2026-10-30T04:00:00.000Z')).toISOString()).toBe('2026-09-30T04:00:00.000Z')
    expect(GROUPS_NOT_ENABLED).toBe('groups_not_enabled')
  })
})
