'use client'
// The decision sheets of an application in phase 2 (sign-up form spec M-J3, REQ-J12, REQ-J15, DD-J09; #799):
// - Waiting list: one of the section's groups (name, "x / limit", the age fit, "full"), the chosen group preselected;
//   the answer names the waiting number;
// - Reject: the reason (required, at most 500 characters), which the applicant sees in the e-mail and on the status page.
// - Trial session (phase 4, #801): the group (the chosen one preselected) and one of its next 10 planned sessions (date,
//   time, place) from `activities`; the applicant gets the date by e-mail.
// All send the `updatedAt` the page was read with. A 409 (changed by someone else, or decided meanwhile) and a 404 close
// the sheet and hand the outcome to the page, which offers the reload; a refused input stays in the sheet.
import * as React from 'react'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@open-mercato/ui/primitives/sheet'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton, StatusTag, browserTimeZone, useClubTimeZone } from '@vereino/ui'
import { SheetContent } from '@/components/ui/dialog'
import { REASON_MAX } from '../../lib/applications'
import {
  proposeTrial,
  rejectApplication,
  sessionLabel,
  useTrialSessions,
  waitApplication,
  type ApplicationDetail,
  type DecisionOutcome,
} from './applications-client'

export type SheetSide = 'bottom' | 'right'

type SheetProps = {
  application: ApplicationDetail
  open: boolean
  side: SheetSide
  onOpenChange: (open: boolean) => void
  /** Every outcome but a refused input, which the sheet shows itself. */
  onOutcome: (outcome: DecisionOutcome) => void
}

const SHEET_CLASS: Record<SheetSide, string> = {
  bottom: 'max-h-dvh rounded-t-xl',
  right: 'w-full sm:max-w-md',
}

function invalidMessage(t: ReturnType<typeof useT>, code: string | null, fallback: string): string {
  if (code === 'application_group_invalid') return t('enrolment.errors.application_group_invalid')
  if (code === 'decision_reason_required') return t('enrolment.errors.decision_reason_required')
  if (code === 'trial_session_invalid') return t('enrolment.errors.trial_session_invalid')
  return fallback
}

