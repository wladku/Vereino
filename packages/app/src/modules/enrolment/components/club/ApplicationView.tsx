'use client'
// One application (sign-up form spec M-J3, BR-J1, REQ-J11, REQ-J12, J-J03, J-J04, J-J05; #799), the same content on the
// member page `/club/applications/[id]` and in the back office `/backend/enrolment/applications/[id]` (B-J1): the
// participant with the age on the reference date, the kind, the guardian with tap-to-mail and tap-to-call, the trial
// wish, the experience, the note behind "Show", the flags, the possible duplicates (role and reason; a link to the person
// where the shell has a person page), the history and the reject reason. A sticky bar offers the phase-2 decisions
// **Waiting list** and **Reject** while the application is open and the caller may decide (Accept and Trial session come
// with phases 3 and 4). States: loading, not found (404, also another section's application), error with retry, and
// "changed by someone else — reload" after a 409.
import * as React from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton, browserTimeZone, useClubTimeZone, useGrantedFeatures } from '@vereino/ui'
import { FlagTags, StateTag, ageLabel, groupLabel } from './ApplicationParts'
import { RejectSheet, WaitingSheet, type SheetSide } from './DecisionSheets'
import {
  APPLICATIONS_QUERY_KEY,
  APPLICATION_QUERY_KEY,
  calendarDateLabel,
  instantDateTimeLabel,
  useApplication,
  type ApplicationDetail,
  type DecisionOutcome,
} from './applications-client'

const DECIDE_FEATURES = ['enrolment.applications.decide'] as const

export type ApplicationViewProps = {
  id: string
  /** The list the page belongs to ("Back to applications"). */
  listHref: string
  /** The page of a club person, where the shell has one (the back office); otherwise duplicates are text only. */
  personHref?: (personId: string) => string
  /** `member`: a bottom sheet and a bar above the bottom navigation; `backend`: a side sheet and a bar at the bottom. */
  shell: 'member' | 'backend'
}

type Notice = { kind: 'waiting'; number: number | null } | { kind: 'rejected' } | { kind: 'conflict' } | null

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  )
}

const LINK_CLASS = 'inline-flex min-h-11 items-center break-all underline underline-offset-4'

