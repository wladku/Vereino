import { expect, type APIRequestContext, test } from '@playwright/test'
import { addDays, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, createClub, createPerson } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import {
  type CodedError,
  phoneRental,
  postEntryBan,
  postRental,
  rentalAction,
  rentalPitch,
} from '../_fixtures/facilities'
import { signedInStaff } from '../_fixtures/groups'

// Issue #126 (E08-S06), facilities spec REQ-016, TEST-026: the facility log, incidents and entry bans. The day's log is
// opened with the condition before ("Facility opened"), records the groups present (a rental of the place with its head
// count and adult supervisor) and is closed with the condition after; a second log for the day answers 409
// `log_exists`, a later day 422 `log_date_invalid`; the administrator still edits a log days later (the attendant's
// 403 `log_edit_closed` and place scope are the second test). An incident with a 5-character description answers 422, a valid one
// is listed with its decrypted description and can never be deleted; a ban linked to the incident blocks the renter's
// rental with 409 `entry_ban_active` until it is revoked; a second revocation answers 409. Staff without
// `facilities.log.write` cannot write the log. The no-show after the start is covered by TEST-023 and the unit tests.
test.describe.configure({ timeout: 300_000 })

type List<T> = { items?: T[] }

type LogItem = {
  id: string
  placeId: string
  placeName: string | null
  logDate: string
  operatorName: string | null
  openedAt: string | null
  closedAt: string | null
  conditionBefore: string | null
  conditionAfter: string | null
  groupsPresent: Array<{ rentalId: string | null; headcount: number; adultSupervisorPresent: boolean }>
  remarks: string | null
  updatedAt: string
}

type IncidentItem = {
  id: string
  photos?: Array<{ id: string; fileName: string; mimeType: string; url: string }>
  placeName: string | null
  kind: string
  description: string | null
  involved: string | null
  actionTaken: string[]
  threadId: string | null
  reportedByName: string | null
  updatedAt: string
}

type BanItem = {
  id: string
  subjectName: string | null
  issuedByName: string | null
  incidentId: string | null
  revokedAt: string | null
  updatedAt: string
}

type Saved = CodedError & { id?: string; updatedAt?: string }

