import { expect, test, type Locator, type Page } from '@playwright/test'
import { addDays, weekdayOf } from '../_fixtures/activities'
import { familyFor, oneOff } from '../_fixtures/attendance'
import { calendarDate, call, createClub } from '../_fixtures/club'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { ORLIK_HOURS, setOpeningHours } from '../_fixtures/facilities'

// E20-S13 (#492, epic #479 owner decision 6): an information notice is the `Notice` of `@vereino/ui` — the light
// `--status-info-bg` background, not the saturated `--status-info-border` the platform `<Alert>` defaults to — and the
// checkboxes and radios fill with `--primary` instead of `--accent-indigo`.
// - B-23 as the administrator: "No entries on this day" on an empty day of the facility calendar.
// - M-05 as the coach: "The list opens at …" on the attendance list before the session.
// - M-08 as the guardian: a payable charge's checkbox is checked and filled with `--primary`, ≥ 3:1 on its card.
// Both locales, light and dark, desktop and 375 px; screenshots are attached to the report as PR evidence.
test.describe.configure({ timeout: 420_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type Rgb = [number, number, number]
type Paint = { actual: Rgb; expected: Rgb; heavy: Rgb; surface: Rgb }

/**
 * Reads `property` of the element and the colour of `token` (and of `heavy`) as sRGB through a 1 px canvas, so any CSS
 * colour syntax (oklch, hex, rgb) compares equal when it paints the same; `surface` is the nearest opaque background.
 */
async function paint(locator: Locator, property: 'backgroundColor' | 'accentColor', token: string, heavy: string) {
  return locator.evaluate(
    (element, args) => {
      const context = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D
      const rgb = (color: string): [number, number, number] => {
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = color
        context.fillRect(0, 0, 1, 1)
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data
        return [r, g, b]
      }
      const resolve = (expression: string) => {
        const probe = document.createElement('span')
        probe.style.color = expression
        element.parentElement?.append(probe)
        const color = getComputedStyle(probe).color
        probe.remove()
        return color
      }
      let host: Element | null = element.parentElement
      while (host && ['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(host).backgroundColor)) {
        host = host.parentElement
      }
      return {
        actual: rgb(getComputedStyle(element)[args.property]),
        expected: rgb(resolve(`var(${args.token})`)),
        heavy: rgb(resolve(`var(${args.heavy})`)),
        surface: rgb(getComputedStyle(host ?? document.body).backgroundColor),
      }
    },
    { property, token, heavy },
  ) as Promise<Paint>
}

function contrast(a: Rgb, b: Rgb): number {
  const luminance = (rgb: Rgb) => {
    const [r, g, b] = rgb.map((channel) => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** The notice paints `--status-info-bg`, not the platform default `--status-info-border`. */
async function expectLightInfoNotice(notice: Locator) {
  await expect(notice).toBeVisible()
  await expect(notice).toHaveAttribute('data-style', 'lighter')
  const colours = await paint(notice, 'backgroundColor', '--status-info-bg', '--status-info-border')
  expect(colours.actual).toEqual(colours.expected)
  expect(colours.actual).not.toEqual(colours.heavy)
}

async function setLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

/** Runs `check` at 1440 and 375 px, in both locales and both colour schemes, attaching a screenshot of each. */
async function everyVariant(
  page: Page,
  attach: (name: string, body: Buffer) => Promise<void>,
  name: string,
  check: () => Promise<void>,
) {
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 })
    for (const locale of ['pl', 'en'] as const) {
      await setLocale(page, locale)
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        await check()
        await attach(`${name}-${String(width)}-${locale}-${colorScheme}`, await page.screenshot({ fullPage: true }))
      }
    }
  }
}

test('E20-S13 info notices use the light info style and checkboxes fill with the primary colour', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e20-s13')
  try {
    const admin = club.adminToken
    const family = await familyFor(request, club)
    const today = calendarDate()
    const tomorrow = addDays(today, 1)
    const training = await oneOff(request, club, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening dodatkowy',
      type: 'training',
      weekday: weekdayOf(tomorrow),
      fromDaysAhead: 1,
      start: '17:00',
      end: '18:00',
    })
    await setOpeningHours(request, admin, family.pitch, ORLIK_HOURS)
    const charge = await call<{ chargeId?: string }>(request, 'POST', '/api/payments/charges', admin, {
      data: {
        personId: family.younger.personId,
        description: 'Składka listopad',
        amount: 5000,
        dueDate: addDays(today, 14),
      },
    })
    expect(charge.status, JSON.stringify(charge.body)).toBe(201)
    const chargeId = String(charge.body?.chargeId)

    page.setDefaultTimeout(30_000)
    const attach = (name: string, body: Buffer) => testInfo.attach(name, { body, contentType: 'image/png' })

    // B-23: a day of the pitch without entries (three days ahead; the training is tomorrow).
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    const emptyDay = addDays(today, 3)
    await everyVariant(page, attach, 'b23-calendar-empty', async () => {
      await page.goto(`/backend/facilities/calendar?place=${family.pitch}&date=${emptyDay}`)
      await expectLightInfoNotice(page.getByTestId('facilities-calendar-empty'))
    })

    // M-05: the attendance list before the session.
    await switchBrowserUser(page, request, club, family.coach.userId, family.coach.email)
    await everyVariant(page, attach, 'm05-attendance-not-started', async () => {
      await page.goto(`/club/occurrences/${training.session.id}/attendance`)
      await expectLightInfoNotice(page.getByTestId('club-attendance-not-started'))
    })

    // M-08: the payable charge is selected; its checkbox fills with `--primary`, at least 3:1 on the charge card.
    await switchBrowserUser(page, request, club, family.guardian.userId, family.guardian.email)
    await everyVariant(page, attach, 'm08-payments-checkbox', async () => {
      await page.goto('/club/payments')
      const checkbox = page.locator(`[data-testid="club-charge"][data-charge-id="${chargeId}"]`).getByRole('checkbox')
      await expect(checkbox).toBeChecked()
      const colours = await paint(checkbox, 'accentColor', '--primary', '--accent-indigo')
      expect(colours.actual).toEqual(colours.expected)
      expect(colours.actual).not.toEqual(colours.heavy)
      expect(contrast(colours.actual, colours.surface)).toBeGreaterThanOrEqual(3)
    })
  } finally {
    await club.cleanup()
  }
})
