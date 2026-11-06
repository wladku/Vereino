import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { OPTIMISTIC_LOCK_HEADER, call, createClub } from '../_fixtures/club'
import { create, signInBrowser } from '../_fixtures/club-structure'
import { SVG_AS_PNG, pdf, png, upload } from '../_fixtures/publication'

// Issue #86 slice (b) (E06-S04; UX parity spec REQ-U03, J-U03, TEST-U08 files part, TEST-U09 form part, AC-U05): a
// place keeps its regulations text, one regulations PDF and up to 10 photos. Uploads are checked by their bytes (an
// SVG renamed `.png` → 422 `place_file_format_unsupported`, a PDF as a photo, an oversized PDF → 422
// `place_file_too_large`); two parallel uploads at 9 photos end with exactly 10; an eleventh photo → 422
// `place_photos_limit_reached`; a second regulations PDF replaces the first; a removed photo leaves the list. In the
// browser the place form shows the "Regulations and photos" group, lists the PDF and the photos, removes a photo
// through the confirmation, uploads one through the file input and answers a stale save with the conflict message.
test.describe.configure({ timeout: 300_000 })

type PlaceFileItem = { id: string; kind: 'photo' | 'regulations'; fileName: string; position: number; url: string }

const CONFLICT = /modified by someone else|zmodyfikowany przez/

async function listFiles(request: APIRequestContext, token: string, placeId: string): Promise<PlaceFileItem[]> {
  const result = await call<{ items?: PlaceFileItem[] }>(
    request,
    'GET',
    `/api/club_core/places/${placeId}/files`,
    token,
  )
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body?.items ?? []
}

function photo(index: number) {
  return { ...png([index * 20, 120, 200 - index * 10]), name: `zdjecie-${String(index)}.png` }
}

