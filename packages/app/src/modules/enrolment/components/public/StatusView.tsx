'use client'
// `/p/[clubSlug]/applications/status/[token]` — "Your application" (sign-up form spec P-J4, DD-J07, J-J06; #799): the
// applicant's status link. On load the page posts the token in the body (read only, spends nothing) and shows the
// state in words, the section, the group, the number on the waiting list, the reject reason and the dates; while the
// application is open, "Withdraw application" with a confirmation dialog. An expired, unknown or foreign link shows
// "the link no longer works" with "Send me a new link" (an e-mail field; the answer is the same for any address).
// The token is never rendered or logged; the server sends this path with `Referrer-Policy: no-referrer`.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusTag, type StatusTagStatus } from '@vereino/ui'
import { DialogContent } from '@/components/ui/dialog'
import { emailBodySchema } from '../../data/validators'
import {
  PublicEnrolmentError,
  PublicEnrolmentFrame,
  PublicEnrolmentLoading,
  PublicEnrolmentNotice,
  tooManyText,
} from './PublicEnrolmentFrame'
import {
  formatInstantDate,
  loadStatus,
  requestNewLink,
  statusQueryKey,
  usePublicClub,
  withdrawApplication,
  type ApplicationStatus,
  type PublicEnrolmentClub,
  type UniformOutcome,
} from './public-client'

const STATE_TONE: Record<string, StatusTagStatus> = {
  new: 'info',
  trial: 'info',
  waiting: 'warning',
  accepted: 'success',
  rejected: 'error',
  withdrawn: 'neutral',
  expired: 'neutral',
}

function NewLinkForm({ clubSlug }: { clubSlug: string }) {
  const t = useT()
  const [email, setEmail] = React.useState('')
  const [invalid, setInvalid] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [outcome, setOutcome] = React.useState<UniformOutcome | { status: 'network' } | null>(null)
  const submit = async () => {
    if (!emailBodySchema.safeParse({ email }).success) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setPending(true)
    try {
      setOutcome(await requestNewLink(clubSlug, email))
    } catch {
      setOutcome({ status: 'network' })
    } finally {
      setPending(false)
    }
  }
  if (outcome?.status === 'sent') {
    return (
      <Alert style="light" status="success" data-testid="enrolment-new-link-sent">
        <AlertTitle>{t('enrolment.public.status.newLink.sentTitle')}</AlertTitle>
        <AlertDescription>{t('enrolment.public.status.newLink.sentText')}</AlertDescription>
      </Alert>
    )
  }
  return (
    <form
      className="bg-card flex flex-col gap-3 rounded-lg border p-4"
      noValidate
      data-testid="enrolment-new-link-form"
      aria-labelledby="enrolment-new-link-title"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <h2 id="enrolment-new-link-title" className="text-lg font-semibold">
        {t('enrolment.public.status.newLink.title')}
      </h2>
      <p className="text-muted-foreground max-w-prose text-sm">{t('enrolment.public.status.newLink.text')}</p>
      <div className="flex flex-col gap-1">
        <Label htmlFor="enrolment-new-link-email">{t('enrolment.public.fields.email')}</Label>
        <Input
          id="enrolment-new-link-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          required
          className="min-h-11"
          value={email}
          data-testid="enrolment-new-link-email"
          {...(invalid ? { 'aria-invalid': true, 'aria-describedby': 'enrolment-new-link-error' } : {})}
          onChange={(event) => {
            setEmail(event.target.value)
            setInvalid(false)
          }}
        />
        {invalid ? (
          <p
            id="enrolment-new-link-error"
            className="text-destructive text-sm"
            role="alert"
            data-testid="enrolment-field-error-email"
          >
            {t('enrolment.public.errors.field.email')}
          </p>
        ) : null}
      </div>
      {outcome?.status === 'too_many' ? (
        <p className="text-destructive text-sm" role="alert">
          {tooManyText(t, outcome.retryAfter)}
        </p>
      ) : null}
      {outcome?.status === 'failed' || outcome?.status === 'network' ? (
        <p className="text-destructive text-sm" role="alert">
          {t('enrolment.public.errors.failed')}
        </p>
      ) : null}
      <p>
        <Button type="submit" className="min-h-11" disabled={pending} data-testid="enrolment-new-link-submit">
          {pending ? t('enrolment.public.actions.sending') : t('enrolment.public.status.newLink.submit')}
        </Button>
      </p>
    </form>
  )
}

function ExpiredView({ clubSlug, club }: { clubSlug: string; club: PublicEnrolmentClub | null }) {
  const t = useT()
  return (
    <PublicEnrolmentFrame club={club}>
      <PublicEnrolmentNotice
        title={t('enrolment.public.status.expired.title')}
        message={t('enrolment.public.status.expired.text')}
        testId="enrolment-status-expired"
      />
      <NewLinkForm clubSlug={clubSlug} />
    </PublicEnrolmentFrame>
  )
}

