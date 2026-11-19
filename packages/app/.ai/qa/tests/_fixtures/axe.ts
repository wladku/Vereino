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
// its text, and its breadcrumb puts an aria-label on the role-less current-page span; the schedule family
// (`ScheduleView`, react-big-calendar) nests grid roles and labels its date-range trigger differently from its text;
// `LookupSelect` points its search combobox at a listbox it has not rendered yet; `StepIndicator` puts
// `aria-orientation` on its list.
// Each entry is matched by rule and node, so the same rule on Vereino markup still fails.
// Remove an entry once the platform fixes it (lesson `platform-crudform-labels-axe-baseline`).
const PLATFORM_BASELINE: {
  rule: string
  owner: string
  matches: (node: ScannedNode, page: Page) => boolean | Promise<boolean>
}[] = [
  // axe shortens long attribute names, so `data-crud-focus-target` appears as `data-crud-focus-targ...`.
  { rule: 'label', owner: 'CrudForm field', matches: (node) => node.html.includes('data-crud-focus-targ') },
  { rule: 'button-name', owner: 'CrudForm select', matches: (node) => node.html.includes('data-crud-focus-targ') },
  {
    rule: 'color-contrast',
    owner: 'AppShell sidebar group heading',
    // axe reports the shortest unique selector, which names `[data-sidebar-group]` for some headings only and changes
    // when a module adds a sidebar group (#35), so the heading is matched by its ancestor in the page.
    matches: (node, page) => insideSidebarGroup(node, page),
  },
  {
    rule: 'label-content-name-mismatch',
    // The back link (`data-testid="appshell-…"`) and the main-sidebar brand link of `AppShell.tsx` (`aria-label="Go to
    // dashboard"`, in pl `"Przejdź do pulpitu"`, while its visible text is the brand name; first scanned on the `groups`
    // pages, #30; the pl label since #256).
    // Since #94 also the date-range trigger of the schedule family's `ScheduleToolbar` (`aria-label="Date range"` while
    // its visible text is the range).
    owner: 'AppShell back link and brand link; ScheduleToolbar date-range trigger',
    matches: (node) =>
      node.html.includes('data-testid="appshell-') ||
      ((node.html.includes('aria-label="Go to dashboard"') || node.html.includes('aria-label="Przejdź do pulpitu"')) &&
        node.html.includes('href="/backend"')) ||
      node.html.includes('data-slot="date-range-picker-tr'),
  },
  {
    rule: 'aria-prohibited-attr',
    // The AppShell breadcrumb's current page is a `<span aria-current="page" aria-label=…>` with no role; first scanned
    // on the dashboard `/backend` (#88).
    owner: 'AppShell breadcrumb current page',
    matches: (node) => node.html.includes('data-slot="breadcrumb-page"'),
  },
  // The week grid of the schedule family's `ScheduleView` is react-big-calendar, whose all-day row nests
  // `role="rowgroup"` inside `role="row"` (`.rbc-allday-cell`, `.rbc-row-content`; first scanned on the coordinator
  // calendar of `/backend/activities/occurrences`, #94).
  { rule: 'aria-required-children', owner: 'ScheduleView grid', matches: (node) => node.html.includes('class="rbc-') },
  { rule: 'aria-required-parent', owner: 'ScheduleView grid', matches: (node) => node.html.includes('class="rbc-') },
  // `StepIndicator` renders its steps as an `<ol aria-orientation=…>`; `aria-orientation` is not allowed on the implicit
  // `list` role (first scanned on the order campaign record, `/backend/payments/orders/[id]`, #293).
  {
    rule: 'aria-allowed-attr',
    owner: 'StepIndicator list',
    matches: (node) => node.html.includes('data-slot="step-indicator"'),
  },
  // `LookupSelect`'s search input is a `role="combobox"` whose `aria-controls` names its listbox and whose
  // `aria-expanded` is true while it searches, but the listbox renders only once there are results or a typed query:
  // with no candidates and an empty query the reference points at nothing (first scanned on "Add section" with its
  // coordinator picker, `/backend/club/sections/create`, #262).
  {
    rule: 'aria-valid-attr-value',
    owner: 'LookupSelect search combobox',
    matches: (node) => node.html.includes('role="combobox"') && node.html.includes('aria-autocomplete="list"'),
  },
]

// Whether a scanned node sits inside an AppShell sidebar group (`[data-sidebar-group]`) of the current page.
async function insideSidebarGroup(node: ScannedNode, page: Page): Promise<boolean> {
  if (node.target.length !== 1) return false
  return page
    .locator(`css=${String(node.target[0])}`)
    .first()
    .evaluate((element) => element.closest('[data-sidebar-group]') !== null)
    .catch(() => false)
}

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
  // On failure, name the innermost elements that stick out past the viewport (outside any scroll container), so a CI
  // log shows the culprit without a local browser (#293).
  const offenders =
    overflow > 0
      ? await page.evaluate(() => {
          const width = document.documentElement.clientWidth
          const clipped = (element: Element): boolean => {
            for (let parent = element.parentElement; parent; parent = parent.parentElement) {
              const style = getComputedStyle(parent)
              if (style.overflowX !== 'visible' && parent !== document.documentElement && parent !== document.body) {
                return true
              }
            }
            return false
          }
          const wide = [...document.querySelectorAll('body *')].filter(
            (element) => element.getBoundingClientRect().right > width + 0.5 && !clipped(element),
          )
          return wide
            .filter((element) => !wide.some((other) => other !== element && element.contains(other)))
            .slice(0, 5)
            .map((element) => {
              const testId = element.getAttribute('data-testid')
              const slot = element.getAttribute('data-slot')
              const name = [
                element.tagName.toLowerCase(),
                testId ? `[data-testid="${testId}"]` : '',
                slot ? `[data-slot="${slot}"]` : '',
              ].join('')
              const right = Math.round(element.getBoundingClientRect().right)
              return `${name} right=${String(right)} "${element.textContent.trim().slice(0, 40)}"`
            })
        })
      : []
  expect(
    overflow,
    `page wider than 320 px by ${String(overflow)} px${offenders.length ? `: ${offenders.join('; ')}` : ''}`,
  ).toBeLessThanOrEqual(0)
}

// Switches the colour scheme of a rendered page that cannot be reloaded (a filled form, its error state) and waits until
// the page shows it: the ThemeProvider has set the `dark` class and every colour transition it started has finished. A
// scan during the fade reports half-blended colours as contrast violations (#368); `reducedMotion` does not stop it.
export async function switchColorScheme(page: Page, colorScheme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
  await page.waitForFunction(
    (dark) => document.documentElement.classList.contains('dark') === dark,
    colorScheme === 'dark',
  )
  await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
    // Two frames: the class change is styled and its transitions are created before they are read.
    await frame()
    await frame()
    for (;;) {
      const running = document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition && animation.playState === 'running')
      if (running.length === 0) return
      await Promise.allSettled(running.map((animation) => animation.finished))
      await frame()
    }
  })
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
    const remaining: typeof violation.nodes = []
    for (const node of violation.nodes) if (!entry || !(await entry.matches(node, page))) remaining.push(node)
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
