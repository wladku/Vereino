import { expect, test, type APIRequestContext } from '@playwright/test'
import { addDays, cancelOccurrence, getOccurrence, zoneInstant } from '../_fixtures/activities'
import { calendarDate, call, createClub, uniqueSuffix, type Club } from '../_fixtures/club'
import { clubEventId, examplePlaces, makePublic, partIds } from '../_fixtures/club-events'
import { create } from '../_fixtures/club-structure'
import { addMembership, createGroup, getGroup, signedInStaff, updateGroup } from '../_fixtures/groups'
import { png, publicGet, publish, putSectionPublic, upload, type PublicationBlock } from '../_fixtures/publication'

// Club events spec TEST-T09 (REQ-T09, REQ-T08 public files, DD-T11, DD-T12, AC-T09, AC-T08 public part; #381): the
// tournament page `GET /api/club_core/public/{clubSlug}/events/{eventSlug}` and its files. Club A publishes its page
// and the `events` block; "GWIAZDA CUP 2026" is public with a poster and two funder logos, four days of parts at the
// external hall: a part of the public Orlik group (coach Marek, three visiting teams with a contact), a part of the
// non-public Rezerwy group, the open seniors' part and a cancelled Orlik part. The page shows the poster, the place
// with its map link, the four days, our team with its section for the public group and the club's name for the
// non-public group, no club team for the open part, the visiting teams' names only and the funders; no response
// carries a person's name, a contact or the cancellation reason. An unpublished event, an event without parts and club
// B's event slug under club A answer 404 `public_club_event_not_found`; the poster answers 200 with `nosniff`, a file
// of the unpublished event 404; with the `events` block off the page answers 404 `public_events_disabled` and the
// poster 404.
test.describe.configure({ timeout: 300_000 })

type Part = {
  title: string
  category: string | null
  type: string
  date: string
  startTime: string
  endTime: string
  cancelled: boolean
  ourTeam: { groupName: string; section: { name: string; slug: string } } | { clubName: string } | null
  visitingTeams: { name: string; clubName: string | null }[]
}

type ClubEventPage = {
  club: { name: string; slug: string; nav: { events: boolean } }
  event: {
    name: string
    slug: string
    status: string
    dateFrom: string
    dateTo: string
    description: string | null
    place: { name: string; address: string | null; mapUrl: string | null } | null
    poster: { url: string } | null
    funders: { name: string; logoUrl: string }[]
    days: { date: string; parts: Part[] }[]
  }
}

const BLOCKS: PublicationBlock[] = ['description_schedule', 'events']

async function externalTeam(request: APIRequestContext, token: string, name: string, contact: string) {
  const team = await call<{ id?: string }>(request, 'POST', '/api/groups/external-teams', token, {
    data: { name, clubName: `${name} KS`, contact },
  })
  expect(team.status, JSON.stringify(team.body)).toBe(201)
  return String(team.body?.id)
}

async function makeGroupPublic(request: APIRequestContext, token: string, id: string) {
  const before = await getGroup(request, token, id)
  const saved = await updateGroup(request, token, { id, isPublic: true }, String(before.body?.updatedAt))
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
}

/** Club B: a published page with a public club event `turniej-b` and one with the slug `gwiazda-cup-2026`. */
async function clubB(request: APIRequestContext, club: Club, slug: string) {
  const admin = club.adminToken
  const section = await create(request, admin, 'sections', { name: 'Sekcja B' })
  const group = await createGroup(request, admin, { sectionId: section, name: 'Drużyna B', kind: 'team' })
  const { hall } = await examplePlaces(request, club)
  const day = addDays(calendarDate(), 9)
  for (const name of ['Turniej B', 'GWIAZDA CUP 2026']) {
    const eventId = await clubEventId(request, admin, { name, sectionId: section, placeId: hall })
    await partIds(request, admin, eventId, {
      title: `${name} – część`,
      groupId: group,
      startsAt: zoneInstant(day, '10:00'),
      endsAt: zoneInstant(day, '12:00'),
    })
    await makePublic(request, admin, eventId)
  }
  await publish(request, admin, slug, BLOCKS, { shortName: 'Klub B' })
}

