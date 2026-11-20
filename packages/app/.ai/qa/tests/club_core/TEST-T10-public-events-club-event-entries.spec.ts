import { expect, test, type APIRequestContext } from '@playwright/test'
import { addDays, createActivity, zoneInstant } from '../_fixtures/activities'
import { calendarDate, call, createClub, uniqueSuffix } from '../_fixtures/club'
import {
  cancelClubEvent,
  clubEventId,
  examplePlaces,
  makePublic,
  partIds,
  readClubEvent,
} from '../_fixtures/club-events'
import { create } from '../_fixtures/club-structure'
import { createGroup, getGroup, updateGroup } from '../_fixtures/groups'
import { png, publicGet, publish, putSectionPublic, upload, type PublicationBlock } from '../_fixtures/publication'

// Club events spec TEST-T10 (REQ-T10, DD-T12, AC-T10; #381): P-06 lists a published club event once. Club A publishes
// its page and the `events` block, with the public sections Akademia (the public Orlik group and the non-public
// Rezerwy group) and Pływanie (the public Delfiny group). "GWIAZDA CUP 2026" (Akademia, with a poster) has three
// parts — Orlik, Rezerwy and the open seniors' part; a single public sparring of Orlik; a whole-club "Dzień klubu"
// with a Delfiny part; a cancelled "Odwołany turniej"; "Jesienny turniej" with parts 40 and 30 days ago; "Stary
// turniej" with parts 70 and 30 days ago; and an unpublished one. `GET …/events` lists one entry per published club
// event (`kind: club_event`, `partsCount`, its slug and poster), never its parts, the sparring as before
// (`kind: event`), the whole-club event with `section: null` and the club's logo, the cancelled one flagged,
// "Jesienny turniej" under `past` and "Stary turniej" nowhere. `?section=akademia` keeps the cup and the sparring and
// leaves out "Dzień klubu" (no public group of Akademia); `?section=plywanie` keeps "Dzień klubu" and not the cup.
test.describe.configure({ timeout: 300_000 })

type Entry = {
  kind: 'event' | 'club_event'
  name: string
  type: string
  date: string
  endDate: string
  startTime: string
  place: string | null
  mapUrl: string | null
  cancelled: boolean
  past: boolean
  section: { name: string; slug: string } | null
  sectionLogo: { source: string }
  clubEventSlug: string | null
  partsCount: number | null
  posterUrl: string | null
}
type EventsPage = { upcoming: Entry[]; past: Entry[] }

const BLOCKS: PublicationBlock[] = ['description_schedule', 'events']

async function makeGroupPublic(request: APIRequestContext, token: string, id: string) {
  const before = await getGroup(request, token, id)
  const saved = await updateGroup(request, token, { id, isPublic: true }, String(before.body?.updatedAt))
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
}

const names = (entries: readonly Entry[]) => entries.map((entry) => entry.name)

