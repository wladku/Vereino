import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  assignRole,
  birthDateTurning,
  call,
  createClub,
  createStaff,
  expectRoles,
  signInAs,
  uniqueSuffix,
} from '../_fixtures/club'
import { create, signInBrowser } from '../_fixtures/club-structure'
import {
  SVG_AS_PNG,
  SVG_FILE,
  bigPng,
  getSection,
  getSettings,
  png,
  publicGet,
  publish,
  putSectionPublic,
  removeLogo,
  upload,
  type PublicClubPage,
  type PublicSectionPage,
} from '../_fixtures/publication'

// TEST-040 (club spec *Integration Coverage*, REQ-028, AC-028, glossary *Logo*; issue #29): a club without a logo and
// two sections; the club logo is uploaded, one section gets its own logo and loses it again; an SVG (also one renamed
// to .png) and a 3 MB file answer 422; the coordinator of another section gets 403; the public API returns the
// effective logo (section ?? club ?? initial) and serves its bytes without a session; the headers of `/backend`,
// `/club` and `/p` show the club logo.
test.describe.configure({ timeout: 300_000 })

const RED = png([200, 30, 30])
const BLUE = png([30, 30, 200])
const GREEN = png([30, 160, 60])

test('TEST-040 club and section logos: effective logo, 422 for SVG and 3 MB, 403 for another section, public bytes', async ({
  request,
}) => {
  const club = await createClub(request, 'test-040')
  try {
    const token = club.adminToken
    const slug = `t040-${uniqueSuffix()}`
    const academy = await create(request, token, 'sections', { name: 'Akademia piłkarska' })
    const pool = await create(request, token, 'sections', { name: 'Basen' })
    for (const [id, sectionSlug] of [
      [academy, 'akademia'],
      [pool, 'basen'],
    ] as const) {
      expect((await putSectionPublic(request, token, id, { isPublic: true, publicSlug: sectionSlug })).status).toBe(200)
    }
    await publish(request, token, slug, ['contact'], { shortName: 'Żaki' })

    // Without a club logo: the initial of the club name everywhere, and no logo file.
    const before = (await publicGet(request, `/api/club_core/public/${slug}`)).body as unknown as PublicClubPage
    expect(before.club.logo).toEqual({ url: null, source: 'initial', initial: 'Ż' })
    expect(before.sections.map((item) => item.logo.source)).toEqual(['initial', 'initial'])
    expect((await publicGet(request, `/api/club_core/public/${slug}/logo`)).status).toBe(404)

    // Wrong format or size → 422 at the field; nothing changes.
    let settings = await getSettings(request, token)
    for (const [file, code] of [
      [SVG_FILE, 'logo_format_unsupported'],
      [SVG_AS_PNG, 'logo_format_unsupported'],
      [bigPng(), 'logo_too_large'],
    ] as const) {
      const refused = await upload(request, token, '/api/club_core/logo', file, {}, settings.updatedAt)
      expect(refused.status, `${file.name} ${JSON.stringify(refused.body)}`).toBe(422)
      expect(refused.body?.code).toBe(code)
    }
    const sectionRefused = await upload(
      request,
      token,
      `/api/club_core/sections/${pool}/logo`,
      SVG_FILE,
      {},
      (await getSection(request, token, pool)).updatedAt,
    )
    expect(sectionRefused.status).toBe(422)
    expect((await getSettings(request, token)).logoAttachmentId).toBeNull()

    // The club logo, with the settings lock token (a stale one answers 409).
    const stale = await upload(request, token, '/api/club_core/logo', RED, {}, '2020-01-01T00:00:00.000Z')
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)
    settings = await getSettings(request, token)
    const clubLogo = await upload(request, token, '/api/club_core/logo', RED, {}, settings.updatedAt)
    expect(clubLogo.status, JSON.stringify(clubLogo.body)).toBe(200)
    settings = await getSettings(request, token)
    expect(settings.logoAttachmentId).toEqual(clubLogo.body?.logoAttachmentId)
    expect(settings.logoUrl).toContain(`/api/attachments/image/${String(settings.logoAttachmentId)}`)
    // Staff read it through the platform's authenticated image route; a guest cannot.
    const staffImage = await request.fetch(settings.logoUrl ?? '', { headers: { Authorization: `Bearer ${token}` } })
    expect(staffImage.status()).toBe(200)
    expect((await publicGet(request, settings.logoUrl ?? '')).status).not.toBe(200)

    // A section logo for the academy: the academy shows its own, the pool the club's.
    const academyLogo = await upload(
      request,
      token,
      `/api/club_core/sections/${academy}/logo`,
      BLUE,
      {},
      (await getSection(request, token, academy)).updatedAt,
    )
    expect(academyLogo.status, JSON.stringify(academyLogo.body)).toBe(200)
    const withLogos = (await publicGet(request, `/api/club_core/public/${slug}`)).body as unknown as PublicClubPage
    expect(withLogos.club.logo.source).toBe('club')
    const tiles = new Map(withLogos.sections.map((item) => [item.slug, item.logo]))
    expect(tiles.get('akademia')?.source).toBe('section')
    expect(tiles.get('basen')?.source).toBe('club')
    expect(tiles.get('basen')?.url).toBe(withLogos.club.logo.url)
    const academyPage = (await publicGet(request, `/api/club_core/public/${slug}/sections/akademia`))
      .body as unknown as PublicSectionPage
    expect(academyPage.section.logo.source).toBe('section')

    // The public bytes, without a session: the club logo, the academy's own logo; the pool has none of its own.
    const clubBytes = await publicGet(request, withLogos.club.logo.url ?? '')
    expect(clubBytes.status).toBe(200)
    expect(clubBytes.headers['content-type']).toContain('image/png')
    expect(clubBytes.headers['x-content-type-options']).toBe('nosniff')
    expect(clubBytes.bytes.equals(RED.buffer)).toBe(true)
    const academyBytes = await publicGet(request, tiles.get('akademia')?.url ?? '')
    expect(academyBytes.status).toBe(200)
    expect(academyBytes.bytes.equals(BLUE.buffer)).toBe(true)
    expect((await publicGet(request, `/api/club_core/public/${slug}/sections/basen/logo`)).status).toBe(404)

    // The coordinator of the pool: 403 for the academy, their own pool's logo is theirs.
    const marek = await createStaff(request, club, {
      firstName: 'Marek',
      lastName: 'Basenowy',
      birthDate: birthDateTurning(40),
    })
    await assignRole(request, token, {
      personId: marek.personId,
      role: 'coordinator',
      sectionId: pool,
      validFrom: '2020-01-01',
    })
    await expectRoles(request, club, marek.userId, ['vereino_coordinator', 'vereino_member'])
    const marekToken = await signInAs(request, club, marek.userId, marek.email)
    const foreign = await upload(
      request,
      marekToken,
      `/api/club_core/sections/${academy}/logo`,
      GREEN,
      {},
      (await getSection(request, token, academy)).updatedAt,
    )
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(403)
    expect(foreign.body?.code).toBe('scope_denied')
    const foreignRemove = await removeLogo(
      request,
      marekToken,
      `/api/club_core/sections/${academy}/logo`,
      (await getSection(request, token, academy)).updatedAt,
    )
    expect(foreignRemove.status).toBe(403)
    expect((await upload(request, marekToken, '/api/club_core/logo', GREEN, {}, null)).status).toBe(403)
    const own = await upload(
      request,
      marekToken,
      `/api/club_core/sections/${pool}/logo`,
      GREEN,
      {},
      (await getSection(request, marekToken, pool)).updatedAt,
    )
    expect(own.status, JSON.stringify(own.body)).toBe(200)
    const poolOwn = await publicGet(request, `/api/club_core/public/${slug}/sections/basen/logo`)
    expect(poolOwn.bytes.equals(GREEN.buffer)).toBe(true)

    // Removing a section logo restores the club logo.
    const removed = await removeLogo(
      request,
      token,
      `/api/club_core/sections/${academy}/logo`,
      (await getSection(request, token, academy)).updatedAt,
    )
    expect(removed.status, JSON.stringify(removed.body)).toBe(200)
    expect((await getSection(request, token, academy)).logoAttachmentId).toBeNull()
    const restored = (await publicGet(request, `/api/club_core/public/${slug}/sections/akademia`))
      .body as unknown as PublicSectionPage
    expect(restored.section.logo).toMatchObject({ source: 'club', url: withLogos.club.logo.url })
    expect((await publicGet(request, `/api/club_core/public/${slug}/sections/akademia/logo`)).status).toBe(404)

    // Removing the club logo brings the initial back for the sections without their own.
    const clubRemoved = await removeLogo(
      request,
      token,
      '/api/club_core/logo',
      (await getSettings(request, token)).updatedAt,
    )
    expect(clubRemoved.status, JSON.stringify(clubRemoved.body)).toBe(200)
    const afterRemoval = (await publicGet(request, `/api/club_core/public/${slug}`)).body as unknown as PublicClubPage
    expect(afterRemoval.club.logo.source).toBe('initial')
    expect(new Map(afterRemoval.sections.map((item) => [item.slug, item.logo.source]))).toEqual(
      new Map([
        ['akademia', 'initial'],
        ['basen', 'section'],
      ]),
    )
  } finally {
    await club.cleanup()
  }
})

