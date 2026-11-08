'use client'
// The dialogs of a B-29 transfer (payments spec REQ-030; issue #113): "Change or Assign" — the payers with something to
// pay, searchable by name, each with their payer code, wards and open balance — and "Skip" with its reason (a
// donation, a grant, a refund, other) and an optional note. A stale lock token surfaces the platform conflict and
// refreshes the queue; a coded refusal (409, 422) is shown in the dialog.
import * as React from 'react'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
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
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { BANK_SKIP_REASONS, MAX_SKIP_NOTE_LENGTH, type BankSkipReason } from '../../lib/bank-matching'
import { errorMessage, formatMoney, personName } from '../client-helpers'
import { decide, useBankPayers, type BankTransfer } from './bank-client'

type DialogProps = {
  transfer: BankTransfer | null
  onClose: () => void
  /** Refreshes the queue (after a decision, or after a conflict). */
  onDone: () => Promise<void>
}

/** Runs a decision; true when the dialog may close (done, or the conflict was surfaced). */
async function run(
  action: () => Promise<void>,
  t: ReturnType<typeof useT>,
  onDone: () => Promise<void>,
  setProblem: (problem: string | null) => void,
  fallback: string,
  success: string,
): Promise<boolean> {
  try {
    await action()
    flash(success, 'success')
    await onDone()
    return true
  } catch (error: unknown) {
    if (surfaceRecordConflict(error, t, { onRefresh: () => void onDone() })) return true
    setProblem(errorMessage(error, fallback))
    return false
  }
}

export function BankAssignDialog({ transfer, onClose, onDone }: DialogProps) {
  const t = useT()
  const locale = useLocale()
  const searchId = React.useId()
  const [search, setSearch] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const payers = useBankPayers(search, transfer !== null)
  const list = payers.data?.items ?? []

  const close = () => {
    setSearch('')
    setProblem(null)
    onClose()
  }

  const assign = async (payerPersonId: string) => {
    if (!transfer) return
    setPending(true)
    setProblem(null)
    const ok = await run(
      () => decide(transfer, 'assign', { payerPersonId }, t('payments.bank.errors.decide')),
      t,
      onDone,
      setProblem,
      t('payments.bank.errors.decide'),
      t('payments.bank.flash.assign'),
    )
    setPending(false)
    if (ok) close()
  }

  return (
    <Dialog
      open={transfer !== null}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent closeAriaLabel={t('payments.common.close')} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('payments.bank.assign.title')}</DialogTitle>
          <DialogDescription>
            {transfer
              ? t('payments.bank.assign.help', {
                  amount: formatMoney(transfer.amount, locale),
                  date: transfer.bookedOn,
                })
              : null}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Label htmlFor={searchId}>{t('payments.bank.assign.payer')}</Label>
          <Input
            id={searchId}
            type="search"
            data-testid="bank-assign-search"
            placeholder={t('payments.bank.assign.search')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
            }}
          />
          {payers.isLoading ? (
            <p className="text-muted-foreground text-sm" role="status">
              {t('payments.bank.loading')}
            </p>
          ) : payers.error ? (
            <p className="text-destructive text-sm" role="alert">
              {errorMessage(payers.error, t('payments.bank.errors.payers'))}
            </p>
          ) : list.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('payments.bank.assign.empty')}</p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto" aria-label={t('payments.bank.assign.payer')}>
              {list.map((payer) => (
                <li key={payer.payerPersonId}>
                  <button
                    type="button"
                    data-testid="bank-assign-option"
                    disabled={pending}
                    className="hover:bg-muted focus-visible:ring-ring flex min-h-11 w-full flex-col items-start gap-0.5 rounded-md border p-3 text-left focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                    onClick={() => {
                      void assign(payer.payerPersonId)
                    }}
                  >
                    <span className="flex w-full flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {personName(payer)}{' '}
                        <span className="text-muted-foreground font-mono text-xs">{payer.payerCode}</span>
                      </span>
                      <span className="text-sm font-semibold">{formatMoney(payer.totalDue, locale)}</span>
                    </span>
                    {payer.wards.length > 0 ? (
                      <span className="text-muted-foreground text-sm">
                        {t('payments.bank.assign.wards', {
                          wards: payer.wards.map((ward) => personName(ward)).join(', '),
                        })}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {problem ? (
            <p className="text-destructive text-sm" role="alert" data-testid="bank-assign-problem">
              {problem}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={close}>
            {t('payments.common.back')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function BankSkipDialog({ transfer, onClose, onDone }: DialogProps) {
  const t = useT()
  const ids = { reason: React.useId(), note: React.useId() }
  const [reason, setReason] = React.useState<BankSkipReason>('donation')
  const [note, setNote] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)

  const close = () => {
    setReason('donation')
    setNote('')
    setProblem(null)
    onClose()
  }

  const submit = async () => {
    if (!transfer) return
    setPending(true)
    setProblem(null)
    const ok = await run(
      () => decide(transfer, 'ignore', { reason, note: note.trim() || null }, t('payments.bank.errors.decide')),
      t,
      onDone,
      setProblem,
      t('payments.bank.errors.decide'),
      t('payments.bank.flash.ignore'),
    )
    setPending(false)
    if (ok) close()
  }

  return (
    <Dialog
      open={transfer !== null}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent closeAriaLabel={t('payments.common.close')}>
        <DialogHeader>
          <DialogTitle>{t('payments.bank.skip.title')}</DialogTitle>
          <DialogDescription>{t('payments.bank.skip.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.reason}>{t('payments.bank.skip.reason')}</Label>
            <Select
              value={reason}
              onValueChange={(value: string) => {
                setReason(value as BankSkipReason)
              }}
              disabled={pending}
            >
              <SelectTrigger id={ids.reason} data-testid="bank-skip-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BANK_SKIP_REASONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`payments.bank.skipReasons.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.note}>{t('payments.bank.skip.note')}</Label>
            <Textarea
              id={ids.note}
              data-testid="bank-skip-note"
              rows={2}
              maxLength={MAX_SKIP_NOTE_LENGTH}
              value={note}
              disabled={pending}
              onChange={(event) => {
                setNote(event.target.value)
              }}
            />
          </div>
          {problem ? (
            <p className="text-destructive text-sm" role="alert" data-testid="bank-skip-problem">
              {problem}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={close}>
            {t('payments.common.back')}
          </Button>
          <Button
            type="button"
            data-testid="bank-skip-confirm"
            disabled={pending}
            onClick={() => {
              void submit()
            }}
          >
            {t('payments.bank.actions.ignore')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
