import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'
import {
  addDays,
  cancelOccurrence,
  createActivity,
  getOccurrence,
  moveOccurrence,
  wallTime,
  zoneDate,
  type OccurrenceItem,
} from '../_fixtures/activities'
import { declare, familyFor, saveAttendanceList, sessionsOf, startNow } from '../_fixtures/attendance'
import { calendarDate, createClub, type Club } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { readCatalogs } from '../../../../scripts/vereino-ui-texts.mjs'
import { APP_ROOT } from '../../../../scripts/vereino-paths.mjs'

// Training outlines spec TEST-O08 (REQ-O10, AC-O09, M-O9; E24-S04, #684): the team Żaki with four sessions in the
// period — two held trainings with marks and a declaration, a cancelled match and a sparring at a typed venue — and a
// pool session of another group. The schedule CSV has one row per Żaki session with PZPN's columns (event type, place
// or venue, the activity name while `training` provides no topic, Polish status); the attendance CSV one row per held
// or planned session × player, with Obecny / Usprawiedliwiony / Nieobecny / empty. Headers follow the locale (`pl`: `;`,
// `en`: `,`), the file starts with a BOM. A coach of another group and the other section's coordinator get 404, a
// member 403, a bad period 400. The page `/club/reports/pzpn` (reached from the group page) downloads the file.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const BOM = '﻿'
const SCHEDULE_KEYS = ['team', 'eventType', 'date', 'start', 'end', 'place', 'name', 'coach', 'status'].map(
  (column) => `activities.reports.pzpn.schedule.columns.${column}`,
)
const ATTENDANCE_KEYS = ['team', 'date', 'start', 'lastName', 'firstName', 'birthDate', 'status'].map(
  (column) => `activities.reports.pzpn.attendance.columns.${column}`,
)

type Kind = 'schedule' | 'attendance'

async function exportCsv(
  request: APIRequestContext,
  token: string,
  kind: Kind,
  query: { groupId: string; from: string; to: string },
  locale: 'en' | 'pl' = 'pl',
) {
  const params = new URLSearchParams({ ...query, format: 'csv' })
  const response = await request.get(`/api/activities/reports/pzpn-${kind}?${params.toString()}`, {
    headers: { authorization: `Bearer ${token}`, cookie: `locale=${locale}` },
  })
  return { status: response.status(), text: await response.text(), headers: response.headers() }
}

/** The CSV lines without the BOM and the final empty line. */
function linesOf(text: string): string[] {
  expect(text.startsWith(BOM)).toBe(true)
  const lines = text.slice(1).split('\r\n')
  expect(lines.at(-1)).toBe('')
  return lines.slice(0, -1)
}

async function sessionOf(request: APIRequestContext, club: Club, id: string): Promise<OccurrenceItem> {
  const result = await getOccurrence(request, club.adminToken, id)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  if (!result.body) throw new Error('[test] no session body')
  return result.body
}

async function onlySession(request: APIRequestContext, club: Club, activityId: string): Promise<OccurrenceItem> {
  const session = (await sessionsOf(request, club, activityId)).at(0)
  if (!session) throw new Error(`[test] activity ${activityId} has no session`)
  return session
}

