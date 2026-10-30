import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { birthDateTurning, call, createClub, createSecondOrganization, createStaff, signInAs } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import {
  FAMILY_HEADER,
  csvFile,
  decideRow,
  familiesCsv,
  getImport,
  importAction,
  importRows,
  previewImport,
  uploadImport,
  type ImportView,
} from '../_fixtures/imports'
import { setUserFeatures } from '../_fixtures/members'
import { actionLogEntries } from '../_fixtures/people'

// E02-S04 (issue #28; club spec REQ-036, DD-38, UI table `/backend/people/imports`): the import is the club
// administrator's — `people.manage` without `people.pesel.view` is 403, a user with both features but no club
// administrator grant is 403 `scope_denied`, another organization and another tenant see nothing (404); and the
// pages — upload with the suggested mapping, preview, review queue, commit — in both locales' markup, at 375 px,
// light and dark, keyboard and axe.
test.describe.configure({ timeout: 300_000 })

const CONFLICT = /modified by someone else|zmodyfikowany przez/

test('E02-S04 import access: 403 without people.pesel.view or the administrator grant, other organizations and tenants see nothing', async ({
  request,
}) => {
  const club = await createClub(request, 'e02-s04-access')
  const otherClub = await createClub(request, 'e02-s04-other')
  try {
    const preview = await previewImport(request, club.adminToken, csvFile())
    const rows = await importRows(request, club.adminToken, preview.id)

    // `people.manage` without `people.pesel.view`: every import route answers 403.
    const clerk = await createStaff(request, club, {
      firstName: 'Clerk',
      lastName: 'Bezpesel',
      birthDate: birthDateTurning(30),
    })
    await setUserFeatures(request, club, clerk.userId, ['people.view', 'people.manage'])
    const clerkToken = await signInAs(request, club, clerk.userId, clerk.email)
    expect((await call(request, 'GET', '/api/people/persons', clerkToken)).status).toBe(200)
    expect((await call(request, 'GET', '/api/people/imports', clerkToken)).status).toBe(403)
    expect((await getImport(request, clerkToken, preview.id)).status).toBe(403)
    expect((await call(request, 'GET', `/api/people/imports/${preview.id}/rows`, clerkToken)).status).toBe(403)
    expect((await uploadImport(request, clerkToken, csvFile())).status).toBe(403)
    expect((await decideRow(request, clerkToken, preview.id, rows[0], { action: 'skip' })).status).toBe(403)
    expect((await importAction(request, clerkToken, preview.id, 'commit', preview.updatedAt)).status).toBe(403)

    // Both features but no club administrator grant: the record scope refuses (403 `scope_denied`).
    await setUserFeatures(request, club, clerk.userId, ['people.view', 'people.manage', 'people.pesel.view'])
    const scopedToken = await signInAs(request, club, clerk.userId, clerk.email)
    const denied = await call<{ code?: string }>(request, 'GET', '/api/people/imports', scopedToken)
    expect(denied.status).toBe(403)
    expect(denied.body?.code).toBe('scope_denied')
    const deniedUpload = await uploadImport(request, scopedToken, csvFile())
    expect(deniedUpload.status).toBe(403)

    // Another organization of the tenant and another tenant: the import does not exist for them.
    const second = await createSecondOrganization(request, club)
    for (const token of [second.adminToken, otherClub.adminToken]) {
      expect((await getImport(request, token, preview.id)).status).toBe(404)
      expect((await call(request, 'GET', `/api/people/imports/${preview.id}/rows`, token)).status).toBe(404)
      expect((await decideRow(request, token, preview.id, rows[0], { action: 'skip' })).status).toBe(404)
      expect((await importAction(request, token, preview.id, 'commit', preview.updatedAt)).status).toBe(404)
      expect((await importAction(request, token, preview.id, 'cancel', preview.updatedAt)).status).toBe(404)
      const history = await call<{ items?: { id: string }[] }>(request, 'GET', '/api/people/imports', token)
      expect(history.status).toBe(200)
      expect((history.body?.items ?? []).map((item) => item.id)).not.toContain(preview.id)
    }
    // The import is untouched.
    expect(((await getImport(request, club.adminToken, preview.id)).body as ImportView).status).toBe('previewed')
  } finally {
    await otherClub.cleanup()
    await club.cleanup()
  }
})

async function scanInSchemes(
  page: Page,
  testInfo: Parameters<typeof scanBlockingViolations>[1],
  label: string,
  ready: () => Promise<void>,
) {
  const found: Record<string, unknown> = {}
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.reload()
    await ready()
    const violations = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
    if (violations.length > 0) found[`${label} (${colorScheme})`] = violations
  }
  return found
}

