import { expect, test, type APIRequestContext, type TestInfo } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { addDays } from '../_fixtures/activities'
import { familyFor, memberAccount } from '../_fixtures/attendance'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
} from '../_fixtures/club'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { addMembership } from '../_fixtures/groups'
import { getMe, putMe } from '../_fixtures/members'
import { uiText } from '../_fixtures/ui-text'

// People life-cycle spec phase L4 (#306; REQ-L03, AC-L04, J-L02 step 1): TEST-L05 — a guardian (for herself and a
// ward), an adult participant and a coach each send a request to leave; a second open request answers 409
// `departure_request_exists`, another family's child 403, a minor 422 `departure_request_minor`; the requests show on
// B-10's Leaving tab and in the administrator's list (the "Departure requests" widget's source); the administrator
// declines one with a reason, which the member reads; a member withdraws their own request; with the limiter on, the
// sixth request in 24 hours answers 429 with `Retry-After`. The phone page `/club/profile/leave` at 375 px, in Polish
// and English, light and dark (axe), and the profile of a minor without the link; sending with nobody chosen shows
// the error summary and focuses the first person (#490). TEST-L20 — the request routes fail
// closed for a member (the administrator's list and decision) and for another organization.
test.describe.configure({ timeout: 420_000 })

type RequestRow = {
  id: string
  batchId: string
  subjectPersonId: string
  status: string
  declineReason: string | null
  requesterKind: string
  otherGuardianCount: number
  updatedAt: string
}

function file(
  request: APIRequestContext,
  token: string,
  data: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  return call<{ batchId?: string; requestIds?: string[]; code?: string; retryAfterSeconds?: number }>(
    request,
    'POST',
    '/api/people/me/departure-requests',
    token,
    { data, headers },
  )
}

async function mine(request: APIRequestContext, token: string): Promise<RequestRow[]> {
  const result = await call<{ items?: RequestRow[] }>(request, 'GET', '/api/people/me/departure-requests', token)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body?.items ?? []
}

function withdraw(request: APIRequestContext, token: string, batchId: string) {
  return call(request, 'DELETE', `/api/people/me/departure-requests/${batchId}`, token)
}

async function adminList(request: APIRequestContext, token: string, query: string) {
  return call<{ items?: RequestRow[]; total?: number; code?: string }>(
    request,
    'GET',
    `/api/people/departure-requests?${query}`,
    token,
  )
}

