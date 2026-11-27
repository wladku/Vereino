import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { createActivity } from '../_fixtures/activities'
import { createPolicy, familyFor, saveAttendanceList, sessionsOf, startNow } from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { uiText } from '../_fixtures/ui-text'
import { readCatalogs } from '../../../../scripts/vereino-ui-texts.mjs'
import { APP_ROOT } from '../../../../scripts/vereino-paths.mjs'

// Parity spec "groups and activities" TEST-A08 (REQ-A06, AC-A06; README B-16, B-17; #268): the coach units CSV follows
// the user's locale — a Polish user gets the report's Polish column headers separated by `;`, an English user the
// English ones separated by `,`, both as UTF-8 text — and the declaration policies list shows the scope and what it
// applies to in two columns ("Scope", "Applies to") and the confirmation limit as "24 h", for policies of every
// scope: the club, the activity type `match` and the away trip (the defaults, 24 h) and the group Żaki.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const CSV_HEADER_KEYS = [
  'activities.reports.coachUnits.columns.coach',
  'activities.reports.coachUnits.columns.planned',
  'activities.reports.coachUnits.columns.handedOver',
  'activities.reports.coachUnits.columns.takenOver',
  'activities.reports.coachUnits.columns.balance',
  'activities.reports.coachUnits.columns.matches',
  'activities.reports.coachUnits.columns.trips',
  'activities.reports.coachUnits.columns.amount',
] as const

/** The keys must exist in both catalogs (`qa-texts:check` reads the `uiText` calls). */
const CSV_HEADER_PATTERNS = [
  uiText('activities.reports.coachUnits.columns.coach', { exact: true }),
  uiText('activities.reports.coachUnits.columns.planned', { exact: true }),
  uiText('activities.reports.coachUnits.columns.handedOver', { exact: true }),
  uiText('activities.reports.coachUnits.columns.takenOver', { exact: true }),
  uiText('activities.reports.coachUnits.columns.balance', { exact: true }),
  uiText('activities.reports.coachUnits.columns.matches', { exact: true }),
  uiText('activities.reports.coachUnits.columns.trips', { exact: true }),
  uiText('activities.reports.coachUnits.columns.amount', { exact: true }),
]

async function unitsCsv(
  request: APIRequestContext,
  token: string,
  month: string,
  locale: 'en' | 'pl',
): Promise<{ text: string; contentType: string }> {
  const response = await request.get(`/api/activities/reports/coach-units?month=${month}&format=csv`, {
    headers: { authorization: `Bearer ${token}`, cookie: `locale=${locale}` },
  })
  expect(response.status(), await response.text()).toBe(200)
  return { text: await response.text(), contentType: response.headers()['content-type'] ?? '' }
}

/** The index of the column whose header matches `pattern`, once the table has rendered its headers. */
async function columnIndex(page: Page, pattern: RegExp): Promise<number> {
  // `allInnerTexts` does not wait, and the list can still be loading after `goto` (an empty header list).
  await expect(page.getByRole('columnheader').filter({ hasText: pattern }).first()).toBeVisible()
  const headers = (await page.getByRole('columnheader').allInnerTexts()).map((text) => text.trim())
  const index = headers.findIndex((text) => pattern.test(text))
  expect(index, JSON.stringify(headers)).toBeGreaterThanOrEqual(0)
  return index
}

