import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { createActivity } from '../_fixtures/activities'
import { prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { addParticipants, familyFor, sessionsOf, type Family } from '../_fixtures/attendance'
import { assignRole, calendarDate, call, createClub, signInAs, type Club } from '../_fixtures/club'
import { create as createStructure, signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'
import { uiText, uiTextIn } from '../_fixtures/ui-text'

// Issue #819 (E27-S02; product brief Goals, D21, D29; owner decision 2026-11-26): a section coordinator reads the
// "Declarations in Vereino" numbers of E27-S01 for their own sections on the phone, under `/club`. Three sections each
// have one `done` session with answers seeded in the database (the counting rules are E27-S01's; this test checks the
// reach): the academy (A) a match, the pool (B) a pool class, the tennis section (C) a match. A coordinator of A and B
// gets the rows of A and B with the administrator's numbers, never C — not with a forged `sectionId` either — and the
// coordinator of A gets A only. A coach has no More entry and the page refuses, naming who sees the report. The page
// at 375 px: cards per section, 44 px targets, loading, error and empty states, English and Polish, no names.
test.describe.configure({ timeout: 600_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type Counts = { declared: number; total: number; percent: number | null }
type Row = {
  sectionId: string
  sectionName: string
  sessions: number
  confirm: Counts
  absence: Counts
  headline: Counts
}
type Report = { code?: string; from?: string; to?: string; items?: Row[] }

const ROUTE = '/club/reports/declaration-share'
const MORE = uiText('people.club.nav.more', { exact: true })
const ENTRY = uiText('people.club.nav.declarationShare', { exact: true })

async function report(request: APIRequestContext, token: string, query = '') {
  return call<Report>(request, 'GET', `/api/activities/reports/declaration-share${query ? `?${query}` : ''}`, token)
}

/** A one-off session of `type` today at `time` in `groupId` on `placeId`, put in the past as `done` with `rows`. */
async function doneSession(
  request: APIRequestContext,
  club: Club,
  input: { groupId: string; placeId: string; coachPersonId: string; name: string; type: string; time: string },
  rows: { personId: string; source?: 'app' | 'link' | 'staff' }[],
): Promise<void> {
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
  })
  const occurrence = (await sessionsOf(request, club, id)).at(0)
  if (!occurrence) throw new Error(`[test] ${input.name} has no session`)
  const { tenantId, organizationId } = club.tenant
  await withClient(async (client) => {
    await client.query(
      `update activities_occurrences set start_at = now() - interval '3 hours', end_at = now() - interval '2 hours',
          status = 'done' where id = $1`,
      [occurrence.id],
    )
    for (const row of rows) {
      await client.query(
        `insert into activities_attendances (organization_id, tenant_id, created_at, updated_at, occurrence_id,
            person_id, declared, declared_at, declaration_status, actual, source)
          select $1, $2, now(), now(), o.id, $3, 'yes', o.start_at - interval '1 day', 'final', null, $4
            from activities_occurrences o where o.id = $5`,
        [organizationId, tenantId, row.personId, row.source ?? 'app', occurrence.id],
      )
    }
  })
}

/** Opens More in the bottom bar. */
async function openMore(page: Page) {
  await page.getByTestId('club-bottom-bar').getByText(MORE).click()
  return page.getByTestId('club-more')
}

test('E27-S02 a section coordinator sees the declaration share of their own sections on the phone', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e27-s02')
  try {
    const family: Family = await familyFor(request, club)
    const admin = club.adminToken
    // --- Section C: tennis, with a group of three and the pool instructor as its coach ---
    const tennis = await createStructure(request, admin, 'sections', { name: 'Tenis' })
    const tennisGroup = await createGroup(request, admin, { sectionId: tennis, name: 'Tenis — juniorzy', kind: 'team' })
    await addMembership(request, admin, {
      groupId: tennisGroup,
      personId: family.instructor.personId,
      role: 'coach',
      validFrom: calendarDate(-30),
    })
    const tennisPlayers = await addParticipants(request, club, tennisGroup, 3)

    // --- One done session per section: A 2 of 3 in Vereino, B 1 of 1, C 3 of 3 ---
    const zakiIds = [family.younger.personId, family.elder.personId, family.other.child.personId]
    await doneSession(
      request,
      club,
      {
        groupId: family.zaki,
        placeId: family.pitch,
        coachPersonId: family.coach.personId,
        name: 'Mecz A',
        type: 'match',
        time: '08:00',
      },
      [{ personId: zakiIds[0] }, { personId: zakiIds[1], source: 'link' }, { personId: zakiIds[2], source: 'staff' }],
    )
    await doneSession(
      request,
      club,
      {
        groupId: family.poolGroup,
        placeId: family.poolPlace,
        coachPersonId: family.instructor.personId,
        name: 'Basen B',
        type: 'other',
        time: '09:00',
      },
      [{ personId: family.younger.personId }],
    )
    await doneSession(
      request,
      club,
      {
        groupId: tennisGroup,
        placeId: family.poolPlace,
        coachPersonId: family.instructor.personId,
        name: 'Mecz C',
        type: 'match',
        time: '10:00',
      },
      tennisPlayers.map((personId) => ({ personId })),
    )

    // --- The administrator's numbers: every section ---
    const full = await report(request, admin)
    expect(full.status, JSON.stringify(full.body)).toBe(200)
    const adminRow = (sectionId: string) => full.body?.items?.find((row) => row.sectionId === sectionId)
    expect(adminRow(family.academy)?.confirm).toEqual({ declared: 2, total: 3, percent: 67 })
    expect(adminRow(family.pool)?.confirm).toEqual({ declared: 1, total: 1, percent: 100 })
    expect(adminRow(tennis)?.confirm).toEqual({ declared: 3, total: 3, percent: 100 })

    // --- A coordinator of A and B: rows of A and B only, the administrator's numbers; C never, forged or not ---
    const both = await signedInStaff(request, club, {
      firstName: 'Zofia',
      lastName: 'Dwusekcyjna',
      role: 'coordinator',
      sectionId: family.academy,
    })
    await assignRole(request, admin, {
      personId: both.personId,
      role: 'coordinator',
      sectionId: family.pool,
      validFrom: '2020-01-01',
    })
    both.token = await signInAs(request, club, both.userId, both.email)
    const expectedBoth = [adminRow(family.academy), adminRow(family.pool)].sort((a, b) =>
      String(a?.sectionId).localeCompare(String(b?.sectionId)),
    )
    const sorted = (items: Row[] | undefined) =>
      [...(items ?? [])].sort((a, b) => a.sectionId.localeCompare(b.sectionId))
    for (const query of ['', `sectionId=${tennis}`, `sectionIds=${tennis}`, `section=${tennis}&sectionId=${tennis}`]) {
      const read = await report(request, both.token, query)
      expect(read.status, query).toBe(200)
      expect(sorted(read.body?.items), query).toEqual(expectedBoth)
      expect(JSON.stringify(read.body), query).not.toContain(tennis)
    }
    // The second coordinator (A only) reads A only, with the same numbers.
    const academyOnly = await report(request, family.academyCoordinator.token, `sectionId=${family.pool}`)
    expect(academyOnly.status).toBe(200)
    expect(academyOnly.body?.items).toEqual([adminRow(family.academy)])
    // A coach is refused, with no numbers.
    const coach = await report(request, family.coach.token)
    expect(coach.status).toBe(403)
    expect(coach.body).not.toHaveProperty('items')

    // --- The page at 375 px as the coordinator of A and B ---
    expect((await updateClubSettings(request, admin, { defaultLocale: 'en' })).status).toBe(200)
    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 375, height: 812 })
    await prepareForAccessibilityScan(page)
    await signInBrowser(page, request, club, both.userId, both.email)
    await page.goto('/club')
    const more = await openMore(page)
    await more.getByRole('link', { name: ENTRY }).click()
    await expect(page).toHaveURL(new RegExp(`${ROUTE}$`))
    const cards = page.getByTestId('club-declaration-share-sections').locator('li')
    await expect(cards).toHaveCount(2)
    await expect(page.getByTestId(`club-declaration-share-section-${tennis}`)).toHaveCount(0)
    await expect(page.getByTestId(`club-declaration-share-confirm-${family.academy}`)).toHaveText(
      uiText('activities.reports.declarationShare.confirmValue', {
        exact: true,
        params: { declared: 2, total: 3, percent: 67 },
      }),
    )
    await expect(page.getByTestId(`club-declaration-share-headline-${family.pool}`)).toHaveText(
      uiText('activities.reports.declarationShare.headlineValue', {
        exact: true,
        params: { declared: 1, total: 1, percent: 100 },
      }),
    )
    await expect(page.getByTestId(`club-declaration-share-absence-${family.pool}`)).toHaveText(
      uiText('activities.reports.declarationShare.noAbsences', { exact: true }),
    )
    await expect(page.getByTestId('club-declaration-share-period')).toContainText(calendarDate(-27))
    const main = page.locator('main')
    for (const name of [family.younger.firstName, family.elder.firstName, family.other.child.firstName, 'Tenis']) {
      await expect(main).not.toContainText(name)
    }
    // Touch targets of at least 44 px, and no horizontal overflow at 375 px.
    const mode = page.getByTestId('club-declaration-share-mode')
    expect((await mode.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      ROUTE,
      async () => {
        await expect(cards).toHaveCount(2)
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})
    await page.emulateMedia({ colorScheme: 'light' })

    // A month, then a range above 12 months refused before any request.
    await mode.selectOption('month')
    const month = page.getByTestId('club-declaration-share-month')
    expect((await month.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    await expect(page.getByTestId(`club-declaration-share-confirm-${family.academy}`)).toHaveText(
      uiText('activities.reports.declarationShare.confirmValue', {
        exact: true,
        params: { declared: 2, total: 3, percent: 67 },
      }),
    )
    await mode.selectOption('range')
    await page.getByTestId('club-declaration-share-from').fill('2020-01-01')
    await page.getByTestId('club-declaration-share-to').fill('2021-06-30')
    await expect(page.getByTestId('club-declaration-share-period-invalid')).toHaveText(
      uiText('activities.reports.declarationShare.periodInvalid', { exact: true }),
    )

    // Error with a retry, then the empty state (the read answered by the test).
    let failing = true
    await page.route('**/api/activities/reports/declaration-share*', async (route) => {
      if (failing) await route.fulfill({ status: 500, json: { error: 'boom' } })
      else
        await route.fulfill({
          status: 200,
          json: { from: '2026-01-01', to: '2026-01-28', timeZone: 'Europe/Warsaw', items: [] },
        })
    })
    await page.goto(ROUTE)
    const retry = page.getByRole('button', { name: uiText('activities.club.actions.retry', { exact: true }) })
    await expect(
      page.getByText(uiText('activities.reports.declarationShare.errors.load', { exact: true })),
    ).toBeVisible()
    expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    failing = false
    await retry.click()
    await expect(page.getByTestId('club-declaration-share-empty')).toHaveText(
      uiText('activities.reports.declarationShare.empty', { exact: true }),
    )
    await page.unroute('**/api/activities/reports/declaration-share*')

    // Polish: a member page follows the member's language (DD-34: preferred → club default), not the locale cookie.
    expect((await updateClubSettings(request, admin, { defaultLocale: 'pl' })).status).toBe(200)
    await page.goto(ROUTE)
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
    await expect(page.getByTestId(`club-declaration-share-confirm-${family.academy}`)).toHaveText(
      uiTextIn('pl', 'activities.reports.declarationShare.confirmValue')
        .replace('{declared}', '2')
        .replace('{total}', '3')
        .replace('{percent}', '67'),
    )
    expect((await updateClubSettings(request, admin, { defaultLocale: 'en' })).status).toBe(200)

    // --- A coach: no More entry, and the page refuses, naming who sees the report ---
    await switchBrowserUser(page, request, club, family.coach.userId, family.coach.email)
    await page.goto('/club')
    const coachMore = await openMore(page)
    await expect(coachMore.getByRole('link', { name: ENTRY })).toHaveCount(0)
    await page.goto(ROUTE)
    await expect(page.getByTestId('club-declaration-share-forbidden')).toHaveText(
      uiText('activities.club.declarationShare.forbidden', { exact: true }),
    )
    await expect(page.getByTestId('club-declaration-share-sections')).toHaveCount(0)
    await expect(page.getByTestId('club-declaration-share-mode')).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