test('TEST-U08 place regulations and photos: byte checks, the 10-photo limit under a lock, PDF replacement, removal; the form group', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-u08-place-files')
  try {
    page.setDefaultTimeout(30_000)
    let token = club.adminToken
    const orlik = await create(request, token, 'places', { name: 'Orlik', kind: 'complex' })
    const filesPath = `/api/club_core/places/${orlik}/files`

    // The regulations text round-trips through the place update and the list.
    const listed = await call<{ items?: { id: string; updatedAt: string; regulationsText: string | null }[] }>(
      request,
      'GET',
      `/api/club_core/places?ids=${orlik}`,
      token,
    )
    const before = listed.body?.items?.[0]
    expect(before?.regulationsText).toBeNull()
    const saved = await call<{ updatedAt?: string }>(request, 'PUT', '/api/club_core/places', token, {
      data: { id: orlik, regulationsText: 'Obuwie halowe obowiązkowe.' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(before?.updatedAt) },
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const after = await call<{ items?: { regulationsText: string | null }[] }>(
      request,
      'GET',
      `/api/club_core/places?ids=${orlik}`,
      token,
    )
    expect(after.body?.items?.[0]?.regulationsText).toBe('Obuwie halowe obowiązkowe.')
    const tooLong = await call(request, 'PUT', '/api/club_core/places', token, {
      data: { id: orlik, regulationsText: 'x'.repeat(20_001) },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(saved.body?.updatedAt) },
    })
    expect(tooLong.status).toBe(400)

    // Negative cases, checked by the bytes: nothing is stored.
    const svg = await upload(request, token, filesPath, SVG_AS_PNG, { kind: 'photo' })
    expect(svg.status, JSON.stringify(svg.body)).toBe(422)
    expect(svg.body?.code).toBe('place_file_format_unsupported')
    const pdfAsPhoto = await upload(request, token, filesPath, pdf('regulamin.pdf'), { kind: 'photo' })
    expect(pdfAsPhoto.body?.code).toBe('place_file_format_unsupported')
    const pngAsRegulations = await upload(request, token, filesPath, photo(0), { kind: 'regulations' })
    expect(pngAsRegulations.body?.code).toBe('place_file_format_unsupported')
    const bigPdf = Buffer.alloc(10 * 1024 * 1024 + 1)
    Buffer.from('%PDF-1.4\n', 'latin1').copy(bigPdf)
    const oversized = await upload(
      request,
      token,
      filesPath,
      { name: 'duzy.pdf', mimeType: 'application/pdf', buffer: bigPdf },
      { kind: 'regulations' },
    )
    expect(oversized.status, JSON.stringify(oversized.body)).toBe(422)
    expect(oversized.body?.code).toBe('place_file_too_large')
    const badKind = await upload(request, token, filesPath, photo(0), { kind: 'logo' })
    expect(badKind.status).toBe(400)
    expect(await listFiles(request, token, orlik)).toEqual([])

    // The regulations PDF, then a second one that replaces it.
    const first = await upload(request, token, filesPath, pdf('regulamin-2025.pdf'), { kind: 'regulations' })
    expect(first.status, JSON.stringify(first.body)).toBe(201)
    expect(first.body).toMatchObject({ kind: 'regulations', fileName: 'regulamin-2025.pdf', replacedId: null })
    const second = await upload(request, token, filesPath, pdf('regulamin-2026.pdf'), { kind: 'regulations' })
    expect(second.status, JSON.stringify(second.body)).toBe(201)
    expect(second.body?.replacedId).toBe(first.body?.id)
    const regulations = (await listFiles(request, token, orlik)).filter((item) => item.kind === 'regulations')
    expect(regulations.map((item) => item.fileName)).toEqual(['regulamin-2026.pdf'])
    expect(regulations[0].url).toMatch(/^\/api\/attachments\/file\//)

    // Nine photos, then two parallel uploads: exactly one more is stored (the place row is locked while counting).
    for (let index = 1; index <= 9; index += 1) {
      const stored = await upload(request, token, filesPath, photo(index), { kind: 'photo' })
      expect(stored.status, JSON.stringify(stored.body)).toBe(201)
      expect(stored.body?.position).toBe(index - 1)
    }
    const parallel = await Promise.all([
      upload(request, token, filesPath, photo(10), { kind: 'photo' }),
      upload(request, token, filesPath, photo(11), { kind: 'photo' }),
    ])
    expect(parallel.map((result) => result.status).sort()).toEqual([201, 422])
    expect(parallel.find((result) => result.status === 422)?.body?.code).toBe('place_photos_limit_reached')
    const eleventh = await upload(request, token, filesPath, photo(12), { kind: 'photo' })
    expect(eleventh.status).toBe(422)
    expect(eleventh.body?.code).toBe('place_photos_limit_reached')
    let files = await listFiles(request, token, orlik)
    expect(files.filter((item) => item.kind === 'photo')).toHaveLength(10)
    expect(files[0].kind).toBe('regulations')

    // Removing a photo frees a slot; an unknown file answers 404.
    const removed = files.find((item) => item.fileName === 'zdjecie-9.png')
    const deleted = await call(request, 'DELETE', `${filesPath}/${String(removed?.id)}`, token)
    expect(deleted.status).toBe(204)
    expect((await call(request, 'DELETE', `${filesPath}/${String(removed?.id)}`, token)).status).toBe(404)
    files = await listFiles(request, token, orlik)
    expect(files.filter((item) => item.kind === 'photo')).toHaveLength(9)
    // Another place's id in the path does not reach this place's file.
    const hall = await create(request, token, 'places', { name: 'Hala', kind: 'hall' })
    const foreign = await call(request, 'DELETE', `/api/club_core/places/${hall}/files/${files[1].id}`, token)
    expect(foreign.status).toBe(404)

    // Browser: the form group lists the PDF and 9 photos, removes one, uploads one.
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 1280, height: 900 })
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    // The browser sign-in resets the password, which ends the earlier API token.
    token = await getAuthToken(request, club.tenant.email, password)
    await page.goto(`/backend/club/places/${orlik}/edit`)
    const panel = page.getByTestId('place-files-panel')
    await expect(panel).toBeVisible()
    await expect(page.locator('[data-crud-field-id="regulationsText"] textarea')).toHaveValue(
      'Obuwie halowe obowiązkowe.',
    )
    await expect(page.getByTestId('place-regulations-file')).toContainText('regulamin-2026.pdf')
    const photos = page.getByTestId('place-photos-list').getByRole('listitem')
    await expect(photos).toHaveCount(9)
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      'place form files',
      async () => {
        await expect(page.getByTestId('place-photos-list').getByRole('listitem')).toHaveCount(9)
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})

    await page.getByRole('button', { name: /^(Remove photo|Usuń zdjęcie) zdjecie-1\.png$/ }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /^(Confirm|Potwierdź|Delete|Usuń|Remove|OK)$/ })
      .click()
    await expect(photos).toHaveCount(8)
    await panel.locator('input[type="file"][accept^="image/"]').setInputFiles({
      name: 'nowe.png',
      mimeType: 'image/png',
      buffer: photo(13).buffer,
    })
    await expect(photos).toHaveCount(9)
    await expect(photos.filter({ hasText: 'nowe.png' })).toHaveCount(1)

    // A stale save: the place changed meanwhile, so the form answers with the conflict message.
    const current = await call<{ items?: { updatedAt: string }[] }>(
      request,
      'GET',
      `/api/club_core/places?ids=${orlik}`,
      token,
    )
    const meanwhile = await call(request, 'PUT', '/api/club_core/places', token, {
      data: { id: orlik, capacityGroups: 3 },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(current.body?.items?.[0]?.updatedAt) },
    })
    expect(meanwhile.status).toBe(200)
    await page.locator('[data-crud-field-id="regulationsText"] textarea').fill('Nowy regulamin.')
    const [stale] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes('/api/club_core/places') && response.request().method() === 'PUT',
      ),
      page
        .getByRole('button', { name: /^(Save|Zapisz)$/ })
        .first()
        .click(),
    ])
    expect(stale.status()).toBe(409)
    await expect(page.getByText(CONFLICT).first()).toBeVisible()

    // A new place shows the hint instead of the files; 375 px reflows.
    await page.goto('/backend/club/places/create')
    await expect(page.getByText(/Save the place first|Najpierw zapisz obiekt/)).toBeVisible()
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/backend/club/places/${orlik}/edit`)
    await expect(page.getByTestId('place-files-panel')).toBeVisible()
    await expectNoPageOverflow(page)
  } finally {
    await club.cleanup()
  }
})
