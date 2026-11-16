'use client'
// `/backend/facilities/rentals/[id]` — one rental (facilities parity spec REQ-R05, DD-R08, UI row
// `/backend/facilities/rentals/[id]`; #279): the header names the renter, the place, the slot, the status and "to be
// moved"; the sections are Renter and contact (a `CrudForm` that corrects the contact, the purpose and the notes and
// assigns a registered renter to an unregistered one — only the notes once the rental has left its slot), Money (the
// amount, the category, the units, the payment and free-cancellation deadlines, the payee, the charge state) and
// History (how it was taken, rules accepted, e-mail confirmed, the decision's reason; the audit entries open from the
// form's version history). The actions are those of the list (Confirm payment, Cancel, Move, No-show). A stale save opens
// the shared conflict dialog (`CrudForm` optimistic lock), a closed rental answers 409 `rental_closed`. Reused by the
// attendant's phone page (E11-S08).
import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { AccessDeniedMessage, ErrorMessage, LoadingMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { LookupSelect, type LookupSelectItem } from '@open-mercato/ui/backend/inputs'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CORRECTABLE_RENTAL_STATUSES } from '../lib/rental-record'
import { RentalAmount, RentalBadges } from './RentalsTable'
import { useRentalActions } from './RentalRowActions'
import { placeLabel, usePlaceOptions, type Translate } from './facilities-client'
import {
  RENTALS_HREF,
  RENTALS_KEY,
  RENTALS_URL,
  REQUESTS_HREF,
  chargeStateVariant,
  clubDateOf,
  clubTimeOf,
  payeeLabel,
  rentalActions,
  searchInstitutions,
  searchPersons,
  slotLabel,
  useRentalTimeZone,
  type RentalCorrection,
  type RentalRow,
} from './rentals-client'

type RentalLoad = { status: 'ok'; rental: RentalRow } | { status: 'not_found' } | { status: 'denied' }

type CorrectionValues = {
  id: string
  updatedAt: string | null
  renterType: '' | 'institution' | 'person'
  renterId: string
  contactName: string
  contactPhone: string
  contactEmail: string
  purpose: string
  notes: string
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** The `PUT` body of the form values: the renter record only when one was chosen. */
function correctionOf(
  values: Partial<CorrectionValues>,
  withContact: boolean,
): RentalCorrection | { notes: string | null } {
  if (!withContact) return { notes: text(values.notes) }
  const renterType = values.renterType
  const renterId = text(values.renterId)
  return {
    contactName: text(values.contactName),
    contactPhone: text(values.contactPhone),
    contactEmail: text(values.contactEmail),
    purpose: text(values.purpose),
    notes: text(values.notes),
    ...(renterType && renterId ? { renterType, renterId } : {}),
  }
}

/** The search of a registered renter for the type the form names (institutions by default). */
function RenterPicker({
  id,
  value,
  disabled,
  renterType,
  setValue,
  t,
}: {
  id: string
  value: unknown
  disabled?: boolean
  renterType: unknown
  setValue: (value: unknown) => void
  t: Translate
}) {
  const fetchItems = React.useCallback(
    async (query: string): Promise<LookupSelectItem[]> =>
      (renterType === 'person' ? await searchPersons(query) : await searchInstitutions(query)).items,
    [renterType],
  )
  if (renterType !== 'institution' && renterType !== 'person') {
    return <p className="text-muted-foreground text-sm">{t('facilities.rentals.record.renterRecord.none')}</p>
  }
  return (
    <div id={id} data-testid="facilities-rental-record-renter">
      <LookupSelect
        key={renterType}
        value={typeof value === 'string' && value ? value : null}
        disabled={disabled}
        onChange={(next: string | null) => {
          setValue(next ?? '')
        }}
        fetchItems={fetchItems}
        minQuery={0}
        placeholder={t('facilities.rentals.renter.placeholder')}
        searchPlaceholder={t('facilities.rentals.renter.search')}
        emptyLabel={t('facilities.rentals.renter.empty')}
        loadingLabel={t('facilities.common.loading')}
        clearLabel={t('facilities.rentals.renter.clear')}
        selectLabel={t('facilities.rentals.renter.select')}
        selectedLabel={t('facilities.rentals.renter.selected')}
      />
    </div>
  )
}

function useCorrectionForm(t: Translate, withContact: boolean, withRenter: boolean) {
  const fields = React.useMemo<CrudField[]>(() => {
    const notes: CrudField = {
      id: 'notes',
      label: t('facilities.rentals.fields.notes'),
      type: 'textarea',
      maxLength: 2000,
    }
    if (!withContact) return [notes]
    return [
      ...(withRenter
        ? ([
            {
              id: 'renterType',
              label: t('facilities.rentals.record.renterRecord.label'),
              type: 'select',
              description: t('facilities.rentals.record.renterRecord.help'),
              options: [
                { value: '', label: t('facilities.rentals.record.renterRecord.keep') },
                { value: 'institution', label: t('facilities.rentals.renterType.institution') },
                { value: 'person', label: t('facilities.rentals.renterType.person') },
              ],
            },
            {
              id: 'renterId',
              label: t('facilities.rentals.record.renterRecord.choose'),
              type: 'custom',
              component: ({ id, value, disabled, values, setValue }) => (
                <RenterPicker
                  id={id}
                  value={value}
                  disabled={disabled}
                  renterType={values?.renterType}
                  setValue={setValue}
                  t={t}
                />
              ),
            },
          ] satisfies CrudField[])
        : []),
      { id: 'contactName', label: t('facilities.rentals.fields.contactName'), type: 'text', maxLength: 200 },
      { id: 'contactPhone', label: t('facilities.rentals.fields.contactPhone'), type: 'text', maxLength: 50 },
      { id: 'contactEmail', label: t('facilities.rentals.fields.contactEmail'), type: 'text', maxLength: 320 },
      { id: 'purpose', label: t('facilities.rentals.fields.purpose'), type: 'text', maxLength: 500 },
      notes,
    ]
  }, [t, withContact, withRenter])
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'renter',
        title: t('facilities.rentals.record.sections.renter'),
        column: 1,
        fields: fields.map((field) => field.id),
      },
    ],
    [t, fields],
  )
  return { fields, groups }
}

