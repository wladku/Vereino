import { expect, test } from '@playwright/test'
import { prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'

// ENG-TEST-16 (engineering standards spec, phase E1): the axe fixture works. The sign-in page is
// platform-owned, so its known violations are recorded as a baseline instead of failing the run;
// any new critical or serious violation fails.
const PLATFORM_LOGIN_BASELINE: string[] = []

test('ENG-TEST-16 the sign-in page has no new critical or serious accessibility violations', async ({
  page,
}, testInfo) => {
  await prepareForAccessibilityScan(page)
  await page.goto('/login')
  await expect(page.locator('input[type="password"]')).toBeVisible()
  const violations = await scanBlockingViolations(page, testInfo)
  const unexpected = violations.filter((violation) => !PLATFORM_LOGIN_BASELINE.includes(violation.id))
  expect(unexpected).toEqual([])
})
