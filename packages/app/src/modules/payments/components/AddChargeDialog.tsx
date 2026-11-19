'use client'
// "Add charge" of B-21 and of the person record's "Charges" tab (payments parity spec REQ-C06, DD-C12, J-C05 step 3;
// #295): a charge entered by hand — the person (fixed on the person record), a description of 3–200 characters, the
// amount and the due date (proposed: a week from today). The payer follows the *Payer* rule on the server; a charge
// without one is announced, and B-22 assigns it later. A manual charge is never edited: a wrong one is cancelled and
// added again. The caller mounts it only while it is open, so every opening starts empty.
import * as React from 'react'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ComboboxInput, type ComboboxOption } from '@open-mercato/ui/backend/inputs'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
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
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { addCalendarDays } from '@vereino/core'
import { useClubToday } from '@vereino/ui'
import { MAX_MANUAL_DESCRIPTION_LENGTH, MIN_MANUAL_DESCRIPTION_LENGTH, manualDueRange } from '../lib/manual-charges'
import { MAX_AMOUNT } from '../lib/payments-rules'
import { errorCode, errorMessage, lookupRows, toGrosz } from './client-helpers'

type CreateResult = { chargeId?: string; payerMissing?: boolean }

type Field = 'person' | 'description' | 'amount' | 'dueDate'

const PROPOSED_DUE_DAYS = 7

async function personOptions(query?: string): Promise<ComboboxOption[]> {
  const rows = await lookupRows('persons', { search: query, pageSize: 20 })
  return rows.map((person) => ({ value: person.id, label: person.label }))
}

export function AddChargeDialog({
  open,
  onOpenChange,
  personId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The debtor, fixed when the dialog opens from the person record. */
  personId?: string
  onCreated: (result: { chargeId: string; payerMissing: boolean }) => Promise<void>
}) {
  const t = useT()
  const today = useClubToday()
  const range = manualDueRange(today)
  const ids = {
    description: React.useId(),
    amount: React.useId(),
    dueDate: React.useId(),
    person: React.useId(),
    problem: React.useId(),
  }
  const [debtorId, setDebtorId] = React.useState(personId ?? '')
  const [description, setDescription] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [dueDate, setDueDate] = React.useState(() => addCalendarDays(today, PROPOSED_DUE_DAYS))
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [invalid, setInvalid] = React.useState<Field | null>(null)

  /** The first field the server would refuse, with its message; null when the form may be sent. */
  const localRefusal = (text: string, grosz: number | null): [Field, string] | null => {
    if (!debtorId) return ['person', t('payments.manual.personRequired')]
    if (text.length < MIN_MANUAL_DESCRIPTION_LENGTH || text.length > MAX_MANUAL_DESCRIPTION_LENGTH) {
      return ['description', t('payments.manual.descriptionInvalid')]
    }
    if (grosz === null || grosz <= 0 || grosz > MAX_AMOUNT) return ['amount', t('payments.manual.amountInvalid')]
    if (!dueDate) return ['dueDate', t('payments.manual.dueDateRequired')]
    return null
  }

  const submit = async () => {
    const grosz = toGrosz(amount)
    const text = description.trim()
    const refusal = localRefusal(text, grosz)
    if (refusal) {
      setInvalid(refusal[0])
      setProblem(refusal[1])
      return
    }
    setPending(true)
    setProblem(null)
    setInvalid(null)
    try {
      const call = await apiCallOrThrow<CreateResult>(
        '/api/payments/charges',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ personId: debtorId, description: text, amount: grosz, dueDate }),
        },
        { errorMessage: t('payments.manual.error') },
      )
      const payerMissing = call.result?.payerMissing === true
      flash(payerMissing ? t('payments.manual.donePayerMissing') : t('payments.manual.done'), 'success')
      onOpenChange(false)
      await onCreated({ chargeId: call.result?.chargeId ?? '', payerMissing })
    } catch (error: unknown) {
      const code = errorCode(error)
      setInvalid(code === 'charge_due_date_out_of_range' ? 'dueDate' : null)
      setProblem(errorMessage(error, t('payments.manual.error')))
    } finally {
      setPending(false)
    }
  }

  const describedBy = (field: Field) => (invalid === field && problem ? ids.problem : undefined)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('payments.common.close')}
        data-testid="add-charge-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('payments.manual.title')}</DialogTitle>
          <DialogDescription>{t('payments.manual.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {personId ? null : (
            <div className="flex flex-col gap-2" data-testid="add-charge-person">
              <span className="text-sm font-medium" id={ids.person}>
                {t('payments.manual.person')}
              </span>
              <div role="group" aria-labelledby={ids.person} aria-describedby={describedBy('person')}>
                <ComboboxInput
                  value={debtorId}
                  onChange={(next) => {
                    setDebtorId(next)
                  }}
                  placeholder={t('payments.manual.personPlaceholder')}
                  loadSuggestions={personOptions}
                  allowCustomValues={false}
                  clearable={false}
                  disabled={pending}
                />
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.description}>{t('payments.manual.description')}</Label>
            <Input
              id={ids.description}
              data-testid="add-charge-description"
              required
              aria-required
              minLength={MIN_MANUAL_DESCRIPTION_LENGTH}
              maxLength={MAX_MANUAL_DESCRIPTION_LENGTH}
              aria-invalid={invalid === 'description' ? true : undefined}
              aria-describedby={describedBy('description')}
              value={description}
              disabled={pending}
              onChange={(event) => {
                setDescription(event.target.value)
              }}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={ids.amount}>{t('payments.manual.amount')}</Label>
              <Input
                id={ids.amount}
                inputMode="decimal"
                data-testid="add-charge-amount"
                required
                aria-required
                aria-invalid={invalid === 'amount' ? true : undefined}
                aria-describedby={describedBy('amount')}
                value={amount}
                disabled={pending}
                onChange={(event) => {
                  setAmount(event.target.value)
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={ids.dueDate}>{t('payments.manual.dueDate')}</Label>
              <Input
                id={ids.dueDate}
                type="date"
                data-testid="add-charge-due-date"
                required
                aria-required
                min={range.from}
                max={range.to}
                aria-invalid={invalid === 'dueDate' ? true : undefined}
                aria-describedby={describedBy('dueDate')}
                value={dueDate}
                disabled={pending}
                onChange={(event) => {
                  setDueDate(event.target.value)
                }}
              />
            </div>
          </div>
          {problem ? (
            <p id={ids.problem} className="text-destructive text-sm" role="alert" data-testid="add-charge-problem">
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
              onOpenChange(false)
            }}
          >
            {t('payments.common.back')}
          </Button>
          <Button
            type="button"
            data-testid="add-charge-confirm"
            disabled={pending}
            onClick={() => {
              void submit()
            }}
          >
            {t('payments.manual.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
