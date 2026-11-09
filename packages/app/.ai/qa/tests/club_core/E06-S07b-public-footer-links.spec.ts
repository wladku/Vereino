import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { addDays, createActivity, juneThirtiethNextYear, listOccurrences, nextWeekday } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { calendarDate, createClub, uniqueSuffix } from '../_fixtures/club'
import { create, signInBrowser } from '../_fixtures/club-structure'
import { createGroup, getGroup, updateGroup } from '../_fixtures/groups'
import { getSettings, publicGet, publish, putSectionPublic, putSettings } from '../_fixtures/publication'

// E06-S07b (issue #195; README 3.1, B-03): the club administrator enters the URLs of the club's rules and privacy
// policy on the publication page, and the footer of every public page — club, section, session and facilities — links
// to each one only while it is set (owner decision on #195, option 2). The API refuses an address that is not an
// absolute http(s) URL, so the page never puts `javascript:` or a relative path in an `href`.
test.describe.configure({ timeout: 300_000 })

const RULES = 'https://klub-delfin.example/regulamin.pdf'
const PRIVACY = 'https://klub-delfin.example/polityka-prywatnosci'
type Links = { rules: string | null; privacyPolicy: string | null }
type FramePage = { club: { name: string; links: Links } }

async function linksOf(request: APIRequestContext, path: string): Promise<Links> {
  const result = await publicGet(request, path)
  expect(result.status, `${path} ${JSON.stringify(result.body)}`).toBe(200)
  return (result.body as FramePage).club.links
}

async function setGuestLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

