import { expect, test } from '@playwright/test'
import {
  assignRole,
  birthDateTurning,
  call,
  createClub,
  createStaff,
  expectRoles,
  signInAs,
  uniqueSuffix,
  type Club,
} from '../_fixtures/club'
import { create } from '../_fixtures/club-structure'
import { setUserFeatures } from '../_fixtures/members'
import {
  getSection,
  getSettings,
  pdf,
  publicGet,
  publish,
  putSectionPublic,
  putSettings,
  upload,
  type PublicClubPage,
  type PublicSectionPage,
} from '../_fixtures/publication'

// TEST-037, the `club_core` blocks (club spec *Integration Coverage*, REQ-025, AC-025, DD-28, DD-29; issue #29 —
// the groups, schedule, instructor and price blocks arrive with their modules): two clubs with different publication
// settings, a public and a non-public section, public and internal materials. A disabled block is absent from the
// response (not an empty value); a non-public section, an unknown slug and a section of another club answer the same
// 404; a club that does not publish its page answers its own 404; no personal data; the slug rules; the coordinator's
// public content in their own section only; the publication switch needs `club_core.publication.manage`.
test.describe.configure({ timeout: 300_000 })

const POOL_CONTENT = {
  isPublic: true,
  publicSlug: 'basen',
  publicDescription: 'Nauka pływania dla dzieci.',
  publicConditions: 'Strój kąpielowy, czepek, deklaracja.',
  publicContactName: 'Koordynator sekcji',
  publicContactEmail: 'basen@example.org',
  publicContactPhone: '+48 600 100 200',
}

async function section(request: Parameters<typeof create>[0], club: Club, name: string) {
  return create(request, club.adminToken, 'sections', { name })
}

