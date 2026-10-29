import { expect, test } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { createClub } from '../_fixtures/club'
import { create } from '../_fixtures/club-structure'

// ENG-TEST-25 (engineering standards S7.4): every club_core admin page, signed in as the club
// administrator with one record of each kind, has no critical or serious axe violation outside the
// recorded platform baseline (CrudForm labels, AppShell sidebar) and reflows at 320 px.
test.describe.configure({ timeout: 300_000 })

test('ENG-TEST-25 club_core admin pages have no new critical or serious accessibility violations and reflow at 320 px', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'eng-test-25')
  try {
    const token = club.adminToken
    const sectionName = 'Akademia piłkarska'
    const placeName = 'Orlik 2024'
    const institutionName = 'Gmina Testowo'
    const section = await create(request, token, 'sections', { name: sectionName })
    const institution = await create(request, token, 'institutions', { name: institutionName, type: 'municipality' })
    const place = await create(request, token, 'places', {
      name: placeName,
      kind: 'complex',
      ownerInstitutionId: institution,
    })

    const login = await page.request.post('/api/auth/login', {
      form: { email: club.tenant.email, password: club.tenant.password },
    })
    expect(login.ok(), `POST /api/auth/login ${String(login.status())}`).toBe(true)
    await prepareForAccessibilityScan(page)

    // Each list page is scanned with its record loaded, so the scan covers the table, not the skeleton.
    const pages: { path: string; shows?: string }[] = [
      { path: '/backend/club/settings' },
      { path: '/backend/club/sections', shows: sectionName },
      { path: '/backend/club/sections/create' },
      { path: `/backend/club/sections/${section}/edit` },
      { path: '/backend/club/places', shows: placeName },
      { path: '/backend/club/places/create' },
      { path: `/backend/club/places/${place}/edit` },
      { path: '/backend/club/institutions', shows: institutionName },
      { path: '/backend/club/institutions/create' },
      { path: `/backend/club/institutions/${institution}/edit` },
    ]
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 }
    const violationsByPage: Record<string, unknown> = {}
    for (const { path, shows } of pages) {
      await page.setViewportSize(viewport)
      await page.goto(path)
      if (shows) await expect(page.getByText(shows).first()).toBeVisible()
      await expect(page.getByText(/Access Denied|Brak dostępu/)).toHaveCount(0)
      const violations = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      if (violations.length > 0) violationsByPage[path] = violations
      await expectNoPageOverflow(page)
    }
    expect(violationsByPage).toEqual({})
  } finally {
    await club.cleanup()
  }
})
