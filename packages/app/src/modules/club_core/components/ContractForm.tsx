'use client'
// `/backend/club/contracts/create` and `/backend/club/contracts/[id]/edit` (club spec UI table; README B-07; #96): a
// contract with a person or an institution for a period. A coach contract is always with a person and carries the
// rates of the club's current settlement model (entered in złoty, sent in grosz); a management agreement carries the
// rental terms of the owner's places, "Warunki wynajmu" (facilities parity spec DD-R10, REQ-R07; #284). The party and
// the kind are fixed once the contract exists.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { ComboboxInput, type ComboboxOption } from '@open-mercato/ui/backend/inputs'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrud, deleteCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { PickerEmptyHint, PickerSelect, dateField } from '@vereino/ui'
import {
  COACH_TERMS_BY_MODEL,
  CONTRACT_KINDS,
  CONTRACT_PARTY_TYPES,
  FACILITY_TERM_FIELDS,
  MAX_PAYMENT_DEADLINE_DAYS,
  type CoachSettlementModel,
  type CoachTermField,
} from '../lib/contracts'
import { enumOptions, errorMessage, textOrNull, type Translate } from './client-helpers'
import { ContractAttachmentPanel } from './ContractAttachmentPanel'
import { groszToZloty, zlotyToGrosz, type ContractRow } from './contracts-shared'
import {
  PERSON_CREATE_HREF,
  institutionPicker,
  personHintLabels,
  usePickerFeatures,
  useSearchEmptyState,
} from './pickers'

const LIST_HREF = '/backend/club/contracts'
const ENTITY_ID = 'club_core:contract'
const RATES_GROUP = 'rates'
const RENTAL_TERMS_GROUP = 'rentalTerms'

type ContractFormValues = Record<string, unknown> & { updatedAt?: string | null }

type SettingsResponse = { coachSettlementModel: CoachSettlementModel }

type PersonRow = { id: string; firstName: string | null; lastName: string | null }

/** The club's current coach settlement model (`GET /api/club_core/settings`). */
function useSettlementModel() {
  return useQuery({
    queryKey: ['club_core-settings'],
    queryFn: () => readApiResultOrThrow<SettingsResponse>('/api/club_core/settings'),
    select: (settings) => settings.coachSettlementModel,
  })
}

function personLabel(person: PersonRow): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || person.id
}

async function personOptions(query?: string): Promise<ComboboxOption[]> {
  const params = new URLSearchParams({ pageSize: '20' })
  if (query?.trim()) params.set('search', query.trim())
  const data = await readApiResultOrThrow<{ items?: PersonRow[] }>(`/api/people/persons?${params.toString()}`)
  return (data.items ?? []).map((person) => ({ value: person.id, label: personLabel(person) }))
}

type KindSelectProps = {
  id: string
  value: unknown
  disabled?: boolean
  setValue: (value: unknown) => void
  setFormValue?: (id: string, value: unknown) => void
  onKindChange: (kind: string) => void
  t: Translate
}

