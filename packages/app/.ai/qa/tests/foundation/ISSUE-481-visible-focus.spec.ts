import { expect, test, type Locator, type Page } from '@playwright/test'
import { addDays, weekdayOf } from '../_fixtures/activities'
import { prepareForAccessibilityScan } from '../_fixtures/axe'
import { familyFor, oneOff } from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { uiText } from '../_fixtures/ui-text'

// Issue #481 (E20-S02; tokens.md C1, C2; WCAG 1.4.11, 2.4.7, 2.4.3): every focused element shows an indicator of at
// least 3:1 against what is behind it, field borders reach 3:1, the panel's sidebar group headings 4.5:1, and closing
// the "Cancel session" dialog (Esc or its Back button) puts focus back on the button that opened it, not on <body>.
// Measured in the browser from the computed styles, in light and dark, at 375 px and on the desktop panel, pl and en.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const SCHEMES = ['light', 'dark'] as const

type Measure = { focusVisible: boolean; ratio: number; width: number; kind: string; raw: string }

// Reads the element's focus indicator (an outline of at least 2 px, or the widest ring of a `box-shadow`) and its contrast
// against the first opaque background behind the element. Colours go through a canvas, which turns `oklch()` into sRGB.
// `indicator` is the element that draws the ring when it is not the focused one (the platform `Input` draws it on its
// wrapper with `focus-within`).
async function focusIndicator(page: Page, target: Locator, indicator: Locator = target): Promise<Measure> {
  // Keyboard modality first, so a programmatic focus matches `:focus-visible` as a Tab would.
  await page.keyboard.press('Shift')
  await target.focus()
  // Platform buttons have `transition-all`: the ring fades in, and a read during the fade sees a part of it.
  await indicator.evaluate(async (element) => {
    await Promise.allSettled(element.getAnimations().map((animation) => animation.finished))
  })
  return indicator.evaluate((element) => {
    const focused = document.activeElement
    const focusVisible = focused ? focused.matches(':focus-visible') : false
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('no canvas')
    const rgba = (color: string): number[] => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = 'rgba(0, 0, 0, 0)'
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data]
    }
    const luminance = (color: number[]): number => {
      const channel = (value: number) => {
        const v = value / 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(color[0] ?? 0) + 0.7152 * channel(color[1] ?? 0) + 0.0722 * channel(color[2] ?? 0)
    }
    const contrast = (a: number[], b: number[]): number => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05)
    }
    let background = rgba(getComputedStyle(document.body).backgroundColor)
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const color = rgba(getComputedStyle(parent).backgroundColor)
      if ((color[3] ?? 0) > 0) {
        background = color
        break
      }
    }
    const style = getComputedStyle(element)
    const outlineWidth = parseFloat(style.outlineWidth)
    if (style.outlineStyle !== 'none' && outlineWidth >= 2) {
      return {
        focusVisible,
        ratio: contrast(rgba(style.outlineColor), background),
        width: outlineWidth,
        kind: 'outline',
        raw: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
      }
    }
    // `box-shadow: <color> 0px 0px 0px <spread>, …` — the rings of the platform's `shadow-focus`.
    let best = { ratio: 0, width: 0 }
    for (const shadow of style.boxShadow.split(/,(?![^(]*\))/)) {
      const color = /(?:rgba?|oklch|oklab|lab|lch|color)\([^)]*\)|#[0-9a-f]+/i.exec(shadow)?.[0]
      const lengths = shadow.replace(color ?? '', '').match(/-?[\d.]+px/g) ?? []
      const spread = parseFloat(lengths[3] ?? '0')
      if (!color || spread < 2) continue
      const ratio = contrast(rgba(color), background)
      if (ratio > best.ratio) best = { ratio, width: spread }
    }
    return { focusVisible, ...best, kind: 'box-shadow', raw: style.boxShadow }
  })
}

// The contrast of an element's own colour property (its border or text) against the first opaque background behind it.
async function colorContrast(target: Locator, property: 'borderTopColor' | 'color'): Promise<number> {
  return target.evaluate((element, key) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('no canvas')
    const rgba = (color: string): number[] => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = 'rgba(0, 0, 0, 0)'
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data]
    }
    const luminance = (color: number[]): number => {
      const channel = (value: number) => {
        const v = value / 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(color[0] ?? 0) + 0.7152 * channel(color[1] ?? 0) + 0.0722 * channel(color[2] ?? 0)
    }
    let background = rgba(getComputedStyle(document.body).backgroundColor)
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const color = rgba(getComputedStyle(parent).backgroundColor)
      if ((color[3] ?? 0) > 0) {
        background = color
        break
      }
    }
    const own = rgba(getComputedStyle(element)[key])
    const [high, low] = [luminance(own), luminance(background)].sort((x, y) => y - x)
    return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05)
  }, property)
}

