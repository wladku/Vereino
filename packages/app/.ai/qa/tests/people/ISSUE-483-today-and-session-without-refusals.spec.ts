import { expect, test, type APIRequestContext, type Page, type Response } from '@playwright/test'
import { addDays, createEvent, zoneInstant } from '../_fixtures/activities'
import { familyFor } from '../_fixtures/attendance'
import { updateClubSettings } from '../_fixtures/members'
import { calendarDate, createClub, type Club } from '../_fixtures/club'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { signedInStaff } from '../_fixtures/groups'
import { uiTextIn } from '../_fixtures/ui-text'

// ISSUE-483 (E20-S04, epic #479; UX audit of 2026-11-20): Today (`/club`) and the session page ask only for what the
// viewer may read. A guardian, a facility attendant and a treasurer load Today with no HTTP 4xx and no toast (before:
// 403 `/api/payments/group-charges` with an English "Access denied … role "admin"" toast, 403
// `/api/payments/my-orders`); the coach still gets "My groups' payments". A coach and a coordinator load Today, the
// session page (before: 404 `?as=self`) and its edit form (before: 403 `?as=coach` for the coordinator) with no 4xx.
// A real refusal still raises a toast, in the page language (the platform writes it in English only).
test.describe.configure({ timeout: 480_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

type Person = { userId: string; email: string }

/** Every same-origin HTTP 4xx the page receives while `run` loads it, as `METHOD path?query status`. */
async function refusalsWhile(page: Page, run: () => Promise<void>): Promise<string[]> {
  const origin = new URL(BASE_URL).origin
  const refusals: string[] = []
  const onResponse = (response: Response) => {
    const url = new URL(response.url())
    if (url.origin !== origin || response.status() < 400 || response.status() >= 500) return
    refusals.push(`${response.request().method()} ${url.pathname}${url.search} ${String(response.status())}`)
  }
  page.on('response', onResponse)
  try {
    await run()
    await page.waitForLoadState('networkidle')
  } finally {
    page.off('response', onResponse)
  }
  return refusals
}

function toast(page: Page) {
  return page.locator('.z-toast [role="alert"]')
}

/** Today in `locale`: the member pages follow the club's default locale, so it is set together with the cookie. */
async function openToday(page: Page, request: APIRequestContext, club: Club, locale: 'en' | 'pl') {
  const settings = await updateClubSettings(request, club.adminToken, { defaultLocale: locale })
  expect(settings.status, JSON.stringify(settings.body)).toBe(200)
  await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
  await page.goto('/club')
  await expect(page.getByTestId('club-tile-profile')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', locale)
}

async function signIn(page: Page, request: APIRequestContext, club: Club, person: Person, first: boolean) {
  if (first) await signInBrowser(page, request, club, person.userId, person.email)
  else await switchBrowserUser(page, request, club, person.userId, person.email)
}

test('ISSUE-483 staff and guardians open Today and a session without 403/404 calls or an English toast', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'issue-483')
  try {
    const family = await familyFor(request, club)
    const attendant = await signedInStaff(request, club, {
      firstName: 'Olek',
      lastName: 'Gospodarz',
      role: 'facility_operator',
      placeId: family.pitch,
    })
    const treasurer = await signedInStaff(request, club, { firstName: 'Ewa', lastName: 'Skarbnik', role: 'treasurer' })
    const date = addDays(calendarDate(), 3)
    const created = await createEvent(request, club.adminToken, {
      groupId: family.zaki,
      type: 'other',
      name: 'Trening dodatkowy',
      placeId: family.pitch,
      startsAt: zoneInstant(date, '17:00'),
      endsAt: zoneInstant(date, '18:30'),
      coachPersonId: family.coach.personId,
    })
    expect(created.status, `POST /api/activities/events ${JSON.stringify(created.body)}`).toBe(201)
    const sessionId = String(created.body?.occurrenceId)

    page.setDefaultTimeout(30_000)
    const roles: [string, Person][] = [
      ['guardian', family.guardian],
      ['attendant', attendant],
      ['treasurer', treasurer],
    ]
    let first = true
    for (const [label, person] of roles) {
      await signIn(page, request, club, person, first)
      first = false
      for (const [locale, width] of [
        ['pl', 375],
        ['en', 1440],
      ] as const) {
        await page.setViewportSize({ width, height: 900 })
        const refusals = await refusalsWhile(page, () => openToday(page, request, club, locale))
        expect(refusals, `${label} on /club (${locale}, ${String(width)} px)`).toEqual([])
        await expect(toast(page), `${label}: no toast on /club`).toHaveCount(0)
        await expect(page.getByTestId('club-tile-coach-payments')).toHaveCount(0)
      }
    }

    // A real refusal still raises the toast, in the page language: the platform's text never shows.
    await signIn(page, request, club, family.guardian, false)
    for (const locale of ['pl', 'en'] as const) {
      await openToday(page, request, club, locale)
      await page.waitForLoadState('networkidle')
      await page.evaluate(async () => {
        await fetch('/api/payments/group-charges').catch(() => null)
      })
      // The catalog text up to the permission name: the platform's own English text differs from both catalogs there.
      const [lead] = uiTextIn(locale, 'vereino.flash.accessDeniedFeature').split('{features}')
      await expect(toast(page)).toContainText(lead ?? '')
      await expect(toast(page)).toContainText('payments.groups.view')
    }

    // The coach and the coordinator: Today, the session page and its edit form, opened without `?as=`.
    const staff: [string, Person, boolean][] = [
      ['coach', family.coach, true],
      ['coordinator', family.academyCoordinator, false],
    ]
    for (const [label, person, coaches] of staff) {
      await signIn(page, request, club, person, false)
      for (const [locale, width] of [
        ['pl', 375],
        ['en', 1440],
      ] as const) {
        await page.setViewportSize({ width, height: 900 })
        const today = await refusalsWhile(page, () => openToday(page, request, club, locale))
        expect(today, `${label} on /club (${locale}, ${String(width)} px)`).toEqual([])
        await expect(toast(page)).toHaveCount(0)
        if (coaches) await expect(page.getByTestId('club-tile-coach-payments')).toBeVisible()

        const session = await refusalsWhile(page, async () => {
          await page.goto(`/club/occurrences/${sessionId}`)
          await expect(page.getByTestId('club-session-edit')).toBeVisible()
        })
        expect(session, `${label} on the session page (${locale}, ${String(width)} px)`).toEqual([])
        await expect(page.getByTestId('club-session-missing')).toHaveCount(0)

        const edit = await refusalsWhile(page, async () => {
          await page.goto(`/club/occurrences/${sessionId}/edit`)
          await expect(page.getByTestId('club-edit-submit')).toBeVisible()
        })
        expect(edit, `${label} on the edit form (${locale}, ${String(width)} px)`).toEqual([])
        await expect(toast(page)).toHaveCount(0)
      }
    }
  } finally {
    await club.cleanup()
  }
})
