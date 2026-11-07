'use client'
// The "New rental" dialog (facilities spec B-24, B-23 "New rental from a slot"; E08-S02 #122), opened from the rentals
// list and from a bookable slot of the facility calendar: place, start, 1–4 units of 90 minutes, the renter (an
// institution or a person found by search, or the name of an unregistered renter), the renter category, the contact,
// how the rental was taken and the regulations accepted. A live quote (nothing saved) shows the amount, the end, the
// payment due date and the free cancellation deadline; its issues — conflicts, closures, bans, a missing rate — are
// shown next to the field they belong to, the same way as a refused save.
import * as React from 'react'
import type { CrudFieldOption } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { LookupSelect, type LookupSelectItem } from '@open-mercato/ui/backend/inputs'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
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
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { RENTER_CATEGORIES } from '../lib/rates'
import { MAX_RENTAL_UNITS, MIN_RENTAL_UNITS, RENTER_TYPES, STAFF_REQUESTED_VIA, type RenterType } from '../lib/rentals'
import { codedMessage, errorMessage, localToday, textOrNull, type Translate } from './facilities-client'
import { QuotePanel } from './RentalQuotePanel'
import {
  RENTALS_URL,
  conflictLabel,
  issueOfError,
  localInstant,
  searchInstitutions,
  searchPersons,
  useRentalQuote,
  type QuoteInput,
  type QuoteIssue,
  type RenterChoice,
} from './rentals-client'

/** The field a coded issue belongs to (shown next to it); unknown codes go to the dialog. */
export const FIELD_OF_ISSUE: Partial<Record<string, RentalField>> = {
  facilities_reference_invalid: 'place',
  rental_units_invalid: 'units',
  rental_rate_missing: 'category',
  rental_renter_invalid: 'renter',
  entry_ban_active: 'renter',
  zone_not_reservable: 'start',
  rental_conflict: 'start',
  place_closed: 'start',
}

export type RentalField = 'place' | 'start' | 'units' | 'renter' | 'category'

const UNIT_CHOICES = Array.from(
  { length: MAX_RENTAL_UNITS - MIN_RENTAL_UNITS + 1 },
  (_, index) => MIN_RENTAL_UNITS + index,
)

type StaffVia = (typeof STAFF_REQUESTED_VIA)[number]

/** Issue messages grouped by field, with their conflicts listed. */
export function issuesByField(t: Translate, issues: readonly QuoteIssue[]): Map<RentalField | 'form', IssueMessage[]> {
  const byField = new Map<RentalField | 'form', IssueMessage[]>()
  for (const issue of issues) {
    const field = FIELD_OF_ISSUE[issue.code] ?? 'form'
    const list = byField.get(field) ?? []
    list.push({
      code: issue.code,
      text: codedMessage({ code: issue.code }, t) ?? t('facilities.rentals.errors.save'),
      conflicts: (issue.conflicts ?? []).map((conflict) => conflictLabel(t, conflict)),
    })
    byField.set(field, list)
  }
  return byField
}

export type IssueMessage = { code: string; text: string; conflicts: string[] }

