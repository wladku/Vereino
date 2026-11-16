import { expect, test, type Page } from '@playwright/test'
import { createClub } from '../_fixtures/club'
import { create, signInBrowser } from '../_fixtures/club-structure'

// Admin lists load their data once per page load (lesson `admin-lists-load-once-scope-seed`). The platform's scope
// version used to start at 0 on every page and jump when the lazily loaded organization switcher answered, so each
// list whose query key holds that version (every Vereino admin table) loaded a second time and redrew its rows under
// the user; E06-S06 (#316) and E08-S06 (#331) lost that race. `BackendHeaderChrome` now seeds the scope from the
// switcher's cookies before the first render. Fails before the seed: two list requests per page.
test.describe.configure({ timeout: 180_000 })

async function listRequests(page: Page, path: string, api: string): Promise<number> {
  let count = 0
  const onRequest = (request: { url: () => string; method: () => string }) => {
    if (request.method() === 'GET' && request.url().includes(api)) count += 1
  }
  page.on('request', onRequest)
  try {
    await page.goto(path)
    await expect(page.getByTestId('backend-chrome-ready')).toHaveAttribute('data-ready', 'true')
    await page.waitForLoadState('networkidle')
  } finally {
    page.off('request', onRequest)
  }
  return count
}

test('admin lists load their data once per page load', async ({ page, request }) => {
  const club = await createClub(request, 'admin-lists-load-once')
  try {
    await create(request, club.adminToken, 'sections', { name: 'Basen' })
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    // The first page of a session writes the switcher's cookies; from then on every page knows its scope up front.
    await page.goto('/backend')
    await expect(page.getByTestId('backend-chrome-ready')).toHaveAttribute('data-ready', 'true')
    await page.waitForLoadState('networkidle')

    expect(await listRequests(page, '/backend/club/sections', '/api/club_core/sections?')).toBe(1)
    expect(await listRequests(page, '/backend/club/places', '/api/club_core/places?')).toBe(1)
    // A reload keeps the cookies and loads once again.
    expect(await listRequests(page, '/backend/club/sections', '/api/club_core/sections?')).toBe(1)
  } finally {
    await club.cleanup()
  }
})
