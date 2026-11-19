import { expect, test, type APIRequestContext, type TestInfo } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  addParticipants,
  familyFor,
  memberAccount,
  readAttendanceList,
  rowOf,
  weeklySeries,
  type AttendanceList,
} from '../_fixtures/attendance'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  createSecondOrganization,
} from '../_fixtures/club'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { addMembership } from '../_fixtures/groups'
import { getMe, putMe } from '../_fixtures/members'
import { uiText } from '../_fixtures/ui-text'

// People life-cycle spec phase L7 (#309; REQ-L10, AC-L11): TEST-L11 — an adult participant gives and withdraws each of
// their own consents, stored with the author and the instant; a stale lock token answers 409; a 16-year-old with an
// account gets 422 `consents_minor`; the club administrator changes them on B-10's route; the administrator's person
// read carries them, a coordinator's and a guardian's read carry none; the coach's attendance read carries the
// `image` and `trips` flags (from the adult's own consents and from a ward's guardianship) and the coordinator's and the
// administrator's read carry none; the B-09 filter "missing consents" lists a participant without the regulations
// consent and refuses a coordinator. The phone profile M-10 at 375 px, in Polish and English, light and dark (axe):
// "My consents" with the effect lines, giving at once, a withdrawal that asks for confirmation; a minor has no section.
// TEST-L20 — the two consent routes fail closed for a member without `people.manage`, a person outside the
// organization and another organization's administrator.
test.describe.configure({ timeout: 420_000 })

type ConsentEntry = { granted: boolean; at: string | null; byPersonId: string | null }
type Consents = { regulations: ConsentEntry; image: ConsentEntry; trips: ConsentEntry }
type ConsentsResult = { consents?: Consents; updatedAt?: string | null; code?: string }
type FlagRow = AttendanceList['rows'] extends (infer R)[] | undefined
  ? R & { consentFlags?: { image: boolean; trips: boolean } }
  : never

function putOwn(request: APIRequestContext, token: string, changes: Record<string, boolean>, lock?: string | null) {
  return call<ConsentsResult>(request, 'PUT', '/api/people/me/consents', token, {
    data: { changes },
    headers: lock ? { [OPTIMISTIC_LOCK_HEADER]: lock } : {},
  })
}

function postFor(
  request: APIRequestContext,
  token: string,
  personId: string,
  changes: Record<string, boolean>,
  lock?: string | null,
) {
  return call<ConsentsResult>(request, 'POST', `/api/people/persons/${personId}/consents`, token, {
    data: { changes },
    headers: lock ? { [OPTIMISTIC_LOCK_HEADER]: lock } : {},
  })
}

async function lockOf(request: APIRequestContext, token: string): Promise<string> {
  const me = await getMe(request, token)
  expect(me.status, JSON.stringify(me.body)).toBe(200)
  return String(me.body?.person?.updatedAt)
}

function flagsOf(list: AttendanceList, personId: string) {
  return (rowOf(list, personId) as FlagRow).consentFlags
}

