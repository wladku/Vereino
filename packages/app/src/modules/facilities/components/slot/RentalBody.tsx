'use client'
// The rental kind of the slot dialog (facilities parity spec `SlotDialog`, DD-R05, DD-R07; B-24 "New rental"; #277), the
// body of the former "New rental" dialog (#122): the renter found by `GET /api/facilities/renters` — an institution,
// a person or an earlier unregistered renter — or typed in as a renter not in the register; the category, the units,
// the contact (a picked renter fills the empty contact fields with their last contact), the purpose, the notes, how
// the rental was taken and the rules accepted. The live quote is asked on every change of place, start, units,
// category or renter, and its issues are shown at their fields before saving; a refused save does the same, and a
// 409 `rental_conflict` lists the colliding entries by name in the dialog.
import * as React from 'react'
import { LookupSelect, type LookupSelectItem } from '@open-mercato/ui/backend/inputs'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { RENTER_CATEGORIES } from '../../lib/rates'
import { MAX_RENTAL_UNITS, MIN_RENTAL_UNITS, STAFF_REQUESTED_VIA, type RenterType } from '../../lib/rentals'
import { codedMessage, errorMessage, minorToAmount, textOrNull } from '../facilities-client'
import { QuotePanel } from '../RentalQuotePanel'
import { FIELD_OF_ISSUE, FieldIssues, issuesByField, type IssueMessage, type RentalField } from '../rental-issues'
import {
  RENTALS_URL,
  clubDateOf,
  clubTimeOf,
  issueOfError,
  useRentalQuote,
  type QuoteInput,
  type QuoteIssue,
} from '../rentals-client'
import { bookingConflicts } from '../club-places/places-client'
import { bookingCollisionLines, renterKey, searchRenters, type RenterOption } from './slot-client'
import type { SlotBodyProps } from './slot-types'

const UNIT_CHOICES = Array.from(
  { length: MAX_RENTAL_UNITS - MIN_RENTAL_UNITS + 1 },
  (_, index) => MIN_RENTAL_UNITS + index,
)

const PURPOSE_MAX = 500

type StaffVia = (typeof STAFF_REQUESTED_VIA)[number]

type RentalCreated = {
  amount?: number
  paymentDeadline?: string | null
  cancellationDeadline?: string | null
}

