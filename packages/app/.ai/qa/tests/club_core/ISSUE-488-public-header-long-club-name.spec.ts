import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { createClub, uniqueSuffix } from '../_fixtures/club'
import { publicPitch } from '../_fixtures/public-places'
import { publish } from '../_fixtures/publication'

// ISSUE-488 (E20-S09, epic #479): a long club name never covers the public header's links. From 640 px (`sm`) the name
// takes the room the links leave and truncates, its full text in `title`; the links keep their own width. Below 640 px
// the links sit on a second row. Checked by bounding boxes and a hit test on every link (is the link itself what a click at
// its centre reaches?) at 1440, 768, 640, 480, 375 and 320 px, in both locales, light and dark; a short name keeps the
// layout it had (negative case). Header screenshots go to the test's output folder as browser evidence for the PR.
test.describe.configure({ timeout: 300_000 })

/** 40 characters, as in the issue's acceptance criteria. */
const LONG_NAME = 'Miejski Uczniowski Klub Sportowy Delfiny'
const SHORT_NAME = 'Delfin'
const NAV_IDS = ['club', 'sections', 'facilities', 'events', 'signIn'] as const
const BLOCKS = ['places_calendar', 'online_requests', 'contact', 'events'] as const

type Box = { left: number; right: number; top: number; bottom: number }
type Geometry = {
  row: Box
  club: Box
  name: { title: string | null; text: string; clipped: boolean }
  nav: Box & { scrolls: boolean }
  end: Box
  links: Array<{ id: string; box: Box; hit: boolean }>
}

async function setGuestLocale(page: Page, locale: 'en' | 'pl'): Promise<void> {
  expect((await page.request.post('/api/auth/locale', { data: { locale } })).ok()).toBe(true)
}

/**
 * The header's boxes, read in the page. With `scroll`, each link is first scrolled into view inside the nav (the
 * second row below 640 px scrolls sideways), so `hit` says whether the link can be reached at all.
 */
