import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { setRoleAclFeatures } from '@open-mercato/core/helpers/integration/authFixtures'
import { redoByLogId, undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { OPTIMISTIC_LOCK_HEADER, call, createClub } from '../_fixtures/club'
import { clubEventId, examplePlaces, readClubEvent } from '../_fixtures/club-events'
import { create as createStructure } from '../_fixtures/club-structure'
import { signedInStaff } from '../_fixtures/groups'
import { actionLogEntries } from '../_fixtures/people'
import { SVG_AS_PNG, pdf, png, upload, type UploadFile } from '../_fixtures/publication'
import { uiText } from '../_fixtures/ui-text'

// Club events spec TEST-T08 and the files steps of TEST-T11 (phase 4, REQ-T08, DD-T10, AC-T08 in part; #379). The
// administrator uploads a 3 MB JPEG poster, then a second poster: one live poster remains, the second, and the undo of
// the second upload brings the first back (its redo links the second again). By their bytes, an SVG renamed `.png` and
// a PDF poster answer 422 `club_event_file_format_unsupported` and a 7 MB PNG 422 `club_event_file_too_large`. Twelve
// funder logos with names are accepted in upload order; a thirteenth answers 422 `club_event_funders_limit`, a logo
// without a name 422 `club_event_funder_name_invalid`. A deleted logo returns in its place on undo; a stale lock token
// answers 409. A coordinator of another section is refused (403). In the browser the Files tab shows the poster preview
// with Replace, the logos with their names and Remove, the upload status and a 422 from the server, in English and
// Polish, light and dark, at desktop and 1024 px, without blocking axe violations.
test.describe.configure({ timeout: 600_000 })

type FileView = {
  id: string
  kind: 'poster' | 'funder_logo'
  funderName: string | null
  fileName: string
  mimeType: string
  fileSize: number
  position: number
  url: string
  updatedAt: string
}

type EventWithFiles = { files?: FileView[] }

/** A JPEG signature followed by zeros: `megabytes` large. */
function jpeg(megabytes: number, name: string): UploadFile {
  const buffer = Buffer.alloc(Math.round(megabytes * 1024 * 1024))
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(buffer)
  return { name, mimeType: 'image/jpeg', buffer }
}

/** A PNG signature followed by zeros: `megabytes` large. */
function largePng(megabytes: number): UploadFile {
  const buffer = Buffer.alloc(megabytes * 1024 * 1024)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer)
  return { name: 'plakat-duzy.png', mimeType: 'image/png', buffer }
}

function logo(index: number): UploadFile {
  return { ...png([index * 15, 90, 200 - index * 10], 16), name: `logo-${String(index)}.png` }
}

async function files(request: APIRequestContext, token: string, eventId: string): Promise<FileView[]> {
  const read = await readClubEvent(request, token, eventId)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return (read.body as EventWithFiles | null)?.files ?? []
}

async function logOf(request: APIRequestContext, token: string, resourceId: string, commandId: string) {
  const entry = (await actionLogEntries(request, token, resourceId)).find((item) => item.commandId === commandId)
  expect(entry?.undoToken, `undo token of ${commandId}`).toBeTruthy()
  return { logId: String(entry?.id), undoToken: String(entry?.undoToken) }
}

