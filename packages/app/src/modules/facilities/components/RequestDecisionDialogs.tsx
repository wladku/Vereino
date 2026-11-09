'use client'
// The decision dialogs of an online booking request (facilities spec B-25, J-007 step 4; E08-S05 #125). Approve names
// the renter — an institution or a person of the club, found with the same search as the staff "New rental" dialog,
// or a new institution (its name prefilled with the requester's, type "club") — and optionally another renter category
// (e.g. the staff-only winter-lighting rate) and another amount, which needs a note. Reject takes a reason of 5–500
// characters. Both send the request's lock token: a stale token surfaces the platform conflict, a request decided or
// expired meanwhile (409 `invalid_transition`, `request_hold_expired`) closes the dialog and reloads the queue; a slot
// that is no longer free or an entry ban (409) is shown in the dialog.
import * as React from 'react'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { LookupSelect, type LookupSelectItem } from '@open-mercato/ui/backend/inputs'
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
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { RENTER_CATEGORIES } from '../lib/rates'
import { APPROVAL_NOTE_MAX_LENGTH, REJECT_REASON_MAX_LENGTH, REJECT_REASON_MIN_LENGTH } from '../lib/request-form'
import { amountToMinor, codedMessage, errorMessage, minorToAmount, type Translate } from './facilities-client'
import { searchInstitutions, searchPersons } from './rentals-client'
import {
  INSTITUTION_TYPES,
  decideRequest,
  expiryLabel,
  moneyLabel,
  queueSlotLabel,
  queueTimeRange,
  type ApproveBody,
  type InstitutionType,
  type RequestQueueItem,
} from './requests-client'

/** A request decided or expired meanwhile: the dialog closes and the queue reloads. */
const GONE_CODES = new Set(['invalid_transition', 'request_hold_expired'])

/**
 * The shared handling of a refused decision: a stale lock token surfaces the platform conflict; a request decided or
 * expired meanwhile closes the dialog with a message; both reload the queue. Answers the message to show in the
 * dialog, or null when the dialog was closed.
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
  const code = errorCodeOf(error)
  if (code && GONE_CODES.has(code)) {
    flash(
      code === 'invalid_transition'
        ? t('facilities.requests.errors.decided')
        : t('facilities.errors.request_hold_expired'),
      'error',
    )
    close()
    await refresh()
    return null
  }
  return codedMessage(error, t) ?? errorMessage(error, fallback)
}

/** The field a refused approval names (`fieldErrors`), if any. */
function fieldOf(error: unknown): string | null {
  const fields = (error as { fieldErrors?: unknown } | null)?.fieldErrors
  return fields && typeof fields === 'object' ? (Object.keys(fields).at(0) ?? null) : null
}

