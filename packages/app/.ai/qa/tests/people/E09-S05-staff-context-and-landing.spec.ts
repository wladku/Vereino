import { expect, test, type Page } from '@playwright/test'
import { addDays, showCalendarWeekOf, weekdayOf } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { familyFor, oneOff } from '../_fixtures/attendance'
import { OPTIMISTIC_LOCK_HEADER, assignRole, calendarDate, call, createClub, userRoles } from '../_fixtures/club'
import { signInBrowser, signOutBrowser } from '../_fixtures/club-structure'
import { addMembership, signedInStaff } from '../_fixtures/groups'
import { getMe } from '../_fixtures/members'
import { createGuardianship } from '../_fixtures/people'
import { uiText } from '../_fixtures/ui-text'

// Issue #259 (E09-S05; navigation spec REQ-N07, REQ-N08, TEST-N07, TEST-N08, AC-N07, AC-N08): a person who only
// coaches starts in the staff context with no switcher and their calendar lists their sessions; a coach who
// coordinates and guards a ward gets the switcher "as member / guardian" · "as coach / coordinator", the member context
// by default, and one calendar list of the ward's and the coached sessions, a shared session once and opened as the
// coach. A stored staff context the person does not hold falls back to the default. Sign-in lands the attendant on
// `/club/facility`, an administrator with no member side on `/backend` and everyone else on `/club`, and an explicit
// redirect is kept. `GET /api/people/me` answers `isParticipant` and lists the `facility_operator` context.
test.describe.configure({ timeout: 420_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const TRAINING = 'Trening dodatkowy'
const POOL = 'Basen dodatkowy'

/** Sets a new password for a user (as superadmin); this ends the user's API tokens. */
async function newPassword(page: Page, superToken: string, userId: string): Promise<string> {
  const password = `Vereino-${String(Date.now())}-${userId.slice(0, 6)}-Aa1!`
  const reset = await call(page.request, 'PUT', '/api/auth/users', superToken, { data: { id: userId, password } })
  expect(reset.status, `PUT /api/auth/users ${JSON.stringify(reset.body)}`).toBe(200)
  return password
}

/** The sign-in answer for `email`: where it redirects, and the new access token. */
async function signIn(
  page: Page,
  email: string,
  password: string,
  redirect?: string,
): Promise<{ redirect: string; token: string }> {
  const form: Record<string, string> = { email, password }
  if (redirect) form.redirect = redirect
  const response = await page.request.post('/api/auth/login', { form })
  expect(response.ok(), `POST /api/auth/login ${String(response.status())}`).toBe(true)
  const body = (await response.json()) as { redirect?: string; token?: string }
  return { redirect: String(body.redirect), token: String(body.token) }
}

/** Sets the signed-in member's interface language through the profile route, then opens `path`. */
async function switchLocale(page: Page, locale: 'pl' | 'en', path: string): Promise<void> {
  const me = await page.request.get('/api/people/me')
  const body = (await me.json()) as { person: { updatedAt: string } }
  const saved = await page.request.put('/api/people/me', {
    data: { preferredLocale: locale },
    headers: { [OPTIMISTIC_LOCK_HEADER]: body.person.updatedAt },
  })
  expect(saved.status(), await saved.text()).toBe(200)
  await page.goto(path)
  await expect(page.locator('html')).toHaveAttribute('lang', locale)
}

test('E09-S05 the staff context for a coach-only person, the switcher for a coach with a ward, and the landing per role', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e09-s05')
  try {
    const family = await familyFor(request, club)
    const tomorrow = addDays(calendarDate(), 1)
    const since = addDays(calendarDate(), -30)
    // Tomorrow: a Żaki training (the coach's group) and a pool class.
    await oneOff(request, club, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: TRAINING,
      type: 'training',
      weekday: weekdayOf(tomorrow),
      fromDaysAhead: 1,
      start: '17:00',
      end: '18:00',
    })
    await oneOff(request, club, family.poolCoordinator.token, {
      groupId: family.poolGroup,
      placeId: family.poolPlace,
      name: POOL,
      type: 'training',
      weekday: weekdayOf(tomorrow),
      fromDaysAhead: 1,
      start: '19:00',
      end: '20:00',
    })
    const attendant = await signedInStaff(request, club, {
      firstName: 'Teresa',
      lastName: 'Dozorczyni',
      role: 'facility_operator',
      placeId: family.pitch,
    })
    const violations: Record<string, unknown> = {}

    // --- TEST-N08: the landing of each role and the profile facts ---
    const kept = '/club/messages/00000000-0000-4000-8000-000000000000'
    const coachPassword = await newPassword(page, club.superToken, family.coach.userId)
    expect((await signIn(page, family.coach.email, coachPassword)).redirect).toBe('/club')
    const guardianPassword = await newPassword(page, club.superToken, family.guardian.userId)
    expect((await signIn(page, family.guardian.email, guardianPassword)).redirect).toBe('/club')

    const attendantPassword = await newPassword(page, club.superToken, attendant.userId)
    const attendantLanding = await signIn(page, attendant.email, attendantPassword)
    expect(attendantLanding.redirect).toBe('/club/facility')
    expect((await signIn(page, attendant.email, attendantPassword, kept)).redirect).toBe(kept)
    const attendantMe = await getMe(request, attendantLanding.token)
    expect(attendantMe.status).toBe(200)
    expect(attendantMe.body?.isParticipant).toBe(false)
    expect(attendantMe.body?.contexts).toContain('facility_operator')
    // A participant with an account: the member side without a ward.
    const elderMe = await getMe(request, family.elder.token)
    expect(elderMe.body?.isParticipant).toBe(true)
    expect(elderMe.body?.wards).toEqual([])
    // The participant, and a coordinator who does not coach, land on `/club`; a member's explicit redirect is kept.
    const elderPassword = await newPassword(page, club.superToken, family.elder.userId)
    expect((await signIn(page, family.elder.email, elderPassword)).redirect).toBe('/club')
    expect((await signIn(page, family.guardian.email, guardianPassword, kept)).redirect).toBe(kept)
    const coordinatorPassword = await newPassword(page, club.superToken, family.poolCoordinator.userId)
    expect((await signIn(page, family.poolCoordinator.email, coordinatorPassword)).redirect).toBe('/club')

    // The administrator with no ward, no membership and no coach grant lands on the panel; once a parent, on `/club`.
    const adminEmail = club.tenant.email
    const adminPassword = await newPassword(page, club.superToken, club.adminUserId)
    const adminLanding = await signIn(page, adminEmail, adminPassword)
    expect(adminLanding.redirect).toBe('/backend')
    // The new password ended the administrator's API tokens: the sign-in answer's token is the one that works now.
    const adminToken = adminLanding.token
    await createGuardianship(request, adminToken, {
      guardianPersonId: club.adminPersonId,
      wardPersonId: family.other.child.personId,
      isPrimaryPayer: false,
      consents: { regulations: true },
      validFrom: since,
    })
    expect((await signIn(page, adminEmail, adminPassword)).redirect).toBe('/club')

    // --- TEST-N07: the coach-only person, at 375 px, in pl and en, light and dark ---
    await signOutBrowser(page)
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    for (const locale of ['pl', 'en'] as const) {
      await switchLocale(page, locale, '/club/calendar')
      await expect(page.getByTestId('club-calendar-toolbar')).toBeVisible()
      await expect(page.getByTestId('club-switcher-context')).toHaveCount(0)
      await expect(page.getByTestId('club-calendar-new-event')).toBeVisible()
      await showCalendarWeekOf(page, tomorrow)
      const session = page.getByTestId('calendar-item').filter({ hasText: TRAINING })
      await expect(session).toHaveCount(1)
      // The card title opens the session page; its "Attendance list" button opens the list (#272).
      await expect(session.getByRole('link').first()).toHaveAttribute('href', /\/club\/occurrences\/[^/?]+\?as=coach$/)
      await expect(
        session.getByRole('link', { name: uiText('activities.club.session.attendanceList', { exact: true }) }),
      ).toHaveAttribute('href', /\/club\/occurrences\/[^/]+\/attendance$/)
      await expect(page.getByTestId('calendar-item').filter({ hasText: POOL })).toHaveCount(0)
      Object.assign(
        violations,
        await scanInColorSchemes(
          page,
          testInfo,
          `/club/calendar coach-only (${locale})`,
          async () => {
            await expect(page.getByTestId('calendar-item').filter({ hasText: TRAINING })).toBeVisible()
          },
          { platformBaseline: true },
        ),
      )
      await expectNoPageOverflow(page)
    }
    // Today in the staff context: the coach tile only.
    await page.goto('/club')
    await expect(page.getByTestId('club-tile-coach')).toBeVisible()
    await expect(page.getByTestId('club-tile-calendar')).toHaveCount(0)
    await expect(page.getByTestId('club-switcher-context')).toHaveCount(0)

    // --- The coach coordinates the academy and guards a child who trains in Żaki and in the pool group ---
    await assignRole(request, adminToken, {
      personId: family.coach.personId,
      role: 'coordinator',
      sectionId: family.academy,
      validFrom: '2020-01-01',
    })
    await createGuardianship(request, adminToken, {
      guardianPersonId: family.coach.personId,
      wardPersonId: family.other.child.personId,
      isPrimaryPayer: false,
      consents: { regulations: true },
      validFrom: since,
    })
    await addMembership(request, adminToken, {
      groupId: family.poolGroup,
      personId: family.other.child.personId,
      role: 'participant',
      validFrom: since,
    })
    await expect
      .poll(() => userRoles(request, club, family.coach.userId), { timeout: 20_000 })
      .toContain('vereino_coordinator')
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    await switchLocale(page, 'pl', '/club')
    const context = page.locator('#club-switcher-context')
    await expect(context).toBeVisible()
    // The member context is the default.
    await expect(context).toHaveText(uiText('people.club.nav.contextMember'))
    await context.click()
    await expect(page.getByRole('option')).toHaveText([
      uiText('people.club.nav.contextMember', { exact: true }),
      uiText('people.club.nav.contextCoachCoordinator', { exact: true }),
    ])
    await page.keyboard.press('Escape')
    // The calendar of the member context: the ward's and the coached sessions in one list, the shared one once.
    await page.goto('/club/calendar')
    await expect(page.getByTestId('club-calendar-new-event')).toHaveCount(0)
    await showCalendarWeekOf(page, tomorrow)
    const shared = page.getByTestId('calendar-item').filter({ hasText: TRAINING })
    await expect(shared).toHaveCount(1)
    await expect(shared.getByRole('link').first()).toHaveAttribute('href', /\/club\/occurrences\/[^/]+\/attendance$/)
    await expect(page.getByTestId('calendar-item').filter({ hasText: POOL })).toHaveCount(1)
    const titles = await page.getByTestId('calendar-item').allInnerTexts()
    expect(titles.findIndex((text) => text.includes(TRAINING))).toBeLessThan(
      titles.findIndex((text) => text.includes(POOL)),
    )
    // The staff context lists the coached sessions only, and the choice is kept across pages.
    await page.locator('#club-switcher-context').click()
    await page.getByRole('option', { name: uiText('people.club.nav.contextCoachCoordinator', { exact: true }) }).click()
    await expect(page.getByTestId('calendar-item').filter({ hasText: POOL })).toHaveCount(0)
    await expect(page.getByTestId('calendar-item').filter({ hasText: TRAINING })).toHaveCount(1)
    await page.goto('/club')
    await expect(page.locator('#club-switcher-context')).toHaveText(
      uiText('people.club.nav.contextCoachCoordinator', { exact: true }),
    )
    await expect(page.getByTestId('club-tile-calendar')).toHaveCount(0)

    // --- Negative: a stored staff context the person does not hold falls back to the default ---
    await signOutBrowser(page)
    await signInBrowser(page, request, club, family.guardian.userId, family.guardian.email)
    await page.goto('/club')
    await expect(page.getByTestId('club-switcher-ward')).toBeVisible()
    const guardianMe = (await (await page.request.get('/api/people/me')).json()) as { person: { id: string } }
    await page.evaluate((personId) => {
      window.sessionStorage.setItem('vereino.member-context', JSON.stringify({ personId, role: 'staff', ward: 'all' }))
    }, guardianMe.person.id)
    await page.reload()
    await expect(page.getByTestId('club-switcher-ward')).toBeVisible()
    await expect(page.getByTestId('club-switcher-context')).toHaveCount(0)
    await expect(page.getByTestId('club-tile-calendar')).toBeVisible()
    await expect(page.getByTestId('club-tile-coach')).toHaveCount(0)

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