test('E06-S07b footer links to the club rules and privacy policy, only when set', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e06-s07b-links')
  try {
    const slug = `e0607b-${uniqueSuffix()}`
    let admin = club.adminToken
    const pool = await create(request, admin, 'sections', { name: 'Basen' })
    expect((await putSectionPublic(request, admin, pool, { isPublic: true, publicSlug: 'basen' })).status).toBe(200)
    const groupId = await createGroup(request, admin, { sectionId: pool, name: 'Orliki', kind: 'team' })
    const group = await getGroup(request, admin, groupId)
    expect(
      (await updateGroup(request, admin, { id: groupId, isPublic: true }, String(group.body?.updatedAt))).status,
    ).toBe(200)
    const today = calendarDate()
    const tuesday = nextWeekday(addDays(today, 1), 'TU')
    const hall = await create(request, admin, 'places', { name: 'Pływalnia miejska', kind: 'hall' })
    const activity = await createActivity(request, admin, {
      type: 'training',
      placeId: hall,
      groupId,
      name: 'Trening Orlików',
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${juneThirtiethNextYear(today).until}`,
      startsOn: tuesday,
      startTime: '17:00',
      endTime: '18:00',
    })
    const occurrenceId = (await listOccurrences(request, admin, `&activityId=${activity.id}`)).items[0].id
    await publish(request, admin, slug, ['description_schedule', 'places_calendar'], { shortName: 'Klub Delfin' })
    const paths = [
      `/api/club_core/public/${slug}`,
      `/api/club_core/public/${slug}/sections/basen`,
      `/api/activities/public/${slug}/sessions/${occurrenceId}`,
      `/api/facilities/public/${slug}/places`,
    ]

    // Nothing set: both links are null in every response.
    for (const path of paths) expect(await linksOf(request, path), path).toEqual({ rules: null, privacyPolicy: null })

    // Only absolute http(s) URLs are stored.
    for (const bad of ['javascript:alert(1)', '/regulamin', 'klub-delfin.example/regulamin', 'mailto:a@b.example']) {
      const refused = await putSettings(request, admin, { rulesUrl: bad })
      expect(refused.status, `${bad} ${JSON.stringify(refused.body)}`).toBe(400)
    }
    expect((await getSettings(request, admin)) as unknown).toMatchObject({ rulesUrl: null, privacyPolicyUrl: null })

    // B-03 at 375 px: the administrator enters both links; an invalid one is marked on its field first.
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    admin = await getAuthToken(request, club.tenant.email, password)
    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 375, height: 812 })
    await setGuestLocale(page, 'en')
    await page.goto('/backend/club/publication')
    const rulesInput = page.locator('[data-crud-field-id="rulesUrl"] input')
    const privacyInput = page.locator('[data-crud-field-id="privacyPolicyUrl"] input')
    await rulesInput.fill('klub-delfin.example/regulamin')
    await privacyInput.fill(PRIVACY)
    const save = page.getByRole('button', { name: 'Save publication' }).first()
    await save.click()
    await expect(page.getByText('Enter a full address starting with https:// or http://.').first()).toBeVisible()
    expect(await getSettings(request, admin)).toMatchObject({ rulesUrl: null, privacyPolicyUrl: null })
    await rulesInput.fill(RULES)
    await save.click()
    await expect
      .poll(async () => (await getSettings(request, admin)) as unknown)
      .toMatchObject({
        rulesUrl: RULES,
        privacyPolicyUrl: PRIVACY,
      })
    await page.reload()
    await expect(rulesInput).toHaveValue(RULES)
    await expect(privacyInput).toHaveValue(PRIVACY)

    // Both set: every response carries them and every public page links to them.
    for (const path of paths)
      expect(await linksOf(request, path), path).toEqual({ rules: RULES, privacyPolicy: PRIVACY })
    await prepareForAccessibilityScan(page)
    const violations: Record<string, unknown[]> = {}
    for (const pagePath of [
      `/p/${slug}`,
      `/p/${slug}/sections/basen`,
      `/p/${slug}/s/${occurrenceId}`,
      `/p/${slug}/places`,
    ]) {
      await page.goto(pagePath)
      const footer = page.getByTestId('public-footer')
      const nav = footer.getByRole('navigation', { name: 'Club documents' })
      await expect(nav.getByRole('link', { name: 'Rules' }), pagePath).toHaveAttribute('href', RULES)
      await expect(nav.getByRole('link', { name: 'Privacy policy' }), pagePath).toHaveAttribute('href', PRIVACY)
      await expectNoPageOverflow(page)
      violations[pagePath] = await scanBlockingViolations(page, testInfo, {})
    }
    expect(violations).toEqual(Object.fromEntries(Object.keys(violations).map((key) => [key, []])))

    // Polish labels.
    await setGuestLocale(page, 'pl')
    await page.goto(`/p/${slug}`)
    const polish = page.getByTestId('public-footer').getByRole('navigation', { name: 'Dokumenty klubu' })
    await expect(polish.getByRole('link', { name: 'Regulamin' })).toHaveAttribute('href', RULES)
    await expect(polish.getByRole('link', { name: 'Polityka prywatności' })).toHaveAttribute('href', PRIVACY)

    // Only the rules: the privacy link disappears; then neither: no link list at all.
    expect((await putSettings(request, admin, { privacyPolicyUrl: null })).status).toBe(200)
    for (const path of paths) expect(await linksOf(request, path), path).toEqual({ rules: RULES, privacyPolicy: null })
    await page.goto(`/p/${slug}/sections/basen`)
    await expect(page.getByTestId('public-footer-rules')).toHaveAttribute('href', RULES)
    await expect(page.getByTestId('public-footer-privacy')).toHaveCount(0)
    expect((await putSettings(request, admin, { rulesUrl: '' })).status).toBe(200)
    for (const path of paths) expect(await linksOf(request, path), path).toEqual({ rules: null, privacyPolicy: null })
    for (const pagePath of [`/p/${slug}`, `/p/${slug}/s/${occurrenceId}`, `/p/${slug}/places`]) {
      await page.goto(pagePath)
      await expect(page.getByTestId('public-footer-club'), pagePath).toHaveText('Klub Delfin')
      await expect(page.getByTestId('public-footer-links'), pagePath).toHaveCount(0)
    }
  } finally {
    await club.cleanup()
  }
})