test('TEST-040 the club logo in the headers of /backend, /club and /p, and a section logo uploaded in the edit page', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-040-ui')
  try {
    page.setDefaultTimeout(30_000)
    const slug = `t040ui-${uniqueSuffix()}`
    const pool = await create(request, club.adminToken, 'sections', { name: 'Basen' })
    expect(
      (await putSectionPublic(request, club.adminToken, pool, { isPublic: true, publicSlug: 'basen' })).status,
    ).toBe(200)
    await publish(request, club.adminToken, slug, ['contact'], { shortName: 'Delfin' })
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, password)
    const settings = await getSettings(request, club.adminToken)
    const uploaded = await upload(request, club.adminToken, '/api/club_core/logo', RED, {}, settings.updatedAt)
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(200)
    const attachmentId = String(uploaded.body?.logoAttachmentId)

    // /backend: the AppShell header shows the club logo.
    await page.goto('/backend/club/settings')
    await expect(page.locator(`img[src*="${attachmentId}"]`).first()).toBeVisible()
    await expect(page.getByTestId('club-logo-image')).toBeVisible()
    await expect(page.getByTestId('club-logo-source')).toHaveText(/Club logo|Logo klubu/)

    // /club: the member header (the club administrator is linked to a person).
    await page.goto('/club')
    await expect(page.getByTestId('club-logo')).toBeVisible()
    await expect(page.getByTestId('club-logo')).toHaveAttribute('src', new RegExp(attachmentId))

    // A section logo uploaded through the edit page replaces the club logo for that section.
    await page.goto(`/backend/club/sections/${pool}/edit`)
    await expect(page.getByTestId('section-logo-source')).toHaveText(/Club logo|Logo klubu/)
    await page.getByTestId('section-logo').locator('input[type="file"]').setInputFiles({
      name: 'basen.png',
      mimeType: 'image/png',
      buffer: BLUE.buffer,
    })
    await expect(page.getByTestId('section-logo-source')).toHaveText(/Section logo|Logo sekcji/)
    const section = await call<{ items?: { logoAttachmentId: string | null }[] }>(
      request,
      'GET',
      `/api/club_core/sections?ids=${pool}`,
      club.adminToken,
    )
    expect(section.body?.items?.[0]?.logoAttachmentId).toBeTruthy()

    // /p: the public header shows the club logo, the section page its own.
    await page.goto(`/p/${slug}`)
    await expect(page.getByTestId('public-club-link').getByTestId('public-logo')).toHaveAttribute(
      'data-logo-source',
      'club',
    )
    await page.goto(`/p/${slug}/sections/basen`)
    await expect(page.getByTestId('public-section-name')).toHaveText('Basen')
    await expect(page.locator('main [data-logo-source="section"]')).toBeVisible()
  } finally {
    await club.cleanup()
  }
})
