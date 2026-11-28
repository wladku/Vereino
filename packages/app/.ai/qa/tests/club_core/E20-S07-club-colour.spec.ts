import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { memberAccount } from '../_fixtures/attendance'
import { birthDateTurning, createClub, createPerson, uniqueSuffix } from '../_fixtures/club'
import { create, signInBrowser, signOutBrowser } from '../_fixtures/club-structure'
import { getSettings, publicGet, publish, putSectionPublic, putSettings } from '../_fixtures/publication'
import { uiText } from '../_fixtures/ui-text'

// E20-S07 (issue #486; design tokens R06.2, owner decision 3 of epic #479): the club administrator sets the club's
// colour on B-02; it paints the member header bar on `/club`, the hero and the header strip on `/p/...` and the box of a
// fallback logo, with black or white text — whichever contrasts more — so the text on it reaches 4.5:1 in light and
// dark. Without a colour the pages use `--primary`, never grey; a section without any logo shows its own initial.
test.describe.configure({ timeout: 300_000 })

const NAVY = '#0b2a5b'
const YELLOW = '#ffd400'
type Accent = { color: string; foreground: string } | null
type ClubPage = { club: { accent: Accent }; sections: { name: string; logo: { source: string; initial: string } }[] }

/** WCAG contrast of two computed `rgb(...)` colours. */
function contrast(first: string, second: string): number {
  const luminance = (css: string): number => {
    const [red, green, blue] = (css.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((part) => {
      const channel = Number(part) / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue
  }
  const [a, b] = [luminance(first), luminance(second)]
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

// Computed colours may come back as `oklch(...)` (the platform tokens); the page paints each on a 1 × 1 canvas and
// reports it as `rgb(r, g, b)`, so the contrast is computed the same way for every colour space.
const TO_RGB = `(css) => {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.fillStyle = css
  context.fillRect(0, 0, 1, 1)
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data
  return 'rgb(' + r + ', ' + g + ', ' + b + ')'
}`

/** The computed background and text colour of an element, as `rgb(...)`. */
async function colours(locator: Locator): Promise<{ background: string; text: string }> {
  return locator.evaluate((element, toRgbSource) => {
    const toRgb = (0, eval)(toRgbSource) as (css: string) => string
    const style = getComputedStyle(element)
    return { background: toRgb(style.backgroundColor), text: toRgb(style.color) }
  }, TO_RGB)
}

/** The colour a probe element gets from a CSS value (e.g. `var(--primary)`) on this page, as `rgb(...)`. */
async function resolvedColour(page: Page, value: string): Promise<string> {
  return page.evaluate(
    ([css, toRgbSource]) => {
      const toRgb = (0, eval)(toRgbSource) as (css: string) => string
      const probe = document.createElement('div')
      probe.style.backgroundColor = css
      document.body.append(probe)
      const resolved = toRgb(getComputedStyle(probe).backgroundColor)
      probe.remove()
      return resolved
    },
    [value, TO_RGB] as const,
  )
}

/** A full-page screenshot kept in the test's output folder (browser evidence for the PR). */
async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true })
}

async function setGuestLocale(page: Page, locale: 'en' | 'pl'): Promise<void> {
  expect((await page.request.post('/api/auth/locale', { data: { locale } })).ok()).toBe(true)
}

async function inBothSchemes(page: Page, check: (scheme: 'light' | 'dark') => Promise<void>): Promise<void> {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    await page.reload()
    await check(colorScheme)
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

test('E20-S07 club colour: setting, computed text colour, header, hero, fallback logo and section initials', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e20-s07-colour')
  try {
    const slug = `e2007-${uniqueSuffix()}`
    let admin = club.adminToken
    for (const [name, publicSlug] of [
      ['Basen', 'basen'],
      ['Akademia', 'akademia'],
    ]) {
      const id = await create(request, admin, 'sections', { name })
      expect((await putSectionPublic(request, admin, id, { isPublic: true, publicSlug })).status).toBe(200)
    }
    await publish(request, admin, slug, ['description_schedule'], {
      shortName: 'Klub Delfin',
      publicDescription: 'Pływanie i piłka dla dzieci.',
    })
    const memberId = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Nowak',
      birthDate: birthDateTurning(30),
    })
    const member = await memberAccount(request, club, memberId, 'e20-s07-member')

    // No colour: the API says so, and sections without any logo show their own initial, not the club's.
    expect(await getSettings(request, admin)).toMatchObject({ accentColor: null, accentForeground: null })
    const plain = (await publicGet(request, `/api/club_core/public/${slug}`)).body as unknown as ClubPage
    expect(plain.club.accent).toBeNull()
    expect(plain.sections.map((section) => [section.name, section.logo.source, section.logo.initial])).toEqual([
      ['Akademia', 'initial', 'A'],
      ['Basen', 'initial', 'B'],
    ])

    // Validation: a value that is not a hex colour is a 422 on the field; three digits and upper case are normalised.
    for (const bad of ['red', '#12345', 'rgb(0,0,0)', '#gggggg']) {
      const refused = await putSettings(request, admin, { accentColor: bad })
      expect(refused.status, `${bad} ${JSON.stringify(refused.body)}`).toBe(422)
      expect(JSON.stringify(refused.body)).toContain('accent_color_invalid')
    }
    expect((await putSettings(request, admin, { accentColor: '#FD0' })).status).toBe(200)
    expect(await getSettings(request, admin)).toMatchObject({ accentColor: '#ffdd00', accentForeground: '#000000' })

    // Default (no colour) in the browser: the hero, the header strip and the fallback logo use `--primary`, not grey.
    expect((await putSettings(request, admin, { accentColor: '' })).status).toBe(200)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/p/${slug}`)
    const hero = page.getByTestId('public-hero')
    await expect(hero).toBeVisible()
    await inBothSchemes(page, async (scheme) => {
      const primary = await resolvedColour(page, 'var(--primary)')
      const muted = await resolvedColour(page, 'var(--muted)')
      for (const element of [
        hero,
        page.getByTestId('public-header-accent'),
        page.getByTestId('public-logo-initial').first(),
      ]) {
        const { background } = await colours(element)
        expect(background, scheme).toBe(primary)
        expect(background, scheme).not.toBe(muted)
      }
      for (const element of [hero, page.getByTestId('public-logo-initial').first()]) {
        const { background, text } = await colours(element)
        expect(contrast(background, text), scheme).toBeGreaterThanOrEqual(4.5)
      }
      await shot(page, testInfo, `default-club-page-375-${scheme}`)
    })
    const tiles = page.getByTestId('public-sections')
    await expect(tiles.getByTestId('public-logo-initial')).toHaveText(['A', 'B'])

    // B-02: the administrator sets the navy colour (upper case, as typed in the field); white text is computed.
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    admin = await getAuthToken(request, club.tenant.email, password)
    await page.goto('/backend/club/settings')
    const field = page.locator('[data-crud-field-id="accentColor"] input')
    await field.fill('not a colour')
    await page
      .getByRole('button', { name: uiText('club_core.settings.save', { exact: true }) })
      .first()
      .click()
    await expect(page.getByText(uiText('club_core.errors.accent_color_invalid')).first()).toBeVisible()
    await field.fill(NAVY.toUpperCase())
    await page
      .getByRole('button', { name: uiText('club_core.settings.save', { exact: true }) })
      .first()
      .click()
    await expect
      .poll(async () => (await getSettings(request, admin)) as unknown)
      .toMatchObject({ accentColor: NAVY, accentForeground: '#ffffff' })
    await page.reload()
    await expect(field).toHaveValue(NAVY)
    await field.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('b02-club-colour-field-375.png') })
    await signOutBrowser(page)

    // Every public response carries the colour and its text colour.
    for (const path of [`/api/club_core/public/${slug}`, `/api/club_core/public/${slug}/sections/basen`]) {
      const result = await publicGet(request, path)
      expect(result.status, path).toBe(200)
      expect((result.body as unknown as ClubPage).club.accent, path).toEqual({ color: NAVY, foreground: '#ffffff' })
    }

    // The public pages in both schemes and both widths: navy with white text (14.03:1), the same in light and dark.
    await prepareForAccessibilityScan(page)
    const violations: Record<string, unknown[]> = {}
    await setGuestLocale(page, 'en')
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      for (const path of [`/p/${slug}`, `/p/${slug}/sections/basen`]) {
        await page.goto(path)
        await expect(page.getByTestId('public-hero')).toBeVisible()
        await inBothSchemes(page, async (scheme) => {
          const heroColours = await colours(page.getByTestId('public-hero'))
          expect(heroColours, `${path} ${scheme}`).toEqual({
            background: 'rgb(11, 42, 91)',
            text: 'rgb(255, 255, 255)',
          })
          expect(contrast(heroColours.background, heroColours.text)).toBeGreaterThanOrEqual(4.5)
          // The header strip carries no text: only its colour.
          expect((await colours(page.getByTestId('public-header-accent'))).background).toBe('rgb(11, 42, 91)')
          await shot(
            page,
            testInfo,
            `navy-${path.endsWith('basen') ? 'section' : 'club'}-page-${String(width)}-${scheme}-en`,
          )
        })
        await expectNoPageOverflow(page)
        if (width === 375) {
          Object.assign(
            violations,
            await scanInColorSchemes(page, testInfo, path, () => expect(page.getByTestId('public-hero')).toBeVisible()),
          )
        }
      }
    }

    // Polish at 375 px: the same colours.
    await setGuestLocale(page, 'pl')
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/p/${slug}`)
    await expect(page.getByTestId('public-hero')).toBeVisible()
    expect((await colours(page.getByTestId('public-hero'))).background).toBe('rgb(11, 42, 91)')
    await shot(page, testInfo, 'navy-club-page-375-light-pl')

    // A light colour gets black text on the section page's hero and its fallback logo (14.67:1).
    expect((await putSettings(request, admin, { accentColor: YELLOW })).status).toBe(200)
    await page.goto(`/p/${slug}/sections/akademia`)
    await expect(page.getByTestId('public-section-name')).toHaveText('Akademia')
    const yellowHero = await colours(page.getByTestId('public-hero'))
    expect(yellowHero).toEqual({ background: 'rgb(255, 212, 0)', text: 'rgb(0, 0, 0)' })
    await shot(page, testInfo, 'yellow-section-page-375-light-pl')
    await expect(page.getByTestId('public-hero').getByTestId('public-logo-initial')).toHaveText('A')

    // The member header bar on `/club` takes the colour too, in both schemes.
    expect((await putSettings(request, admin, { accentColor: NAVY })).status).toBe(200)
    await signInBrowser(page, request, club, member.userId, member.email)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/club')
    const bar = page.getByTestId('club-header-bar')
    await expect(bar).toContainText('Klub Delfin')
    await inBothSchemes(page, async (scheme) => {
      // After a reload the bar first shows the default until the member profile has loaded.
      await expect(bar).toContainText('Klub Delfin')
      await expect
        .poll(() => colours(bar), { message: scheme })
        .toEqual({ background: 'rgb(11, 42, 91)', text: 'rgb(255, 255, 255)' })
      const { background, text } = await colours(bar)
      expect(contrast(background, text), scheme).toBeGreaterThanOrEqual(4.5)
      // The evidence shot hides the platform's flash toast, which sits over the header (a separate E20 story).
      // Through the CSSOM: the nonce-based CSP of Open Mercato 0.10 blocks an injected <style> (#498).
      await page.locator('.z-toast').evaluateAll((toasts) => {
        for (const toast of toasts) (toast as HTMLElement).style.setProperty('display', 'none', 'important')
      })
      await shot(page, testInfo, `navy-member-today-375-${scheme}`)
    })
    Object.assign(
      violations,
      await scanInColorSchemes(page, testInfo, '/club', () =>
        expect(page.getByTestId('club-header-bar')).toBeVisible(),
      ),
    )
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
