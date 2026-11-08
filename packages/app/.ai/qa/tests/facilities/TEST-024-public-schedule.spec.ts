import { expect, test } from '@playwright/test'
import { OPTIMISTIC_LOCK_HEADER, call, calendarDate, createClub } from '../_fixtures/club'
import { create, getOne } from '../_fixtures/club-structure'
import { pdf, png, publicGet, publish, upload } from '../_fixtures/publication'
import { PRIVATE_NAMES, publicPitch, publicPlaces, publicSchedule, setPlacePublic } from '../_fixtures/public-places'

// Issue #124 (E08-S04), facilities spec REQ-014, P-03, P-04, TEST-024 (security), DD-29, DD-45: a guest reads the
// club's public facilities and a public pitch's month without a session. The month shows states only — "taken by the
// club" for a club event, "booked" for a rental, "requested" for a held request, "closed" for a closure — and the
// responses carry no renter, contact, group, activity or closure detail and no record id. A place that is not public,
// an inactive place, an unknown club or place answer 404 `public_place_not_found`; a club that does not publish its
// places calendar 404 `public_places_disabled` and nothing else; a month outside the readable range 400. The place
// fields of B-06: a public calendar needs a slug (422), a slug is unique among the club's places (409). The 429 is
// not integration-tested: `OM_INTEGRATION_TEST` disables rate limits; both routes declare `metadata.GET.rateLimit`.
test.describe.configure({ timeout: 300_000 })

