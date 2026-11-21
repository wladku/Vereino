'use client'
// The "Leaving" tab of the person record (people life-cycle spec B-10 `?tab=leaving`, REQ-L03, J-L02 step 2; phase L4,
// #306), shown with `people.manage`: the person's requests to leave (Decline with a reason, Open to start the
// departure), "Record a request" for a letter or the club's own decision, and "Leaving the club" — who leaves, the
// last day, the preview (what ends, warnings, blockers, the next payer of a staying ward) reloaded on every change,
// and "Confirm leaving" (Ctrl/Cmd+Enter), disabled while a blocker or a choice remains; a stale preview (409) reloads.
// After the departure the tab shows the last day and, from that day on, "Return to the club".
// Phase L5 (REQ-L04, J-L03; #307): for a leaving coach the section "Sessions and activities" lists each group with its
// future sessions and default-coach activities and a choice — hand over to a coach or leave unassigned; "Confirm
// leaving" waits for a choice per group. Cash the coach still holds is a blocker with the amount and a link to B-33.
// Phase L6 (REQ-L05, J-L04; #308): on a former person "Anonymise" (`ErasurePanel.tsx`, with `people.persons.anonymize`)
// next to "Return to the club"; an anonymised person shows the date and the retention hold and nothing else to do;
// "Delete person" for a person created by mistake closes the tab.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import {
  apiCall,
  apiCallOrThrow,
  readApiResultOrThrow,
  withScopedApiRequestHeaders,
} from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { StatusTag, useClubToday } from '@vereino/ui'
import { errorMessage, personName, textOrNull, type PersonDetail, type Translate } from './client-helpers'
import { AnonymiseAction, AnonymisedState, DeleteAction } from './ErasurePanel'

type PlanItem = {
  module: string
  kind: string
  recordId: string
  personId: string
  action: 'end' | 'remove'
  until: string | null
  label: Record<string, string | null>
}
type PlanNotice = {
  module: string
  code: string
  personId: string
  wardPersonId?: string
  leftOn?: string
  params?: Record<string, string | number | null>
}
type HandOverNeed = {
  personId: string
  groupId: string
  groupName: string | null
  sessions: number
  activities: number
}
type PlanPerson = {
  id: string
  name: string
  leftOn: string | null
  ends: PlanItem[]
  warnings: PlanNotice[]
  blockers: PlanNotice[]
  choicesNeeded: Array<{ wardPersonId: string; personId: string; candidateGuardianPersonIds: string[] }>
  handOvers: HandOverNeed[]
}
type Plan = {
  lastDay: string
  blocked: boolean
  persons: PlanPerson[]
  suggestedPersons: Array<{ personId: string; name: string; reason: string }>
  names: Record<string, string>
  previewToken: string
}
type DepartureRequestRow = {
  id: string
  batchId: string
  subjectPersonId: string
  subjectName: string
  requestedByName: string | null
  requesterKind: 'self' | 'guardian' | 'club'
  requestedLastDay: string | null
  erasureRequested: boolean
  note: string | null
  status: 'open' | 'done' | 'declined'
  declineReason: string | null
  otherGuardianCount: number
  createdAt: string
  updatedAt: string
}

/** B-33 "Cash to settle", where the cash a leaving coach holds is accepted (#118). */
const CASH_CUSTODY_HREF = '/backend/payments/cash-custody'

/** The hand-over choice that leaves a group's sessions without a coach (the select's value). */
const UNASSIGNED = 'unassigned'

function formatAmount(grosz: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'PLN' }).format(grosz / 100)
}

