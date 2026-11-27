'use client'
// `/club/reports/declaration-share` — "Declarations in Vereino" on the phone (product brief Goals, D21, D29; E27-S02,
// #819): the numbers of the panel report (E27-S01, #818) for the caller's reach, one card per section — a coordinator
// their sections, the administrator every section — from the same `GET /api/activities/reports/declaration-share`, so
// both see the same numbers for the same period. The period is the last 28 days (default), a month or a range of up to
// 12 months. Counts and percentages only, no names. States: loading, error with retry, refusal naming who sees the
// report (a coach, E20-S10), no sections, an invalid range. Reached from More → Declarations in Vereino.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton, monthOf, useClubToday } from '@vereino/ui'
import { monthRange } from '../../lib/coach-units'
import { defaultSharePeriod, resolveSharePeriod, type SharePeriod } from '../../lib/declaration-share'
import { OWN_FORBIDDEN_STATE } from '../client-helpers'
import {
  declarationShareText,
  declarationShareUrl,
  type DeclarationShareData,
  type DeclarationShareKind,
  type DeclarationShareRow,
} from '../DeclarationShareReport'
import { ActivitiesClubFrame } from './ActivitiesClubFrame'

type Translate = (key: string, params?: Record<string, string | number>) => string

type PeriodMode = 'last28' | 'month' | 'range'

type Answer = { status: 'ok'; report: DeclarationShareData } | { status: 'forbidden' }

const KINDS: readonly DeclarationShareKind[] = ['headline', 'confirm', 'absence']

function useDeclarationShare(period: SharePeriod | null, enabled: boolean) {
  return useQuery({
    queryKey: ['activities-club-declaration-share', period?.from, period?.to],
    queryFn: async (): Promise<Answer> => {
      const call = await apiCall<DeclarationShareData>(declarationShareUrl(period), OWN_FORBIDDEN_STATE)
      if (call.status === 403) return { status: 'forbidden' }
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return { status: 'ok', report: call.result }
    },
    enabled,
  })
}

