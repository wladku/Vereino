'use client'
// `/club/profile/leave` (people life-cycle spec *UI* row and wireframe, REQ-L03, J-L02 step 1, AC-L04; phase L4, #306):
// a guardian, an adult participant or a coach asks to leave the club from the phone — who leaves (themself and/or
// their wards, a `fieldset` with a legend), the last day, "Also delete our data", a note — and sends it through
// `POST /api/people/me/departure-requests`. The club decides, and the page says so. An open request is shown instead
// of the form, with "Withdraw"; a declined one shows its reason. A minor has no form (and no link on the profile). A
// coach reads one extra line: the club hands the sessions over and settles the cash they hold. 375 px: one column,
// the submit bar sticks above the bottom navigation; touch targets at least 44 px.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { calendarDateInZone, errorCodeOf } from '@vereino/core'
import { retryAfterMinutes } from '../../lib/account-limits'
import { mayFileDepartureRequest } from '../../lib/departure-rules'
import { ClubFrame } from './ClubFrame'
import { CLUB_PROFILE_HREF, formatCalendarDate, fullName, type MemberProfile } from './member-client'

type MemberRequest = {
  id: string
  batchId: string
  subjectPersonId: string
  subjectName: string
  requestedLastDay: string | null
  erasureRequested: boolean
  status: 'open' | 'done' | 'declined'
  declineReason: string | null
  createdAt: string
}

const REQUESTS_API = '/api/people/me/departure-requests'

/** Whether the member leads sessions (a coach role or the coach context): they read the hand-over line. */
function isCoach(profile: MemberProfile): boolean {
  return profile.roles.some((role) => role.role === 'coach') || profile.contexts.includes('coach')
}

export function ClubLeavePage() {
  return <ClubFrame skeleton="fields">{(profile) => <LeaveContent profile={profile} />}</ClubFrame>
}

function LeaveContent({ profile }: { profile: MemberProfile }) {
  const t = useT()
  const locale = useLocale()
  const today = calendarDateInZone(new Date(), profile.club.timezone)
  const requests = useQuery({
    queryKey: ['people-me-departure-requests'],
    queryFn: async () => {
      const call = await apiCall<{ items: MemberRequest[] }>(REQUESTS_API)
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return call.result.items
    },
  })

  const header = (
    <div className="flex flex-col gap-1">
      <Link href={CLUB_PROFILE_HREF} className="text-primary inline-flex min-h-11 items-center text-sm underline">
        {t('people.club.leave.back')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('people.club.leave.title')}</h1>
      <p className="text-muted-foreground max-w-prose text-sm">{t('people.club.leave.lead')}</p>
    </div>
  )

  if (!mayFileDepartureRequest(profile.person.birthDate, today)) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Alert status="information" data-testid="club-leave-minor">
          <p className="max-w-prose">{t('people.club.leave.minor')}</p>
        </Alert>
      </div>
    )
  }
  if (requests.isLoading) return <LoadingMessage label={t('people.club.leave.loading')} />
  if (requests.error) {
    return (
      <ErrorMessage
        label={t('people.club.leave.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void requests.refetch()}>
            {t('people.club.actions.retry')}
          </Button>
        }
      />
    )
  }
  const rows = requests.data ?? []
  const open = rows.filter((row) => row.status === 'open')
  const declined = rows.filter((row) => row.status === 'declined').slice(0, 1)
  const reload = async () => {
    await requests.refetch()
  }

  return (
    <div className="flex flex-col gap-4">
      {header}
      {declined.map((row) => (
        <Alert key={row.id} status="warning" data-testid="club-leave-declined">
          <p className="max-w-prose">{t('people.club.leave.declined', { reason: row.declineReason ?? '' })}</p>
        </Alert>
      ))}
      {open.length > 0 ? (
        <OpenRequest rows={open} locale={locale} onWithdrawn={reload} />
      ) : (
        <LeaveForm profile={profile} today={today} coach={isCoach(profile)} onSent={reload} />
      )}
    </div>
  )
}

