import { describe, expect, it } from '@jest/globals'
import {
  activitiesExportPart,
  attendedCoachIds,
  exportSessionIds,
  type ActivitiesExportInput,
  type ExportAttendance,
  type ExportSession,
  type ExportSubstitution,
} from '../data-export'

const SUBJECT = 'p-subject'
const COACH = 'p-coach'
const GUARDIAN = 'p-guardian'
const STAFF = 'p-staff'
const OTHER_COACH = 'p-other-coach'
const OTHER_PERSON = 'p-other'
const T0 = new Date('2026-11-01T10:00:00.000Z')
const T1 = new Date('2026-11-02T10:00:00.000Z')

const session: ExportSession = {
  id: 'occ-1',
  activityId: 'act-1',
  groupId: 'grp-1',
  occurrenceDate: '2026-11-03',
  startAt: new Date('2026-11-03T16:00:00.000Z'),
  coachPersonId: COACH,
}

function attendance(overrides: Partial<ExportAttendance> = {}): ExportAttendance {
  return {
    id: 'att-1',
    occurrenceId: 'occ-1',
    declared: 'yes',
    declarationStatus: 'final',
    source: 'app',
    createdAt: T0,
    updatedAt: T1,
    ...overrides,
  }
}

function substitution(overrides: Partial<ExportSubstitution> = {}): ExportSubstitution {
  return {
    id: 'sub-1',
    occurrenceId: 'occ-1',
    previousCoachPersonId: SUBJECT,
    newCoachPersonId: OTHER_COACH,
    kind: 'substitute_assigned',
    reason: 'Sick child',
    decidedByPersonId: STAFF,
    actingRole: 'coordinator',
    createdAt: T0,
    ...overrides,
  }
}

function input(overrides: Partial<ActivitiesExportInput> = {}): ActivitiesExportInput {
  return {
    personId: SUBJECT,
    attendances: [],
    tokens: [],
    contactReads: [],
    substitutions: [],
    sessions: new Map([[session.id, session]]),
    coachNames: new Map([[COACH, 'Anna Coach']]),
    counts: {
      sessionsCoached: 1,
      defaultCoachActivities: 2,
      attendanceMarked: 3,
      substitutionsDecided: 4,
      contactReads: 5,
    },
    ...overrides,
  }
}

function section(part: ReturnType<typeof activitiesExportPart>, table: string) {
  const found = part.sections.find((entry) => entry.table === table)
  if (!found) throw new Error(`missing ${table}`)
  return found
}

