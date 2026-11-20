import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { addDays, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
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
import { png, publish, putSectionPublic, upload, type PublicationBlock } from '../_fixtures/publication'
import { uiText } from '../_fixtures/ui-text'

// Club events spec TEST-T14 (REQ-T09, REQ-T10, J-T04, exit gate of phase 6; #381): a guest at 375 px and on desktop,
// in Polish and English, light and dark. On P-06 the club event "GWIAZDA CUP 2026" is one card with its poster, its
// date range, the place with a map link and "2 parts"; its name leads to the tournament page, which shows the poster,
// the name, the dates, the place with the map link, the description, two days with their parts (our team with its
// section, the guests), "Organised by LKS Gwiazda" and the funder's logo with its name as alternative text. A cancelled
// event shows the banner and its struck-through name without the reason; an unpublished event shows "This event is not
// published" with the club page link. No blocking axe violation in any state, and no sideways scrolling at 320 px.
test.describe.configure({ timeout: 600_000 })

const BLOCKS: PublicationBlock[] = ['description_schedule', 'events']

async function setGuestLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

async function makeGroupPublic(request: APIRequestContext, token: string, id: string) {
  const before = await getGroup(request, token, id)
  const saved = await updateGroup(request, token, { id, isPublic: true }, String(before.body?.updatedAt))
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
}

test('TEST-T14 a guest goes from P-06 to the tournament page at 375 px and on desktop, in both locales, light and dark', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-t14-public-tournament-page')
  try {
    const admin = club.adminToken
    const slug = `tt14-${uniqueSuffix()}`
    const academy = await create(request, admin, 'sections', { name: 'Akademia piłkarska' })
    expect((await putSectionPublic(request, admin, academy, { isPublic: true, publicSlug: 'akademia' })).status).toBe(
      200,
    )
    const orlik = await createGroup(request, admin, { sectionId: academy, name: 'Orlik młodszy', kind: 'team' })
    await makeGroupPublic(request, admin, orlik)
    const { hall } = await examplePlaces(request, club)
    const team = await call<{ id?: string }>(request, 'POST', '/api/groups/external-teams', admin, {
      data: { name: 'Wisła Liszki', clubName: 'LKS Wisła Liszki' },
    })
    expect(team.status, JSON.stringify(team.body)).toBe(201)

    const day1 = addDays(calendarDate(), 7)
    const day2 = addDays(day1, 7)
    const cup = await clubEventId(request, admin, {
      name: 'GWIAZDA CUP 2026',
      sectionId: academy,
      placeId: hall,
      description: 'Halowy turniej piłki nożnej dzieci i młodzieży.',
    })
    await partIds(request, admin, cup, {
      title: 'Turniej Orlika Młodszego',
      categoryLabel: 'Orlik młodszy',
      groupId: orlik,
      startsAt: zoneInstant(day1, '09:00'),
      endsAt: zoneInstant(day1, '14:00'),
      visitingTeamIds: [String(team.body?.id)],
    })
    await partIds(request, admin, cup, {
      title: 'Turniej Drużyn – Seniorzy (16+)',
      categoryLabel: 'Seniorzy (16+)',
      groupId: null,
      startsAt: zoneInstant(day2, '08:30'),
      endsAt: zoneInstant(day2, '14:00'),
    })
    const files = `/api/activities/club-events/${cup}/files`
    expect((await upload(request, admin, files, png([200, 40, 40], 64), { kind: 'poster' })).status).toBe(201)
    const logo = await upload(request, admin, files, png([40, 90, 200], 32), {
      kind: 'funder_logo',
      funderName: 'Gmina Liszki',
    })
    expect(logo.status, JSON.stringify(logo.body)).toBe(201)
    await makePublic(request, admin, cup)

    const cancelled = await clubEventId(request, admin, { name: 'Odwołany turniej', sectionId: academy, placeId: hall })
    await partIds(request, admin, cancelled, {
      title: 'Odwołana część',
      groupId: orlik,
      startsAt: zoneInstant(addDays(day1, 1), '10:00'),
      endsAt: zoneInstant(addDays(day1, 1), '12:00'),
    })
    await makePublic(request, admin, cancelled)
    const before = await readClubEvent(request, admin, cancelled)
    const cancel = await cancelClubEvent(request, admin, cancelled, 'Powód wewnętrzny klubu', before.body?.updatedAt)
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(200)
    const hidden = await clubEventId(request, admin, { name: 'Ukryty turniej', sectionId: academy, placeId: hall })
    await partIds(request, admin, hidden, {
      title: 'Ukryta część',
      groupId: orlik,
      startsAt: zoneInstant(day2, '15:00'),
      endsAt: zoneInstant(day2, '16:00'),
    })
    await publish(request, admin, slug, BLOCKS, { shortName: 'LKS Gwiazda' })

    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    const violations: Record<string, unknown> = {}
    const scan = async (label: string, ready: () => Promise<void>) => {
      Object.assign(violations, await scanInColorSchemes(page, testInfo, label, ready))
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    }
    const cupCard = page.locator('[data-testid="public-event"][data-kind="club_event"]', {
      hasText: 'GWIAZDA CUP 2026',
    })

    for (const viewport of [
      { width: 375, height: 812 },
      { width: 1280, height: 900 },
    ]) {
      for (const locale of ['pl', 'en'] as const) {
        const label = `${String(viewport.width)} px ${locale}`
        await page.setViewportSize(viewport)
        await setGuestLocale(page, locale)

        // P-06: one card for the cup, with its poster, place and number of parts; no card per part.
        await page.goto(`/p/${slug}/events`)
        await expect(cupCard).toBeVisible()
        await expect(cupCard.getByTestId('public-event-poster')).toBeVisible()
        await expect(cupCard.getByTestId('public-event-parts')).toContainText(
          uiText('club_core.public.events.parts.few', { params: { count: 2 } }),
        )
        await expect(cupCard).toContainText('Hala sportowa w Liszkach')
        await expect(cupCard.getByTestId('public-event-map')).toHaveAttribute('href', /openstreetmap\.org/)
        await expect(page.getByTestId('public-event')).toHaveCount(2)
        await expect(page.locator('[data-testid="public-event"][data-cancelled="true"] s')).toHaveText(
          'Odwołany turniej',
        )
        await expect(page.getByText('Turniej Orlika Młodszego')).toHaveCount(0)
        await scan(`P-06 ${label}`, async () => {
          await expect(cupCard).toBeVisible()
        })
        await page.setViewportSize(viewport)

        // The tournament page.
        await cupCard.getByTestId('public-event-link').click()
        await expect(page).toHaveURL(new RegExp(`/p/${slug}/events/gwiazda-cup-2026$`))
        await expect(page.getByTestId('public-club-event-name')).toHaveText('GWIAZDA CUP 2026')
        await expect(page.getByTestId('public-club-event-poster')).toBeVisible()
        await expect(page.getByTestId('public-club-event-poster')).toHaveAttribute(
          'alt',
          uiText('club_core.public.clubEvent.posterAlt', { params: { name: 'GWIAZDA CUP 2026' } }),
        )
        await expect(page.getByTestId('public-club-event-place')).toContainText('ul. Szkolna 50, Liszki')
        await expect(page.getByTestId('public-club-event-map')).toHaveAttribute('href', /openstreetmap\.org/)
        await expect(page.getByTestId('public-club-event-day')).toHaveCount(2)
        await expect(page.getByTestId('public-club-event-part')).toHaveCount(2)
        await expect(page.getByTestId('public-club-event-our-team')).toContainText('Akademia piłkarska')
        await expect(page.getByTestId('public-club-event-guests')).toContainText('Wisła Liszki (LKS Wisła Liszki)')
        await expect(page.getByTestId('public-club-event-organiser')).toContainText(
          uiText('club_core.public.clubEvent.organisedBy', { params: { club: 'LKS Gwiazda' } }),
        )
        await expect(page.getByTestId('public-club-event-funder')).toHaveAttribute('alt', 'Gmina Liszki')
        await expect(page.getByTestId('public-club-event-cancelled')).toHaveCount(0)
        await scan(`P-T1 ${label}`, async () => {
          await expect(page.getByTestId('public-club-event-part').first()).toBeVisible()
        })
        await page.setViewportSize(viewport)

        // A cancelled event: the banner, no reason.
        await page.goto(`/p/${slug}/events/odwolany-turniej`)
        await expect(page.getByTestId('public-club-event-cancelled')).toContainText(
          uiText('club_core.public.clubEvent.cancelledBanner'),
        )
        await expect(page.locator('body')).not.toContainText('Powód wewnętrzny')
        await scan(`P-T1 cancelled ${label}`, async () => {
          await expect(page.getByTestId('public-club-event-cancelled')).toBeVisible()
        })
        await page.setViewportSize(viewport)

        // An unpublished event: "This event is not published" with the club page link.
        await page.goto(`/p/${slug}/events/ukryty-turniej`)
        await expect(page.getByTestId('public-club-event-not-found')).toContainText(
          uiText('club_core.public.clubEvent.notPublished'),
        )
        await expect(page.getByTestId('public-club-page-link')).toHaveAttribute('href', `/p/${slug}`)
        await scan(`P-T1 not published ${label}`, async () => {
          await expect(page.getByTestId('public-club-event-not-found')).toBeVisible()
        })
      }
    }

    // Reflow at 320 px on the tournament page.
    await page.goto(`/p/${slug}/events/gwiazda-cup-2026`)
    await expect(page.getByTestId('public-club-event-part').first()).toBeVisible()
    await expectNoPageOverflow(page)

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