test('TEST-T08 a club event keeps one poster and up to 12 named funder logos, checked by their bytes; replacing and removing undo', async ({
  request,
}) => {
  const club = await createClub(request, 'test-t08-club-event-files')
  try {
    const admin = club.adminToken
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const fitness = await createStructure(request, admin, 'sections', { name: 'Ogólnorozwojowe' })
    const { hall } = await examplePlaces(request, club)
    const eventId = await clubEventId(request, admin, {
      name: 'GWIAZDA CUP 2026',
      sectionId: academy,
      placeId: hall,
    })
    const path = `/api/activities/club-events/${eventId}/files`
    expect(await files(request, admin, eventId)).toEqual([])

    // The poster: a 3 MB JPEG, then a second poster that replaces it.
    const first = await upload(request, admin, path, jpeg(3, 'plakat-2026.jpg'), { kind: 'poster' })
    expect(first.status, JSON.stringify(first.body)).toBe(201)
    expect(first.body).toMatchObject({
      kind: 'poster',
      fileName: 'plakat-2026.jpg',
      mimeType: 'image/jpeg',
      fileSize: 3 * 1024 * 1024,
      funderName: null,
      replacedId: null,
    })
    expect(String(first.body?.url)).toMatch(/^\/api\/attachments\/image\//)
    const second = await upload(request, admin, path, png([200, 40, 40], 32), { kind: 'poster' })
    expect(second.status, JSON.stringify(second.body)).toBe(201)
    expect(second.body?.replacedId).toBe(first.body?.id)
    let posters = (await files(request, admin, eventId)).filter((file) => file.kind === 'poster')
    expect(posters.map((file) => file.id)).toEqual([second.body?.id])

    // Undo of the second upload: the first poster returns; redo links the second again.
    const secondLog = await logOf(request, admin, String(second.body?.id), 'activities.club_event_files.add')
    const undone = await undoByToken(request, admin, secondLog.undoToken)
    expect(undone.status(), await undone.text()).toBe(200)
    posters = (await files(request, admin, eventId)).filter((file) => file.kind === 'poster')
    expect(posters.map((file) => file.id)).toEqual([first.body?.id])
    // No Vereino role grants redo today, so the test gives the administrator's platform role the feature (TEST-F01).
    await setRoleAclFeatures(request, club.superToken, {
      roleId: club.tenant.roleId,
      features: ['audit_logs.view_self', 'audit_logs.undo_self', 'audit_logs.redo_self'],
    })
    const redone = await redoByLogId(request, admin, secondLog.logId)
    expect(redone.status(), await redone.text()).toBe(200)
    posters = (await files(request, admin, eventId)).filter((file) => file.kind === 'poster')
    expect(posters.map((file) => file.id)).toEqual([second.body?.id])

    // Negative cases, checked by the bytes: nothing is stored.
    const svg = await upload(request, admin, path, SVG_AS_PNG, { kind: 'poster' })
    expect(svg.status, JSON.stringify(svg.body)).toBe(422)
    expect(svg.body?.code).toBe('club_event_file_format_unsupported')
    const pdfPoster = await upload(request, admin, path, pdf('plakat.pdf'), { kind: 'poster' })
    expect(pdfPoster.status, JSON.stringify(pdfPoster.body)).toBe(422)
    expect(pdfPoster.body?.code).toBe('club_event_file_format_unsupported')
    const tooLarge = await upload(request, admin, path, largePng(7), { kind: 'poster' })
    expect(tooLarge.status, JSON.stringify(tooLarge.body)).toBe(422)
    expect(tooLarge.body?.code).toBe('club_event_file_too_large')
    const logoTooLarge = await upload(request, admin, path, jpeg(3, 'logo.jpg'), {
      kind: 'funder_logo',
      funderName: 'Gmina Liszki',
    })
    expect(logoTooLarge.body?.code).toBe('club_event_file_too_large')
    const badKind = await upload(request, admin, path, logo(0), { kind: 'flyer' })
    expect(badKind.status).toBe(400)
    const noName = await upload(request, admin, path, logo(0), { kind: 'funder_logo' })
    expect(noName.status, JSON.stringify(noName.body)).toBe(422)
    expect(noName.body?.code).toBe('club_event_funder_name_invalid')
    const shortName = await upload(request, admin, path, logo(0), { kind: 'funder_logo', funderName: ' G ' })
    expect(shortName.body?.code).toBe('club_event_funder_name_invalid')
    expect((await files(request, admin, eventId)).map((file) => file.id)).toEqual([second.body?.id])

    // A coordinator of another section manages no file of this event.
    const ola = await signedInStaff(request, club, {
      firstName: 'Ola',
      lastName: 'Fitness',
      role: 'coordinator',
      sectionId: fitness,
    })
    const foreign = await upload(request, ola.token, path, logo(0), { kind: 'funder_logo', funderName: 'Gmina' })
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(403)

    // Twelve logos with names, in upload order; a thirteenth is refused.
    const funders = Array.from({ length: 12 }, (_, index) => `Fundator ${String(index + 1)}`)
    const logoIds: string[] = []
    for (const [index, funderName] of funders.entries()) {
      const stored = await upload(request, admin, path, logo(index), { kind: 'funder_logo', funderName })
      expect(stored.status, JSON.stringify(stored.body)).toBe(201)
      expect(stored.body).toMatchObject({ kind: 'funder_logo', funderName, position: index })
      logoIds.push(String(stored.body?.id))
    }
    const thirteenth = await upload(request, admin, path, logo(12), {
      kind: 'funder_logo',
      funderName: 'Fundator 13',
    })
    expect(thirteenth.status, JSON.stringify(thirteenth.body)).toBe(422)
    expect(thirteenth.body?.code).toBe('club_event_funders_limit')
    let listed = await files(request, admin, eventId)
    expect(listed[0].kind).toBe('poster')
    expect(listed.filter((file) => file.kind === 'funder_logo').map((file) => file.funderName)).toEqual(funders)

    // The staff image route serves a logo to the administrator.
    const image = await request.get(listed[1].url, { headers: { Authorization: `Bearer ${admin}` } })
    expect(image.status()).toBe(200)

    // Removing a logo needs its lock token: a stale one answers 409, the current one removes it.
    const removed = listed.find((file) => file.funderName === 'Fundator 5') as FileView
    const stale = await call(request, 'DELETE', `${path}/${removed.id}`, admin, {
      headers: { [OPTIMISTIC_LOCK_HEADER]: '2020-01-01T00:00:00.000Z' },
    })
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)
    const deleted = await call(request, 'DELETE', `${path}/${removed.id}`, admin, {
      headers: { [OPTIMISTIC_LOCK_HEADER]: removed.updatedAt },
    })
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200)
    listed = await files(request, admin, eventId)
    expect(listed.filter((file) => file.kind === 'funder_logo')).toHaveLength(11)
    // Another event's id in the path does not reach this event's file.
    const other = await clubEventId(request, admin, { name: 'Turniej zimowy', sectionId: academy, placeId: hall })
    const elsewhere = await call(request, 'DELETE', `/api/activities/club-events/${other}/files/${logoIds[0]}`, admin, {
      headers: { [OPTIMISTIC_LOCK_HEADER]: listed[1].updatedAt },
    })
    expect(elsewhere.status).toBe(404)

    // The undo puts the logo back in its place.
    const deleteLog = await logOf(request, admin, removed.id, 'activities.club_event_files.delete')
    const restored = await undoByToken(request, admin, deleteLog.undoToken)
    expect(restored.status(), await restored.text()).toBe(200)
    listed = await files(request, admin, eventId)
    expect(listed.filter((file) => file.kind === 'funder_logo').map((file) => file.funderName)).toEqual(funders)
  } finally {
    await club.cleanup()
  }
})