test('TEST-L05 members ask to leave from the phone; the club sees, declines and the member reads the reason', async ({
  page,
  request,
}, testInfo: TestInfo) => {
  const club = await createClub(request, 'test-l05')
  try {
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const lastDay = addDays(calendarDate(), 20)

    // The guardian for herself and the younger ward: 201, one row per person in one batch.
    const guardian = await file(request, family.guardian.token, {
      subjectPersonIds: [family.guardian.personId, family.younger.personId],
      lastDay,
      erasure: false,
      note: 'Przeprowadzka',
    })
    expect(guardian.status, JSON.stringify(guardian.body)).toBe(201)
    expect(guardian.body?.requestIds).toHaveLength(2)
    const guardianBatch = String(guardian.body?.batchId)

    // A second open request for the same ward: 409; another family's child: 403; a past day: 422.
    const twice = await file(request, family.guardian.token, {
      subjectPersonIds: [family.younger.personId],
      erasure: false,
    })
    expect(twice.status).toBe(409)
    expect(twice.body?.code).toBe('departure_request_exists')
    const stranger = await file(request, family.guardian.token, {
      subjectPersonIds: [family.other.child.personId],
      erasure: false,
    })
    expect(stranger.status).toBe(403)
    const past = await file(request, family.guardian.token, {
      subjectPersonIds: [family.elder.personId],
      lastDay: addDays(calendarDate(), -1),
      erasure: false,
    })
    expect(past.status).toBe(422)

    // The 16-year-old with an account asks for nothing.
    const minor = await file(request, family.elder.token, { subjectPersonIds: [family.elder.personId], erasure: false })
    expect(minor.status).toBe(422)
    expect(minor.body?.code).toBe('departure_request_minor')

    // A coach for himself.
    const coach = await file(request, family.coach.token, { subjectPersonIds: [family.coach.personId], erasure: true })
    expect(coach.status, JSON.stringify(coach.body)).toBe(201)

    // An adult participant for herself, then she withdraws it.
    const adultId = await createPerson(request, admin, {
      firstName: 'Beata',
      lastName: 'Dorosla L05',
      birthDate: birthDateTurning(25),
    })
    await addMembership(request, admin, {
      groupId: family.poolGroup,
      personId: adultId,
      role: 'participant',
      validFrom: calendarDate(),
    })
    const adult = await memberAccount(request, club, adultId, 'beata')
    const adultFiled = await file(request, adult.token, { subjectPersonIds: [adultId], erasure: false })
    expect(adultFiled.status, JSON.stringify(adultFiled.body)).toBe(201)
    expect((await mine(request, adult.token)).map((row) => row.status)).toEqual(['open'])
    const withdrawn = await withdraw(request, adult.token, String(adultFiled.body?.batchId))
    expect(withdrawn.status).toBe(204)
    expect(await mine(request, adult.token)).toEqual([])
    // Somebody else's batch cannot be withdrawn by this member.
    const notMine = await withdraw(request, adult.token, guardianBatch)
    expect(notMine.status).toBe(409)

    // The administrator's list: the open requests, the guardian's request flags no other guardian (Anna is the only
    // one); a member gets 403 on that list.
    const open = await adminList(request, admin, 'status=open&pageSize=20')
    expect(open.status, JSON.stringify(open.body)).toBe(200)
    expect(open.body?.items?.map((row) => row.subjectPersonId).sort()).toEqual(
      [family.guardian.personId, family.younger.personId, family.coach.personId].sort(),
    )
    expect(open.body?.items?.find((row) => row.subjectPersonId === family.younger.personId)).toMatchObject({
      requesterKind: 'guardian',
      otherGuardianCount: 0,
    })
    const memberList = await adminList(request, family.guardian.token, 'status=open')
    expect(memberList.status).toBe(403)

    // The administrator declines the coach's request with a reason; the coach reads it.
    const coachRow = open.body?.items?.find((row) => row.subjectPersonId === family.coach.personId) as RequestRow
    const declined = await call<{ code?: string }>(request, 'PUT', '/api/people/departure-requests', admin, {
      data: { id: coachRow.id, reason: 'Najpierw rozliczenie sprzętu' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: coachRow.updatedAt },
    })
    expect(declined.status, JSON.stringify(declined.body)).toBe(200)
    expect((await mine(request, family.coach.token))[0]).toMatchObject({
      status: 'declined',
      declineReason: 'Najpierw rozliczenie sprzętu',
    })
    const declinedAgain = await call<{ code?: string }>(request, 'PUT', '/api/people/departure-requests', admin, {
      data: { id: coachRow.id, reason: 'x' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: new Date().toISOString() },
    })
    expect(declinedAgain.status).toBe(409)
    // A member cannot decline.
    const memberDecline = await call(request, 'PUT', '/api/people/departure-requests', family.guardian.token, {
      data: { id: coachRow.id, reason: 'x' },
    })
    expect(memberDecline.status).toBe(403)

    // The administrator records the club's own decision for the adult participant.
    const recorded = await call<{ id?: string }>(request, 'POST', '/api/people/departure-requests', admin, {
      data: { subjectPersonId: adultId, requesterKind: 'club', note: 'Nie przychodzi od miesięcy' },
    })
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(201)

    // With the limiter on, the adult participant's sixth request in 24 hours answers 429 with `Retry-After`.
    const limited = { 'x-om-test-rate-limit': 'on' }
    const limiterAdultId = await createPerson(request, admin, {
      firstName: 'Celina',
      lastName: 'Limit L05',
      birthDate: birthDateTurning(30),
    })
    const limiterAdult = await memberAccount(request, club, limiterAdultId, 'celina')
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const ok = await file(
        request,
        limiterAdult.token,
        { subjectPersonIds: [limiterAdultId], erasure: false },
        limited,
      )
      expect(ok.status, JSON.stringify(ok.body)).toBe(201)
      expect((await withdraw(request, limiterAdult.token, String(ok.body?.batchId))).status).toBe(204)
    }
    const sixth = await file(
      request,
      limiterAdult.token,
      { subjectPersonIds: [limiterAdultId], erasure: false },
      limited,
    )
    expect(sixth.status).toBe(429)
    expect(Number(sixth.response.headers()['retry-after'])).toBeGreaterThan(0)

    // B-10's Leaving tab shows the guardian's open request.
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await page.goto(`/backend/people/persons/${family.younger.personId}?tab=leaving`)
    await expect(page.getByTestId('people-leaving-request')).toHaveCount(1)
    await expect(page.getByTestId('people-leaving-request')).toContainText('Przeprowadzka')

    // The phone page as the guardian, at 375 px: the open request with "Withdraw", in Polish and English, light and
    // dark; the profile links to it.
    const password = await switchBrowserUser(page, request, club, family.guardian.userId, family.guardian.email)
    const guardianToken = await getAuthToken(request, family.guardian.email, password)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    for (const locale of ['pl', 'en'] as const) {
      const me = await getMe(request, guardianToken)
      const saved = await putMe(request, guardianToken, { preferredLocale: locale }, me.body?.person?.updatedAt)
      expect(saved.status, JSON.stringify(saved.body)).toBe(200)
      await page.goto('/club/profile')
      await expect(page.getByTestId('club-profile-leave')).toBeVisible()
      await page.goto('/club/profile/leave')
      await expect(page.getByTestId('club-leave-open')).toBeVisible()
      await expect(page.getByTestId('club-leave-open')).toContainText(uiText('people.club.leave.withdraw'))
      await expectNoPageOverflow(page)
      Object.assign(
        violations,
        await scanInColorSchemes(
          page,
          testInfo,
          `/club/profile/leave open (${locale})`,
          async () => {
            await expect(page.getByTestId('club-leave-open')).toBeVisible()
          },
          { platformBaseline: true },
        ),
      )
    }
    // Withdraw from the phone, then the form is back.
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.getByRole('button', { name: uiText('people.club.leave.withdraw') }).click()
    await expect(page.getByTestId('club-leave-form')).toBeVisible()
    Object.assign(
      violations,
      await scanInColorSchemes(
        page,
        testInfo,
        '/club/profile/leave form',
        async () => {
          await expect(page.getByTestId('club-leave-form')).toBeVisible()
        },
        { platformBaseline: true },
      ),
    )
    await expectNoPageOverflow(page)
    // Nobody chosen (#490): "Send" stays enabled, the summary says what is missing and the focus lands on the first
    // person; choosing again clears it.
    const me = page.locator('[id^="club-leave-who-"]').first()
    await me.click()
    await expect(me).not.toBeChecked()
    await expect(page.getByTestId('club-leave-send')).toBeEnabled()
    await page.getByTestId('club-leave-send').click()
    await expect(page.getByTestId('club-leave-problems').getByRole('link')).toHaveText([
      uiText('people.club.leave.errors.whoRequired', { exact: true }),
    ])
    await expect(page.getByTestId('club-leave-who-error')).toHaveText(
      uiText('people.club.leave.errors.whoRequired', { exact: true }),
    )
    await expect(me).toBeFocused()
    await expect(page.getByTestId('club-leave-open')).toHaveCount(0)
    await me.click()
    await expect(page.getByTestId('club-leave-problems')).toHaveCount(0)
    // The guardian sends it again from the phone.
    await page.getByTestId('club-leave-send').click()
    await expect(page.getByTestId('club-leave-open')).toBeVisible()

    // The minor's profile has no link, and the page says a guardian asks.
    await switchBrowserUser(page, request, club, family.elder.userId, family.elder.email)
    await page.goto('/club/profile')
    await expect(page.getByTestId('club-profile-change-password')).toBeVisible()
    await expect(page.getByTestId('club-profile-leave')).toHaveCount(0)
    await page.goto('/club/profile/leave')
    await expect(page.getByTestId('club-leave-minor')).toBeVisible()
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