test('TEST-O08 PZPN schedule and attendance CSVs: columns, Polish values, locale headers; another group’s coach gets 404', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-o08')
  try {
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const catalogs = readCatalogs(APP_ROOT)
    const today = calendarDate()
    const period = { groupId: family.zaki, from: addDays(today, -7), to: addDays(today, 14) }

    // --- S1: a training whose absence Hania's guardian declares while it is days away; then it starts in 20 minutes ---
    const s1Activity = await createActivity(request, admin, {
      groupId: family.zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: family.pitch,
      coachPersonId: family.coach.personId,
      startsOn: addDays(today, 5),
      startTime: '08:00',
      endTime: '09:00',
    })
    const s1Created = await onlySession(request, club, s1Activity.id)
    const declared = await declare(request, family.guardian.token, {
      occurrenceId: s1Created.id,
      personId: family.younger.personId,
      declared: 'no',
    })
    expect(declared.status, JSON.stringify(declared.body)).toBe(201)
    const soon = Date.now() + 20 * 60_000
    const moved = await moveOccurrence(
      request,
      admin,
      s1Created.id,
      { startAt: new Date(soon).toISOString(), endAt: new Date(soon + 60 * 60_000).toISOString() },
      s1Created.updatedAt,
    )
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    // The check-off opens 30 minutes before the start: Hania absent (declared), Kuba present, Stanisław absent.
    const s1Marked = await saveAttendanceList(
      request,
      family.coach.token,
      s1Created.id,
      {
        entries: [
          { personId: family.younger.personId, actual: 'absent' },
          { personId: family.elder.personId, actual: 'present' },
          { personId: family.other.child.personId, actual: 'absent' },
        ],
      },
      moved.body?.updatedAt,
    )
    expect(s1Marked.status, JSON.stringify(s1Marked.body)).toBe(200)

    // --- S2: a training that has started: Hania present, Kuba late, Stanisław not marked ---
    const s2Activity = await createActivity(request, admin, {
      groupId: family.zaki,
      name: 'Trening techniczny',
      type: 'training',
      placeId: family.pitch,
      coachPersonId: family.coach.personId,
      startsOn: addDays(today, 6),
      startTime: '08:00',
      endTime: '09:00',
    })
    const s2Created = await onlySession(request, club, s2Activity.id)
    const s2Version = await startNow(request, club, s2Created.id)
    const s2Marked = await saveAttendanceList(
      request,
      family.coach.token,
      s2Created.id,
      {
        entries: [
          { personId: family.younger.personId, actual: 'present' },
          { personId: family.elder.personId, actual: 'late' },
        ],
      },
      s2Version,
    )
    expect(s2Marked.status, JSON.stringify(s2Marked.body)).toBe(200)

    // --- S3: a cancelled match; S4: a sparring at a typed venue without a coach; S5: the pool group's class ---
    const s3Activity = await createActivity(request, admin, {
      groupId: family.zaki,
      name: 'Mecz ligowy',
      type: 'match',
      placeId: family.pitch,
      coachPersonId: family.coach.personId,
      startsOn: addDays(today, 3),
      startTime: '10:00',
      endTime: '11:30',
    })
    const s3Created = await onlySession(request, club, s3Activity.id)
    const cancelled = await cancelOccurrence(request, admin, s3Created.id, 'Deszcz', s3Created.updatedAt)
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    await createActivity(request, admin, {
      groupId: family.zaki,
      name: 'Sparing z sąsiadami',
      type: 'sparring',
      venue: { name: 'Stadion Miejski', address: 'ul. Polna 3, Liszki' },
      startsOn: addDays(today, 4),
      startTime: '10:00',
      endTime: '11:30',
    })
    await createActivity(request, admin, {
      groupId: family.poolGroup,
      name: 'Basen',
      type: 'training',
      placeId: family.poolPlace,
      coachPersonId: family.instructor.personId,
      startsOn: addDays(today, 2),
      startTime: '18:00',
      endTime: '19:00',
    })

    const s1 = await sessionOf(request, club, s1Created.id)
    const s2 = await sessionOf(request, club, s2Created.id)
    const at = (session: OccurrenceItem) => ({
      date: zoneDate(String(session.startAt)),
      start: wallTime(String(session.startAt)),
      end: wallTime(String(session.endAt)),
    })
    const [first, second] = [s1, s2].sort((a, b) => Date.parse(String(a.startAt)) - Date.parse(String(b.startAt)))
    const name = (session: OccurrenceItem) => (session.id === s1.id ? 'Trening Żaków' : 'Trening techniczny')

    // --- The schedule as the academy coordinator, in Polish: `;`, Polish headers, one row per Żaki session ---
    const schedule = await exportCsv(request, family.academyCoordinator.token, 'schedule', period, 'pl')
    expect(schedule.status, schedule.text).toBe(200)
    expect(schedule.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(schedule.headers['content-disposition']).toBe(
      `attachment; filename="pzpn-schedule-${period.from}-${period.to}.csv"`,
    )
    const scheduleLines = linesOf(schedule.text)
    expect(scheduleLines[0]).toBe(SCHEDULE_KEYS.map((key) => catalogs.pl.get(key)).join(';'))
    const row = (cells: string[]) => cells.join(';')
    expect(scheduleLines.slice(1)).toEqual([
      ...[first, second].map((session) => {
        const { date, start, end } = at(session)
        return row(['Żaki', 'Trening', date, start, end, 'Boisko A', name(session), 'Marek Trener', 'Zaplanowane'])
      }),
      row(['Żaki', 'Mecz', addDays(today, 3), '10:00', '11:30', 'Boisko A', 'Mecz ligowy', 'Marek Trener', 'Odwołane']),
      row([
        'Żaki',
        'Sparing',
        addDays(today, 4),
        '10:00',
        '11:30',
        'Stadion Miejski',
        'Sparing z sąsiadami',
        '',
        'Zaplanowane',
      ]),
    ])

    // --- The attendance as the coach of Żaki, in English: `,`, English headers, Polish statuses ---
    const attendance = await exportCsv(request, family.coach.token, 'attendance', period, 'en')
    expect(attendance.status, attendance.text).toBe(200)
    const attendanceLines = linesOf(attendance.text)
    expect(attendanceLines[0]).toBe(ATTENDANCE_KEYS.map((key) => catalogs.en.get(key)).join(','))
    const cells = attendanceLines.slice(1).map((line) => line.split(','))
    for (const line of cells) expect(line[5]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const statusOf = (session: { date: string; start: string }) =>
      cells
        .filter((line) => line[1] === session.date && line[2] === session.start)
        .map((line) => [line[0], line[3], line[4], line[6]].join('|'))
    const statuses: Record<string, string[]> = {
      [s1.id]: ['Żaki|Kowalska|Hania|Usprawiedliwiony', 'Żaki|Kowalski|Kuba|Obecny', 'Żaki|Nowak|Stanislaw|Nieobecny'],
      [s2.id]: ['Żaki|Kowalska|Hania|Obecny', 'Żaki|Kowalski|Kuba|Obecny', 'Żaki|Nowak|Stanislaw|'],
    }
    expect(statusOf(at(first))).toEqual(statuses[first.id])
    expect(statusOf(at(second))).toEqual(statuses[second.id])
    // The planned sparring lists the roster unmarked; the cancelled match is not on the list.
    expect(statusOf({ date: addDays(today, 4), start: '10:00' })).toEqual([
      'Żaki|Kowalska|Hania|',
      'Żaki|Kowalski|Kuba|',
      'Żaki|Nowak|Stanislaw|',
    ])
    expect(statusOf({ date: addDays(today, 3), start: '10:00' })).toEqual([])
    expect(cells).toHaveLength(9)

    // --- Who may export: another group's coach and the other section's coordinator 404, a member 403 ---
    for (const token of [family.instructor.token, family.poolCoordinator.token]) {
      for (const kind of ['schedule', 'attendance'] as const) {
        const refused = await exportCsv(request, token, kind, period)
        expect(refused.status, refused.text).toBe(404)
        expect(JSON.parse(refused.text)).toMatchObject({ code: 'report_group_not_found' })
      }
    }
    const pool = await exportCsv(request, family.instructor.token, 'schedule', { ...period, groupId: family.poolGroup })
    expect(pool.status, pool.text).toBe(200)
    expect(linesOf(pool.text).slice(1)).toHaveLength(1)
    const member = await exportCsv(request, family.guardian.token, 'schedule', period)
    expect(member.status, member.text).toBe(403)
    const unknown = await exportCsv(request, admin, 'attendance', { ...period, groupId: randomUUID() })
    expect(unknown.status, unknown.text).toBe(404)
    for (const bad of [
      { from: period.to, to: period.from },
      { from: addDays(today, -400), to: today },
      { from: '2026-02-30', to: today },
    ]) {
      const refused = await exportCsv(request, admin, 'schedule', { ...period, ...bad })
      expect(refused.status, refused.text).toBe(400)
      expect(JSON.parse(refused.text)).toMatchObject({ code: 'report_period_invalid' })
    }

    // --- The page: from the group page, the team preselected, the current month, the schedule downloads ---
    page.setDefaultTimeout(30_000)
    const coordinator = family.academyCoordinator
    await signInBrowser(page, request, club, coordinator.userId, coordinator.email)
    await page.goto(`/club/groups/${family.zaki}`)
    await page.getByTestId('club-group-pzpn').click()
    await expect(page).toHaveURL(new RegExp(`/club/reports/pzpn\\?groupId=${family.zaki}`))
    await expect(page.getByTestId('club-pzpn-team')).toHaveValue(family.zaki)
    const month = today.slice(0, 7)
    await expect(page.getByTestId('club-pzpn-from')).toHaveValue(`${month}-01`)
    const scheduleLink = page.getByTestId('club-pzpn-schedule')
    await expect(scheduleLink).toHaveAttribute(
      'href',
      new RegExp(`groupId=${family.zaki}&from=${month}-01&to=${month}-`),
    )
    const [download] = await Promise.all([page.waitForEvent('download'), scheduleLink.click()])
    expect(download.suggestedFilename()).toMatch(new RegExp(`^pzpn-schedule-${month}-01-${month}-\\d{2}\\.csv$`))
    // An inverted period disables both downloads and says why.
    await page.getByTestId('club-pzpn-from').fill(addDays(today, 40))
    await expect(page.getByTestId('club-pzpn-period-invalid')).toBeVisible()
    await expect(page.getByTestId('club-pzpn-schedule')).toBeDisabled()
    await expect(page.getByTestId('club-pzpn-attendance')).toBeDisabled()
  } finally {
    await club.cleanup()
  }
})