test('TEST-T09 the public tournament page shows the published club event without person data; other events and files answer 404', async ({
  request,
}) => {
  const club = await createClub(request, 'test-t09-public-club-event')
  const other = await createClub(request, 'test-t09-public-club-event-b')
  try {
    const admin = club.adminToken
    const slug = `tt09-${uniqueSuffix()}`
    const slugB = `tt09b-${uniqueSuffix()}`
    const academy = await create(request, admin, 'sections', { name: 'Akademia piłkarska' })
    expect((await putSectionPublic(request, admin, academy, { isPublic: true, publicSlug: 'akademia' })).status).toBe(
      200,
    )
    const orlik = await createGroup(request, admin, { sectionId: academy, name: 'Orlik młodszy', kind: 'team' })
    const reserves = await createGroup(request, admin, { sectionId: academy, name: 'Rezerwy', kind: 'team' })
    await makeGroupPublic(request, admin, orlik)
    const { hall } = await examplePlaces(request, club)
    const marek = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Trenerski', role: 'coach' })
    await addMembership(request, admin, {
      groupId: orlik,
      personId: marek.personId,
      role: 'coach',
      validFrom: addDays(calendarDate(), -30),
    })
    const teams = [
      await externalTeam(request, admin, 'Wisła Liszki', 'kontakt-wisla@example.org'),
      await externalTeam(request, admin, 'Orzeł Kryspinów', '+48 600 100 200'),
      await externalTeam(request, admin, 'CIS Czernichów', 'trener.cis@example.org'),
    ]

    // The event: four days of parts at the external hall.
    const eventId = await clubEventId(request, admin, {
      name: 'GWIAZDA CUP 2026',
      sectionId: academy,
      placeId: hall,
      description: 'Halowy turniej piłki nożnej dzieci i młodzieży.',
    })
    const day1 = addDays(calendarDate(), 7)
    const day2 = addDays(day1, 1)
    const day3 = addDays(day1, 7)
    const day4 = addDays(day1, 8)
    await partIds(request, admin, eventId, {
      title: 'Turniej Orlika Młodszego',
      categoryLabel: 'Orlik młodszy',
      groupId: orlik,
      coachPersonId: marek.personId,
      startsAt: zoneInstant(day1, '09:00'),
      endsAt: zoneInstant(day1, '14:00'),
      visitingTeamIds: teams,
    })
    await partIds(request, admin, eventId, {
      title: 'Turniej Rezerw',
      groupId: reserves,
      startsAt: zoneInstant(day2, '10:00'),
      endsAt: zoneInstant(day2, '12:00'),
    })
    await partIds(request, admin, eventId, {
      title: 'Turniej Drużyn – Seniorzy (16+)',
      categoryLabel: 'Seniorzy (16+)',
      groupId: null,
      startsAt: zoneInstant(day3, '08:30'),
      endsAt: zoneInstant(day3, '14:00'),
    })
    const cancelledPart = await partIds(request, admin, eventId, {
      title: 'Turniej Orlika – rewanż',
      groupId: orlik,
      startsAt: zoneInstant(day4, '09:00'),
      endsAt: zoneInstant(day4, '11:00'),
    })
    const occurrenceId = String(cancelledPart.occurrenceId)
    const session = await getOccurrence(request, admin, occurrenceId)
    const cancel = await cancelOccurrence(
      request,
      admin,
      occurrenceId,
      'Brak sali – powód wewnętrzny',
      (session.body as { updatedAt?: string } | null)?.updatedAt,
    )
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(200)
    const files = `/api/activities/club-events/${eventId}/files`
    const poster = await upload(request, admin, files, png([200, 40, 40], 32), { kind: 'poster' })
    expect(poster.status, JSON.stringify(poster.body)).toBe(201)
    for (const [index, name] of ['Gmina Liszki', 'Powiat Krakowski'].entries()) {
      const logo = await upload(request, admin, files, png([40, 90 + index * 40, 200], 16), {
        kind: 'funder_logo',
        funderName: name,
      })
      expect(logo.status, JSON.stringify(logo.body)).toBe(201)
    }
    const eventSlug = await makePublic(request, admin, eventId)
    expect(eventSlug).toBe('gwiazda-cup-2026')

    // An unpublished event with a part and a poster; a public event without parts.
    const hiddenId = await clubEventId(request, admin, { name: 'Ukryty turniej', sectionId: academy, placeId: hall })
    await partIds(request, admin, hiddenId, {
      title: 'Ukryta część',
      groupId: orlik,
      startsAt: zoneInstant(day2, '15:00'),
      endsAt: zoneInstant(day2, '16:00'),
    })
    const hiddenPoster = await upload(
      request,
      admin,
      `/api/activities/club-events/${hiddenId}/files`,
      png([1, 2, 3], 8),
      {
        kind: 'poster',
      },
    )
    expect(hiddenPoster.status, JSON.stringify(hiddenPoster.body)).toBe(201)
    const emptyId = await clubEventId(request, admin, { name: 'Pusty turniej', sectionId: academy, placeId: hall })
    await makePublic(request, admin, emptyId)
    await clubB(request, other, slugB)
    await publish(request, admin, slug, BLOCKS, { shortName: 'LKS Gwiazda' })

    // --- The page ---
    const read = await publicGet(request, `/api/club_core/public/${slug}/events/${eventSlug}`)
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(read.headers['cache-control']).toContain('public')
    const page = read.body as unknown as ClubEventPage
    expect(page.club).toMatchObject({ name: 'LKS Gwiazda', slug, nav: { events: true } })
    expect(page.event).toMatchObject({
      name: 'GWIAZDA CUP 2026',
      slug: 'gwiazda-cup-2026',
      status: 'planned',
      dateFrom: day1,
      dateTo: day4,
      description: 'Halowy turniej piłki nożnej dzieci i młodzieży.',
      place: {
        name: 'Hala sportowa w Liszkach',
        address: 'ul. Szkolna 50, Liszki',
        mapUrl: expect.stringContaining('openstreetmap.org'),
      },
      poster: { url: `/api/club_core/public/${slug}/events/gwiazda-cup-2026/files/${String(poster.body?.id)}` },
    })
    expect(page.event.funders.map((funder) => funder.name)).toEqual(['Gmina Liszki', 'Powiat Krakowski'])
    expect(page.event.days.map((day) => day.date)).toEqual([day1, day2, day3, day4])
    const [first, second, third, fourth] = page.event.days.map((day) => day.parts[0])
    expect(first).toEqual({
      title: 'Turniej Orlika Młodszego',
      category: 'Orlik młodszy',
      type: 'tournament',
      date: day1,
      startTime: '09:00',
      endTime: '14:00',
      cancelled: false,
      ourTeam: { groupName: 'Orlik młodszy', section: { name: 'Akademia piłkarska', slug: 'akademia' } },
      visitingTeams: [
        { name: 'Wisła Liszki', clubName: 'Wisła Liszki KS' },
        { name: 'Orzeł Kryspinów', clubName: 'Orzeł Kryspinów KS' },
        { name: 'CIS Czernichów', clubName: 'CIS Czernichów KS' },
      ],
    })
    expect(second).toMatchObject({ title: 'Turniej Rezerw', ourTeam: { clubName: 'LKS Gwiazda' } })
    expect(third).toMatchObject({ title: 'Turniej Drużyn – Seniorzy (16+)', startTime: '08:30', ourTeam: null })
    expect(fourth).toMatchObject({ title: 'Turniej Orlika – rewanż', cancelled: true })
    const text = JSON.stringify(read.body)
    for (const hidden of ['Marek', 'Trenerski', 'kontakt-wisla', '600 100 200', 'trener.cis', 'Brak sali', 'Rezerwy']) {
      expect(text, `the page leaks "${hidden}"`).not.toContain(hidden)
    }

    // The poster and a logo: the bytes with `nosniff`.
    const posterFile = await publicGet(request, page.event.poster?.url ?? '')
    expect(posterFile.status).toBe(200)
    expect(posterFile.headers['x-content-type-options']).toBe('nosniff')
    expect(posterFile.headers['content-type']).toContain('image/png')
    expect(posterFile.bytes.subarray(0, 4).toString('hex')).toBe('89504e47')
    expect((await publicGet(request, page.event.funders[0]?.logoUrl ?? '')).status).toBe(200)

    // --- The same 404 for an unpublished event, one without parts, club B's slug and an unknown one ---
    for (const missing of ['ukryty-turniej', 'pusty-turniej', 'turniej-b', 'no-such-event', 'BAD_slug']) {
      const answer = await publicGet(request, `/api/club_core/public/${slug}/events/${missing}`)
      expect(answer.status, missing).toBe(404)
      expect(answer.body, missing).toMatchObject({ code: 'public_club_event_not_found' })
    }
    // Club B's own event of the same slug is B's.
    const fromB = await publicGet(request, `/api/club_core/public/${slugB}/events/gwiazda-cup-2026`)
    expect(fromB.status, JSON.stringify(fromB.body)).toBe(200)
    expect((fromB.body as unknown as ClubEventPage).event.days[0]?.parts[0]?.title).toBe('GWIAZDA CUP 2026 – część')
    expect(JSON.stringify(fromB.body)).not.toContain('Orlik')
    expect((await publicGet(request, `/api/club_core/public/no-such-club-t09/events/${eventSlug}`)).body).toMatchObject(
      {
        code: 'public_page_not_found',
      },
    )

    // A file of the unpublished event, A's poster under another event or club: 404.
    const hiddenFileId = String(hiddenPoster.body?.id)
    for (const path of [
      `/api/club_core/public/${slug}/events/ukryty-turniej/files/${hiddenFileId}`,
      `/api/club_core/public/${slug}/events/gwiazda-cup-2026/files/${hiddenFileId}`,
      `/api/club_core/public/${slug}/events/pusty-turniej/files/${String(poster.body?.id)}`,
      `/api/club_core/public/${slugB}/events/gwiazda-cup-2026/files/${String(poster.body?.id)}`,
      `/api/club_core/public/${slug}/events/gwiazda-cup-2026/files/not-a-uuid`,
    ]) {
      const answer = await publicGet(request, path)
      expect(answer.status, path).toBe(404)
      expect(answer.body, path).toMatchObject({ code: 'public_page_not_found' })
    }

    // --- The `events` block off: 404 `public_events_disabled`, and the poster is gone ---
    await publish(request, admin, slug, ['description_schedule'])
    const off = await publicGet(request, `/api/club_core/public/${slug}/events/${eventSlug}`)
    expect(off.status).toBe(404)
    expect(off.body).toMatchObject({ code: 'public_events_disabled' })
    expect((await publicGet(request, page.event.poster?.url ?? '')).status).toBe(404)
  } finally {
    await other.cleanup()
    await club.cleanup()
  }
})
