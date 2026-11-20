'use client'

// The platform dialog and sheet content with focus return (E20-S02, #481; WCAG 2.4.3): closing with Esc, the close
// button or a footer button puts focus back on the element that opened the dialog, also when it was opened from state
// rather than through a `DialogTrigger`. Vereino modules import these two from here (ESLint `no-restricted-imports` in
// `eslint.vereino.mjs`); every other dialog part still comes from `@open-mercato/ui`. The wrapper takes the app's own
// copy of the platform component, see `withReturnFocusContent` in `@vereino/ui`.
import { DialogContent as PlatformDialogContent } from '@open-mercato/ui/primitives/dialog'
import { SheetContent as PlatformSheetContent } from '@open-mercato/ui/primitives/sheet'
import { withReturnFocusContent } from '@vereino/ui'

export const DialogContent = withReturnFocusContent(PlatformDialogContent, 'DialogContent')

export const SheetContent = withReturnFocusContent(PlatformSheetContent, 'SheetContent')