test('TEST-L11 an adult participant gives and withdraws own consents; the coach reads two flags, nobody else the consents', async ({
  request,
}) => {
  const club = await createClub(request, 'test-l11')
  try {
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const since = calendarDate(-30)
    const adultId = await createPerson(request, admin, {
      firstName: 'Beata',
      lastName: 'Dorosla L11',
      birthDate: birthDateTurning(25),
    })
    await addMembership(request, admin, {
      groupId: family.zaki,
      personId: adultId,
      role: 'participant',
      validFrom: since,
    })
    const adult = await memberAccount(request, club, adultId, 'beata-l11')

    // The adult's profile carries own consents, none given yet; the minor's carries none.
    const fresh = await call<{ person?: { updatedAt?: string | null }; ownConsents?: Consents | null }>(
      request,
      'GET',
      '/api/people/me',
      adult.token,
    )
    const freshBody = fresh.body
    expect(freshBody?.ownConsents?.regulations).toMatchObject({ granted: false, at: null })
    const minorMe = await getMe(request, family.elder.token)
    expect((minorMe.body as { ownConsents?: unknown } | null)?.ownConsents).toBeNull()

    // Give all three with the lock token: stored with the author and the instant.
    const given = await putOwn(
      request,
      adult.token,
      { regulations: true, image: true, trips: true },
      freshBody?.person?.updatedAt,
    )
    expect(given.status, JSON.stringify(given.body)).toBe(200)
    for (const kind of ['regulations', 'image', 'trips'] as const) {
      expect(given.body?.consents?.[kind]).toMatchObject({ granted: true, byPersonId: adultId })
      expect(given.body?.consents?.[kind].at).toBeTruthy()
    }
    // A stale lock token: 409; without one: 400.
    const stale = await putOwn(request, adult.token, { image: false }, freshBody?.person?.updatedAt)
    expect(stale.status).toBe(409)
    const unlocked = await putOwn(request, adult.token, { image: false })
    expect(unlocked.status).toBe(400)
    // Withdraw the image consent.
    const withdrawn = await putOwn(request, adult.token, { image: false }, given.body?.updatedAt)
    expect(withdrawn.status, JSON.stringify(withdrawn.body)).toBe(200)
    expect(withdrawn.body?.consents?.image).toMatchObject({ granted: false, byPersonId: adultId })
    expect(withdrawn.body?.consents?.regulations.granted).toBe(true)

    // The 16-year-old with an account: 422 `consents_minor`.
    const minor = await putOwn(
      request,
      family.elder.token,
      { regulations: true },
      await lockOf(request, family.elder.token),
    )
    expect(minor.status).toBe(422)
    expect(minor.body?.code).toBe('consents_minor')

    // The administrator changes them through B-10's route; the person read carries them only with `people.manage`.
    const adminRead = await call<{ updatedAt?: string; ownConsents?: Consents; holdsOwnConsents?: boolean }>(
      request,
      'GET',
      `/api/people/persons/${adultId}`,
      admin,
    )
    expect(adminRead.status).toBe(200)
    expect(adminRead.body?.holdsOwnConsents).toBe(true)
    expect(adminRead.body?.ownConsents?.image.granted).toBe(false)
    const byAdmin = await postFor(request, admin, adultId, { trips: false }, adminRead.body?.updatedAt)
    expect(byAdmin.status, JSON.stringify(byAdmin.body)).toBe(200)
    expect(byAdmin.body?.consents?.trips).toMatchObject({ granted: false, byPersonId: club.adminPersonId })
    const minorByAdmin = await postFor(
      request,
      admin,
      family.elder.personId,
      { regulations: true },
      String(
        (await call<{ updatedAt?: string }>(request, 'GET', `/api/people/persons/${family.elder.personId}`, admin)).body
          ?.updatedAt,
      ),
    )
    expect(minorByAdmin.status).toBe(422)
    const coordinatorRead = await call(
      request,
      'GET',
      `/api/people/persons/${adultId}`,
      family.academyCoordinator.token,
    )
    expect(coordinatorRead.status).toBe(200)
    expect(coordinatorRead.body).not.toHaveProperty('ownConsents')
    expect(coordinatorRead.body).not.toHaveProperty('consents')
    const guardianRead = await call(
      request,
      'GET',
      `/api/people/persons/${family.younger.personId}`,
      family.guardian.token,
    )
    // A member holds no `people.view`: the read is refused outright, and in no case carries the consents.
    expect(guardianRead.status).toBe(403)
    expect(guardianRead.body).not.toHaveProperty('ownConsents')

    // TEST-L20: the routes fail closed.
    const memberPost = await postFor(request, family.guardian.token, adultId, { image: true })
    expect(memberPost.status).toBe(403)
    const second = await createSecondOrganization(request, club)
    const foreign = await postFor(request, second.adminToken, adultId, { image: true }, new Date().toISOString())
    expect([403, 404]).toContain(foreign.status)
    const unknown = await postFor(request, admin, '00000000-0000-4000-8000-000000000001', { image: true })
    expect([400, 404]).toContain(unknown.status)
    const smuggled = await call<ConsentsResult>(request, 'PUT', '/api/people/me/consents', family.guardian.token, {
      data: { id: adultId, changes: { image: true } },
    })
    expect(smuggled.status).toBe(400)
    const afterAttempts = await call<{ ownConsents?: Consents }>(
      request,
      'GET',
      `/api/people/persons/${adultId}`,
      admin,
    )
    expect(afterAttempts.body?.ownConsents?.image.granted).toBe(false)

    // The coach's attendance read: two flags per participant — the adult's own consents, the ward's guardianship.
    const training = await weeklySeries(request, club, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening Żaków L11',
      type: 'training',
      weekday: 'TU',
      start: '17:00',
      end: '18:30',
    })
    const session = training.sessions[0]
    const coachList = await readAttendanceList(request, family.coach.token, session.id)
    expect(coachList.status, JSON.stringify(coachList.body)).toBe(200)
    const coachBody = coachList.body as AttendanceList
    expect(flagsOf(coachBody, adultId)).toEqual({ image: false, trips: false })
    expect(flagsOf(coachBody, family.younger.personId)).toEqual({ image: false, trips: false })
    const regive = await putOwn(request, adult.token, { image: true }, await lockOf(request, adult.token))
    expect(regive.status).toBe(200)
    const again = (await readAttendanceList(request, family.coach.token, session.id)).body as AttendanceList
    expect(flagsOf(again, adultId)).toEqual({ image: true, trips: false })
    for (const token of [family.academyCoordinator.token, admin]) {
      const list = await readAttendanceList(request, token, session.id)
      expect(list.status).toBe(200)
      expect(rowOf(list.body as AttendanceList, adultId)).not.toHaveProperty('consentFlags')
    }

    // B-09 "missing consents": a participant nobody gave the regulations consent for; not the adult, not the wards.
    const [unconsented] = await addParticipants(request, club, family.zaki, 1)
    const missing = await call<{ items?: { id: string }[] }>(
      request,
      'GET',
      '/api/people/persons?attention=missing_consents&pageSize=100',
      admin,
    )
    expect(missing.status, JSON.stringify(missing.body)).toBe(200)
    const missingIds = (missing.body?.items ?? []).map((item) => item.id)
    expect(missingIds).toContain(unconsented)
    expect(missingIds).not.toContain(adultId)
    expect(missingIds).not.toContain(family.younger.personId)
    const coordinatorFilter = await call(
      request,
      'GET',
      '/api/people/persons?attention=missing_consents',
      family.academyCoordinator.token,
    )
    expect(coordinatorFilter.status).toBe(403)
  } finally {
    await club.cleanup()
  }
})