function Details({
  application,
  personHref,
}: {
  application: ApplicationDetail
  personHref?: (personId: string) => string
}) {
  const t = useT()
  const locale = useLocale()
  const timeZone = useClubTimeZone() ?? browserTimeZone()
  const [showNote, setShowNote] = React.useState(false)
  const noteId = React.useId()
  const empty = t('enrolment.club.empty')
  const guardian = [application.guardianFirstName, application.guardianLastName].filter(Boolean).join(' ')
  const history: [string, string | null][] = [
    ['created', application.createdAt],
    ['confirmed', application.confirmedAt],
    ['decided', application.decidedAt],
    ['closed', application.closedAt],
  ]
  return (
    <>
      <section aria-labelledby={`${noteId}-participant`} className="flex flex-col gap-3">
        <h2 id={`${noteId}-participant`} className="text-lg font-semibold">
          {t('enrolment.club.detail.participant')}
        </h2>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Fact label={t('enrolment.club.detail.kind')}>{t(`enrolment.club.kind.${application.kind}`)}</Fact>
          <Fact label={t('enrolment.club.detail.birthDate')}>
            {application.participantBirthDate ? calendarDateLabel(application.participantBirthDate, locale) : empty}
          </Fact>
          <Fact label={t('enrolment.club.detail.age')}>
            {ageLabel(t, locale, application.age, application.referenceDate)}
          </Fact>
          <Fact label={t('enrolment.club.detail.group')}>{groupLabel(t, application)}</Fact>
          <Fact label={t('enrolment.club.detail.section')}>{application.sectionName}</Fact>
          <Fact label={t('enrolment.club.detail.wantsTrial')}>
            {t(application.wantsTrial ? 'enrolment.club.yes' : 'enrolment.club.no')}
          </Fact>
          <Fact label={t('enrolment.club.detail.experience')}>
            {application.experience ? t(`enrolment.club.experience.${application.experience}`) : empty}
          </Fact>
          {application.waitingNumber !== null ? (
            <Fact label={t('enrolment.club.detail.waitingNumber')}>
              <span data-testid="enrolment-waiting-number" className="tabular-nums">
                {t('enrolment.club.list.waitingNumber', { number: application.waitingNumber })}
              </span>
            </Fact>
          ) : null}
        </dl>
      </section>

      <section aria-labelledby={`${noteId}-contact`} className="flex flex-col gap-3">
        <h2 id={`${noteId}-contact`} className="text-lg font-semibold">
          {t(application.kind === 'child' ? 'enrolment.club.detail.guardian' : 'enrolment.club.detail.contact')}
        </h2>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          {application.kind === 'child' ? (
            <Fact label={t('enrolment.club.detail.guardianName')}>{guardian || empty}</Fact>
          ) : null}
          <Fact label={t('enrolment.club.detail.email')}>
            {application.email ? (
              <a href={`mailto:${application.email}`} className={LINK_CLASS} data-testid="enrolment-email">
                {application.email}
              </a>
            ) : (
              empty
            )}
          </Fact>
          <Fact label={t('enrolment.club.detail.phone')}>
            {application.phone ? (
              <a href={`tel:${application.phone}`} className={LINK_CLASS} data-testid="enrolment-phone">
                {application.phone}
              </a>
            ) : (
              empty
            )}
          </Fact>
        </dl>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t('enrolment.club.detail.note')}</h3>
          {application.note ? (
            <>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  aria-expanded={showNote}
                  aria-controls={`${noteId}-note`}
                  data-testid="enrolment-note-toggle"
                  onClick={() => {
                    setShowNote((current) => !current)
                  }}
                >
                  {t(showNote ? 'enrolment.club.detail.hideNote' : 'enrolment.club.detail.showNote')}
                </Button>
              </div>
              {showNote ? (
                <p id={`${noteId}-note`} className="bg-muted/50 rounded-md border p-3 text-sm whitespace-pre-wrap">
                  {application.note}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">{t('enrolment.club.detail.noNote')}</p>
          )}
        </div>
      </section>

      {application.duplicates.length > 0 ? (
        <section aria-labelledby={`${noteId}-duplicates`} className="flex flex-col gap-2">
          <h2 id={`${noteId}-duplicates`} className="text-lg font-semibold">
            {t('enrolment.club.detail.duplicates')}
          </h2>
          <ul className="flex flex-col gap-1 text-sm" data-testid="enrolment-duplicates">
            {application.duplicates.map((duplicate) => {
              const text = t('enrolment.club.detail.duplicate', {
                role: t(`enrolment.club.duplicateRole.${duplicate.role}`),
                reason: t(`enrolment.club.duplicateReason.${duplicate.reason}`),
              })
              return (
                <li
                  key={`${duplicate.role}-${duplicate.reason}-${duplicate.personId}`}
                  data-testid="enrolment-duplicate"
                >
                  {personHref ? (
                    <Link href={personHref(duplicate.personId)} className={LINK_CLASS}>
                      {text}
                    </Link>
                  ) : (
                    text
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {application.state === 'rejected' && application.decisionReason ? (
        <section aria-labelledby={`${noteId}-reason`} className="flex flex-col gap-2">
          <h2 id={`${noteId}-reason`} className="text-lg font-semibold">
            {t('enrolment.club.detail.reason')}
          </h2>
          <p className="text-sm whitespace-pre-wrap" data-testid="enrolment-decision-reason">
            {application.decisionReason}
          </p>
        </section>
      ) : null}

      <section aria-labelledby={`${noteId}-history`} className="flex flex-col gap-2">
        <h2 id={`${noteId}-history`} className="text-lg font-semibold">
          {t('enrolment.club.detail.history')}
        </h2>
        <ol className="flex flex-col gap-1 text-sm" data-testid="enrolment-history">
          {history
            .filter((entry): entry is [string, string] => Boolean(entry[1]))
            .map(([step, at]) => (
              <li key={step} className="flex flex-wrap gap-x-2">
                <span className="font-medium">
                  {step === 'closed'
                    ? t('enrolment.club.history.closedAs', { state: t(`enrolment.states.${application.state}`) })
                    : t(`enrolment.club.history.${step}`)}
                </span>
                <span className="text-muted-foreground tabular-nums">{instantDateTimeLabel(at, locale, timeZone)}</span>
              </li>
            ))}
        </ol>
      </section>
    </>
  )
}

export function ApplicationView({ id, listHref, personHref, shell }: ApplicationViewProps) {
  const t = useT()
  const queryClient = useQueryClient()
  const query = useApplication(id)
  const grants = useGrantedFeatures(DECIDE_FEATURES, apiCall)
  const [sheet, setSheet] = React.useState<'waiting' | 'reject' | null>(null)
  const [notice, setNotice] = React.useState<Notice>(null)
  const side: SheetSide = shell === 'member' ? 'bottom' : 'right'

  const reload = React.useCallback(async () => {
    setNotice(null)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [APPLICATION_QUERY_KEY, id] }),
      queryClient.invalidateQueries({ queryKey: [APPLICATIONS_QUERY_KEY] }),
    ])
  }, [queryClient, id])

  const back = (
    <div>
      <Link href={listHref} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
        {t('enrolment.club.detail.back')}
      </Link>
    </div>
  )

  if (!query.data && query.isFetching) {
    return <MemberSkeleton shape="fields" label={t('enrolment.club.loading')} />
  }
  if (!query.data) {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <ErrorMessage
          label={t('enrolment.club.errors.detail')}
          action={
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
              {t('enrolment.club.actions.retry')}
            </Button>
          }
        />
      </div>
    )
  }
  if (query.data.status === 'not_found') {
    return (
      <section className="flex flex-col gap-3" data-testid="enrolment-not-found">
        {back}
        <h1 className="text-xl font-semibold">{t('enrolment.club.detail.notFoundTitle')}</h1>
        <p className="text-muted-foreground">{t('enrolment.errors.application_not_found')}</p>
      </section>
    )
  }

  const application = query.data.application
  const canDecide = application.canDecide && grants['enrolment.applications.decide']

  const onOutcome = (outcome: DecisionOutcome) => {
    const decided = sheet
    setSheet(null)
    if (outcome.status === 'conflict') {
      setNotice({ kind: 'conflict' })
      return
    }
    if (outcome.status === 'not_found') {
      void reload()
      return
    }
    if (outcome.status !== 'ok') return
    if (decided === 'waiting') {
      setNotice({ kind: 'waiting', number: outcome.waitingNumber })
    } else {
      setNotice({ kind: 'rejected' })
    }
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: [APPLICATION_QUERY_KEY, id] }),
      queryClient.invalidateQueries({ queryKey: [APPLICATIONS_QUERY_KEY] }),
    ])
  }

  const barClass =
    shell === 'member'
      ? 'bg-background sticky bottom-24 z-30 -mx-4 flex flex-wrap gap-2 border-t px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:p-0'
      : 'bg-background sticky bottom-0 z-30 flex flex-wrap gap-2 border-t py-3'

  return (
    <article
      className="flex flex-col gap-6"
      aria-labelledby="enrolment-application-heading"
      data-testid="enrolment-application"
      data-id={application.id}
    >
      {back}
      <header className="flex flex-col gap-2">
        <h1 id="enrolment-application-heading" className="text-xl font-semibold break-words">
          {application.participantName || t('enrolment.club.anonymised')}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <StateTag state={application.state} />
          <span className="text-muted-foreground text-sm">{application.sectionName}</span>
        </div>
        <FlagTags flags={application.flags} />
      </header>

      {notice?.kind === 'conflict' ? (
        <Alert style="light" status="warning" data-testid="enrolment-conflict">
          <AlertTitle>{t('enrolment.club.conflict.title')}</AlertTitle>
          <AlertDescription>
            <div className="flex flex-col items-start gap-2">
              <span>{t('enrolment.club.conflict.text')}</span>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => void reload()}>
                {t('enrolment.club.conflict.reload')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      {notice?.kind === 'waiting' ? (
        <Alert style="light" status="success" data-testid="enrolment-decision-done">
          <AlertDescription>
            {notice.number === null
              ? t('enrolment.club.waiting.done')
              : t('enrolment.club.waiting.doneNumber', { number: notice.number })}
          </AlertDescription>
        </Alert>
      ) : null}
      {notice?.kind === 'rejected' ? (
        <Alert style="light" status="success" data-testid="enrolment-decision-done">
          <AlertDescription>{t('enrolment.club.reject.done')}</AlertDescription>
        </Alert>
      ) : null}

      <Details application={application} personHref={personHref} />

      {canDecide ? (
        <div className={barClass} role="group" aria-label={t('enrolment.club.detail.actions')}>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1 sm:flex-none"
            data-testid="enrolment-action-waiting"
            onClick={() => {
              setNotice(null)
              setSheet('waiting')
            }}
          >
            {t('enrolment.club.actions.waiting')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11 flex-1 sm:flex-none"
            data-testid="enrolment-action-reject"
            onClick={() => {
              setNotice(null)
              setSheet('reject')
            }}
          >
            {t('enrolment.club.actions.reject')}
          </Button>
        </div>
      ) : null}

      {sheet === 'waiting' ? (
        <WaitingSheet
          key={`waiting-${application.updatedAt}`}
          application={application}
          open
          side={side}
          onOpenChange={(open) => {
            if (!open) setSheet(null)
          }}
          onOutcome={onOutcome}
        />
      ) : null}
      {sheet === 'reject' ? (
        <RejectSheet
          key={`reject-${application.updatedAt}`}
          application={application}
          open
          side={side}
          onOpenChange={(open) => {
            if (!open) setSheet(null)
          }}
          onOutcome={onOutcome}
        />
      ) : null}
    </article>
  )
}