test('TEST-A08 the units CSV in the user locale (pl: Polish headers and `;`, en: English headers and `,`); the policies list shows Scope, Applies to and "24 h"', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-a08')
  try {
    const family = await familyFor(request, club)
    const month = calendarDate().slice(0, 7)
    const catalogs = readCatalogs(APP_ROOT)

    // --- One closed training of Marek this month, so the CSV has a data row ---
    const { id: activityId } = await createActivity(request, club.adminToken, {
      groupId: family.zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: family.pitch,
      coachPersonId: family.coach.personId,
      startsOn: calendarDate(),
      startTime: '20:00',
      endTime: '20:45',
    })
    const session = (await sessionsOf(request, club, activityId)).at(0)
    if (!session) throw new Error('[test] the training has no session')
    const version = await startNow(request, club, session.id)
    const closed = await saveAttendanceList(
      request,
      family.coach.token,
      session.id,
      { entries: [], complete: true },
      version,
    )
    expect(closed.status, JSON.stringify(closed.body)).toBe(200)

    // --- The CSV per locale: the report's column headers in that language, its separator, UTF-8 ---
    for (const [locale, separator] of [
      ['pl', ';'],
      ['en', ','],
    ] as const) {
      const { text, contentType } = await unitsCsv(request, club.adminToken, month, locale)
      expect(contentType).toBe('text/csv; charset=utf-8')
      const [header, ...rows] = text.split('\r\n')
      const cells = header.split(separator)
      expect(cells, header).toEqual(CSV_HEADER_KEYS.map((key) => catalogs[locale].get(key)))
      cells.forEach((cell, index) => {
        expect(cell).toMatch(CSV_HEADER_PATTERNS[index])
      })
      expect(header).not.toContain(separator === ';' ? ',' : ';')
      // Marek: planned 1, handed over 0, taken over 0, balance 1, no matches or trips, no contract → an empty amount.
      expect(rows).toContain(['Marek Trener', '1', '0', '0', '1', '0', '0', ''].join(separator))
    }
    const polish = await unitsCsv(request, club.adminToken, month, 'pl')
    const english = await unitsCsv(request, club.adminToken, month, 'en')
    expect(polish.text.split('\r\n')[0]).not.toBe(english.text.split('\r\n')[0])

    // --- Policies of three scopes: the club and the match defaults (24 h), and a group policy on Żaki ---
    await createPolicy(request, club.adminToken, {
      scope: 'group',
      groupId: family.zaki,
      minorDeclarationMode: 'guardian_only',
    })

    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await page.goto('/backend/activities/policies')
    const scopeColumn = await columnIndex(page, uiText('activities.policies.columns.scope', { exact: true }))
    const targetColumn = await columnIndex(page, uiText('activities.policies.columns.target', { exact: true }))
    const limitColumn = await columnIndex(page, uiText('activities.policies.columns.timeout', { exact: true }))
    expect(targetColumn).toBe(scopeColumn + 1)
    const dash = uiText('activities.common.empty', { exact: true })
    const cellsOf = async (rowText: RegExp | string) => {
      const row = page.getByRole('row').filter({ hasText: rowText })
      await expect(row).toHaveCount(1)
      const cells = row.getByRole('cell')
      return {
        scope: cells.nth(scopeColumn),
        target: cells.nth(targetColumn),
        limit: cells.nth(limitColumn),
      }
    }

    const group = await cellsOf('Żaki')
    await expect(group.scope).toHaveText(uiText('activities.policies.scope.group', { exact: true }))
    await expect(group.target).toHaveText('Żaki')

    const match = await cellsOf(uiText('activities.types.match'))
    await expect(match.scope).toHaveText(uiText('activities.policies.scope.activity_type', { exact: true }))
    await expect(match.target).toHaveText(uiText('activities.types.match', { exact: true }))
    await expect(match.limit).toHaveText(uiText('activities.policies.hours', { exact: true, params: { count: 24 } }))

    const clubRow = await cellsOf(uiText('activities.policies.scope.club'))
    await expect(clubRow.scope).toHaveText(uiText('activities.policies.scope.club', { exact: true }))
    await expect(clubRow.target).toHaveText(dash)
    await expect(clubRow.limit).toHaveText(uiText('activities.policies.hours', { exact: true, params: { count: 24 } }))

    const awayTrip = await cellsOf(uiText('activities.policies.scope.away_trip'))
    await expect(awayTrip.scope).toHaveText(uiText('activities.policies.scope.away_trip', { exact: true }))
    await expect(awayTrip.target).toHaveText(dash)
  } finally {
    await club.cleanup()
  }
})
