import { describe, expect, it } from '@jest/globals'
import {
  PZPN_ATTENDANCE_COLUMNS,
  PZPN_PERIOD_MAX_DAYS,
  PZPN_SCHEDULE_COLUMNS,
  UTF8_BOM,
  isPzpnPeriod,
  pzpnAttendanceHeaders,
  pzpnAttendanceRow,
  pzpnAttendanceStatus,
  pzpnCsv,
  pzpnEventType,
  pzpnFileName,
  pzpnScheduleHeaders,
  pzpnScheduleRow,
  pzpnScheduleStatus,
  sortPzpnAttendance,
  type PzpnAttendanceEntry,
  type PzpnScheduleSession,
} from '../pzpn-export'

const START = new Date('2026-11-10T16:00:00.000Z')

describe('isPzpnPeriod', () => {
  it('accepts one day, a month and exactly the longest period', () => {
    expect(isPzpnPeriod('2026-11-01', '2026-11-01')).toBe(true)
    expect(isPzpnPeriod('2026-11-01', '2026-11-30')).toBe(true)
    expect(PZPN_PERIOD_MAX_DAYS).toBe(366)
    expect(isPzpnPeriod('2026-01-01', '2027-01-01')).toBe(true)
  })

  it('refuses a period longer than the limit, an inverted one and malformed or impossible dates', () => {
    expect(isPzpnPeriod('2026-01-01', '2027-01-02')).toBe(false)
    expect(isPzpnPeriod('2026-11-30', '2026-11-01')).toBe(false)
    expect(isPzpnPeriod('2026-11', '2026-11-30')).toBe(false)
    expect(isPzpnPeriod('2026-11-01', 'tomorrow')).toBe(false)
    expect(isPzpnPeriod('2026-02-30', '2026-03-01')).toBe(false)
    expect(isPzpnPeriod('2026-13-01', '2026-13-02')).toBe(false)
  })
})

describe('pzpnEventType and pzpnScheduleStatus', () => {
  it('maps every activity type to PZPN’s Polish event type, an unknown one to "Inne"', () => {
    expect(['training', 'match', 'tournament', 'sparring', 'camp', 'other', 'gala'].map(pzpnEventType)).toEqual([
      'Trening',
      'Mecz',
      'Turniej',
      'Sparing',
      'Obóz',
      'Inne',
      'Inne',
    ])
  })

  it('says "Odwołane" for a cancelled session and "Zaplanowane" for a planned or held one', () => {
    expect(pzpnScheduleStatus('cancelled')).toBe('Odwołane')
    expect(pzpnScheduleStatus('planned')).toBe('Zaplanowane')
    expect(pzpnScheduleStatus('done')).toBe('Zaplanowane')
  })
})

describe('pzpnAttendanceStatus', () => {
  const before = new Date(START.getTime() - 3_600_000)
  const facts = (over: Partial<Parameters<typeof pzpnAttendanceStatus>[0] & object> = {}) => ({
    actual: 'absent',
    declared: 'no',
    declarationStatus: 'final',
    declaredAt: before,
    ...over,
  })

  it('is empty without a row or a mark', () => {
    expect(pzpnAttendanceStatus(undefined, START)).toBe('')
    expect(pzpnAttendanceStatus(facts({ actual: null }), START)).toBe('')
  })

  it('is "Obecny" for present and late', () => {
    expect(pzpnAttendanceStatus(facts({ actual: 'present' }), START)).toBe('Obecny')
    expect(pzpnAttendanceStatus(facts({ actual: 'late' }), START)).toBe('Obecny')
  })

  it('is "Usprawiedliwiony" only for an absence after a final "no" declared before the start', () => {
    expect(pzpnAttendanceStatus(facts(), START)).toBe('Usprawiedliwiony')
    expect(pzpnAttendanceStatus(facts({ declared: 'yes' }), START)).toBe('Nieobecny')
    expect(pzpnAttendanceStatus(facts({ declared: 'unknown' }), START)).toBe('Nieobecny')
    expect(pzpnAttendanceStatus(facts({ declarationStatus: 'pending_guardian' }), START)).toBe('Nieobecny')
    expect(pzpnAttendanceStatus(facts({ declaredAt: null }), START)).toBe('Nieobecny')
    expect(pzpnAttendanceStatus(facts({ declaredAt: START }), START)).toBe('Nieobecny')
    expect(pzpnAttendanceStatus(facts({ declaredAt: new Date(START.getTime() + 60_000) }), START)).toBe('Nieobecny')
  })
})

describe('pzpnScheduleRow', () => {
  const session: PzpnScheduleSession = {
    team: 'U11',
    type: 'training',
    date: '2026-11-10',
    start: '17:00',
    end: '18:30',
    place: 'Boisko A',
    topic: 'Prowadzenie piłki',
    activityName: 'Trening U11',
    coach: 'Marek Trener',
    status: 'done',
  }

  it('fills the columns in order, the name from the outline topic', () => {
    expect(pzpnScheduleRow(session)).toEqual([
      'U11',
      'Trening',
      '2026-11-10',
      '17:00',
      '18:30',
      'Boisko A',
      'Prowadzenie piłki',
      'Marek Trener',
      'Zaplanowane',
    ])
    expect(pzpnScheduleRow(session)).toHaveLength(PZPN_SCHEDULE_COLUMNS.length)
  })

  it('falls back to the activity name and leaves a missing place and coach empty', () => {
    expect(pzpnScheduleRow({ ...session, topic: null, place: null, coach: null, status: 'cancelled' })).toEqual([
      'U11',
      'Trening',
      '2026-11-10',
      '17:00',
      '18:30',
      '',
      'Trening U11',
      '',
      'Odwołane',
    ])
  })
})

