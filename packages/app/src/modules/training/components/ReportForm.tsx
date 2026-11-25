'use client'
// The report of a library entry (training outlines spec M-O8, P-O1; REQ-O15; E24-S05, #685): a reason and an optional
// note (≤ 500), sent once; used by the member entry page and the public page. States: idle, sending, sent, error.
import * as React from 'react'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { REPORT_NOTE_MAX, REPORT_REASONS, type ReportReason } from '../lib/library'
import { reportEntry } from './club/library-client'

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback

export function ReportForm({
  entryId,
  isPublic = false,
  alreadyReported = false,
  onReported,
}: {
  entryId: string
  isPublic?: boolean
  alreadyReported?: boolean
  onReported?: () => void
}) {
  const t = useT()
  const id = React.useId()
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState<ReportReason>('wrong_content')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [sent, setSent] = React.useState(alreadyReported)

  if (sent) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="training-library-reported">
        {t('training.library.report.sent')}
      </p>
    )
  }
  if (!open) {
    return (
      <div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => {
            setOpen(true)
          }}
          data-testid="training-library-report-open"
        >
          {t('training.library.report.open')}
        </Button>
      </div>
    )
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-md border p-3"
      aria-label={t('training.library.report.title')}
      onSubmit={(event) => {
        event.preventDefault()
        setBusy(true)
        void reportEntry(entryId, { reason, note: note.trim() || null }, t('training.library.report.error'), {
          public: isPublic,
        })
          .then(() => {
            setSent(true)
            flash(t('training.library.report.sent'), 'success')
            onReported?.()
          })
          .catch((error: unknown) => {
            flash(errorText(error, t('training.library.report.error')), 'error')
          })
          .finally(() => {
            setBusy(false)
          })
      }}
      data-testid="training-library-report-form"
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-reason`}>{t('training.library.report.reason')}</Label>
        <select
          id={`${id}-reason`}
          className="border-input bg-background focus-visible:ring-ring min-h-11 rounded-md border px-3 text-base focus-visible:ring-2 focus-visible:outline-none"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value as ReportReason)
          }}
          data-testid="training-library-report-reason"
        >
          {REPORT_REASONS.map((value) => (
            <option key={value} value={value}>
              {t(`training.library.report.reasons.${value}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-note`}>{t('training.library.report.note')}</Label>
        <Textarea
          id={`${id}-note`}
          value={note}
          maxLength={REPORT_NOTE_MAX}
          onChange={(event) => {
            setNote(event.target.value)
          }}
          data-testid="training-library-report-note"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11" disabled={busy} data-testid="training-library-report-send">
          {t('training.library.report.send')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => {
            setOpen(false)
          }}
        >
          {t('training.library.report.cancel')}
        </Button>
      </div>
    </form>
  )
}
