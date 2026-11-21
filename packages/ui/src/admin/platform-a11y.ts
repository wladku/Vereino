// Accessibility repairs for platform-owned markup (`@open-mercato/ui` 0.9.0) that Vereino cannot fix through props
// (E20-S18, #497; owner decision 7 of epic #479: work around on the Vereino side, report upstream, no ejection).
// Each repair adds or corrects one ARIA attribute on a rendered element; none removes or moves a node, so React's own
// rendering is left intact. They are idempotent: a second pass over a repaired page changes nothing, so the mutation
// observer that re-runs them after every render settles at once. Remove a repair when an upgrade of `@open-mercato/ui`
// fixes its gap (the upstream reports are linked from #497).

/** The part of a DOM element the repairs read and write (a real `Element` satisfies it). */
export type RepairElement = {
  readonly tagName: string
  readonly textContent: string | null
  readonly children: ArrayLike<RepairElement>
  id: string
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  contains(other: RepairElement): boolean
  closest(selector: string): RepairElement | null
  querySelector(selector: string): RepairElement | null
}

/** The part of a DOM root (`document` or an element) the repairs search. */
export type RepairRoot = { querySelectorAll(selector: string): ArrayLike<RepairElement> }

/** A `CrudForm` field wrapper: its `<label>` child names the field's first control. */
export const CRUD_FIELD_SELECTOR = '[data-crud-field-id]'
/** The control of a `CrudForm` field: the focus target `CrudForm` marks, else the first form control. */
export const CRUD_CONTROL_SELECTOR =
  '[data-crud-focus-target], input:not([type="hidden"]), textarea, select, button[role="combobox"]'
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

/**
 * Names a `CrudForm` field's control by the field's label (`aria-labelledby`): `CrudForm` renders the `<label>` without
 * `htmlFor` and the control without an id, so neither the label nor a click on it reaches the control (axe `label`,
 * `button-name` on the select trigger; WCAG 1.3.1, 4.1.2). Leaves controls that already have a name alone.
 */
export function labelCrudField(field: RepairElement, nextId: () => string): boolean {
  const label = Array.from(field.children).find((child) => child.tagName === 'LABEL')
  if (!label || collapse(label.textContent) === '') return false
  const control = field.querySelector(CRUD_CONTROL_SELECTOR)
  if (!control || label.contains(control) || hasAccessibleName(control)) return false
  if (!label.id) label.id = nextId()
  // A control that shows text (the select trigger shows the chosen option) keeps that text in its name: "Status *
  // Active", so the name still contains what is visible (WCAG 2.5.3).
  if (collapse(control.textContent) === '') {
    control.setAttribute('aria-labelledby', label.id)
  } else {
    if (!control.id) control.id = nextId()
    control.setAttribute('aria-labelledby', `${label.id} ${control.id}`)
  }
  return true
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
export function repairPlatformA11y(root: RepairRoot, nextId: () => string): number {
  let changed = 0
  const each = (selector: string, repair: (element: RepairElement) => boolean) => {
    for (const element of Array.from(root.querySelectorAll(selector))) if (repair(element)) changed += 1
  }
  each(CRUD_FIELD_SELECTOR, (field) => labelCrudField(field, nextId))
  each(SEARCH_INPUT_SELECTOR, labelSearchInput)
  each(BREADCRUMB_PAGE_SELECTOR, roleBreadcrumbPage)
  each(SHELL_LINK_SELECTOR, matchLinkName)
  return changed
}

/** Ids for the labels the repairs name controls with, unique within the page. */
export function createRepairIds(prefix = 'vereino-a11y'): () => string {
  let next = 0
  return () => `${prefix}-${String((next += 1))}`
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
  const nextId = createRepairIds()
  let pending = false
  let active = true
  repairPlatformA11y(root, nextId)
  const observer = createObserver(() => {
    if (pending) return
    pending = true
    schedule(() => {
      pending = false
      if (active) repairPlatformA11y(root, nextId)
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