function Details({ view }: { view: ApplicationStatus }) {
  const t = useT()
  const locale = useLocale()
  const rows: Array<[string, string, string]> = [['section', t('enrolment.public.status.section'), view.sectionName]]
  rows.push([
    'group',
    t('enrolment.public.status.group'),
    view.groupName ?? t('enrolment.public.status.groupChooseForUs'),
  ])
  if (view.waitingNumber !== null) {
    rows.push(['waiting', t('enrolment.public.status.waitingNumber'), String(view.waitingNumber)])
  }
  if (view.trial) {
    // Phase 4 (#801): the proposed trial session in the club's zone, with the place.
    const when = new Intl.DateTimeFormat(locale, {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: view.trial.timeZone,
    }).format(new Date(view.trial.startAt))
    rows.push(['trial', t('enrolment.public.status.trial'), when])
    if (view.trial.placeLabel) rows.push(['trialPlace', t('enrolment.public.status.trialPlace'), view.trial.placeLabel])
  }
  if (view.confirmedAt) {
    rows.push(['confirmed', t('enrolment.public.status.confirmedAt'), formatInstantDate(view.confirmedAt, locale)])
  }
  if (view.decidedAt) {
    rows.push(['decided', t('enrolment.public.status.decidedAt'), formatInstantDate(view.decidedAt, locale)])
  }
  if (view.closedAt && view.closedAt !== view.decidedAt) {
    rows.push(['closed', t('enrolment.public.status.closedAt'), formatInstantDate(view.closedAt, locale)])
  }
  if (view.decisionReason) {
    rows.push(['reason', t('enrolment.public.status.reason'), view.decisionReason])
  }
  return (
    <dl
      className="bg-card grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border p-4 text-sm sm:grid-cols-3"
      data-testid="enrolment-status-details"
    >
      {rows.map(([key, label, value]) => (
        <React.Fragment key={key}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-words whitespace-pre-line sm:col-span-2" data-testid={`enrolment-status-${key}`}>
            {value}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

type WithdrawProblem = { kind: 'conflict' } | { kind: 'tooMany'; retryAfter: number | null } | { kind: 'failed' }

export function StatusView({ clubSlug, token }: { clubSlug: string; token: string }) {
  const t = useT()
  const query = useQuery({
    queryKey: statusQueryKey(clubSlug, token),
    queryFn: () => loadStatus(clubSlug, token),
    retry: false,
  })
  const load = query.data
  // The frame of a page that could not read the application yet still shows the club.
  const club = usePublicClub(clubSlug, !load)
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<WithdrawProblem | null>(null)
  const [withdrawn, setWithdrawn] = React.useState(false)

  if (!load && query.isFetching)
    return <PublicEnrolmentLoading club={club.data ?? null} label={t('enrolment.public.status.loading')} />
  if (!load) return <PublicEnrolmentError club={club.data ?? null} onRetry={() => void query.refetch()} />
  if (load.status === 'expired') return <ExpiredView clubSlug={clubSlug} club={load.club ?? club.data ?? null} />

  const view = load.view
  const withdraw = async () => {
    setPending(true)
    setProblem(null)
    try {
      const outcome = await withdrawApplication(clubSlug, token)
      if (outcome.status === 'withdrawn') {
        setOpen(false)
        setWithdrawn(true)
        await query.refetch()
      } else if (outcome.status === 'conflict') {
        setOpen(false)
        setProblem({ kind: 'conflict' })
        await query.refetch()
      } else if (outcome.status === 'expired') {
        setOpen(false)
        await query.refetch()
      } else if (outcome.status === 'too_many') {
        setProblem({ kind: 'tooMany', retryAfter: outcome.retryAfter })
      } else {
        setProblem({ kind: 'failed' })
      }
    } catch {
      setProblem({ kind: 'failed' })
    } finally {
      setPending(false)
    }
  }

  const problemText =
    problem?.kind === 'conflict'
      ? t('enrolment.public.status.withdraw.conflict')
      : problem?.kind === 'tooMany'
        ? tooManyText(t, problem.retryAfter)
        : problem
          ? t('enrolment.public.errors.failed')
          : null

  return (
    <PublicEnrolmentFrame club={view.club}>
      <section className="flex flex-col gap-4" aria-labelledby="enrolment-status-title" data-testid="enrolment-status">
        <h1 id="enrolment-status-title" className="text-2xl font-semibold">
          {t('enrolment.public.status.title')}
        </h1>
        <div className="flex flex-col gap-2" aria-live="polite">
          <span data-testid="enrolment-status-state" data-state={view.state} className="self-start">
            <StatusTag status={STATE_TONE[view.state] ?? 'neutral'}>
              {t(`enrolment.public.status.state.${view.state}`)}
            </StatusTag>
          </span>
          <p className="max-w-prose">{t(`enrolment.public.status.explain.${view.state}`, { days: view.answerDays })}</p>
          {withdrawn ? (
            <p className="text-sm" data-testid="enrolment-withdrawn">
              {t('enrolment.public.status.withdraw.done')}
            </p>
          ) : null}
          {problemText && !open ? (
            <p className="text-destructive text-sm" role="alert" data-testid="enrolment-withdraw-problem">
              {problemText}
            </p>
          ) : null}
        </div>
        <Details view={view} />
        {view.canWithdraw ? (
          <p>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              data-testid="enrolment-withdraw"
              onClick={() => {
                setProblem(null)
                setOpen(true)
              }}
            >
              {t('enrolment.public.status.withdraw.button')}
            </Button>
          </p>
        ) : null}
      </section>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next)
        }}
      >
        <DialogContent
          closeAriaLabel={t('enrolment.public.status.withdraw.cancel')}
          data-testid="enrolment-withdraw-dialog"
        >
          <DialogHeader>
            <DialogTitle>{t('enrolment.public.status.withdraw.title')}</DialogTitle>
            <DialogDescription>
              {t('enrolment.public.status.withdraw.text', { section: view.sectionName })}
            </DialogDescription>
          </DialogHeader>
          {problemText ? (
            <p className="text-destructive text-sm" role="alert">
              {problemText}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() => {
                setOpen(false)
              }}
            >
              {t('enrolment.public.status.withdraw.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={pending}
              data-testid="enrolment-withdraw-confirm"
              onClick={() => void withdraw()}
            >
              {pending ? t('enrolment.public.status.withdraw.pending') : t('enrolment.public.status.withdraw.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicEnrolmentFrame>
  )
}
