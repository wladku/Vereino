'use client'
// "Accept cash" (UX concept M-15, B-21; payments spec REQ-031; issue #114), the same form in the admin dialog and on the
// phone page: the payer (only payers with something to pay, with their wards and the total due, searchable by name),
// their charges as checkboxes with what remains and the overdue marker (all selected), the amount (the selected sum;
// a lower amount pays the oldest first), the date (today, never later) and "Send the payer an e-mail confirmation"
// (on). After saving, the toast "Received X in cash from … — receipt KP/…" and a fresh form for the next payer.
import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { SwitchField } from '@open-mercato/ui/primitives/switch-field'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { errorMessage, formatMoney, fromGrosz, localToday, personName, toGrosz } from '../client-helpers'
import {
  CASH_QUERY_KEY,
  recordCash,
  useCashCharges,
  useCashPayers,
  type CashPayer,
  type CashRecorded,
} from './cash-client'

function wardsLabel(payer: CashPayer): string {
  return payer.wards.map((ward) => personName(ward)).join(', ')
}

export function CashAcceptForm({
  onDone,
  onCancel,
}: {
  onDone?: (recorded: CashRecorded) => void | Promise<void>
  onCancel?: () => void
}) {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const ids = {
    search: React.useId(),
    amount: React.useId(),
    date: React.useId(),
    problem: React.useId(),
    charges: React.useId(),
  }
  const [search, setSearch] = React.useState('')
  const [payer, setPayer] = React.useState<CashPayer | null>(null)
  // The payer's charges arrive selected: the state holds the ones unticked. The amount follows the selection until the
  // collector types one (null = the selected sum).
  const [unticked, setUnticked] = React.useState<string[]>([])
  const [typedAmount, setTypedAmount] = React.useState<string | null>(null)
  const [paidOn, setPaidOn] = React.useState(localToday)
  const [notify, setNotify] = React.useState(true)
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [invalid, setInvalid] = React.useState<'amount' | 'date' | 'charges' | null>(null)

  const payers = useCashPayers(search)
  const charges = useCashCharges(payer?.payerPersonId ?? null)
  const items = React.useMemo(() => charges.data?.items ?? [], [charges.data])

  const selected = React.useMemo(
    () => items.filter((item) => !unticked.includes(item.id)).map((item) => item.id),
    [items, unticked],
  )
  const selectedSum = React.useMemo(
    () => items.filter((item) => selected.includes(item.id)).reduce((sum, item) => sum + item.remaining, 0),
    [items, selected],
  )
  const amount = typedAmount ?? (selectedSum > 0 ? fromGrosz(selectedSum) : '')

  const reset = () => {
    setPayer(null)
    setUnticked([])
    setTypedAmount(null)
    setPaidOn(localToday())
    setNotify(true)
    setProblem(null)
    setInvalid(null)
  }

  const submit = async () => {
    if (!payer) return
    if (selected.length === 0) {
      setInvalid('charges')
      setProblem(t('payments.cash.chargesRequired'))
      return
    }
    const grosz = toGrosz(amount)
    if (grosz === null || grosz <= 0) {
      setInvalid('amount')
      setProblem(t('payments.ledger.record.amountInvalid'))
      return
    }
    if (!paidOn) {
      setInvalid('date')
      setProblem(t('payments.ledger.record.dateRequired'))
      return
    }
    setPending(true)
    setProblem(null)
    setInvalid(null)
    try {
      const recorded = await recordCash(
        { payerPersonId: payer.payerPersonId, chargeIds: selected, amount: grosz, paidOn, notify },
        t('payments.cash.error'),
      )
      flash(
        t('payments.cash.done', {
          amount: formatMoney(recorded.amount, locale),
          payer: personName(payer),
          receipt: recorded.receiptNumber,
        }),
        'success',
      )
      reset()
      await queryClient.invalidateQueries({ queryKey: [CASH_QUERY_KEY] })
      await onDone?.(recorded)
    } catch (error: unknown) {
      setProblem(errorMessage(error, t('payments.cash.error')))
      await queryClient.invalidateQueries({ queryKey: [CASH_QUERY_KEY, 'charges'] })
    } finally {
      setPending(false)
    }
  }

  if (!payer) {
    const list = payers.data?.items ?? []
    return (
      <div className="flex flex-col gap-3" data-testid="cash-payer-step">
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.search}>{t('payments.cash.payer')}</Label>
          <Input
            id={ids.search}
            type="search"
            data-testid="cash-payer-search"
            placeholder={t('payments.cash.payerSearch')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
            }}
          />
        </div>
        {payers.isLoading ? (
          <p className="text-muted-foreground text-sm" role="status">
            {t('payments.cash.loading')}
          </p>
        ) : payers.error ? (
          <p className="text-destructive text-sm" role="alert">
            {errorMessage(payers.error, t('payments.cash.errors.payers'))}
          </p>
        ) : list.length === 0 ? (
          <p className="text-muted-foreground text-sm" data-testid="cash-payers-empty">
            {t('payments.cash.payersEmpty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label={t('payments.cash.payer')}>
            {list.map((item) => (
              <li key={item.payerPersonId}>
                <button
                  type="button"
                  data-testid="cash-payer-option"
                  className="hover:bg-muted focus-visible:ring-ring flex min-h-11 w-full flex-col items-start gap-0.5 rounded-md border p-3 text-left focus-visible:ring-2 focus-visible:outline-none"
                  onClick={() => {
                    setPayer(item)
                    setProblem(null)
                  }}
                >
                  <span className="flex w-full flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{personName(item)}</span>
                    <span className="text-sm font-semibold">{formatMoney(item.totalDue, locale)}</span>
                  </span>
                  {item.wards.length > 0 ? (
                    <span className="text-muted-foreground text-sm">
                      {t('payments.cash.wards', { wards: wardsLabel(item) })}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        {onCancel ? (
          <div className="flex justify-end">
            <Button type="button" variant="outline" className="min-h-11" onClick={onCancel}>
              {t('payments.common.back')}
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="cash-form"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-muted-foreground text-sm">{t('payments.cash.payer')}</span>
          <span className="font-medium" data-testid="cash-payer-selected">
            {personName(payer)}
          </span>
          {payer.wards.length > 0 ? (
            <span className="text-muted-foreground text-sm">
              {t('payments.cash.wards', { wards: wardsLabel(payer) })}
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          data-testid="cash-payer-change"
          onClick={reset}
        >
          {t('payments.cash.changePayer')}
        </Button>
      </div>

      <fieldset className="flex flex-col gap-2" aria-describedby={invalid === 'charges' ? ids.problem : undefined}>
        <legend className="mb-2 text-sm font-medium">{t('payments.cash.charges')}</legend>
        {charges.isLoading ? (
          <p className="text-muted-foreground text-sm" role="status">
            {t('payments.cash.loading')}
          </p>
        ) : charges.error ? (
          <p className="text-destructive text-sm" role="alert">
            {errorMessage(charges.error, t('payments.cash.errors.charges'))}
          </p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('payments.cash.chargesEmpty')}</p>
        ) : (
          items.map((item) => {
            const id = `${ids.charges}-${item.id}`
            return (
              <div
                key={item.id}
                className="flex min-h-11 items-start gap-3 rounded-md border p-3"
                data-testid="cash-charge"
              >
                <Checkbox
                  id={id}
                  className="mt-0.5"
                  checked={selected.includes(item.id)}
                  disabled={pending}
                  onCheckedChange={(value) => {
                    setUnticked((current) =>
                      value === true ? current.filter((chargeId) => chargeId !== item.id) : [...current, item.id],
                    )
                    setTypedAmount(null)
                  }}
                />
                <Label htmlFor={id} className="flex flex-1 flex-col gap-1 font-normal">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{item.description}</span>
                    <span className="font-semibold">{formatMoney(item.remaining, locale)}</span>
                  </span>
                  <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                    {item.person ? <span>{personName(item.person)}</span> : null}
                    <span>{t('payments.ledger.dueOn', { date: item.dueDate })}</span>
                    {item.remaining < item.amountDue ? (
                      <span>{t('payments.cash.ofAmount', { amount: formatMoney(item.amountDue, locale) })}</span>
                    ) : null}
                    {item.overdue ? <StatusBadge variant="error">{t('payments.charges.overdue')}</StatusBadge> : null}
                  </span>
                </Label>
              </div>
            )
          })
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.amount}>{t('payments.ledger.record.amount')}</Label>
          <Input
            id={ids.amount}
            inputMode="decimal"
            data-testid="cash-amount"
            required
            aria-required
            aria-invalid={invalid === 'amount' ? true : undefined}
            aria-describedby={problem ? ids.problem : undefined}
            value={amount}
            disabled={pending}
            onChange={(event) => {
              setTypedAmount(event.target.value)
            }}
          />
          <span className="text-muted-foreground text-xs">
            {t('payments.cash.amountHelp', { total: formatMoney(selectedSum, locale) })}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.date}>{t('payments.ledger.record.date')}</Label>
          <Input
            id={ids.date}
            type="date"
            data-testid="cash-date"
            required
            aria-required
            aria-invalid={invalid === 'date' ? true : undefined}
            max={localToday()}
            value={paidOn}
            disabled={pending}
            onChange={(event) => {
              setPaidOn(event.target.value)
            }}
          />
        </div>
      </div>

      <SwitchField
        id={`${ids.amount}-notify`}
        label={t('payments.cash.notify')}
        checked={notify}
        disabled={pending}
        onCheckedChange={(checked) => {
          setNotify(checked)
        }}
      />

      {problem ? (
        <p id={ids.problem} className="text-destructive text-sm" role="alert" data-testid="cash-problem">
          {problem}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={onCancel}>
            {t('payments.common.back')}
          </Button>
        ) : null}
        <Button type="submit" className="min-h-11" data-testid="cash-confirm" disabled={pending || items.length === 0}>
          {pending ? t('payments.cash.pending') : t('payments.cash.confirm', { amount: amount || '0' })}
        </Button>
      </div>
    </form>
  )
}