test('TEST-024 public facilities and month: states without names or ids; 404 for non-public, inactive, unknown and disabled; 400 month', async ({
  request,
}) => {
  const club = await createClub(request, 'test-024-public-schedule')
  try {
    const admin = club.adminToken
    const slug = `test-024-${club.tenant.organizationId.slice(0, 8)}`
    const setup = await publicPitch(request, club, slug)
    const hall = await findHall()

    async function findHall(): Promise<string> {
      const listed = await call<{ items?: Array<{ id: string; publicSlug: string | null }> }>(
        request,
        'GET',
        '/api/club_core/places?pageSize=100',
        admin,
      )
      const found = listed.body?.items?.find((item) => item.publicSlug === 'hala-zaplecza')
      if (!found) throw new Error('[internal] the hidden hall is not listed')
      return found.id
    }

    // The pitch's photo, regulations PDF and rules text; a photo of the hidden hall.
    const pitchFiles = `/api/club_core/places/${setup.pitch}/files`
    expect((await upload(request, admin, pitchFiles, png([20, 160, 60]), { kind: 'photo' })).status).toBe(201)
    expect((await upload(request, admin, pitchFiles, pdf('regulamin.pdf'), { kind: 'regulations' })).status).toBe(201)
    const hallPhoto = await upload(request, admin, `/api/club_core/places/${hall}/files`, png([200, 20, 20]), {
      kind: 'photo',
    })
    expect(hallPhoto.status, JSON.stringify(hallPhoto.body)).toBe(201)
    const pitchNow = await getOne(request, admin, 'places', setup.pitch)
    const rules = await call(request, 'PUT', '/api/club_core/places', admin, {
      data: { id: setup.pitch, regulationsText: 'Obuwie z płaską podeszwą.' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(pitchNow?.updatedAt) },
    })
    expect(rules.status, JSON.stringify(rules.body)).toBe(200)

    const secrets = [
      ...Object.values(PRIVATE_NAMES),
      setup.pitch,
      hall,
      setup.zaki,
      setup.neighbours,
      'Żaki',
      'Akademia',
      'snow',
      '600 000 001',
    ]
    const expectNoSecrets = (bytes: Buffer, label: string) => {
      const text = bytes.toString('utf8')
      for (const secret of secrets) expect(text, `${label} leaks "${secret}"`).not.toContain(secret)
    }

    // P-03 — the public pitch only, without ids or names; shared-cache header; the photo is served.
    const places = await publicPlaces(request, slug)
    expect(places.status, JSON.stringify(places.body)).toBe(200)
    expect(places.headers['cache-control']).toBe('public, s-maxage=60')
    expectNoSecrets(places.bytes, 'P-03')
    const cards = places.body?.places as Array<Record<string, unknown>>
    expect(cards.map((card) => card.slug)).toEqual(['boisko-a'])
    expect(cards[0]).toEqual({
      slug: 'boisko-a',
      name: 'Boisko A',
      kind: 'pitch',
      surface: null,
      address: null,
      photoUrl: expect.stringMatching(new RegExp(`^/api/club_core/public/${slug}/places/boisko-a/files/`)),
      acceptsOnlineRequests: true,
    })
    const photo = await publicGet(request, String(cards[0].photoUrl))
    expect(photo.status).toBe(200)
    expect(photo.headers['content-type']).toContain('image/png')

    // AC 1 — P-04: "taken by the club", "booked", "requested", "closed"; no names, no ids (negative case).
    const month = await publicSchedule(request, slug, 'boisko-a', setup.month)
    expect(month.status, JSON.stringify(month.body)).toBe(200)
    expect(month.headers['cache-control']).toBe('public, s-maxage=60')
    expectNoSecrets(month.bytes, 'P-04')
    const body = month.body as {
      month: string
      phone: string | null
      place: { regulationsText: string | null; regulationsUrl: string | null; photoUrls: string[] }
      rates: Array<{ category: string; pricePer90: number }>
      days: Array<{ date: string; opening: unknown; slots: Array<Record<string, unknown>> }>
    }
    expect(body.month).toBe(setup.month)
    expect(body.phone).toBe('600 000 000')
    expect(body.place.regulationsText).toBe('Obuwie z płaską podeszwą.')
    expect(body.place.photoUrls).toHaveLength(1)
    expect(body.rates.map((rate) => [rate.category, rate.pricePer90])).toEqual([
      ['municipal_club', 15_000],
      ['external_commercial', 25_000],
    ])
    const day = body.days.find((entry) => entry.date === setup.day)
    expect(day?.opening).toEqual([{ from: '08:00', to: '22:00' }])
    expect(day?.slots).toEqual([
      { from: '08:00', to: '10:00', state: 'bookable', canRequest: true },
      { from: '10:00', to: '11:30', state: 'requested', canRequest: false },
      { from: '11:30', to: '16:00', state: 'bookable', canRequest: true },
      { from: '16:00', to: '17:30', state: 'club_training', canRequest: false },
      { from: '17:30', to: '19:00', state: 'club', canRequest: false },
      { from: '19:00', to: '19:30', state: 'club_training', canRequest: false },
      { from: '19:30', to: '20:00', state: 'bookable', canRequest: false },
      { from: '20:00', to: '21:30', state: 'booked', canRequest: false },
      { from: '21:30', to: '22:00', state: 'bookable', canRequest: false },
    ])
    const closed = body.days.find((entry) => entry.date === setup.closedDay)
    expect(closed?.slots[0]).toEqual({ from: '08:00', to: '12:00', state: 'closed', canRequest: false })
    const regulations = await publicGet(request, String(body.place.regulationsUrl))
    expect(regulations.status).toBe(200)
    expect(regulations.headers['content-type']).toContain('application/pdf')

    // Without `month`: the club's current month. A month outside the readable range or malformed: 400.
    const current = await publicSchedule(request, slug, 'boisko-a')
    expect(current.status, JSON.stringify(current.body)).toBe(200)
    expect(current.body?.month).toBe(calendarDate().slice(0, 7))
    for (const bad of ['2020-01', '2026-13', 'listopad']) {
      const refused = await publicSchedule(request, slug, 'boisko-a', bad)
      expect(refused.status, bad).toBe(400)
      expect(refused.body?.code).toBe('public_schedule_month_invalid')
    }

    // AC 3 — a place that is not public, an unknown place, an unknown club: 404, and nothing about them.
    for (const path of [
      `/api/facilities/public/${slug}/places/hala-zaplecza/schedule`,
      `/api/facilities/public/${slug}/places/nie-ma-takiego/schedule`,
      `/api/facilities/public/nie-ma-takiego-klubu/places/boisko-a/schedule`,
      `/api/facilities/public/nie-ma-takiego-klubu/places`,
    ]) {
      const missing = await publicGet(request, path)
      expect(missing.status, path).toBe(404)
      expect(missing.body?.code, path).toBe('public_place_not_found')
      expectNoSecrets(missing.bytes, path)
    }
    const hallFile = await publicGet(
      request,
      `/api/club_core/public/${slug}/places/hala-zaplecza/files/${String(hallPhoto.body?.id)}`,
    )
    expect(hallFile.status).toBe(404)

    // B-06 — a public calendar needs a slug (422); a slug is unique among the club's places (409).
    const third = await create(request, admin, 'places', { name: 'Kort', kind: 'other' })
    const noSlug = await setPlacePublic(request, admin, third, { isPublicSchedule: true })
    expect(noSlug.status, JSON.stringify(noSlug.body)).toBe(422)
    expect(noSlug.body?.code).toBe('place_public_slug_required')
    const taken = await setPlacePublic(request, admin, third, { publicSlug: 'boisko-a' })
    expect(taken.status, JSON.stringify(taken.body)).toBe(409)
    expect(taken.body?.code).toBe('public_slug_taken')

    // The club page links the public places (P-01 → P-03).
    const clubPage = await publicGet(request, `/api/club_core/public/${slug}`)
    expect(clubPage.status).toBe(200)
    expect((clubPage.body?.blocks as Record<string, unknown>)?.places).toEqual({
      count: 1,
      path: `/p/${slug}/places`,
    })

    // Online requests off for the club: the cards say so and no slot can be requested.
    await publish(request, admin, slug, ['places_calendar', 'contact'])
    const noRequests = await publicSchedule(request, slug, 'boisko-a', setup.month)
    expect(noRequests.status).toBe(200)
    const noRequestDays = (noRequests.body as typeof body).days
    expect(noRequestDays.flatMap((entry) => entry.slots).some((slot) => slot.canRequest)).toBe(false)
    expect(((await publicPlaces(request, slug)).body?.places as Array<Record<string, unknown>>)[0]).toMatchObject({
      acceptsOnlineRequests: false,
    })

    // An inactive place: 404.
    const active = await getOne(request, admin, 'places', setup.pitch)
    const deactivated = await call(request, 'PUT', '/api/club_core/places', admin, {
      data: { id: setup.pitch, isActive: false },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(active?.updatedAt) },
    })
    expect(deactivated.status, JSON.stringify(deactivated.body)).toBe(200)
    expect((await publicSchedule(request, slug, 'boisko-a', setup.month)).status).toBe(404)
    expect((await publicPlaces(request, slug)).body?.places).toEqual([])
    const inactive = await getOne(request, admin, 'places', setup.pitch)
    const reactivated = await call(request, 'PUT', '/api/club_core/places', admin, {
      data: { id: setup.pitch, isActive: true },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(inactive?.updatedAt) },
    })
    expect(reactivated.status, JSON.stringify(reactivated.body)).toBe(200)

    // AC 2 — the places calendar block off: 404 `public_places_disabled` and no data, on every public read.
    await publish(request, admin, slug, ['contact'])
    for (const path of [
      `/api/facilities/public/${slug}/places`,
      `/api/facilities/public/${slug}/places/boisko-a/schedule?month=${setup.month}`,
    ]) {
      const disabled = await publicGet(request, path)
      expect(disabled.status, path).toBe(404)
      expect(disabled.body?.code, path).toBe('public_places_disabled')
      expectNoSecrets(disabled.bytes, path)
      expect(disabled.bytes.toString('utf8')).not.toContain('Boisko')
    }
    expect((await publicGet(request, String(cards[0].photoUrl))).status).toBe(404)
    const withoutPlaces = await publicGet(request, `/api/club_core/public/${slug}`)
    expect((withoutPlaces.body?.blocks as Record<string, unknown>)?.places).toBeUndefined()
  } finally {
    await club.cleanup()
  }
})
