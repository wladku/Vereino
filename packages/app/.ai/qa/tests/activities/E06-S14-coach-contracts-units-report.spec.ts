import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { createActivity, type OccurrenceItem } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { familyFor, saveAttendanceList, sessionsOf, startNow } from '../_fixtures/attendance'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, createClub, type Club } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { signedInStaff } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'

// Issue #96 (E06-S14; README B-07, B-16, More → My units; club spec REQ-008, REQ-021, AC-008, AC-021, TEST-013): this
// month Marek leads one Żaki training, hands a second one over to Bartek (a substitution, R04) and leads an away
// match; Irena leads a pool class. The report counts Marek planned 2 / handed over 1 / taken over 0 / balance 1 /
// matches 1 / trips 1 and Bartek taken over 1 / balance 1. The administrator records Marek's coach contract (a second,
// overlapping one answers 409; a coach contract with an institution 422) and reads the amount in both settlement
// models; the academy coordinator reads her section without amounts; a coach reads only their own row, also with
// another section asked for. The CSV carries the AC columns. In the browser the administrator sees the model, the
// amount, "No contract" and "No closed sessions this month" for an empty month; Marek opens More → My units on the
// phone (375 px, English and Polish, light and dark) and sees his row without an amount.
test.describe.configure({ timeout: 600_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type ReportRow = {
  personId: string
  coachName: string | null
  planned: number
  handedOver: number
  takenOver: number
  balance: number
  matches: number
  trips: number
  sessions: { id: string; role: string }[]
  amount?: number | null
  contractState?: string
}
type Report = {
  code?: string
  perspective?: string
  model?: string
  withAmounts?: boolean
  items?: ReportRow[]
  unsettledCount?: number
}
type ContractItem = { id: string; updatedAt: string; partyName?: string | null; terms: Record<string, number> | null }

const lock = (updatedAt: string | null | undefined): Record<string, string> =>
  updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: updatedAt } : {}

async function report(request: APIRequestContext, token: string, query: string) {
  return call<Report>(request, 'GET', `/api/activities/reports/coach-units?${query}`, token)
}

async function csv(request: APIRequestContext, token: string, query: string): Promise<string> {
  const response = await request.get(`/api/activities/reports/coach-units?${query}&format=csv`, {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('text/csv')
  return response.text()
}

const rowOf = (body: Report | null, personId: string): ReportRow | undefined =>
  body?.items?.find((row) => row.personId === personId)

/** A one-off session of `type` today (start it with `startNow` once every session exists, so the windows do not collide). */
async function todaySession(
  request: APIRequestContext,
  club: Club,
  input: {
    groupId: string
    placeId: string
    name: string
    type: string
    coachPersonId: string
    time: string
    isAway?: boolean
  },
): Promise<OccurrenceItem> {
  const [hours] = input.time.split(':').map(Number)
  const { id } = await createActivity(request, club.adminToken, {
    groupId: input.groupId,
    name: input.name,
    type: input.type,
    placeId: input.placeId,
    coachPersonId: input.coachPersonId,
    startsOn: calendarDate(),
    startTime: input.time,
    endTime: `${String(hours).padStart(2, '0')}:45`,
    ...(input.isAway ? { isAway: true } : {}),
  })
  const session = (await sessionsOf(request, club, id)).at(0)
  if (!session) throw new Error(`[test] ${input.name} has no session`)
  return session
}

async function close(request: APIRequestContext, token: string, id: string, version: string) {
  const closed = await saveAttendanceList(request, token, id, { entries: [], complete: true }, version)
  expect(closed.status, JSON.stringify(closed.body)).toBe(200)
}

test('E06-S14 coach contracts, the monthly coach units report with amounts and CSV, and My units on the phone', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e06-s14')
  try {
    const month = calendarDate().slice(0, 7)
    const family = await familyFor(request, club)
    const marek = family.coach
    const bartek = await signedInStaff(request, club, { firstName: 'Bartek', lastName: 'Zastępca', role: 'coach' })

    // --- This month's closed sessions ---
    const own = await todaySession(request, club, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening Żaków',
      type: 'training',
      coachPersonId: marek.personId,
      time: '20:00',
    })
    const handed = await todaySession(request, club, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening Żaków — zastępstwo',
      type: 'training',
      coachPersonId: marek.personId,
      time: '21:00',
    })
    const match = await todaySession(request, club, {
      groupId: family.zaki,
      placeId: family.lockerRoom,
      name: 'Mecz wyjazdowy',
      type: 'match',
      coachPersonId: marek.personId,
      time: '22:00',
      isAway: true,
    })
    const pool = await todaySession(request, club, {
      groupId: family.poolGroup,
      placeId: family.poolPlace,
      name: 'Basen poranny',
      type: 'training',
      coachPersonId: family.instructor.personId,
      time: '20:00',
    })
    const versions = new Map<string, string>()
    for (const session of [own, handed, match, pool])
      versions.set(session.id, await startNow(request, club, session.id))
    const version = (session: OccurrenceItem): string => versions.get(session.id) ?? ''
    // The coordinator gives the second training to Bartek; the unit is credited to him when he closes it (R04).
    const assigned = await call<{ updatedAt?: string }>(
      request,
      'POST',
      `/api/activities/occurrences/${handed.id}/coach`,
      family.academyCoordinator.token,
      { data: { coachPersonId: bartek.personId }, headers: lock(version(handed)) },
    )
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200)
    const reread = await call<{ updatedAt?: string }>(
      request,
      'GET',
      `/api/activities/occurrences/${handed.id}`,
      club.adminToken,
    )
    await close(request, marek.token, own.id, version(own))
    await close(request, bartek.token, handed.id, String(reread.body?.updatedAt))
    await close(request, marek.token, match.id, version(match))
    await close(request, family.instructor.token, pool.id, version(pool))

    // --- Contracts: Marek's coach contract; an overlapping second one → 409; a coach contract with an institution → 422 ---
    const contract = {
      partyType: 'person',
      partyId: marek.personId,
      kind: 'coach',
      validFrom: `${month}-01`,
      validTo: null,
      terms: { baseMonthly: 150000, unitRate: 8000, matchRate: 10000, travelRate: 5000 },
    }
    const created = await call<{ id?: string }>(request, 'POST', '/api/club_core/contracts', club.adminToken, {
      data: contract,
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const overlap = await call<{ code?: string }>(request, 'POST', '/api/club_core/contracts', club.adminToken, {
      data: { ...contract, validFrom: `${month}-15`, validTo: `${month}-20` },
    })
    expect(overlap.status, JSON.stringify(overlap.body)).toBe(409)
    expect(overlap.body?.code).toBe('contract_overlap')
    const missingRate = await call<{ code?: string }>(request, 'POST', '/api/club_core/contracts', club.adminToken, {
      data: { ...contract, partyId: bartek.personId, terms: { baseMonthly: 100000 } },
    })
    expect(missingRate.status, JSON.stringify(missingRate.body)).toBe(422)
    expect(missingRate.body?.code).toBe('contract_terms_invalid')
    const institution = await call<{ items?: { id: string }[] }>(
      request,
      'GET',
      '/api/club_core/institutions?pageSize=1',
      club.adminToken,
    )
    const institutionId = institution.body?.items?.at(0)?.id
    if (institutionId) {
      const wrongParty = await call<{ code?: string }>(request, 'POST', '/api/club_core/contracts', club.adminToken, {
        data: { ...contract, partyType: 'institution', partyId: institutionId },
      })
      expect(wrongParty.status).toBe(422)
    }
    const listed = await call<{ items?: ContractItem[] }>(
      request,
      'GET',
      `/api/club_core/contracts?partyId=${marek.personId}`,
      club.adminToken,
    )
    expect(listed.status).toBe(200)
    expect(listed.body?.items).toHaveLength(1)
    expect(listed.body?.items?.at(0)).toMatchObject({ partyName: 'Marek Trener', terms: contract.terms })
    // The coordinator does not manage contracts.
    const forbidden = await call(request, 'GET', '/api/club_core/contracts', family.academyCoordinator.token)
    expect(forbidden.status).toBe(403)

    // --- The administrator's report: counts per coach, the amount in units_per_contract, "No contract" for Bartek ---
    const admin = await report(request, club.adminToken, `month=${month}`)
    expect(admin.status, JSON.stringify(admin.body)).toBe(200)
    expect(admin.body).toMatchObject({ perspective: 'staff', model: 'units_per_contract', withAmounts: true })
    expect(rowOf(admin.body, marek.personId)).toMatchObject({
      planned: 2,
      handedOver: 1,
      takenOver: 0,
      balance: 1,
      matches: 1,
      trips: 1,
      // 1500 + 1 unit × 80 + 1 match × 100 + 1 trip × 50 zł
      amount: 173000,
      contractState: 'ok',
    })
    expect(rowOf(admin.body, bartek.personId)).toMatchObject({
      planned: 0,
      handedOver: 0,
      takenOver: 1,
      balance: 1,
      amount: null,
      contractState: 'no_contract',
    })
    expect(rowOf(admin.body, bartek.personId)?.sessions.map((entry) => [entry.id, entry.role])).toEqual([
      [handed.id, 'taken_over'],
    ])
    expect(rowOf(admin.body, family.instructor.personId)).toMatchObject({ planned: 1, balance: 1 })
    const adminCsv = await csv(request, club.adminToken, `month=${month}`)
    expect(adminCsv.split('\r\n')[0]).toBe('coach,planned,given,taken,balance,matches,trips,amount')
    expect(adminCsv).toContain('\r\nMarek Trener,2,1,0,1,1,1,1730.00\r\n')
    expect(adminCsv).toContain('\r\nBartek Zastępca,0,0,1,1,0,0,\r\n')
    const invalidMonth = await report(request, club.adminToken, 'month=2026-13')
    expect(invalidMonth.status).toBe(400)
    expect(invalidMonth.body?.code).toBe('report_month_invalid')

    // --- The academy coordinator: her section only, no amounts, no amount column ---
    const coordinator = await report(request, family.academyCoordinator.token, `month=${month}`)
    expect(coordinator.status, JSON.stringify(coordinator.body)).toBe(200)
    expect(coordinator.body?.withAmounts).toBe(false)
    expect(coordinator.body?.items?.map((row) => row.personId).sort()).toEqual([marek.personId, bartek.personId].sort())
    expect(rowOf(coordinator.body, marek.personId)).not.toHaveProperty('amount')
    expect((await csv(request, family.academyCoordinator.token, `month=${month}`)).split('\r\n')[0]).toBe(
      'coach,planned,given,taken,balance,matches,trips',
    )
    const otherSection = await report(
      request,
      family.academyCoordinator.token,
      `month=${month}&sectionId=${family.pool}`,
    )
    expect(otherSection.status).toBe(403)

    // --- A coach reads only their own row (negative case), whatever section they ask for ---
    for (const query of [`month=${month}`, `month=${month}&sectionId=${family.pool}`]) {
      const asCoach = await report(request, bartek.token, query)
      expect(asCoach.status, JSON.stringify(asCoach.body)).toBe(200)
      expect(asCoach.body?.perspective).toBe('own')
      expect(asCoach.body?.items?.map((row) => row.personId)).toEqual(
        query.includes('sectionId') ? [] : [bartek.personId],
      )
      expect(JSON.stringify(asCoach.body)).not.toContain(marek.personId)
    }
    const marekOwn = await report(request, marek.token, `month=${month}`)
    expect(marekOwn.body?.items).toHaveLength(1)
    expect(rowOf(marekOwn.body, marek.personId)).toMatchObject({ planned: 2, handedOver: 1, balance: 1, trips: 1 })
    expect(rowOf(marekOwn.body, marek.personId)).not.toHaveProperty('amount')
    const empty = await report(request, marek.token, 'month=2020-01')
    expect(empty.body?.items).toEqual([])

    // --- fixed_base_adjusted: the contract without the model's rates is incomplete until its terms are updated ---
    expect(
      (await updateClubSettings(request, club.adminToken, { coachSettlementModel: 'fixed_base_adjusted' })).status,
    ).toBe(200)
    const incomplete = await report(request, club.adminToken, `month=${month}`)
    expect(incomplete.body?.model).toBe('fixed_base_adjusted')
    expect(rowOf(incomplete.body, marek.personId)).toMatchObject({ amount: null, contractState: 'incomplete' })
    const current = listed.body?.items?.at(0)
    const updated = await call<{ updatedAt?: string }>(request, 'PUT', '/api/club_core/contracts', club.adminToken, {
      data: {
        id: current?.id,
        validFrom: contract.validFrom,
        validTo: null,
        terms: { baseMonthly: 150000, sessionAmount: 6000, tripAmount: 4000 },
      },
      headers: lock(current?.updatedAt),
    })
    expect(updated.status, JSON.stringify(updated.body)).toBe(200)
    const fixed = await report(request, club.adminToken, `month=${month}`)
    // 1500 − 1 handed over × 60 + 0 taken over + 1 trip × 40 zł
    expect(rowOf(fixed.body, marek.personId)).toMatchObject({ amount: 148000, contractState: 'ok' })
    expect(
      (await updateClubSettings(request, club.adminToken, { coachSettlementModel: 'units_per_contract' })).status,
    ).toBe(200)
    // Back to the units model with its rates, for the amount the browser shows.
    const restored = await call(request, 'PUT', '/api/club_core/contracts', club.adminToken, {
      data: { id: current?.id, validFrom: contract.validFrom, validTo: null, terms: contract.terms },
      headers: lock(updated.body?.updatedAt),
    })
    expect(restored.status, JSON.stringify(restored.body)).toBe(200)
    expect(rowOf((await report(request, club.adminToken, `month=${month}`)).body, marek.personId)?.amount).toBe(173000)
    expect((await updateClubSettings(request, club.adminToken, { defaultLocale: 'en' })).status).toBe(200)

    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)

    // --- B-16 in the browser: the model, the amount, "No contract", the sessions and an empty month ---
    // `signInBrowser` ends the administrator's API token: take a fresh one for the locale switch below.
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, adminPassword)
    await page.goto('/backend/activities/reports/coach-units')
    await expect(page.getByTestId('coach-units-model')).toContainText(/units per contract|jednostki według umowy/)
    const marekRow = page.getByRole('row').filter({ hasText: 'Marek Trener' })
    await expect(marekRow).toContainText(/1[\s  ,.]?730/)
    await expect(page.getByRole('row').filter({ hasText: 'Bartek Zastępca' })).toContainText(/No contract|Brak umowy/)
    await marekRow.getByTestId('coach-units-sessions').locator('summary').click()
    await expect(marekRow.getByTestId('coach-units-sessions')).toContainText('Mecz wyjazdowy')
    await expect(page.getByTestId('coach-units-export')).toHaveAttribute(
      'href',
      new RegExp(`month=${month}.*format=csv`),
    )
    await page.getByTestId('coach-units-month').fill('2020-01')
    await expect(page.getByTestId('coach-units-empty')).toHaveText(
      /No closed sessions this month|Brak zamkniętych zajęć w tym miesiącu/,
    )

    // --- My units on the phone: Marek's own row, no amount, both locales and both modes ---
    await page.setViewportSize({ width: 375, height: 812 })
    await signInBrowser(page, request, club, marek.userId, marek.email)
    await page.goto('/club')
    await page.getByTestId('club-bottom-bar').getByText('More', { exact: true }).click()
    await page.getByTestId('club-more').getByRole('link', { name: 'My units', exact: true }).click()
    await expect(page).toHaveURL(/\/club\/coach\/units$/)
    await expect(page.getByRole('heading', { level: 1, name: 'My units' })).toBeVisible()
    await expect(page.getByTestId('club-units-planned')).toHaveText('2')
    await expect(page.getByTestId('club-units-handed-over')).toHaveText('1')
    await expect(page.getByTestId('club-units-taken-over')).toHaveText('0')
    await expect(page.getByTestId('club-units-balance')).toHaveText('1')
    await expect(page.getByTestId('club-units-matches')).toHaveText('1')
    await expect(page.getByTestId('club-units-trips')).toHaveText('1')
    await expect(page.locator('main')).not.toContainText(/zł|PLN|Amount/)
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      '/club/coach/units',
      async () => {
        await expect(page.getByTestId('club-units-balance')).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    expect((await updateClubSettings(request, club.adminToken, { defaultLocale: 'pl' })).status).toBe(200)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Moje jednostki' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
    await expect(page.getByTestId('club-units-balance')).toHaveText('1')
    await page.getByTestId('club-units-month').waitFor()
    await page.getByRole('button', { name: 'Poprzedni miesiąc' }).click()
    await expect(page.getByTestId('club-units-empty')).toHaveText('Brak zamkniętych zajęć w tym miesiącu')
  } finally {
    await club.cleanup()
  }
})
