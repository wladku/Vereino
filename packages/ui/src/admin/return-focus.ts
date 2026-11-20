// Focus return for dialogs and sheets (E20-S02, #481; WCAG 2.4.3). Radix returns focus on close only to a
// `DialogTrigger`; a dialog opened from state (`open={…}`) has none, so after Esc or a footer button focus fell to
// `<body>`. These framework-free helpers record the element focused when the dialog opens and focus it again when the
// dialog closes; `withReturnFocusContent` (`return-focus-content.ts`) wires them into the platform contents.

/** The element focus returns to: anything with `focus()`; `isConnected` is false once React has removed it. */
export type ReturnFocusTarget = { readonly focus: () => void; readonly isConnected?: boolean }

/** The auto-focus event Radix passes to `onOpenAutoFocus` and `onCloseAutoFocus`. */
export type AutoFocusEvent = { readonly defaultPrevented?: boolean; preventDefault: () => void }

export type AutoFocusHandler = (event: AutoFocusEvent) => void

export type ReturnFocusHandlers = {
  /** Records the opener when the dialog content mounts, before a field's native `autoFocus` moves focus inside. */
  readonly recordOpener: () => void
  readonly onOpenAutoFocus: AutoFocusHandler
  readonly onCloseAutoFocus: AutoFocusHandler
}

/** The element that has focus in the current document, or null outside a browser or when only `<body>` has it. */
export function focusedElement(): ReturnFocusTarget | null {
  if (typeof document === 'undefined') return null
  const element = document.activeElement as (ReturnFocusTarget & Element) | null
  return element && element !== document.body ? element : null
}

/** Whether a dialog is open; asked once the closing dialog has left the page, so an open one is another dialog. */
export function dialogOpen(): boolean {
  if (typeof document === 'undefined') return false
  return document.querySelector('[role="dialog"][data-state="open"]') !== null
}

/**
 * Handlers for one dialog. The opener is recorded when the content mounts (`recordOpener`, before a native `autoFocus`
 * moves focus inside, in which case Radix skips `onOpenAutoFocus`) or, failing that, in `onOpenAutoFocus` (fired before
 * Radix moves focus). On close focus goes back to it, unless it has left the page or another dialog is open (a footer
 * button that closes one dialog and opens the next); then Radix's own behaviour stays.
 */
export function createReturnFocus(
  getActive: () => ReturnFocusTarget | null = focusedElement,
  otherDialogOpen: () => boolean = dialogOpen,
): ReturnFocusHandlers {
  let target: ReturnFocusTarget | null = null
  const record = () => {
    target ??= getActive()
  }
  return {
    recordOpener: record,
    onOpenAutoFocus: record,
    onCloseAutoFocus: (event) => {
      const element = target
      target = null
      if (!element || element.isConnected === false || otherDialogOpen()) return
      event.preventDefault()
      element.focus()
    },
  }
}

/**
 * The content props with the return-focus handlers composed in: the opening element is recorded before the consumer's
 * `onOpenAutoFocus` runs (it may move focus itself), and focus returns after the consumer's `onCloseAutoFocus` only when
 * that handler did not call `preventDefault()`.
 */
export function withReturnFocus<
  E extends AutoFocusEvent,
  P extends { onOpenAutoFocus?: (event: E) => void; onCloseAutoFocus?: (event: E) => void },
>(
  props: P,
  handlers: ReturnFocusHandlers,
): P & { onOpenAutoFocus: (event: E) => void; onCloseAutoFocus: (event: E) => void } {
  const { onOpenAutoFocus: ownOpen, onCloseAutoFocus: ownClose } = props
  return {
    ...props,
    onOpenAutoFocus: (event: E) => {
      handlers.onOpenAutoFocus(event)
      ownOpen?.(event)
    },
    onCloseAutoFocus: (event: E) => {
      ownClose?.(event)
      if (event.defaultPrevented === true) return
      handlers.onCloseAutoFocus(event)
    },
  }
}

/** The insertion effect of the opener probe: records the opener as the dialog content mounts. */
export function recordOpenerEffect(handlers: Pick<ReturnFocusHandlers, 'recordOpener'>): () => undefined {
  return () => {
    handlers.recordOpener()
    return undefined
  }
}