test('TEST-T10 P-06 lists one entry per published club event, a whole-club one without a section, a cancelled one flagged and the old one not under Past', async ({
  request,
}) => {
  const club = await createClub(request, 'test-t10-public-club-events')
  try {
    const admin = club.adminToken
    const slug = `tt10-${uniqueSuffix()}`
    const academy = await create(request, admin, 'sections', { name: 'Akademia' })
    expect((await putSectionPublic(request, admin, academy, { isPublic: true, publicSlug: 'akademia' })).status).toBe(
      200,
    )
    const swimming = await create(request, admin, 'sections', { name: 'Pływanie' })
    expect((await putSectionPublic(request, admin, swimming, { isPublic: true, publicSlug: 'plywanie' })).status).toBe(
      200,
    )
    const orlik = await createGroup(request, admin, { sectionId: academy, name: 'Orlik', kind: 'team' })
    const reserves = await createGroup(request, admin, { sectionId: academy, name: 'Rezerwy', kind: 'team' })
    const dolphins = await createGroup(request, admin, { sectionId: swimming, name: 'Delfiny', kind: 'team' })
    await makeGroupPublic(request, admin, orlik)
    await makeGroupPublic(request, admin, dolphins)
    const { hall } = await examplePlaces(request, club)
    const today = calendarDate()

    const part = (eventId: string, title: string, groupId: string | null, date: string, from = '10:00', to = '12:00') =>
      partIds(request, admin, eventId, {
        title,
        groupId,
        startsAt: zoneInstant(date, from),
        endsAt: zoneInstant(date, to),
      })

    // The cup: three parts over two days, a poster.
    const cup = await clubEventId(request, admin, { name: 'GWIAZDA CUP 2026', sectionId: academy, placeId: hall })
    await part(cup, 'Część Orlika', orlik, addDays(today, 7), '09:00', '14:00')
    await part(cup, 'Część Rezerw', reserves, addDays(today, 8))
    await part(cup, 'Część seniorów', null, addDays(today, 14), '08:30', '15:00')
    const poster = await upload(request, admin, `/api/activities/club-events/${cup}/files`, png([200, 40, 40], 16), {
      kind: 'poster',
    })
    expect(poster.status, JSON.stringify(poster.body)).toBe(201)
    await makePublic(request, admin, cup)

    // A single public sparring of Orlik, as today.
    const opponent = await call<{ id?: string }>(request, 'POST', '/api/groups/external-teams', admin, {
      data: { name: 'UKS Delfin', clubName: 'Delfin Łódź' },
    })
    expect(opponent.status, JSON.stringify(opponent.body)).toBe(201)
    await createActivity(request, admin, {
      groupId: orlik,
      type: 'sparring',
      name: 'Sparing Orlika',
      placeId: hall,
      opponentExternalTeamId: String(opponent.body?.id),
      startsOn: addDays(today, 9),
      startTime: '10:00',
      endTime: '12:00',
    })

    // A whole-club event with a Delfiny part; a cancelled one; two past ones; an unpublished one.
    const clubDay = await clubEventId(request, admin, { name: 'Dzień klubu', sectionId: null, placeId: hall })
    await part(clubDay, 'Pokaz Delfinów', dolphins, addDays(today, 10))
    await makePublic(request, admin, clubDay)
    const cancelled = await clubEventId(request, admin, { name: 'Odwołany turniej', sectionId: academy, placeId: hall })
    await part(cancelled, 'Odwołana część', orlik, addDays(today, 11))
    await makePublic(request, admin, cancelled)
    const before = await readClubEvent(request, admin, cancelled)
    const cancel = await cancelClubEvent(request, admin, cancelled, 'Brak sali', before.body?.updatedAt)
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(200)
    const autumn = await clubEventId(request, admin, { name: 'Jesienny turniej', sectionId: academy, placeId: hall })
    await part(autumn, 'Jesień 1', orlik, addDays(today, -40))
    await part(autumn, 'Jesień 2', null, addDays(today, -30))
    await makePublic(request, admin, autumn)
    const old = await clubEventId(request, admin, { name: 'Stary turniej', sectionId: academy, placeId: hall })
    await part(old, 'Stary 1', orlik, addDays(today, -70))
    await part(old, 'Stary 2', null, addDays(today, -30))
    await makePublic(request, admin, old)
    const hidden = await clubEventId(request, admin, { name: 'Ukryty turniej', sectionId: academy, placeId: hall })
    await part(hidden, 'Ukryta część', orlik, addDays(today, 12))

    await publish(request, admin, slug, BLOCKS, { shortName: 'LKS Gwiazda' })

    // --- All sections ---
    const all = await publicGet(request, `/api/club_core/public/${slug}/events`)
    expect(all.status, JSON.stringify(all.body)).toBe(200)
    const page = all.body as unknown as EventsPage
    expect(names(page.upcoming)).toEqual(['GWIAZDA CUP 2026', 'Sparing Orlika', 'Dzień klubu', 'Odwołany turniej'])
    expect(names(page.past)).toEqual(['Jesienny turniej'])
    const [cupEntry, sparring, clubEntry, cancelledEntry] = page.upcoming as [Entry, Entry, Entry, Entry]
    expect(cupEntry).toMatchObject({
      kind: 'club_event',
      type: 'club_event',
      date: addDays(today, 7),
      endDate: addDays(today, 14),
      startTime: '09:00',
      place: 'Hala sportowa w Liszkach',
      mapUrl: expect.stringContaining('openstreetmap.org'),
      cancelled: false,
      past: false,
      section: { name: 'Akademia', slug: 'akademia' },
      clubEventSlug: 'gwiazda-cup-2026',
      partsCount: 3,
      posterUrl: `/api/club_core/public/${slug}/events/gwiazda-cup-2026/files/${String(poster.body?.id)}`,
    })
    expect(sparring).toMatchObject({
      kind: 'event',
      type: 'sparring',
      section: { slug: 'akademia' },
      clubEventSlug: null,
      partsCount: null,
      posterUrl: null,
    })
    expect(clubEntry).toMatchObject({
      kind: 'club_event',
      section: null,
      sectionLogo: { source: 'initial' },
      partsCount: 1,
      posterUrl: null,
    })
    expect(cancelledEntry).toMatchObject({ kind: 'club_event', cancelled: true })
    expect(page.past[0]).toMatchObject({ kind: 'club_event', past: true, partsCount: 2, date: addDays(today, -40) })
    const text = JSON.stringify(all.body)
    for (const absent of [
      'Część Orlika',
      'Część Rezerw',
      'Część seniorów',
      'Pokaz Delfinów',
      'Stary turniej',
      'Ukryty',
      'Brak sali',
    ]) {
      expect(text, `P-06 lists "${absent}"`).not.toContain(absent)
    }
    // The poster of a listed club event is served.
    expect((await publicGet(request, cupEntry.posterUrl ?? '')).status).toBe(200)

    // --- `?section=akademia`: the cup and the sparring; the whole-club event has no public Akademia group ---
    const academyPage = (await publicGet(request, `/api/club_core/public/${slug}/events?section=akademia`))
      .body as unknown as EventsPage
    expect(names(academyPage.upcoming)).toEqual(['GWIAZDA CUP 2026', 'Sparing Orlika', 'Odwołany turniej'])
    expect(names(academyPage.past)).toEqual(['Jesienny turniej'])

    // --- `?section=plywanie`: the whole-club event with its Delfiny part, without a section ---
    const swimmingPage = (await publicGet(request, `/api/club_core/public/${slug}/events?section=plywanie`))
      .body as unknown as EventsPage
    expect(names(swimmingPage.upcoming)).toEqual(['Dzień klubu'])
    expect(swimmingPage.upcoming[0]).toMatchObject({ section: null })
    expect(swimmingPage.past).toEqual([])
  } finally {
    await club.cleanup()
  }
})