export function RequestSummary({
  item,
  timeZone,
  currency,
}: {
  item: RequestQueueItem
  timeZone: string
  currency: string
}) {
  const t = useT()
  const locale = useLocale()
  const contact = [item.contactName, item.contactPhone, item.contactEmail].filter(Boolean).join(' · ')
  const rows: Array<[string, string]> = [
    [t('facilities.fields.place'), item.placeName || t('facilities.common.unknownPlace')],
    [t('facilities.requests.columns.slot'), queueSlotLabel(item.startsAt, item.endsAt, timeZone, locale)],
    [t('facilities.requests.columns.requester'), item.renterDisplayName],
    [t('facilities.requests.columns.contact'), contact || t('facilities.common.empty')],
    [t('facilities.requests.columns.category'), t(`facilities.rates.category.${item.renterCategory}`)],
    [t('facilities.requests.columns.purpose'), item.purpose ?? t('facilities.common.empty')],
    [
      t('facilities.requests.columns.amount'),
      item.amount === null ? t('facilities.requests.amount.none') : moneyLabel(item.amount, currency, locale),
    ],
    [t('facilities.requests.columns.expiry'), expiryLabel(t, item.holdExpiresAt, new Date())],
  ]
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The collisions and the ban-register hint of a request, as warnings. */
export function RequestWarnings({ item, timeZone }: { item: RequestQueueItem; timeZone: string }) {
  const t = useT()
  const locale = useLocale()
  return (
    <>
      {item.conflicts.length > 0 ? (
        <Alert status="warning" data-testid="facilities-request-conflicts">
          <AlertTitle>{t('facilities.requests.conflicts.title', { count: item.conflicts.length })}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc ps-4">
              {item.conflicts.map((conflict, index) => (
                <li key={`${conflict.kind}-${conflict.start}-${String(index)}`}>
                  {t('facilities.requests.conflicts.item', {
                    kind: t(`facilities.requests.conflicts.kind.${conflict.kind}`),
                    time: queueTimeRange(conflict.start, conflict.end, timeZone, locale),
                  })}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {item.entryBanMatch ? (
        <Alert status="error" data-testid="facilities-request-ban">
          <AlertTitle>{t('facilities.requests.ban.title')}</AlertTitle>
          <AlertDescription>{t('facilities.requests.ban.text')}</AlertDescription>
        </Alert>
      ) : null}
    </>
  )
}

type RenterMode = 'institution' | 'person' | 'create'
const RENTER_MODES: readonly RenterMode[] = ['institution', 'person', 'create']

type ApproveField = 'renter' | 'category' | 'amount' | 'note'

/** The approval field a refused save names. */
const APPROVE_FIELD_OF: Partial<Record<string, ApproveField>> = {
  renterId: 'renter',
  renterType: 'renter',
  createInstitution: 'renter',
  renterCategory: 'category',
  amountOverride: 'amount',
  note: 'note',
}

export function ApproveRequestDialog({
  item,
  timeZone,
  currency,
  open,
  onOpenChange,
  onDone,
}: {
  item: RequestQueueItem
  timeZone: string
  currency: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const ids = React.useId()
  const [mode, setMode] = React.useState<RenterMode>('institution')
  const [renterId, setRenterId] = React.useState<string | null>(null)
  const [institutionName, setInstitutionName] = React.useState(item.renterDisplayName)
  const [institutionType, setInstitutionType] = React.useState<InstitutionType>('club')
  const [category, setCategory] = React.useState(item.renterCategory)
  const quotedAmount = item.amount === null ? '' : minorToAmount(item.amount)
  const [amount, setAmount] = React.useState(quotedAmount)
  const [note, setNote] = React.useState('')
  const [errors, setErrors] = React.useState<Partial<Record<ApproveField, string>>>({})
  const [problem, setProblem] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const amountChanged = amount.trim() !== quotedAmount
  const fetchRenters = React.useCallback(
    async (query: string): Promise<LookupSelectItem[]> =>
      (mode === 'person' ? await searchPersons(query) : await searchInstitutions(query)).items,
    [mode],
  )

  const edited = (field: ApproveField) => {
    setErrors((current) => {
      if (!current[field]) return current
      return Object.fromEntries(Object.entries(current).filter(([key]) => key !== field))
    })
    setProblem(null)
  }

  const close = () => {
    onOpenChange(false)
  }

  const build = (): ApproveBody | null => {
    const next: Partial<Record<ApproveField, string>> = {}
    const body: ApproveBody = {}
    if (mode === 'create') {
      if (!institutionName.trim()) next.renter = t('facilities.requests.approve.errors.institutionName')
      body.createInstitution = { name: institutionName.trim(), type: institutionType }
    } else if (!renterId) {
      next.renter = t('facilities.errors.request_renter_required')
    } else {
      body.renterType = mode
      body.renterId = renterId
    }
    if (category !== item.renterCategory) body.renterCategory = category
    if (amountChanged) {
      const minor = amountToMinor(amount)
      if (minor === null) next.amount = t('facilities.requests.approve.errors.amount')
      else body.amountOverride = minor
      if (!note.trim()) next.note = t('facilities.errors.rental_amount_note_required')
    }
    if (note.trim()) body.note = note.trim()
    setErrors(next)
    if (Object.keys(next).length > 0) {
      setProblem(t('facilities.errors.invalid'))
      return null
    }
    return body
  }

  const submit = async () => {
    if (pending) return
    const body = build()
    if (!body) return
    setPending(true)
    setProblem(null)
    try {
      await decideRequest(item, 'approve', body, t('facilities.requests.errors.approve'))
      flash(t('facilities.requests.flash.approved'), 'success')
      close()
      await onDone()
    } catch (error: unknown) {
      const field = fieldOf(error)
      const target = field ? APPROVE_FIELD_OF[field] : undefined
      const message = codedMessage(error, t)
      if (target && message) {
        setErrors((current) => ({ ...current, [target]: message }))
        setProblem(t('facilities.errors.invalid'))
      } else {
        setProblem(await refusal(error, t, t('facilities.requests.errors.approve'), close, onDone))
      }
    } finally {
      setPending(false)
    }
  }

  const errorId = (field: ApproveField) => `${ids}-${field}-error`
  const invalid = (field: ApproveField) =>
    errors[field] ? { 'aria-invalid': true as const, 'aria-describedby': errorId(field) } : {}
  const fieldError = (field: ApproveField) =>
    errors[field] ? (
      <p id={errorId(field)} className="text-destructive text-xs" role="alert">
        {errors[field]}
      </p>
    ) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        closeAriaLabel={t('facilities.common.close')}
        data-testid="facilities-request-approve-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('facilities.requests.approve.title')}</DialogTitle>
          <DialogDescription>{t('facilities.requests.approve.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <RequestSummary item={item} timeZone={timeZone} currency={currency} />
          <RequestWarnings item={item} timeZone={timeZone} />

          <div className="flex flex-col gap-2">
            <span id={`${ids}-mode`} className="text-sm font-medium">
              {t('facilities.requests.approve.renter')}
            </span>
            <div className="overflow-x-auto">
              <SegmentedControl
                value={mode}
                onValueChange={(next: string) => {
                  setMode(RENTER_MODES.find((entry) => entry === next) ?? 'institution')
                  setRenterId(null)
                  edited('renter')
                }}
                aria-labelledby={`${ids}-mode`}
                data-testid="facilities-request-renter-mode"
              >
                {RENTER_MODES.map((entry) => (
                  <SegmentedControlItem key={entry} value={entry}>
                    {t(`facilities.requests.approve.mode.${entry}`)}
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
            </div>
            {mode === 'create' ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${ids}-institution-name`}>{t('facilities.requests.approve.institutionName')}</Label>
                  <Input
                    id={`${ids}-institution-name`}
                    value={institutionName}
                    maxLength={200}
                    disabled={pending}
                    data-testid="facilities-request-institution-name"
                    {...invalid('renter')}
                    onChange={(event) => {
                      setInstitutionName(event.target.value)
                      edited('renter')
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${ids}-institution-type`}>{t('facilities.requests.approve.institutionType')}</Label>
                  <Select
                    value={institutionType}
                    disabled={pending}
                    onValueChange={(next: string) => {
                      setInstitutionType(INSTITUTION_TYPES.find((entry) => entry === next) ?? 'club')
                    }}
                  >
                    <SelectTrigger id={`${ids}-institution-type`} data-testid="facilities-request-institution-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INSTITUTION_TYPES.map((entry) => (
                        <SelectItem key={entry} value={entry}>
                          {t(`facilities.requests.institutionType.${entry}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1" data-testid="facilities-request-renter-search">
                <Label>
                  {mode === 'person'
                    ? t('facilities.rentals.fields.person')
                    : t('facilities.rentals.fields.institution')}
                </Label>
                <LookupSelect
                  key={mode}
                  value={renterId}
                  onChange={(next) => {
                    setRenterId(next)
                    edited('renter')
                  }}
                  fetchItems={fetchRenters}
                  minQuery={0}
                  placeholder={t('facilities.rentals.renter.placeholder')}
                  searchPlaceholder={t('facilities.rentals.renter.search')}
                  emptyLabel={t('facilities.rentals.renter.empty')}
                  loadingLabel={t('facilities.common.loading')}
                  clearLabel={t('facilities.rentals.renter.clear')}
                  selectLabel={t('facilities.rentals.renter.select')}
                  selectedLabel={t('facilities.rentals.renter.selected')}
                  disabled={pending}
                />
              </div>
            )}
            {fieldError('renter')}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-category`}>{t('facilities.rates.fields.category')}</Label>
            <Select
              value={category}
              disabled={pending}
              onValueChange={(next: string) => {
                setCategory(next)
                edited('category')
              }}
            >
              <SelectTrigger id={`${ids}-category`} data-testid="facilities-request-category" {...invalid('category')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RENTER_CATEGORIES.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {t(`facilities.rates.category.${entry}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {category !== item.renterCategory ? (
              <p className="text-muted-foreground text-xs">{t('facilities.requests.approve.categoryHelp')}</p>
            ) : null}
            {fieldError('category')}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-amount`}>{t('facilities.requests.approve.amount', { currency })}</Label>
              <Input
                id={`${ids}-amount`}
                inputMode="decimal"
                value={amount}
                disabled={pending}
                data-testid="facilities-request-amount"
                {...invalid('amount')}
                onChange={(event) => {
                  setAmount(event.target.value)
                  edited('amount')
                }}
              />
              <p className="text-muted-foreground text-xs">{t('facilities.requests.approve.amountHelp')}</p>
              {fieldError('amount')}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-note`}>
                {amountChanged ? t('facilities.requests.approve.noteRequired') : t('facilities.requests.approve.note')}
              </Label>
              <Textarea
                id={`${ids}-note`}
                rows={2}
                maxLength={APPROVAL_NOTE_MAX_LENGTH}
                value={note}
                disabled={pending}
                required={amountChanged}
                data-testid="facilities-request-note"
                {...invalid('note')}
                onChange={(event) => {
                  setNote(event.target.value)
                  edited('note')
                }}
              />
              {fieldError('note')}
            </div>
          </div>

          {problem ? (
            <p className="text-destructive text-sm" role="alert" data-testid="facilities-request-approve-problem">
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
            data-testid="facilities-request-approve-confirm"
            onClick={() => {
              void submit()
            }}
          >
            {pending ? t('facilities.common.saving') : t('facilities.requests.approve.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RejectRequestDialog({
  item,
  timeZone,
  currency,
  open,
  onOpenChange,
  onDone,
}: {
  item: RequestQueueItem
  timeZone: string
  currency: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const reasonId = React.useId()
  const [reason, setReason] = React.useState('')
  const [invalid, setInvalid] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const close = () => {
    onOpenChange(false)
  }

  const submit = async () => {
    if (pending) return
    const trimmed = reason.trim()
    if (trimmed.length < REJECT_REASON_MIN_LENGTH || trimmed.length > REJECT_REASON_MAX_LENGTH) {
      setInvalid(true)
      return
    }
    setPending(true)
    setProblem(null)
    try {
      await decideRequest(item, 'reject', { reason: trimmed }, t('facilities.requests.errors.reject'))
      flash(t('facilities.requests.flash.rejected'), 'success')
      close()
      await onDone()
    } catch (error: unknown) {
      setProblem(await refusal(error, t, t('facilities.requests.errors.reject'), close, onDone))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('facilities.common.close')}
        data-testid="facilities-request-reject-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('facilities.requests.reject.title')}</DialogTitle>
          <DialogDescription>{t('facilities.requests.reject.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <RequestSummary item={item} timeZone={timeZone} currency={currency} />
          <div className="flex flex-col gap-1">
            <Label htmlFor={reasonId}>{t('facilities.requests.reject.reason')}</Label>
            <Textarea
              id={reasonId}
              rows={3}
              maxLength={REJECT_REASON_MAX_LENGTH}
              value={reason}
              disabled={pending}
              required
              aria-invalid={invalid ? true : undefined}
              aria-describedby={invalid ? `${reasonId}-error` : undefined}
              data-testid="facilities-request-reject-reason"
              onChange={(event) => {
                setReason(event.target.value)
                setInvalid(false)
                setProblem(null)
              }}
            />
            {invalid ? (
              <p id={`${reasonId}-error`} className="text-destructive text-xs" role="alert">
                {t('facilities.requests.reject.reasonLength', {
                  min: REJECT_REASON_MIN_LENGTH,
                  max: REJECT_REASON_MAX_LENGTH,
                })}
              </p>
            ) : null}
          </div>
          {problem ? (
            <p className="text-destructive text-sm" role="alert" data-testid="facilities-request-reject-problem">
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
            data-testid="facilities-request-reject-confirm"
            onClick={() => {
              void submit()
            }}
          >
            {pending ? t('facilities.common.saving') : t('facilities.requests.reject.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