function SectionCard({ row, t }: { row: DeclarationShareRow; t: Translate }) {
  const prefix = 'activities.reports.declarationShare'
  return (
    <li
      className="border-border flex flex-col gap-3 rounded-md border p-4"
      data-testid={`club-declaration-share-section-${row.sectionId}`}
    >
      <h2 className="text-base font-semibold">{row.sectionName}</h2>
      <dl className="flex flex-col gap-2">
        {KINDS.map((kind) => (
          <div key={kind} className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">{t(`${prefix}.columns.${kind}`)}</dt>
            <dd
              className={kind === 'headline' ? 'font-semibold tabular-nums' : 'tabular-nums'}
              data-testid={`club-declaration-share-${kind}-${row.sectionId}`}
            >
              {declarationShareText(t, kind, row)}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  )
}

function DeclarationShare({ t }: { t: Translate }) {
  const today = useClubToday()
  const id = React.useId()
  const [mode, setMode] = React.useState<PeriodMode>('last28')
  const [month, setMonth] = React.useState(() => monthOf(today))
  const [range, setRange] = React.useState<SharePeriod>(() => defaultSharePeriod(today))

  const period: SharePeriod | null =
    mode === 'last28'
      ? defaultSharePeriod(today)
      : mode === 'month'
        ? monthRange(month)
        : // Both days are required here: two empty fields are no range (the API would answer the last 28 days).
          range.from && range.to
          ? resolveSharePeriod(range, today)
          : null
  const periodInvalid = period === null
  const query = useDeclarationShare(mode === 'last28' ? null : period, !periodInvalid)
  const report = query.data?.status === 'ok' ? query.data.report : null

  let body: React.ReactNode
  if (periodInvalid) {
    body = null
  } else if (!query.data && query.isFetching) {
    body = <MemberSkeleton shape="rows" label={t('activities.club.declarationShare.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('activities.reports.declarationShare.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('activities.club.actions.retry')}
          </Button>
        }
      />
    )
  } else if (query.data.status === 'forbidden') {
    body = (
      <Alert style="light" status="warning" data-testid="club-declaration-share-forbidden">
        <p className="max-w-prose">{t('activities.club.declarationShare.forbidden')}</p>
      </Alert>
    )
  } else if (!report || report.items.length === 0) {
    body = (
      <p className="text-muted-foreground" data-testid="club-declaration-share-empty">
        {t('activities.reports.declarationShare.empty')}
      </p>
    )
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm" data-testid="club-declaration-share-period">
          {t('activities.reports.declarationShare.period', { from: report.from, to: report.to })}
        </p>
        <ul className="flex flex-col gap-3" data-testid="club-declaration-share-sections">
          {report.items.map((row) => (
            <SectionCard key={row.sectionId} row={row} t={t} />
          ))}
        </ul>
      </div>
    )
  }

  const forbidden = query.data?.status === 'forbidden'
  const fieldClass =
    'border-input bg-background focus-visible:ring-ring min-h-11 rounded-md border px-3 text-base focus-visible:ring-2 focus-visible:outline-none'
  return (
    <section className="flex flex-col gap-4" aria-labelledby="club-declaration-share-heading">
      <h1 id="club-declaration-share-heading" className="text-xl font-semibold">
        {t('activities.reports.declarationShare.title')}
      </h1>
      <p className="text-muted-foreground text-sm">{t('activities.reports.declarationShare.description')}</p>
      {forbidden ? null : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-mode`}>{t('activities.reports.declarationShare.filters.period')}</Label>
            <select
              id={`${id}-mode`}
              className={fieldClass}
              value={mode}
              onChange={(event) => {
                setMode(event.target.value as PeriodMode)
              }}
              data-testid="club-declaration-share-mode"
            >
              <option value="last28">{t('activities.reports.declarationShare.filters.last28')}</option>
              <option value="month">{t('activities.reports.declarationShare.filters.month')}</option>
              <option value="range">{t('activities.reports.declarationShare.filters.range')}</option>
            </select>
          </div>
          {mode === 'month' ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${id}-month`}>{t('activities.reports.declarationShare.filters.month')}</Label>
              <Input
                id={`${id}-month`}
                type="month"
                className="h-auto"
                inputClassName="min-h-11 text-base"
                value={month}
                onChange={(event) => {
                  if (monthRange(event.target.value)) setMonth(event.target.value)
                }}
                data-testid="club-declaration-share-month"
              />
            </div>
          ) : null}
          {mode === 'range' ? (
            <fieldset className="grid grid-cols-2 gap-3">
              <legend className="sr-only">{t('activities.reports.declarationShare.filters.range')}</legend>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-from`}>{t('activities.reports.declarationShare.filters.from')}</Label>
                <Input
                  id={`${id}-from`}
                  type="date"
                  className="h-auto"
                  inputClassName="min-h-11 text-base"
                  value={range.from}
                  aria-invalid={periodInvalid}
                  aria-describedby={periodInvalid ? `${id}-period-problem` : undefined}
                  onChange={(event) => {
                    setRange((value) => ({ ...value, from: event.target.value }))
                  }}
                  data-testid="club-declaration-share-from"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-to`}>{t('activities.reports.declarationShare.filters.to')}</Label>
                <Input
                  id={`${id}-to`}
                  type="date"
                  className="h-auto"
                  inputClassName="min-h-11 text-base"
                  value={range.to}
                  aria-invalid={periodInvalid}
                  aria-describedby={periodInvalid ? `${id}-period-problem` : undefined}
                  onChange={(event) => {
                    setRange((value) => ({ ...value, to: event.target.value }))
                  }}
                  data-testid="club-declaration-share-to"
                />
              </div>
            </fieldset>
          ) : null}
          {periodInvalid ? (
            <Alert
              style="light"
              status="warning"
              id={`${id}-period-problem`}
              data-testid="club-declaration-share-period-invalid"
            >
              {t('activities.reports.declarationShare.periodInvalid')}
            </Alert>
          ) : null}
        </div>
      )}
      {body}
    </section>
  )
}

export function ClubDeclarationSharePage() {
  const t = useT()
  return <ActivitiesClubFrame>{() => <DeclarationShare t={t} />}</ActivitiesClubFrame>
}