test('TEST-L11 the phone profile: "My consents" with the effect lines, giving at once, withdrawing after a confirmation', async ({
  page,
  request,
}, testInfo: TestInfo) => {
  const club = await createClub(request, 'test-l11-ui')
  try {
    const admin = club.adminToken
    const adultId = await createPerson(request, admin, {
      firstName: 'Beata',
      lastName: 'Telefon L11',
      birthDate: birthDateTurning(25),
    })
    const adult = await memberAccount(request, club, adultId, 'beata-l11-ui')
    const minorId = await createPerson(request, admin, {
      firstName: 'Kuba',
      lastName: 'Nastolatek L11',
      birthDate: birthDateTurning(16),
    })
    const minor = await memberAccount(request, club, minorId, 'kuba-l11-ui')
    const given = await putOwn(
      request,
      adult.token,
      { regulations: true, image: true },
      await lockOf(request, adult.token),
    )
    expect(given.status, JSON.stringify(given.body)).toBe(200)

    // The phone profile at 375 px: "My consents" with the effect lines, in Polish and English, light and dark.
    const password = await signInBrowser(page, request, club, adult.userId, adult.email)
    const adultToken = await getAuthToken(request, adult.email, password)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    for (const locale of ['pl', 'en'] as const) {
      const saved = await putMe(request, adultToken, { preferredLocale: locale }, await lockOf(request, adultToken))
      expect(saved.status, JSON.stringify(saved.body)).toBe(200)
      await page.goto('/club/profile')
      const section = page.getByTestId('club-profile-own-consents')
      await expect(section).toBeVisible()
      await expect(section).toContainText(uiText('people.club.profile.ownConsents.title'))
      await expect(page.getByTestId('club-consent-effect-image')).toContainText(
        uiText('people.club.profile.consents.effect.image'),
      )
      await expectNoPageOverflow(page)
      Object.assign(
        violations,
        await scanInColorSchemes(
          page,
          testInfo,
          `/club/profile own consents (${locale})`,
          async () => {
            await expect(section).toBeVisible()
          },
          { platformBaseline: true },
        ),
      )
    }
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    // Giving saves at once.
    const tripsSwitch = page.getByTestId('club-own-consent-trips').getByRole('switch')
    await expect(tripsSwitch).not.toBeChecked()
    await tripsSwitch.click()
    await expect(tripsSwitch).toBeChecked()
    // Withdrawing asks first and names the effect; "Keep the consent" changes nothing.
    const imageSwitch = page.getByTestId('club-own-consent-image').getByRole('switch')
    await expect(imageSwitch).toBeChecked()
    await imageSwitch.click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText(uiText('people.club.profile.consents.effect.image'))
    await dialog.getByRole('button', { name: uiText('people.club.profile.ownConsents.confirm.keep') }).click()
    await expect(imageSwitch).toBeChecked()
    await imageSwitch.click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: uiText('people.club.profile.ownConsents.confirm.withdraw') })
      .click()
    await expect(imageSwitch).not.toBeChecked()
    const stored = await call<{ ownConsents?: Consents }>(request, 'GET', `/api/people/persons/${adultId}`, admin)
    expect(stored.body?.ownConsents?.trips.granted).toBe(true)
    expect(stored.body?.ownConsents?.image.granted).toBe(false)

    // The minor's profile has no "My consents".
    await switchBrowserUser(page, request, club, minor.userId, minor.email)
    await page.goto('/club/profile')
    await expect(page.getByTestId('club-profile-change-password')).toBeVisible()
    await expect(page.getByTestId('club-profile-own-consents')).toHaveCount(0)
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
