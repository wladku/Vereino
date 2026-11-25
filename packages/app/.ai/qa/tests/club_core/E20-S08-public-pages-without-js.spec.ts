import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { addDays, zoneInstant } from '../_fixtures/activities'
import { calendarDate, createClub, uniqueSuffix } from '../_fixtures/club'
import { clubEventId, examplePlaces, makePublic, partIds } from '../_fixtures/club-events'
import { create } from '../_fixtures/club-structure'
import { setPlacePublic } from '../_fixtures/public-places'
import { publicGet, publish, putSectionPublic, putSettings } from '../_fixtures/publication'
import { uiTextIn } from '../_fixtures/ui-text'

// E20-S08 (#487): the public club pages are rendered on the server. With JavaScript off, a guest at 375 px and on
// desktop, in Polish and English, sees on P-01 the club's name, description and section tile, on P-02 the section, on
// P-03 the club's facility, on P-06 the published tournament and on P-T1 the tournament with its part; each page's
// title is "{club} — {page}" (P-T1: the club and the event), with the same Open Graph title and a public description.
// Without JavaScript the theme script does not run, so those pages are light; with JavaScript, in the dark scheme, the
// same pages hydrate from the server's state and show the same content. A club that does not publish its page, and a
// slug of no club, answer the same notices as before, under the route's own title. The HTML the server sends (what a
// link preview reads) already holds the club and event names.
test.describe.configure({ timeout: 600_000 })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const LOCALES = ['pl', 'en'] as const
const VIEWPORTS = [
  { name: '375', size: { width: 375, height: 812 } },
  { name: 'desktop', size: { width: 1440, height: 900 } },
] as const

async function guestContext(
  browser: Browser,
  locale: 'pl' | 'en',
  viewport: { width: number; height: number },
  scripts: 'off' | 'dark' = 'off',
) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    javaScriptEnabled: scripts !== 'off',
    colorScheme: scripts === 'dark' ? 'dark' : 'light',
    viewport,
    locale,
  })
  await context.addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
  return context
}

async function ogTitle(page: Page): Promise<string | null> {
  return page.locator('meta[property="og:title"]').getAttribute('content')
}

