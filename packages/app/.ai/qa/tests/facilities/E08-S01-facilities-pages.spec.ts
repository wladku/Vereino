import { expect, test } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { calendarDate, createClub } from '../_fixtures/club'
import { create } from '../_fixtures/club-structure'
import {
  ORLIK_HOURS,
  listZoneRules,
  postClosure,
  postRate,
  postZoneRule,
  setOpeningHours,
} from '../_fixtures/facilities'

// Issue #121 (E08-S01; README B-23, B-26): the facility pages of the club administrator. Every page has no critical
// or serious axe violation outside the platform baseline and reflows at 320 px; in the facility calendar the
// administrator sets Mon–Fri 16:00–22:00 through "Set booking availability", a 60-minute window is refused at the
// day, and "Remove" clears Friday from the weekly table. The calendar also renders in Polish.
test.describe.configure({ timeout: 300_000 })

test('E08-S01 facility pages: accessibility, reflow, booking availability dialog and the weekly table', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e08-s01-pages')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const pitch = await create(request, admin, 'places', { name: 'Boisko piłkarskie', kind: 'pitch' })
    await setOpeningHours(request, admin, pitch, ORLIK_HOURS)
    const zone = await postZoneRule(request, admin, {
      placeId: pitch,
      weekdays: [1, 2, 3, 4, 5],
      timeFrom: '08:00',
      timeTo: '22:00',
      zone: 'public_free',
      priority: 1,
      validFrom: today,
    })
    expect(zone.status, JSON.stringify(zone.body)).toBe(201)
    const closure = await postClosure(request, admin, {
      placeId: pitch,
      startsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 31 * 86_400_000).toISOString(),
      reason: 'snow',
    })
    expect(closure.status, JSON.stringify(closure.body)).toBe(201)
    const rate = await postRate(request, admin, {
      placeId: pitch,
      renterCategory: 'municipal_club',
      pricePer90: 15000,
      validFrom: today,
    })
    expect(rate.status, JSON.stringify(rate.body)).toBe(201)

    const login = await page.request.post('/api/auth/login', {
      form: { email: club.tenant.email, password: club.tenant.password },
    })
    expect(login.ok(), `POST /api/auth/login ${String(login.status())}`).toBe(true)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await prepareForAccessibilityScan(page)

    const pages = [
      '/backend/facilities/calendar',
      '/backend/facilities/zones',
      '/backend/facilities/zones/create',
      `/backend/facilities/zones/${String(zone.body?.id)}/edit`,
      '/backend/facilities/closures',
      '/backend/facilities/closures/create',
      `/backend/facilities/closures/${String(closure.body?.id)}/edit`,
      '/backend/facilities/rates',
      '/backend/facilities/rates/create',
      `/backend/facilities/rates/${String(rate.body?.id)}/edit`,
    ]
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 }
    const violationsByPage: Record<string, unknown> = {}
    for (const path of pages) {
      await page.setViewportSize(viewport)
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(/Access Denied|Brak dostępu/)).toHaveCount(0)
      const violations = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      if (violations.length > 0) violationsByPage[path] = violations
      await expectNoPageOverflow(page)
    }
    expect(violationsByPage).toEqual({})

    // Set booking availability: Mon–Fri 16:00–22:00 for the pitch.
    await page.setViewportSize(viewport)
    await page.goto('/backend/facilities/calendar')
    await page.getByTestId('facilities-availability-open').click()
    const dialog = page.getByTestId('facilities-availability-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('facilities-availability-workdays').click()
    await dialog.getByTestId('facilities-availability-all-from').fill('16:00')
    await dialog.getByTestId('facilities-availability-all-to').fill('22:00')
    await dialog.getByTestId('facilities-availability-save').click()
    await expect(page.getByTestId('facilities-availability-result')).toBeVisible()
    await expect(dialog).toBeHidden()
    for (const day of [1, 2, 3, 4, 5]) {
      await expect(page.getByTestId(`facilities-weekly-day-${String(day)}`)).toContainText('16:00')
    }
    await expect(page.getByTestId('facilities-weekly-day-6')).not.toContainText('16:00')

    // A 60-minute window is refused before anything is saved.
    const rulesBefore = (await listZoneRules(request, admin)).length
    await page.getByTestId('facilities-availability-open').click()
    await dialog.getByTestId('facilities-availability-workdays').click()
    await dialog.getByTestId('facilities-availability-all-from').fill('15:00')
    await dialog.getByTestId('facilities-availability-all-to').fill('16:00')
    await dialog.getByTestId('facilities-availability-save').click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('alert').first()).toContainText(/90/)
    expect((await listZoneRules(request, admin)).length).toBe(rulesBefore)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    // "Remove" clears Friday after a confirmation.
    await page.getByTestId('facilities-availability-remove-5').click()
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog'))
    await confirm.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByTestId('facilities-weekly-day-5')).not.toContainText('16:00')
    await expect(page.getByTestId('facilities-weekly-day-4')).toContainText('16:00')

    // The calendar at 375 px and in Polish.
    await page.setViewportSize({ width: 375, height: 800 })
    await page.context().addCookies([{ name: 'locale', value: 'pl', url: new URL(page.url()).origin }])
    await page.goto('/backend/facilities/calendar')
    await expect(page.getByTestId('facilities-weekly-availability')).toBeVisible()
    await expect(page.getByTestId('facilities-availability-open')).not.toHaveText(/Set booking availability/)
    await expectNoPageOverflow(page)
    expect(consoleErrors).toEqual([])
  } finally {
    await club.cleanup()
  }
})