async function geometry(page: Page, scroll: boolean): Promise<Geometry> {
  return page.getByTestId('public-header').evaluate(
    (header, input) => {
      const box = (element: Element) => {
        const rect = element.getBoundingClientRect()
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
      }
      const byId = (id: string) => {
        const element = header.querySelector(`[data-testid="${id}"]`)
        if (!element) throw new Error(`missing ${id}`)
        return element as HTMLElement
      }
      const nav = byId('public-nav')
      const name = byId('public-header-club-name')
      const links = input.ids.map((id) => {
        const link = byId(`public-nav-${id}`)
        if (input.scroll) link.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        const rect = link.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        return { id, box: box(link), hit: hit !== null && link.contains(hit) }
      })
      nav.scrollLeft = 0
      return {
        row: box(byId('public-club-link').closest('header > div:not([aria-hidden])') as Element),
        club: box(byId('public-club-link')),
        name: {
          title: name.getAttribute('title'),
          text: name.textContent,
          clipped: name.scrollWidth > name.clientWidth,
        },
        nav: { ...box(nav), scrolls: nav.scrollWidth > nav.clientWidth },
        end: box(byId('public-header-end')),
        links,
      }
    },
    { ids: [...NAV_IDS] as string[], scroll },
  )
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5

/** Nothing overlaps, and every link is visible and is what a click at its centre reaches. */
function expectReachable(found: Geometry, label: string): void {
  expect(overlaps(found.club, found.nav), `${label}: club link over the nav`).toBe(false)
  expect(overlaps(found.club, found.end), `${label}: club link over the header end`).toBe(false)
  expect(overlaps(found.nav, found.end), `${label}: nav over the header end`).toBe(false)
  for (const link of found.links) {
    expect(link.hit, `${label}: ${link.id} is not clickable`).toBe(true)
    expect(overlaps(link.box, found.club), `${label}: ${link.id} under the club link`).toBe(false)
  }
}

async function shotHeader(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.getByTestId('public-header').screenshot({ path: testInfo.outputPath(`${name}.png`) })
}

test('ISSUE-488 a long club name never covers the public header links', async ({ page, request }, testInfo) => {
  const club = await createClub(request, 'issue-488')
  try {
    const slug = `i488-${uniqueSuffix()}`
    await publicPitch(request, club, slug)
    await publish(request, club.adminToken, slug, BLOCKS, { shortName: LONG_NAME })
    expect(LONG_NAME).toHaveLength(40)

    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    const open = async (width: number) => {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 1024 })
      await page.goto(`/p/${slug}`)
      await expect(page.getByTestId('public-footer')).toBeVisible()
      await expect(page.getByTestId('public-header-end').locator('button, select, a').first()).toBeVisible()
    }

    for (const locale of ['en', 'pl'] as const) {
      await setGuestLocale(page, locale)
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        for (const width of [1440, 768, 640, 480, 375, 320]) {
          await open(width)
          const label = `${locale} ${colorScheme} ${String(width)} px`
          const header = page.getByTestId('public-header')
          await expect(header.getByTestId('public-club-link')).toHaveAttribute('href', `/p/${slug}`)
          // The visible name may be cut; the link's accessible name and the tooltip carry it whole.
          await expect(header.getByTestId('public-club-link')).toHaveAccessibleName(LONG_NAME)
          await expect(header.getByTestId('public-header-club-name')).toHaveAttribute('title', LONG_NAME)
          for (const id of NAV_IDS) await expect(header.getByTestId(`public-nav-${id}`)).toBeVisible()

          if (width >= 640) {
            // One row from 640 px (the acceptance widths 1440 and 768 among them): every link visible without scrolling,
            // the name cut instead.
            const found = await geometry(page, false)
            expectReachable(found, label)
            expect(found.nav.scrolls, `${label}: the nav scrolls`).toBe(false)
            expect(found.name.clipped, `${label}: the name is not truncated`).toBe(true)
            expect(found.club.top, `${label}: one row`).toBeCloseTo(found.nav.top, -1)
          } else {
            // Below 640 px the links take a second row that scrolls sideways.
            const found = await geometry(page, true)
            expectReachable(found, label)
            expect(found.nav.top, `${label}: second row`).toBeGreaterThanOrEqual(found.club.bottom)
            await expectNoPageOverflow(page, width)
          }
          await shotHeader(page, testInfo, `long-name-${locale}-${colorScheme}-${String(width)}`)
        }
      }
    }

    // The current link ("Club") is clickable at 1440 px with the long name — the audit saw only its last letter.
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await open(1440)
    await page.getByTestId('public-header').getByTestId('public-nav-club').click()
    await expect(page).toHaveURL(new RegExp(`/p/${slug}$`))
    await page.getByTestId('public-header').getByTestId('public-nav-facilities').click()
    await expect(page).toHaveURL(new RegExp(`/p/${slug}/places$`))

    // Accessibility of the header with the long name, light and dark.
    await open(1440)
    const violations = await scanInColorSchemes(page, testInfo, 'club page, long name', async () => {
      await expect(page.getByTestId('public-footer')).toBeVisible()
    })
    expect(violations).toEqual({})

    // Negative case: a short name keeps the layout — the name whole at the start of the row, the links right next to
    // the header end at its far side.
    await publish(request, club.adminToken, slug, BLOCKS, { shortName: SHORT_NAME })
    for (const locale of ['en', 'pl'] as const) {
      await setGuestLocale(page, locale)
      for (const width of [1440, 768, 640]) {
        await open(width)
        const label = `short ${locale} ${String(width)} px`
        const found = await geometry(page, false)
        expectReachable(found, label)
        expect(found.name.text, label).toBe(SHORT_NAME)
        expect(found.name.clipped, `${label}: the name is truncated`).toBe(false)
        expect(found.nav.scrolls, `${label}: the nav scrolls`).toBe(false)
        expect(found.club.left - found.row.left, `${label}: name at the row start`).toBeCloseTo(16, 0)
        const lastLink = found.links[found.links.length - 1].box
        expect(found.end.left - lastLink.right, `${label}: links next to the header end`).toBeCloseTo(16, 0)
        expect(found.row.right - found.end.right, `${label}: header end at the row end`).toBeCloseTo(16, 0)
        await shotHeader(page, testInfo, `short-name-${locale}-${String(width)}`)
      }
    }
  } finally {
    await club.cleanup()
  }
})
