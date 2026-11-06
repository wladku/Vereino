import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { addDays, createActivity, juneThirtiethNextYear, listOccurrences, nextWeekday } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { calendarDate, createClub, uniqueSuffix } from '../_fixtures/club'
import { create } from '../_fixtures/club-structure'
import { createGroup, getGroup, updateGroup } from '../_fixtures/groups'
import { publicGet, publish, putSectionPublic, type PublicationBlock } from '../_fixtures/publication'

// E06-S07 (issue #89; README P-01, P-02, 3.1): every public page ends with a footer holding the club name and its
// published phone, the section page has a breadcrumb "Club › Sections › {name}" back to the club page, and the club
// page's section tiles show the short description and "{n} groups — see classes". The phone is sent only with the
// `contact` block — with the block off it is absent from the footer and from every public response (club, section and
// session page) — and the group counts only with `description_schedule`, counting public, active groups only.
test.describe.configure({ timeout: 300_000 })

const PHONE = '+48 22 100 00 00'
type ClubPage = {
  club: { name: string; contact: { phone: string } | null }
  sections: { slug: string; shortDescription: string | null }[]
  blocks: { groups?: { counts: Record<string, number> } }
}
type FramePage = { club: { name: string; contact: { phone: string } | null } }

async function getPage(request: APIRequestContext, path: string): Promise<{ body: unknown; json: string }> {
  const result = await publicGet(request, path)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return { body: result.body, json: JSON.stringify(result.body) }
}

async function getClubPage(request: APIRequestContext, slug: string): Promise<ClubPage> {
  return (await getPage(request, `/api/club_core/public/${slug}`)).body as ClubPage
}

async function getFrame(request: APIRequestContext, path: string): Promise<{ page: FramePage; json: string }> {
  const result = await getPage(request, path)
  return { page: result.body as FramePage, json: result.json }
}

async function setGuestLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