export function WaitingSheet({ application, open, side, onOpenChange, onOutcome }: SheetProps) {
  const t = useT()
  const id = React.useId()
  const initial =
    application.groupId && application.groups.some((group) => group.id === application.groupId)
      ? application.groupId
      : null
  const [groupId, setGroupId] = React.useState<string | null>(initial)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const submit = async () => {
    if (pending) return
    if (!groupId) {
      setProblem(t('enrolment.club.waiting.chooseGroup'))
      return
    }
    setPending(true)
    setProblem(null)
    const outcome = await waitApplication(application.id, groupId, application.updatedAt)
    setPending(false)
    if (outcome.status === 'invalid') {
      setProblem(invalidMessage(t, outcome.code, t('enrolment.club.errors.decision')))
      return
    }
    if (outcome.status === 'error') {
      setProblem(t('enrolment.club.errors.decision'))
      return
    }
    onOutcome(outcome)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <SheetContent
        side={side}
        className={SHEET_CLASS[side]}
        closeLabel={t('enrolment.club.actions.close')}
        data-testid="enrolment-waiting-sheet"
      >
        <SheetHeader>
          <SheetTitle>{t('enrolment.club.waiting.title')}</SheetTitle>
          <SheetDescription>{t('enrolment.club.waiting.help')}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4">
          {application.groups.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('enrolment.club.waiting.noGroups')}</p>
          ) : (
            <fieldset className="flex flex-col gap-2" aria-describedby={problem ? `${id}-problem` : undefined}>
              <legend className="mb-1 text-sm font-medium">{t('enrolment.club.waiting.group')}</legend>
              {application.groups.map((group) => {
                const checked = groupId === group.id
                return (
                  <label
                    key={group.id}
                    htmlFor={`${id}-${group.id}`}
                    className={`flex min-h-11 cursor-pointer flex-col gap-1 rounded-lg border p-3 ${checked ? 'border-primary bg-muted' : ''}`}
                    data-testid="enrolment-waiting-group"
                    data-group-id={group.id}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        id={`${id}-${group.id}`}
                        type="radio"
                        name={`${id}-group`}
                        className="size-5"
                        value={group.id}
                        checked={checked}
                        onChange={() => {
                          setGroupId(group.id)
                          setProblem(null)
                        }}
                      />
                      <span className="font-medium">{group.name}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 ps-7 text-sm">
                      <span className="text-muted-foreground tabular-nums">
                        {group.placesLimit === null
                          ? t('enrolment.club.waiting.places', { occupied: group.occupied })
                          : t('enrolment.club.waiting.placesOf', {
                              occupied: group.occupied,
                              limit: group.placesLimit,
                            })}
                      </span>
                      {group.full ? <StatusTag status="warning">{t('enrolment.club.waiting.full')}</StatusTag> : null}
                      {group.ageFit === 'outside' ? (
                        <StatusTag status="warning">{t('enrolment.flags.outside_age')}</StatusTag>
                      ) : null}
                      {group.ageFit === 'fits' ? (
                        <StatusTag status="success">{t('enrolment.club.waiting.fits')}</StatusTag>
                      ) : null}
                    </span>
                  </label>
                )
              })}
            </fieldset>
          )}
          {problem ? (
            <Alert style="light" status="error" id={`${id}-problem`}>
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            disabled={pending}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('enrolment.club.actions.cancel')}
          </Button>
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            disabled={pending || application.groups.length === 0}
            data-testid="enrolment-waiting-submit"
            onClick={() => {
              void submit()
            }}
          >
            {pending ? t('enrolment.club.actions.saving') : t('enrolment.club.waiting.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export function RejectSheet({ application, open, side, onOpenChange, onOutcome }: SheetProps) {
  const t = useT()
  const id = React.useId()
  const [reason, setReason] = React.useState('')
  const [problem, setProblem] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const submit = async () => {
    if (pending) return
    const text = reason.trim()
    if (!text) {
      setProblem(t('enrolment.errors.decision_reason_required'))
      return
    }
    setPending(true)
    setProblem(null)
    const outcome = await rejectApplication(application.id, text, application.updatedAt)
    setPending(false)
    if (outcome.status === 'invalid') {
      setProblem(invalidMessage(t, outcome.code, t('enrolment.club.errors.decision')))
      return
    }
    if (outcome.status === 'error') {
      setProblem(t('enrolment.club.errors.decision'))
      return
    }
    onOutcome(outcome)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <SheetContent
        side={side}
        className={SHEET_CLASS[side]}
        closeLabel={t('enrolment.club.actions.close')}
        data-testid="enrolment-reject-sheet"
      >
        <SheetHeader>
          <SheetTitle>{t('enrolment.club.reject.title')}</SheetTitle>
          <SheetDescription>{t('enrolment.club.reject.help')}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-4">
          <Label htmlFor={`${id}-reason`}>{t('enrolment.club.reject.reason')}</Label>
          <Textarea
            id={`${id}-reason`}
            value={reason}
            maxLength={REASON_MAX}
            rows={5}
            required
            aria-invalid={problem ? true : undefined}
            aria-describedby={`${id}-count${problem ? ` ${id}-problem` : ''}`}
            onChange={(event) => {
              setReason(event.target.value)
              setProblem(null)
            }}
            data-testid="enrolment-reject-reason"
          />
          <p id={`${id}-count`} className="text-muted-foreground text-xs tabular-nums">
            {t('enrolment.club.reject.count', { count: reason.length, max: REASON_MAX })}
          </p>
          {problem ? (
            <Alert style="light" status="error" id={`${id}-problem`}>
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            disabled={pending}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('enrolment.club.actions.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11 w-full sm:w-auto"
            disabled={pending}
            data-testid="enrolment-reject-submit"
            onClick={() => {
              void submit()
            }}
          >
            {pending ? t('enrolment.club.actions.saving') : t('enrolment.club.reject.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export function TrialSheet({ application, open, side, onOpenChange, onOutcome }: SheetProps) {
  const t = useT()
  const locale = useLocale()
  const timeZone = useClubTimeZone() ?? browserTimeZone()
  const id = React.useId()
  const initialGroup =
    application.groupId && application.groups.some((group) => group.id === application.groupId)
      ? application.groupId
      : (application.groups.at(0)?.id ?? null)
  const [groupId, setGroupId] = React.useState<string | null>(initialGroup)
  const [occurrenceId, setOccurrenceId] = React.useState<string | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const sessions = useTrialSessions(application.id, groupId)

  const submit = async () => {
    if (pending) return
    if (!groupId || !occurrenceId) {
      setProblem(t('enrolment.club.trial.chooseSession'))
      return
    }
    setPending(true)
    setProblem(null)
    const outcome = await proposeTrial(application.id, {
      occurrenceId,
      groupId: groupId === application.groupId ? null : groupId,
      updatedAt: application.updatedAt,
    })
    setPending(false)
    if (outcome.status === 'invalid') {
      setProblem(invalidMessage(t, outcome.code, t('enrolment.club.errors.decision')))
      return
    }
    if (outcome.status === 'error') {
      setProblem(t('enrolment.club.errors.decision'))
      return
    }
    onOutcome(outcome)
  }

  const items = sessions.data?.items ?? []
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <SheetContent
        side={side}
        className={SHEET_CLASS[side]}
        closeLabel={t('enrolment.club.actions.close')}
        data-testid="enrolment-trial-sheet"
      >
        <SheetHeader>
          <SheetTitle>{t('enrolment.club.trial.title')}</SheetTitle>
          <SheetDescription>{t('enrolment.club.trial.help')}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4">
          {application.groups.length > 1 || !application.groupId ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${id}-group`}>{t('enrolment.club.trial.group')}</Label>
              <select
                id={`${id}-group`}
                className="border-input bg-background min-h-11 rounded-md border px-3 text-sm"
                value={groupId ?? ''}
                data-testid="enrolment-trial-group"
                onChange={(event) => {
                  setGroupId(event.target.value || null)
                  setOccurrenceId(null)
                  setProblem(null)
                }}
              >
                {application.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {!groupId ? (
            <p className="text-muted-foreground text-sm">{t('enrolment.club.waiting.noGroups')}</p>
          ) : sessions.isLoading ? (
            <MemberSkeleton shape="rows" label={t('enrolment.club.trial.loading')} />
          ) : sessions.isError ? (
            <Alert style="light" status="error">
              <AlertDescription>
                <div className="flex flex-col items-start gap-2">
                  <span>{t('enrolment.club.trial.loadFailed')}</span>
                  <Button type="button" variant="outline" className="min-h-11" onClick={() => void sessions.refetch()}>
                    {t('enrolment.club.actions.retry')}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground text-sm" data-testid="enrolment-trial-none">
              {t('enrolment.club.trial.none')}
            </p>
          ) : (
            <fieldset className="flex flex-col gap-2" aria-describedby={problem ? `${id}-problem` : undefined}>
              <legend className="mb-1 text-sm font-medium">{t('enrolment.club.trial.session')}</legend>
              {items.map((session) => {
                const checked = occurrenceId === session.occurrenceId
                return (
                  <label
                    key={session.occurrenceId}
                    htmlFor={`${id}-${session.occurrenceId}`}
                    className={`flex min-h-11 cursor-pointer flex-col gap-1 rounded-lg border p-3 ${checked ? 'border-primary bg-muted' : ''}`}
                    data-testid="enrolment-trial-session"
                    data-occurrence-id={session.occurrenceId}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        id={`${id}-${session.occurrenceId}`}
                        type="radio"
                        name={`${id}-session`}
                        className="size-5"
                        value={session.occurrenceId}
                        checked={checked}
                        onChange={() => {
                          setOccurrenceId(session.occurrenceId)
                          setProblem(null)
                        }}
                      />
                      <span className="font-medium">{sessionLabel(session, locale, timeZone)}</span>
                    </span>
                    {session.placeLabel || session.activityName ? (
                      <span className="text-muted-foreground ps-7 text-sm">
                        {[session.activityName, session.placeLabel].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </label>
                )
              })}
            </fieldset>
          )}
          {problem ? (
            <Alert style="light" status="error" id={`${id}-problem`}>
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            disabled={pending}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('enrolment.club.actions.cancel')}
          </Button>
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            disabled={pending || items.length === 0}
            data-testid="enrolment-trial-submit"
            onClick={() => {
              void submit()
            }}
          >
            {pending ? t('enrolment.club.actions.saving') : t('enrolment.club.trial.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