/** A 1×1 PNG: the smallest real image the byte check accepts. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

/** `POST /api/facilities/incidents/{id}/photos` (multipart `file`). */
async function uploadPhoto(
  request: APIRequestContext,
  token: string,
  incidentId: string,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<{ status: number; body: (CodedError & { id?: string; url?: string }) | null }> {
  const response = await request.fetch(`/api/facilities/incidents/${incidentId}/photos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    multipart: { file },
    timeout: 60_000,
  })
  return { status: response.status(), body: (await response.json().catch(() => null)) as never }
}

const postLog = (request: APIRequestContext, token: string, data: Record<string, unknown>) =>
  call<Saved>(request, 'POST', '/api/facilities/logs', token, { data })

const putLog = (request: APIRequestContext, token: string, data: Record<string, unknown>, lockToken: string) =>
  call<Saved>(request, 'PUT', '/api/facilities/logs', token, { data, headers: { [OPTIMISTIC_LOCK_HEADER]: lockToken } })

async function listOf<T>(request: APIRequestContext, token: string, path: string): Promise<T[]> {
  const result = await call<List<T>>(request, 'GET', path, token)
  expect(result.status, `GET ${path} ${JSON.stringify(result.body)}`).toBe(200)
  return result.body?.items ?? []
}

test('TEST-026 log, incidents and bans: open and close the day, report, ban, revoke', async ({ request }) => {
  const club = await createClub(request, 'test-026-log')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const today = calendarDate()

    // The day at the pitch before anything is written: no log yet.
    const before = await call<{ date: string; place: { id: string } | null; log: unknown }>(
      request,
      'GET',
      `/api/facilities/today?placeId=${setup.pitch}`,
      admin,
    )
    expect(before.status, JSON.stringify(before.body)).toBe(200)
    expect(before.body).toMatchObject({ date: today, place: { id: setup.pitch }, log: null })

    // Opening needs the condition before (422), then "Facility opened {time}" is a log entry.
    const openedAt = new Date().toISOString()
    const bare = await postLog(request, admin, { placeId: setup.pitch, logDate: today, openedAt })
    expect(bare.status, JSON.stringify(bare.body)).toBe(422)
    expect(bare.body?.code).toBe('log_condition_required')
    const opened = await postLog(request, admin, {
      placeId: setup.pitch,
      logDate: today,
      openedAt,
      conditionBefore: 'Murawa sucha, siatki na miejscu',
    })
    expect(opened.status, JSON.stringify(opened.body)).toBe(201)
    const logId = String(opened.body?.id)
    const day = await call<{ log: { id: string; openedAt: string } | null }>(
      request,
      'GET',
      `/api/facilities/today?placeId=${setup.pitch}`,
      admin,
    )
    expect(day.body?.log).toMatchObject({ id: logId, openedAt })

    // One log per place and day; no log for a day that has not begun.
    const second = await postLog(request, admin, { placeId: setup.pitch, logDate: today })
    expect(second.status, JSON.stringify(second.body)).toBe(409)
    expect(second.body?.code).toBe('log_exists')
    const tomorrow = await postLog(request, admin, { placeId: setup.pitch, logDate: addDays(today, 1) })
    expect(tomorrow.status, JSON.stringify(tomorrow.body)).toBe(422)
    expect(tomorrow.body?.code).toBe('log_date_invalid')

    // Today's groups: a rental of the pitch with 12 people and an adult supervisor; an unknown rental and a repeated
    // one are refused (422).
    const rental = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(nextWeekday(addDays(today, 7), 'WE'), '08:00')),
    )
    expect(rental.status, JSON.stringify(rental.body)).toBe(201)
    const rentalId = String(rental.body?.id)
    const group = { rentalId, headcount: 12, adultSupervisorPresent: true }
    let version = String(opened.body?.updatedAt)
    const unknown = await putLog(
      request,
      admin,
      { id: logId, groupsPresent: [{ ...group, rentalId: setup.neighbours }] },
      version,
    )
    expect(unknown.status, JSON.stringify(unknown.body)).toBe(422)
    expect(unknown.body?.code).toBe('facilities_reference_invalid')
    const repeated = await putLog(request, admin, { id: logId, groupsPresent: [group, group] }, version)
    expect(repeated.status, JSON.stringify(repeated.body)).toBe(422)
    expect(repeated.body?.code).toBe('log_groups_invalid')
    const groups = await putLog(request, admin, { id: logId, groupsPresent: [group] }, version)
    expect(groups.status, JSON.stringify(groups.body)).toBe(200)
    version = String(groups.body?.updatedAt)

    // Closing needs the condition after; then the log lists both conditions, the groups and the decrypted remarks.
    const closedAt = new Date().toISOString()
    const closeBare = await putLog(request, admin, { id: logId, closedAt }, version)
    expect(closeBare.status, JSON.stringify(closeBare.body)).toBe(422)
    expect(closeBare.body?.code).toBe('log_condition_required')
    const closed = await putLog(
      request,
      admin,
      { id: logId, closedAt, conditionAfter: 'Rozdarta siatka w bramce', remarks: 'Brak oświetlenia na sektorze B' },
      version,
    )
    expect(closed.status, JSON.stringify(closed.body)).toBe(200)
    const logs = await listOf<LogItem>(request, admin, `/api/facilities/logs?placeId=${setup.pitch}`)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      id: logId,
      logDate: today,
      openedAt,
      closedAt,
      conditionBefore: 'Murawa sucha, siatki na miejscu',
      conditionAfter: 'Rozdarta siatka w bramce',
      remarks: 'Brak oświetlenia na sektorze B',
      groupsPresent: [{ rentalId, headcount: 12, adultSupervisorPresent: true }],
    })
    expect(logs[0]?.placeName).not.toBeNull()
    expect(logs[0]?.operatorName).not.toBeNull()

    // A log three days back: the administrator still writes and edits it after the next day has ended.
    const old = await postLog(request, admin, {
      placeId: setup.pitch,
      logDate: addDays(today, -3),
      openedAt: zoneInstant(addDays(today, -3), '15:00'),
      conditionBefore: 'Bez uwag',
    })
    expect(old.status, JSON.stringify(old.body)).toBe(201)
    const oldEdit = await putLog(
      request,
      admin,
      { id: String(old.body?.id), remarks: 'Uzupełnione przez administratora' },
      String(old.body?.updatedAt),
    )
    expect(oldEdit.status, JSON.stringify(oldEdit.body)).toBe(200)

    // Staff without `facilities.log.write` (a coach) cannot write the log or report incidents.
    const coach = await signedInStaff(request, club, { firstName: 'Wojtek', lastName: 'Trener', role: 'coach' })
    const coachLog = await postLog(request, coach.token, { placeId: setup.pitch, logDate: addDays(today, -1) })
    expect(coachLog.status, JSON.stringify(coachLog.body)).toBe(403)
    // The coach reads the day with `facilities.view`, but not the log (its conditions and remarks).
    const coachDay = await call<{ place: { id: string } | null; log: unknown }>(
      request,
      'GET',
      `/api/facilities/today?placeId=${setup.pitch}`,
      coach.token,
    )
    expect(coachDay.status, JSON.stringify(coachDay.body)).toBe(200)
    expect(coachDay.body).toMatchObject({ place: { id: setup.pitch }, log: null })

    // Given an incident with a 5-character description, when saved, then 422; one in the future, 422.
    const incident = {
      placeId: setup.pitch,
      occurredAt: new Date(Date.now() - 600_000).toISOString(),
      kind: 'damage',
      description: 'Zawodnik KS Sąsiedzi wyrwał siatkę z bramki po końcowym gwizdku.',
      involved: 'Kapitan drużyny KS Sąsiedzi',
      actionTaken: ['warning_given', 'none', 'owner_notified'],
    }
    const short = await call<Saved>(request, 'POST', '/api/facilities/incidents', admin, {
      data: { ...incident, description: 'Krótk' },
    })
    expect(short.status, JSON.stringify(short.body)).toBe(422)
    expect(short.body?.code).toBe('incident_description_length')
    const future = await call<Saved>(request, 'POST', '/api/facilities/incidents', admin, {
      data: { ...incident, occurredAt: new Date(Date.now() + 3_600_000).toISOString() },
    })
    expect(future.status, JSON.stringify(future.body)).toBe(422)
    expect(future.body?.code).toBe('incident_time_future')
    const reported = await call<Saved>(request, 'POST', '/api/facilities/incidents', admin, { data: incident })
    expect(reported.status, JSON.stringify(reported.body)).toBe(201)
    const incidentId = String(reported.body?.id)
    const coachIncident = await call<Saved>(request, 'POST', '/api/facilities/incidents', coach.token, {
      data: incident,
    })
    expect(coachIncident.status, JSON.stringify(coachIncident.body)).toBe(403)

    // The incident is listed with its decrypted description, the people involved, the ordered actions and the
    // reporter; the administrator links a case and records a further action.
    const incidents = await listOf<IncidentItem>(request, admin, `/api/facilities/incidents?placeId=${setup.pitch}`)
    expect(incidents).toHaveLength(1)
    expect(incidents[0]).toMatchObject({
      id: incidentId,
      kind: 'damage',
      description: incident.description,
      involved: incident.involved,
      actionTaken: ['warning_given', 'owner_notified'],
      threadId: null,
    })
    expect(incidents[0]?.reportedByName).not.toBeNull()
    const caseId = '3f0b8c8e-1f5e-4d65-9f6a-2c4f8f1e0b11'
    const linked = await call<Saved>(request, 'PUT', '/api/facilities/incidents', admin, {
      data: {
        id: incidentId,
        threadId: caseId,
        actionTaken: ['warning_given', 'owner_notified', 'entry_ban_requested'],
      },
      headers: { [OPTIMISTIC_LOCK_HEADER]: incidents[0]?.updatedAt ?? '' },
    })
    expect(linked.status, JSON.stringify(linked.body)).toBe(200)

    // Given an incident, when anyone tries to delete it, then it cannot be deleted.
    const deleted = await call<Saved>(request, 'DELETE', `/api/facilities/incidents?id=${incidentId}`, admin)
    expect([404, 405]).toContain(deleted.status)
    const after = await listOf<IncidentItem>(request, admin, `/api/facilities/incidents?placeId=${setup.pitch}`)
    expect(after.map((item) => item.id)).toEqual([incidentId])
    expect(after[0]).toMatchObject({ threadId: caseId })

    // A ban follows the incident (an unknown incident is refused); a rental for the banned renter answers 409
    // `entry_ban_active` until the ban is revoked; a revoked ban cannot be revoked again.
    const banBody = {
      placeId: setup.pitch,
      subjectType: 'institution',
      subjectId: setup.banned,
      startsOn: today,
      reason: 'Zniszczenie bramki',
    }
    const strayIncident = await postEntryBan(request, admin, { ...banBody, incidentId: caseId })
    expect(strayIncident.status, JSON.stringify(strayIncident.body)).toBe(422)
    expect(strayIncident.body?.code).toBe('facilities_reference_invalid')
    const ban = await postEntryBan(request, admin, { ...banBody, incidentId })
    expect(ban.status, JSON.stringify(ban.body)).toBe(201)
    const thursday = nextWeekday(addDays(today, 7), 'TH')
    const banned = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.banned, zoneInstant(thursday, '08:00')),
    )
    expect(banned.status, JSON.stringify(banned.body)).toBe(409)
    expect(banned.body?.code).toBe('entry_ban_active')
    const active = await listOf<BanItem>(request, admin, '/api/facilities/entry-bans?state=active')
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({ id: ban.body?.id, subjectName: 'FC Zakazani', incidentId, revokedAt: null })
    expect(active[0]?.issuedByName).not.toBeNull()

    const revoke = (lockToken: string) =>
      call<CodedError & { revokedAt?: string; updatedAt?: string }>(
        request,
        'POST',
        `/api/facilities/entry-bans/${String(ban.body?.id)}/revoke`,
        admin,
        { data: {}, headers: { [OPTIMISTIC_LOCK_HEADER]: lockToken } },
      )
    const revoked = await revoke(active[0]?.updatedAt ?? '')
    expect(revoked.status, JSON.stringify(revoked.body)).toBe(200)
    expect(revoked.body?.revokedAt).toBeTruthy()
    const twice = await revoke(String(revoked.body?.updatedAt))
    expect(twice.status, JSON.stringify(twice.body)).toBe(409)
    expect(twice.body?.code).toBe('entry_ban_revoked')
    expect(await listOf<BanItem>(request, admin, '/api/facilities/entry-bans?state=active')).toHaveLength(0)
    expect(await listOf<BanItem>(request, admin, '/api/facilities/entry-bans?state=revoked')).toHaveLength(1)
    const allowed = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.banned, zoneInstant(thursday, '08:00')),
    )
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(201)
  } finally {
    await club.cleanup()
  }
})

// The facility attendant (#126; club spec *Users, Permissions, and Scope*, `place_ids`): a `facility_operator`
// assignment names a live place (422 otherwise) and grants `vereino_facility_operator`; the attendant then reads,
// writes and lists the day, the log, incidents and rentals of the place and its descendants only (403 for another
// place), lists the bans of the place but does not issue one, and edits a log until the end of the next day — after
// that 403 `log_edit_closed`, while the administrator still edits it.
test('TEST-026 the facility attendant: place scope, log edit window, rentals and bans', async ({ request }) => {
  const club = await createClub(request, 'test-026-attendant')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const today = calendarDate()
    const pitchHalf = await createStructure(request, admin, 'places', {
      name: 'Boisko A – połowa',
      kind: 'pitch',
      capacityGroups: 1,
      parentPlaceId: setup.pitch,
    })
    const hall = await createStructure(request, admin, 'places', { name: 'Hala', kind: 'hall', capacityGroups: 2 })

    // An attendant's assignment names a place of the club, and only an attendant's does.
    const staffPerson = await createPerson(request, admin, { firstName: 'Bez', lastName: 'Miejsca', birthDate: '1990-01-01' })
    const assign = (data: Record<string, unknown>) =>
      call<CodedError>(request, 'POST', '/api/people/role-assignments', admin, {
        data: { personId: staffPerson, validFrom: today, ...data },
      })
    const noPlace = await assign({ role: 'facility_operator' })
    expect(noPlace.status, JSON.stringify(noPlace.body)).toBe(422)
    expect(noPlace.body?.code).toBe('role_scope_required')
    const strayPlace = await assign({ role: 'facility_operator', placeId: setup.academy })
    expect(strayPlace.status, JSON.stringify(strayPlace.body)).toBe(422)
    expect(strayPlace.body?.code).toBe('role_place_invalid')
    const coachWithPlace = await assign({ role: 'coach', placeId: setup.pitch })
    expect(coachWithPlace.status, JSON.stringify(coachWithPlace.body)).toBe(422)
    expect(coachWithPlace.body?.code).toBe('role_scope_unexpected')

    const attendant = await signedInStaff(request, club, {
      firstName: 'Adam',
      lastName: 'Animator',
      role: 'facility_operator',
      placeId: setup.pitch,
    })
    const assignments = await listOf<{ role: string; placeId: string | null }>(
      request,
      admin,
      `/api/people/role-assignments?personId=${attendant.personId}`,
    )
    expect(assignments).toEqual([expect.objectContaining({ role: 'facility_operator', placeId: setup.pitch })])

    // Today and the calendar: the pitch and its descendant, never the hall.
    const day = await call<{ places: Array<{ id: string }>; place: { id: string } | null }>(
      request,
      'GET',
      `/api/facilities/today?placeId=${pitchHalf}`,
      attendant.token,
    )
    expect(day.status, JSON.stringify(day.body)).toBe(200)
    expect(day.body?.place?.id).toBe(pitchHalf)
    expect(day.body?.places.map((place) => place.id).sort()).toEqual([setup.pitch, pitchHalf].sort())
    const hallDay = await call(request, 'GET', `/api/facilities/today?placeId=${hall}`, attendant.token)
    expect(hallDay.status, JSON.stringify(hallDay.body)).toBe(403)
    const range = `from=${encodeURIComponent(zoneInstant(today, '00:00'))}&to=${encodeURIComponent(zoneInstant(addDays(today, 7), '00:00'))}`
    const calendar = await call<{ places: Array<{ id: string }> }>(
      request,
      'GET',
      `/api/facilities/calendar?${range}`,
      attendant.token,
    )
    expect(calendar.status, JSON.stringify(calendar.body)).toBe(200)
    expect(calendar.body?.places.map((place) => place.id).sort()).toEqual([setup.pitch, pitchHalf].sort())
    const hallCalendar = await call(request, 'GET', `/api/facilities/calendar?${range}&placeId=${hall}`, attendant.token)
    expect(hallCalendar.status, JSON.stringify(hallCalendar.body)).toBe(403)

    // The log: written at the descendant, refused at the hall; the list holds the attendant's places only.
    const opened = await postLog(request, attendant.token, {
      placeId: pitchHalf,
      logDate: today,
      openedAt: new Date().toISOString(),
      conditionBefore: 'Linie widoczne',
    })
    expect(opened.status, JSON.stringify(opened.body)).toBe(201)
    const hallLog = await postLog(request, attendant.token, { placeId: hall, logDate: today })
    expect(hallLog.status, JSON.stringify(hallLog.body)).toBe(403)
    const adminHallLog = await postLog(request, admin, { placeId: hall, logDate: today })
    expect(adminHallLog.status, JSON.stringify(adminHallLog.body)).toBe(201)
    const attendantLogs = await listOf<LogItem>(request, attendant.token, '/api/facilities/logs')
    expect(attendantLogs.map((log) => log.placeId)).toEqual([pitchHalf])

    // The edit window: yesterday's log is still the attendant's; the one of the day before is closed (403), and the
    // administrator still edits it.
    const pastLog = async (daysBack: number) => {
      const created = await postLog(request, admin, {
        placeId: setup.pitch,
        logDate: addDays(today, -daysBack),
        openedAt: zoneInstant(addDays(today, -daysBack), '15:00'),
        conditionBefore: 'Bez uwag',
      })
      expect(created.status, JSON.stringify(created.body)).toBe(201)
      return { id: String(created.body?.id), updatedAt: String(created.body?.updatedAt) }
    }
    const yesterday = await pastLog(1)
    const yesterdayEdit = await putLog(request, attendant.token, { id: yesterday.id, remarks: 'Dopisane' }, yesterday.updatedAt)
    expect(yesterdayEdit.status, JSON.stringify(yesterdayEdit.body)).toBe(200)
    const older = await pastLog(2)
    const closedEdit = await putLog(request, attendant.token, { id: older.id, remarks: 'Za późno' }, older.updatedAt)
    expect(closedEdit.status, JSON.stringify(closedEdit.body)).toBe(403)
    expect(closedEdit.body?.code).toBe('log_edit_closed')
    const adminEdit = await putLog(request, admin, { id: older.id, remarks: 'Uzupełnione' }, older.updatedAt)
    expect(adminEdit.status, JSON.stringify(adminEdit.body)).toBe(200)

    // Incidents: reported and changed at the attendant's places, refused at the hall.
    const incident = {
      placeId: pitchHalf,
      occurredAt: new Date(Date.now() - 600_000).toISOString(),
      kind: 'rules_violation',
      description: 'Grupa weszła na boisko bez opiekuna i nie opuściła go po wezwaniu.',
      actionTaken: ['warning_given'],
    }
    const reported = await call<Saved>(request, 'POST', '/api/facilities/incidents', attendant.token, { data: incident })
    expect(reported.status, JSON.stringify(reported.body)).toBe(201)
    const hallIncident = await call<Saved>(request, 'POST', '/api/facilities/incidents', attendant.token, {
      data: { ...incident, placeId: hall },
    })
    expect(hallIncident.status, JSON.stringify(hallIncident.body)).toBe(403)
    const listed = await listOf<IncidentItem>(request, attendant.token, '/api/facilities/incidents')
    expect(listed.map((item) => item.id)).toEqual([String(reported.body?.id)])
    const changed = await call<Saved>(request, 'PUT', '/api/facilities/incidents', attendant.token, {
      data: { id: String(reported.body?.id), actionTaken: ['warning_given', 'entry_ban_requested'] },
      headers: { [OPTIMISTIC_LOCK_HEADER]: listed[0]?.updatedAt ?? '' },
    })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)

    // Photos: the attendant adds a PNG and reads it back; a file that is not an image is refused by its bytes (422),
    // a sixth photo too; the coach (no log feature) neither adds nor reads one. A photo is never deleted.
    const reportedId = String(reported.body?.id)
    const photo = await uploadPhoto(request, attendant.token, reportedId, {
      name: 'bramka.png',
      mimeType: 'image/png',
      buffer: PNG,
    })
    expect(photo.status, JSON.stringify(photo.body)).toBe(201)
    const fake = await uploadPhoto(request, attendant.token, reportedId, {
      name: 'notatka.png',
      mimeType: 'image/png',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    })
    expect(fake.status, JSON.stringify(fake.body)).toBe(422)
    expect(fake.body?.code).toBe('incident_photo_format_unsupported')
    for (let index = 0; index < 4; index += 1) {
      const more = await uploadPhoto(request, attendant.token, reportedId, {
        name: `zdjecie-${index}.png`,
        mimeType: 'image/png',
        buffer: PNG,
      })
      expect(more.status, JSON.stringify(more.body)).toBe(201)
    }
    const sixth = await uploadPhoto(request, attendant.token, reportedId, {
      name: 'szoste.png',
      mimeType: 'image/png',
      buffer: PNG,
    })
    expect(sixth.status, JSON.stringify(sixth.body)).toBe(422)
    expect(sixth.body?.code).toBe('incident_photos_limit_reached')
    const withPhotos = await listOf<IncidentItem>(request, attendant.token, '/api/facilities/incidents')
    expect(withPhotos[0]?.photos).toHaveLength(5)
    expect(withPhotos[0]?.photos?.[0]).toMatchObject({ id: photo.body?.id, fileName: 'bramka.png', mimeType: 'image/png' })
    const read = await request.fetch(String(photo.body?.url), { headers: { Authorization: `Bearer ${attendant.token}` } })
    expect(read.status()).toBe(200)
    expect(read.headers()['content-type']).toBe('image/png')
    expect(Buffer.from(await read.body()).equals(PNG)).toBe(true)
    const coach = await signedInStaff(request, club, { firstName: 'Cezary', lastName: 'Trener', role: 'coach' })
    const coachRead = await request.fetch(String(photo.body?.url), { headers: { Authorization: `Bearer ${coach.token}` } })
    expect(coachRead.status()).toBe(403)
    const coachUpload = await uploadPhoto(request, coach.token, reportedId, {
      name: 'x.png',
      mimeType: 'image/png',
      buffer: PNG,
    })
    expect(coachUpload.status, JSON.stringify(coachUpload.body)).toBe(403)
    const deletePhoto = await request.fetch(String(photo.body?.url), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${attendant.token}` },
    })
    expect([404, 405]).toContain(deletePhoto.status())

    // Rentals: entered and confirmed at the pitch after a phone call, refused at the hall; a no-show before the start
    // is refused.
    const wednesday = nextWeekday(addDays(today, 7), 'WE')
    const rental = await postRental(
      request,
      attendant.token,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(wednesday, '08:00')),
    )
    expect(rental.status, JSON.stringify(rental.body)).toBe(201)
    const rentalId = String(rental.body?.id)
    const confirmed = await rentalAction(request, attendant.token, rentalId, 'confirm')
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
    const early = await rentalAction(request, attendant.token, rentalId, 'no-show')
    expect(early.status, JSON.stringify(early.body)).toBe(409)
    expect(early.body?.code).toBe('rental_not_started')
    const hallRental = await postRental(
      request,
      attendant.token,
      phoneRental(hall, setup.neighbours, zoneInstant(wednesday, '10:00')),
    )
    expect(hallRental.status, JSON.stringify(hallRental.body)).toBe(403)

    // Bans: the administrator issues one at the pitch; the attendant lists it, cannot issue one, and a rental they
    // enter for the banned renter answers 409 `entry_ban_active`.
    const banBody = { placeId: setup.pitch, subjectType: 'institution', subjectId: setup.banned, startsOn: today, reason: 'Zniszczenie' }
    const attendantBan = await postEntryBan(request, attendant.token, banBody)
    expect(attendantBan.status, JSON.stringify(attendantBan.body)).toBe(403)
    const ban = await postEntryBan(request, admin, banBody)
    expect(ban.status, JSON.stringify(ban.body)).toBe(201)
    const bans = await listOf<BanItem>(request, attendant.token, '/api/facilities/entry-bans?state=active')
    expect(bans.map((item) => item.id)).toEqual([String(ban.body?.id)])
    const bannedRental = await postRental(
      request,
      attendant.token,
      phoneRental(setup.pitch, setup.banned, zoneInstant(nextWeekday(addDays(today, 7), 'TH'), '08:00')),
    )
    expect(bannedRental.status, JSON.stringify(bannedRental.body)).toBe(409)
    expect(bannedRental.body?.code).toBe('entry_ban_active')
  } finally {
    await club.cleanup()
  }
})