function OpenRequest({
  rows,
  locale,
  onWithdrawn,
}: {
  rows: MemberRequest[]
  locale: string
  onWithdrawn: () => Promise<void>
}) {
  const t = useT()
  const [busy, setBusy] = React.useState(false)
  const first = rows[0]
  const withdraw = async () => {
    setBusy(true)
    try {
      const call = await apiCall(`${REQUESTS_API}/${encodeURIComponent(first.batchId)}`, { method: 'DELETE' })
      if (!call.ok && call.status !== 409) throw new Error(String(call.status))
      flash(t('people.club.leave.flash.withdrawn'), 'success')
      await onWithdrawn()
    } catch {
      flash(t('people.club.leave.errors.withdraw'), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      aria-labelledby="club-leave-open"
      className="bg-card flex flex-col gap-3 rounded-lg border p-4"
      data-testid="club-leave-open"
    >
      <h2 id="club-leave-open" className="text-lg font-semibold">
        {t('people.club.leave.open.title')}
      </h2>
      <p className="text-sm">
        {t('people.club.leave.open.sentOn', { date: formatCalendarDate(first.createdAt.slice(0, 10), locale) ?? '' })}
      </p>
      <ul className="list-disc pl-5 text-sm">
        {rows.map((row) => (
          <li key={row.id}>{row.subjectName}</li>
        ))}
      </ul>
      <p className="text-sm">
        {first.requestedLastDay
          ? t('people.club.leave.open.lastDay', { date: formatCalendarDate(first.requestedLastDay, locale) ?? '' })
          : t('people.club.leave.open.noLastDay')}
      </p>
      {first.erasureRequested ? <p className="text-sm">{t('people.club.leave.open.erasure')}</p> : null}
      <p className="text-muted-foreground text-sm">{t('people.club.leave.clubDecides')}</p>
      <div>
        <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void withdraw()}>
          {t('people.club.leave.withdraw')}
        </Button>
      </div>
    </section>
  )
}

function LeaveForm({
  profile,
  today,
  coach,
  onSent,
}: {
  profile: MemberProfile
  today: string
  coach: boolean
  onSent: () => Promise<void>
}) {
  const t = useT()
  const people = [
    { id: profile.person.id, label: t('people.club.leave.me', { name: fullName(profile.person) }) },
    ...profile.wards.map((ward) => ({ id: ward.personId, label: fullName(ward) })),
  ]
  const [selected, setSelected] = React.useState<string[]>([profile.person.id])
  const [lastDay, setLastDay] = React.useState('')
  const [erasure, setErasure] = React.useState(false)
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const pastDay = lastDay !== '' && lastDay < today

  const submit = async () => {
    if (selected.length === 0 || pastDay) return
    setBusy(true)
    setProblem(null)
    try {
      const call = await apiCall<{ error?: string; retryAfterSeconds?: number }>(REQUESTS_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subjectPersonIds: selected,
          ...(lastDay ? { lastDay } : {}),
          erasure,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      })
      if (call.status === 429) {
        const minutes = retryAfterMinutes(
          Number(call.result?.retryAfterSeconds ?? call.response.headers.get('Retry-After')),
        )
        setProblem(t('people.club.leave.errors.rateLimited', { minutes: String(minutes) }))
        return
      }
      if (call.status === 409 && errorCodeOf(call.result) === 'departure_request_exists') {
        setProblem(t('people.errors.departure_request_exists'))
        await onSent()
        return
      }
      if (!call.ok) {
        setProblem(call.result?.error ?? t('people.club.leave.errors.send'))
        return
      }
      flash(t('people.club.leave.flash.sent'), 'success')
      await onSent()
    } catch {
      setProblem(t('people.club.leave.errors.send'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-4 pb-24"
      data-testid="club-leave-form"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <fieldset className="bg-card flex flex-col gap-2 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">{t('people.club.leave.who')}</legend>
        {people.map((person) => (
          <div key={person.id} className="flex min-h-11 items-center gap-3">
            <Checkbox
              id={`club-leave-who-${person.id}`}
              checked={selected.includes(person.id)}
              disabled={busy}
              onCheckedChange={(checked) => {
                setSelected((current) =>
                  checked === true ? [...new Set([...current, person.id])] : current.filter((id) => id !== person.id),
                )
              }}
            />
            <Label htmlFor={`club-leave-who-${person.id}`}>{person.label}</Label>
          </div>
        ))}
      </fieldset>
      <div className="bg-card flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="club-leave-last-day">{t('people.club.leave.lastDay')}</Label>
          <Input
            id="club-leave-last-day"
            type="date"
            min={today}
            className="min-h-11"
            value={lastDay}
            disabled={busy}
            onChange={(event) => {
              setLastDay(event.target.value)
            }}
            aria-invalid={pastDay}
          />
          {pastDay ? (
            <p className="text-destructive text-sm" role="alert">
              {t('people.errors.departure_date_in_past')}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex min-h-11 items-center gap-3">
            <Checkbox
              id="club-leave-erasure"
              checked={erasure}
              disabled={busy}
              onCheckedChange={(checked) => {
                setErasure(checked === true)
              }}
            />
            <Label htmlFor="club-leave-erasure">{t('people.club.leave.erasure')}</Label>
          </div>
          <p className="text-muted-foreground max-w-prose text-xs">{t('people.club.leave.erasureHint')}</p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="club-leave-note">{t('people.club.leave.note')}</Label>
          <Textarea
            id="club-leave-note"
            value={note}
            maxLength={1000}
            disabled={busy}
            onChange={(event) => {
              setNote(event.target.value)
            }}
          />
        </div>
        {coach ? (
          <p className="text-sm" data-testid="club-leave-coach">
            {t('people.club.leave.coach')}
          </p>
        ) : null}
        <p className="text-muted-foreground text-sm">{t('people.club.leave.clubDecides')}</p>
      </div>
      {problem ? (
        <Alert status="error" data-testid="club-leave-problem">
          <p>{problem}</p>
        </Alert>
      ) : null}
      <div className="bg-background sticky bottom-16 z-10 -mx-4 border-t px-4 py-3 sm:bottom-0">
        <Button
          type="submit"
          className="min-h-11 w-full"
          disabled={busy || selected.length === 0 || pastDay}
          data-testid="club-leave-send"
        >
          {t('people.club.leave.send')}
        </Button>
      </div>
    </form>
  )
}