test('E20-S08 public club pages show their content without JavaScript and carry the club name in the title', async ({
  browser,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e20-s08-public-no-js')
  const contexts: BrowserContext[] = []
  try {
    const admin = club.adminToken
    const slug = `e20s08-${uniqueSuffix()}`
    const academy = await create(request, admin, 'sections', { name: 'Akademia piłkarska' })
    expect((await putSectionPublic(request, admin, academy, { isPublic: true, publicSlug: 'akademia' })).status).toBe(
      200,
    )
    const { hall } = await examplePlaces(request, club)
    const placeMade = await setPlacePublic(request, admin, hall, { publicSlug: 'hala', isPublicSchedule: true })
    expect(placeMade.status, JSON.stringify(placeMade.body)).toBe(200)
    const day = addDays(calendarDate(), 7)
    const cup = await clubEventId(request, admin, {
      name: 'PUCHAR BEZ SKRYPTU 2026',
      sectionId: academy,
      placeId: hall,
      description: 'Halowy turniej dzieci, widoczny także bez JavaScriptu.',
    })
    await partIds(request, admin, cup, {
      title: 'Turniej Orlika',
      groupId: null,
      startsAt: zoneInstant(day, '09:00'),
      endsAt: zoneInstant(day, '14:00'),
    })
    const eventSlug = await makePublic(request, admin, cup)
    await publish(request, admin, slug, ['description_schedule', 'events', 'places_calendar'], {
      publicDescription: 'Klub sportowy z Liszek: piłka nożna dla dzieci i dorosłych.',
    })
    const clubPage = await publicGet(request, `/api/club_core/public/${slug}`)
    expect(clubPage.status, JSON.stringify(clubPage.body)).toBe(200)
    const clubName = String((clubPage.body?.club as { name?: string } | undefined)?.name)

    // What a link preview reads: the server's HTML already names the club and the event, with the Open Graph title.
    const html = await (
      await request.get(`/p/${slug}/events/${eventSlug}`, { headers: { Cookie: 'locale=pl' } })
    ).text()
    expect(html).toContain(`<title>${clubName} — PUCHAR BEZ SKRYPTU 2026</title>`)
    expect(html).toContain(`<meta property="og:title" content="${clubName} — PUCHAR BEZ SKRYPTU 2026"/>`)
    expect(html).toContain('Turniej Orlika')

    for (const locale of LOCALES) {
      const text = (key: string) => uiTextIn(locale, key)
      const pages = [
        {
          id: 'P-01',
          path: `/p/${slug}`,
          title: `${clubName} — ${text('club_core.public.pageTitle')}`,
          visible: [clubName, 'Klub sportowy z Liszek', 'Akademia piłkarska'],
          description: 'Klub sportowy z Liszek: piłka nożna dla dzieci i dorosłych.',
        },
        {
          id: 'P-02',
          path: `/p/${slug}/sections/akademia`,
          title: `${clubName} — Akademia piłkarska`,
          visible: [clubName, 'Akademia piłkarska'],
          description: text('club_core.public.meta.section')
            .replace('{section}', 'Akademia piłkarska')
            .replace('{club}', clubName),
        },
        {
          id: 'P-03',
          path: `/p/${slug}/places`,
          title: `${clubName} — ${text('facilities.public.places.pageTitle')}`,
          visible: [clubName, 'Hala sportowa w Zielonym Lesie'],
          description: text('facilities.public.places.metaDescription').replace('{club}', clubName),
        },
        {
          id: 'P-06',
          path: `/p/${slug}/events`,
          title: `${clubName} — ${text('club_core.public.events.pageTitle')}`,
          visible: [clubName, 'PUCHAR BEZ SKRYPTU 2026'],
          description: text('club_core.public.meta.events').replace('{club}', clubName),
        },
        {
          id: 'P-T1',
          path: `/p/${slug}/events/${eventSlug}`,
          title: `${clubName} — PUCHAR BEZ SKRYPTU 2026`,
          visible: [clubName, 'PUCHAR BEZ SKRYPTU 2026', 'Turniej Orlika', 'Halowy turniej dzieci'],
          description: 'Halowy turniej dzieci, widoczny także bez JavaScriptu.',
        },
      ]
      for (const viewport of VIEWPORTS) {
        const context = await guestContext(browser, locale, viewport.size)
        contexts.push(context)
        const page = await context.newPage()
        for (const entry of pages) {
          await page.goto(entry.path)
          for (const visible of entry.visible) {
            await expect(page.getByText(visible).first(), `${entry.id} ${locale} ${viewport.name}`).toBeVisible()
          }
          await expect(page).toHaveTitle(entry.title)
          expect(await ogTitle(page)).toBe(entry.title)
          expect(await page.locator('meta[name="description"]').getAttribute('content')).toBe(entry.description)
          await testInfo.attach(`${entry.id}-${locale}-${viewport.name}-no-js`, {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png',
          })
        }
        // With JavaScript, dark: the page hydrates from the server's state (its browser query stays off).
        const scripted = await guestContext(browser, locale, viewport.size, 'dark')
        contexts.push(scripted)
        const dark = await scripted.newPage()
        for (const entry of pages) {
          await dark.goto(entry.path)
          for (const visible of entry.visible) {
            await expect(dark.getByText(visible).first(), `${entry.id} ${locale} ${viewport.name} dark`).toBeVisible()
          }
          await expect(dark).toHaveTitle(entry.title)
          await testInfo.attach(`${entry.id}-${locale}-${viewport.name}-dark`, {
            body: await dark.screenshot({ fullPage: true }),
            contentType: 'image/png',
          })
        }
      }
    }

    // Negative: a slug of no club, and a club that stops publishing its page — the notices of before, under the route title "{page} — Vereino" (#485).
    const context = await guestContext(browser, 'en', VIEWPORTS[1].size)
    contexts.push(context)
    const page = await context.newPage()
    await page.goto(`/p/e20s08-missing-${uniqueSuffix()}`)
    await expect(page.getByTestId('public-not-found')).toBeVisible()
    await expect(page).toHaveTitle(
      `${uiTextIn('en', 'club_core.public.pageTitle')} — ${uiTextIn('en', 'app.metadata.title')}`,
    )
    // No Open Graph title: the route's own metadata only (a count, so nothing waits for a tag that never comes).
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(0)
    expect((await putSettings(request, admin, { publication: { enabled: false } })).status).toBe(200)
    await page.goto(`/p/${slug}`)
    await expect(page.getByTestId('public-disabled')).toBeVisible()
    await expect(page.getByText(clubName)).toHaveCount(0)
    await expect(page).toHaveTitle(
      `${uiTextIn('en', 'club_core.public.pageTitle')} — ${uiTextIn('en', 'app.metadata.title')}`,
    )
    await page.goto(`/p/${slug}/events/${eventSlug}`)
    await expect(page.getByTestId('public-club-event-not-found')).toBeVisible()
    await expect(page.getByText('PUCHAR BEZ SKRYPTU 2026')).toHaveCount(0)
    await expect(page).toHaveTitle(
      `${uiTextIn('en', 'club_core.public.clubEvent.pageTitle')} — ${uiTextIn('en', 'app.metadata.title')}`,
    )
  } finally {
    for (const context of contexts) await context.close()
    await club.cleanup()
  }
})
