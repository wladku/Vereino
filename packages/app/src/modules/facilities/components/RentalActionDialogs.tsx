'use client'
// The cancel and move dialogs of a rental (facilities spec B-24; E08-S02 #122). Cancel says whether the cancellation
// is free or late by the free cancellation deadline (24 h before the start) — a late one forfeits the charge — and
// takes an optional reason. Move takes a new date, start time and optionally another place, keeps the units, and shows
// the live quote of the new slot (the rental itself is ignored there) with its conflicts. Both send the rental's lock
// token; a stale token surfaces the conflict, a rental changed meanwhile (409 `invalid_transition`) closes the dialog
// and refreshes the list.
import * as React from 'react'
import type { CrudFieldOption } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { FIELD_OF_ISSUE, FieldIssues, issuesByField } from './RentalDialog'
import { QuotePanel } from './RentalQuotePanel'
import { codedMessage, errorMessage, instantLabel, minorToAmount, type Translate } from './facilities-client'
import {
  cancellationIsLate,
  issueOfError,
  localDateOf,
  localInstant,
  localTimeOf,
  runRentalAction,
  slotLabel,
  useRentalQuote,
  type QuoteInput,
  type QuoteIssue,
  type RentalRow,
} from './rentals-client'

const REASON_MAX_LENGTH = 500

/**
 * The shared handling of a refused status action: a stale lock token surfaces the platform conflict and a rental
 * whose status changed meanwhile closes the dialog; both refresh. Answers the message to show in the dialog, or null
 * when the dialog was closed.
 */
async function refusal(
  error: unknown,
  t: Translate,
  fallback: string,
  close: () => void,
  refresh: () => Promise<void>,
): Promise<string | null> {
  if (surfaceRecordConflict(error, t, { onRefresh: () => void refresh() })) {
    close()
    return null
  }
  if (errorCodeOf(error) === 'invalid_transition') {
    flash(t('facilities.rentals.errors.invalid_transition'), 'error')
    close()
    await refresh()
    return null
  }
  return codedMessage(error, t) ?? errorMessage(error, fallback)
}

function RentalSummary({ row, placeName }: { row: RentalRow; placeName: string }) {
  const t = useT()
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      <div className="flex flex-col">
        <dt className="text-muted-foreground">{t('facilities.rentals.columns.slot')}</dt>
        <dd className="tabular-nums">{slotLabel(row.startsAt, row.endsAt)}</dd>
      </div>
      <div className="flex flex-col">
        <dt className="text-muted-foreground">{t('facilities.fields.place')}</dt>
        <dd>{placeName}</dd>
      </div>
      <div className="flex flex-col">
        <dt className="text-muted-foreground">{t('facilities.rentals.columns.renter')}</dt>
        <dd>{row.renterDisplayName ?? t('facilities.common.empty')}</dd>
      </div>
      <div className="flex flex-col">
        <dt className="text-muted-foreground">{t('facilities.rentals.columns.amount')}</dt>
        <dd className="tabular-nums">
          {row.amount === null ? t('facilities.common.empty') : minorToAmount(row.amount)}
        </dd>
      </div>
    </dl>
  )
}