async function setLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

test('TEST-T11 files steps: the Files tab shows the poster with Replace, the named logos with Remove, upload status and 422 codes', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-t11-club-event-files-ui')
  try {
    const admin = club.adminToken
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const { hall } = await examplePlaces(request, club)
    const eventId = await clubEventId(request, admin, { name: 'GWIAZDA CUP 2026', sectionId: academy, placeId: hall })

    page.setDefaultTimeout(30_000)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await prepareForAccessibilityScan(page)
    const login = await page.request.post('/api/auth/login', {
      form: { email: club.tenant.email, password: club.tenant.password },
    })
    expect(login.ok(), `POST /api/auth/login ${String(login.status())}`).toBe(true)
    await setLocale(page, 'en')
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/backend/activities/club-events/${eventId}?tab=files`)
    const panel = page.getByTestId('club-event-files')
    await expect(panel).toBeVisible()
    await expect(page.getByTestId('club-event-poster-empty')).toContainText(
      uiText('activities.clubEventFiles.poster.empty'),
    )
    await expect(page.getByTestId('club-event-logos-empty')).toBeVisible()

    // An SVG renamed `.png` is refused by the server; the message names the file.
    const posterInput = page.getByTestId('club-event-poster-upload').locator('input[type="file"]')
    await posterInput.setInputFiles({ name: SVG_AS_PNG.name, mimeType: SVG_AS_PNG.mimeType, buffer: SVG_AS_PNG.buffer })
    await expect(page.getByTestId('club-event-poster-error')).toContainText(
      uiText('activities.errors.club_event_file_format_unsupported'),
    )

    // The poster, then Replace.
    const posterA = png([30, 120, 200], 64)
    await posterInput.setInputFiles({ name: 'plakat-a.png', mimeType: 'image/png', buffer: posterA.buffer })
    await expect(page.getByTestId('club-event-poster')).toContainText('plakat-a.png')
    await expect(page.getByTestId('club-event-poster-error')).toHaveCount(0)
    await expect(page.getByTestId('club-event-poster-upload')).toContainText(
      uiText('activities.clubEventFiles.poster.replace'),
    )
    const posterB = png([200, 60, 30], 64)
    await posterInput.setInputFiles({ name: 'plakat-b.png', mimeType: 'image/png', buffer: posterB.buffer })
    await expect(page.getByTestId('club-event-poster')).toContainText('plakat-b.png')
    expect((await files(request, admin, eventId)).filter((file) => file.kind === 'poster')).toHaveLength(1)

    // Two logos with their names; the upload stays closed until a name is typed.
    const logoUpload = page.getByTestId('club-event-logo-upload')
    const nameInput = page.getByLabel(uiText('activities.clubEventFiles.logos.funderName', { exact: true }))
    await expect(logoUpload.locator('input[type="file"]')).toBeDisabled()
    for (const [index, funder] of ['Gmina Liszki', 'Ministerstwo Sportu i Turystyki'].entries()) {
      await nameInput.fill(funder)
      await logoUpload.locator('input[type="file"]').setInputFiles({
        name: `logo-${String(index)}.png`,
        mimeType: 'image/png',
        buffer: logo(index).buffer,
      })
      await expect(page.getByTestId('club-event-logos').getByRole('listitem')).toHaveCount(index + 1)
      await expect(nameInput).toHaveValue('')
    }
    await expect(page.getByTestId('club-event-logos').getByRole('img', { name: 'Gmina Liszki' })).toBeVisible()

    // Both locales, light and dark, desktop and 1024 px: no blocking axe violation.
    for (const locale of ['en', 'pl'] as const) {
      await setLocale(page, locale)
      for (const width of [1280, 1024]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`/backend/activities/club-events/${eventId}?tab=files`)
        const violations = await scanInColorSchemes(
          page,
          testInfo,
          `club event files ${locale} ${String(width)}`,
          async () => {
            await expect(page.getByTestId('club-event-logos').getByRole('listitem')).toHaveCount(2)
            await expect(page.getByTestId('club-event-poster')).toBeVisible()
          },
          { platformBaseline: true },
        )
        expect(violations).toEqual({})
      }
    }

    // Remove a logo through the confirmation (in Polish now).
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/backend/activities/club-events/${eventId}?tab=files`)
    await page
      .getByRole('button', {
        name: uiText('activities.clubEventFiles.actions.removeLogo', { params: { name: 'Gmina Liszki' } }),
      })
      .click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: uiText('activities.clubEventFiles.actions.remove', { exact: true }) })
      .click()
    await expect(page.getByTestId('club-event-logos').getByRole('listitem')).toHaveCount(1)
    await expect(page.getByTestId('club-event-logos')).toContainText('Ministerstwo Sportu i Turystyki')
    expect(consoleErrors.filter((text) => !/Failed to load resource/.test(text))).toEqual([])
  } finally {
    await club.cleanup()
  }
})
