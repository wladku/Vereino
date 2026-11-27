import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { calendarDate, createClub, uniqueSuffix } from '../_fixtures/club'
import { create, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup, getGroup, signedInStaff, updateGroup } from '../_fixtures/groups'
import { getMe, putMe } from '../_fixtures/members'
import { getSettings, publicGet, publish, putSectionPublic, type PublicationBlock } from '../_fixtures/publication'
import { uiText } from '../_fixtures/ui-text'

// TEST-077 (club spec Amendment B, research TEST-C02; REQ-025): an instructor who gave the publish-name consent is
// shown as "First L." on the public section page. The instructor withdraws the consent in their own profile (the
// member page `/club/profile`, section "Public name") and the club does NOT publish the section again: the next read
// of the public API and of the server-rendered page carries no name. The public read has no cache of its own (the
// handler answers from the database on every request) and tells shared caches to keep it for at most
// `s-maxage=60` without `stale-while-revalidate` or `stale-if-error`; so the read straight after the withdrawal —
// the origin read every shared cache falls back to once those 60 seconds pass — is the "first read after the cache
// lifetime", and it must already be anonymous.
test.describe.configure({ timeout: 300_000 })

type GroupCard = { id: string; instructors?: { name: string | null }[] }
type SectionBlocks = { groups?: { items: GroupCard[] } }

const ALL_BLOCKS: PublicationBlock[] = ['description_schedule', 'conditions', 'coaches', 'contact']

async function readSection(request: APIRequestContext, slug: string) {
  const result = await publicGet(request, `/api/club_core/public/${slug}/sections/basen`)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return {
    blocks: (result.body as { blocks: SectionBlocks }).blocks,
    json: JSON.stringify(result.body),
    cacheControl: result.headers['cache-control'] ?? '',
  }
}

/** The shared-cache lifetime the public read declares, in seconds; the read must not allow serving it stale. */
function sharedCacheLifetime(cacheControl: string): number {
  const directives = cacheControl.split(',').map((item) => item.trim().toLowerCase())
  expect(directives).toContain('public')
  expect(directives.some((item) => item.startsWith('stale-while-revalidate'))).toBe(false)
  expect(directives.some((item) => item.startsWith('stale-if-error'))).toBe(false)
  const maxAge = directives.find((item) => item.startsWith('s-maxage='))
  expect(maxAge, cacheControl).toBeTruthy()
  return Number(String(maxAge).split('=')[1])
}

test('TEST-077 an instructor who withdraws the name consent in the profile shows no name on the next public read, without re-publishing', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-077')
  try {
    const admin = club.adminToken
    const slug = `t077-${uniqueSuffix()}`
    const pool = await create(request, admin, 'sections', { name: 'Basen' })
    expect((await putSectionPublic(request, admin, pool, { isPublic: true, publicSlug: 'basen' })).status).toBe(200)
    const orliki = await createGroup(request, admin, { sectionId: pool, name: 'Orliki', kind: 'team' })
    const before = await getGroup(request, admin, orliki)
    const opened = await updateGroup(request, admin, { id: orliki, isPublic: true }, String(before.body?.updatedAt))
    expect(opened.status, JSON.stringify(opened.body)).toBe(200)

    // The instructor of Orliki gives the publish-name consent.
    const coach = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Wycofany', role: 'coach' })
    await addMembership(request, admin, {
      groupId: orliki,
      personId: coach.personId,
      role: 'coach',
      validFrom: calendarDate(),
    })
    const me = await getMe(request, coach.token)
    expect(me.status, JSON.stringify(me.body)).toBe(200)
    const given = await putMe(request, coach.token, { publishNameConsent: true }, me.body?.person.updatedAt)
    expect(given.status, JSON.stringify(given.body)).toBe(200)
    expect(given.body?.person?.consents.publishNameConsent.granted).toBe(true)

    // The section is published once; the public read names the instructor.
    await publish(request, admin, slug, ALL_BLOCKS, { shortName: 'Klub Delfin' })
    const published = await getSettings(request, admin)
    const named = await readSection(request, slug)
    expect(named.blocks.groups?.items.find((card) => card.id === orliki)?.instructors).toEqual([{ name: 'Marek W.' }])
    const lifetime = sharedCacheLifetime(named.cacheControl)
    expect(lifetime).toBeGreaterThan(0)
    expect(lifetime).toBeLessThanOrEqual(60)
    const namedHtml = await publicGet(request, `/p/${slug}/sections/basen`)
    expect(namedHtml.status).toBe(200)
    expect(namedHtml.bytes.toString('utf8')).toContain('Marek W.')

    // The instructor withdraws the consent in their own profile on the phone.
    const password = await signInBrowser(page, request, club, coach.userId, coach.email)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/club/profile')
    const publicName = page.getByTestId('club-profile-public-name')
    await expect(publicName).toBeVisible()
    const consentSwitch = publicName.getByRole('switch')
    await expect(consentSwitch).toBeChecked()
    await consentSwitch.click()
    await expect(consentSwitch).not.toBeChecked()
    await page.getByRole('button', { name: uiText('people.club.profile.actions.save', { exact: true }) }).click()
    // Signing in through the browser ended the coach's API token: a fresh one reads the stored withdrawal.
    const coachToken = await getAuthToken(request, coach.email, password)
    await expect
      .poll(async () => (await getMe(request, coachToken)).body?.person.consents.publishNameConsent.granted)
      .toBe(false)

    // Nothing was published again: the club settings are the ones of the single publication above.
    expect((await getSettings(request, admin)).updatedAt).toBe(published.updatedAt)

    // The first public read after the withdrawal (the read any shared cache falls back to after `lifetime` seconds)
    // and the server-rendered page carry no name; the anonymous instructor stays on the card.
    await expect
      .poll(async () => (await readSection(request, slug)).blocks.groups?.items.find((card) => card.id === orliki), {
        timeout: 5_000,
      })
      .toMatchObject({ instructors: [{ name: null }] })
    const anonymous = await readSection(request, slug)
    expect(anonymous.json).not.toContain('Marek')
    expect(anonymous.json).not.toContain('Wycofany')
    expect(anonymous.json).not.toContain(coach.personId)
    expect(sharedCacheLifetime(anonymous.cacheControl)).toBe(lifetime)
    const anonymousHtml = await publicGet(request, `/p/${slug}/sections/basen`)
    expect(anonymousHtml.status).toBe(200)
    const html = anonymousHtml.bytes.toString('utf8')
    expect(html).not.toContain('Marek W.')
    expect(html).not.toContain('Wycofany')
  } finally {
    await club.cleanup()
  }
})
