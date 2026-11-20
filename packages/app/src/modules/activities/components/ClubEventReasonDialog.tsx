'use client'
// The reason dialog of the club event record (club events spec B-T3, REQ-T01, REQ-T02; #378): "Cancel club event"
// and the cancellation of an open part ask for a reason of 3–500 characters. The host sends it (with the lock token)
// and either closes the dialog or answers the message to show; Cmd/Ctrl+Enter confirms, Escape closes.
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CLUB_EVENT_REASON_MAX, CLUB_EVENT_REASON_MIN } from '../lib/club-events'
import { DialogContent } from '@/components/ui/dialog'

export function ClubEventReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  testId,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel: string
  testId: string
  /** Sends the reason; answers null when done (the host closes the dialog) or the problem to show. */
  onConfirm: (reason: string) => Promise<string | null>
}) {
  const t = useT()
  const reasonId = React.useId()
  const problemId = React.useId()
  const [reason, setReason] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)

  const close = (next: boolean) => {
    if (!next) {
      setReason('')
      setProblem(null)
    }
    onOpenChange(next)
  }

  const submit = async () => {
    if (pending) return
    if (reason.trim().length < CLUB_EVENT_REASON_MIN) {
      setProblem(t('activities.occurrences.cancel.reasonRequired'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      const answer = await onConfirm(reason.trim())
      if (answer) setProblem(answer)
      else setReason('')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        closeAriaLabel={t('activities.common.close')}
        data-testid={testId}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={reasonId}>{t('activities.occurrences.cancel.reason')}</Label>
          <Textarea
            id={reasonId}
            data-testid={`${testId}-reason`}
            required
            aria-required
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? problemId : undefined}
            maxLength={CLUB_EVENT_REASON_MAX}
            rows={3}
            value={reason}
            disabled={pending}
            onChange={(event) => {
              setReason(event.target.value)
            }}
          />
          {problem ? (
            <p id={problemId} className="text-destructive text-sm" role="alert">
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
            variant="destructive-solid"
            data-testid={`${testId}-confirm`}
            disabled={pending}
            onClick={() => {
              void submit()
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
