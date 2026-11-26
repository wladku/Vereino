import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { createActivity } from '../_fixtures/activities'
import { prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { addParticipants, familyFor, sessionsOf, type Family } from '../_fixtures/attendance'
import { calendarDate, call, createClub, type Club } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { updateClubSettings } from '../_fixtures/members'
import { uiText, uiTextIn } from '../_fixtures/ui-text'

// Issue #818 (E27-S01; product brief Goals — the primary metric; D21; owner decision 2026-11-26): the share of
// attendance declarations made in Vereino, per section. The academy (section A) has two `done` matches (`confirm`) with
// the ten Żaki participants each — 14 answers given by members in the app or by a personal link before the start, 2
// entered by staff, 4 never given — and one `done` training (`absence_only`) with 6 actual absences, 4 reported by a
// member before the start. The report reads 14 of 20 (70%), 4 of 6 (67%) and the headline 18 of 26 (69%). A cancelled
// and a planned match with declarations count nowhere; a late, a pending and a rejected declaration do not count; the
// pool section without a completed session reads "No completed sessions". The administrator reads every section, a
// coordinator their own; a coach, a guardian and a participant get 403 without numbers. The default period is the
// last 28 days; a range above 12 months is refused. The panel page shows the counts in English and Polish, no names.
// The rows are seeded in the database: the counting rules are what this test checks, and a declaration "before the
// start" of a session that is already `done` cannot be made through the API on one day.
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
type Report = { code?: string; from?: string; to?: string; timeZone?: string; items?: Row[] }

type Seed = {
  personId: string
  declared?: 'yes' | 'no' | 'unknown'
  /** Minutes relative to the session start (negative: before it); null: no declaration time. */
  declaredAtMinutes?: number | null
  status?: 'final' | 'pending_guardian' | 'rejected_by_guardian'
  source?: 'app' | 'link' | 'staff'
  actual?: 'present' | 'absent' | 'late' | null
}

async function report(request: APIRequestContext, token: string, query = '') {
  return call<Report>(request, 'GET', `/api/activities/reports/declaration-share${query ? `?${query}` : ''}`, token)
}

const rowOf = (body: Report | null, sectionId: string): Row | undefined =>
  body?.items?.find((row) => row.sectionId === sectionId)

/** A one-off session of `type` today at `time`; returns its session id. */
async function session(
  request: APIRequestContext,
  club: Club,
  family: Family,
  input: { name: string; type: string; time: string; pool?: boolean },
): Promise<string> {
  const [hours] = input.time.split(':').map(Number)
  const { id } = await createActivity(request, club.adminToken, {
    groupId: input.pool ? family.poolGroup : family.zaki,
    name: input.name,
    type: input.type,
    placeId: input.pool ? family.poolPlace : family.pitch,
    coachPersonId: input.pool ? family.instructor.personId : family.coach.personId,
    startsOn: calendarDate(),
    startTime: input.time,
    endTime: `${String(hours).padStart(2, '0')}:45`,
  })
  const occurrence = (await sessionsOf(request, club, id)).at(0)
  if (!occurrence) throw new Error(`[test] ${input.name} has no session`)
  return occurrence.id
}

/** Puts a session in the past (its date stays today) with `status`, and writes its attendance rows. */
async function seedSession(club: Club, occurrenceId: string, status: string, rows: Seed[]): Promise<void> {
  const { tenantId, organizationId } = club.tenant
  await withClient(async (client) => {
    await client.query(
      `update activities_occurrences set start_at = now() - interval '3 hours', end_at = now() - interval '2 hours',
          status = $2 where id = $1`,
      [occurrenceId, status],
    )
    for (const row of rows) {
      const minutes = row.declaredAtMinutes === undefined ? -1440 : row.declaredAtMinutes
      await client.query(
        `insert into activities_attendances (organization_id, tenant_id, created_at, updated_at, occurrence_id,
            person_id, declared, declared_at, declaration_status, actual, source)
          select $1, $2, now(), now(), o.id, $3, $4,
                 case when $5::int is null then null else o.start_at + make_interval(mins => $5::int) end,
                 $6, $7, $8
            from activities_occurrences o where o.id = $9`,
        [
          organizationId,
          tenantId,
          row.personId,
          row.declared ?? 'yes',
          minutes,
          row.status ?? 'final',
          row.actual ?? null,
          row.source ?? 'app',
          occurrenceId,
        ],
      )
    }
  })
}

async function setDeclaration(occurrenceId: string, personId: string, set: string): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `update activities_attendances a set ${set} from activities_occurrences o
        where o.id = a.occurrence_id and a.occurrence_id = $1 and a.person_id = $2`,
      [occurrenceId, personId],
    )
  })
}

