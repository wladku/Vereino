'use client'
// The view of "People needing attention" (people life-cycle spec row 11 of the dashboard widgets; #310): one count per
// "Needs attention" filter of B-09 (`GET /api/people/persons?attention=…&pageSize=1`), each a link to the list with the
// filter, with its own loading, empty ("Nobody needs attention") and error ("Try again") states. "Missing consents"
// reads the participants from `groups`; without that module its count is left out.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { OWN_FORBIDDEN_STATE, PERSONS_HREF } from '../../../components/client-helpers'
import type { PersonAttentionFilter } from '../../../lib/person-list-filters'

/** The widget's order: the 18th-birthday and account rows first, consents last. */
const ROWS: readonly PersonAttentionFilter[] = [
  'turns_18_soon',
  'account_age',
  'adult_without_contact',
  'missing_consents',
]

type Count = { filter: PersonAttentionFilter; total: number }

class AttentionLoadError extends Error {}

/** One filter's total; null when the filter is unavailable here (422 `people_filter_unavailable` without `groups`). */
async function countOf(filter: PersonAttentionFilter): Promise<Count | null> {
  const call = await apiCall<{ total?: number; code?: string }>(
    `/api/people/persons?attention=${filter}&pageSize=1`,
    OWN_FORBIDDEN_STATE,
  )
  if (call.status === 422 && call.result?.code === 'people_filter_unavailable') return null
  if (!call.ok || typeof call.result?.total !== 'number') throw new AttentionLoadError(String(call.status))
  return { filter, total: call.result.total }
}

const PeopleNeedingAttentionWidget: React.FC<DashboardWidgetComponentProps<Record<string, never>>> = ({
  mode,
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const query = useQuery({
    queryKey: ['people', 'dashboard', 'peopleNeedingAttention', refreshToken],
    queryFn: async () => (await Promise.all(ROWS.map(countOf))).filter((row): row is Count => row !== null),
    enabled: mode === 'view',
    retry: false,
  })
  const fetching = query.isFetching

  React.useEffect(() => {
    onRefreshStateChange?.(fetching)
  }, [fetching, onRefreshStateChange])

  if (mode === 'settings') {
    return (
      <p className="text-muted-foreground text-sm">{t('people.dashboard.widgets.peopleNeedingAttention.noSettings')}</p>
    )
  }
  if (query.isError && !query.isFetching) {
    return (
      <ErrorMessage
        label={t('people.dashboard.widgets.peopleNeedingAttention.error')}
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('people.dashboard.widgets.peopleNeedingAttention.retry')}
          </Button>
        }
      />
    )
  }
  if (query.isFetching || !query.data) {
    return <LoadingMessage label={t('people.dashboard.widgets.peopleNeedingAttention.loading')} />
  }
  const rows = query.data.filter((row) => row.total > 0)
  if (rows.length === 0) {
    return (
      <p
        className="bg-muted/50 text-muted-foreground rounded-md border px-3 py-4 text-center text-sm"
        data-testid="people-needing-attention-empty"
      >
        {t('people.dashboard.widgets.peopleNeedingAttention.empty')}
      </p>
    )
  }
  return (
    <ul className="space-y-1" data-testid="people-needing-attention-widget">
      {rows.map((row) => (
        <li key={row.filter}>
          <Link
            href={`${PERSONS_HREF}?attention=${row.filter}`}
            className="hover:bg-muted flex items-center gap-3 rounded-md px-2 py-1.5 text-sm"
            data-testid={`people-needing-attention-${row.filter}`}
          >
            <span className="text-foreground min-w-8 text-right text-xl font-semibold">{row.total}</span>
            <span className="text-primary underline-offset-4 hover:underline">
              {t(`people.persons.filters.attention.${row.filter}`)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default PeopleNeedingAttentionWidget