/** Every string anywhere in the document. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

describe('activitiesExportPart', () => {
  it('returns every inventory section, none portable, even with no rows, and the five actor counts', () => {
    const part = activitiesExportPart(input())
    expect(
      part.sections.map(({ table, activity, portable, rows, reviewFields }) => ({
        table,
        activity,
        portable,
        rows,
        reviewFields,
      })),
    ).toEqual([
      { table: 'activities_attendances', activity: 'A3', portable: false, rows: [], reviewFields: undefined },
      { table: 'activities_declaration_tokens', activity: 'A3', portable: false, rows: [], reviewFields: undefined },
      { table: 'activities_contact_access_log', activity: 'A10', portable: false, rows: [], reviewFields: undefined },
      { table: 'activities_substitution_entries', activity: 'A3', portable: false, rows: [], reviewFields: ['reason'] },
    ])
    expect(part.sections.every((entry) => entry.module === 'activities')).toBe(true)
    expect(part.actorCounts).toEqual([
      { module: 'activities', table: 'activities_occurrences', count: 1 },
      { module: 'activities', table: 'activities_activities', count: 2 },
      { module: 'activities', table: 'activities_attendances', count: 3 },
      { module: 'activities', table: 'activities_substitution_entries', count: 4 },
      { module: 'activities', table: 'activities_contact_access_log', count: 5 },
    ])
  })

  it('shows an attendance with the coach by name, a guardian declarer and the staff marker by relation only', () => {
    const part = activitiesExportPart(
      input({
        attendances: [
          attendance({
            declaredByPersonId: GUARDIAN,
            declaredAt: T0,
            declarationStatus: 'pending_guardian',
            guardianDecidedAt: T1,
            pendingUntil: T1,
            timeoutOutcome: 'declared',
            actual: 'present',
            markedByPersonId: STAFF,
            markedAsRole: 'coach',
          }),
        ],
      }),
    )
    expect(section(part, 'activities_attendances').rows).toEqual([
      {
        id: 'att-1',
        occurrenceId: 'occ-1',
        activityId: 'act-1',
        groupId: 'grp-1',
        occurrenceDate: '2026-11-03',
        startAt: '2026-11-03T16:00:00.000Z',
        coach: { relation: 'coach', name: 'Anna Coach' },
        declared: 'yes',
        declaredBy: { relation: 'guardian' },
        declaredAt: T0.toISOString(),
        declarationStatus: 'pending_guardian',
        guardianDecidedAt: T1.toISOString(),
        pendingUntil: T1.toISOString(),
        timeoutOutcome: 'declared',
        actual: 'present',
        markedBy: { relation: 'staff' },
        markedAsRole: 'coach',
        source: 'app',
        createdAt: T0.toISOString(),
        updatedAt: T1.toISOString(),
      },
    ])
  })

  it('shows the subject as itself, a staff declarer as staff, and nulls where nothing was recorded', () => {
    const part = activitiesExportPart(
      input({
        attendances: [
          attendance({ id: 'att-self', declaredByPersonId: SUBJECT, markedByPersonId: SUBJECT }),
          attendance({ id: 'att-staff', declaredByPersonId: STAFF, source: 'staff' }),
          attendance({ id: 'att-none', occurrenceId: 'occ-deleted' }),
        ],
        sessions: new Map([
          [session.id, session],
          ['occ-own', { ...session, id: 'occ-own', coachPersonId: SUBJECT }],
        ]),
      }),
    )
    const rows = section(part, 'activities_attendances').rows
    expect(rows[0]).toMatchObject({ declaredBy: 'subject', markedBy: 'subject' })
    expect(rows[1]).toMatchObject({ declaredBy: { relation: 'staff' }, markedBy: null })
    expect(rows[2]).toMatchObject({
      activityId: null,
      groupId: null,
      occurrenceDate: null,
      startAt: null,
      coach: null,
      declaredBy: null,
      declaredAt: null,
      guardianDecidedAt: null,
      pendingUntil: null,
      timeoutOutcome: null,
      actual: null,
      markedBy: null,
      markedAsRole: null,
    })
  })

  it('shows a coach without a known name, a blank name, or the subject as the coach without a name', () => {
    const part = activitiesExportPart(
      input({
        attendances: [
          attendance({ id: 'a', occurrenceId: 'occ-unknown' }),
          attendance({ id: 'b', occurrenceId: 'occ-blank' }),
          attendance({ id: 'c', occurrenceId: 'occ-own' }),
        ],
        sessions: new Map([
          ['occ-unknown', { ...session, id: 'occ-unknown', coachPersonId: OTHER_COACH }],
          ['occ-blank', { ...session, id: 'occ-blank', coachPersonId: OTHER_PERSON }],
          ['occ-own', { ...session, id: 'occ-own', coachPersonId: SUBJECT }],
        ]),
        coachNames: new Map([[OTHER_PERSON, '  ']]),
      }),
    )
    expect(section(part, 'activities_attendances').rows.map((row) => row.coach)).toEqual([
      { relation: 'coach' },
      { relation: 'coach' },
      'subject',
    ])
  })

  it('shows a declaration link with its purpose and dates, never the token hash', () => {
    const part = activitiesExportPart(
      input({
        tokens: [
          { id: 'tok-1', occurrenceId: 'occ-1', expiresAt: T1, usedCount: 2, lastUsedAt: T0, createdAt: T0 },
          { id: 'tok-2', occurrenceId: 'occ-1', expiresAt: T1, usedCount: 0, createdAt: T0 },
        ],
      }),
    )
    expect(section(part, 'activities_declaration_tokens').rows).toEqual([
      {
        id: 'tok-1',
        purpose: 'attendance_declaration',
        occurrenceId: 'occ-1',
        activityId: 'act-1',
        groupId: 'grp-1',
        occurrenceDate: '2026-11-03',
        startAt: '2026-11-03T16:00:00.000Z',
        createdAt: T0.toISOString(),
        expiresAt: T1.toISOString(),
        usedCount: 2,
        lastUsedAt: T0.toISOString(),
      },
      expect.objectContaining({ id: 'tok-2', lastUsedAt: null }),
    ])
    expect(Object.keys(section(part, 'activities_declaration_tokens').rows[0])).not.toContain('tokenHash')
  })

  it('shows a contact read with its date, purpose and session, and the reader as a role label only', () => {
    const part = activitiesExportPart(
      input({
        contactReads: [
          {
            id: 'read-1',
            occurrenceId: 'occ-1',
            actingRole: 'coach',
            resourceKind: 'people:person',
            purpose: 'coach_contacts',
            createdAt: T0,
          },
        ],
      }),
    )
    expect(section(part, 'activities_contact_access_log').rows).toEqual([
      {
        id: 'read-1',
        readAt: T0.toISOString(),
        purpose: 'coach_contacts',
        resourceKind: 'people:person',
        occurrenceId: 'occ-1',
        activityId: 'act-1',
        groupId: 'grp-1',
        occurrenceDate: '2026-11-03',
        startAt: '2026-11-03T16:00:00.000Z',
        reader: { relation: 'staff', actingRole: 'coach' },
      },
    ])
  })

  it('shows a substitution of the subject with the other coach and the decider by relation only', () => {
    const part = activitiesExportPart(
      input({
        substitutions: [
          substitution(),
          substitution({
            id: 'sub-2',
            previousCoachPersonId: null,
            newCoachPersonId: SUBJECT,
            decidedByPersonId: SUBJECT,
            kind: 'coach_restored',
            reason: null,
            actingRole: 'coach',
          }),
        ],
      }),
    )
    const target = section(part, 'activities_substitution_entries')
    expect(target.reviewFields).toEqual(['reason'])
    expect(target.rows).toEqual([
      {
        id: 'sub-1',
        occurrenceId: 'occ-1',
        activityId: 'act-1',
        groupId: 'grp-1',
        occurrenceDate: '2026-11-03',
        startAt: '2026-11-03T16:00:00.000Z',
        role: 'previous_coach',
        kind: 'substitute_assigned',
        previousCoach: 'subject',
        newCoach: { relation: 'coach' },
        decidedBy: { relation: 'staff' },
        actingRole: 'coordinator',
        reason: 'Sick child',
        createdAt: T0.toISOString(),
      },
      expect.objectContaining({
        id: 'sub-2',
        role: 'new_coach',
        previousCoach: null,
        newCoach: 'subject',
        decidedBy: 'subject',
        reason: null,
      }),
    ])
  })

  it('never puts another person id in any row', () => {
    const part = activitiesExportPart(
      input({
        attendances: [attendance({ declaredByPersonId: GUARDIAN, markedByPersonId: STAFF })],
        substitutions: [substitution()],
        contactReads: [
          {
            id: 'read-1',
            occurrenceId: 'occ-1',
            actingRole: 'coach',
            resourceKind: 'people:person',
            purpose: 'coach_contacts',
            createdAt: T0,
          },
        ],
      }),
    )
    const all = strings(part.sections)
    for (const id of [COACH, GUARDIAN, STAFF, OTHER_COACH]) expect(all).not.toContain(id)
  })
})

describe('attendedCoachIds', () => {
  it('returns the distinct coaches of the attended sessions other than the subject', () => {
    const sessions = new Map<string, Pick<ExportSession, 'coachPersonId'>>([
      ['a', { coachPersonId: COACH }],
      ['b', { coachPersonId: COACH }],
      ['c', { coachPersonId: SUBJECT }],
      ['d', { coachPersonId: null }],
    ])
    expect(
      attendedCoachIds(
        SUBJECT,
        [
          { occurrenceId: 'a' },
          { occurrenceId: 'b' },
          { occurrenceId: 'c' },
          { occurrenceId: 'd' },
          { occurrenceId: 'x' },
        ],
        sessions,
      ),
    ).toEqual([COACH])
  })
})

describe('exportSessionIds', () => {
  it('returns the distinct session ids', () => {
    expect(exportSessionIds([{ occurrenceId: 'a' }, { occurrenceId: 'b' }, { occurrenceId: 'a' }])).toEqual(['a', 'b'])
  })
})
