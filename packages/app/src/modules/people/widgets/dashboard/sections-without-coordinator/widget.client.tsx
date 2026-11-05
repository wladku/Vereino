'use client'
// The view of "Sections without a coordinator" (README B-01, note 4; issue #88): the count, up to five sections by
// name linking to their Coordinators tab, and its own loading, empty and error ("Try again") states, so a failure
// here never takes the other widgets down. The first widget of the Vereino pattern: read a list route that already
// carries the data, reduce it with a pure rule in `lib/`, link every row to the place where it is fixed.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  SECTIONS_LIST_HREF,
  hasNextPage,
  sectionCoordinatorsHref,
  sectionListQuery,
  sectionsMissingCoordinator,
  summarizeSectionsWithoutCoordinator,
  type SectionWithoutCoordinator,
  type SectionsWithoutCoordinator,
} from '../../../lib/dashboard-rules'
import { OWN_FORBIDDEN_STATE } from '../../../components/client-helpers'

type SectionListPage = { items?: unknown[]; totalPages?: unknown }

async function loadSectionsWithoutCoordinator(): Promise<SectionsWithoutCoordinator> {
  const missing: SectionWithoutCoordinator[] = []
  for (let page = 1; ; page += 1) {
    const body = await readApiResultOrThrow<SectionListPage>(
      `/api/club_core/sections?${sectionListQuery(page)}`,
      OWN_FORBIDDEN_STATE,
    )
    missing.push(...sectionsMissingCoordinator(Array.isArray(body.items) ? body.items : []))
    if (!hasNextPage(page, body.totalPages)) break
  }
  return summarizeSectionsWithoutCoordinator(missing)
}

const SectionsWithoutCoordinatorWidget: React.FC<DashboardWidgetComponentProps<Record<string, never>>> = ({
  mode,
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const query = useQuery({
    queryKey: ['people', 'dashboard', 'sectionsWithoutCoordinator', refreshToken],
    queryFn: loadSectionsWithoutCoordinator,
    enabled: mode === 'view',
    // The widget shows its own error with "Try again" at once instead of retrying in the background.
    retry: false,
  })
  const fetching = query.isFetching

  React.useEffect(() => {
    onRefreshStateChange?.(fetching)
  }, [fetching, onRefreshStateChange])

  if (mode === 'settings') {
    return (
      <p className="text-muted-foreground text-sm">
        {t('people.dashboard.widgets.sectionsWithoutCoordinator.noSettings')}
      </p>
    )
  }

  if (query.isError && !query.isFetching) {
    return (
      <ErrorMessage
        label={t('people.dashboard.widgets.sectionsWithoutCoordinator.error')}
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('people.dashboard.widgets.sectionsWithoutCoordinator.retry')}
          </Button>
        }
      />
    )
  }

  if (query.isFetching || !query.data) {
    return <LoadingMessage label={t('people.dashboard.widgets.sectionsWithoutCoordinator.loading')} />
  }

  const { total, sections } = query.data
  return (
    <div className="space-y-3" data-testid="sections-without-coordinator">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          <span
            className="text-foreground mr-2 text-2xl font-semibold"
            data-testid="sections-without-coordinator-count"
          >
            {total}
          </span>
          {t('people.dashboard.widgets.sectionsWithoutCoordinator.countLabel')}
        </p>
        <Link href={SECTIONS_LIST_HREF} className="text-primary text-sm font-medium underline-offset-4 hover:underline">
          {t('people.dashboard.widgets.sectionsWithoutCoordinator.openList')}
        </Link>
      </div>
      {total === 0 ? (
        <p className="bg-muted/50 text-muted-foreground rounded-md border px-3 py-4 text-center text-sm">
          {t('people.dashboard.widgets.sectionsWithoutCoordinator.empty')}
        </p>
      ) : (
        <ul className="space-y-1">
          {sections.map((section) => (
            <li key={section.id}>
              <Link
                href={sectionCoordinatorsHref(section.id)}
                className="text-primary hover:bg-muted block rounded-md px-2 py-1.5 text-sm underline-offset-4 hover:underline"
              >
                {section.name || t('people.dashboard.widgets.sectionsWithoutCoordinator.unnamed')}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {total > sections.length ? (
        <p className="text-muted-foreground text-xs">
          {t('people.dashboard.widgets.sectionsWithoutCoordinator.more', { count: total - sections.length })}
        </p>
      ) : null}
    </div>
  )
}

export default SectionsWithoutCoordinatorWidget