function formatDay(day: string | null, locale: string): string {
  if (!day) return ''
  const date = new Date(`${day.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString(locale, { dateStyle: 'long', timeZone: 'UTC' })
}

/** One line of "Will end": what ends and until when, in the glossary's words. */
function itemText(item: PlanItem, names: Record<string, string>, t: Translate, locale: string): string {
  const until =
    item.action === 'remove'
      ? t('people.leaving.item.removed')
      : t('people.leaving.item.until', { date: formatDay(item.until, locale) })
  if (item.kind === 'account') return t('people.leaving.item.account', { date: formatDay(item.until, locale) })
  if (item.kind === 'role_assignment') {
    return `${t(`people.roles.role.${item.label.role ?? 'coach'}`)} — ${until}`
  }
  if (item.kind === 'guardianship') {
    const other = names[item.label.otherPersonId ?? ''] ?? ''
    const key = item.label.side === 'guardian' ? 'people.leaving.item.guardianOf' : 'people.leaving.item.wardOf'
    return `${t(key, { name: other })} — ${until}`
  }
  if (item.kind === 'membership') {
    const role = t(`people.leaving.membershipRole.${item.label.role ?? 'participant'}`)
    return `${item.label.groupName ?? t('people.common.empty')} — ${role} — ${until}`
  }
  if (item.kind === 'contract') {
    const kind = t(`club_core.contracts.kind.${item.label.contractKind ?? 'other'}`)
    return `${t('people.leaving.item.contract', { kind })} — ${until}`
  }
  if (item.kind === 'place_maintainer') {
    return t('people.leaving.item.placeMaintainer', { place: item.label.placeName ?? t('people.common.empty') })
  }
  return `${item.kind} — ${until}`
}

function blockerText(blocker: PlanNotice, names: Record<string, string>, t: Translate, locale: string): string {
  if (blocker.code === 'ward_without_guardian') {
    return t('people.leaving.blocker.ward_without_guardian', { name: names[blocker.wardPersonId ?? ''] ?? '' })
  }
  if (blocker.code === 'already_left') {
    return t('people.leaving.blocker.already_left', { date: formatDay(blocker.leftOn ?? null, locale) })
  }
  if (blocker.code === 'last_club_admin') return t('people.leaving.blocker.last_club_admin')
  if (blocker.code === 'cash_held') {
    return t('people.leaving.blocker.cash_held', { amount: formatAmount(Number(blocker.params?.amount ?? 0), locale) })
  }
  return t('people.leaving.blocker.other', { code: blocker.code })
}

function warningText(warning: PlanNotice, t: Translate): string {
  if (warning.code === 'open_charges') {
    return t('people.leaving.warning.open_charges', { count: Number(warning.params?.count ?? 0) })
  }
  return t('people.leaving.blocker.other', { code: warning.code })
}

export function LeavingPanel({
  person,
  onChanged,
  canAnonymize = false,
}: {
  person: PersonDetail
  onChanged: () => Promise<void>
  canAnonymize?: boolean
}) {
  const t = useT()
  const locale = useLocale()
  const today = useClubToday()
  const leftOn = person.leftOn ?? null
  const [opened, setOpened] = React.useState<{ lastDay: string | null; key: number } | null>(null)

  if (person.anonymizedAt) {
    return (
      <section className="bg-card flex flex-col gap-4 rounded-lg border p-4" aria-label={t('people.leaving.title')}>
        <SectionHeader title={t('people.leaving.title')} />
        <AnonymisedState person={person} />
      </section>
    )
  }
  return (
    <section className="bg-card flex flex-col gap-4 rounded-lg border p-4" aria-label={t('people.leaving.title')}>
      <SectionHeader title={t('people.leaving.title')} />
      <RequestsSection
        person={person}
        onOpen={(lastDay) => {
          setOpened({ lastDay, key: Date.now() })
        }}
      />
      {leftOn ? (
        <LeftSection
          person={person}
          leftOn={leftOn}
          former={leftOn <= today}
          canAnonymize={canAnonymize}
          onChanged={onChanged}
        />
      ) : (
        <DepartureSection
          key={opened?.key ?? 0}
          person={person}
          initialLastDay={opened?.lastDay && opened.lastDay >= today ? opened.lastDay : today}
          today={today}
          locale={locale}
          onDone={onChanged}
        />
      )}
      <DeleteAction person={person} onChanged={onChanged} />
    </section>
  )
}

function LeftSection({
  person,
  leftOn,
  former,
  canAnonymize,
  onChanged,
}: {
  person: PersonDetail
  leftOn: string
  former: boolean
  canAnonymize: boolean
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const locale = useLocale()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [busy, setBusy] = React.useState(false)
  const returnToClub = async () => {
    const confirmed = await confirm({
      title: t('people.leaving.return.confirm'),
      text: t('people.leaving.return.confirmText'),
    })
    if (!confirmed) return
    setBusy(true)
    try {
      await apiCallOrThrow(
        `/api/people/persons/${person.id}/return`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
        { errorMessage: t('people.leaving.errors.return') },
      )
      flash(t('people.leaving.flash.returned'), 'success')
      await onChanged()
    } catch (error: unknown) {
      flash(errorMessage(error, t('people.leaving.errors.return')), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-3" data-testid="people-leaving-left">
      <div className="flex flex-wrap items-center gap-2">
        <StatusTag status={former ? 'neutral' : 'warning'}>
          {t(former ? 'people.leaving.leftOn' : 'people.leaving.leavesOn', { date: formatDay(leftOn, locale) })}
        </StatusTag>
      </div>
      {former ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void returnToClub()}>
            {t('people.leaving.return.action')}
          </Button>
          {canAnonymize ? <AnonymiseAction person={person} onDone={onChanged} /> : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t('people.leaving.undoHint')}</p>
      )}
      {ConfirmDialogElement}
    </div>
  )
}

function RequestsSection({ person, onOpen }: { person: PersonDetail; onOpen: (lastDay: string | null) => void }) {
  const t = useT()
  const locale = useLocale()
  const [recording, setRecording] = React.useState(false)
  const [declining, setDeclining] = React.useState<DepartureRequestRow | null>(null)
  const requests = useQuery({
    queryKey: ['people-departure-requests', person.id],
    queryFn: () =>
      readApiResultOrThrow<{ items: DepartureRequestRow[] }>(
        `/api/people/departure-requests?subjectPersonId=${encodeURIComponent(person.id)}&pageSize=20`,
      ),
  })
  const reload = async () => {
    await requests.refetch()
  }
  if (requests.isLoading) return <LoadingMessage label={t('people.leaving.requests.loading')} />
  if (requests.error) return <ErrorMessage label={t('people.leaving.errors.requests')} />
  const rows = requests.data?.items ?? []
  const open = rows.filter((row) => row.status === 'open')
  const declined = rows.filter((row) => row.status === 'declined')
  return (
    <div className="flex flex-col gap-3" data-testid="people-leaving-requests">
      <h3 className="text-sm font-semibold">{t('people.leaving.requests.title')}</h3>
      {open.length === 0 ? <p className="text-muted-foreground text-sm">{t('people.leaving.requests.none')}</p> : null}
      {open.map((row) => (
        <div key={row.id} className="flex flex-col gap-2 rounded-md border p-3" data-testid="people-leaving-request">
          <p className="text-sm">
            {t(`people.leaving.requests.kind.${row.requesterKind}`, {
              name: row.requestedByName ?? '',
              date: formatDay(row.createdAt.slice(0, 10), locale),
            })}
          </p>
          <p className="text-sm">
            {row.requestedLastDay
              ? t('people.leaving.requests.lastDay', { date: formatDay(row.requestedLastDay, locale) })
              : t('people.leaving.requests.noLastDay')}
            {' · '}
            {t(row.erasureRequested ? 'people.leaving.requests.erasure' : 'people.leaving.requests.noErasure')}
          </p>
          {row.otherGuardianCount > 0 ? (
            <p className="text-sm">{t('people.leaving.requests.otherGuardian', { count: row.otherGuardianCount })}</p>
          ) : null}
          {row.note ? <p className="text-muted-foreground text-sm whitespace-pre-wrap">{row.note}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeclining(row)
              }}
            >
              {t('people.leaving.requests.decline')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                onOpen(row.requestedLastDay)
              }}
            >
              {t('people.leaving.requests.open')}
            </Button>
          </div>
        </div>
      ))}
      {declined.slice(0, 3).map((row) => (
        <p key={row.id} className="text-muted-foreground text-sm">
          {t('people.leaving.requests.declined', { reason: row.declineReason ?? '' })}
        </p>
      ))}
      {declining ? (
        <DeclineForm
          request={declining}
          onClose={() => {
            setDeclining(null)
          }}
          onDone={async () => {
            setDeclining(null)
            await reload()
          }}
        />
      ) : null}
      {recording ? (
        <RecordForm
          personId={person.id}
          onClose={() => {
            setRecording(false)
          }}
          onDone={async () => {
            setRecording(false)
            await reload()
          }}
        />
      ) : open.length === 0 ? (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setRecording(true)
            }}
          >
            {t('people.leaving.requests.record')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function DeclineForm({
  request,
  onClose,
  onDone,
}: {
  request: DepartureRequestRow
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const submit = async () => {
    const text = textOrNull(reason)
    if (!text) return
    setBusy(true)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(request.updatedAt), () =>
        apiCallOrThrow(
          '/api/people/departure-requests',
          {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: request.id, reason: text }),
          },
          { errorMessage: t('people.leaving.errors.decline') },
        ),
      )
      flash(t('people.leaving.flash.declined'), 'success')
      await onDone()
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void onDone() })) {
        flash(errorMessage(error, t('people.leaving.errors.decline')), 'error')
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="flex flex-col gap-2 rounded-md border p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <Label htmlFor="people-leaving-decline-reason">{t('people.leaving.fields.declineReason')}</Label>
      <Textarea
        id="people-leaving-decline-reason"
        value={reason}
        maxLength={1000}
        disabled={busy}
        onChange={(event) => {
          setReason(event.target.value)
        }}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !textOrNull(reason)}>
          {t('people.leaving.requests.decline')}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          {t('people.leaving.actions.cancel')}
        </Button>
      </div>
    </form>
  )
}

function RecordForm({
  personId,
  onClose,
  onDone,
}: {
  personId: string
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const [kind, setKind] = React.useState<'self' | 'guardian' | 'club'>('club')
  const [lastDay, setLastDay] = React.useState('')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      await apiCallOrThrow(
        '/api/people/departure-requests',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            subjectPersonId: personId,
            requesterKind: kind,
            ...(lastDay ? { lastDay } : {}),
            ...(textOrNull(note) ? { note: textOrNull(note) } : {}),
          }),
        },
        { errorMessage: t('people.leaving.errors.record') },
      )
      flash(t('people.leaving.flash.recorded'), 'success')
      await onDone()
    } catch (error: unknown) {
      flash(errorMessage(error, t('people.leaving.errors.record')), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-md border p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="people-leaving-record-kind">{t('people.leaving.fields.requesterKind')}</Label>
        <Select
          value={kind}
          onValueChange={(value) => {
            setKind(value as typeof kind)
          }}
          disabled={busy}
        >
          <SelectTrigger id="people-leaving-record-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['self', 'guardian', 'club'] as const).map((value) => (
              <SelectItem key={value} value={value}>
                {t(`people.leaving.requesterKind.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="people-leaving-record-last-day">{t('people.leaving.fields.lastDay')}</Label>
        <Input
          id="people-leaving-record-last-day"
          type="date"
          value={lastDay}
          disabled={busy}
          onChange={(event) => {
            setLastDay(event.target.value)
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="people-leaving-record-note">{t('people.leaving.fields.note')}</Label>
        <Textarea
          id="people-leaving-record-note"
          value={note}
          maxLength={1000}
          disabled={busy}
          onChange={(event) => {
            setNote(event.target.value)
          }}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {t('people.leaving.requests.record')}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          {t('people.leaving.actions.cancel')}
        </Button>
      </div>
    </form>
  )
}

function DepartureSection({
  person,
  initialLastDay,
  today,
  locale,
  onDone,
}: {
  person: PersonDetail
  initialLastDay: string
  today: string
  locale: string
  onDone: () => Promise<void>
}) {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [selected, setSelected] = React.useState<string[]>([person.id])
  const [lastDay, setLastDay] = React.useState(initialLastDay)
  const [nextPayer, setNextPayer] = React.useState<Record<string, string>>({})
  const [handOver, setHandOver] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  const [offered, setOffered] = React.useState<Record<string, string>>({})
  const firstBlockerRef = React.useRef<HTMLDivElement | null>(null)
  const sortedIds = React.useMemo(() => [...selected].sort(), [selected])
  const preview = useQuery({
    queryKey: ['people-departure-preview', sortedIds.join(','), lastDay],
    enabled: lastDay >= today && sortedIds.length > 0,
    retry: false,
    queryFn: async () => {
      const call = await apiCall<Plan>('/api/people/departures/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personIds: sortedIds, lastDay }),
      })
      if (!call.ok || !call.result) throw new Error(t('people.leaving.errors.preview'))
      const suggested = call.result.suggestedPersons
      // The suggested persons stay offered (unticked) while the selection changes.
      setOffered((current) => {
        const next = { ...current }
        for (const row of suggested) next[row.personId] = row.name
        return next
      })
      return call.result
    },
  })
  const plan = preview.data
  React.useEffect(() => {
    if (plan?.blocked) firstBlockerRef.current?.focus()
  }, [plan?.blocked])

  const choices = plan?.persons.flatMap((row) => row.choicesNeeded) ?? []
  const handOvers = plan?.persons.flatMap((row) => row.handOvers) ?? []
  const handOverGroups = [...new Set(handOvers.map((need) => need.groupId))]
  // The coach lookup of the hand-over (any coach of the club), without the persons who leave now.
  const coaches = useQuery({
    queryKey: ['people-departure-coaches'],
    enabled: handOvers.length > 0,
    queryFn: () =>
      readApiResultOrThrow<{ items: Array<{ id: string; name: string }> }>('/api/activities/options/coaches'),
  })
  const coachOptions = (coaches.data?.items ?? []).filter((coach) => !sortedIds.includes(coach.id))
  const missingChoice =
    choices.some((choice) => !nextPayer[choice.wardPersonId]) || handOverGroups.some((groupId) => !handOver[groupId])
  const canConfirm = Boolean(plan) && !plan?.blocked && !missingChoice && !busy && !preview.isFetching

  // Ctrl/Cmd+Enter confirms (B-10 keyboard contract) while the tab is open.
  const submitRef = React.useRef<() => Promise<void>>(async () => {})
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      void submitRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const toggle = (personId: string, on: boolean) => {
    setSelected((current) => (on ? [...new Set([...current, personId])] : current.filter((id) => id !== personId)))
  }

  const submit = async () => {
    if (!plan || !canConfirm) return
    const confirmed = await confirm({
      title: t('people.leaving.confirm.title'),
      text: t('people.leaving.confirm.text', { date: formatDay(lastDay, locale) }),
      variant: 'destructive',
    })
    if (!confirmed) return
    setBusy(true)
    try {
      const call = await apiCall<{ error?: string }>('/api/people/departures', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          personIds: sortedIds,
          lastDay,
          previewToken: plan.previewToken,
          nextPayer: choices.map((choice) => ({
            wardPersonId: choice.wardPersonId,
            guardianPersonId: nextPayer[choice.wardPersonId],
          })),
          ...(handOverGroups.length > 0
            ? {
                handOver: handOverGroups.map((groupId) => ({
                  groupId,
                  toPersonId: handOver[groupId] === UNASSIGNED ? null : handOver[groupId],
                })),
              }
            : {}),
        }),
      })
      if (call.status === 409 && errorCodeOf(call.result) === 'departure_preview_stale') {
        flash(t('people.leaving.flash.stale'), 'warning')
        await preview.refetch()
        return
      }
      if (!call.ok) {
        flash(call.result?.error ?? t('people.leaving.errors.confirm'), 'error')
        await preview.refetch()
        return
      }
      flash(t('people.leaving.flash.departed'), 'success')
      await onDone()
    } catch (error: unknown) {
      flash(errorMessage(error, t('people.leaving.errors.confirm')), 'error')
    } finally {
      setBusy(false)
    }
  }

  React.useEffect(() => {
    submitRef.current = submit
  })

  const candidates = [
    { id: person.id, name: personName(person) },
    ...Object.entries(offered)
      .filter(([id]) => id !== person.id)
      .map(([id, name]) => ({ id, name })),
  ]

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="people-leaving-form"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <h3 className="text-sm font-semibold">{t('people.leaving.departure.title')}</h3>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm">{t('people.leaving.fields.who')}</legend>
        <div className="flex flex-wrap gap-4">
          {candidates.map((candidate) => (
            <div key={candidate.id} className="flex items-center gap-2">
              <Checkbox
                id={`people-leaving-who-${candidate.id}`}
                checked={selected.includes(candidate.id)}
                disabled={busy || (candidate.id === person.id && selected.length === 1)}
                onCheckedChange={(checked) => {
                  toggle(candidate.id, checked === true)
                }}
              />
              <Label htmlFor={`people-leaving-who-${candidate.id}`}>{candidate.name}</Label>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="flex max-w-xs flex-col gap-1">
        <Label htmlFor="people-leaving-last-day">{t('people.leaving.fields.lastDay')}</Label>
        <Input
          id="people-leaving-last-day"
          type="date"
          min={today}
          value={lastDay}
          disabled={busy}
          onChange={(event) => {
            setLastDay(event.target.value)
          }}
        />
        {lastDay < today ? (
          <p className="text-destructive text-sm" role="alert">
            {t('people.errors.departure_date_in_past')}
          </p>
        ) : null}
      </div>
      {preview.isLoading ? <LoadingMessage label={t('people.leaving.preview.loading')} /> : null}
      {preview.error ? <ErrorMessage label={t('people.leaving.errors.preview')} /> : null}
      {plan ? (
        <div className="flex flex-col gap-4" data-testid="people-leaving-preview">
          {plan.persons.every((row) => row.ends.length === 0) ? (
            <p className="text-muted-foreground text-sm">{t('people.leaving.preview.nothing')}</p>
          ) : (
            <table className="w-full text-sm">
              <caption className="text-muted-foreground mb-2 text-left text-xs">
                {t('people.leaving.preview.willEnd')}
              </caption>
              <tbody>
                {plan.persons.flatMap((row) =>
                  row.ends.map((item) => (
                    <tr key={`${item.module}:${item.kind}:${item.recordId}:${row.id}`} className="border-t align-top">
                      <th scope="row" className="py-1 pr-4 text-left font-normal">
                        {row.name}
                      </th>
                      <td className="py-1">{itemText(item, plan.names, t, locale)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          )}
          {plan.persons.some((row) => row.warnings.length > 0) ? (
            <Alert style="light" status="warning">
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {plan.persons.flatMap((row) =>
                    row.warnings.map((warning) => (
                      <li key={`${row.id}:${warning.code}:${warning.wardPersonId ?? ''}`}>
                        {row.name}: {warningText(warning, t)}
                      </li>
                    )),
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          {plan.blocked ? (
            <div ref={firstBlockerRef} tabIndex={-1} role="alert" data-testid="people-leaving-blockers">
              <Alert style="light" status="error">
                <AlertDescription>
                  <p className="font-semibold">{t('people.leaving.preview.blocks')}</p>
                  <ul className="list-disc pl-4">
                    {plan.persons.flatMap((row) =>
                      row.blockers.map((blocker) => (
                        <li key={`${row.id}:${blocker.code}:${blocker.wardPersonId ?? ''}`}>
                          {row.name}: {blockerText(blocker, plan.names, t, locale)}
                          {blocker.code === 'cash_held' ? (
                            <>
                              {' '}
                              <a className="underline" href={CASH_CUSTODY_HREF} data-testid="people-leaving-cash-link">
                                {t('people.leaving.blocker.cashLink')}
                              </a>
                            </>
                          ) : null}
                        </li>
                      )),
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            </div>
          ) : null}
          {handOvers.length > 0 ? (
            <table className="w-full text-sm" data-testid="people-leaving-handover">
              <caption className="text-muted-foreground mb-2 text-left text-xs">
                {t('people.leaving.handOver.title')}
              </caption>
              <thead>
                <tr className="text-left">
                  <th scope="col" className="py-1 pr-4 font-medium">
                    {t('people.leaving.handOver.group')}
                  </th>
                  <th scope="col" className="py-1 pr-4 font-medium">
                    {t('people.leaving.handOver.future')}
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    {t('people.leaving.handOver.choice')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {handOvers.map((need) => (
                  <tr key={`${need.personId}:${need.groupId}`} className="border-t align-top">
                    <th scope="row" className="py-1 pr-4 text-left font-normal">
                      {need.groupName ?? t('people.common.empty')}
                    </th>
                    <td className="py-1 pr-4">
                      {t('people.leaving.handOver.counts', { sessions: need.sessions, activities: need.activities })}
                    </td>
                    <td className="py-1">
                      <Select
                        value={handOver[need.groupId] ?? ''}
                        onValueChange={(value) => {
                          setHandOver((current) => ({ ...current, [need.groupId]: value }))
                        }}
                        disabled={busy}
                      >
                        <SelectTrigger
                          id={`people-leaving-handover-${need.groupId}`}
                          aria-label={t('people.leaving.handOver.choiceFor', {
                            group: need.groupName ?? t('people.common.empty'),
                          })}
                          data-testid="people-leaving-handover-choice"
                        >
                          <SelectValue placeholder={t('people.leaving.handOver.placeholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED}>{t('people.leaving.handOver.unassigned')}</SelectItem>
                          {coachOptions.map((coach) => (
                            <SelectItem key={coach.id} value={coach.id}>
                              {t('people.leaving.handOver.to', { name: coach.name })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {handOvers.length > 0 && coaches.error ? (
            <p className="text-muted-foreground text-sm">{t('people.leaving.handOver.coachesFailed')}</p>
          ) : null}
          {choices.map((choice) => (
            <div key={choice.wardPersonId} className="flex max-w-md flex-col gap-1">
              <Label htmlFor={`people-leaving-payer-${choice.wardPersonId}`}>
                {t('people.leaving.fields.nextPayer', { name: plan.names[choice.wardPersonId] ?? '' })}
              </Label>
              <Select
                value={nextPayer[choice.wardPersonId] ?? ''}
                onValueChange={(value) => {
                  setNextPayer((current) => ({ ...current, [choice.wardPersonId]: value }))
                }}
                disabled={busy}
              >
                <SelectTrigger id={`people-leaving-payer-${choice.wardPersonId}`}>
                  <SelectValue placeholder={t('people.leaving.fields.nextPayerPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {choice.candidateGuardianPersonIds.map((id) => (
                    <SelectItem key={id} value={id}>
                      {plan.names[id] ?? id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">{t('people.leaving.fields.nextPayerHint')}</p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="submit" variant="destructive" disabled={!canConfirm} data-testid="people-leaving-confirm">
          {t('people.leaving.actions.confirm')}
        </Button>
      </div>
      {ConfirmDialogElement}
    </form>
  )
}