test('TEST-037 the club_core blocks: enabled blocks only, non-public records invisible, the same 404, disabled page, slug and scope rules', async ({
  request,
}) => {
  const clubA = await createClub(request, 'test-037-a')
  const clubB = await createClub(request, 'test-037-b')
  try {
    const slugA = `t037a-${uniqueSuffix()}`
    const slugB = `t037b-${uniqueSuffix()}`

    // Club A: a public pool with every club_core field, a non-public chess section and a public section only A has.
    const poolA = await section(request, clubA, 'Basen')
    const chessA = await section(request, clubA, 'Szachy')
    const zumbaA = await section(request, clubA, 'Zumba')
    expect((await putSectionPublic(request, clubA.adminToken, poolA, POOL_CONTENT)).status).toBe(200)
    const chess = await putSectionPublic(request, clubA.adminToken, chessA, {
      isPublic: false,
      publicSlug: 'szachy',
      publicDescription: 'Opis, który nie jest publiczny.',
    })
    expect(chess.status, JSON.stringify(chess.body)).toBe(200)
    expect(
      (await putSectionPublic(request, clubA.adminToken, zumbaA, { isPublic: true, publicSlug: 'zumba' })).status,
    ).toBe(200)
    const regulations = await upload(
      request,
      clubA.adminToken,
      `/api/club_core/sections/${poolA}/materials`,
      pdf('regulamin.pdf'),
      { title: 'Regulamin sekcji', isPublic: 'true' },
    )
    expect(regulations.status, JSON.stringify(regulations.body)).toBe(201)
    const internal = await upload(
      request,
      clubA.adminToken,
      `/api/club_core/sections/${poolA}/materials`,
      pdf('notatki.pdf'),
      { title: 'Notatki trenerów', isPublic: 'false' },
    )
    expect(internal.status, JSON.stringify(internal.body)).toBe(201)
    await publish(request, clubA.adminToken, slugA, ['description_schedule', 'conditions', 'materials', 'contact'], {
      publicDescription: 'Klub wielosekcyjny.',
      contactPhone: '+48 22 100 00 00',
      shortName: 'Klub A',
    })

    // Club B: the same pool content, but the club publishes only the contact block.
    const poolB = await section(request, clubB, 'Basen')
    expect((await putSectionPublic(request, clubB.adminToken, poolB, POOL_CONTENT)).status).toBe(200)
    await publish(request, clubB.adminToken, slugB, ['contact'], { shortName: 'Klub B' })

    // Club page of A: the public sections only, the club contact with the contact block.
    const clubPage = await publicGet(request, `/api/club_core/public/${slugA}`)
    expect(clubPage.status).toBe(200)
    expect(clubPage.headers['cache-control']).toBe('public, s-maxage=60')
    const pageA = clubPage.body as unknown as PublicClubPage
    expect(pageA.club).toMatchObject({ name: 'Klub A', slug: slugA, description: 'Klub wielosekcyjny.' })
    expect(pageA.club.contact).toEqual({ phone: '+48 22 100 00 00' })
    expect(pageA.sections.map((item) => item.slug)).toEqual(['basen', 'zumba'])

    // Section page of A: the four club_core blocks with their content; only the public material.
    const sectionA = await publicGet(request, `/api/club_core/public/${slugA}/sections/basen`)
    expect(sectionA.status).toBe(200)
    const blocksA = (sectionA.body as unknown as PublicSectionPage).blocks
    expect(Object.keys(blocksA).sort()).toEqual(['conditions', 'contact', 'description', 'materials'])
    expect(blocksA.description).toEqual({ text: POOL_CONTENT.publicDescription })
    expect(blocksA.conditions).toEqual({ text: POOL_CONTENT.publicConditions })
    expect(blocksA.contact).toEqual({
      name: 'Koordynator sekcji',
      email: 'basen@example.org',
      phone: '+48 600 100 200',
    })
    expect(blocksA.materials?.items.map((item) => item.title)).toEqual(['Regulamin sekcji'])
    const download = await publicGet(request, blocksA.materials?.items[0]?.url ?? '')
    expect(download.status).toBe(200)
    expect(download.headers['content-type']).toContain('application/pdf')
    expect(download.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')

    // Section page of B: the same content, but only the contact block is in the response — the others are absent.
    const sectionB = await publicGet(request, `/api/club_core/public/${slugB}/sections/basen`)
    expect(sectionB.status).toBe(200)
    const blocksB = (sectionB.body as unknown as PublicSectionPage).blocks
    expect(Object.keys(blocksB)).toEqual(['contact'])
    expect(JSON.stringify(sectionB.body)).not.toContain(POOL_CONTENT.publicDescription)
    expect(JSON.stringify(sectionB.body)).not.toContain(POOL_CONTENT.publicConditions)
    expect((await publicGet(request, `/api/club_core/public/${slugB}`)).body).toMatchObject({ club: { contact: null } })

    // The same 404 for an unknown club, a non-public section, an unknown section and a section of another club.
    const unknown = await publicGet(request, `/api/club_core/public/no-such-club-${uniqueSuffix()}`)
    expect(unknown.status).toBe(404)
    expect(unknown.body).toMatchObject({ code: 'public_page_not_found' })
    for (const path of [
      `/api/club_core/public/${slugA}/sections/szachy`,
      `/api/club_core/public/${slugA}/sections/no-such-section`,
      `/api/club_core/public/${slugB}/sections/zumba`,
      `/api/club_core/public/${slugA}/sections/BAD_SLUG`,
      `/api/club_core/public/${slugA}/logo`,
    ]) {
      const result = await publicGet(request, path)
      expect(result.status, path).toBe(404)
      expect(result.body, path).toEqual(unknown.body)
    }
    // An internal material, and a public one requested through another club, are not reachable.
    const internalId = String(internal.body?.id)
    for (const path of [
      `/api/club_core/public/${slugA}/sections/basen/materials/${internalId}`,
      `/api/club_core/public/${slugB}/sections/basen/materials/${String(regulations.body?.id)}`,
      `/api/club_core/public/${slugA}/sections/zumba/materials/${String(regulations.body?.id)}`,
    ]) {
      const result = await publicGet(request, path)
      expect(result.status, path).toBe(404)
      expect(result.body, path).toEqual(unknown.body)
    }

    // No personal data: no name of a person record appears (the club administrator is "Ada Admin").
    for (const body of [clubPage.body, sectionA.body, sectionB.body]) {
      expect(JSON.stringify(body)).not.toMatch(/Ada|Admin/)
    }

    // A block switched off disappears from the response, and its files with it.
    expect(
      (await putSettings(request, clubA.adminToken, { publication: { blocks: { materials: false } } })).status,
    ).toBe(200)
    const withoutMaterials = await publicGet(request, `/api/club_core/public/${slugA}/sections/basen`)
    expect(Object.keys((withoutMaterials.body as unknown as PublicSectionPage).blocks).sort()).toEqual([
      'conditions',
      'contact',
      'description',
    ])
    expect((await publicGet(request, blocksA.materials?.items[0]?.url ?? '')).status).toBe(404)

    // A club whose page is off: its own 404 on every public route, and nothing about the club.
    expect((await putSettings(request, clubB.adminToken, { publication: { enabled: false } })).status).toBe(200)
    for (const path of [`/api/club_core/public/${slugB}`, `/api/club_core/public/${slugB}/sections/basen`]) {
      const disabled = await publicGet(request, path)
      expect(disabled.status, path).toBe(404)
      expect(disabled.body, path).toMatchObject({ code: 'public_page_disabled' })
      expect(Object.keys(disabled.body ?? {}).sort(), path).toEqual(['code', 'error'])
      expect(JSON.stringify(disabled.body)).not.toContain('Klub B')
    }

    // Slug rules: globally unique for clubs (409), unique per club for sections (409), well-formed (400), required
    // by a published page (422) and by a public section (422).
    const taken = await putSettings(request, clubB.adminToken, { publicSlug: slugA })
    expect(taken.status, JSON.stringify(taken.body)).toBe(409)
    expect(taken.body?.code).toBe('public_slug_taken')
    expect((await putSettings(request, clubB.adminToken, { publicSlug: 'Zły adres!' })).status).toBe(400)
    const noSlug = await putSettings(request, clubB.adminToken, { publicSlug: null, publication: { enabled: true } })
    expect(noSlug.status, JSON.stringify(noSlug.body)).toBe(422)
    expect(noSlug.body?.code).toBe('publication_slug_required')
    expect((await getSettings(request, clubB.adminToken)).publicSlug).toBe(slugB)
    const duplicate = await putSectionPublic(request, clubA.adminToken, chessA, { publicSlug: 'basen' })
    expect(duplicate.status, JSON.stringify(duplicate.body)).toBe(409)
    expect(duplicate.body?.code).toBe('public_slug_taken')
    const missing = await putSectionPublic(request, clubA.adminToken, chessA, { isPublic: true, publicSlug: null })
    expect(missing.status, JSON.stringify(missing.body)).toBe(422)
    expect(missing.body?.code).toBe('section_public_slug_required')
    // Another club may use the same section slug (B's pool is "basen" too), and a stale lock token answers 409.
    const stale = await putSectionPublic(
      request,
      clubA.adminToken,
      chessA,
      { publicDescription: 'x' },
      '2020-01-01T00:00:00.000Z',
    )
    expect(stale.status).toBe(409)

    // The coordinator of the pool edits its public content, but not another section's (403); the publication
    // settings are not theirs (no club_core.manage).
    const marek = await createStaff(request, clubA, {
      firstName: 'Marek',
      lastName: 'Nowakowski',
      birthDate: birthDateTurning(40),
    })
    await assignRole(request, clubA.adminToken, {
      personId: marek.personId,
      role: 'coordinator',
      sectionId: poolA,
      validFrom: '2020-01-01',
    })
    await expectRoles(request, clubA, marek.userId, ['vereino_coordinator', 'vereino_member'])
    const marekToken = await signInAs(request, clubA, marek.userId, marek.email)
    const own = await putSectionPublic(request, marekToken, poolA, { publicConditions: 'Czepek obowiązkowy.' })
    expect(own.status, JSON.stringify(own.body)).toBe(200)
    // The chess section's current lock token (read as the administrator: the coordinator cannot list it).
    const chessLock = (await getSection(request, clubA.adminToken, chessA)).updatedAt
    const foreign = await putSectionPublic(
      request,
      marekToken,
      chessA,
      { publicDescription: 'Nie moja sekcja.' },
      chessLock,
    )
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(403)
    expect(foreign.body?.code).toBe('scope_denied')
    expect((await putSettings(request, marekToken, { publication: { enabled: false } })).status).toBe(403)
    // The coordinator's name is not on the public page (its contact is the one written for publication).
    expect(
      JSON.stringify((await publicGet(request, `/api/club_core/public/${slugA}/sections/basen`)).body),
    ).not.toMatch(/Marek|Nowakowski/)

    // `publication` needs club_core.publication.manage on top of club_core.manage.
    const editor = await createStaff(request, clubA, {
      firstName: 'Ewa',
      lastName: 'Redaktor',
      birthDate: birthDateTurning(35),
    })
    await setUserFeatures(request, clubA, editor.userId, ['club_core.view', 'club_core.manage'])
    const editorToken = await signInAs(request, clubA, editor.userId, editor.email)
    const forbidden = await putSettings(request, editorToken, { publication: { enabled: false } })
    expect(forbidden.status, JSON.stringify(forbidden.body)).toBe(403)
    expect(forbidden.body?.code).toBe('publication_forbidden')
    expect((await getSettings(request, clubA.adminToken)).publication.enabled).toBe(true)

    // The section list carries the public fields for the edit page.
    const listed = await call<{ items?: { id: string; publicConditions: string | null }[] }>(
      request,
      'GET',
      `/api/club_core/sections?ids=${poolA}`,
      clubA.adminToken,
    )
    expect(listed.body?.items?.[0]?.publicConditions).toBe('Czepek obowiązkowy.')
  } finally {
    await clubB.cleanup()
    await clubA.cleanup()
  }
})