test('E06-S07 public footer with the published phone, section breadcrumb and tile group counts', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e06-s07-footer')
  try {
    const admin = club.adminToken
    const slug = `e0607-${uniqueSuffix()}`
    const pool = await create(request, admin, 'sections', { name: 'Basen' })
    const poolPublic = await putSectionPublic(request, admin, pool, {
      isPublic: true,
      publicSlug: 'basen',
      shortDescription: 'Nauka pływania od 6 lat.',
    })
    expect(poolPublic.status, JSON.stringify(poolPublic.body)).toBe(200)
    const judo = await create(request, admin, 'sections', { name: 'Judo' })
    expect((await putSectionPublic(request, admin, judo, { isPublic: true, publicSlug: 'judo' })).status).toBe(200)

    // Two public groups and one internal group in Basen; Judo has only an internal group.
    const groups: string[] = []
    for (const [sectionId, name, isPublic] of [
      [pool, 'Orliki', true],
      [pool, 'Żaki', true],
      [pool, 'Kadra', false],
      [judo, 'Judo dorośli', false],
    ] as const) {
      const id = await createGroup(request, admin, { sectionId, name, kind: 'team' })
      groups.push(id)
      if (isPublic) {
        const current = await getGroup(request, admin, id)
        const saved = await updateGroup(request, admin, { id, isPublic: true }, String(current.body?.updatedAt))
        expect(saved.status, JSON.stringify(saved.body)).toBe(200)
      }
    }

    // A session of Orliki for the public session page.
    const today = calendarDate()
    const tuesday = nextWeekday(addDays(today, 1), 'TU')
    const hall = await create(request, admin, 'places', { name: 'Pływalnia miejska', kind: 'hall' })
    const activity = await createActivity(request, admin, {
      type: 'training',
      placeId: hall,
      groupId: groups[0],
      name: 'Trening Orlików',
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${juneThirtiethNextYear(today).until}`,
      startsOn: tuesday,
      startTime: '17:00',
      endTime: '18:00',
    })
    const occurrenceId = (await listOccurrences(request, admin, `&activityId=${activity.id}`)).items[0].id

    const withContact: PublicationBlock[] = ['description_schedule', 'contact']
    await publish(request, admin, slug, withContact, { shortName: 'Klub Delfin', contactPhone: PHONE })

    // The API: the phone on every page, the short description and the count of public groups per tile.
    const clubPage = { page: await getClubPage(request, slug) }
    expect(clubPage.page.club).toMatchObject({ name: 'Klub Delfin', contact: { phone: PHONE } })
    expect(clubPage.page.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: 'basen', shortDescription: 'Nauka pływania od 6 lat.' }),
        expect.objectContaining({ slug: 'judo', shortDescription: null }),
      ]),
    )
    expect(clubPage.page.blocks.groups).toEqual({ counts: { basen: 2 } })
    const sectionPage = await getFrame(request, `/api/club_core/public/${slug}/sections/basen`)
    expect(sectionPage.page.club.contact).toEqual({ phone: PHONE })
    const sessionPath = `/api/activities/public/${slug}/sessions/${occurrenceId}`
    expect((await getFrame(request, sessionPath)).page.club.contact).toEqual({ phone: PHONE })

    // The browser at 375 px: the tile, the footer, then the breadcrumb back from the section page.
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await setGuestLocale(page, 'en')
    await page.goto(`/p/${slug}`)
    await expect(page.getByTestId('public-section-basen-short')).toHaveText('Nauka pływania od 6 lat.')
    await expect(page.getByTestId('public-section-basen-groups')).toHaveText('2 groups — see classes')
    await expect(page.getByTestId('public-section-judo-groups')).toHaveCount(0)
    const footer = page.getByTestId('public-footer')
    await expect(footer.getByTestId('public-footer-club')).toHaveText('Klub Delfin')
    await expect(footer.getByTestId('public-footer-phone')).toContainText(PHONE)
    await expect(footer.getByRole('link', { name: PHONE })).toHaveAttribute('href', 'tel:+48221000000')
    await expectNoPageOverflow(page)
    const clubViolations = await scanBlockingViolations(page, testInfo, {})

    await page.getByTestId('public-section-basen').click()
    await expect(page).toHaveURL(new RegExp(`/p/${slug}/sections/basen$`))
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(breadcrumb).toContainText('Klub Delfin')
    await expect(breadcrumb).toContainText('Sections')
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Basen')
    await expect(page.getByTestId('public-footer-phone')).toContainText(PHONE)
    await expectNoPageOverflow(page)
    const sectionViolations = await scanBlockingViolations(page, testInfo, {})
    expect({ club: clubViolations, section: sectionViolations }).toEqual({ club: [], section: [] })
    await breadcrumb.getByTestId('public-breadcrumb-club').click()
    await expect(page).toHaveURL(new RegExp(`/p/${slug}$`))
    await expect(page.getByTestId('public-club-name')).toHaveText('Klub Delfin')
    await page.goto(`/p/${slug}/sections/basen`)
    await page.getByTestId('public-breadcrumb-sections').click()
    await expect(page).toHaveURL(new RegExp(`/p/${slug}#sections$`))
    await expect(page.getByTestId('public-sections')).toBeVisible()

    await page.goto(`/p/${slug}/s/${occurrenceId}`)
    await expect(page.getByTestId('public-session')).toBeVisible()
    await expect(page.getByTestId('public-footer-phone')).toContainText(PHONE)

    // Polish: the plural form of the tile and the footer label.
    await setGuestLocale(page, 'pl')
    await page.goto(`/p/${slug}`)
    await expect(page.getByTestId('public-section-basen-groups')).toHaveText('2 grupy — zobacz zajęcia')
    await expect(page.getByTestId('public-footer-phone')).toContainText('Telefon:')

    // The contact block off: no phone in any response, the footer keeps only the club name.
    await publish(request, admin, slug, ['description_schedule'])
    for (const path of [`/api/club_core/public/${slug}`, `/api/club_core/public/${slug}/sections/basen`, sessionPath]) {
      const off = await getFrame(request, path)
      expect(off.page.club.contact, path).toBeNull()
      expect(off.json, path).not.toContain('100 00 00')
    }
    await page.goto(`/p/${slug}`)
    await expect(page.getByTestId('public-footer-club')).toHaveText('Klub Delfin')
    await expect(page.getByTestId('public-footer-phone')).toHaveCount(0)
    await page.goto(`/p/${slug}/sections/basen`)
    await expect(page.getByTestId('public-footer-club')).toHaveText('Klub Delfin')
    await expect(page.getByTestId('public-footer-phone')).toHaveCount(0)

    // `description_schedule` off: no group counts on the club page.
    await publish(request, admin, slug, ['contact'])
    const noCounts = { page: await getClubPage(request, slug) }
    expect(noCounts.page.blocks).not.toHaveProperty('groups')
    await page.goto(`/p/${slug}`)
    await expect(page.getByTestId('public-section-basen')).toBeVisible()
    await expect(page.getByTestId('public-section-basen-groups')).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
