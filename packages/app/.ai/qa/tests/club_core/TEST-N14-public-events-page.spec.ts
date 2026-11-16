import { expect, test, type Page } from '@playwright/test'
import { addDays, createActivity, createEvent, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { calendarDate, call, createClub, uniqueSuffix } from '../_fixtures/club'
import { create } from '../_fixtures/club-structure'
import { ageCategoryOptions, createGroup, getGroup, seedAgeCategories, updateGroup } from '../_fixtures/groups'
import { publicGet, publish, putSectionPublic, type PublicationBlock } from '../_fixtures/publication'
import { uiText } from '../_fixtures/ui-text'

// TEST-N14 (navigation spec REQ-N13, AC-N13; issue #263, E09-S09): the public Events page P-06. A public section
// "Piłka" with tournaments 90 and 30 days ago and one next week (the last two at an external venue with a map pin), a
// second public section "Basen" with a sparring, and a non-public group of "Piłka" with a match. With the `events`
// block on, `GET /api/club_core/public/{slug}/events` lists next week's tournament and the sparring under `upcoming`
// and the 30-day tournament under `past`, never the 90-day one or the match; `?section=pilka` leaves Piłka's two; an
// unknown section shows all. P-01 and P-02 list no events; the team card names its age category; a missing section
// offers "Club page". With the block off the API answers 404 `public_events_disabled`, the header has no "Events" and
// P-06 says the club does not publish events. Browser at 375 px in pl and en, light and dark, without blocking axe
// violations.
test.describe.configure({ timeout: 300_000 })

type EventItem = {
  name: string
  type: string
  date: string
  endDate: string
  startTime: string
  place: string | null
  mapUrl: string | null
  cancelled: boolean
  past: boolean
  section: { name: string; slug: string }
  sectionLogo: { source: string }
}
type EventsPage = {
  club: { slug: string; nav: { events: boolean } }
  sections: { name: string; slug: string }[]
  section: string | null
  upcoming: EventItem[]
  past: EventItem[]
}

const BLOCKS: PublicationBlock[] = ['description_schedule']

async function setGuestLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

test('TEST-N14 public events page: upcoming and past of public groups, section filter, no events on P-01/P-02, category on the team card, block off answers 404', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-n14-events')
  try {
    const admin = club.adminToken
    const slug = `tn14-${uniqueSuffix()}`
    const football = await create(request, admin, 'sections', { name: 'Piłka' })
    expect((await putSectionPublic(request, admin, football, { isPublic: true, publicSlug: 'pilka' })).status).toBe(200)
    const swimming = await create(request, admin, 'sections', { name: 'Basen' })
    expect((await putSectionPublic(request, admin, swimming, { isPublic: true, publicSlug: 'basen' })).status).toBe(200)
    const hall = await create(request, admin, 'places', { name: 'Hala klubowa', kind: 'hall' })
    const away = await create(request, admin, 'places', {
      name: 'Stadion Orła',
      kind: 'pitch',
      isExternal: true,
      address: 'ul. Sportowa 5, Łódź',
      geoLat: 51.7592,
      geoLng: 19.456,
    })

    expect(seedAgeCategories(club)).toEqual({ created: true })
    const categories = await ageCategoryOptions(request, admin)
    const orlik = categories.items.find((item) => item.value === 'orlik')
    expect(orlik, JSON.stringify(categories)).toBeTruthy()
    const orliki = await createGroup(request, admin, {
      sectionId: football,
      name: 'Orliki',
      kind: 'team',
      ageCategoryEntryId: orlik?.id,
    })
    const hidden = await createGroup(request, admin, { sectionId: football, name: 'Rezerwy', kind: 'team' })
    const dolphins = await createGroup(request, admin, { sectionId: swimming, name: 'Delfiny', kind: 'team' })
    for (const id of [orliki, dolphins]) {
      const before = await getGroup(request, admin, id)
      const saved = await updateGroup(request, admin, { id, isPublic: true }, String(before.body?.updatedAt))
      expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    }

    const today = calendarDate()
    // Tournaments through the events route; the sparring and the match are one-off activities with an opponent.
    const tournaments: [string, string, string][] = [
      ['Turniej jesienny', addDays(today, -90), hall],
      ['Turniej o puchar', addDays(today, -30), away],
      ['Turniej halowy', addDays(today, 7), away],
    ]
    for (const [name, date, placeId] of tournaments) {
      const created = await createEvent(request, admin, {
        groupId: orliki,
        type: 'tournament',
        name,
        placeId,
        startsAt: zoneInstant(date, '10:00'),
        endsAt: zoneInstant(date, '14:00'),
      })
      expect(created.status, JSON.stringify(created.body)).toBe(201)
    }
    const opponent = await call<{ id?: string }>(request, 'POST', '/api/groups/external-teams', admin, {
      data: { name: 'UKS Delfin', clubName: 'Delfin Łódź' },
    })
    expect(opponent.status, JSON.stringify(opponent.body)).toBe(201)
    for (const [groupId, type, name, date] of [
      [dolphins, 'sparring', 'Sparing z Delfinem', addDays(today, 8)],
      [hidden, 'match', 'Mecz rezerw', addDays(today, 6)],
    ]) {
      await createActivity(request, admin, {
        groupId,
        type,
        name,
        placeId: hall,
        opponentExternalTeamId: String(opponent.body?.id),
        startsOn: date,
        startTime: '10:00',
        endTime: '14:00',
      })
    }

    // The block off (default): 404 `public_events_disabled`, and the public frame says there is no "Events" link.
    await publish(request, admin, slug, BLOCKS, { shortName: 'Klub Orzeł' })
    const off = await publicGet(request, `/api/club_core/public/${slug}/events`)
    expect(off.status).toBe(404)
    expect(off.body).toMatchObject({ code: 'public_events_disabled' })
    const clubOff = await publicGet(request, `/api/club_core/public/${slug}`)
    expect((clubOff.body as { club: { nav: unknown } }).club.nav).toEqual({ events: false })
    expect((await publicGet(request, '/api/club_core/public/no-such-club-n14/events')).body).toMatchObject({
      code: 'public_page_not_found',
    })

    // The block on: upcoming soonest first, the 30-day tournament under "past", never the 90-day one or the match.
    await publish(request, admin, slug, [...BLOCKS, 'events'])
    const all = await publicGet(request, `/api/club_core/public/${slug}/events`)
    expect(all.status, JSON.stringify(all.body)).toBe(200)
    const page1 = all.body as unknown as EventsPage
    expect(page1.club.nav).toEqual({ events: true })
    expect(page1.section).toBeNull()
    expect(page1.sections.map((section) => section.slug)).toEqual(['basen', 'pilka'])
    expect(page1.upcoming.map((item) => item.name)).toEqual(['Turniej halowy', 'Sparing z Delfinem'])
    expect(page1.past.map((item) => item.name)).toEqual(['Turniej o puchar'])
    expect(page1.upcoming[0]).toMatchObject({
      type: 'tournament',
      date: addDays(today, 7),
      endDate: addDays(today, 7),
      startTime: '10:00',
      place: 'Stadion Orła',
      mapUrl: expect.stringContaining('openstreetmap.org'),
      cancelled: false,
      past: false,
      section: { name: 'Piłka', slug: 'pilka' },
    })
    expect(page1.upcoming[1]).toMatchObject({ type: 'sparring', mapUrl: null, section: { slug: 'basen' } })
    expect(page1.past[0]).toMatchObject({ past: true, date: addDays(today, -30) })
    expect(JSON.stringify(all.body)).not.toContain('Mecz rezerw')
    expect(JSON.stringify(all.body)).not.toContain('Turniej jesienny')

    // The section filter leaves Piłka's two; an unknown section shows all.
    const filtered = (await publicGet(request, `/api/club_core/public/${slug}/events?section=pilka`))
      .body as unknown as EventsPage
    expect(filtered.section).toBe('pilka')
    expect([...filtered.upcoming, ...filtered.past].map((item) => item.name)).toEqual([
      'Turniej halowy',
      'Turniej o puchar',
    ])
    const unknown = (await publicGet(request, `/api/club_core/public/${slug}/events?section=nope`))
      .body as unknown as EventsPage
    expect(unknown.section).toBeNull()
    expect(unknown.upcoming).toHaveLength(2)

    // P-01 and P-02 list no events; the team card names its category.
    const clubPage = await publicGet(request, `/api/club_core/public/${slug}`)
    expect((clubPage.body as { blocks: Record<string, unknown> }).blocks).not.toHaveProperty('schedule')
    expect(JSON.stringify(clubPage.body)).not.toContain('Turniej')
    const sectionPage = await publicGet(request, `/api/club_core/public/${slug}/sections/pilka`)
    expect(JSON.stringify(sectionPage.body)).not.toContain('Turniej')
    const cards = (sectionPage.body as { blocks: { groups?: { items: { name: string; ageCategory: unknown }[] } } })
      .blocks.groups?.items
    expect(cards).toEqual([expect.objectContaining({ name: 'Orliki', ageCategory: orlik?.label })])

    // The browser at 375 px: P-06 in Polish and English, light and dark.
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    const scan = async (label: string, ready: () => Promise<void>) => {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        await page.reload()
        await ready()
        const found = await scanBlockingViolations(page, testInfo, {})
        if (found.length > 0) violations[`${label} (${colorScheme})`] = found
      }
      await expectNoPageOverflow(page)
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    }

    for (const locale of ['pl', 'en'] as const) {
      await setGuestLocale(page, locale)
      await page.goto(`/p/${slug}`)
      await expect(page.getByTestId('public-club-name')).toBeVisible()
      await expect(page.getByTestId('public-event')).toHaveCount(0)
      await page.getByTestId('public-nav-events').click()
      await expect(page).toHaveURL(new RegExp(`/p/${slug}/events$`))
      await expect(
        page.getByRole('heading', { level: 1, name: uiText('club_core.public.events.pageTitle') }),
      ).toBeVisible()
      await expect(page.getByTestId('public-events-upcoming').getByTestId('public-event')).toHaveCount(2)
      await expect(page.getByTestId('public-events-past').getByTestId('public-event')).toHaveCount(1)
      await expect(page.getByTestId('public-events-past')).toContainText(uiText('club_core.public.events.tookPlace'))
      await expect(page.getByTestId('public-event-map').first()).toHaveAttribute('href', /openstreetmap\.org/)
      await scan(`/p/[slug]/events ${locale}`, async () => {
        await expect(page.getByTestId('public-events-upcoming')).toBeVisible()
      })
    }

    // The chip filters through `?section=`.
    await page.getByTestId('public-events-section-basen').click()
    await expect(page).toHaveURL(new RegExp(`/p/${slug}/events\\?section=basen$`))
    await expect(page.getByTestId('public-events-section-basen')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('public-event')).toHaveCount(1)
    await expect(page.getByTestId('public-event')).toContainText('Sparing z Delfinem')
    await expect(page.getByTestId('public-events-past')).toHaveCount(0)

    // P-02: the team card names its category; a missing section offers the club page.
    await page.goto(`/p/${slug}/sections/pilka`)
    await expect(page.getByTestId(`public-group-${orliki}`)).toContainText(String(orlik?.label))
    await page.goto(`/p/${slug}/sections/missing-section`)
    await expect(page.getByTestId('public-not-found')).toBeVisible()
    await page.getByTestId('public-club-page-link').click()
    await expect(page).toHaveURL(new RegExp(`/p/${slug}$`))
    await expect(page.getByTestId('public-club-name')).toBeVisible()

    // The block off again: no "Events" in the header, P-06 says so and links the club page.
    await publish(request, admin, slug, BLOCKS)
    await page.goto(`/p/${slug}`)
    await expect(page.getByTestId('public-club-name')).toBeVisible()
    await expect(page.getByTestId('public-nav-events')).toHaveCount(0)
    await page.goto(`/p/${slug}/events`)
    await expect(page.getByTestId('public-events-disabled')).toContainText(
      uiText('club_core.public.events.notPublished'),
    )
    await expect(page.getByTestId('public-club-page-link')).toHaveAttribute('href', `/p/${slug}`)
    await scan('/p/[slug]/events disabled', async () => {
      await expect(page.getByTestId('public-events-disabled')).toBeVisible()
    })

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
