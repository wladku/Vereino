import { expect, test } from '@playwright/test'
import { createClub, createSecondOrganization, uniqueSuffix } from '../_fixtures/club'
import { create } from '../_fixtures/club-structure'
import {
  getSection,
  pdf,
  png,
  publicGet,
  publish,
  putSectionPublic,
  upload,
  type PublicSectionPage,
} from '../_fixtures/publication'

// E02-S05 (issue #29, AC "sessionless request"; club spec DD-35, V-12; AGENTS.md exception D-024/D-026): the public
// pages resolve the club from its slug through the one system-scope lookup and read everything else in the club it
// found. Two tenants, and a second organization in one of them, publish sections under the same section slug with
// different content, logos and materials: each slug shows only its own club, and no file of one club is reachable
// through another club's slug.
test.describe.configure({ timeout: 300_000 })

test('E02-S05 public lookup isolation: two tenants and two organizations with the same section slug', async ({
  request,
}) => {
  const first = await createClub(request, 'e02-s05-iso-a')
  const second = await createClub(request, 'e02-s05-iso-b')
  try {
    const otherOrganization = await createSecondOrganization(request, first)
    const clubs = [
      { name: 'Tenant A', token: first.adminToken, slug: `iso-a-${uniqueSuffix()}`, color: [200, 0, 0] as const },
      { name: 'Tenant B', token: second.adminToken, slug: `iso-b-${uniqueSuffix()}`, color: [0, 200, 0] as const },
      {
        name: 'Tenant A, second organization',
        token: otherOrganization.adminToken,
        slug: `iso-c-${uniqueSuffix()}`,
        color: [0, 0, 200] as const,
      },
    ]
    const published: { slug: string; materialId: string; logo: Buffer; description: string }[] = []
    for (const club of clubs) {
      const pool = await create(request, club.token, 'sections', { name: `Basen ${club.name}` })
      const description = `Opis sekcji [${club.slug}]`
      expect(
        (
          await putSectionPublic(request, club.token, pool, {
            isPublic: true,
            publicSlug: 'basen',
            publicDescription: description,
          })
        ).status,
      ).toBe(200)
      const logo = png([club.color[0], club.color[1], club.color[2]])
      const uploaded = await upload(
        request,
        club.token,
        `/api/club_core/sections/${pool}/logo`,
        logo,
        {},
        (await getSection(request, club.token, pool)).updatedAt,
      )
      expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(200)
      const material = await upload(request, club.token, `/api/club_core/sections/${pool}/materials`, pdf('plan.pdf'), {
        title: `Plan ${club.name}`,
        isPublic: 'true',
      })
      expect(material.status, JSON.stringify(material.body)).toBe(201)
      await publish(request, club.token, club.slug, ['description_schedule', 'materials'], { shortName: club.name })
      published.push({ slug: club.slug, materialId: String(material.body?.id), logo: logo.buffer, description })
    }

    for (const [index, club] of published.entries()) {
      const page = await publicGet(request, `/api/club_core/public/${club.slug}/sections/basen`)
      expect(page.status).toBe(200)
      const body = page.body as unknown as PublicSectionPage
      expect(body.club.name).toBe(clubs[index].name)
      expect(body.blocks.description).toEqual({ text: club.description })
      expect(body.blocks.materials?.items.map((item) => item.id)).toEqual([club.materialId])
      for (const [otherIndex, other] of published.entries()) {
        if (otherIndex === index) continue
        expect(JSON.stringify(body)).not.toContain(other.description)
        // The other club's material through this club's slug: the public 404.
        const crossed = await publicGet(
          request,
          `/api/club_core/public/${club.slug}/sections/basen/materials/${other.materialId}`,
        )
        expect(crossed.status).toBe(404)
        expect(crossed.body).toMatchObject({ code: 'public_page_not_found' })
      }
      const logo = await publicGet(request, `/api/club_core/public/${club.slug}/sections/basen/logo`)
      expect(logo.status).toBe(200)
      expect(logo.bytes.equals(club.logo)).toBe(true)
      const material = await publicGet(
        request,
        `/api/club_core/public/${club.slug}/sections/basen/materials/${club.materialId}`,
      )
      expect(material.status).toBe(200)
    }

    // A tenant or organization id in the query changes nothing: the scope comes from the slug only.
    const withQuery = await publicGet(
      request,
      `/api/club_core/public/${published[0].slug}/sections/basen?tenantId=${second.tenant.tenantId}&organizationId=${second.tenant.organizationId}`,
    )
    expect((withQuery.body as unknown as PublicSectionPage).club.name).toBe('Tenant A')
  } finally {
    await second.cleanup()
    await first.cleanup()
  }
})