/** One label and value of a read-only section. */
function Fact({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-wrap">{children}</dd>
    </div>
  )
}

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  return (
    <section className="bg-card flex flex-col gap-3 rounded-lg border p-4" aria-label={title} data-testid={testId}>
      <h2 className="text-base font-semibold">{title}</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  )
}

/** "2027-01-05 17:00" in the club zone. */
function instantLabel(iso: string | null, timeZone: string, empty: string): string {
  return iso ? `${clubDateOf(iso, timeZone)} ${clubTimeOf(iso, timeZone)}` : empty
}

export function RentalRecord({ id }: { id: string }) {
  const t = useT()
  const timeZone = useRentalTimeZone()
  const queryClient = useQueryClient()
  const places = usePlaceOptions()
  const query = useQuery({
    queryKey: [RENTALS_KEY, 'record', id],
    queryFn: async (): Promise<RentalLoad> => {
      const call = await apiCall<{ items?: RentalRow[] }>(`${RENTALS_URL}?id=${encodeURIComponent(id)}`)
      if (call.status === 403) return { status: 'denied' }
      if (!call.ok || !call.result) throw new Error(t('facilities.rentals.record.errors.load'))
      const rental = call.result.items?.at(0)
      return rental ? { status: 'ok', rental } : { status: 'not_found' }
    },
  })
  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [RENTALS_KEY] })
  }, [queryClient])
  const actions = useRentalActions({ places, onDone: refresh })
  const load = query.data
  const rental = load?.status === 'ok' ? load.rental : null
  const withContact = rental ? CORRECTABLE_RENTAL_STATUSES.includes(rental.status) : false
  const withRenter = withContact && rental?.renterType === 'unregistered'
  const form = useCorrectionForm(t, withContact, withRenter)

  if (query.isLoading) return <LoadingMessage label={t('facilities.rentals.record.loading')} />
  if (query.error) return <ErrorMessage label={t('facilities.rentals.record.errors.load')} />
  if (load?.status === 'denied') return <AccessDeniedMessage label={t('facilities.rentals.record.errors.denied')} />
  if (!rental) {
    return (
      <RecordNotFoundState
        label={t('facilities.rentals.record.errors.notFound')}
        backHref={RENTALS_HREF}
        backLabel={t('facilities.rentals.record.back')}
      />
    )
  }

  const empty = t('facilities.common.empty')
  const placeName = placeLabel(t, places.names, rental.placeId)
  const available = rentalActions(rental.status)
  return (
    <div className="flex flex-col gap-4" data-testid="facilities-rental-record">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold break-words" data-testid="facilities-rental-record-renter-name">
            {rental.renterDisplayName ?? t('facilities.rentals.record.title')}
          </h1>
          <span className="text-muted-foreground text-sm" data-testid="facilities-rental-record-slot">
            {placeName} · {slotLabel(rental.startsAt, rental.endsAt, timeZone)}
          </span>
          <RentalBadges row={rental} t={t} />
        </div>
        <div className="flex flex-wrap gap-2" data-testid="facilities-rental-record-actions">
          {rental.status === 'pending_approval' ? (
            <Button asChild size="sm" variant="outline">
              <Link href={REQUESTS_HREF}>{t('facilities.rentals.list.decision')}</Link>
            </Button>
          ) : null}
          {available.map((action) => (
            <Button
              key={action}
              type="button"
              size="sm"
              variant={action === 'cancel' || action === 'noShow' ? 'destructive-outline' : 'outline'}
              data-testid={`facilities-rental-record-${action}`}
              onClick={() => {
                actions.run(rental, action)
              }}
            >
              {action === 'confirm' || action === 'cancel'
                ? t(`facilities.rentals.list.${action}`)
                : t(`facilities.rentals.actions.${action}`)}
            </Button>
          ))}
        </div>
      </header>

      {withContact ? null : (
        <p className="text-muted-foreground text-sm" role="note" data-testid="facilities-rental-record-closed">
          {t('facilities.rentals.record.closedNotice')}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          {withContact ? null : (
            <Section title={t('facilities.rentals.record.sections.contact')} testId="facilities-rental-record-contact">
              <Fact label={t('facilities.rentals.fields.contactName')}>{rental.contactName ?? empty}</Fact>
              <Fact label={t('facilities.rentals.fields.contactPhone')}>{rental.contactPhone ?? empty}</Fact>
              <Fact label={t('facilities.rentals.fields.contactEmail')}>{rental.contactEmail ?? empty}</Fact>
              <Fact label={t('facilities.rentals.fields.purpose')}>{rental.purpose ?? empty}</Fact>
            </Section>
          )}
          <div className="bg-card rounded-lg border p-4" data-testid="facilities-rental-record-form">
            <CrudForm<CorrectionValues>
              key={rental.updatedAt ?? rental.id}
              embedded
              entityId="facilities:rental"
              fields={form.fields}
              groups={form.groups}
              versionHistory={{ resourceKind: 'facilities.rental', resourceId: rental.id }}
              initialValues={{
                id: rental.id,
                updatedAt: rental.updatedAt,
                renterType: '',
                renterId: '',
                contactName: rental.contactName ?? '',
                contactPhone: rental.contactPhone ?? '',
                contactEmail: rental.contactEmail ?? '',
                purpose: rental.purpose ?? '',
                notes: rental.notes ?? '',
              }}
              submitLabel={t('facilities.rentals.record.save')}
              onSubmit={async (values) => {
                await updateCrud('facilities/rentals', { id: rental.id, ...correctionOf(values, withContact) })
                flash(t('facilities.rentals.record.saved'), 'success')
                await refresh()
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Section title={t('facilities.rentals.record.sections.money')} testId="facilities-rental-record-money">
            <Fact label={t('facilities.rentals.columns.amount')}>
              <RentalAmount row={rental} t={t} />
            </Fact>
            <Fact label={t('facilities.rentals.record.fields.category')}>
              {rental.renterCategory ? t(`facilities.rates.category.${rental.renterCategory}`) : empty}
            </Fact>
            <Fact label={t('facilities.rentals.fields.units')}>
              {t('facilities.rentals.units.label', { units: rental.units, minutes: rental.units * 90 })}
            </Fact>
            <Fact label={t('facilities.rentals.record.fields.paymentDeadline')}>
              {instantLabel(rental.paymentDeadline, timeZone, empty)}
            </Fact>
            <Fact label={t('facilities.rentals.record.fields.cancellationDeadline')}>
              {instantLabel(rental.cancellationDeadline, timeZone, empty)}
            </Fact>
            <Fact label={t('facilities.rentals.record.fields.payee')}>{payeeLabel(t, rental.payee)}</Fact>
            <Fact label={t('facilities.rentals.record.fields.chargeState')} testId="facilities-rental-record-charge">
              <StatusBadge variant={chargeStateVariant(rental.chargeState)}>
                {t(`facilities.rentals.chargeState.${rental.chargeState}`)}
              </StatusBadge>
            </Fact>
          </Section>
          <Section title={t('facilities.rentals.record.sections.history')} testId="facilities-rental-record-history">
            <Fact label={t('facilities.rentals.columns.source')}>
              {rental.requestedVia ? t(`facilities.rentals.requestedVia.${rental.requestedVia}`) : empty}
            </Fact>
            <Fact label={t('facilities.rentals.record.fields.regulationsAccepted')}>
              {rental.regulationsAcceptedAt
                ? `${instantLabel(rental.regulationsAcceptedAt, timeZone, empty)}${
                    rental.regulationsAcceptedVia
                      ? ` (${t(`facilities.rentals.requestedVia.${rental.regulationsAcceptedVia}`)})`
                      : ''
                  }`
                : t('facilities.common.no')}
            </Fact>
            <Fact label={t('facilities.rentals.record.fields.emailVerified')}>
              {rental.emailVerifiedAt ? instantLabel(rental.emailVerifiedAt, timeZone, empty) : empty}
            </Fact>
            <Fact label={t('facilities.rentals.record.fields.decision')}>{rental.decisionReason ?? empty}</Fact>
          </Section>
        </div>
      </div>
      {actions.element}
    </div>
  )
}
