'use client'
// The Sessions menu count (navigation spec REQ-N03; #260): the `total` of `GET /api/activities/occurrences` in the
// "Needing a coach" window, read on every navigation and every 60 seconds through the shared `navBadgeEffect`.
import * as React from 'react'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { setNavBadge } from '@open-mercato/ui/backend/nav/navBadges'
import { navBadgeEffect } from '@vereino/ui'
import { sessionsNavBadgeQuery } from '../../../lib/dashboard-rules'
import { localCalendarDate } from '../../../lib/occurrence-list'
import { OCCURRENCES_HREF } from '../../../components/client-helpers'

async function readCount(): Promise<Record<string, unknown>> {
  const body = await readApiResultOrThrow<{ total?: unknown }>(
    `/api/activities/occurrences?${sessionsNavBadgeQuery(localCalendarDate(new Date()))}`,
  )
  return { [OCCURRENCES_HREF]: body.total }
}

export default function SessionsNavBadgeWidget({ context }: InjectionWidgetComponentProps<Record<string, unknown>, Record<string, unknown>>) {
  const t = useT()
  // The shell's injection context carries the current path, so the counts are read again on every navigation.
  const path = typeof context?.path === 'string' ? context.path : ''
  const label = React.useCallback((count: number) => t('activities.nav.badge.waiting', { count }), [t])
  React.useEffect(
    navBadgeEffect({ hrefs: [OCCURRENCES_HREF], read: readCount, publish: setNavBadge, label }),
    [path, label],
  )
  return null
}
