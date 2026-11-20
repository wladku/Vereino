// `PlatformA11yRepairs` (E20-S18, #497): mounted once in the backend layout, it keeps the accessibility repairs of
// `platform-a11y.ts` applied to the platform markup (`CrudForm` labels, table search boxes, `AppShell` breadcrumb and
// links) while the page renders. It renders nothing.
import * as React from 'react'
import { platformA11yEffect } from '#src/admin/platform-a11y'

export function PlatformA11yRepairs(): null {
  React.useEffect(platformA11yEffect(), [])
  return null
}