async function expectVisibleFocus(page: Page, target: Locator, label: string, indicator?: Locator): Promise<void> {
  const measure = await focusIndicator(page, target, indicator)
  expect(measure.focusVisible, `${label}: :focus-visible`).toBe(true)
  expect(measure.width, `${label}: indicator width (${measure.kind}: ${measure.raw})`).toBeGreaterThanOrEqual(2)
  expect(measure.ratio, `${label}: indicator contrast (${measure.kind}: ${measure.raw})`).toBeGreaterThanOrEqual(3)
}

async function applyScheme(page: Page, colorScheme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
  await page.reload()
  await page.waitForFunction(
    (dark) => document.documentElement.classList.contains('dark') === dark,
    colorScheme === 'dark',
  )
}

test('ISSUE-481 focus is visible on a button, a card link and a field in light and dark; closing the cancel dialog returns focus to its button; field borders and sidebar headings reach their contrast', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'issue-481')
  try {
    const family = await familyFor(request, club)
    const session = await oneOff(request, club, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening sobotni',
      type: 'training',
      weekday: weekdayOf(addDays(calendarDate(), 1)),
      fromDaysAhead: 1,
      start: '17:00',
      end: '18:00',
    })
    const sessionId = session.session.id

    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)

    for (const locale of ['pl', 'en'] as const) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
      for (const colorScheme of SCHEMES) {
        const label = `${locale} ${colorScheme}`
        // A card link on Today (`/club`).
        await page.goto('/club')
        await applyScheme(page, colorScheme)
        await expectVisibleFocus(page, page.getByTestId('club-tile-profile'), `${label} card link`)

        // A platform button, a platform field and its border on the coach's session page (M-04).
        await page.goto(`/club/occurrences/${sessionId}?as=coach`)
        await applyScheme(page, colorScheme)
        const trigger = page.getByTestId('club-session-cancel')
        await expectVisibleFocus(page, trigger, `${label} button`)

        // Esc: the dialog closes and focus is on its trigger again, not on <body>.
        await trigger.focus()
        await page.keyboard.press('Enter')
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        const reason = dialog.getByTestId('club-session-cancel-reason')
        expect(await colorContrast(reason, 'borderTopColor'), `${label} field border`).toBeGreaterThanOrEqual(3)
        await expectVisibleFocus(page, reason, `${label} field`)
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect(trigger).toBeFocused()
        expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)

        // The Back button in the footer returns focus the same way.
        await page.keyboard.press('Enter')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: uiText('activities.common.back', { exact: true }) }).click()
        await expect(dialog).toBeHidden()
        await expect(trigger).toBeFocused()
        if (locale === 'pl')
          await testInfo.attach(`m04-focus-${colorScheme}`, { body: await page.screenshot(), contentType: 'image/png' })
      }
    }

    // The panel at desktop width: a platform button, its sidebar group headings (≥ 4.5:1) and a field border.
    await page.setViewportSize({ width: 1280, height: 900 })
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    for (const colorScheme of SCHEMES) {
      await page.goto('/backend/club/sections/create')
      await applyScheme(page, colorScheme)
      const headings = page.locator('[data-sidebar-group] > button[aria-expanded]')
      await expect(headings.first()).toBeVisible()
      for (const heading of await headings.all()) {
        expect(await colorContrast(heading, 'color'), `${colorScheme} sidebar heading`).toBeGreaterThanOrEqual(4.5)
      }
      await expectVisibleFocus(page, headings.first(), `${colorScheme} sidebar heading button`)
      const field = page.locator('[data-crud-field-id="name"] input')
      const wrapper = field.locator('xpath=..')
      expect(
        await colorContrast(wrapper, 'borderTopColor'),
        `${colorScheme} panel field border`,
      ).toBeGreaterThanOrEqual(3)
      await expectVisibleFocus(page, field, `${colorScheme} panel field`, wrapper)
      await testInfo.attach(`panel-focus-${colorScheme}`, { body: await page.screenshot(), contentType: 'image/png' })
    }
  } finally {
    await club.cleanup()
  }
})