test('E27-S01 the administrator sees, per section, the share of declarations made in Vereino', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e27-s01')
  try {
    const family = await familyFor(request, club)
    const added = await addParticipants(request, club, family.zaki, 7)
    const ids = [family.younger.personId, family.elder.personId, family.other.child.personId, ...added]
    expect(ids).toHaveLength(10)

    // --- Two done matches: 7 answers in Vereino each (one by link, some "no"), 1 staff entry, 2 without an answer ---
    const matchRows = (): Seed[] => [
      ...ids.slice(0, 5).map((personId) => ({ personId })),
      { personId: ids[5], declared: 'no' as const },
      { personId: ids[6], source: 'link' as const },
      { personId: ids[7], source: 'staff' as const },
    ]
    const match1 = await session(request, club, family, { name: 'Mecz 1', type: 'match', time: '08:00' })
    const match2 = await session(request, club, family, { name: 'Mecz 2', type: 'match', time: '09:00' })
    const training = await session(request, club, family, { name: 'Trening', type: 'training', time: '10:00' })
    const cancelled = await session(request, club, family, { name: 'Mecz odwołany', type: 'match', time: '11:00' })
    const planned = await session(request, club, family, { name: 'Mecz planowany', type: 'match', time: '12:00' })
    await seedSession(club, match1, 'done', matchRows())
    await seedSession(club, match2, 'done', matchRows())
    // --- One done training: 6 actual absences, 4 reported by a member before the start ---
    await seedSession(club, training, 'done', [
      ...ids.slice(0, 4).map((personId) => ({ personId, declared: 'no' as const, actual: 'absent' as const })),
      { personId: ids[4], declared: 'no', source: 'staff', actual: 'absent' },
      { personId: ids[5], declared: 'unknown', declaredAtMinutes: null, source: 'staff', actual: 'absent' },
      { personId: ids[6], declared: 'unknown', declaredAtMinutes: null, source: 'staff', actual: 'present' },
    ])
    // --- A cancelled and a planned match with declarations count nowhere ---
    const everyone = ids.map((personId) => ({ personId }))
    await seedSession(club, cancelled, 'cancelled', everyone)
    await seedSession(club, planned, 'planned', everyone)

    const today = calendarDate()
    const full = await report(request, club.adminToken)
    expect(full.status, JSON.stringify(full.body)).toBe(200)
    // The default period: the last 28 days in the club's time zone.
    expect(full.body).toMatchObject({ from: calendarDate(-27), to: today, timeZone: 'Europe/Warsaw' })
    expect(rowOf(full.body, family.academy)).toEqual({
      sectionId: family.academy,
      sectionName: expect.any(String),
      sessions: 3,
      confirm: { declared: 14, total: 20, percent: 70 },
      absence: { declared: 4, total: 6, percent: 67 },
      headline: { declared: 18, total: 26, percent: 69 },
    })
    expect(rowOf(full.body, family.pool)).toMatchObject({
      sessions: 0,
      confirm: { total: 0, percent: null },
      headline: { total: 0, percent: null },
    })
    // Counts only: no person id anywhere in the answer.
    for (const personId of ids) expect(JSON.stringify(full.body)).not.toContain(personId)

    // --- A late, a pending and a rejected declaration are not "in Vereino" ---
    await setDeclaration(match2, ids[0], `declared_at = o.start_at + interval '10 minutes'`)
    await setDeclaration(match2, ids[1], `declaration_status = 'pending_guardian'`)
    await setDeclaration(match2, ids[2], `declaration_status = 'rejected_by_guardian'`)
    expect(rowOf((await report(request, club.adminToken)).body, family.academy)?.confirm).toEqual({
      declared: 11,
      total: 20,
      percent: 55,
    })
    await setDeclaration(match2, ids[0], `declared_at = o.start_at - interval '1 day'`)
    await setDeclaration(match2, ids[1], `declaration_status = 'final'`)
    await setDeclaration(match2, ids[2], `declaration_status = 'final'`)

    // --- A month and a range; half a range, a reversed one or one above 12 months is refused ---
    const month = today.slice(0, 7)
    const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
    const monthly = await report(request, club.adminToken, `from=${month}-01&to=${month}-${String(lastDay)}`)
    expect(monthly.status).toBe(200)
    expect(rowOf(monthly.body, family.academy)?.headline).toEqual({ declared: 18, total: 26, percent: 69 })
    const past = await report(request, club.adminToken, 'from=2020-01-01&to=2020-12-31')
    expect(rowOf(past.body, family.academy)).toMatchObject({ sessions: 0, headline: { total: 0, percent: null } })
    for (const query of ['from=2020-01-01', 'from=2020-01-02&to=2020-01-01', 'from=2020-01-01&to=2021-01-02']) {
      const refused = await report(request, club.adminToken, query)
      expect(refused.status, query).toBe(400)
      expect(refused.body?.code).toBe('report_period_invalid')
    }

    // --- The record scope: a coordinator reads their section only ---
    const academy = await report(request, family.academyCoordinator.token)
    expect(academy.status).toBe(200)
    expect(academy.body?.items?.map((row) => row.sectionId)).toEqual([family.academy])
    expect(rowOf(academy.body, family.academy)?.headline).toEqual({ declared: 18, total: 26, percent: 69 })
    const pool = await report(request, family.poolCoordinator.token)
    expect(pool.body?.items?.map((row) => row.sectionId)).toEqual([family.pool])

    // --- A coach, a guardian and a participant get 403 and no numbers ---
    for (const token of [family.coach.token, family.guardian.token, family.elder.token]) {
      const denied = await report(request, token)
      expect(denied.status).toBe(403)
      expect(denied.body).not.toHaveProperty('items')
    }

    // --- The panel page: counts and percentages, both languages, no names ---
    expect((await updateClubSettings(request, club.adminToken, { defaultLocale: 'en' })).status).toBe(200)
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    // `signInBrowser` ends the administrator's API token: take a fresh one for the API calls after the page checks.
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, adminPassword)
    const route = '/backend/activities/reports/declaration-share'
    await page.goto(route)
    const confirmCell = page.getByTestId(`declaration-share-confirm-${family.academy}`)
    await expect(confirmCell).toHaveText(
      uiText('activities.reports.declarationShare.confirmValue', {
        exact: true,
        params: { declared: 14, total: 20, percent: 70 },
      }),
    )
    await expect(page.getByTestId(`declaration-share-absence-${family.academy}`)).toHaveText(
      uiText('activities.reports.declarationShare.absenceValue', {
        exact: true,
        params: { declared: 4, total: 6, percent: 67 },
      }),
    )
    await expect(page.getByTestId(`declaration-share-headline-${family.academy}`)).toHaveText(
      uiText('activities.reports.declarationShare.headlineValue', {
        exact: true,
        params: { declared: 18, total: 26, percent: 69 },
      }),
    )
    await expect(page.getByTestId(`declaration-share-confirm-${family.pool}`)).toHaveText(
      uiText('activities.reports.declarationShare.noSessions', { exact: true }),
    )
    await expect(page.getByTestId('declaration-share-period')).toContainText(calendarDate(-27))
    const main = page.locator('main')
    for (const name of [family.younger.firstName, family.elder.firstName, family.other.child.firstName, 'Gracz01']) {
      await expect(main).not.toContainText(name)
    }
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      route,
      async () => {
        await expect(confirmCell).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})

    // A range above 12 months is refused in the page too, before any request.
    await page.emulateMedia({ colorScheme: 'light' })
    await page.getByTestId('declaration-share-mode').click()
    await page
      .getByRole('option', { name: uiText('activities.reports.declarationShare.filters.range', { exact: true }) })
      .click()
    await page.getByTestId('declaration-share-from').fill('2020-01-01')
    await page.getByTestId('declaration-share-to').fill('2021-06-30')
    await expect(page.getByTestId('declaration-share-period-invalid')).toHaveText(
      uiText('activities.reports.declarationShare.periodInvalid', { exact: true }),
    )

    // Polish.
    await page.context().addCookies([{ name: 'locale', value: 'pl', url: new URL(page.url()).origin }])
    await page.goto(route)
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
    await expect(confirmCell).toHaveText(
      uiTextIn('pl', 'activities.reports.declarationShare.confirmValue')
        .replace('{declared}', '14')
        .replace('{total}', '20')
        .replace('{percent}', '70'),
    )
    await expect(page.getByTestId(`declaration-share-confirm-${family.pool}`)).toHaveText(
      uiText('activities.reports.declarationShare.noSessions', { exact: true }),
    )

    // --- The period's edges follow the session's club-zone date, not its start instant ---
    // Both pool sessions (type `other`, a confirm kind) start today; one is dated on the first day of the default period, one the day before.
    const onFirstDay = await session(request, club, family, {
      name: 'Zajęcia na brzegu',
      type: 'other',
      time: '13:00',
      pool: true,
    })
    const dayBefore = await session(request, club, family, {
      name: 'Zajęcia przed okresem',
      type: 'other',
      time: '14:00',
      pool: true,
    })
    await seedSession(club, onFirstDay, 'done', [{ personId: family.younger.personId }])
    await seedSession(club, dayBefore, 'done', [{ personId: family.younger.personId, source: 'staff' }])
    await withClient(async (client) => {
      await client.query('update activities_occurrences set occurrence_date = $2 where id = $1', [
        onFirstDay,
        calendarDate(-27),
      ])
      await client.query('update activities_occurrences set occurrence_date = $2 where id = $1', [
        dayBefore,
        calendarDate(-28),
      ])
    })
    const edges = await report(request, club.adminToken)
    expect(rowOf(edges.body, family.pool)).toMatchObject({
      sessions: 1,
      confirm: { declared: 1, total: 1, percent: 100 },
    })
    const before = await report(request, club.adminToken, `from=${calendarDate(-28)}&to=${calendarDate(-28)}`)
    expect(rowOf(before.body, family.pool)).toMatchObject({
      sessions: 1,
      confirm: { declared: 0, total: 1, percent: 0 },
    })
    expect(rowOf(before.body, family.academy)).toMatchObject({ sessions: 0 })
  } finally {
    await club.cleanup()
  }
})
