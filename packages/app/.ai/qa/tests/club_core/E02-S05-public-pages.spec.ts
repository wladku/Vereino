import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { assignRole, birthDateTurning, createClub, createStaff, expectRoles, uniqueSuffix } from '../_fixtures/club'
import { create, signInBrowser } from '../_fixtures/club-structure'
import { getSettings, pdf, png, publish, putSectionPublic, putSettings, upload } from '../_fixtures/publication'

// E02-S05 (issue #29; club spec UI rows `/p/[clubSlug]`, `/p/[clubSlug]/sections/[sectionSlug]`,
// `/backend/club/publication` and the "Public page" group; S7.4): the public pages without a session — the club page
// with its section tiles, the section page with the published blocks, the 404 and "does not publish a page" states,
// both locales, 375 px, reflow at 320 px, light and dark mode with no critical or serious axe violation; the
// administrator's publication page; a coordinator's section edit page with the public content panels only.
test.describe.configure({ timeout: 300_000 })

async function scanInSchemes(
  page: Page,
  testInfo: TestInfo,
  label: string,
  ready: () => Promise<void>,
  baseline = false,
) {
  const found: Record<string, unknown> = {}
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.reload()
    await ready()
    const violations = await scanBlockingViolations(page, testInfo, { platformBaseline: baseline })
    if (violations.length > 0) found[`${label} (${colorScheme})`] = violations
  }
  return found
}

async function setGuestLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

test('E02-S05 public club and section pages: blocks, states, en and pl, 375 px, light and dark, axe', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e02-s05-pages')
  try {
    page.setDefaultTimeout(30_000)
    const token = club.adminToken
    const slug = `pages-${uniqueSuffix()}`
    const pool = await create(request, token, 'sections', { name: 'Basen' })
    const chess = await create(request, token, 'sections', { name: 'Szachy' })
    expect(
      (
        await putSectionPublic(request, token, pool, {
          isPublic: true,
          publicSlug: 'basen',
          publicDescription: 'Nauka pływania dla dzieci od 6 lat, w grupach według umiejętności.',
          publicConditions: 'Strój kąpielowy, czepek, podpisana deklaracja.',
          publicContactName: 'Koordynator sekcji',
          publicContactEmail: 'basen@example.org',
          publicContactPhone: '+48 600 100 200',
        })
      ).status,
    ).toBe(200)
    expect((await putSectionPublic(request, token, chess, { isPublic: true, publicSlug: 'szachy' })).status).toBe(200)
    expect(
      (
        await upload(request, token, `/api/club_core/sections/${pool}/materials`, pdf('regulamin.pdf'), {
          title: 'Regulamin sekcji',
          isPublic: 'true',
        })
      ).status,
    ).toBe(201)
    const settings = await getSettings(request, token)
    expect(
      (await upload(request, token, '/api/club_core/logo', png([20, 90, 160], 64), {}, settings.updatedAt)).status,
    ).toBe(200)
    await publish(request, token, slug, ['description_schedule', 'conditions', 'materials', 'contact'], {
      shortName: 'Klub Sportowy Delfin',
      publicDescription: 'Klub wielosekcyjny dla dzieci i dorosłych.',
      contactPhone: '+48 22 100 00 00',
    })

    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}

    // The club page, in English: name, description, tiles of the public sections, the club phone.
    await setGuestLocale(page, 'en')
    await page.goto(`/p/${slug}`)
    await expect(page.getByTestId('public-club-name')).toHaveText('Klub Sportowy Delfin')
    await expect(page.getByRole('heading', { level: 2, name: 'Sections' })).toBeVisible()
    await expect(page.getByTestId('public-section-basen')).toBeVisible()
    await expect(page.getByTestId('public-section-szachy')).toBeVisible()
    await expect(page.getByTestId('public-club-contact')).toContainText('+48 22 100 00 00')
    Object.assign(
      violations,
      await scanInSchemes(page, testInfo, 'club page', async () => {
        await expect(page.getByTestId('public-club-name')).toBeVisible()
      }),
    )

    // The section page in Polish: h1 section, h2 blocks, the material link with name and format.
    await setGuestLocale(page, 'pl')
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.reload()
    await expect(page.getByRole('heading', { level: 2, name: 'Sekcje' })).toBeVisible()
    await page.getByTestId('public-section-basen').click()
    await expect(page).toHaveURL(new RegExp(`/p/${slug}/sections/basen$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Basen' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Warunki' })).toBeVisible()
    await expect(page.getByTestId('public-block-description')).toContainText('Nauka pływania')
    await expect(page.getByTestId('public-block-materials').getByRole('link')).toContainText('Regulamin sekcji (PDF')
    await expect(page.getByTestId('public-block-contact')).toContainText('basen@example.org')
    // Keyboard: the club link in the header is reachable and goes back to the club page.
    await page.getByTestId('public-club-link').focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/p/${slug}$`))
    await page.goto(`/p/${slug}/sections/basen`)
    Object.assign(
      violations,
      await scanInSchemes(page, testInfo, 'section page', async () => {
        await expect(page.getByTestId('public-section-name')).toBeVisible()
      }),
    )
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // A disabled block disappears from the page.
    expect((await putSettings(request, token, { publication: { blocks: { conditions: false } } })).status).toBe(200)
    await page.reload()
    await expect(page.getByTestId('public-section-name')).toBeVisible()
    await expect(page.getByTestId('public-block-conditions')).toHaveCount(0)

    // Not found: an unknown club and a section that is not public — nothing about the club.
    await page.goto(`/p/no-such-club-${uniqueSuffix()}`)
    await expect(page.getByTestId('public-not-found')).toBeVisible()
    expect((await putSectionPublic(request, token, chess, { isPublic: false })).status).toBe(200)
    await page.goto(`/p/${slug}/sections/szachy`)
    await expect(page.getByTestId('public-not-found')).toBeVisible()
    await expect(page.getByText('Klub Sportowy Delfin')).toHaveCount(0)
    Object.assign(
      violations,
      await scanInSchemes(page, testInfo, 'not found', async () => {
        await expect(page.getByTestId('public-not-found')).toBeVisible()
      }),
    )

    // The page switched off: the club does not publish a page.
    expect((await putSettings(request, token, { publication: { enabled: false } })).status).toBe(200)
    await page.goto(`/p/${slug}`)
    await expect(page.getByTestId('public-disabled')).toContainText('nie publikuje strony')
    await expect(page.getByText('Klub Sportowy Delfin')).toHaveCount(0)
    await setGuestLocale(page, 'en')
    await page.reload()
    await expect(page.getByTestId('public-disabled')).toContainText('does not publish a page')
    Object.assign(
      violations,
      await scanInSchemes(page, testInfo, 'disabled', async () => {
        await expect(page.getByTestId('public-disabled')).toBeVisible()
      }),
    )
    await expectNoPageOverflow(page)

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})

