// Focus return for dialogs and sheets (E20-S02, #481; WCAG 2.4.3). Radix returns focus on close only to a
// `DialogTrigger`; a dialog opened from state (`open={…}`) has none, so after Esc or a footer button focus fell to
// `<body>`. These framework-free helpers record the element focused when the dialog opens and focus it again when the
// dialog closes; `dialog-content.tsx` wires them into the platform `DialogContent` and `SheetContent`.

/** The element focus returns to: anything with `focus()`; `isConnected` is false once React has removed it. */
export type ReturnFocusTarget = { readonly focus: () => void; readonly isConnected?: boolean }

/** The auto-focus event Radix passes to `onOpenAutoFocus` and `onCloseAutoFocus`. */
export type AutoFocusEvent = { readonly defaultPrevented?: boolean; preventDefault: () => void }

export type AutoFocusHandler = (event: AutoFocusEvent) => void

export type ReturnFocusHandlers = {
  readonly onOpenAutoFocus: AutoFocusHandler
  readonly onCloseAutoFocus: AutoFocusHandler
}

/** The element that has focus in the current document, or null outside a browser or when only `<body>` has it. */
export function focusedElement(): ReturnFocusTarget | null {
  if (typeof document === 'undefined') return null
  const element = document.activeElement as (ReturnFocusTarget & Element) | null
  return element && element !== document.body ? element : null
}

/**
 * Handlers for one dialog: on open they remember what had focus (Radix fires `onOpenAutoFocus` before it moves focus
 * into the dialog), on close they focus it again unless it has left the page, in which case Radix's own behaviour
 * stays.
 */
export function createReturnFocus(getActive: () => ReturnFocusTarget | null = focusedElement): ReturnFocusHandlers {
  let target: ReturnFocusTarget | null = null
  return {
    onOpenAutoFocus: () => {
      target = getActive()
    },
    onCloseAutoFocus: (event) => {
      const element = target
      target = null
      if (!element || element.isConnected === false) return
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
