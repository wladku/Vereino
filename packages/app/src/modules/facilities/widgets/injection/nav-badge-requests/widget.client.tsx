'use client'
// The Requests menu count (navigation spec REQ-N03; #260): the `total` of `GET /api/facilities/rentals/requests` (one
// row read), on every navigation and every 60 seconds through the shared `navBadgeEffect`.
import * as React from 'react'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { setNavBadge } from '@open-mercato/ui/backend/nav/navBadges'
import { navBadgeEffect } from '@vereino/ui'
import { REQUESTS_HREF, REQUESTS_URL } from '../../../components/requests-client'

async function readCount(): Promise<Record<string, unknown>> {
  const body = await readApiResultOrThrow<{ total?: unknown }>(`${REQUESTS_URL}?page=1&pageSize=1`)
  return { [REQUESTS_HREF]: body.total }
}

export default function RequestsNavBadgeWidget({ context }: InjectionWidgetComponentProps<Record<string, unknown>, Record<string, unknown>>) {
  const t = useT()
  // The shell's injection context carries the current path, so the counts are read again on every navigation.
  const path = typeof context?.path === 'string' ? context.path : ''
  const label = React.useCallback((count: number) => t('facilities.nav.badge.waiting', { count }), [t])
  React.useEffect(
    navBadgeEffect({ hrefs: [REQUESTS_HREF], read: readCount, publish: setNavBadge, label }),
    [path, label],
  )
  return null
}