test('E02-S05 the publication page and the coordinator’s section page: save, reload, axe', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e02-s05-admin')
  try {
    page.setDefaultTimeout(30_000)
    const slug = `admin-${uniqueSuffix()}`
    const pool = await create(request, club.adminToken, 'sections', { name: 'Basen' })
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, password)
    await prepareForAccessibilityScan(page)
    const violations: Record<string, unknown> = {}

    // The administrator publishes the page with two blocks through the form.
    await page.goto('/backend/club/publication')
    const form = page.locator('form')
    await form.locator('[data-crud-field-id="publicSlug"] input').fill(slug)
    await form
      .locator(
        '[data-crud-field-id="enabled"] button[role="checkbox"], [data-crud-field-id="enabled"] input[type="checkbox"]',
      )
      .first()
      .click()
    await form
      .locator(
        '[data-crud-field-id="block_contact"] button[role="checkbox"], [data-crud-field-id="block_contact"] input[type="checkbox"]',
      )
      .first()
      .click()
    await form
      .locator(
        '[data-crud-field-id="block_materials"] button[role="checkbox"], [data-crud-field-id="block_materials"] input[type="checkbox"]',
      )
      .first()
      .click()
    await page
      .getByRole('button', { name: /Save publication|Zapisz publikację/ })
      .first()
      .click()
    await expect
      .poll(async () => (await getSettings(request, club.adminToken)).publication)
      .toEqual({
        enabled: true,
        blocks: {
          description_schedule: false,
          conditions: false,
          prices: false,
          coaches: false,
          materials: true,
          contact: true,
          places_calendar: false,
          online_requests: false,
        },
      })
    expect((await getSettings(request, club.adminToken)).publicSlug).toBe(slug)
    await expect(page.getByTestId('publication-public-link')).toHaveAttribute('href', `/p/${slug}`)
    Object.assign(
      violations,
      await scanInSchemes(
        page,
        testInfo,
        'publication page',
        async () => {
          await expect(page.locator('[data-crud-field-id="publicSlug"] input')).toHaveValue(slug)
        },
        true,
      ),
    )

    // A coordinator of the pool opens its edit page: the public page, logo and materials, not the core form.
    const marek = await createStaff(request, club, {
      firstName: 'Marek',
      lastName: 'Basenowy',
      birthDate: birthDateTurning(40),
    })
    await assignRole(request, club.adminToken, {
      personId: marek.personId,
      role: 'coordinator',
      sectionId: pool,
      validFrom: '2020-01-01',
    })
    await expectRoles(request, club, marek.userId, ['vereino_coordinator', 'vereino_member'])
    await page.context().clearCookies()
    await signInBrowser(page, request, club, marek.userId, marek.email)
    await page.goto(`/backend/club/sections/${pool}/edit`)
    await expect(page.getByTestId('section-edit-name')).toHaveText('Basen')
    await expect(page.getByTestId('section-public-panel')).toBeVisible()
    await expect(page.getByTestId('section-materials-panel')).toBeVisible()
    const panel = page.getByTestId('section-public-panel')
    await panel.locator('[data-crud-field-id="publicSlug"] input').fill('basen')
    await panel.locator('[data-crud-field-id="publicConditions"] textarea').fill('Czepek obowiązkowy.')
    await panel
      .locator(
        '[data-crud-field-id="isPublic"] button[role="checkbox"], [data-crud-field-id="isPublic"] input[type="checkbox"]',
      )
      .first()
      .click()
    await panel
      .getByRole('button', { name: /Save public page|Zapisz stronę publiczną/ })
      .first()
      .click()
    await expect(page.getByTestId('section-public-link')).toBeVisible()
    await page
      .getByTestId('section-materials-panel')
      .locator('input[type="file"]')
      .setInputFiles({
        name: 'regulamin.pdf',
        mimeType: 'application/pdf',
        buffer: pdf('regulamin.pdf').buffer,
      })
    await expect(page.getByTestId('section-materials-list')).toContainText('regulamin.pdf')
    Object.assign(
      violations,
      await scanInSchemes(
        page,
        testInfo,
        'section edit (coordinator)',
        async () => {
          await expect(page.getByTestId('section-public-panel')).toBeVisible()
        },
        true,
      ),
    )
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
