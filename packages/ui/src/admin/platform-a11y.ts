// Accessibility repairs for platform-owned markup (`@open-mercato/ui`, written for 0.9.0) that Vereino cannot fix through
// props (E20-S18, #497; owner decision 7 of epic #479: work around on the Vereino side, report upstream, no ejection).
// Each repair adds or corrects one ARIA attribute on a rendered element; none removes or moves a node, so React's own
// rendering is left intact. They are idempotent: a second pass over a repaired page changes nothing, so the mutation
// observer that re-runs them after every render settles at once. Remove a repair when an upgrade of `@open-mercato/ui`
// fixes its gap (the upstream reports are linked from #497). The `CrudForm` label repair went with 0.10.1 (#498):
// `CrudForm` now ties each label to its control (`htmlFor`), and E20-S18 finds no `label` or `button-name` violation.

/** The part of a DOM element the repairs read and write (a real `Element` satisfies it). */
export type RepairElement = {
  readonly textContent: string | null
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  closest(selector: string): RepairElement | null
}

/** The part of a DOM root (`document` or an element) the repairs search. */
export type RepairRoot = { querySelectorAll(selector: string): ArrayLike<RepairElement> }

/** The search box of the `DataTable` filter bar (`SearchInput`), named only by its placeholder. */
export const SEARCH_INPUT_SELECTOR = '[data-slot="search-input-wrapper"] input'
/** The breadcrumb's current page: a `<span aria-current="page">` that `AppShell` gives an `aria-label` but no role. */
export const BREADCRUMB_PAGE_SELECTOR = '[data-slot="breadcrumb-page"][aria-label]:not([role])'
/** `AppShell` links whose `aria-label` differs from their visible text: the brand link and the section back link. */
export const SHELL_LINK_SELECTOR = 'a[href="/backend"][aria-label], a[data-testid^="appshell-"][aria-label]'

const collapse = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim()

function hasAccessibleName(control: RepairElement): boolean {
  return (
    collapse(control.getAttribute('aria-label')) !== '' ||
    collapse(control.getAttribute('aria-labelledby')) !== '' ||
    control.closest('label') !== null
  )
}

/** Names a table search box by its placeholder, which disappears once the user types (WCAG 3.3.2, 4.1.2). */
export function labelSearchInput(input: RepairElement): boolean {
  const placeholder = collapse(input.getAttribute('placeholder'))
  if (placeholder === '' || hasAccessibleName(input)) return false
  input.setAttribute('aria-label', placeholder)
  return true
}

/**
 * Gives the breadcrumb's icon-only current page the `img` role, on which its `aria-label` is allowed (axe
 * `aria-prohibited-attr`: a role-less `<span>` must not carry one, so screen readers drop the page name).
 */
export function roleBreadcrumbPage(page: RepairElement): boolean {
  if (page.getAttribute('role') !== null || collapse(page.getAttribute('aria-label')) === '') return false
  page.setAttribute('role', 'img')
  return true
}

/**
 * Starts a link's `aria-label` with its visible text, so a speech user can say what they see (axe
 * `label-content-name-mismatch`, WCAG 2.5.3): "Vereino – Go to dashboard" instead of "Go to dashboard".
 */
export function matchLinkName(link: RepairElement): boolean {
  const visible = collapse(link.textContent)
  const label = collapse(link.getAttribute('aria-label'))
  if (visible === '' || label === '' || label.toLowerCase().includes(visible.toLowerCase())) return false
  link.setAttribute('aria-label', `${visible} – ${label}`)
  return true
}

/** Runs every repair over `root`; returns how many elements it changed. */
export function repairPlatformA11y(root: RepairRoot): number {
  let changed = 0
  const each = (selector: string, repair: (element: RepairElement) => boolean) => {
    for (const element of Array.from(root.querySelectorAll(selector))) if (repair(element)) changed += 1
  }
  each(SEARCH_INPUT_SELECTOR, labelSearchInput)
  each(BREADCRUMB_PAGE_SELECTOR, roleBreadcrumbPage)
  each(SHELL_LINK_SELECTOR, matchLinkName)
  return changed
}

type Observer = { observe(target: unknown, options: Record<string, unknown>): void; disconnect(): void }
type ObserverFactory = (callback: () => void) => Observer

/** The attributes whose change can undo a repair (a re-render with a new locale writes `aria-label` again). */
export const WATCHED_ATTRIBUTES = ['aria-label', 'aria-labelledby', 'placeholder', 'role']

/**
 * Repairs `root` now and again after every change below it, batched into one pass per task (`schedule`, a microtask by
 * default). Returns the function that stops watching.
 */
export function watchPlatformA11y(
  root: RepairRoot,
  createObserver: ObserverFactory,
  schedule: (run: () => void) => void = queueMicrotask,
): () => void {
  let pending = false
  let active = true
  repairPlatformA11y(root)
  const observer = createObserver(() => {
    if (pending) return
    pending = true
    schedule(() => {
      pending = false
      if (active) repairPlatformA11y(root)
    })
  })
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: WATCHED_ATTRIBUTES })
  return () => {
    active = false
    observer.disconnect()
  }
}

/** The page body, or null outside a browser. */
export function browserRepairRoot(): RepairRoot | null {
  return typeof document === 'undefined' ? null : document.body
}

/** A `MutationObserver` calling `callback` on every batch of changes. */
export function browserObserver(callback: () => void): Observer {
  return new MutationObserver(callback)
}

/** The effect of `PlatformA11yRepairs`: watches the page while mounted. */
export function platformA11yEffect(
  getRoot: () => RepairRoot | null = browserRepairRoot,
  createObserver: ObserverFactory = browserObserver,
): () => (() => void) | undefined {
  return () => {
    const root = getRoot()
    return root ? watchPlatformA11y(root, createObserver) : undefined
  }
}
