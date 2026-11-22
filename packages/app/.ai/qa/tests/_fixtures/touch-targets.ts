import type { Page } from '@playwright/test'

/** The Vereino touch-target rule R05.1 (`h-11`, 44 px; `docs/ux-concept/tokens.md`), WCAG 2.5.5 level. */
export const MIN_TARGET_PX = 44

/**
 * Every visible target on the page whose hit area is smaller than `min` × `min` px, described as
 * `<tag>[testid] "name" W×H` (E20-S12, #491). A target is a link, a button, a form control or an element with an
 * interactive role or a tab stop. Its hit area is the larger of its own box and the box of any `<label>` of it (a tap
 * on the label activates the control). Not counted: disabled controls, visually hidden ones (≤ 1 px, e.g. the skip
 * link until focused), targets nested in another target (the outer one is measured), and links inside running text
 * (the WCAG "inline" exception). Half a pixel of rounding is tolerated.
 */
export async function undersizedTargets(page: Page, min = MIN_TARGET_PX): Promise<string[]> {
  return page.evaluate((minimum) => {
    const selector = [
      'a[href]',
      'button',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      'summary',
      '[role="button"]',
      '[role="link"]',
      '[role="switch"]',
      '[role="radio"]',
      '[role="checkbox"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="option"]',
      '[role="combobox"]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')
    const fits = (rect: DOMRect) => rect.width >= minimum - 0.5 && rect.height >= minimum - 0.5
    const inRunningText = (element: Element) => {
      if (element.tagName !== 'A' || getComputedStyle(element).display !== 'inline') return false
      const block = element.parentElement
      const own = (element.textContent ?? '').trim()
      return block !== null && (block.textContent ?? '').trim().length > own.length
    }
    const found: string[] = []
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (element.closest('[inert]')) continue
      if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') continue
      const style = getComputedStyle(element)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      const rect = element.getBoundingClientRect()
      if (rect.width <= 1 || rect.height <= 1) continue
      if (element.parentElement?.closest(selector)) continue
      if (inRunningText(element)) continue
      const labels = 'labels' in element ? Array.from((element as HTMLInputElement).labels ?? []) : []
      const ancestorLabel = element.closest('label')
      if (ancestorLabel && !labels.includes(ancestorLabel)) labels.push(ancestorLabel)
      if (fits(rect) || labels.some((label) => fits(label.getBoundingClientRect()))) continue
      const testId = element.getAttribute('data-testid')
      const name = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().replace(/\s+/g, ' ')
      found.push(
        `${element.tagName.toLowerCase()}${testId ? `[${testId}]` : ''} "${name.slice(0, 40)}" ${String(Math.round(rect.width))}×${String(Math.round(rect.height))}`,
      )
    }
    return found
  }, min)
}
