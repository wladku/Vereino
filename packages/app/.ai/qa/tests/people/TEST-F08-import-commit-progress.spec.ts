import { expect, test } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { calendarDate, createClub, createPerson } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import {
  PESEL_EXISTING_CHILD,
  PESEL_NEW_CHILD,
  PESEL_RENAMED_CHILD,
  csvFile,
  decideRow,
  familiesCsv,
  familyRows,
  getImport,
  importAction,
  importRows,
  previewImport,
  purgeImports,
  rawCommitJobs,
  rawImportRows,
  runProgressServiceProbe,
  type ImportView,
} from '../_fixtures/imports'
import { createGuardianship, persons } from '../_fixtures/people'
import { uiText } from '../_fixtures/ui-text'

// TEST-F08 (foundation spec REQ-F08, AC-F08; issue #585): the people import commit runs inside a platform
// `ProgressService` job. A sheet with new, matched, review and error rows is previewed and its review row decided;
// a commit while the progress service is stopped answers 503 `import_progress_unavailable` and writes nothing, and a
// commit whose service stops after the job started rolls back and leaves a failed job — in both cases the import stays
// `previewed`. The commit then runs as a job that completes with every row counted, the import shows it, a second
// commit answers 409 and the rows are purged after 30 days. No job and no error carries a cell value. The record page
// shows the commit's progress while the commit request runs.
test.describe.configure({ timeout: 300_000 })

/** TEST-051's sheet without the group column, so the commit leaves no membership waiting and a second commit is a 409. */
function sheet() {
  return csvFile(familiesCsv(familyRows().map((cells) => [...cells.slice(0, 8), null])))
}

/** Cell values of the sheet that must never reach a job, an error or a response code. */
const CELL_VALUES = ['Kowalska', 'Bezpeselu', 'anna.nowa@example.org', PESEL_NEW_CHILD, PESEL_EXISTING_CHILD]

function expectNoCellValue(value: unknown) {
  const text = JSON.stringify(value)
  for (const cell of CELL_VALUES) expect(text).not.toContain(cell)
}

async function personCount(request: Parameters<typeof persons>[0], token: string): Promise<number> {
  const listed = await persons(request, token)
  expect(listed.status).toBe(200)
  return listed.items.length
}

