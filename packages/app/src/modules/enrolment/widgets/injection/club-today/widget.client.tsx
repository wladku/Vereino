'use client'
// The "Applications" tile of `/club` — Today (sign-up form spec M-J1, REQ-J10, J-J03; #799): "Applications: 3 new ·
// 2 overdue" as a link to `/club/applications` (`GET /api/enrolment/applications?tab=new&pageSize=1` and the same with
// `overdue=1`, their totals). Hidden while it loads and when no application waits for a decision, so a member who
// decides nothing never sees an empty tile; when the counts could not be read the tile says so and offers "Try again".
import * as React from 'react'
import Link from 'next/link'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusTag } from '@vereino/ui'
import { CLUB_APPLICATIONS_HREF } from '../../../lib/paths'
import { useApplicationCounts } from '../../../components/club/applications-client'

const TILE_CLASS = 'bg-card flex h-full flex-col gap-3 rounded-lg border p-4'
const LINK_CLASS = 'inline-flex min-h-11 min-w-11 items-center underline underline-offset-4'

export default function ClubApplicationsTileWidget() {
  const t = useT()
  const query = useApplicationCounts()
  const counts = query.data ?? null
  const failed = query.isError && !query.isFetching && !counts
  if (!failed && (!counts || counts.fresh === 0)) return null
  return (
    <section
      aria-labelledby="club-today-applications"
      className={TILE_CLASS}
      data-testid="club-today-applications-tile"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="club-today-applications" className="font-semibold">
          {t('enrolment.widgets.tile.title')}
        </h2>
        <Link href={CLUB_APPLICATIONS_HREF} className={`${LINK_CLASS} text-sm`} data-testid="club-tile-applications">
          {t('enrolment.widgets.tile.open')}
        </Link>
      </div>
      {counts ? (
        <Link
          href={CLUB_APPLICATIONS_HREF}
          className="focus-visible:ring-ring inline-flex min-h-11 flex-wrap items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:outline-none"
          data-testid="club-tile-applications-counts"
          data-new={String(counts.fresh)}
          data-overdue={String(counts.overdue)}
        >
          <StatusTag status="info">{t('enrolment.widgets.tile.new', { count: counts.fresh })}</StatusTag>
          {counts.overdue > 0 ? (
            <StatusTag status="warning">{t('enrolment.widgets.tile.overdue', { count: counts.overdue })}</StatusTag>
          ) : null}
        </Link>
      ) : (
        <div className="flex flex-col items-start gap-2" data-testid="club-tile-applications-error">
          <p className="text-sm">{t('enrolment.widgets.tile.error')}</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('enrolment.club.actions.retry')}
          </Button>
        </div>
      )}
    </section>
  )
}
