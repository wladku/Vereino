// Accessibility scan fixture (engineering standards S7.4, ADR-020): WCAG 2.0/2.1/2.2 A and AA rules.
import AxeBuilder from '@axe-core/playwright'
import type { Page, TestInfo } from '@playwright/test'

export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

export type BlockingViolation = { id: string; impact: string; nodes: number }

// Call before navigating: a scan taken during a CSS transition reports the half-faded colours as a
// contrast violation (seen as a flaky `color-contrast` on the sign-in page).
export async function prepareForAccessibilityScan(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' })
}

// Runs axe on the current page once it has settled, attaches the full report to the test and returns
// the critical and serious violations, which a Vereino page must not have.
export async function scanBlockingViolations(page: Page, testInfo: TestInfo): Promise<BlockingViolation[]> {
  await page.waitForLoadState('networkidle')
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  await testInfo.attach('axe-results', { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
  return results.violations
    .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
    .map((violation) => ({ id: violation.id, impact: violation.impact ?? 'unknown', nodes: violation.nodes.length }))
}