/** The contract kind; a coach contract is with a person, so choosing it fixes the party type. */
function ContractKindSelect({ id, value, disabled, setValue, setFormValue, onKindChange, t }: KindSelectProps) {
  const current = typeof value === 'string' ? value : ''
  return (
    <Select
      value={current}
      onValueChange={(next) => {
        setValue(next)
        const isCoach = next === 'coach'
        setFormValue?.('isCoach', isCoach)
        if (isCoach) setFormValue?.('partyType', 'person')
        onKindChange(next)
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={t('club_core.contracts.fields.kind')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CONTRACT_KINDS.map((kind) => (
          <SelectItem key={kind} value={kind}>
            {t(`club_core.contracts.kind.${kind}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

type PartyPickerProps = {
  id: string
  value: unknown
  disabled?: boolean
  values?: Record<string, unknown>
  setValue: (value: unknown) => void
  t: Translate
}

/**
 * A person (searched as you type) or an institution of the club, per the chosen party type. An empty picker says what
 * is missing (people life-cycle spec REQ-L14, picker row 2): the institution is created in place, the person on its
 * own page through a link.
 */
function PartyPicker({ id, value, disabled, values, setValue, t }: PartyPickerProps) {
  const partyType = values?.partyType === 'institution' ? 'institution' : 'person'
  const current = typeof value === 'string' ? value : ''
  const previousType = React.useRef(partyType)
  const features = usePickerFeatures()
  const persons = useSearchEmptyState(personOptions)
  React.useEffect(() => {
    if (previousType.current === partyType) return
    previousType.current = partyType
    setValue('')
  }, [partyType, setValue])
  const canCreateInstitution = features['club_core.manage']
  const institution = React.useMemo(() => institutionPicker(t, canCreateInstitution), [t, canCreateInstitution])

  if (partyType === 'person') {
    return (
      <div className="flex flex-col gap-2">
        <ComboboxInput
          value={current}
          onChange={(next) => {
            setValue(next)
          }}
          placeholder={t('club_core.contracts.fields.person.placeholder')}
          loadSuggestions={persons.tracked}
          allowCustomValues={false}
          clearable={false}
          disabled={disabled}
        />
        {persons.empty && !current ? (
          <PickerEmptyHint
            state={persons.empty.term ? 'no-match' : 'none'}
            term={persons.empty.term}
            canCreate={features['people.manage']}
            create={{ kind: 'link', href: PERSON_CREATE_HREF }}
            labels={personHintLabels(t)}
            testId="club_core-contract-person-hint"
          />
        ) : null}
      </div>
    )
  }
  return (
    <PickerSelect
      {...institution}
      id={id}
      value={current}
      onChange={setValue}
      labels={{ ...institution.labels, label: t('club_core.contracts.fields.institution') }}
      required
      disabled={disabled}
      testId="club_core-contract-institution"
    />
  )
}

function rateFields(model: CoachSettlementModel, t: Translate): CrudField[] {
  return COACH_TERMS_BY_MODEL[model].map((field) => ({
    id: field,
    label: t(`club_core.contracts.fields.${field}`),
    type: 'text',
    required: true,
    layout: 'half',
    placeholder: t('club_core.contracts.fields.rate.placeholder'),
  }))
}

function ratesGroup(model: CoachSettlementModel, t: Translate): CrudFormGroup {
  return {
    id: RATES_GROUP,
    title: t('club_core.contracts.groups.rates'),
    description: t('club_core.contracts.groups.rates.help', {
      model: t(`club_core.settings.coachSettlementModel.${model}`),
    }),
    column: 2,
    fields: [...COACH_TERMS_BY_MODEL[model]],
  }
}

function rentalTermFields(t: Translate): CrudField[] {
  return [
    {
      id: 'paymentDeadlineDays',
      label: t('club_core.contracts.fields.paymentDeadlineDays'),
      type: 'number',
      layout: 'half',
      description: t('club_core.contracts.fields.paymentDeadlineDays.help', { max: MAX_PAYMENT_DEADLINE_DAYS }),
    },
    {
      id: 'autoExpireUnpaid',
      label: t('club_core.contracts.fields.autoExpireUnpaid'),
      type: 'checkbox',
      description: t('club_core.contracts.fields.autoExpireUnpaid.help'),
    },
  ]
}

function rentalTermsGroup(t: Translate): CrudFormGroup {
  return {
    id: RENTAL_TERMS_GROUP,
    title: t('club_core.contracts.groups.rentalTerms'),
    description: t('club_core.contracts.groups.rentalTerms.help'),
    column: 2,
    fields: [...FACILITY_TERM_FIELDS],
  }
}

/** The groups a contract of `kind` hides: the coach rates and the rental terms belong to one kind each. */
function hiddenGroupsFor(kind: unknown): string[] {
  return [...(kind === 'coach' ? [] : [RATES_GROUP]), ...(kind === 'facility_management' ? [] : [RENTAL_TERMS_GROUP])]
}

function periodFields(t: Translate): CrudField[] {
  return [
    dateField('validFrom', t('club_core.contracts.fields.validFrom'), { required: true, layout: 'half' }),
    dateField('validTo', t('club_core.contracts.fields.validTo'), {
      layout: 'half',
      description: t('club_core.contracts.fields.validTo.help'),
    }),
  ]
}

/**
 * The model's rates in grosz; a rate that is not an amount stops the save next to its field. Null for a contract
 * that is not a coach's (it stores no terms).
 */
function termsPayload(
  values: ContractFormValues,
  kind: unknown,
  model: CoachSettlementModel,
  t: Translate,
): Record<string, number | boolean> | null {
  if (kind === 'facility_management') return rentalTermsPayload(values, t)
  if (kind !== 'coach') return null
  const terms: Record<string, number> = {}
  const fieldErrors: Record<string, string> = {}
  for (const field of COACH_TERMS_BY_MODEL[model]) {
    const grosz = zlotyToGrosz(values[field])
    if (grosz === null) fieldErrors[field] = t('club_core.contracts.errors.rate')
    else terms[field] = grosz
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw createCrudFormError(t('club_core.contracts.errors.rates'), fieldErrors)
  }
  return terms
}

/**
 * The rental terms of a management agreement: the payment days when entered (a whole number 0–60, else the save stops
 * next to the field) and the expiry flag; null when neither is set, so the facilities defaults apply.
 */
function rentalTermsPayload(values: ContractFormValues, t: Translate): Record<string, number | boolean> | null {
  const terms: Record<string, number | boolean> = {}
  const raw = values.paymentDeadlineDays
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : ''
  if (text !== '') {
    const days = Number(text)
    if (!/^\d+$/.test(text) || days > MAX_PAYMENT_DEADLINE_DAYS) {
      const message = t('club_core.contracts.errors.paymentDeadlineDays', { max: MAX_PAYMENT_DEADLINE_DAYS })
      throw createCrudFormError(message, { paymentDeadlineDays: message })
    }
    terms.paymentDeadlineDays = days
  }
  if (values.autoExpireUnpaid === true) terms.autoExpireUnpaid = true
  return Object.keys(terms).length > 0 ? terms : null
}

function periodPayload(values: ContractFormValues) {
  return { validFrom: textOrNull(values.validFrom), validTo: textOrNull(values.validTo) }
}

function rentalTermValues(row: ContractRow | null): { paymentDeadlineDays: string; autoExpireUnpaid: boolean } {
  const terms = row?.kind === 'facility_management' ? (row.terms ?? {}) : {}
  const days = terms.paymentDeadlineDays
  return {
    paymentDeadlineDays: typeof days === 'number' ? String(days) : '',
    autoExpireUnpaid: terms.autoExpireUnpaid === true,
  }
}

function rateValues(row: ContractRow | null): Record<CoachTermField, string> {
  const terms = row?.kind === 'coach' ? (row.terms ?? {}) : {}
  return {
    baseMonthly: groszToZloty(terms.baseMonthly),
    unitRate: groszToZloty(terms.unitRate),
    matchRate: groszToZloty(terms.matchRate),
    travelRate: groszToZloty(terms.travelRate),
    sessionAmount: groszToZloty(terms.sessionAmount),
    tripAmount: groszToZloty(terms.tripAmount),
  }
}

export function ContractCreateForm() {
  const t = useT()
  const model = useSettlementModel()
  const [kind, setKind] = React.useState<string>('coach')
  const fields = React.useMemo<CrudField[]>(
    () => [
      {
        id: 'kind',
        label: t('club_core.contracts.fields.kind'),
        type: 'custom',
        required: true,
        component: ({ id, value, disabled, setValue, setFormValue }) => (
          <ContractKindSelect
            id={id}
            value={value}
            disabled={disabled}
            setValue={setValue}
            setFormValue={setFormValue}
            onKindChange={setKind}
            t={t}
          />
        ),
      },
      {
        id: 'partyType',
        label: t('club_core.contracts.fields.partyType'),
        type: 'select',
        options: enumOptions(CONTRACT_PARTY_TYPES, 'club_core.contracts.partyType', t),
        required: true,
        visibleWhen: { field: 'isCoach', equals: false },
      },
      {
        id: 'partyId',
        label: t('club_core.contracts.fields.party'),
        type: 'custom',
        required: true,
        description: t('club_core.contracts.fields.party.help'),
        component: ({ id, value, disabled, values, setValue }) => (
          <PartyPicker id={id} value={value} disabled={disabled} values={values} setValue={setValue} t={t} />
        ),
      },
      ...periodFields(t),
      ...(model.data ? rateFields(model.data, t) : []),
      ...rentalTermFields(t),
    ],
    [t, model.data],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'contract',
        title: t('club_core.contracts.groups.contract'),
        column: 1,
        fields: ['kind', 'partyType', 'partyId', 'validFrom', 'validTo'],
      },
      ...(model.data ? [ratesGroup(model.data, t)] : []),
      rentalTermsGroup(t),
    ],
    [t, model.data],
  )

  if (model.error) return <ErrorMessage label={errorMessage(model.error, t('club_core.contracts.errors.settings'))} />

  return (
    <CrudForm<ContractFormValues>
      title={t('club_core.contracts.create.title')}
      titleHeadingLevel={1}
      backHref={LIST_HREF}
      cancelHref={LIST_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      hiddenGroupIds={hiddenGroupsFor(kind)}
      isLoading={model.isLoading}
      loadingMessage={t('club_core.common.loading')}
      initialValues={{
        kind: 'coach',
        isCoach: true,
        partyType: 'person',
        partyId: '',
        validFrom: '',
        validTo: '',
        ...rateValues(null),
        ...rentalTermValues(null),
      }}
      submitLabel={t('club_core.common.create')}
      successRedirect={withFlash(LIST_HREF, t('club_core.contracts.flash.created'), 'success')}
      onSubmit={async (values) => {
        if (!model.data) return
        const terms = termsPayload(values, values.kind, model.data, t)
        await createCrud('club_core/contracts', {
          kind: values.kind,
          partyType: values.kind === 'coach' ? 'person' : values.partyType,
          partyId: textOrNull(values.partyId),
          ...periodPayload(values),
          ...(terms ? { terms } : {}),
        })
      }}
    />
  )
}

export function ContractEditForm({ id }: { id: string }) {
  const t = useT()
  const model = useSettlementModel()
  const query = useQuery({
    queryKey: ['club_core-contracts-record', id],
    queryFn: async () => {
      const data = await fetchCrudList<ContractRow>('club_core/contracts', { ids: id, pageSize: 1 })
      return data.items[0] ?? null
    },
  })
  const row = query.data ?? null
  const hasAttachment = row?.hasAttachment ?? false
  const refetch = query.refetch

  // The signed PDF (REQ-L12, #312) is uploaded at once; a change moves the version, so the record is read again and
  // the form starts from it (the form is keyed by `updatedAt`).
  const AttachmentField = React.useCallback(
    () => (
      <ContractAttachmentPanel
        contractId={id}
        hasAttachment={hasAttachment}
        onChanged={async () => {
          await refetch()
        }}
      />
    ),
    [id, hasAttachment, refetch],
  )

  const fields = React.useMemo<CrudField[]>(
    () => [
      { id: 'kindLabel', label: t('club_core.contracts.fields.kind'), type: 'text', disabled: true },
      {
        id: 'partyLabel',
        label: t('club_core.contracts.fields.party'),
        type: 'text',
        disabled: true,
        description: t('club_core.contracts.fields.party.fixed'),
      },
      ...periodFields(t),
      ...(model.data ? rateFields(model.data, t) : []),
      ...rentalTermFields(t),
      {
        id: 'attachment',
        label: t('club_core.contracts.fields.attachment'),
        type: 'custom',
        component: AttachmentField,
      },
    ],
    [t, model.data, AttachmentField],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'contract',
        title: t('club_core.contracts.groups.contract'),
        column: 1,
        fields: ['kindLabel', 'partyLabel', 'validFrom', 'validTo', 'attachment'],
      },
      ...(model.data ? [ratesGroup(model.data, t)] : []),
      rentalTermsGroup(t),
    ],
    [t, model.data],
  )

  if (query.isSuccess && !row) {
    return (
      <RecordNotFoundState
        label={t('club_core.contracts.errors.notFound')}
        backHref={LIST_HREF}
        backLabel={t('club_core.contracts.actions.back')}
      />
    )
  }
  if (query.error) return <ErrorMessage label={errorMessage(query.error, t('club_core.contracts.errors.load'))} />
  if (model.error) return <ErrorMessage label={errorMessage(model.error, t('club_core.contracts.errors.settings'))} />

  return (
    <CrudForm<ContractFormValues>
      key={row ? (row.updatedAt ?? row.id) : 'loading'}
      title={t('club_core.contracts.edit.title')}
      titleHeadingLevel={1}
      backHref={LIST_HREF}
      cancelHref={LIST_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      hiddenGroupIds={hiddenGroupsFor(row?.kind)}
      isLoading={query.isLoading || model.isLoading}
      loadingMessage={t('club_core.contracts.loading')}
      initialValues={{
        id,
        kindLabel: row?.kind ? t(`club_core.contracts.kind.${row.kind}`) : '',
        partyLabel: row?.partyName ?? t('club_core.contracts.deletedParty'),
        validFrom: row?.validFrom ?? '',
        validTo: row?.validTo ?? '',
        ...rateValues(row),
        ...rentalTermValues(row),
        updatedAt: row?.updatedAt ?? null,
      }}
      submitLabel={t('club_core.common.save')}
      successRedirect={withFlash(LIST_HREF, t('club_core.contracts.flash.saved'), 'success')}
      deleteRedirect={withFlash(LIST_HREF, t('club_core.contracts.flash.deleted'), 'success')}
      onSubmit={async (values) => {
        if (!model.data) return
        const terms = termsPayload(values, row?.kind, model.data, t)
        await updateCrud('club_core/contracts', { id, ...periodPayload(values), terms })
      }}
      onDelete={async () => {
        await deleteCrud('club_core/contracts', id)
      }}
    />
  )
}