describe('pzpnAttendanceRow and sortPzpnAttendance', () => {
  const entry = (over: Partial<PzpnAttendanceEntry> = {}): PzpnAttendanceEntry => ({
    team: 'U11',
    date: '2026-11-10',
    start: '17:00',
    startAt: START,
    lastName: 'Kowalski',
    firstName: 'Kuba',
    birthDate: '2015-04-02',
    facts: { actual: 'present', declared: 'unknown', declarationStatus: 'final', declaredAt: null },
    ...over,
  })

  it('fills the columns in order, an unknown birth date empty', () => {
    expect(pzpnAttendanceRow(entry())).toEqual([
      'U11',
      '2026-11-10',
      '17:00',
      'Kowalski',
      'Kuba',
      '2015-04-02',
      'Obecny',
    ])
    expect(pzpnAttendanceRow(entry({ birthDate: null, facts: undefined }))).toEqual([
      'U11',
      '2026-11-10',
      '17:00',
      'Kowalski',
      'Kuba',
      '',
      '',
    ])
    expect(pzpnAttendanceRow(entry())).toHaveLength(PZPN_ATTENDANCE_COLUMNS.length)
  })

  it('orders by start, then last name with Polish letters, then first name', () => {
    const later = new Date(START.getTime() + 86_400_000)
    const sorted = sortPzpnAttendance([
      entry({ startAt: later, lastName: 'Adamski', firstName: 'Jan' }),
      entry({ lastName: 'Łukasik', firstName: 'Ola' }),
      entry({ lastName: 'Lis', firstName: 'Zosia' }),
      entry({ lastName: 'Lis', firstName: 'Ada' }),
    ])
    expect(sorted.map((row) => `${row.lastName} ${row.firstName}`)).toEqual([
      'Lis Ada',
      'Lis Zosia',
      'Łukasik Ola',
      'Adamski Jan',
    ])
  })
})

describe('headers', () => {
  const echo = (key: string, fallback: string) => `${key}|${fallback}`

  it('reads every schedule column from the catalog with an English fallback', () => {
    expect(pzpnScheduleHeaders(echo)).toEqual([
      'activities.reports.pzpn.schedule.columns.team|Team',
      'activities.reports.pzpn.schedule.columns.eventType|Event type',
      'activities.reports.pzpn.schedule.columns.date|Date',
      'activities.reports.pzpn.schedule.columns.start|Start',
      'activities.reports.pzpn.schedule.columns.end|End',
      'activities.reports.pzpn.schedule.columns.place|Place',
      'activities.reports.pzpn.schedule.columns.name|Name / general goal',
      'activities.reports.pzpn.schedule.columns.coach|Coach',
      'activities.reports.pzpn.schedule.columns.status|Status',
    ])
  })

  it('reads every attendance column from the catalog with an English fallback', () => {
    expect(pzpnAttendanceHeaders(echo)).toEqual([
      'activities.reports.pzpn.attendance.columns.team|Team',
      'activities.reports.pzpn.attendance.columns.date|Date',
      'activities.reports.pzpn.attendance.columns.start|Start',
      'activities.reports.pzpn.attendance.columns.lastName|Last name',
      'activities.reports.pzpn.attendance.columns.firstName|First name',
      'activities.reports.pzpn.attendance.columns.birthDate|Birth date',
      'activities.reports.pzpn.attendance.columns.status|Status',
    ])
  })
})

describe('pzpnCsv and pzpnFileName', () => {
  it('starts with a BOM, ends lines with CRLF and escapes separators, quotes and formulas', () => {
    const csv = pzpnCsv(
      ['Drużyna', 'Nazwa'],
      [
        ['U11; rocznik 2015', 'Gra "na raz"'],
        ['U11', '=SUM(A1)'],
      ],
      ';',
    )
    expect(csv.startsWith(UTF8_BOM)).toBe(true)
    expect(csv.slice(1)).toBe('Drużyna;Nazwa\r\n"U11; rocznik 2015";"Gra ""na raz"""\r\nU11;\'=SUM(A1)\r\n')
  })

  it('writes the header alone for no rows', () => {
    expect(pzpnCsv(['Team'], [], ',')).toBe(`${UTF8_BOM}Team\r\n`)
  })

  it('names the file by kind and period', () => {
    expect(pzpnFileName('schedule', '2026-11-01', '2026-11-30')).toBe('pzpn-schedule-2026-11-01-2026-11-30.csv')
    expect(pzpnFileName('attendance', '2026-11-01', '2026-11-30')).toBe('pzpn-attendance-2026-11-01-2026-11-30.csv')
  })
})
