// `withReturnFocusContent` (E20-S02, #481; WCAG 2.4.3): wraps a dialog or sheet content component so closing it returns
// focus to the element that opened it. The app passes its own platform component in (`src/components/ui/dialog.tsx`):
// `@vereino/ui` has its own copy of `@open-mercato/ui` and Radix in `node_modules`, and a `DialogContent` taken from that
// copy would not find the app's `Dialog` root (another React context).
import * as React from 'react'
import {
  createReturnFocus,
  withReturnFocus,
  type AutoFocusEvent,
  type ReturnFocusHandlers,
} from '#src/admin/return-focus'

/** The return-focus handlers of one dialog, stable across renders. */
export function useReturnFocus(): ReturnFocusHandlers {
  return React.useState(() => createReturnFocus())[0]
}

type ContentProps = {
  onOpenAutoFocus?: (event: AutoFocusEvent) => void
  onCloseAutoFocus?: (event: AutoFocusEvent) => void
}

/**
 * The content component with the return-focus handlers composed into its `onOpenAutoFocus` / `onCloseAutoFocus`; it
 * keeps the wrapped component's type, so its props and ref stay checked at the call sites.
 */
export function withReturnFocusContent<C extends (props: never) => unknown>(Content: C, displayName: string): C {
  const Inner = Content as unknown as React.ComponentType<ContentProps & React.RefAttributes<unknown>>
  const Wrapped = React.forwardRef<unknown, ContentProps>(function ReturnFocusContent(props, ref) {
    const handlers = useReturnFocus()
    return React.createElement(Inner, { ...withReturnFocus(props, handlers), ref })
  })
  Wrapped.displayName = displayName
  return Wrapped as unknown as C
}
