// Activities records of the cross-club isolation guard (#628): a weekly training series of Żaki with its sessions (one
// moved so it has started, for the check-off), the member's absence declaration, a group declaration policy, a club
// event with a group part and a poster, an external team, and a personal declaration link of the guardian (the club's
// public page comes from the club_core seed; without it this seed publishes one).
import { expect } from '@playwright/test'
import { addDays, safeDay, weekdayOf, zoneInstant } from '../activities'
import { startNow } from '../attendance'
import { uniqueSuffix } from '../club'
import { requestLink, tokenFromEmail } from '../declaration-links'
import { capturedTo, type CapturedMessage } from '../messaging'
import { publish } from '../publication'
import type { ModuleSeed } from './seed'

type Created = { id?: string; updatedAt?: string }

export const seedActivities: ModuleSeed = async ({ request, seeded, api, admin }) => {
  const { refs } = seeded
  if (!refs.clubSlug) {
    refs.clubSlug = `i628-act-${seeded.label.toLowerCase()}-${uniqueSuffix()}`
    await publish(request, admin, refs.clubSlug, [])
    seeded.markers.push(refs.clubSlug)
  }

  // The series: weekly from a day at least two days ahead, four sessions, coached by the coach of Żaki.
  const day = safeDay()
  refs.activityDay = day
  const until = addDays(day, 21).replace(/-/g, '')
  const series = await api<Created>('POST', '/api/activities/activities', {
    data: {
      groupId: refs.group,
      name: 'Trening Żaków',
      type: 'training',
      placeId: refs.place,
      coachPersonId: refs.coachPerson,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=${weekdayOf(day)};UNTIL=${until}`,
      startsOn: day,
      startTime: '17:00',
      endTime: '18:30',
    },
    status: 201,
  })
  refs.activity = String(series.body?.id)
  const sessions = await api<{ items?: { id: string; occurrenceDate: string }[] }>(
    'GET',
    `/api/activities/occurrences?pageSize=50&sortField=occurrenceDate&sortDir=asc&activityId=${refs.activity}`,
  )
  const items = sessions.body?.items ?? []
  expect(items.length, 'the series has sessions').toBeGreaterThanOrEqual(3)
  refs.occurrence = items[0].id
  refs.startedOccurrence = items[1].id
  await startNow(request, seeded.club, refs.startedOccurrence)

  // The member's absence (a training takes absences only).
  const declared = await api<Created>('POST', '/api/activities/attendance/declare', {
    token: seeded.tokens.member,
    data: { occurrenceId: refs.occurrence, personId: refs.memberPerson, declared: 'no' },
    status: [200, 201],
  })
  refs.attendance = String(declared.body?.id)

  // A declaration policy of the group.
  const policy = await api<Created>('POST', '/api/activities/attendance-policies', {
    data: {
      scope: 'group',
      groupId: refs.group,
      minorDeclarationMode: 'guardian_confirm',
      confirmTimeoutHours: 24,
      defaultAfterTimeout: 'declared',
    },
    status: 201,
  })
  refs.attendancePolicy = String(policy.body?.id)

  // An external team (the opponent of a match, the visitor of a part).
  const team = await api<Created>('POST', '/api/groups/external-teams', {
    data: { name: 'Wisła Liszki', clubName: 'Wisła Liszki' },
    status: 201,
  })
  refs.opponentTeam = String(team.body?.id)

  // A club event of the academy with a part for Orliki the day after the first session, and its poster.
  const event = await api<Created>('POST', '/api/activities/club-events', {
    data: { name: 'Turniej Akademii', sectionId: refs.section, placeId: refs.place },
    status: 201,
  })
  refs.activitiesClubEvent = String(event.body?.id)
  const partDay = addDays(day, 1)
  const part = await api<Created & { occurrenceId?: string }>(
    'POST',
    `/api/activities/club-events/${refs.activitiesClubEvent}/parts`,
    {
      data: {
        title: 'Turniej Orlików',
        groupId: refs.group2,
        startsAt: zoneInstant(partDay, '10:00'),
        endsAt: zoneInstant(partDay, '12:00'),
      },
      status: 201,
    },
  )
  refs.activitiesClubEventPart = String(part.body?.id)
  const poster = await request.fetch(
    `${process.env.BASE_URL ?? ''}/api/activities/club-events/${refs.activitiesClubEvent}/files`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin}` },
      multipart: {
        kind: 'poster',
        file: {
          name: 'poster.png',
          mimeType: 'image/png',
          buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'base64',
          ),
        },
      },
    },
  )
  const posterBody = (await poster.json().catch(() => null)) as Created | null
  seeded.responses.push(posterBody)
  expect(poster.status(), `club ${seeded.label}: poster upload ${JSON.stringify(posterBody)}`).toBe(201)
  refs.activitiesClubEventFile = String(posterBody?.id)

  // A free slot for the create probes: two days after the first session, early in the morning.
  const probeDay = addDays(day, 2)
  refs.probeDay = probeDay
  refs.probeStartsAt = zoneInstant(probeDay, '06:00')
  refs.probeEndsAt = zoneInstant(probeDay, '07:00')
  // The calendar range of the read probes: today to 30 days ahead (every session above).
  refs.calendarTo = addDays(refs.today, 30)

  // The guardian's personal declaration link for the first session (the e-mail of the link request).
  const guardianEmail = seeded.markers.find((marker) => marker.startsWith('guardian-'))
  expect(guardianEmail, 'the guardian has an e-mail address').toBeTruthy()
  const asked = await requestLink(String(guardianEmail), refs.clubSlug, refs.occurrence)
  expect(asked.status, asked.text).toBe(202)
  // The guardian also got the move notice of the started session: wait for the e-mail that carries a link.
  let mail: CapturedMessage | undefined
  await expect
    .poll(
      () => {
        mail = capturedTo([String(guardianEmail)]).find((message) =>
          message.links.some((href) => href.includes('/club/d/')),
        )
        return Boolean(mail)
      },
      { timeout: 60_000, message: `club ${seeded.label}: the declaration link e-mail` },
    )
    .toBe(true)
  refs.declarationToken = tokenFromEmail(mail as CapturedMessage)

  // The lock tokens of club A's records the mixed probes change (read last: nothing above changes them afterwards).
  const activity = await api<Created>('GET', `/api/activities/activities/${refs.activity}`)
  refs.activityUpdatedAt = String(activity.body?.updatedAt)
  const occurrence = await api<Created>('GET', `/api/activities/occurrences/${refs.occurrence}`)
  refs.occurrenceUpdatedAt = String(occurrence.body?.updatedAt)
  const started = await api<Created>('GET', `/api/activities/occurrences/${refs.startedOccurrence}`)
  refs.startedOccurrenceUpdatedAt = String(started.body?.updatedAt)
  const clubEvent = await api<Created & { parts?: { id: string; updatedAt: string }[] }>(
    'GET',
    `/api/activities/club-events/${refs.activitiesClubEvent}`,
  )
  refs.activitiesClubEventUpdatedAt = String(clubEvent.body?.updatedAt)
  const policies = await api<{ items?: { id: string; updatedAt: string }[] }>(
    'GET',
    `/api/activities/attendance-policies?pageSize=100&groupId=${refs.group}`,
  )
  refs.attendancePolicyUpdatedAt = String(
    policies.body?.items?.find((item) => item.id === refs.attendancePolicy)?.updatedAt,
  )
}