export function CancelRentalDialog({
  row,
  placeName,
  open,
  onOpenChange,
  onDone,
}: {
  row: RentalRow
  placeName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const reasonId = React.useId()
  // The moment the dialog opened decides what it promises; the server decides again on confirmation.
  const [openedAt] = React.useState(() => new Date())
  const [reason, setReason] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const late = cancellationIsLate(row.cancellationDeadline, openedAt)
  const deadline = instantLabel(row.cancellationDeadline)

  const close = () => {
    onOpenChange(false)
  }

  const submit = async () => {
    if (pending) return
    setPending(true)
    setProblem(null)
    try {
      const trimmed = reason.trim()
      const result = await runRentalAction(
        row,
        'cancel',
        trimmed ? { reason: trimmed } : {},
        t('facilities.rentals.errors.cancel'),
      )
      flash(
        result?.status === 'cancelled_late'
          ? t('facilities.rentals.flash.cancelledLate')
          : t('facilities.rentals.flash.cancelledFree'),
        'success',
      )
      close()
      await onDone()
    } catch (error: unknown) {
      setProblem(await refusal(error, t, t('facilities.rentals.errors.cancel'), close, onDone))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('facilities.common.close')}
        data-testid="facilities-rental-cancel-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('facilities.rentals.cancel.title')}</DialogTitle>
          <DialogDescription>{t('facilities.rentals.cancel.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <RentalSummary row={row} placeName={placeName} />
          {late ? (
            <Alert status="warning" data-testid="facilities-rental-cancel-forfeited">
              <AlertTitle>{t('facilities.rentals.cancel.late.title')}</AlertTitle>
              <AlertDescription>
                {deadline
                  ? t('facilities.rentals.cancel.late.text', { deadline })
                  : t('facilities.rentals.cancel.late.textNoDeadline')}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert status="information" data-testid="facilities-rental-cancel-free">
              <AlertTitle>{t('facilities.rentals.cancel.free.title')}</AlertTitle>
              <AlertDescription>
                {deadline
                  ? t('facilities.rentals.cancel.free.text', { deadline })
                  : t('facilities.rentals.cancel.free.textNoDeadline')}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor={reasonId}>{t('facilities.rentals.cancel.reason')}</Label>
            <Textarea
              id={reasonId}
              rows={3}
              maxLength={REASON_MAX_LENGTH}
              value={reason}
              disabled={pending}
              data-testid="facilities-rental-cancel-reason"
              onChange={(event) => {
                setReason(event.target.value)
              }}
            />
          </div>
          {problem ? (
            <p className="text-destructive text-sm" role="alert" data-testid="facilities-rental-cancel-problem">
              {problem}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={close}>
            {t('facilities.rentals.actions.back')}
          </Button>
          <Button
            type="button"
            variant="destructive-solid"
            disabled={pending}
            data-testid="facilities-rental-cancel-confirm"
            onClick={() => {
              void submit()
            }}
          >
            {pending ? t('facilities.common.saving') : t('facilities.rentals.cancel.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MoveRentalDialog({
  row,
  placeName,
  places,
  open,
  onOpenChange,
  onDone,
}: {
  row: RentalRow
  placeName: string
  places: CrudFieldOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const ids = React.useId()
  const [placeId, setPlaceId] = React.useState(row.placeId)
  const [date, setDate] = React.useState(() => localDateOf(row.startsAt))
  const [time, setTime] = React.useState(() => localTimeOf(row.startsAt))
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [saveIssues, setSaveIssues] = React.useState<QuoteIssue[]>([])
  const startsAt = localInstant(date, time)
  const unchanged = startsAt === new Date(row.startsAt).toISOString() && placeId === row.placeId

  const quoteInput: QuoteInput | null =
    startsAt && placeId && row.renterCategory
      ? {
          placeId,
          renterCategory: row.renterCategory,
          startsAt,
          units: row.units,
          renterType: row.renterType,
          ...(row.renterId ? { renterId: row.renterId } : {}),
          ignoreRentalId: row.id,
        }
      : null
  const quote = useRentalQuote(quoteInput)
  const issues = issuesByField(t, saveIssues.length > 0 ? saveIssues : quoteInput ? (quote.data?.issues ?? []) : [])

  const close = () => {
    onOpenChange(false)
  }

  const edited = () => {
    setSaveIssues([])
    setProblem(null)
  }

  const submit = async () => {
    if (pending) return
    if (!startsAt) {
      setProblem(t('facilities.rentals.errors.required.start'))
      return
    }
    if (unchanged) {
      setProblem(t('facilities.rentals.move.unchanged'))
      return
    }
    setPending(true)
    edited()
    try {
      await runRentalAction(
        row,
        'move',
        { startsAt, ...(placeId !== row.placeId ? { placeId } : {}) },
        t('facilities.rentals.errors.move'),
      )
      flash(t('facilities.rentals.flash.moved'), 'success')
      close()
      await onDone()
    } catch (error: unknown) {
      const issue = issueOfError(error)
      if (issue && FIELD_OF_ISSUE[issue.code] && codedMessage(error, t)) {
        setSaveIssues([issue])
        setProblem(t('facilities.rentals.errors.refused'))
      } else {
        setProblem(await refusal(error, t, t('facilities.rentals.errors.move'), close, onDone))
      }
    } finally {
      setPending(false)
    }
  }

  const startIssues = issues.get('start')
  const placeIssues = issues.get('place')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        closeAriaLabel={t('facilities.common.close')}
        data-testid="facilities-rental-move-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('facilities.rentals.move.title')}</DialogTitle>
          <DialogDescription>{t('facilities.rentals.move.help', { units: row.units })}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <RentalSummary row={row} placeName={placeName} />
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-place`}>{t('facilities.fields.place')}</Label>
            <Select
              value={placeId}
              disabled={pending}
              onValueChange={(next: string) => {
                setPlaceId(next)
                edited()
              }}
            >
              <SelectTrigger
                id={`${ids}-place`}
                data-testid="facilities-rental-move-place"
                aria-invalid={placeIssues ? true : undefined}
                aria-describedby={placeIssues ? `${ids}-place-issues` : undefined}
              >
                <SelectValue placeholder={t('facilities.fields.place.choose')} />
              </SelectTrigger>
              <SelectContent>
                {places.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldIssues id={`${ids}-place-issues`} messages={placeIssues} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-date`}>{t('facilities.rentals.fields.date')}</Label>
                <Input
                  id={`${ids}-date`}
                  type="date"
                  required
                  value={date}
                  disabled={pending}
                  data-testid="facilities-rental-move-date"
                  aria-invalid={startIssues ? true : undefined}
                  aria-describedby={startIssues ? `${ids}-start-issues` : undefined}
                  onChange={(event) => {
                    setDate(event.target.value)
                    edited()
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-time`}>{t('facilities.rentals.fields.time')}</Label>
                <Input
                  id={`${ids}-time`}
                  type="time"
                  step={300}
                  required
                  value={time}
                  disabled={pending}
                  data-testid="facilities-rental-move-time"
                  aria-invalid={startIssues ? true : undefined}
                  aria-describedby={startIssues ? `${ids}-start-issues` : undefined}
                  onChange={(event) => {
                    setTime(event.target.value)
                    edited()
                  }}
                />
              </div>
            </div>
            <FieldIssues id={`${ids}-start-issues`} messages={startIssues} />
            <FieldIssues
              id={`${ids}-other-issues`}
              messages={[
                ...(issues.get('units') ?? []),
                ...(issues.get('renter') ?? []),
                ...(issues.get('category') ?? []),
                ...(issues.get('form') ?? []),
              ]}
            />
          </div>
          <QuotePanel
            ready={quoteInput !== null}
            quote={quote.data}
            loading={quoteInput !== null && quote.isFetching}
            error={quote.error}
            chosenCategory={row.renterCategory ?? undefined}
            testId="facilities-rental-move-quote"
          />
          {problem ? (
            <p className="text-destructive text-sm" role="alert" data-testid="facilities-rental-move-problem">
              {problem}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={close}>
            {t('facilities.rentals.actions.back')}
          </Button>
          <Button
            type="button"
            disabled={pending}
            data-testid="facilities-rental-move-save"
            onClick={() => {
              void submit()
            }}
          >
            {pending ? t('facilities.common.saving') : t('facilities.rentals.move.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