export function FieldIssues({ id, messages }: { id: string; messages: readonly IssueMessage[] | undefined }) {
  if (!messages || messages.length === 0) return null
  return (
    <div id={id} className="flex flex-col gap-1" role="alert">
      {messages.map((message) => (
        <div
          key={message.code}
          className="text-destructive text-xs"
          data-testid={`facilities-rental-issue-${message.code}`}
        >
          <p>{message.text}</p>
          {message.conflicts.length > 0 ? (
            <ul className="list-disc ps-4">
              {message.conflicts.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export type RentalDialogPreset = { placeId?: string | null; date?: string; time?: string }

export function RentalDialog({
  open,
  onOpenChange,
  places,
  preset,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  places: CrudFieldOption[]
  preset?: RentalDialogPreset
  onSaved: () => Promise<void>
}) {
  const t = useT()
  const ids = React.useId()
  const [placeId, setPlaceId] = React.useState(preset?.placeId ?? '')
  const [date, setDate] = React.useState(preset?.date ?? localToday())
  const [time, setTime] = React.useState(preset?.time ?? '')
  const [units, setUnits] = React.useState(1)
  const [renterType, setRenterType] = React.useState<RenterType>('institution')
  const [renterId, setRenterId] = React.useState<string | null>(null)
  const [renterName, setRenterName] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [contactName, setContactName] = React.useState('')
  const [contactPhone, setContactPhone] = React.useState('')
  const [contactEmail, setContactEmail] = React.useState('')
  const [via, setVia] = React.useState<StaffVia>('phone')
  const [accepted, setAccepted] = React.useState(false)
  const [notes, setNotes] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [saveIssues, setSaveIssues] = React.useState<QuoteIssue[]>([])
  const [missing, setMissing] = React.useState<Set<RentalField>>(new Set())
  const found = React.useRef(new Map<string, RenterChoice>())

  const startsAt = localInstant(date, time)
  const quoteInput: QuoteInput | null =
    placeId && category && startsAt
      ? {
          placeId,
          renterCategory: category,
          startsAt,
          units,
          renterType,
          ...(renterType !== 'unregistered' && renterId ? { renterId } : {}),
        }
      : null
  const quote = useRentalQuote(quoteInput)
  const quoteIssues = quoteInput ? (quote.data?.issues ?? []) : []
  const issues = issuesByField(t, saveIssues.length > 0 ? saveIssues : quoteIssues)

  const resetSaveIssues = () => {
    setSaveIssues([])
    setProblem(null)
  }

  const fetchRenters = React.useCallback(
    async (query: string): Promise<LookupSelectItem[]> => {
      const result = renterType === 'person' ? await searchPersons(query) : await searchInstitutions(query)
      for (const entry of result.found) found.current.set(entry.id, entry)
      return result.items
    },
    [renterType],
  )

  const chooseRenter = (next: string | null) => {
    setRenterId(next)
    resetSaveIssues()
    const choice = next ? found.current.get(next) : undefined
    if (!choice || renterType !== 'institution') return
    // An institution's contact prefills empty contact fields; staff can change them.
    if (!contactName && choice.contactName) setContactName(choice.contactName)
    if (!contactPhone && choice.contactPhone) setContactPhone(choice.contactPhone)
    if (!contactEmail && choice.contactEmail) setContactEmail(choice.contactEmail)
  }

  const validate = (): boolean => {
    const next = new Set<RentalField>()
    if (!placeId) next.add('place')
    if (!startsAt) next.add('start')
    if (!category) next.add('category')
    if (renterType === 'unregistered' ? !renterName.trim() : !renterId) next.add('renter')
    setMissing(next)
    setProblem(next.size > 0 ? t('facilities.errors.invalid') : null)
    return next.size === 0
  }

  const submit = async () => {
    if (pending || !validate() || !startsAt) return
    setPending(true)
    resetSaveIssues()
    try {
      await apiCallOrThrow(
        RENTALS_URL,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            placeId,
            renterType,
            ...(renterType === 'unregistered' ? { renterDisplayName: renterName.trim() } : { renterId }),
            renterCategory: category,
            startsAt,
            units,
            contactName: textOrNull(contactName),
            contactPhone: textOrNull(contactPhone),
            contactEmail: textOrNull(contactEmail),
            requestedVia: via,
            regulationsAccepted: accepted,
            notes: textOrNull(notes),
          }),
        },
        { errorMessage: t('facilities.rentals.errors.save') },
      )
      flash(t('facilities.rentals.flash.created'), 'success')
      onOpenChange(false)
      await onSaved()
    } catch (error: unknown) {
      const issue = issueOfError(error)
      if (issue && codedMessage(error, t) && FIELD_OF_ISSUE[issue.code]) {
        setSaveIssues([issue])
        setProblem(t('facilities.rentals.errors.refused'))
      } else {
        setProblem(codedMessage(error, t) ?? errorMessage(error, t('facilities.rentals.errors.save')))
      }
    } finally {
      setPending(false)
    }
  }

  const issueId = (field: RentalField) => `${ids}-${field}-issues`
  const fieldInvalid = (field: RentalField) => missing.has(field) || issues.has(field)
  const describedBy = (field: RentalField) => (issues.has(field) ? issueId(field) : undefined)
  const required = (field: RentalField) =>
    missing.has(field) ? (
      <p className="text-destructive text-xs" role="alert">
        {t(`facilities.rentals.errors.required.${field}`)}
      </p>
    ) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        closeAriaLabel={t('facilities.common.close')}
        data-testid="facilities-rental-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('facilities.rentals.create.title')}</DialogTitle>
          <DialogDescription>{t('facilities.rentals.create.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-place`}>{t('facilities.fields.place')}</Label>
            <Select
              value={placeId}
              disabled={pending}
              onValueChange={(next: string) => {
                setPlaceId(next)
                resetSaveIssues()
              }}
            >
              <SelectTrigger
                id={`${ids}-place`}
                data-testid="facilities-rental-place"
                aria-invalid={fieldInvalid('place') ? true : undefined}
                aria-describedby={describedBy('place')}
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
            {required('place')}
            <FieldIssues id={issueId('place')} messages={issues.get('place')} />
          </div>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-date`}>{t('facilities.rentals.fields.date')}</Label>
                <Input
                  id={`${ids}-date`}
                  type="date"
                  required
                  value={date}
                  disabled={pending}
                  data-testid="facilities-rental-date"
                  aria-invalid={fieldInvalid('start') ? true : undefined}
                  aria-describedby={describedBy('start')}
                  onChange={(event) => {
                    setDate(event.target.value)
                    resetSaveIssues()
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
                  data-testid="facilities-rental-time"
                  aria-invalid={fieldInvalid('start') ? true : undefined}
                  aria-describedby={describedBy('start')}
                  onChange={(event) => {
                    setTime(event.target.value)
                    resetSaveIssues()
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-units`}>{t('facilities.rentals.fields.units')}</Label>
                <Select
                  value={String(units)}
                  disabled={pending}
                  onValueChange={(next: string) => {
                    setUnits(Number(next))
                    resetSaveIssues()
                  }}
                >
                  <SelectTrigger
                    id={`${ids}-units`}
                    data-testid="facilities-rental-units"
                    aria-invalid={fieldInvalid('units') ? true : undefined}
                    aria-describedby={describedBy('units')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_CHOICES.map((count) => (
                      <SelectItem key={count} value={String(count)}>
                        {t('facilities.rentals.units.option', { units: count, minutes: count * 90 })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {required('start')}
            <FieldIssues id={issueId('start')} messages={issues.get('start')} />
            <FieldIssues id={issueId('units')} messages={issues.get('units')} />
          </div>

          <div className="flex flex-col gap-2">
            <span id={`${ids}-renter-type`} className="text-sm font-medium">
              {t('facilities.rentals.fields.renterType')}
            </span>
            <SegmentedControl
              value={renterType}
              onValueChange={(next: string) => {
                const type = RENTER_TYPES.find((entry) => entry === next) ?? 'institution'
                setRenterType(type)
                setRenterId(null)
                resetSaveIssues()
              }}
              aria-labelledby={`${ids}-renter-type`}
              data-testid="facilities-rental-renter-type"
            >
              {RENTER_TYPES.map((type) => (
                <SegmentedControlItem key={type} value={type}>
                  {t(`facilities.rentals.renterType.${type}`)}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
            {renterType === 'unregistered' ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-renter-name`}>{t('facilities.rentals.fields.renterName')}</Label>
                <Input
                  id={`${ids}-renter-name`}
                  value={renterName}
                  maxLength={200}
                  disabled={pending}
                  data-testid="facilities-rental-renter-name"
                  aria-invalid={fieldInvalid('renter') ? true : undefined}
                  aria-describedby={describedBy('renter')}
                  onChange={(event) => {
                    setRenterName(event.target.value)
                    resetSaveIssues()
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1" data-testid="facilities-rental-renter-search">
                <Label>
                  {renterType === 'person'
                    ? t('facilities.rentals.fields.person')
                    : t('facilities.rentals.fields.institution')}
                </Label>
                <LookupSelect
                  key={renterType}
                  value={renterId}
                  onChange={chooseRenter}
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
            {required('renter')}
            <FieldIssues id={issueId('renter')} messages={issues.get('renter')} />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-category`}>{t('facilities.rates.fields.category')}</Label>
            <Select
              value={category}
              disabled={pending}
              onValueChange={(next: string) => {
                setCategory(next)
                resetSaveIssues()
              }}
            >
              <SelectTrigger
                id={`${ids}-category`}
                data-testid="facilities-rental-category"
                aria-invalid={fieldInvalid('category') ? true : undefined}
                aria-describedby={describedBy('category')}
              >
                <SelectValue placeholder={t('facilities.rentals.fields.category.choose')} />
              </SelectTrigger>
              <SelectContent>
                {RENTER_CATEGORIES.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {t(`facilities.rates.category.${entry}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {required('category')}
            <FieldIssues id={issueId('category')} messages={issues.get('category')} />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t('facilities.rentals.fields.contact')}</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-contact-name`}>{t('facilities.rentals.fields.contactName')}</Label>
                <Input
                  id={`${ids}-contact-name`}
                  value={contactName}
                  maxLength={200}
                  autoComplete="off"
                  disabled={pending}
                  data-testid="facilities-rental-contact-name"
                  onChange={(event) => {
                    setContactName(event.target.value)
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-contact-phone`}>{t('facilities.rentals.fields.contactPhone')}</Label>
                <Input
                  id={`${ids}-contact-phone`}
                  type="tel"
                  value={contactPhone}
                  maxLength={50}
                  autoComplete="off"
                  disabled={pending}
                  data-testid="facilities-rental-contact-phone"
                  onChange={(event) => {
                    setContactPhone(event.target.value)
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-contact-email`}>{t('facilities.rentals.fields.contactEmail')}</Label>
                <Input
                  id={`${ids}-contact-email`}
                  type="email"
                  value={contactEmail}
                  maxLength={320}
                  autoComplete="off"
                  disabled={pending}
                  data-testid="facilities-rental-contact-email"
                  onChange={(event) => {
                    setContactEmail(event.target.value)
                  }}
                />
              </div>
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-via`}>{t('facilities.rentals.fields.requestedVia')}</Label>
              <Select
                value={via}
                disabled={pending}
                onValueChange={(next: string) => {
                  setVia(STAFF_REQUESTED_VIA.find((entry) => entry === next) ?? 'phone')
                }}
              >
                <SelectTrigger id={`${ids}-via`} data-testid="facilities-rental-via">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_REQUESTED_VIA.map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      {t(`facilities.rentals.requestedVia.${entry}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Checkbox
                id={`${ids}-accepted`}
                checked={accepted}
                disabled={pending}
                data-testid="facilities-rental-regulations"
                onCheckedChange={(value) => {
                  setAccepted(value === true)
                }}
              />
              <Label htmlFor={`${ids}-accepted`}>
                {t('facilities.rentals.fields.regulationsAccepted', {
                  via: t(`facilities.rentals.requestedVia.${via}.short`),
                })}
              </Label>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-notes`}>{t('facilities.rentals.fields.notes')}</Label>
            <Textarea
              id={`${ids}-notes`}
              rows={2}
              maxLength={2000}
              value={notes}
              disabled={pending}
              data-testid="facilities-rental-notes"
              onChange={(event) => {
                setNotes(event.target.value)
              }}
            />
          </div>

          <QuotePanel
            ready={quoteInput !== null}
            quote={quote.data}
            loading={quoteInput !== null && quote.isFetching}
            error={quote.error}
            chosenCategory={category}
          />
          <FieldIssues id={`${ids}-form-issues`} messages={issues.get('form')} />

          {problem ? (
            <p className="text-destructive text-sm" role="alert" data-testid="facilities-rental-problem">
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
            {t('facilities.common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={pending}
            data-testid="facilities-rental-save"
            onClick={() => {
              void submit()
            }}
          >
            {pending ? t('facilities.common.saving') : t('facilities.rentals.actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