test('TEST-F08 the import commit runs as a progress job; a stopped progress service leaves the import previewed', async ({
  request,
}) => {
  const club = await createClub(request, 'test-f08-progress')
  try {
    const token = club.adminToken
    // TEST-051's club: Zofia with her mother Maria, and Tomasz under his old surname (rows 3 and 4 are matched).
    const childId = await createPerson(request, token, {
      firstName: 'Zofia',
      lastName: 'Kowalska',
      birthDate: '2015-06-12',
      pesel: PESEL_EXISTING_CHILD,
    })
    const motherId = await createPerson(request, token, { firstName: 'Maria', lastName: 'Kowalska' })
    await createGuardianship(request, token, {
      guardianPersonId: motherId,
      wardPersonId: childId,
      isPrimaryPayer: true,
      validFrom: calendarDate(-10),
    })
    await createPerson(request, token, {
      firstName: 'Tomasz',
      lastName: 'Nowak',
      birthDate: '2010-11-01',
      pesel: PESEL_RENAMED_CHILD,
    })
    const before = await personCount(request, token)

    const preview = await previewImport(request, token, sheet())
    expect(preview).toMatchObject({ status: 'previewed', rowCount: 6, pendingDecisions: 1, commitProgress: null })
    expect(preview.summary).toMatchObject({ new: 1, matched: 2, review: 1, error: 2 })
    const reviewRow = (await importRows(request, token, preview.id, '&pending=true'))[0]
    expect((await decideRow(request, token, preview.id, reviewRow, { action: 'create' })).status).toBe(200)

    // The progress service is stopped: the commit is refused before anything is written.
    let current = (await getImport(request, token, preview.id)).body as ImportView
    const stopped = runProgressServiceProbe({
      token,
      importId: preview.id,
      lockToken: current.updatedAt,
      mode: 'stopped',
    })
    expect(stopped).toMatchObject({ status: 503, code: 'import_progress_unavailable' })
    expect(stopped.calls.createJob).toBe(1)
    current = (await getImport(request, token, preview.id)).body as ImportView
    expect(current).toMatchObject({ status: 'previewed', committedAt: null, commitProgress: null })
    expect(await rawCommitJobs(preview.id)).toHaveLength(0)
    expect(await personCount(request, token)).toBe(before)

    // The service stops after the job started: the transaction rolls back, the job ends failed with the error code.
    const breaks = runProgressServiceProbe({
      token,
      importId: preview.id,
      lockToken: current.updatedAt,
      mode: 'breaks',
    })
    expect(breaks).toMatchObject({ status: 503, code: 'import_progress_unavailable' })
    expect(breaks.calls).toMatchObject({ createJob: 1, startJob: 1, incrementProgress: 1, failJob: 1 })
    current = (await getImport(request, token, preview.id)).body as ImportView
    expect(current).toMatchObject({ status: 'previewed', committedAt: null })
    expect(current.commitProgress).toMatchObject({ status: 'failed', totalCount: 6 })
    const failed = await rawCommitJobs(preview.id)
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({
      status: 'failed',
      error_message: 'The commit was rolled back: import_progress_unavailable',
    })
    expectNoCellValue(failed)
    expect(await personCount(request, token)).toBe(before)
    for (const stored of await rawImportRows(preview.id)) expect(stored.membership_status).toBeNull()

    // The commit runs as a job that completes with every row counted.
    const committed = await importAction(request, token, preview.id, 'commit', current.updatedAt)
    expect(committed.status, JSON.stringify(committed.body)).toBe(200)
    expect(committed.body).toMatchObject({
      status: 'committed',
      summary: { created: 4, updated: 1, linked: 2, skipped: 2 },
      commitProgress: { status: 'completed', processedCount: 6, totalCount: 6, progressPercent: 100 },
    })
    const jobs = await rawCommitJobs(preview.id)
    expect(jobs.map((job) => job.status)).toEqual(['failed', 'completed'])
    expect(jobs[1]).toMatchObject({
      processed_count: 6,
      total_count: 6,
      progress_percent: 100,
      meta: { importId: preview.id },
      result_summary: { created: 4, updated: 1, linked: 2, skipped: 2 },
    })
    expectNoCellValue(jobs)
    expect(await personCount(request, token)).toBe(before + 4)

    // A second commit is refused and starts no job; the rows go 30 days after the commit.
    const again = await importAction(request, token, preview.id, 'commit', committed.body?.updatedAt ?? null)
    expect(again.status).toBe(409)
    expect(again.body?.code).toBe('import_already_committed')
    expect(await rawCommitJobs(preview.id)).toHaveLength(2)
    const committedAt = new Date(String(committed.body?.committedAt)).getTime()
    expect(purgeImports(club.tenant, new Date(committedAt + 31 * 86_400_000).toISOString()).counts).toMatchObject({
      imports: 1,
      failed: 0,
    })
    for (const stored of await rawImportRows(preview.id)) expect(stored.raw).toBeNull()
  } finally {
    await club.cleanup()
  }
})

test('TEST-F08 the record page shows the commit progress while the commit runs', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-f08-page')
  try {
    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, password)
    const preview = await previewImport(request, club.adminToken, sheet())
    const reviewRow = (await importRows(request, club.adminToken, preview.id, '&pending=true'))[0]
    expect((await decideRow(request, club.adminToken, preview.id, reviewRow, { action: 'create' })).status).toBe(200)

    // The commit's response is held back for a few seconds after the server answered, so the page keeps polling.
    await page.route(`**/api/people/imports/${preview.id}/commit`, async (route) => {
      const response = await route.fetch()
      await new Promise((resolve) => setTimeout(resolve, 4_000))
      await route.fulfill({ response })
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/backend/people/imports/${preview.id}`)
    await page.getByTestId('people-import-commit').click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: uiText('people.imports.actions.commit') })
      .click()
    const progress = page.getByTestId('people-import-commit-progress')
    await expect(progress).toBeVisible()
    await expect(progress.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    await expect(progress).toContainText(
      uiText('people.imports.record.committingRows', { params: { processed: 6, total: 6 } }),
    )
    await page.screenshot({ path: testInfo.outputPath('commit-progress-375.png') })
    await expect(page.getByTestId('people-import-status')).toContainText(uiText('people.imports.status.committed'))
    await expect(progress).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