test('E02-S04 import pages: upload with the suggested mapping, preview, review queue, commit; keyboard, 375 px, light and dark', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e02-s04-pages')
  try {
    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, password)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}

    // The list page: empty history, the upload area.
    await page.goto('/backend/people/imports')
    const listReady = () => expect(page.getByRole('heading', { level: 1, name: /^Imports$|^Importy$/ })).toBeVisible()
    await listReady()
    await expect(page.getByText(/No imports yet|Nie ma jeszcze importów/)).toBeVisible()
    Object.assign(violations, await scanInSchemes(page, testInfo, 'list', listReady))

    // A file the page cannot read is reported before anything is sent.
    await page.locator('[data-testid="people-import-upload"] input[type="file"]').setInputFiles({
      name: 'rodziny.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([0x00, 0x01, 0x02]),
    })
    await expect(page.getByTestId('people-import-problem')).toBeVisible()

    // The real sheet: the header is read in the browser and the mapping suggested from the Polish column names.
    await page.locator('[data-testid="people-import-upload"] input[type="file"]').setInputFiles({
      name: 'rodziny.csv',
      mimeType: 'text/csv',
      buffer: familiesCsv(),
    })
    await expect(page.getByTestId('people-import-file-summary')).toContainText('rodziny.csv')
    await expect(page.getByTestId('people-import-map-participant.pesel')).toContainText(FAMILY_HEADER[3])
    await expect(page.getByTestId('people-import-map-guardian1.email')).toContainText(FAMILY_HEADER[6])
    await expect(page.getByTestId('people-import-map-group')).toContainText(FAMILY_HEADER[8])
    Object.assign(violations, await scanUploadForm(page, testInfo))
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // Preview by keyboard: focus the button and press Enter.
    const previewButton = page.getByTestId('people-import-preview')
    await previewButton.focus()
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/backend\/people\/imports\/[0-9a-f-]{36}$/)
    const importId = page.url().split('/').at(-1) ?? ''
    const recordReady = () => expect(page.getByTestId('people-import-status')).toBeVisible()
    await recordReady()
    await expect(page.getByTestId('people-import-row-6-classification')).toContainText(/Error|Błąd/)
    await expect(page.getByTestId('people-import-row-5-classification')).toContainText(/To review|Do przejrzenia/)
    await expect(page.getByTestId('people-import-commit')).toBeDisabled()
    await expect(page.getByTestId('people-import-pending')).toBeVisible()
    Object.assign(violations, await scanInSchemes(page, testInfo, 'record', recordReady))

    // The review queue: the row waits; "Create" decides it, then the commit is enabled.
    await page.getByTestId('people-import-filter-pending').click()
    await expect(page.getByTestId('people-import-row-5-decision')).toBeVisible()
    await expect(page.getByTestId('people-import-row-2-decision')).toHaveCount(0)
    await page.getByTestId('people-import-row-5-match').click()
    await expect(page.getByTestId('people-import-match-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByTestId('people-import-row-5-create').click()
    await expect(page.getByTestId('people-import-commit')).toBeEnabled()

    // The import changes elsewhere (cancelled and reopened): the page's lock token is stale, the commit shows the
    // conflict and writes nothing; after a reload the commit goes through.
    const current = (await getImport(request, club.adminToken, importId)).body as ImportView
    const cancelled = await importAction(request, club.adminToken, importId, 'cancel', current.updatedAt)
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    const undoToken = (await actionLogEntries(request, club.adminToken, importId)).find(
      (entry) => entry.commandId === 'people.imports.cancel',
    )?.undoToken
    expect((await undoByToken(request, club.adminToken, String(undoToken))).status()).toBe(200)
    const commitButton = page.getByTestId('people-import-commit')
    await commitButton.click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /Commit the import|Zatwierdź import/ })
      .click()
    await expect(page.getByText(CONFLICT).first()).toBeVisible()
    expect(((await getImport(request, club.adminToken, importId)).body as ImportView).status).toBe('previewed')
    await page.reload()
    await recordReady()
    await page.getByTestId('people-import-commit').click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /Commit the import|Zatwierdź import/ })
      .click()
    await expect(page.getByTestId('people-import-status')).toContainText(/Committed|Zatwierdzony/)
    // Ola, Anna, Zofia, Maria, Tomasz (all new in this club), and Jan with Ewa from the decided row.
    await expect(page.getByTestId('people-import-summary-created')).toContainText('7')
    await expect(page.getByTestId('people-import-commit')).toHaveCount(0)
    await expectNoPageOverflow(page)

    // The history lists the import with who ran it.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/backend/people/imports')
    await expect(page.getByTestId(`people-import-status-${importId}`)).toContainText(/Committed|Zatwierdzony/)
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})

/** The mapping form is scanned without a reload (a reload would drop the chosen file). */
async function scanUploadForm(page: Page, testInfo: Parameters<typeof scanBlockingViolations>[1]) {
  const violations = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
  return violations.length > 0 ? { 'upload form (light)': violations } : {}
}
