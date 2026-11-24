'use client'
// `/club/reports/pzpn` — the PZPN exports (training outlines spec M-O9, J-O05, REQ-O10; E24-S04, #684): a team, a period
// (the current month by default) and two downloads, "Schedule (CSV)" and "Attendance (CSV)", from
// `GET /api/activities/reports/pzpn-schedule` and `pzpn-attendance`. The teams are the caller's active groups as
// `GET /api/groups/groups` scopes them (a coach the groups they coach, a coordinator their sections, the administrator
// the club); `?groupId=` preselects one (the link on the club group page), and one not in the list selects none. A period the routes would refuse (end before
// start, longer than a year) disables the downloads and says why. States: loading, error with retry, no teams.
import * as React from 'react'
import { useSearchParams } from 'next/navigation'
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
import { isPzpnPeriod, type PzpnExportKind } from '../../lib/pzpn-export'
import { ActivitiesClubFrame } from './ActivitiesClubFrame'

type Translate = (key: string, params?: Record<string, string | number>) => string

type TeamOption = { id: string; name: string; sectionName?: string | null }

function useTeams() {
  return useQuery({
    queryKey: ['activities-pzpn-teams'],
    queryFn: async (): Promise<TeamOption[]> => {
      const call = await apiCall<{ items?: TeamOption[] }>(
        '/api/groups/groups?isActive=true&sortField=name&sortDir=asc&pageSize=100',
      )
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return [...(call.result.items ?? [])].sort(
        (a, b) => (a.sectionName ?? '').localeCompare(b.sectionName ?? '') || a.name.localeCompare(b.name),
      )
    },
  })
}

function exportUrl(kind: PzpnExportKind, groupId: string, from: string, to: string): string {
  const params = new URLSearchParams({ groupId, from, to, format: 'csv' })
  return `/api/activities/reports/pzpn-${kind}?${params.toString()}`
}

function PzpnExports({ t }: { t: Translate }) {
  const today = useClubToday()
  const searchParams = useSearchParams()
  const id = React.useId()
  const month = monthRange(monthOf(today))
  const [from, setFrom] = React.useState(month?.from ?? today)
  const [to, setTo] = React.useState(month?.to ?? today)
  const [groupId, setGroupId] = React.useState<string>(searchParams?.get('groupId') ?? '')
  const teams = useTeams()
  const items = teams.data
  // A `?groupId=` outside the list (an inactive team, another club's id) selects nothing, never a different team.
  const selected = groupId ? items?.find((team) => team.id === groupId) : items?.[0]
  const periodValid = isPzpnPeriod(from, to)
  const ready = periodValid && selected !== undefined

  let body: React.ReactNode
  if (!items && teams.isFetching) {
    body = <MemberSkeleton shape="rows" label={t('activities.club.pzpn.loading')} />
  } else if (!items) {
    body = (
      <ErrorMessage
        label={t('activities.club.pzpn.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void teams.refetch()}>
            {t('activities.club.actions.retry')}
          </Button>
        }
      />
    )
  } else if (items.length === 0) {
    body = (
      <p className="text-muted-foreground" data-testid="club-pzpn-empty">
        {t('activities.club.pzpn.empty')}
      </p>
    )
  } else {
    const download = (kind: PzpnExportKind, label: string) =>
      ready && selected ? (
        <Button asChild className="min-h-11" variant={kind === 'schedule' ? 'default' : 'outline'}>
          <a href={exportUrl(kind, selected.id, from, to)} download data-testid={`club-pzpn-${kind}`}>
            {label}
          </a>
        </Button>
      ) : (
        <Button
          type="button"
          className="min-h-11"
          variant={kind === 'schedule' ? 'default' : 'outline'}
          disabled
          data-testid={`club-pzpn-${kind}`}
        >
          {label}
        </Button>
      )
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-team`}>{t('activities.club.pzpn.team')}</Label>
          <select
            id={`${id}-team`}
            className="border-input bg-background focus-visible:ring-ring min-h-11 rounded-md border px-3 text-base focus-visible:ring-2 focus-visible:outline-none"
            value={selected?.id ?? ''}
            onChange={(event) => {
              setGroupId(event.target.value)
            }}
            aria-invalid={!selected}
            data-testid="club-pzpn-team"
          >
            {selected ? null : (
              <option value="" disabled>
                {t('activities.club.pzpn.chooseTeam')}
              </option>
            )}
            {items.map((team) => (
              <option key={team.id} value={team.id}>
                {team.sectionName ? `${team.name} — ${team.sectionName}` : team.name}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="mb-1 text-sm font-medium">{t('activities.club.pzpn.period')}</legend>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-from`}>{t('activities.club.pzpn.from')}</Label>
            <Input
              id={`${id}-from`}
              type="date"
              className="min-h-11"
              value={from}
              aria-invalid={!periodValid}
              aria-describedby={periodValid ? undefined : `${id}-period-problem`}
              onChange={(event) => {
                setFrom(event.target.value)
              }}
              data-testid="club-pzpn-from"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-to`}>{t('activities.club.pzpn.to')}</Label>
            <Input
              id={`${id}-to`}
              type="date"
              className="min-h-11"
              value={to}
              aria-invalid={!periodValid}
              aria-describedby={periodValid ? undefined : `${id}-period-problem`}
              onChange={(event) => {
                setTo(event.target.value)
              }}
              data-testid="club-pzpn-to"
            />
          </div>
        </fieldset>
        {periodValid ? null : (
          <Alert style="light" status="warning" id={`${id}-period-problem`} data-testid="club-pzpn-period-invalid">
            {t('activities.club.pzpn.periodInvalid')}
          </Alert>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          {download('schedule', t('activities.club.pzpn.schedule'))}
          {download('attendance', t('activities.club.pzpn.attendance'))}
        </div>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="club-pzpn-heading">
      <h1 id="club-pzpn-heading" className="text-xl font-semibold">
        {t('activities.club.pzpn.title')}
      </h1>
      <p className="text-muted-foreground text-sm">{t('activities.club.pzpn.intro')}</p>
      {body}
    </section>
  )
}

export function ClubPzpnPage() {
  const t = useT()
  return <ActivitiesClubFrame>{() => <PzpnExports t={t} />}</ActivitiesClubFrame>
}