/** Units are owned by the dialog (the rental's end follows them); the rest of the rental lives here. */
export function RentalBody({
  formId,
  placeId,
  startsAt,
  timeZone,
  disabled,
  units,
  onUnits,
  report,
  onDone,
}: SlotBodyProps & { units: number; onUnits: (units: number) => void }) {
  const t = useT()
  const ids = React.useId()
  const [registered, setRegistered] = React.useState(true)
  const [renter, setRenter] = React.useState<RenterOption | null>(null)
  const [renterName, setRenterName] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [contactName, setContactName] = React.useState('')
  const [contactPhone, setContactPhone] = React.useState('')
  const [contactEmail, setContactEmail] = React.useState('')
  const [purpose, setPurpose] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [via, setVia] = React.useState<StaffVia>('phone')
  const [accepted, setAccepted] = React.useState(false)
  const [saveIssues, setSaveIssues] = React.useState<QuoteIssue[]>([])
  const [missing, setMissing] = React.useState<Set<RentalField>>(new Set())
  const found = React.useRef(new Map<string, RenterOption>())

  const renterType: RenterType = registered ? (renter?.renterType ?? 'institution') : 'unregistered'
  const renterId = registered && renter?.renterType !== 'unregistered' ? (renter?.renterId ?? null) : null
  const quoteInput: QuoteInput | null =
    placeId && category && startsAt
      ? { placeId, renterCategory: category, startsAt, units, renterType, ...(renterId ? { renterId } : {}) }
      : null
  const quote = useRentalQuote(quoteInput)
  const quoteIssues = quoteInput ? (quote.data?.issues ?? []) : []
  const issues = issuesByField(t, saveIssues.length > 0 ? saveIssues : quoteIssues, timeZone)
  const startMessages = issues.get('start')
  const startKey = JSON.stringify(startMessages ?? [])

  // The start field belongs to the dialog: its issues are shown there.
  React.useEffect(() => {
    report.startIssues(JSON.parse(startKey) as IssueMessage[])
  }, [startKey, report])

  const resetSave = () => {
    setSaveIssues([])
    report.collisions(null)
    report.problem(null)
  }

  const fetchRenters = React.useCallback(
    async (query: string): Promise<LookupSelectItem[]> => {
      const result = await searchRenters(t, query, placeId || null)
      for (const option of result.found) found.current.set(renterKey(option), option)
      return result.items
    },
    [t, placeId],
  )

  const chooseRenter = (key: string | null) => {
    const option = key ? (found.current.get(key) ?? null) : null
    setRenter(option)
    resetSave()
    if (!option) return
    // A picked renter fills the empty contact fields with the last contact used; staff can change them.
    const contact = option.lastContact
    if (contact) {
      if (!contactName && contact.name) setContactName(contact.name)
      if (!contactPhone && contact.phone) setContactPhone(contact.phone)
      if (!contactEmail && contact.email) setContactEmail(contact.email)
    }
    if (!category && option.lastCategory && (RENTER_CATEGORIES as readonly string[]).includes(option.lastCategory)) {
      setCategory(option.lastCategory)
    }
  }

  const validate = (): boolean => {
    const next = new Set<RentalField>()
    if (!placeId) next.add('place')
    if (!startsAt) next.add('start')
    if (!category) next.add('category')
    if (registered ? !renter : !renterName.trim()) next.add('renter')
    setMissing(next)
    report.problem(next.size > 0 ? t('facilities.errors.invalid') : null)
    return next.size === 0
  }

  const submit = async () => {
    if (disabled || !validate() || !startsAt) return
    report.pending(true)
    resetSave()
    try {
      const call = await apiCallOrThrow<RentalCreated>(
        RENTALS_URL,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            placeId,
            renterType,
            ...(renterType === 'unregistered'
              ? { renterDisplayName: registered ? renter?.displayName : renterName.trim() }
              : { renterId }),
            renterCategory: category,
            startsAt,
            units,
            contactName: textOrNull(contactName),
            contactPhone: textOrNull(contactPhone),
            contactEmail: textOrNull(contactEmail),
            purpose: textOrNull(purpose),
            requestedVia: via,
            regulationsAccepted: accepted,
            notes: textOrNull(notes),
          }),
        },
        { errorMessage: t('facilities.rentals.errors.save') },
      )
      const created = call.result ?? {}
      const deadline = (iso: string | null | undefined) =>
        iso ? `${clubDateOf(iso, timeZone)} ${clubTimeOf(iso, timeZone)}` : t('facilities.common.empty')
      await onDone(
        t('facilities.slot.saved.rental', {
          amount: minorToAmount(created.amount ?? 0),
          payBy: deadline(created.paymentDeadline),
          cancelBy: deadline(created.cancellationDeadline),
        }),
      )
    } catch (error: unknown) {
      const issue = issueOfError(error)
      const conflicts = bookingConflicts({ conflicts: (error as { conflicts?: unknown } | null)?.conflicts })
      if (errorCodeOf(error) === 'rental_conflict' && conflicts.length > 0) {
        // The colliding entries by name (labelled by the command, #277).
        report.collisions(bookingCollisionLines(t, conflicts, timeZone))
      } else if (issue && codedMessage(error, t) && FIELD_OF_ISSUE[issue.code]) {
        setSaveIssues([issue])
        report.problem(t('facilities.rentals.errors.refused'))
      } else {
        report.problem(codedMessage(error, t) ?? errorMessage(error, t('facilities.rentals.errors.save')))
      }
    } finally {
      report.pending(false)
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
    <form
      id={formId}
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      {required('place')}
      {required('start')}
      <FieldIssues id={issueId('place')} messages={issues.get('place')} />

      <div className="flex flex-col gap-2">
        {registered ? (
          <div className="flex flex-col gap-1" data-testid="facilities-rental-renter-search">
            <Label>{t('facilities.slot.renter')}</Label>
            <LookupSelect
              value={renter ? renterKey(renter) : null}
              onChange={chooseRenter}
              fetchItems={fetchRenters}
              minQuery={2}
              placeholder={t('facilities.rentals.renter.placeholder')}
              searchPlaceholder={t('facilities.slot.renterSearch')}
              emptyLabel={t('facilities.rentals.renter.empty')}
              loadingLabel={t('facilities.common.loading')}
              clearLabel={t('facilities.rentals.renter.clear')}
              selectLabel={t('facilities.rentals.renter.select')}
              selectedLabel={t('facilities.rentals.renter.selected')}
              disabled={disabled}
            />
            {renter ? (
              <p className="text-muted-foreground text-xs" data-testid="facilities-slot-renter-chosen">
                {t('facilities.slot.renterChosen', {
                  name: renter.displayName,
                  type: t(`facilities.slot.renterType.${renter.renterType}`),
                })}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-renter-name`}>{t('facilities.rentals.fields.renterName')}</Label>
            <Input
              id={`${ids}-renter-name`}
              value={renterName}
              maxLength={200}
              disabled={disabled}
              data-testid="facilities-rental-renter-name"
              aria-invalid={fieldInvalid('renter') ? true : undefined}
              aria-describedby={describedBy('renter')}
              onChange={(event) => {
                setRenterName(event.target.value)
                resetSave()
              }}
            />
          </div>
        )}
        <div>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0"
            disabled={disabled}
            data-testid="facilities-slot-renter-mode"
            onClick={() => {
              setRegistered((current) => !current)
              setRenter(null)
              resetSave()
            }}
          >
            {registered ? t('facilities.slot.renterUnregistered') : t('facilities.slot.renterRegistered')}
          </Button>
        </div>
        {required('renter')}
        <FieldIssues id={issueId('renter')} messages={issues.get('renter')} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${ids}-category`}>{t('facilities.rates.fields.category')}</Label>
          <Select
            value={category}
            disabled={disabled}
            onValueChange={(next: string) => {
              setCategory(next)
              resetSave()
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
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${ids}-units`}>{t('facilities.rentals.fields.units')}</Label>
          <Select
            value={String(units)}
            disabled={disabled}
            onValueChange={(next: string) => {
              onUnits(Number(next))
              resetSave()
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
          <FieldIssues id={issueId('units')} messages={issues.get('units')} />
        </div>
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
              disabled={disabled}
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
              disabled={disabled}
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
              disabled={disabled}
              data-testid="facilities-rental-contact-email"
              onChange={(event) => {
                setContactEmail(event.target.value)
              }}
            />
          </div>
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${ids}-purpose`}>{t('facilities.slot.rentalPurpose')}</Label>
          <Input
            id={`${ids}-purpose`}
            value={purpose}
            maxLength={PURPOSE_MAX}
            disabled={disabled}
            data-testid="facilities-rental-purpose"
            onChange={(event) => {
              setPurpose(event.target.value)
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${ids}-via`}>{t('facilities.rentals.fields.requestedVia')}</Label>
          <Select
            value={via}
            disabled={disabled}
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
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${ids}-notes`}>{t('facilities.rentals.fields.notes')}</Label>
        <Textarea
          id={`${ids}-notes`}
          rows={2}
          maxLength={2000}
          value={notes}
          disabled={disabled}
          data-testid="facilities-rental-notes"
          onChange={(event) => {
            setNotes(event.target.value)
          }}
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={`${ids}-accepted`}
          checked={accepted}
          disabled={disabled}
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

      <div aria-live="polite">
        <QuotePanel
          ready={quoteInput !== null}
          quote={quote.data}
          loading={quoteInput !== null && quote.isFetching}
          error={quote.error}
          chosenCategory={category}
        />
      </div>
      <FieldIssues id={`${ids}-form-issues`} messages={issues.get('form')} />
    </form>
  )
}
