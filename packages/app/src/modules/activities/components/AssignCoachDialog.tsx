'use client'
// "Assign substitute" / "Change coach" (README B-15, flow F-03 path A; club spec glossary *Substitution*, REQ-008;
// E06-S13 #95), shared by the sessions list row action and the session record: the coaches of the club (without the
// current one) as a radio list, where a coach with an overlapping session is disabled with "Busy: {session}"; an
// optional reason of up to 200 characters. The save sends the session's lock token; a stale token surfaces the conflict,
// a coach who became busy meanwhile (409 `occurrence_coach_conflict`) reloads the list with the message, and a session
// that was cancelled or closed meanwhile closes the dialog and refreshes the caller.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import {
  apiCallOrThrow,
  readApiResultOrThrow,
  withScopedApiRequestHeaders,
} from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { RadioGroup } from '@open-mercato/ui/primitives/radio'
import { RadioField } from '@open-mercato/ui/primitives/radio-field'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { SUBSTITUTION_REASON_MAX, type SubstituteOption } from '../lib/substitutions'
import { OWN_FORBIDDEN_STATE, dateLabel, errorMessage, instantDate, instantTime } from './client-helpers'

export type StaffableOccurrence = {
  id: string
  activityName?: string | null
  startAt: string | null
  coachPersonId: string | null
  updatedAt: string | null
}

type SubstituteOptions = { currentCoachPersonId: string | null; items: SubstituteOption[] }

export function AssignCoachDialog({
  occurrence,
  open,
  onOpenChange,
  onDone,
}: {
  occurrence: StaffableOccurrence
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const reasonId = React.useId()
  const problemId = React.useId()
  const [coachId, setCoachId] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const options = useQuery({
    queryKey: ['activities-occurrence-coach-options', occurrence.id],
    queryFn: () =>
      readApiResultOrThrow<SubstituteOptions>(
        `/api/activities/occurrences/${encodeURIComponent(occurrence.id)}/coach`,
        OWN_FORBIDDEN_STATE,
      ),
    enabled: open,
    retry: false,
  })
  const items = options.data?.items ?? []
  const title = t(
    occurrence.coachPersonId ? 'activities.substitutions.change.title' : 'activities.substitutions.assign.title',
    {
      name: occurrence.activityName ?? t('activities.occurrences.record.title'),
      date: dateLabel(t, instantDate(occurrence.startAt)),
      time: instantTime(occurrence.startAt),
    },
  )

  const close = (next: boolean) => {
    if (!next) {
      setCoachId('')
      setReason('')
      setProblem(null)
    }
    onOpenChange(next)
  }

  const submit = async () => {
    if (!coachId) {
      setProblem(t('activities.substitutions.chooseCoach'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(occurrence.updatedAt), () =>
        apiCallOrThrow(
          `/api/activities/occurrences/${encodeURIComponent(occurrence.id)}/coach`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ coachPersonId: coachId, reason: reason.trim() || null }),
          },
          { errorMessage: t('activities.substitutions.errors.assign') },
        ),
      )
      const name = items.find((item) => item.id === coachId)?.name ?? ''
      flash(t('activities.substitutions.assigned', { name }), 'success')
      close(false)
      await onDone()
    } catch (error: unknown) {
      const code = errorCodeOf(error)
      if (surfaceRecordConflict(error, t, { onRefresh: () => void onDone() })) {
        close(false)
      } else if (code === 'occurrence_not_planned') {
        flash(errorMessage(error, t('activities.substitutions.errors.assign')), 'error')
        close(false)
        await onDone()
      } else {
        // A coach who became busy meanwhile: the list shows it disabled now.
        if (code === 'occurrence_coach_conflict') {
          setCoachId('')
          void options.refetch()
        }
        setProblem(errorMessage(error, t('activities.substitutions.errors.assign')))
      }
    } finally {
      setPending(false)
    }
  }

  let list: React.ReactNode
  if (options.isLoading) list = <p className="text-muted-foreground text-sm">{t('activities.substitutions.loading')}</p>
  else if (options.isError) {
    list = (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm">{t('activities.substitutions.errors.load')}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void options.refetch()}>
          {t('activities.club.actions.retry')}
        </Button>
      </div>
    )
  } else if (items.length === 0) {
    list = <p className="text-muted-foreground text-sm">{t('activities.substitutions.empty')}</p>
  } else {
    list = (
      <RadioGroup
        value={coachId}
        aria-label={t('activities.substitutions.coach')}
        aria-describedby={problem ? problemId : undefined}
        className="flex max-h-72 flex-col gap-3 overflow-y-auto"
        onValueChange={(next: string) => {
          setCoachId(next)
          setProblem(null)
        }}
      >
        {items.map((item) => (
          <RadioField
            key={item.id}
            value={item.id}
            disabled={pending || item.busy !== null}
            data-testid="assign-coach-option"
            data-busy={item.busy ? 'true' : 'false'}
            label={item.name}
            description={
              item.busy
                ? t('activities.substitutions.busy', {
                    session: [item.busy.activityName, instantTime(item.busy.startAt)].filter(Boolean).join(' '),
                  })
                : t('activities.substitutions.free')
            }
          />
        ))}
      </RadioGroup>
    )
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        closeAriaLabel={t('activities.common.close')}
        data-testid="assign-coach-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('activities.substitutions.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {list}
          <div className="flex flex-col gap-2">
            <Label htmlFor={reasonId}>{t('activities.substitutions.reason')}</Label>
            <Input
              id={reasonId}
              data-testid="assign-coach-reason"
              maxLength={SUBSTITUTION_REASON_MAX}
              value={reason}
              disabled={pending}
              onChange={(event) => {
                setReason(event.target.value)
              }}
            />
          </div>
          {problem ? (
            <p id={problemId} className="text-destructive text-sm" role="alert" data-testid="assign-coach-problem">
              {problem}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              close(false)
            }}
          >
            {t('activities.common.back')}
          </Button>
          <Button
            type="button"
            data-testid="assign-coach-submit"
            disabled={pending || options.isLoading}
            onClick={() => {
              void submit()
            }}
          >
            {t('activities.substitutions.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
