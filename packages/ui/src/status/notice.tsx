// `Notice` — the one way Vereino code shows an information notice (#492, E20-S13): "the list opens at 16:30", "the
// session is in the past". The platform `<Alert>` defaults to `style="light"`, whose information background is the
// saturated `--status-info-border`; a notice uses the light `--status-info-bg` instead (`style="lighter"`), as
// `docs/ux-concept/tokens.md` and the mockup show it. Error, warning and success alerts stay `<Alert>` with an explicit
// `style`; `ds:check` (rule `alert-without-style`) rejects an `<Alert>` that names none.
import * as React from 'react'
import { Alert, type AlertProps } from '@open-mercato/ui/primitives/alert'

/** Every `<Alert>` prop except the look: a notice is always information in the light style. */
export type NoticeProps = Omit<AlertProps, 'status' | 'style' | 'variant'>

export const Notice = React.forwardRef<HTMLDivElement, NoticeProps>(function Notice(props, ref) {
  return <Alert ref={ref} {...props} status="information" style="lighter" />
})
