// Accessibility scan fixture (engineering standards S7.4, ADR-020): WCAG 2.0/2.1/2.2 A and AA rules.
import AxeBuilder from '@axe-core/playwright'
import { expect } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'

export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

export type BlockingViolation = { id: string; impact: string; nodes: number }

type ScannedNode = { html: string; target: unknown[] }

// Violations raised by platform-owned markup (`@open-mercato/ui` 0.9.0), not by Vereino code: `CrudForm`
// renders each field's <label> without `htmlFor` and its controls without an accessible name, and the
// backend AppShell sidebar has low-contrast group headings and a back link whose aria-label differs from
// its text. Each entry is matched by rule and node, so the same rule on Vereino markup still fails.
// Remove an entry once the platform fixes it (lesson `platform-crudform-labels-axe-baseline`).
const PLATFORM_BASELINE: { rule: string; owner: string; matches: (node: ScannedNode) => boolean }[] = [
  // axe shortens long attribute names, so `data-crud-focus-target` appears as `data-crud-focus-targ...`.
  { rule: 'label', owner: 'CrudForm field', matches: (node) => node.html.includes('data-crud-focus-targ') },
  { rule: 'button-name', owner: 'CrudForm select', matches: (node) => node.html.includes('data-crud-focus-targ') },
  {
    rule: 'color-contrast',
    owner: 'AppShell sidebar group heading',
    matches: (node) => node.target.some((selector) => String(selector).includes('[data-sidebar-group')),
  },
  {
    rule: 'label-content-name-mismatch',
    // The back link (`data-testid="appshell-…"`) and the main-sidebar brand link of `AppShell.tsx` (`aria-label="Go to
    // dashboard"` while its visible text is the brand name; first scanned on the `groups` pages, #30).
    owner: 'AppShell back link and brand link',
    matches: (node) =>
      node.html.includes('data-testid="appshell-') ||
      (node.html.includes('aria-label="Go to dashboard"') && node.html.includes('href="/backend"')),
  },
]

// Call before navigating: a scan taken during a CSS transition reports the half-faded colours as a
// contrast violation (seen as a flaky `color-contrast` on the sign-in page).
export async function prepareForAccessibilityScan(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' })
}

// Reflow at 320 CSS px (WCAG 1.4.10, S7.4): resizes the viewport and fails when the page itself scrolls
// sideways. Tables, timelines and maps that scroll inside their own container do not widen the page.
export async function expectNoPageOverflow(page: Page): Promise<void> {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.waitForLoadState('networkidle')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, `page wider than 320 px by ${String(overflow)} px`).toBeLessThanOrEqual(0)
}

// Scans the current page in light and then dark mode (S7.4, S7.8) and returns the blocking violations per scheme. The
// page is reloaded after each switch: a scheme changed on a rendered page fades its colours, and a scan during the
// fade reports half-blended colours as contrast violations (lesson `axe-after-color-scheme-and-react-query-error-refetch`).
export async function scanInColorSchemes(
  page: Page,
  testInfo: TestInfo,
  label: string,
  ready: () => Promise<void>,
  options: { platformBaseline?: boolean } = {},
): Promise<Record<string, BlockingViolation[]>> {
  const found: Record<string, BlockingViolation[]> = {}
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.reload()
    await ready()
    const violations = await scanBlockingViolations(page, testInfo, options)
    if (violations.length > 0) found[`${label} (${colorScheme})`] = violations
  }
  return found
}

// Runs axe on the current page once it has settled, attaches the full report to the test and returns
// the critical and serious violations, which a Vereino page must not have. With `platformBaseline`,
// nodes listed in PLATFORM_BASELINE are left out (and attached separately), so only Vereino markup counts.
export async function scanBlockingViolations(
  page: Page,
  testInfo: TestInfo,
  options: { platformBaseline?: boolean } = {},
): Promise<BlockingViolation[]> {
  await page.waitForLoadState('networkidle')
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  await testInfo.attach('axe-results', { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
  const blocking: BlockingViolation[] = []
  const baselined: { rule: string; owner: string; nodes: number }[] = []
  for (const violation of results.violations) {
    if (violation.impact !== 'critical' && violation.impact !== 'serious') continue
    const entry = options.platformBaseline ? PLATFORM_BASELINE.find((item) => item.rule === violation.id) : undefined
    const remaining = entry ? violation.nodes.filter((node) => !entry.matches(node)) : violation.nodes
    if (entry && remaining.length < violation.nodes.length) {
      baselined.push({ rule: entry.rule, owner: entry.owner, nodes: violation.nodes.length - remaining.length })
    }
    if (remaining.length > 0) blocking.push({ id: violation.id, impact: violation.impact, nodes: remaining.length })
  }
  if (baselined.length > 0) {
    await testInfo.attach('axe-platform-baseline', {
      body: JSON.stringify({ url: results.url, baselined }, null, 2),
      contentType: 'application/json',
    })
  }
  return blocking
}
