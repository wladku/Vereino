import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { familyFor } from '../_fixtures/attendance'
import { call, createClub, mercato, OPTIMISTIC_LOCK_HEADER, uniqueSuffix } from '../_fixtures/club'
import { ensureLibrary, ownOutline, publishOutline, readEntry, searchLibrary, uniqueTopic } from '../_fixtures/library'

// Training outlines spec TEST-O14 (REQ-O16, AC-O13; DD-O10, DD-O10a, BR-M4, Q-O08; #685): the library tenant is not a
// club — `library-init` is idempotent, gives it no roles, users, club settings or club job state, and the club job
// sweeps never enqueue it. Club A reads club B's shared entry with no club B id beyond it, and none of B's club-level
// outlines. Deleting club B (`club_core offboard-club`, then `delete-club` after the notice) withdraws its entries and
// deletes every rating, use and report with its organization id, recomputing the counts of the entries it reported.
// The cross-club isolation guard `ISSUE-628` runs the library probes on every route.
test.describe.configure({ timeout: 600_000 })

async function count(sql: string, params: unknown[]): Promise<number> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ count: string }>(sql, params)
    return Number(rows[0]?.count ?? 0)
  })
}

test('TEST-O14 the library tenant is no club and a deleted club leaves no row in it', async ({ request }) => {
  const library = ensureLibrary()
  expect(ensureLibrary()).toMatchObject({ status: 'exists', tenantId: library.tenantId })
  const clubA = await createClub(request, 'test-o14-a')
  const clubB = await createClub(request, 'test-o14-b')
  let deleted = false
  try {
    // --- The library tenant is not a club ---
    mercato(['foundation', 'club-jobs', 'sweep'])
    for (const table of ['foundation_club_jobs', 'club_core_club_settings', 'roles', 'users', 'scheduled_jobs']) {
      expect(
        await count(`select count(*)::text as count from ${table} where tenant_id = $1`, [library.tenantId]),
        table,
      ).toBe(0)
    }

    const familyA = await familyFor(request, clubA)
    const familyB = await familyFor(request, clubB)
    const topic = uniqueTopic('Izolacja')
    const outlineA = await ownOutline(request, familyA.coach.token, topic)
    const sharedA = await publishOutline(request, familyA.coach.token, outlineA.id, {
      visibility: 'clubs',
      acceptTerms: true,
    })
    expect(sharedA.status, JSON.stringify(sharedA.body)).toBe(201)
    const entryA = String(sharedA.body?.entryId)
    const outlineB = await ownOutline(request, familyB.coach.token, `${topic} B`)
    const keptB = await ownOutline(request, familyB.coach.token, `${topic} B tylko w klubie`)
    const sharedB = await publishOutline(request, familyB.coach.token, outlineB.id, {
      visibility: 'clubs',
      acceptTerms: true,
    })
    expect(sharedB.status, JSON.stringify(sharedB.body)).toBe(201)
    const entryB = String(sharedB.body?.entryId)

    // --- Club A sees B's shared entry and nothing else of club B ---
    const listed = await searchLibrary(request, familyA.coach.token, { q: topic })
    const text = JSON.stringify(listed.body)
    expect(listed.body?.items?.map((item) => item.id).sort()).toEqual([entryA, entryB].sort())
    for (const id of [
      outlineB.id,
      keptB.id,
      familyB.coach.personId,
      clubB.tenant.organizationId,
      clubB.tenant.tenantId,
    ]) {
      expect(text, 'no club B id in the library list').not.toContain(id)
    }
    expect(text).not.toContain('B tylko w klubie')

    // --- Club B reports A's entry; then club B leaves ---
    const reported = await call(request, 'POST', `/api/training/library/${entryA}/report`, familyB.coach.token, {
      data: { reason: 'other' },
    })
    expect(reported.status, JSON.stringify(reported.body)).toBe(201)
    const orgB = clubB.tenant.organizationId
    const rowsOfB = async () =>
      (await count(
        `select count(*)::text as count from training_library_entries where tenant_id = $1 and source_organization_id = $2`,
        [library.tenantId, orgB],
      )) +
      (await count(
        `select (select count(*) from training_library_ratings where tenant_id = $1 and rater_organization_id = $2)
              + (select count(*) from training_library_uses where tenant_id = $1 and rater_organization_id = $2)
              + (select count(*) from training_library_reports where tenant_id = $1 and rater_organization_id = $2) as count`,
        [library.tenantId, orgB],
      ))
    expect(await rowsOfB()).toBe(2)

    const slug = `it-o14-${uniqueSuffix()}`
    const settings = await call<{ updatedAt?: string | null }>(
      request,
      'GET',
      '/api/club_core/settings',
      clubB.adminToken,
    )
    const saved = await call(request, 'PUT', '/api/club_core/settings', clubB.adminToken, {
      data: { publicSlug: slug },
      headers: settings.body?.updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: settings.body.updatedAt } : {},
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect(mercato(['club_core', 'offboard-club', '--slug', slug])).toMatchObject({ status: 'offboarded' })
    // The notice period ends (as TEST-M07 does): the dry run and the deletion run only after it.
    await withClient((client) =>
      client.query(
        `update club_core_club_settings set offboarding_delete_after = now() - interval '1 minute' where tenant_id = $1`,
        [clubB.tenant.tenantId],
      ),
    )
    const dry = mercato(['club_core', 'delete-club', '--slug', slug, '--confirm', slug, '--dry-run']) as {
      tables?: { module: string; table: string; rows: number }[]
    }
    expect(dry.tables).toEqual(
      expect.arrayContaining([
        { module: 'training', table: 'training_library_entries', rows: 1 },
        { module: 'training', table: 'training_library_reports', rows: 1 },
      ]),
    )
    expect(mercato(['club_core', 'delete-club', '--slug', slug, '--confirm', slug])).toMatchObject({
      status: 'deleted',
    })
    deleted = true

    // --- No library row with club B's organization id; A's report count is recomputed ---
    expect(await rowsOfB()).toBe(0)
    expect((await readEntry(request, familyA.coach.token, entryB)).status).toBe(404)
    expect(
      await count(`select report_count::text as count from training_library_entries where id = $1`, [entryA]),
    ).toBe(0)
  } finally {
    if (!deleted) await clubB.cleanup()
    else await clubB.cleanup().catch(() => undefined)
    await clubA.cleanup()
  }
})
